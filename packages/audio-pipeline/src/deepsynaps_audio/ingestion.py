"""Audio ingestion and quality checks for DeepSynaps voice assessments.

This module is the public entrypoint for the Audio / Voice Analyzer ingestion
layer. It accepts raw audio from smartphone, browser, telehealth, or clinic
recordings; stores an immutable local analysis asset when requested; extracts
basic metadata; computes first-pass quality metrics; and creates timestamped
segments for downstream acoustic, neurological, cognitive, respiratory, and
neuromodulation analyzers.

The implementation deliberately keeps audio decoding behind
``deepsynaps_audio.backends.audio_io``. Future Praat, librosa, torchaudio, or
cloud storage backends should be added there rather than being called directly
from analyzer business logic.
"""

from __future__ import annotations

import io
import hashlib
import logging
import math
import shutil
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO, Literal
from uuid import uuid4

import numpy as np

from deepsynaps_audio.backends.audio_io import DecodedAudio, get_default_audio_backend
from deepsynaps_audio.schemas import (
    AudioMetadata,
    AudioQualityResult,
    QualityWarning,
    QualityConfig,
    VoiceAsset,
    VoiceSegment,
)

logger = logging.getLogger(__name__)
_AUDIO_BACKEND = get_default_audio_backend()

UseCase = Literal["neurology", "neuromodulation", "respiratory", "cognitive"]
AudioSource = Path | bytes | BinaryIO
AssetOrPath = VoiceAsset | Path | str | bytes | BinaryIO


def import_voice_sample(
    source: AudioSource,
    *,
    patient_ref: str | None,
    session_ref: str | None,
    task_ref: str | None,
    use_case: UseCase,
    source_filename: str | None = None,
    storage_dir: Path | None = None,
    consent_ref: str | None = None,
) -> VoiceAsset:
    """Import a patient voice sample and return an immutable asset record.

    Parameters
    ----------
    source:
        Local path, bytes, or binary file-like object containing the audio.
    patient_ref, session_ref, task_ref:
        Optional de-identified references that connect the asset to the
        DeepSynaps patient timeline and task battery.
    use_case:
        Audio-specific clinical workflow label. This does not imply diagnosis
        or treatment selection.
    source_filename:
        Optional original filename. Only the basename is retained.
    storage_dir:
        Optional directory where the imported asset should be copied/written.
        If omitted, path sources are referenced in place and byte/blob sources
        receive an in-memory asset record without a storage URI.
    consent_ref:
        Optional consent record reference.

    Returns
    -------
    VoiceAsset
        Typed asset with hash, metadata, provenance, and safe storage
        reference. Raw audio content is not logged.
    """

    read_result = _AUDIO_BACKEND.read(source)
    asset_id = str(uuid4())
    created_at = datetime.now(UTC)
    safe_filename = Path(source_filename).name if source_filename else _infer_source_name(source)
    suffix = _safe_suffix(safe_filename)
    storage_uri: str | None = None

    if storage_dir is not None:
        storage_dir.mkdir(parents=True, exist_ok=True)
        stored_path = storage_dir / f"{asset_id}{suffix}"
        _persist_source(source, read_result, stored_path)
        storage_uri = str(stored_path)
    elif isinstance(source, Path):
        storage_uri = str(source)

    metadata = _metadata_from_read_result(read_result, storage_uri=storage_uri)
    logger.info(
        "voice_sample_imported",
        extra={
            "asset_id": asset_id,
            "use_case": use_case,
            "session_ref": session_ref,
            "task_ref": task_ref,
            "sample_rate_hz": metadata.sample_rate_hz,
            "duration_sec": round(metadata.duration_sec, 3),
        },
    )

    return VoiceAsset(
        asset_id=asset_id,
        patient_ref=patient_ref,
        session_ref=session_ref,
        task_ref=task_ref,
        use_case=use_case,
        source_filename=safe_filename,
        storage_path=Path(storage_uri) if storage_uri is not None else None,
        source_uri=storage_uri,
        sha256=_hash_source(source),
        metadata=metadata,
        consent_ref=consent_ref,
        created_at=created_at,
    )


def extract_audio_metadata(asset_or_path: AssetOrPath) -> AudioMetadata:
    """Extract duration, sample-rate, channel, bit-depth, and format metadata.

    ``VoiceAsset`` inputs return their embedded metadata. Path, bytes, and
    binary inputs are decoded through the audio I/O adapter.
    """

    if isinstance(asset_or_path, VoiceAsset):
        return asset_or_path.metadata
    source = _source_from_asset_or_path(asset_or_path)
    return _metadata_from_read_result(_AUDIO_BACKEND.read(source), storage_uri=_storage_uri(source))


