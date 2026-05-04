"""Audio I/O adapter layer for the DeepSynaps Audio / Voice Analyzer.

The ingestion module calls this file instead of binding business logic directly
to soundfile, librosa, pydub, or any future backend. The default implementation
uses ``soundfile`` when installed and falls back to Python's stdlib ``wave``
reader/writer for PCM WAV files. This keeps the core ingestion tests offline and
lightweight while preserving a single extension point for production codecs.
"""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import wave
from typing import BinaryIO

import numpy as np
from numpy.typing import NDArray


FloatWaveform = NDArray[np.float64]


class AudioIOError(RuntimeError):
    """Raised when an audio backend cannot read or write a sample."""


@dataclass(frozen=True)
class DecodedAudio:
    """Decoded audio waveform plus backend-level metadata."""

    waveform: FloatWaveform
    sample_rate_hz: int
    channels: int
    duration_seconds: float
    bit_depth: int | None
    backend: str
    subtype: str | None = None
    format_name: str | None = None


class AudioIOBackend:
    """Small typed interface for audio decoding and writing."""

    def read(self, source: Path | bytes | BinaryIO) -> DecodedAudio:
        """Decode an audio source into a float waveform in ``[-1.0, 1.0]``."""
        raise NotImplementedError

    def write_wav(
        self,
        path: Path,
        waveform: FloatWaveform,
        sample_rate_hz: int,
        *,
        bit_depth: int = 16,
    ) -> None:
        """Write a float waveform as a PCM WAV file."""
        raise NotImplementedError


class DefaultAudioIOBackend(AudioIOBackend):
    """Default adapter with optional ``soundfile`` and stdlib WAV fallback."""

    def read(self, source: Path | bytes | BinaryIO) -> DecodedAudio:
        soundfile_result = self._try_read_soundfile(source)
        if soundfile_result is not None:
            return soundfile_result
        return self._read_wave(source)

    def write_wav(
        self,
        path: Path,
        waveform: FloatWaveform,
        sample_rate_hz: int,
        *,
        bit_depth: int = 16,
    ) -> None:
        if bit_depth != 16:
            raise AudioIOError("stdlib WAV writer currently supports 16-bit PCM only")
        path.parent.mkdir(parents=True, exist_ok=True)
        array = _ensure_2d(np.asarray(waveform, dtype=np.float64))
        clipped = np.clip(array, -1.0, 1.0)
        pcm = (clipped * np.iinfo(np.int16).max).astype("<i2")
        with wave.open(str(path), "wb") as handle:
            handle.setnchannels(pcm.shape[1])
            handle.setsampwidth(2)
            handle.setframerate(sample_rate_hz)
            handle.writeframes(pcm.tobytes())

    def _try_read_soundfile(self, source: Path | bytes | BinaryIO) -> DecodedAudio | None:
        try:
            import soundfile as sf  # type: ignore[import-not-found]
        except ImportError:
            return None

        try:
            sf_source = _to_soundfile_source(source)
            data, sample_rate = sf.read(sf_source, dtype="float64", always_2d=True)
            info = sf.info(sf_source)
        except Exception as exc:  # pragma: no cover - depends on optional backend
            raise AudioIOError(f"soundfile failed to read audio: {exc}") from exc

        subtype = getattr(info, "subtype", None)
        bit_depth = _bit_depth_from_subtype(subtype)
        duration = float(len(data) / sample_rate) if sample_rate else 0.0
        return DecodedAudio(
            waveform=np.asarray(data, dtype=np.float64),
            sample_rate_hz=int(sample_rate),
            channels=int(data.shape[1]),
            duration_seconds=duration,
            bit_depth=bit_depth,
            backend="soundfile",
            subtype=subtype,
            format_name=getattr(info, "format", None),
        )

    def _read_wave(self, source: Path | bytes | BinaryIO) -> DecodedAudio:
        try:
            wave_source = _to_wave_source(source)
            with wave.open(wave_source, "rb") as handle:
                channels = handle.getnchannels()
                sample_rate = handle.getframerate()
                sample_width = handle.getsampwidth()
                frame_count = handle.getnframes()
                frames = handle.readframes(frame_count)
        except Exception as exc:
            raise AudioIOError(f"failed to read PCM WAV audio: {exc}") from exc

        if channels <= 0 or sample_rate <= 0:
            raise AudioIOError("invalid WAV metadata: channels and sample rate must be positive")

        waveform = _pcm_bytes_to_float(frames, sample_width, channels)
        duration = float(frame_count / sample_rate)
        return DecodedAudio(
            waveform=waveform,
            sample_rate_hz=int(sample_rate),
            channels=int(channels),
            duration_seconds=duration,
            bit_depth=sample_width * 8,
            backend="wave",
            subtype=f"PCM_{sample_width * 8}",
            format_name="WAV",
        )


