from __future__ import annotations

from io import BytesIO
from pathlib import Path
import wave

import numpy as np
import pytest

from deepsynaps_audio.ingestion import (
    check_audio_quality,
    extract_audio_metadata,
    import_voice_sample,
    segment_voice_tasks,
)
from deepsynaps_audio.schemas import AudioMetadata, QualityConfig, UseCase, VoiceAsset


def _wav_bytes(
    samples: np.ndarray,
    *,
    sample_rate: int = 16_000,
    sample_width: int = 2,
) -> bytes:
    array = np.asarray(samples, dtype=np.float32)
    if array.ndim == 1:
        channels = 1
        frames = array[:, None]
    else:
        channels = array.shape[1]
        frames = array

    clipped = np.clip(frames, -1.0, 1.0)
    if sample_width == 2:
        pcm = (clipped * 32767.0).astype("<i2").tobytes()
    elif sample_width == 1:
        pcm = ((clipped + 1.0) * 127.5).astype("u1").tobytes()
    else:
        raise ValueError("test helper supports 8-bit and 16-bit PCM")

    buffer = BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(sample_width)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm)
    return buffer.getvalue()


def _sine(
    *,
    freq: float = 220.0,
    duration: float = 1.0,
    sample_rate: int = 16_000,
    amplitude: float = 0.4,
    channels: int = 1,
) -> np.ndarray:
    t = np.arange(int(duration * sample_rate), dtype=np.float64) / sample_rate
    mono = (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    if channels == 1:
        return mono
    return np.column_stack([mono for _ in range(channels)]).astype(np.float32)


def _write_wav(path: Path, samples: np.ndarray, *, sample_rate: int = 16_000) -> Path:
    path.write_bytes(_wav_bytes(samples, sample_rate=sample_rate))
    return path


def test_import_voice_sample_from_bytes_persists_asset(tmp_path: Path) -> None:
    audio = _wav_bytes(_sine(duration=0.5), sample_rate=16_000)

    asset = import_voice_sample(
        audio,
        patient_ref="patient-1",
        session_ref="session-1",
        task_ref="sustained_vowel_a",
        use_case="neurology",
        source_filename="voice.wav",
        storage_dir=tmp_path,
        consent_ref="consent-1",
    )

    assert asset.patient_ref == "patient-1"
    assert asset.use_case == "neurology"
    assert asset.storage_path is not None
    assert asset.storage_path.exists()
    assert asset.metadata.sample_rate_hz == 16_000
    assert asset.metadata.channels == 1
    assert asset.metadata.bit_depth == 16
    assert asset.sha256


def test_extract_audio_metadata_from_path(tmp_path: Path) -> None:
    path = _write_wav(tmp_path / "sample.wav", _sine(duration=1.25, channels=2))

    metadata = extract_audio_metadata(path)

    assert isinstance(metadata, AudioMetadata)
    assert metadata.duration_sec == pytest.approx(1.25)
    assert metadata.sample_rate_hz == 16_000
    assert metadata.channels == 2
    assert metadata.bit_depth == 16
    assert metadata.frame_count == 20_000
    assert metadata.backend == "wave"


def test_quality_detects_clean_sine_as_pass(tmp_path: Path) -> None:
    path = _write_wav(tmp_path / "clean.wav", _sine(duration=1.0, amplitude=0.5))

    quality = check_audio_quality(path)

    assert quality.status == "pass"
    assert quality.snr_db is not None
    assert quality.snr_db > 20.0
    assert quality.clipping_proportion < 0.001
    assert quality.silence_proportion < 0.05
    assert not quality.channel_mismatch_detected


def test_quality_detects_clipped_signal(tmp_path: Path) -> None:
    samples = np.ones(16_000, dtype=np.float32)
    path = _write_wav(tmp_path / "clipped.wav", samples)

    quality = check_audio_quality(path)

    assert quality.status in {"warn", "fail"}
    assert quality.clipping_proportion > 0.9
    assert any(w.code == "high_clipping" for w in quality.warnings)


def test_quality_detects_silence(tmp_path: Path) -> None:
    path = _write_wav(tmp_path / "silence.wav", np.zeros(16_000, dtype=np.float32))

    quality = check_audio_quality(path)

    assert quality.status == "fail"
    assert quality.silence_proportion == pytest.approx(1.0)
    assert any(w.code == "mostly_silent" for w in quality.warnings)


def test_quality_detects_noisy_audio(tmp_path: Path) -> None:
    rng = np.random.default_rng(17)
    clean = _sine(duration=1.0, amplitude=0.05)
    noisy = clean + rng.normal(0.0, 0.2, size=clean.shape).astype(np.float32)
    path = _write_wav(tmp_path / "noisy.wav", noisy)

    quality = check_audio_quality(
        path,
        config=QualityConfig(min_snr_db=12.0),
    )

    assert quality.snr_db is not None
    assert quality.snr_db < 12.0
    assert any(w.code == "low_snr" for w in quality.warnings)


def test_quality_detects_channel_mismatch(tmp_path: Path) -> None:
    left = _sine(duration=1.0, amplitude=0.4)
    right = np.zeros_like(left)
    path = _write_wav(tmp_path / "mismatch.wav", np.column_stack([left, right]))

    quality = check_audio_quality(path)

    assert quality.channel_mismatch_detected
    assert any(w.code == "channel_mismatch" for w in quality.warnings)


def test_segment_voice_tasks_with_explicit_timestamps(tmp_path: Path) -> None:
    path = _write_wav(tmp_path / "long.wav", _sine(duration=2.0))

    segments = segment_voice_tasks(
        path,
        task_timestamps={
            "vowel": (0.0, 0.5),
            "counting": (0.75, 1.25),
        },
    )

    assert set(segments) == {"vowel", "counting"}
    assert segments["vowel"].duration_sec == pytest.approx(0.5)
    assert segments["counting"].start_sec == pytest.approx(0.75)
    assert segments["counting"].sample_rate_hz == 16_000
    assert segments["counting"].samples.shape[0] == 8_000


def test_segment_voice_tasks_defaults_to_full_recording(tmp_path: Path) -> None:
    path = _write_wav(tmp_path / "full.wav", _sine(duration=0.4))

    segments = segment_voice_tasks(path)

    assert list(segments) == ["full_recording"]
    assert segments["full_recording"].duration_sec == pytest.approx(0.4)


def test_segment_voice_tasks_rejects_invalid_timestamps(tmp_path: Path) -> None:
    path = _write_wav(tmp_path / "short.wav", _sine(duration=1.0))

    with pytest.raises(ValueError, match="Invalid segment"):
        segment_voice_tasks(path, {"bad": (0.8, 0.2)})


def test_extract_metadata_accepts_voice_asset(tmp_path: Path) -> None:
    path = _write_wav(tmp_path / "asset.wav", _sine(duration=0.5))
    metadata = extract_audio_metadata(path)
    asset = VoiceAsset(
        asset_id="asset-test",
        sha256="abc",
        source_kind="path",
        use_case=UseCase.NEUROLOGY,
        metadata=metadata,
        storage_path=path,
    )

    assert extract_audio_metadata(asset) == metadata
