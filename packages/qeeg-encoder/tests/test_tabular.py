"""Tests for tabular feature extraction and projection."""

from __future__ import annotations

import numpy as np

from qeeg_encoder.tabular.features import BANDS, extract_features
from qeeg_encoder.tabular.projector import TabularProjector


def test_extract_features_shapes(synthetic_eeg, channel_names):
    eeg, sfreq = synthetic_eeg
    feats = extract_features(eeg, sfreq=sfreq, channel_names=channel_names)
    n_chans = len(channel_names)
    for band in BANDS:
        assert feats.band_powers[band].shape == (n_chans,)
        assert feats.relative_powers[band].shape == (n_chans,)
        # Relative powers are bounded
        assert (feats.relative_powers[band] >= 0).all()
        assert (feats.relative_powers[band] <= 1).all()


def test_alpha_dominance(synthetic_eeg, channel_names):
    """Synthetic signal has strong 10Hz alpha — alpha relative power should be largest."""
    eeg, sfreq = synthetic_eeg
    feats = extract_features(eeg, sfreq=sfreq, channel_names=channel_names)
    means = {band: float(np.mean(feats.relative_powers[band])) for band in BANDS}
    assert means["alpha"] > means["delta"]
    assert means["alpha"] > means["beta"]


def test_to_vector_stable(channel_names, synthetic_eeg):
    eeg, sfreq = synthetic_eeg
    feats = extract_features(eeg, sfreq=sfreq, channel_names=channel_names)
    v1 = feats.to_vector(channel_names)
    v2 = feats.to_vector(channel_names)
    np.testing.assert_array_equal(v1, v2)
    assert v1.dtype == np.float32


def test_projector_dim():
    p = TabularProjector(embedding_dim=128)
    x = np.random.default_rng(0).normal(size=300).astype(np.float32)
    y = p.transform(x)
    assert y.shape == (128,)
    assert y.dtype == np.float32


def test_projector_deterministic():
    p1 = TabularProjector(embedding_dim=128, seed=1729)
    p2 = TabularProjector(embedding_dim=128, seed=1729)
    x = np.ones(200, dtype=np.float32)
    np.testing.assert_array_equal(p1.transform(x), p2.transform(x))


def test_projector_different_seed():
    p1 = TabularProjector(embedding_dim=128, seed=1)
    p2 = TabularProjector(embedding_dim=128, seed=2)
    x = np.ones(200, dtype=np.float32)
    assert not np.array_equal(p1.transform(x), p2.transform(x))

