"""Tests for app.services.analyses.complexity — entropy, fractal dimension,
Lempel-Ziv complexity, multiscale entropy.

All functions are pure (numpy only). Tests pin real numerical behaviour.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.analyses.complexity import (
    _approximate_entropy,
    _higuchi_fd,
    _lempel_ziv_complexity,
    _sample_entropy,
    entropy_analysis,
    fractal_lz,
    higuchi_fd_detailed,
    multiscale_entropy,
)


RNG = np.random.default_rng(42)


def _make_ctx(n_ch: int = 2, seconds: float = 15.0, sfreq: float = 256.0) -> dict:
    data = RNG.standard_normal((n_ch, int(seconds * sfreq)))
    ch_names = [f"Ch{i}" for i in range(n_ch)]
    return {"data": data, "ch_names": ch_names, "sfreq": sfreq}


# ---------------------------------------------------------------------------
# _sample_entropy
# ---------------------------------------------------------------------------

def test_sample_entropy_returns_float():
    sig = RNG.standard_normal(500)
    se = _sample_entropy(sig)
    assert isinstance(se, float)


def test_sample_entropy_constant_signal_returns_zero():
    sig = np.ones(200)
    assert _sample_entropy(sig) == 0.0


def test_sample_entropy_random_signal_positive():
    sig = RNG.standard_normal(500)
    assert _sample_entropy(sig) > 0.0


# ---------------------------------------------------------------------------
# _approximate_entropy
# ---------------------------------------------------------------------------

def test_approx_entropy_returns_float():
    sig = RNG.standard_normal(200)
    ae = _approximate_entropy(sig)
    assert isinstance(ae, float)


def test_approx_entropy_constant_returns_zero():
    sig = np.ones(150)
    assert _approximate_entropy(sig) == 0.0


# ---------------------------------------------------------------------------
# _higuchi_fd
# ---------------------------------------------------------------------------

def test_higuchi_fd_random_signal_range():
    """Healthy EEG Higuchi FD is typically 1.5-2.1 for random Gaussian noise."""
    sig = RNG.standard_normal(1000)
    fd = _higuchi_fd(sig, kmax=10)
    assert 1.0 < fd < 2.5


def test_higuchi_fd_short_signal_no_crash():
    sig = np.array([1.0, 2.0, 1.5])
    fd = _higuchi_fd(sig, kmax=5)
    assert np.isfinite(fd)


# ---------------------------------------------------------------------------
# _lempel_ziv_complexity
# ---------------------------------------------------------------------------

def test_lz_complexity_constant_signal_low():
    sig = np.ones(200)
    lz = _lempel_ziv_complexity(sig)
    assert lz < 0.3  # very regular → low complexity


def test_lz_complexity_random_signal_positive():
    sig = RNG.standard_normal(500)
    lz = _lempel_ziv_complexity(sig)
    assert lz > 0.0


# ---------------------------------------------------------------------------
# entropy_analysis — registered analysis
# ---------------------------------------------------------------------------

def test_entropy_analysis_keys():
    ctx = _make_ctx(n_ch=2)
    result = entropy_analysis(ctx)
    assert "data" in result
    assert "summary" in result
    assert "channels" in result["data"]
    assert "mean_sample_entropy" in result["data"]


def test_entropy_analysis_per_channel_keys():
    ctx = _make_ctx(n_ch=2)
    result = entropy_analysis(ctx)
    for ch, vals in result["data"]["channels"].items():
        assert "sample_entropy" in vals
        assert "approximate_entropy" in vals


def test_entropy_analysis_mean_positive():
    ctx = _make_ctx(n_ch=2)
    result = entropy_analysis(ctx)
    assert result["data"]["mean_sample_entropy"] > 0.0


def test_entropy_analysis_summary_contains_m_r():
    ctx = _make_ctx(n_ch=2)
    result = entropy_analysis(ctx)
    assert "m=2" in result["summary"]
    assert "r=0.2" in result["summary"]


# ---------------------------------------------------------------------------
# fractal_lz — registered analysis
# ---------------------------------------------------------------------------

def test_fractal_lz_keys():
    ctx = _make_ctx(n_ch=2)
    result = fractal_lz(ctx)
    assert "mean_higuchi_fd" in result["data"]
    assert "mean_lempel_ziv" in result["data"]
    assert "channels" in result["data"]


def test_fractal_lz_fd_in_range():
    ctx = _make_ctx(n_ch=2)
    result = fractal_lz(ctx)
    assert 1.0 < result["data"]["mean_higuchi_fd"] < 2.5


def test_fractal_lz_summary_contains_fd_and_lz():
    ctx = _make_ctx(n_ch=2)
    result = fractal_lz(ctx)
    assert "Higuchi FD=" in result["summary"]
    assert "LZ=" in result["summary"]


# ---------------------------------------------------------------------------
# multiscale_entropy — registered analysis
# ---------------------------------------------------------------------------

def test_multiscale_entropy_keys():
    ctx = _make_ctx(n_ch=2)
    result = multiscale_entropy(ctx)
    assert "channels" in result["data"]
    assert "mean_complexity_index" in result["data"]


def test_multiscale_entropy_ci_type():
    ctx = _make_ctx(n_ch=2)
    result = multiscale_entropy(ctx)
    assert isinstance(result["data"]["mean_complexity_index"], float)


# ---------------------------------------------------------------------------
# higuchi_fd_detailed — registered analysis
# ---------------------------------------------------------------------------

def test_higuchi_fd_detailed_dominant_classification():
    ctx = _make_ctx(n_ch=2)
    result = higuchi_fd_detailed(ctx)
    assert result["data"]["dominant_classification"] in {
        "low_complexity", "moderate_complexity", "high_complexity"
    }


def test_higuchi_fd_detailed_channel_kmax_keys():
    ctx = _make_ctx(n_ch=1)
    result = higuchi_fd_detailed(ctx)
    ch = list(result["data"]["channels"].keys())[0]
    fd_by_kmax = result["data"]["channels"][ch]["fd_by_kmax"]
    assert any(k.startswith("kmax_") for k in fd_by_kmax)
