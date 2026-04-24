"""Tests for :mod:`deepsynaps_qeeg.features.spectral`."""
from __future__ import annotations

import pytest

pytest.importorskip("mne")


def _make_epochs(raw):
    import mne

    events = mne.make_fixed_length_events(raw, start=2.0, stop=58.0, duration=1.0)
    return mne.Epochs(raw, events=events, tmin=0.0, tmax=2.0, baseline=None,
                      preload=True, verbose="WARNING")


def test_spectral_shape_and_alpha_peak(synthetic_raw):
    from deepsynaps_qeeg import FREQ_BANDS
    from deepsynaps_qeeg.features import spectral

    epochs = _make_epochs(synthetic_raw)
    out = spectral.compute(epochs, FREQ_BANDS)

    assert set(out["bands"].keys()) == set(FREQ_BANDS.keys())
    for band in FREQ_BANDS:
        abs_ = out["bands"][band]["absolute_uv2"]
        rel = out["bands"][band]["relative"]
        assert set(abs_.keys()) == set(epochs.ch_names)
        assert set(rel.keys()) == set(epochs.ch_names)

    # All bands should be positive for our synthetic signal
    alpha_mean = sum(out["bands"]["alpha"]["absolute_uv2"].values())
    beta_mean = sum(out["bands"]["beta"]["absolute_uv2"].values())
    assert alpha_mean > 0
    # 10 Hz bump should make alpha band exceed the adjacent beta band
    assert alpha_mean > beta_mean

    # Peak alpha frequency (where available) should cluster near 10 Hz.
    paf_values = [v for v in out["peak_alpha_freq"].values() if v is not None]
    if paf_values:
        import statistics

        median_paf = statistics.median(paf_values)
        assert 8.0 <= median_paf <= 12.0
