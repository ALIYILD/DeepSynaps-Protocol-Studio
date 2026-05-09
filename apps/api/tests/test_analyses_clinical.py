"""Tests for app.services.analyses.clinical — IAPF/plasticity, wavelet decomposition.

Tests pin clinical classification thresholds (slowed/normal/fast alpha),
key data structures, and summary format. ICA decomposition is skipped
since it requires MNE raw objects (covered separately if needed).
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.analyses.clinical import iapf_plasticity, wavelet_decomposition

RNG = np.random.default_rng(55)
SFREQ = 256.0


def _make_psd_ctx(
    n_ch: int = 4,
    ch_names: list[str] | None = None,
    alpha_peak_hz: float = 10.0,
    noise_level: float = 0.1,
) -> dict:
    """Build a PSD context with a synthetic alpha peak."""
    if ch_names is None:
        ch_names = ["O1", "O2", "P3", "P4"][:n_ch]
    freqs = np.linspace(0.5, 50.0, 200)
    psd = RNG.random((n_ch, len(freqs))) * noise_level
    # Inject a clear alpha peak at `alpha_peak_hz`
    alpha_idx = int(np.argmin(np.abs(freqs - alpha_peak_hz)))
    psd[:, alpha_idx - 2 : alpha_idx + 3] += 5.0
    return {"freqs": freqs, "psd": psd, "ch_names": ch_names}


def _make_raw_ctx(n_ch: int = 4, seconds: float = 10.0) -> dict:
    """Build a raw EEG data context."""
    ch_names = ["Fz", "Cz", "Pz", "O1"][:n_ch]
    data = RNG.standard_normal((n_ch, int(seconds * SFREQ)))
    return {"data": data, "ch_names": ch_names, "sfreq": SFREQ}


# ---------------------------------------------------------------------------
# iapf_plasticity
# ---------------------------------------------------------------------------

def test_iapf_plasticity_top_level_keys():
    ctx = _make_psd_ctx()
    result = iapf_plasticity(ctx)
    assert "data" in result
    assert "summary" in result
    assert "channels" in result["data"]
    assert "mean_iapf_hz" in result["data"]
    assert "posterior_iapf_hz" in result["data"]


def test_iapf_plasticity_normal_alpha_classification():
    """Alpha peak at 10 Hz → classification should be 'normal' (9–11 Hz range)."""
    ctx = _make_psd_ctx(alpha_peak_hz=10.0, ch_names=["O1", "O2"])
    result = iapf_plasticity(ctx)
    for ch in ["O1", "O2"]:
        assert result["data"]["channels"][ch]["classification"] == "normal"


def test_iapf_plasticity_slowed_classification():
    """Alpha peak at 7.5 Hz → classification should be 'slowed'."""
    ctx = _make_psd_ctx(alpha_peak_hz=7.5, ch_names=["O1", "O2"])
    result = iapf_plasticity(ctx)
    for ch in ["O1", "O2"]:
        assert result["data"]["channels"][ch]["classification"] == "slowed"


def test_iapf_plasticity_fast_variant_classification():
    """Alpha peak at 12 Hz → classification should be 'fast_variant'."""
    ctx = _make_psd_ctx(alpha_peak_hz=12.0, ch_names=["O1"])
    result = iapf_plasticity(ctx)
    assert result["data"]["channels"]["O1"]["classification"] == "fast_variant"


def test_iapf_plasticity_per_channel_keys():
    ctx = _make_psd_ctx()
    result = iapf_plasticity(ctx)
    for ch, vals in result["data"]["channels"].items():
        if "error" not in vals:
            assert "iapf_cog_hz" in vals
            assert "plasticity_index" in vals
            assert "alpha_relative_pct" in vals
            assert "classification" in vals


def test_iapf_plasticity_mean_iapf_type():
    ctx = _make_psd_ctx()
    result = iapf_plasticity(ctx)
    assert isinstance(result["data"]["mean_iapf_hz"], float)


def test_iapf_plasticity_summary_contains_posterior_iapf():
    ctx = _make_psd_ctx(ch_names=["O1", "O2"])
    result = iapf_plasticity(ctx)
    assert "Posterior IAPF=" in result["summary"]


def test_iapf_plasticity_alpha_relative_pct_in_range():
    ctx = _make_psd_ctx(ch_names=["O1"])
    result = iapf_plasticity(ctx)
    ch_data = result["data"]["channels"]["O1"]
    if "alpha_relative_pct" in ch_data:
        assert 0.0 <= ch_data["alpha_relative_pct"] <= 100.0


# ---------------------------------------------------------------------------
# wavelet_decomposition
# ---------------------------------------------------------------------------

def test_wavelet_decomposition_top_level_keys():
    ctx = _make_raw_ctx()
    result = wavelet_decomposition(ctx)
    assert "data" in result
    assert "summary" in result
    assert "channels" in result["data"]
    assert "band_summary" in result["data"]


def test_wavelet_decomposition_band_summary_keys():
    ctx = _make_raw_ctx()
    result = wavelet_decomposition(ctx)
    band_summary = result["data"]["band_summary"]
    for b in ("delta", "theta", "alpha", "beta"):
        assert b in band_summary


def test_wavelet_decomposition_channel_power_lists():
    ctx = _make_raw_ctx(n_ch=2)
    result = wavelet_decomposition(ctx)
    for ch_data in result["data"]["channels"].values():
        assert "frequencies_hz" in ch_data
        assert "mean_power_uv2" in ch_data
        assert len(ch_data["frequencies_hz"]) == len(ch_data["mean_power_uv2"])


def test_wavelet_decomposition_segment_duration():
    ctx = _make_raw_ctx(n_ch=2, seconds=10.0)
    result = wavelet_decomposition(ctx)
    # Segment should be at most 30s
    assert result["data"]["segment_duration_sec"] <= 30.0


def test_wavelet_decomposition_summary_channel_count():
    ctx = _make_raw_ctx(n_ch=3)
    result = wavelet_decomposition(ctx)
    assert "channels" in result["summary"]
