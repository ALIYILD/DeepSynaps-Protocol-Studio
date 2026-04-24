"""Tests for :mod:`deepsynaps_qeeg.artifacts`."""
from __future__ import annotations

import pytest

pytest.importorskip("mne")


def test_artifacts_produces_epochs(synthetic_raw):
    from deepsynaps_qeeg import artifacts, preprocess

    raw_clean, quality = preprocess.run(synthetic_raw, notch=None)
    epochs, quality = artifacts.run(raw_clean, quality=quality)

    assert len(epochs) > 0
    for key in (
        "n_epochs_total",
        "n_epochs_retained",
        "ica_components_dropped",
        "ica_labels_dropped",
    ):
        assert key in quality

    # 2 s epochs at 250 Hz → 500 samples (inclusive endpoint gives 501)
    assert epochs.get_data().shape[-1] in (500, 501)


def test_artifacts_iclabel_optional(synthetic_raw):
    """If mne-icalabel is missing, epochs should still be produced."""
    from deepsynaps_qeeg import artifacts, preprocess

    raw_clean, quality = preprocess.run(synthetic_raw, notch=None)
    epochs, quality = artifacts.run(raw_clean, quality=quality)
    assert epochs.get_data().ndim == 3
    assert isinstance(quality["ica_labels_dropped"], dict)
