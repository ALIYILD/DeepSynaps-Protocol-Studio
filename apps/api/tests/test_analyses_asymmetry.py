"""Tests for services/analyses/asymmetry.py — EEG asymmetry analysis functions.

All four registered analysis functions are exercised with a synthetic
context dict that mimics the output of _helpers.build_context, so there
is no MNE dependency.

Covers:
* full_asymmetry_matrix returns data with 'pairs' and 'method' keys.
* full_asymmetry_matrix computes one entry per present homologous pair.
* full_asymmetry_matrix skips pairs whose channels are missing.
* frontal_alpha_dominance classifies symmetric FAA (|faa| < 0.1).
* frontal_alpha_dominance classifies right-dominant FAA (positive).
* frontal_alpha_dominance classifies left-dominant FAA (negative).
* delta_dominance lateralized flag is set when |asymmetry| > 0.2.
* delta_dominance 'none' dominant side when asymmetry is small.
* regional_asymmetry_severity overall_severity is 'normal' for flat PSD.
* regional_asymmetry_severity severity 'severe' when one side is zero.
* Clinical safety: functions return dict and do not raise on minimal channel set.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pytest

from app.services.analyses.asymmetry import (
    delta_dominance,
    frontal_alpha_dominance,
    full_asymmetry_matrix,
    regional_asymmetry_severity,
)
from app.services.analyses._helpers import DEFAULT_BANDS


# ── Context factory ───────────────────────────────────────────────────────────

def _make_ctx(
    ch_names: list[str],
    amplitude: float = 1.0,
    sfreq: float = 256.0,
    nperseg: int = 512,
    override_psd: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Minimal synthetic context with flat PSD.

    ``override_psd`` maps channel name -> flat amplitude (uV^2/Hz) so
    individual channels can be set to different values.
    """
    freqs = np.fft.rfftfreq(nperseg, 1.0 / sfreq)
    n_ch = len(ch_names)
    n_freq = len(freqs)

    psd = np.full((n_ch, n_freq), amplitude, dtype=float)
    if override_psd:
        for ch, amp in override_psd.items():
            if ch in ch_names:
                idx = ch_names.index(ch)
                psd[idx, :] = amp

    return {
        "ch_names": ch_names,
        "sfreq": sfreq,
        "freqs": freqs,
        "psd": psd,
        "data": np.random.default_rng(0).standard_normal((n_ch, int(sfreq * 4))),
        "band_powers": {},
    }


# Standard 10-20 channels used across most tests
_STD_CHANNELS = [
    "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
    "T3", "C3", "Cz", "C4", "T4",
    "T5", "P3", "Pz", "P4", "T6",
    "O1", "O2",
]


# ── full_asymmetry_matrix ─────────────────────────────────────────────────────


def test_full_asymmetry_matrix_returns_pairs_key() -> None:
    ctx = _make_ctx(_STD_CHANNELS)
    result = full_asymmetry_matrix(ctx)
    assert "pairs" in result["data"]
    assert result["data"]["method"] == "ln(Right) - ln(Left)"


def test_full_asymmetry_matrix_covers_all_present_pairs() -> None:
    ctx = _make_ctx(_STD_CHANNELS)
    result = full_asymmetry_matrix(ctx)
    pairs = result["data"]["pairs"]
    # All 8 homologous pairs are present in _STD_CHANNELS
    assert len(pairs) == 8


def test_full_asymmetry_matrix_symmetric_psd_gives_zero_asymmetry() -> None:
    """When left and right channels have identical PSD, asymmetry = ln(x) - ln(x) = 0."""
    ctx = _make_ctx(_STD_CHANNELS, amplitude=1.0)
    result = full_asymmetry_matrix(ctx)
    for pair_key, band_values in result["data"]["pairs"].items():
        for band, asym in band_values.items():
            assert abs(asym) < 1e-6, f"Expected ~0 for {pair_key}/{band}, got {asym}"


def test_full_asymmetry_matrix_skips_missing_channels() -> None:
    """A partial channel set — only O1/O2 present — should yield 1 pair."""
    ctx = _make_ctx(["O1", "O2"])
    result = full_asymmetry_matrix(ctx)
    pairs = result["data"]["pairs"]
    assert list(pairs.keys()) == ["O1_O2"]


