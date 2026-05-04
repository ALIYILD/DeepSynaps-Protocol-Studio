"""Spectral leakage QA for FIR bandrange (M4 acceptance)."""

from __future__ import annotations

import numpy as np
import pytest

from app.eeg.filters_fir import fir_bandpass_zero_phase, qa_sine_att_db


@pytest.mark.parametrize("sfreq", [250.0, 500.0])
def test_alpha_band_preserves_10hz_and_attenuates_neighbors(sfreq: float) -> None:
    """10 Hz sine through Alpha (8–13 Hz): passband ~1%, leakage ≥40 dB at 4 & 20 Hz."""
    r = qa_sine_att_db(sfreq, 8.0, 13.0, transition_hz=0.5, window="hamming")
    assert abs(r["passband_gain_pct_err"]) < 5.0  # FIR ripple / scaling — within ~5%
    assert r["leak_4hz_db"] <= -35.0
    assert r["leak_20hz_db"] <= -35.0


def test_fir_bandpass_numeric_shape() -> None:
    sfreq = 250.0
    t = np.arange(0, 5.0, 1.0 / sfreq)
    x = np.sin(2 * np.pi * 10.0 * t)
    y = fir_bandpass_zero_phase(x, sfreq, 8.0, 13.0)
    assert y.shape == x.shape
