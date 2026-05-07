"""Tests for acoustic biomarker extraction — monkeypatched; no real Parselmouth or librosa required."""

from __future__ import annotations

import dataclasses
from pathlib import Path

import biomarkers as bm

FIXTURE_WAV = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")

# ---------------------------------------------------------------------------
# Test 1 — shape check
# ---------------------------------------------------------------------------


def test_extract_biomarkers_returns_expected_shape(monkeypatch):
    """Monkeypatched heavy helpers; result shape matches the BiomarkerResult spec."""

    # _get_audio_duration → 1.0 s (stdlib wave path, real read from fixture)
    # We leave it real so duration_sec comes from the actual WAV header.

    monkeypatch.setattr(bm, "_load_sound", lambda path: object())

    monkeypatch.setattr(
        bm,
        "_safe_pitch_metrics",
        lambda sound: {
            "f0_mean_hz": 150.0,
            "f0_std_hz": 20.0,
            "f0_min_hz": 100.0,
            "f0_max_hz": 250.0,
            "f0_range_hz": 150.0,
        },
    )

    monkeypatch.setattr(
        bm,
        "_safe_jitter_shimmer",
        lambda sound: {
            "jitter_local": 0.01,
            "jitter_rap": 0.005,
            "jitter_ppq5": 0.007,
            "jitter_ddp": 0.015,
            "shimmer_local": 0.05,
            "shimmer_apq3": 0.04,
            "shimmer_apq5": 0.045,
            "shimmer_apq11": 0.06,
            "shimmer_dda": 0.12,
        },
    )

    monkeypatch.setattr(bm, "_safe_hnr", lambda sound: 25.0)

    monkeypatch.setattr(
        bm,
        "_safe_mfcc",
        lambda path: (
            [float(i) for i in range(13)],
            [float(i) * 0.1 for i in range(13)],
        ),
    )

    monkeypatch.setattr(bm, "_estimate_pause_ratio", lambda path: 0.20)
    monkeypatch.setattr(bm, "_estimate_speech_rate", lambda path: 4.5)
    monkeypatch.setattr(bm, "_estimate_voice_breaks", lambda sound: 2)
    monkeypatch.setattr(bm, "_safe_cpp", lambda sound: None)

    result = bm.extract_biomarkers(FIXTURE_WAV)

    assert isinstance(result, bm.BiomarkerResult)
    assert isinstance(result.mfcc_means, list)
    assert len(result.mfcc_means) == 13
    assert isinstance(result.mfcc_stds, list)
    assert len(result.mfcc_stds) == 13
    assert isinstance(result.flags, bm.BiomarkerFlags)
    assert isinstance(result.extraction_warnings, list)


# ---------------------------------------------------------------------------
# Test 2 — missing file
# ---------------------------------------------------------------------------


def test_extract_biomarkers_handles_missing_file():
    """FileNotFoundError raised with an informative message for nonexistent path."""
    import pytest

    with pytest.raises(FileNotFoundError, match="/nonexistent/path.wav"):
        bm.extract_biomarkers("/nonexistent/path.wav")


# ---------------------------------------------------------------------------
# Test 3 — flag computation
# ---------------------------------------------------------------------------


def _make_result(**kwargs) -> bm.BiomarkerResult:
    """Construct a BiomarkerResult with sensible defaults, overriding via kwargs."""
    defaults = dict(
        duration_sec=2.0,
        f0_mean_hz=150.0,
        f0_std_hz=20.0,
        f0_min_hz=100.0,
        f0_max_hz=250.0,
        f0_range_hz=150.0,
        jitter_local=0.01,
        jitter_rap=None,
        jitter_ppq5=None,
        jitter_ddp=None,
        shimmer_local=None,
        shimmer_apq3=None,
        shimmer_apq5=None,
        shimmer_apq11=None,
        shimmer_dda=None,
        hnr_db=25.0,
        mfcc_means=[0.0] * 13,
        mfcc_stds=[0.0] * 13,
        speech_rate_syllables_per_sec=4.0,
        pause_ratio=0.20,
        voice_breaks_count=1,
        cpp=None,
        flags=bm.BiomarkerFlags(
            elevated_jitter=False,
            reduced_hnr=False,
            flat_f0_range=False,
            high_pause_ratio=False,
        ),
        extraction_warnings=[],
    )
    defaults.update(kwargs)
    return bm.BiomarkerResult(**defaults)


