"""Tests for biomarker extraction (F0, jitter, shimmer, HNR, MFCCs)."""

from __future__ import annotations

from pathlib import Path

import pytest

from packages.voice_engine import biomarkers  # noqa: F401  # TODO: adjust import path once packaged

FIXTURE_WAV = Path(__file__).parent / "fixtures" / "sample_16k.wav"


@pytest.mark.xfail(reason="scaffold only")
def test_extract_returns_finite_f0() -> None:
    raise NotImplementedError


@pytest.mark.xfail(reason="scaffold only")
def test_extract_jitter_shimmer_in_unit_range() -> None:
    raise NotImplementedError
