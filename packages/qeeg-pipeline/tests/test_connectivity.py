"""Tests for :mod:`deepsynaps_qeeg.features.connectivity`."""
from __future__ import annotations

import pytest

pytest.importorskip("mne")


def _make_epochs(raw):
    import mne

    events = mne.make_fixed_length_events(raw, start=2.0, stop=58.0, duration=1.0)
    return mne.Epochs(raw, events=events, tmin=0.0, tmax=2.0, baseline=None,
                      preload=True, verbose="WARNING")


def test_connectivity_matrix_shape_and_symmetry(synthetic_raw):
    from deepsynaps_qeeg import FREQ_BANDS
    from deepsynaps_qeeg.features import connectivity

    epochs = _make_epochs(synthetic_raw)
    out = connectivity.compute(epochs, FREQ_BANDS)

    assert "channels" in out
    n = len(out["channels"])
    assert n == len(epochs.ch_names)

    for key in ("wpli", "coherence"):
        for band in FREQ_BANDS:
            m = out[key][band]
            assert len(m) == n
            for row in m:
                assert len(row) == n
            # symmetric + zero diagonal
            for i in range(n):
                assert m[i][i] == 0.0
                for j in range(i + 1, n):
                    assert abs(m[i][j] - m[j][i]) < 1e-9
