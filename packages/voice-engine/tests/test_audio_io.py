"""Tests for audio_io: validation, normalisation, S3 upload via monkeypatched seams."""

from __future__ import annotations

import io
from typing import Any

import pytest

from fastapi import HTTPException

import audio_io
from audio_io import AudioMeta


# ---------------------------------------------------------------------------
# Fake UploadFile helper
# ---------------------------------------------------------------------------


class _FakeUploadFile:
    """Minimal stand-in for fastapi.UploadFile (no real fastapi dependency needed)."""

    def __init__(
        self,
        filename: str,
        data: bytes = b"fake audio data",
        content_type: str | None = "audio/wav",
    ) -> None:
        self.filename = filename
        self.content_type = content_type
        self.file: io.BytesIO = io.BytesIO(data)


# ---------------------------------------------------------------------------
# Fake pydub segment
# ---------------------------------------------------------------------------


class _FakeSegment:
    """Minimal pydub.AudioSegment stand-in."""

    def __init__(self, duration_seconds: float = 2.5) -> None:
        self.frame_rate = 16_000
        self.channels = 1
        self.duration_seconds = duration_seconds
        self._export_bytes = b"RIFF....fake wav bytes"

    def set_frame_rate(self, rate: int) -> "_FakeSegment":
        self.frame_rate = rate
        return self

    def set_channels(self, channels: int) -> "_FakeSegment":
        self.channels = channels
        return self

    def export(self, buf: Any, format: str = "wav") -> None:
        buf.write(self._export_bytes)


# ---------------------------------------------------------------------------
# S3 recorder (no-op)
# ---------------------------------------------------------------------------


class _S3Recorder:
    """Records put_object calls without touching AWS."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def put_object(self, **kwargs: Any) -> None:
        self.calls.append(kwargs)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_preprocess_upload_generates_audio_meta(monkeypatch: pytest.MonkeyPatch) -> None:
    """Happy path: valid WAV file returns a fully-populated AudioMeta."""
    fake_segment = _FakeSegment(duration_seconds=2.5)
    recorder = _S3Recorder()

    monkeypatch.setattr(audio_io, "_load_audio_segment", lambda data, ext: fake_segment)
    monkeypatch.setattr(audio_io, "_get_s3_client", lambda: recorder)
    monkeypatch.setattr(
        audio_io,
        "_upload_bytes_to_s3",
        lambda bucket, key, data, ct: None,
    )

    fake_file = _FakeUploadFile("sample.wav", data=b"fake", content_type="audio/wav")
    result = audio_io.preprocess_upload(fake_file, patient_id="pt-x")

    assert isinstance(result, AudioMeta)
    assert result.patient_id == "pt-x"
    assert result.session_id  # non-empty
    assert result.duration_sec > 0
    assert result.original_s3_key
    assert result.processed_s3_key


def test_rejects_unsupported_extension(monkeypatch: pytest.MonkeyPatch) -> None:
    """Files with unsupported extensions must raise HTTPException(400)."""
    fake_file = _FakeUploadFile("malware.exe", data=b"x")

    with pytest.raises(HTTPException) as exc_info:
        audio_io.preprocess_upload(fake_file, patient_id="pt-x")

    assert exc_info.value.status_code == 400


def test_rejects_oversize_file(monkeypatch: pytest.MonkeyPatch) -> None:
    """Files over 100 MB must raise HTTPException(413)."""
    # Monkeypatch _measure_upload_size to simulate a file just over the limit
    monkeypatch.setattr(
        audio_io,
        "_measure_upload_size",
        lambda upload_file, max_bytes=audio_io.MAX_FILE_BYTES: (_ for _ in ()).throw(
            HTTPException(
                status_code=413,
                detail="File exceeds maximum size of 100 MB",
            )
        ),
    )

    fake_file = _FakeUploadFile("big.wav", data=b"x")

    with pytest.raises(HTTPException) as exc_info:
        audio_io.preprocess_upload(fake_file, patient_id="pt-x")

    assert exc_info.value.status_code == 413


def test_rejects_excessive_duration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Audio longer than 30 minutes must raise HTTPException(400) mentioning duration."""
    long_segment = _FakeSegment(duration_seconds=2000.0)  # ~33 minutes

    monkeypatch.setattr(audio_io, "_load_audio_segment", lambda data, ext: long_segment)
    monkeypatch.setattr(
        audio_io,
        "_upload_bytes_to_s3",
        lambda bucket, key, data, ct: None,
    )

    fake_file = _FakeUploadFile("long.wav", data=b"fake")

    with pytest.raises(HTTPException) as exc_info:
        audio_io.preprocess_upload(fake_file, patient_id="pt-x")

    assert exc_info.value.status_code == 400
    detail = exc_info.value.detail.lower()
    assert "30 minute" in detail or "duration" in detail


def test_generates_expected_s3_keys_format(monkeypatch: pytest.MonkeyPatch) -> None:
    """original_s3_key and processed_s3_key must match the expected path format."""
    fake_segment = _FakeSegment(duration_seconds=5.0)

    monkeypatch.setattr(audio_io, "_load_audio_segment", lambda data, ext: fake_segment)
    monkeypatch.setattr(
        audio_io,
        "_upload_bytes_to_s3",
        lambda bucket, key, data, ct: None,
    )

    fake_file = _FakeUploadFile("recording.wav", data=b"fake", content_type="audio/wav")
    result = audio_io.preprocess_upload(
        fake_file,
        patient_id="pt-42",
        session_id="sess-abc",
    )

    assert result.original_s3_key == "voice/pt-42/sess-abc/original.wav"
    assert result.processed_s3_key == "voice/pt-42/sess-abc/processed.wav"