def get_default_audio_backend() -> AudioIOBackend:
    """Return the default audio backend used by ingestion APIs."""

    return DefaultAudioIOBackend()


def _to_soundfile_source(source: Path | bytes | BinaryIO) -> str | BytesIO | BinaryIO:
    if isinstance(source, Path):
        return str(source)
    if isinstance(source, bytes):
        return BytesIO(source)
    if hasattr(source, "seek"):
        source.seek(0)
    return source


def _to_wave_source(source: Path | bytes | BinaryIO) -> str | BytesIO | BinaryIO:
    if isinstance(source, Path):
        return str(source)
    if isinstance(source, bytes):
        return BytesIO(source)
    if hasattr(source, "seek"):
        source.seek(0)
    return source


def _ensure_2d(waveform: NDArray[np.floating]) -> FloatWaveform:
    data = np.asarray(waveform, dtype=np.float64)
    if data.ndim == 1:
        return data[:, None]
    if data.ndim == 2:
        return data
    raise AudioIOError("waveform must be one- or two-dimensional")


def _pcm_bytes_to_float(frames: bytes, sample_width: int, channels: int) -> FloatWaveform:
    if sample_width == 1:
        raw = np.frombuffer(frames, dtype=np.uint8).astype(np.float64)
        data = (raw - 128.0) / 128.0
    elif sample_width == 2:
        raw = np.frombuffer(frames, dtype="<i2").astype(np.float64)
        data = raw / float(np.iinfo(np.int16).max)
    elif sample_width == 3:
        data = _decode_pcm24(frames)
    elif sample_width == 4:
        raw = np.frombuffer(frames, dtype="<i4").astype(np.float64)
        data = raw / float(np.iinfo(np.int32).max)
    else:
        raise AudioIOError(f"unsupported PCM sample width: {sample_width} bytes")

    if data.size % channels != 0:
        raise AudioIOError("PCM frame data is not divisible by channel count")
    return data.reshape(-1, channels)


def _decode_pcm24(frames: bytes) -> FloatWaveform:
    raw = np.frombuffer(frames, dtype=np.uint8)
    if raw.size % 3 != 0:
        raise AudioIOError("invalid 24-bit PCM frame length")
    triplets = raw.reshape(-1, 3).astype(np.uint32)
    values = triplets[:, 0] | (triplets[:, 1] << 8) | (triplets[:, 2] << 16)
    sign_bit = 1 << 23
    signed = values.astype(np.int32)
    signed = np.where(values & sign_bit, signed - (1 << 24), signed)
    return signed.astype(np.float64) / float((1 << 23) - 1)


def _bit_depth_from_subtype(subtype: str | None) -> int | None:
    if not subtype:
        return None
    for token, depth in (
        ("PCM_16", 16),
        ("PCM_24", 24),
        ("PCM_32", 32),
        ("PCM_U8", 8),
        ("FLOAT", 32),
        ("DOUBLE", 64),
    ):
        if token in subtype:
            return depth
    return None
