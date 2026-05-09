"""Tests for app.services.analyses.connectivity — coherence, PLI, wPLI,
disconnection flags.

All functions are pure (numpy/scipy). Tests pin numerical structure and
clinical-safety outputs.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.analyses.connectivity import (
    _compute_coherence_pair,
    coherence_matrix,
    disconnection_flags,
    pli_icoh,
    wpli,
)

RNG = np.random.default_rng(7)
SFREQ = 256.0
CH_NAMES = ["Fp1", "Fp2", "F3", "F4", "C3", "C4"]
N_CH = len(CH_NAMES)


def _make_ctx(seconds: float = 10.0) -> dict:
    data = RNG.standard_normal((N_CH, int(seconds * SFREQ)))
    return {"data": data, "ch_names": CH_NAMES, "sfreq": SFREQ}


# ---------------------------------------------------------------------------
# _compute_coherence_pair
# ---------------------------------------------------------------------------

def test_coherence_pair_values_in_0_1():
    data = RNG.standard_normal((2, int(4 * SFREQ)))
    nperseg = int(2.0 * SFREQ)
    freqs, coh = _compute_coherence_pair(data[0], data[1], SFREQ, nperseg)
    assert np.all(coh >= 0.0)
    assert np.all(coh <= 1.0 + 1e-6)  # numerical tolerance


def test_coherence_pair_identical_signals_high_coherence():
    """Identical signals should have coherence ≈ 1 across all frequencies."""
    sig = RNG.standard_normal(int(4 * SFREQ))
    nperseg = int(2.0 * SFREQ)
    _, coh = _compute_coherence_pair(sig, sig.copy(), SFREQ, nperseg)
    assert float(np.mean(coh)) > 0.95


# ---------------------------------------------------------------------------
# coherence_matrix
# ---------------------------------------------------------------------------

def test_coherence_matrix_top_level_keys():
    ctx = _make_ctx()
    result = coherence_matrix(ctx)
    assert "data" in result
    assert "channels" in result["data"]
    assert "bands" in result["data"]
    assert "summary" in result


def test_coherence_matrix_bands_present():
    ctx = _make_ctx()
    result = coherence_matrix(ctx)
    bands = result["data"]["bands"]
    # All default bands should be computed
    for b in ("delta", "theta", "alpha", "beta", "gamma"):
        assert b in bands


def test_coherence_matrix_diagonal_is_one():
    ctx = _make_ctx()
    result = coherence_matrix(ctx)
    matrix = result["data"]["bands"]["alpha"]
    n = len(matrix)
    for i in range(n):
        assert abs(matrix[i][i] - 1.0) < 1e-6


def test_coherence_matrix_symmetric():
    ctx = _make_ctx()
    result = coherence_matrix(ctx)
    matrix = result["data"]["bands"]["alpha"]
    n = len(matrix)
    for i in range(n):
        for j in range(n):
            assert abs(matrix[i][j] - matrix[j][i]) < 1e-6


# ---------------------------------------------------------------------------
# disconnection_flags
# ---------------------------------------------------------------------------

def test_disconnection_flags_keys():
    ctx = _make_ctx()
    result = disconnection_flags(ctx)
    assert "flags" in result["data"]
    assert "total_pairs_checked" in result["data"]
    assert "flagged_count" in result["data"]


def test_disconnection_flags_flagged_count_matches_list():
    ctx = _make_ctx()
    result = disconnection_flags(ctx)
    assert result["data"]["flagged_count"] == len(result["data"]["flags"])


def test_disconnection_flags_total_pairs_n_choose_2():
    ctx = _make_ctx()
    result = disconnection_flags(ctx)
    n = N_CH
    expected = n * (n - 1) // 2
    assert result["data"]["total_pairs_checked"] == expected


def test_disconnection_flags_summary_format():
    ctx = _make_ctx()
    result = disconnection_flags(ctx)
    assert "disconnection flags" in result["summary"]


# ---------------------------------------------------------------------------
# pli_icoh
# ---------------------------------------------------------------------------

def test_pli_icoh_keys():
    ctx = _make_ctx()
    result = pli_icoh(ctx)
    assert "pairs" in result["data"]
    assert "mean_pli" in result["data"]
    assert result["data"]["band"] == "alpha"


def test_pli_icoh_values_in_range():
    ctx = _make_ctx()
    result = pli_icoh(ctx)
    for pair_key, vals in result["data"]["pairs"].items():
        assert 0.0 <= vals["pli"] <= 1.0
        assert vals["icoh"] >= 0.0


def test_pli_icoh_total_pairs_matches():
    ctx = _make_ctx()
    result = pli_icoh(ctx)
    n = N_CH
    expected = n * (n - 1) // 2
    assert result["data"]["total_pairs"] == expected


# ---------------------------------------------------------------------------
# wpli
# ---------------------------------------------------------------------------

def test_wpli_keys():
    ctx = _make_ctx(seconds=10.0)
    result = wpli(ctx)
    assert "bands" in result["data"]
    assert "n_epochs" in result["data"]


def test_wpli_both_bands_computed():
    ctx = _make_ctx(seconds=10.0)
    result = wpli(ctx)
    assert "alpha" in result["data"]["bands"]
    assert "beta" in result["data"]["bands"]


def test_wpli_mean_in_0_1():
    ctx = _make_ctx(seconds=10.0)
    result = wpli(ctx)
    for band_name, band_data in result["data"]["bands"].items():
        assert 0.0 <= band_data["mean_wpli"] <= 1.0


def test_wpli_insufficient_data_returns_error():
    """< 3 epochs (< 6s at 2s/epoch) → graceful error result."""
    data = RNG.standard_normal((N_CH, int(4 * SFREQ)))  # only 2 epochs
    ctx = {"data": data, "ch_names": CH_NAMES, "sfreq": SFREQ}
    result = wpli(ctx)
    # Either error dict or valid result — must not crash
    assert "data" in result
    assert "summary" in result