def check_audio_quality(
    asset_or_path: AssetOrPath,
    *,
    config: QualityConfig | None = None,
) -> AudioQualityResult:
    """Compute first-pass QC metrics for a voice recording.

    The QC layer is intentionally conservative. It produces metrics and
    warnings that downstream analyzers can attach to feature outputs; it does
    not reject patients or make clinical determinations.
    """

    cfg = config or QualityConfig()
    read_result = _read_asset_or_path(asset_or_path)
    waveform = _as_2d(read_result.waveform)
    mono = _to_mono(waveform)
    duration_sec = len(mono) / float(read_result.sample_rate_hz) if read_result.sample_rate_hz else 0.0

    clipping_proportion = _clipping_proportion(waveform, cfg.clipping_threshold)
    rms = _frame_rms(mono, read_result.sample_rate_hz, cfg.frame_duration_sec)
    silence_threshold = _resolve_silence_threshold(mono, cfg)
    silence_proportion = float(np.mean(rms <= silence_threshold)) if rms.size else 1.0
    estimated_snr_db, noise_floor_rms, signal_rms = _estimate_snr_db(mono, rms)
    loudness_range_db = _loudness_range_db(rms)
    background_noise_rms = noise_floor_rms
    channel_mismatch = _detect_channel_mismatch(waveform, cfg.channel_mismatch_threshold)

    warnings: list[str] = []
    if duration_sec < cfg.min_duration_sec:
        warnings.append("too_short")
    if clipping_proportion > cfg.max_clipping_proportion_warn:
        warnings.append("high_clipping")
    if silence_proportion > cfg.max_silence_proportion_warn:
        warnings.append("mostly_silent")
    min_snr_db = cfg.min_snr_db if cfg.min_snr_db is not None else cfg.min_snr_db_warn
    if estimated_snr_db < min_snr_db:
        warnings.append("low_snr")
    if loudness_range_db < cfg.min_loudness_range_db_warn and not math.isinf(loudness_range_db):
        warnings.append("low_loudness_range")
    if channel_mismatch:
        warnings.append("channel_mismatch")

    status: Literal["pass", "warn", "fail"]
    if (
        duration_sec < cfg.min_duration_sec
        or clipping_proportion > cfg.max_clipping_proportion_fail
        or silence_proportion > cfg.max_silence_proportion_fail
        or estimated_snr_db < cfg.min_snr_db_fail
    ):
        status = "fail"
    elif warnings:
        status = "warn"
    else:
        status = "pass"

    metadata = _metadata_from_read_result(read_result, storage_uri=_storage_uri(_source_from_asset_or_path(asset_or_path)))

    return AudioQualityResult(
        status=status,
        estimated_snr_db=estimated_snr_db,
        clipping_proportion=clipping_proportion,
        silence_proportion=silence_proportion,
        loudness_range_db=loudness_range_db,
        background_noise_rms=background_noise_rms,
        channel_mismatch=channel_mismatch,
        duration_sec=duration_sec,
        sample_rate_hz=read_result.sample_rate_hz,
        warnings=tuple(_quality_warning(code) for code in warnings),
        metadata=metadata,
    )


