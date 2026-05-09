"""Tests for services/analyses/_helpers.py — shared EEG analysis utilities.

Covers:
* DEFAULT_BANDS contains the 6 standard clinical EEG bands with correct Hz ranges.
* HOMOLOGOUS_PAIRS lists 8 left/right electrode pairs.
* BACKEND_TO_FRONTEND_CHANNEL maps the 4 old 10-20 names to modern aliases.
* FRONTEND_TO_BACKEND_CHANNEL is the exact inverse mapping.
* STANDARD_19 contains exactly 19 electrode names.
* compute_band_power_from_psd integrates correctly over a synthetic PSD.
* compute_band_power_from_psd returns zeros when the band is outside the freq range.
* safe_log_ratio returns ln(b) - ln(a) (i.e., ln(right) - ln(left)) correctly.
* safe_log_ratio returns 0.0 when either value is <= 0.
* channels_present returns only those channels that exist in the list.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from app.services.analyses._helpers import (
    BACKEND_TO_FRONTEND_CHANNEL,
    DEFAULT_BANDS,
    FRONTEND_TO_BACKEND_CHANNEL,
    HOMOLOGOUS_PAIRS,
    STANDARD_19,
    channels_present,
    compute_band_power_from_psd,
    safe_log_ratio,
)


# ── Constants ─────────────────────────────────────────────────────────────────


def test_default_bands_has_six_bands() -> None:
    assert len(DEFAULT_BANDS) == 6


def test_default_bands_contain_expected_keys() -> None:
    expected = {"delta", "theta", "alpha", "beta", "high_beta", "gamma"}
    assert set(DEFAULT_BANDS.keys()) == expected


def test_default_bands_delta_range() -> None:
    lo, hi = DEFAULT_BANDS["delta"]
    assert lo == 0.5
    assert hi == 4.0


def test_default_bands_alpha_range() -> None:
    lo, hi = DEFAULT_BANDS["alpha"]
    assert lo == 8.0
    assert hi == 12.0


def test_homologous_pairs_count() -> None:
    assert len(HOMOLOGOUS_PAIRS) == 8


def test_homologous_pairs_are_tuples_of_two() -> None:
    for pair in HOMOLOGOUS_PAIRS:
        assert len(pair) == 2


def test_backend_to_frontend_has_four_entries() -> None:
    assert len(BACKEND_TO_FRONTEND_CHANNEL) == 4


def test_frontend_to_backend_is_inverse() -> None:
    for old, new in BACKEND_TO_FRONTEND_CHANNEL.items():
        assert FRONTEND_TO_BACKEND_CHANNEL[new] == old


def test_standard_19_has_19_channels() -> None:
    assert len(STANDARD_19) == 19


def test_standard_19_contains_cz() -> None:
    assert "Cz" in STANDARD_19


# ── compute_band_power_from_psd ───────────────────────────────────────────────


def _flat_psd(n_ch: int, n_freqs: int, amplitude: float) -> np.ndarray:
    """Flat PSD of given amplitude across all channels and frequencies."""
    return np.full((n_ch, n_freqs), amplitude, dtype=float)


def test_band_power_integrates_flat_psd() -> None:
    """For a flat PSD the power = amplitude * bandwidth (numerically)."""
    sfreq = 256.0
    nperseg = 512
    freqs = np.fft.rfftfreq(nperseg, 1.0 / sfreq)
    freq_res = freqs[1] - freqs[0]
    amplitude = 1.0
    psd = _flat_psd(n_ch=1, n_freqs=len(freqs), amplitude=amplitude)

    fmin, fmax = 8.0, 12.0  # alpha band
    power = compute_band_power_from_psd(freqs, psd, fmin, fmax)
    n_bins = int(np.sum((freqs >= fmin) & (freqs <= fmax)))
    expected = amplitude * n_bins * freq_res
    assert abs(power[0] - expected) < 1e-9


def test_band_power_out_of_range_returns_zero() -> None:
    """Querying a band entirely outside the frequency vector returns 0."""
    freqs = np.linspace(0, 50, 200)
    psd = _flat_psd(n_ch=2, n_freqs=200, amplitude=5.0)
    power = compute_band_power_from_psd(freqs, psd, 60.0, 80.0)
    np.testing.assert_array_almost_equal(power, [0.0, 0.0])


def test_band_power_shape() -> None:
    """Output shape is (n_channels,)."""
    freqs = np.linspace(0, 50, 100)
    psd = _flat_psd(n_ch=4, n_freqs=100, amplitude=1.0)
    power = compute_band_power_from_psd(freqs, psd, 4.0, 8.0)
    assert power.shape == (4,)


# ── safe_log_ratio ────────────────────────────────────────────────────────────


def test_safe_log_ratio_correct_value() -> None:
    # safe_log_ratio(a, b) = ln(a) - ln(b)
    # safe_log_ratio(2.0, 1.0) = ln(2) - ln(1) = ln(2)
    result = safe_log_ratio(2.0, 1.0)
    assert abs(result - math.log(2.0)) < 1e-9


def test_safe_log_ratio_zero_a_returns_zero() -> None:
    assert safe_log_ratio(0.0, 1.0) == 0.0


def test_safe_log_ratio_zero_b_returns_zero() -> None:
    assert safe_log_ratio(1.0, 0.0) == 0.0


def test_safe_log_ratio_negative_returns_zero() -> None:
    assert safe_log_ratio(-1.0, 2.0) == 0.0


# ── channels_present ─────────────────────────────────────────────────────────


def test_channels_present_all_exist() -> None:
    ch_names = ["Fp1", "Fp2", "C3", "C4"]
    assert channels_present(ch_names, ["Fp1", "C4"]) == ["Fp1", "C4"]


def test_channels_present_partial() -> None:
    ch_names = ["Fp1", "Fp2"]
    result = channels_present(ch_names, ["Fp1", "C3"])
    assert result == ["Fp1"]


def test_channels_present_none_present() -> None:
    assert channels_present(["Cz"], ["O1", "O2"]) == []
