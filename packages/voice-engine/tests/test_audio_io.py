"""Tests for audio_io: format validation, normalisation, WAV writeback."""

from __future__ import annotations

from pathlib import Path

import pytest

from packages.voice_engine import audio_io  # noqa: F401  # TODO: adjust import path once packaged

FIXTURE_WAV = Path(__file__).parent / "fixtures" / "sample_16k.wav"


@pytest.mark.xfail(reason="scaffold only")
def test_validate_upload_rejects_unsupported_format() -> None:
    raise NotImplementedError


@pytest.mark.xfail(reason="scaffold only")
def test_load_and_normalise_returns_mono_16k() -> None:
    raise NotImplementedError


@pytest.mark.xfail(reason="scaffold only")
def test_to_wav_round_trip() -> None:
    raise NotImplementedError