def segment_voice_tasks(
    asset_or_path: AssetOrPath,
    task_timestamps: Mapping[str, tuple[float, float]] | None = None,
) -> dict[str, VoiceSegment]:
    """Create analysis segments for task-level downstream analyzers.

    Parameters
    ----------
    asset_or_path:
        Imported asset or raw audio source.
    task_timestamps:
        Optional mapping from task ID to ``(start_sec, end_sec)``. If omitted,
        the full file is returned as a single ``full_recording`` segment.

    Returns
    -------
    dict[str, VoiceSegment]
        Segment records with waveform arrays and metadata. These segments are
        the handoff objects for acoustic features, speech-linguistic features,
        neurological scorecards, and respiratory/cognitive phase-2 analyzers.
    """

    read_result = _read_asset_or_path(asset_or_path)
    waveform = _as_2d(read_result.waveform)
    duration_sec = waveform.shape[0] / float(read_result.sample_rate_hz)
    timestamps = task_timestamps or {"full_recording": (0.0, duration_sec)}
    segments: dict[str, VoiceSegment] = {}

    for task_ref, (start_sec, end_sec) in timestamps.items():
        if start_sec < 0 or end_sec <= start_sec:
            raise ValueError(f"Invalid segment timestamps for {task_ref!r}: {(start_sec, end_sec)!r}")
        if end_sec > duration_sec + 1e-9:
            raise ValueError(
                f"Segment {task_ref!r} ends at {end_sec:.3f}s but audio is {duration_sec:.3f}s"
            )
        start_sample = int(round(start_sec * read_result.sample_rate_hz))
        end_sample = int(round(end_sec * read_result.sample_rate_hz))
        segment_waveform = waveform[start_sample:end_sample].copy()
        segment_duration = len(segment_waveform) / float(read_result.sample_rate_hz)
        segments[task_ref] = VoiceSegment(
            segment_id=str(uuid4()),
            task_ref=task_ref,
            start_sec=float(start_sec),
            end_sec=float(end_sec),
            duration_sec=segment_duration,
            sample_rate_hz=read_result.sample_rate_hz,
            samples=segment_waveform,
            metadata=AudioMetadata(
                duration_sec=segment_duration,
                sample_rate_hz=read_result.sample_rate_hz,
                channels=read_result.channels,
                bit_depth=read_result.bit_depth,
                frame_count=segment_waveform.shape[0],
                format=read_result.format_name,
                subtype=read_result.subtype,
                backend=read_result.backend,
            ),
        )

    return segments


def _read_asset_or_path(asset_or_path: AssetOrPath) -> DecodedAudio:
    source = _source_from_asset_or_path(asset_or_path)
    return _AUDIO_BACKEND.read(source)


def _source_from_asset_or_path(asset_or_path: AssetOrPath) -> AudioSource:
    if isinstance(asset_or_path, VoiceAsset):
        if asset_or_path.storage_uri is None:
            raise ValueError("VoiceAsset does not have a storage_uri; pass original bytes/path instead")
        return Path(asset_or_path.storage_uri)
    if isinstance(asset_or_path, str):
        return Path(asset_or_path)
    return asset_or_path


def _storage_uri(source: AudioSource) -> str | None:
    return str(source) if isinstance(source, Path) else None


def _metadata_from_read_result(result: DecodedAudio, *, storage_uri: str | None) -> AudioMetadata:
    return AudioMetadata(
        duration_sec=result.duration_seconds,
        sample_rate_hz=result.sample_rate_hz,
        channels=result.channels,
        bit_depth=result.bit_depth,
        format=result.format_name,
        subtype=result.subtype,
        frame_count=int(round(result.duration_seconds * result.sample_rate_hz)),
        backend=result.backend,
        storage_uri=storage_uri,
    )


def _persist_source(source: AudioSource, read_result: DecodedAudio, stored_path: Path) -> None:
    if isinstance(source, Path):
        shutil.copyfile(source, stored_path)
        return
    if isinstance(source, bytes):
        stored_path.write_bytes(source)
        return
    try:
        position = source.tell()
    except (AttributeError, OSError):
        position = None
    try:
        source.seek(0)
        stored_path.write_bytes(source.read())
    except (AttributeError, OSError):
        _AUDIO_BACKEND.write_wav(stored_path, read_result.waveform, read_result.sample_rate_hz)
    finally:
        if position is not None:
            try:
                source.seek(position)
            except OSError:
                pass


def _infer_source_name(source: AudioSource) -> str | None:
    if isinstance(source, Path):
        return source.name
    name = getattr(source, "name", None)
    if isinstance(name, str):
        return Path(name).name
    return None


def _safe_suffix(filename: str | None) -> str:
    suffix = Path(filename).suffix.lower() if filename else ".wav"
    return suffix if suffix else ".wav"


def _hash_source(source: AudioSource) -> str:
    """Hash raw audio bytes without logging or storing PHI-bearing content."""

    digest = hashlib.sha256()
    if isinstance(source, Path):
        with source.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    if isinstance(source, bytes):
        return hashlib.sha256(source).hexdigest()

    position: int | None
    try:
        position = source.tell()
    except (AttributeError, OSError):
        position = None
    try:
        source.seek(0)
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    finally:
        if position is not None:
            try:
                source.seek(position)
            except OSError:
                pass
    return digest.hexdigest()