def test_flags_are_computed_from_metric_values():
    """_build_flags sets each flag correctly for both true and false cases."""

    # All flags False
    base = _make_result(
        jitter_local=0.01,    # <= 0.02 → elevated_jitter False
        hnr_db=25.0,          # >= 20.0 → reduced_hnr False
        f0_range_hz=150.0,    # >= 30.0 → flat_f0_range False
        pause_ratio=0.20,     # <= 0.40 → high_pause_ratio False
    )
    flags = bm._build_flags(base)
    assert flags.elevated_jitter is False
    assert flags.reduced_hnr is False
    assert flags.flat_f0_range is False
    assert flags.high_pause_ratio is False

    # All flags True
    all_true = _make_result(
        jitter_local=0.05,    # > 0.02 → elevated_jitter True
        hnr_db=15.0,          # < 20.0 → reduced_hnr True
        f0_range_hz=10.0,     # < 30.0 → flat_f0_range True
        pause_ratio=0.55,     # > 0.40 → high_pause_ratio True
    )
    flags2 = bm._build_flags(all_true)
    assert flags2.elevated_jitter is True
    assert flags2.reduced_hnr is True
    assert flags2.flat_f0_range is True
    assert flags2.high_pause_ratio is True

    # Boundary: None values → flags False (not enough info)
    none_vals = _make_result(
        jitter_local=None,
        hnr_db=None,
        f0_range_hz=None,
        pause_ratio=None,
    )
    flags3 = bm._build_flags(none_vals)
    assert flags3.elevated_jitter is False
    assert flags3.reduced_hnr is False
    assert flags3.flat_f0_range is False
    assert flags3.high_pause_ratio is False


# ---------------------------------------------------------------------------
# Test 4 — fault isolation
# ---------------------------------------------------------------------------


def test_metric_failure_does_not_crash_entire_extraction(monkeypatch):
    """A raising _safe_* helper still yields a BiomarkerResult; warning is recorded."""

    monkeypatch.setattr(bm, "_load_sound", lambda path: object())

    # F0 raises — should be caught and warned
    monkeypatch.setattr(
        bm,
        "_safe_pitch_metrics",
        lambda sound: (_ for _ in ()).throw(RuntimeError("pitch boom")),
    )

    # Jitter also raises
    monkeypatch.setattr(
        bm,
        "_safe_jitter_shimmer",
        lambda sound: (_ for _ in ()).throw(RuntimeError("jitter boom")),
    )

    # Remaining helpers return sensible values
    monkeypatch.setattr(bm, "_safe_hnr", lambda sound: 22.0)
    monkeypatch.setattr(
        bm,
        "_safe_mfcc",
        lambda path: (
            [1.0] * 13,
            [0.5] * 13,
        ),
    )
    monkeypatch.setattr(bm, "_estimate_pause_ratio", lambda path: 0.30)
    monkeypatch.setattr(bm, "_estimate_speech_rate", lambda path: 3.0)
    monkeypatch.setattr(bm, "_estimate_voice_breaks", lambda sound: 0)
    monkeypatch.setattr(bm, "_safe_cpp", lambda sound: None)

    result = bm.extract_biomarkers(FIXTURE_WAV)

    assert isinstance(result, bm.BiomarkerResult)

    # Failed metrics → None
    assert result.f0_mean_hz is None
    assert result.jitter_local is None

    # Successful metrics populated
    assert result.hnr_db == 22.0
    assert result.mfcc_means == [1.0] * 13
    assert result.pause_ratio == 0.30

    # Warnings contain entries for the failed metrics
    warn_text = " ".join(result.extraction_warnings)
    assert "f0" in warn_text.lower() or "pitch" in warn_text.lower()
    assert "jitter" in warn_text.lower() or "shimmer" in warn_text.lower()
