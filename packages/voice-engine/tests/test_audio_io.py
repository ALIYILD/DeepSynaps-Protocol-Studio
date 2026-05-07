"""Tests for audio_io: format validation, normalisation, WAV writeback."""

from __future__ import annotations

from pathlib import Path

import pytest

# audio_io intentionally not imported at module level — scaffold module imports
# librosa eagerly and isn't installed in CI. Re-enable the import alongside the
# real implementation in the audio_io prompt.

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