def _quality_warning(code: str) -> QualityWarning:
    messages: dict[str, tuple[str, Literal["warn", "fail"]]] = {
        "too_short": ("Recording is shorter than the configured minimum duration.", "fail"),
        "high_clipping": ("A high proportion of samples are clipped or near full scale.", "fail"),
        "mostly_silent": ("Recording contains too much silence for reliable analysis.", "fail"),
        "low_snr": ("Estimated signal-to-noise ratio is below the configured threshold.", "warn"),
        "low_loudness_range": ("Loudness range is low; verify task performance and microphone level.", "warn"),
        "channel_mismatch": ("Multi-channel input has mismatched channel energy.", "warn"),
    }
    message, severity = messages.get(code, ("Audio quality warning.", "warn"))
    return QualityWarning(code=code, message=message, severity=severity)


def _as_2d(waveform: np.ndarray) -> np.ndarray:
    arr = np.asarray(waveform, dtype=np.float32)
    if arr.ndim == 1:
        return arr[:, np.newaxis]
    if arr.ndim != 2:
        raise ValueError(f"Expected mono or multi-channel audio, got shape {arr.shape}")
    return arr


def _to_mono(waveform: np.ndarray) -> np.ndarray:
    arr = _as_2d(waveform)
    return np.mean(arr, axis=1)


def _clipping_proportion(waveform: np.ndarray, threshold: float) -> float:
    if waveform.size == 0:
        return 0.0
    return float(np.mean(np.abs(waveform) >= threshold))


def _frame_rms(waveform: np.ndarray, sample_rate_hz: int, frame_duration_ms: float) -> np.ndarray:
    if waveform.size == 0 or sample_rate_hz <= 0:
        return np.array([], dtype=np.float32)
    frame_length = max(1, int(round(sample_rate_hz * frame_duration_ms / 1000.0)))
    frame_count = int(math.ceil(len(waveform) / frame_length))
    rms = np.empty(frame_count, dtype=np.float32)
    for idx in range(frame_count):
        frame = waveform[idx * frame_length : (idx + 1) * frame_length]
        rms[idx] = float(np.sqrt(np.mean(np.square(frame)))) if frame.size else 0.0
    return rms


def _resolve_silence_threshold(waveform: np.ndarray, config: QualityConfig) -> float:
    if config.silence_rms_threshold is not None:
        return config.silence_rms_threshold
    peak = float(np.max(np.abs(waveform))) if waveform.size else 0.0
    if peak <= 0:
        return 1e-6
    return max(1e-4, peak * config.relative_silence_threshold)


def _estimate_snr_db(waveform: np.ndarray, rms: np.ndarray) -> tuple[float, float, float]:
    active = rms[rms > 0]
    if active.size == 0:
        return 0.0, 0.0, 0.0
    signal = float(np.sqrt(np.mean(np.square(waveform)))) if waveform.size else 0.0
    noise_floor = float(np.std(np.diff(waveform))) if waveform.size > 1 else 0.0
    if noise_floor <= 1e-12:
        return 80.0, noise_floor, signal
    snr = 20.0 * math.log10(max(signal, 1e-12) / noise_floor)
    return float(max(0.0, min(80.0, snr))), noise_floor, signal


def _loudness_range_db(rms: np.ndarray) -> float:
    active = rms[rms > 1e-9]
    if active.size == 0:
        return 0.0
    low = float(np.percentile(active, 10))
    high = float(np.percentile(active, 95))
    if low <= 1e-12:
        return 80.0
    return float(max(0.0, min(80.0, 20.0 * math.log10(high / low))))


def _background_noise_score(estimated_snr_db: float, silence_proportion: float) -> float:
    snr_component = 1.0 - min(max(estimated_snr_db, 0.0), 40.0) / 40.0
    silence_component = min(max(silence_proportion, 0.0), 1.0) * 0.25
    return float(min(1.0, max(0.0, snr_component + silence_component)))


def _detect_channel_mismatch(waveform: np.ndarray, threshold: float) -> bool:
    arr = _as_2d(waveform)
    if arr.shape[1] <= 1:
        return False
    channel_rms = np.sqrt(np.mean(np.square(arr), axis=0))
    max_rms = float(np.max(channel_rms))
    min_rms = float(np.min(channel_rms))
    if max_rms <= 1e-9:
        return False
    return (min_rms / max_rms) < threshold


def _binaryio_from_bytes(data: bytes) -> io.BytesIO:
    return io.BytesIO(data)