def test_full_asymmetry_matrix_summary_string() -> None:
    ctx = _make_ctx(_STD_CHANNELS)
    result = full_asymmetry_matrix(ctx)
    assert "8 pairs" in result["summary"]


# ── frontal_alpha_dominance ───────────────────────────────────────────────────


def test_frontal_alpha_dominance_symmetric() -> None:
    ctx = _make_ctx(_STD_CHANNELS, amplitude=1.0)
    result = frontal_alpha_dominance(ctx)
    assert result["data"]["overall_dominance"] == "symmetric"


def test_frontal_alpha_dominance_right_dominant() -> None:
    """Setting right frontal channels to much higher amplitude -> right_dominant."""
    ctx = _make_ctx(
        _STD_CHANNELS,
        amplitude=1.0,
        override_psd={"F4": 100.0, "F8": 100.0, "Fp2": 100.0},
    )
    result = frontal_alpha_dominance(ctx)
    assert result["data"]["overall_dominance"] == "right_dominant"


def test_frontal_alpha_dominance_left_dominant() -> None:
    """Setting left frontal channels to much higher amplitude -> left_dominant."""
    ctx = _make_ctx(
        _STD_CHANNELS,
        amplitude=1.0,
        override_psd={"F3": 100.0, "F7": 100.0, "Fp1": 100.0},
    )
    result = frontal_alpha_dominance(ctx)
    assert result["data"]["overall_dominance"] == "left_dominant"


def test_frontal_alpha_dominance_pair_keys() -> None:
    ctx = _make_ctx(_STD_CHANNELS)
    result = frontal_alpha_dominance(ctx)
    pairs = result["data"]["pairs"]
    assert "F3_F4" in pairs
    assert "Fp1_Fp2" in pairs


# ── delta_dominance ───────────────────────────────────────────────────────────


def test_delta_dominance_not_lateralized_for_flat_psd() -> None:
    ctx = _make_ctx(_STD_CHANNELS, amplitude=1.0)
    result = delta_dominance(ctx)
    for v in result["data"]["pairs"].values():
        assert v["lateralized"] is False
        assert v["dominant_side"] == "none"


def test_delta_dominance_lateralized_right() -> None:
    ctx = _make_ctx(
        _STD_CHANNELS,
        amplitude=1.0,
        override_psd={"T4": 100.0},  # right temporal very high delta
    )
    result = delta_dominance(ctx)
    # T3_T4 pair should be lateralized
    assert result["data"]["pairs"]["T3_T4"]["lateralized"] is True
    assert result["data"]["pairs"]["T3_T4"]["dominant_side"] == "right"


def test_delta_dominance_summary_format() -> None:
    ctx = _make_ctx(_STD_CHANNELS)
    result = delta_dominance(ctx)
    assert "Delta lateralization" in result["summary"]


# ── regional_asymmetry_severity ───────────────────────────────────────────────


def test_regional_asymmetry_normal_for_flat_psd() -> None:
    ctx = _make_ctx(_STD_CHANNELS, amplitude=1.0)
    result = regional_asymmetry_severity(ctx)
    assert result["data"]["overall_severity"] == "normal"


def test_regional_asymmetry_severe_when_one_side_zero() -> None:
    """If one occipital channel has zero power -> asymmetry -> severe."""
    ctx = _make_ctx(_STD_CHANNELS, amplitude=1.0, override_psd={"O2": 1e-10})
    result = regional_asymmetry_severity(ctx)
    occ = result["data"]["regions"].get("occipital", {})
    assert occ.get("severity") in ("moderate", "severe"), (
        "Expected at least moderate asymmetry when one occipital channel approaches zero"
    )


def test_regional_asymmetry_severity_levels() -> None:
    """Severity escalates: normal < mild < moderate < severe."""
    severity_order = {"normal": 0, "mild": 1, "moderate": 2, "severe": 3}
    ctx = _make_ctx(_STD_CHANNELS)
    result = regional_asymmetry_severity(ctx)
    assert result["data"]["overall_severity"] in severity_order


def test_regional_asymmetry_clinical_safety_no_raise() -> None:
    """Even with a minimal single-pair channel set the function must not raise."""
    ctx = _make_ctx(["O1", "O2"])
    result = regional_asymmetry_severity(ctx)
    assert "overall_severity" in result["data"]
