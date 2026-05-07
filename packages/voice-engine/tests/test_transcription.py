"""Tests for Whisper transcription — monkeypatched; no real model weights loaded."""

from __future__ import annotations

import transcription as tr


_STUB_RESULT = {
    "text": "hello world",
    "language": "en",
    "segments": [
        {"start": 0.0, "end": 1.0, "text": "hello world", "avg_logprob": -0.3}
    ],
}


class _FakeModel:
    def transcribe(self, path: str, **kwargs):  # noqa: ANN001
        return _STUB_RESULT


def test_transcribe_audio_returns_result_for_fixture(monkeypatch, tmp_path):
    """Monkeypatched loader; uses real fixture WAV path but never loads Whisper."""
    import os
    from pathlib import Path

    fixture = Path(__file__).parent / "fixtures" / "sample_16k.wav"

    monkeypatch.setenv("WHISPER_MODEL", "base")
    monkeypatch.setattr(tr, "_load_whisper_model_impl", lambda name, device: _FakeModel())
    # Clear cache so our patched loader is called
    tr._MODEL_CACHE.clear()

    result = tr.transcribe_audio(str(fixture))

    assert isinstance(result, tr.TranscriptResult)
    assert result.model_name  # truthy
    assert isinstance(result.segments, list)
    assert isinstance(result.diarization_used, bool)


def test_transcribe_audio_missing_file_raises():
    """Nonexistent path must raise FileNotFoundError."""
    import pytest

    with pytest.raises(FileNotFoundError):
        tr.transcribe_audio("/nonexistent/path/does_not_exist.wav")


def test_get_audio_duration_reads_wav_header():
    """`_get_audio_duration` reads the WAV header so silent fixtures still expose a duration."""
    from pathlib import Path

    fixture = Path(__file__).parent / "fixtures" / "sample_16k.wav"
    duration = tr._get_audio_duration(str(fixture))

    assert duration == 1.0


def test_model_singleton_cache_returns_same_instance(monkeypatch):
    """Loader called exactly once; both calls return the same object."""
    call_count = {"n": 0}
    sentinel = object()

    def _fake_loader(name, device):
        call_count["n"] += 1
        return sentinel

    monkeypatch.setattr(tr, "_load_whisper_model_impl", _fake_loader)
    tr._MODEL_CACHE.clear()

    first = tr.get_whisper_model()
    second = tr.get_whisper_model()

    assert first is second
    assert call_count["n"] == 1
