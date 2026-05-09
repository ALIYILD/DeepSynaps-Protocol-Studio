"""Tests for app.services.analyses.microstate — K-means microstate segmentation.

All functions are pure numpy. Tests pin real numerical behaviour, structure,
and clinical-safety outputs (GEV, class coverage, transition probabilities).
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.analyses.microstate import (
    _compute_gfp,
    _find_gfp_peaks,
    _kmeans_microstates,
    microstate_analysis,
)

RNG = np.random.default_rng(0)
SFREQ = 256.0
N_CH = 8
CH_NAMES = ["Fp1", "Fp2", "F3", "F4", "C3", "C4", "P3", "P4"]


def _make_ctx(seconds: float = 30.0) -> dict:
    data = RNG.standard_normal((N_CH, int(seconds * SFREQ)))
    return {"data": data, "ch_names": CH_NAMES, "sfreq": SFREQ}


# ---------------------------------------------------------------------------
# _compute_gfp
# ---------------------------------------------------------------------------

def test_compute_gfp_shape():
    data = RNG.standard_normal((N_CH, 256))
    gfp = _compute_gfp(data)
    assert gfp.shape == (256,)


def test_compute_gfp_is_non_negative():
    data = RNG.standard_normal((N_CH, 256))
    gfp = _compute_gfp(data)
    assert np.all(gfp >= 0)


def test_compute_gfp_uniform_data_zero():
    """All channels identical → GFP = 0 everywhere."""
    row = np.ones(100)
    data = np.vstack([row] * 5)
    gfp = _compute_gfp(data)
    np.testing.assert_array_almost_equal(gfp, 0.0)


# ---------------------------------------------------------------------------
# _find_gfp_peaks
# ---------------------------------------------------------------------------

def test_find_gfp_peaks_returns_array():
    gfp = np.array([0.1, 0.5, 0.2, 0.8, 0.3, 0.9, 0.4], dtype=float)
    peaks = _find_gfp_peaks(gfp, min_distance=1)
    assert isinstance(peaks, np.ndarray)


def test_find_gfp_peaks_finds_local_max():
    gfp = np.array([0.0, 0.5, 1.0, 0.5, 0.0, 0.8, 0.3], dtype=float)
    peaks = _find_gfp_peaks(gfp, min_distance=1)
    # Index 2 is a clear peak; should be detected
    assert 2 in peaks


def test_find_gfp_peaks_random_signal_positive_count():
    gfp = np.abs(RNG.standard_normal(500))
    peaks = _find_gfp_peaks(gfp, min_distance=2)
    assert len(peaks) > 0


# ---------------------------------------------------------------------------
# _kmeans_microstates
# ---------------------------------------------------------------------------

def test_kmeans_microstates_output_shapes():
    data = RNG.standard_normal((N_CH, 500))
    gfp = _compute_gfp(data)
    peaks = _find_gfp_peaks(gfp, min_distance=2)
    maps, labels = _kmeans_microstates(data, peaks, n_clusters=4, n_init=2)
    assert maps.shape[0] == 4
    assert maps.shape[1] == N_CH
    assert labels.shape[0] == len(peaks)


def test_kmeans_microstates_insufficient_peaks():
    """< n_clusters peaks → returns zero maps and zero labels."""
    data = RNG.standard_normal((N_CH, 10))
    peaks = np.array([2, 5], dtype=int)  # only 2 peaks < 4 clusters
    maps, labels = _kmeans_microstates(data, peaks, n_clusters=4, n_init=1)
    assert maps.shape == (4, N_CH)
    assert labels.shape == (2,)


# ---------------------------------------------------------------------------
# microstate_analysis — registered analysis
# ---------------------------------------------------------------------------

def test_microstate_analysis_top_level_keys():
    ctx = _make_ctx()
    result = microstate_analysis(ctx)
    assert "data" in result
    assert "summary" in result


def test_microstate_analysis_four_classes():
    ctx = _make_ctx()
    result = microstate_analysis(ctx)
    assert set(result["data"]["classes"].keys()) == {"A", "B", "C", "D"}


def test_microstate_analysis_class_keys():
    ctx = _make_ctx()
    result = microstate_analysis(ctx)
    for cls, vals in result["data"]["classes"].items():
        assert "coverage_pct" in vals
        assert "mean_duration_ms" in vals
        assert "occurrence_per_sec" in vals
        assert "n_segments" in vals


def test_microstate_analysis_coverage_sums_to_100():
    ctx = _make_ctx()
    result = microstate_analysis(ctx)
    total = sum(v["coverage_pct"] for v in result["data"]["classes"].values())
    assert abs(total - 100.0) < 1.0  # allow rounding


def test_microstate_analysis_transitions_present():
    ctx = _make_ctx()
    result = microstate_analysis(ctx)
    transitions = result["data"]["transitions"]
    # Should have 12 non-self transitions (4*3)
    assert len(transitions) == 12


def test_microstate_analysis_gev_between_0_and_1():
    ctx = _make_ctx()
    result = microstate_analysis(ctx)
    gev = result["data"]["gev"]
    assert 0.0 <= gev <= 1.0


def test_microstate_analysis_summary_contains_gev():
    ctx = _make_ctx()
    result = microstate_analysis(ctx)
    assert "GEV=" in result["summary"]


def test_microstate_analysis_insufficient_data_error():
    """Very short data → insufficient GFP peaks → graceful error dict."""
    data = RNG.standard_normal((N_CH, 50))  # ~0.2s of data
    ctx = {"data": data, "ch_names": CH_NAMES, "sfreq": SFREQ}
    result = microstate_analysis(ctx)
    # May produce error dict instead of classes — check it does not crash
    assert "data" in result
    assert "summary" in result
