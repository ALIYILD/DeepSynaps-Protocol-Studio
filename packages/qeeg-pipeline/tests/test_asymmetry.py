"""Tests for :mod:`deepsynaps_qeeg.features.asymmetry`."""
from __future__ import annotations

from math import log

import pytest


def test_asymmetry_sign_positive():
    from deepsynaps_qeeg.features import asymmetry

    features_spectral = {
        "bands": {
            "alpha": {
                "absolute_uv2": {
                    "F3": 2.0,
                    "F4": 8.0,
                    "F7": 1.5,
                    "F8": 6.0,
                }
            }
        }
    }
    ch_names = ["F3", "F4", "F7", "F8", "Cz"]
    out = asymmetry.compute(features_spectral, ch_names)
    assert out["frontal_alpha_F3_F4"] == pytest.approx(log(8.0) - log(2.0))
    assert out["frontal_alpha_F7_F8"] == pytest.approx(log(6.0) - log(1.5))
    assert out["frontal_alpha_F3_F4"] > 0
    assert out["frontal_alpha_F7_F8"] > 0


def test_asymmetry_missing_channels_returns_none():
    from deepsynaps_qeeg.features import asymmetry

    features_spectral = {
        "bands": {
            "alpha": {"absolute_uv2": {"Fz": 4.0}}
        }
    }
    out = asymmetry.compute(features_spectral, ["Fz", "Cz"])
    assert out["frontal_alpha_F3_F4"] is None
    assert out["frontal_alpha_F7_F8"] is None


def test_asymmetry_with_synthetic_raw(asymmetric_raw):
    pytest.importorskip("mne")
    import mne

    from deepsynaps_qeeg import FREQ_BANDS
    from deepsynaps_qeeg.features import asymmetry, spectral

    events = mne.make_fixed_length_events(asymmetric_raw, start=2.0, stop=58.0, duration=1.0)
    epochs = mne.Epochs(asymmetric_raw, events=events, tmin=0.0, tmax=2.0,
                        baseline=None, preload=True, verbose="WARNING")
    spec = spectral.compute(epochs, FREQ_BANDS)
    out = asymmetry.compute(spec, list(epochs.ch_names))
    assert out["frontal_alpha_F3_F4"] is not None
    assert out["frontal_alpha_F3_F4"] > 0  # F4 > F3 alpha
