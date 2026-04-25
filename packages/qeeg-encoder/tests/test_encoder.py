"""End-to-end encoder forward-pass tests."""

from __future__ import annotations

import numpy as np

from qeeg_encoder.config import Settings
from qeeg_encoder.encoder import QEEGEncoder


def test_forward_shapes(settings: Settings, synthetic_eeg, channel_names):
    eeg, sfreq = synthetic_eeg
    enc = QEEGEncoder(settings)
    out = enc.forward(eeg, sfreq, channel_names, recording_id="rec-1", tenant_id="tenant-A")

    assert out.foundation_emb.shape == (settings.foundation.embedding_dim,)
    assert out.tabular_emb.shape == (settings.tabular.embedding_dim,)
    assert out.foundation_emb.dtype == np.float32
    assert out.tabular_emb.dtype == np.float32


def test_forward_provenance(settings: Settings, synthetic_eeg, channel_names):
    eeg, sfreq = synthetic_eeg
    enc = QEEGEncoder(settings)
    out = enc.forward(eeg, sfreq, channel_names, recording_id="rec-1", tenant_id="tenant-A")

    p = out.provenance
    assert p["recording_id"] == "rec-1"
    assert p["tenant_id"] == "tenant-A"
    assert p["backbone"] == "labram-base"
    assert p["foundation_dim"] == settings.foundation.embedding_dim
    assert p["tabular_dim"] == settings.tabular.embedding_dim
    assert p["n_channels"] == len(channel_names)
    assert p["sfreq"] == 256.0


def test_missing_channel_robust(settings: Settings, synthetic_eeg, channel_names):
    """Removing a coherence-pair channel must not crash; missing entries become zeros."""
    eeg, sfreq = synthetic_eeg
    # Drop F3 (used by frontal asymmetry and F3-F4 coherence)
    keep_idx = [i for i, n in enumerate(channel_names) if n != "F3"]
    eeg2 = eeg[keep_idx]
    names2 = [n for n in channel_names if n != "F3"]

    enc = QEEGEncoder(settings)
    out = enc.forward(eeg2, sfreq, names2, recording_id="rec-2", tenant_id="tenant-A")

    assert out.foundation_emb.shape == (settings.foundation.embedding_dim,)
    # Asymmetry should be 0.0 when one of the pair is absent
    assert out.canonical_features["frontal_alpha_asymmetry"] == 0.0


def test_channel_mismatch_raises(settings: Settings, synthetic_eeg, channel_names):
    eeg, sfreq = synthetic_eeg
    enc = QEEGEncoder(settings)
    import pytest

    with pytest.raises(ValueError, match="channel mismatch"):
        enc.forward(eeg, sfreq, channel_names[:-1], recording_id="x", tenant_id="t")


def test_bad_eeg_shape_raises(settings: Settings, channel_names):
    enc = QEEGEncoder(settings)
    bad = np.zeros((10,), dtype=np.float32)
    import pytest

    with pytest.raises(ValueError, match="channels, samples"):
        enc.forward(bad, 256.0, channel_names, recording_id="x", tenant_id="t")


def test_deterministic_tabular(settings: Settings, synthetic_eeg, channel_names):
    """Same input must produce identical tabular embedding (projection seeded)."""
    eeg, sfreq = synthetic_eeg
    enc1 = QEEGEncoder(settings)
    enc2 = QEEGEncoder(settings)
    a = enc1.forward(eeg, sfreq, channel_names, "r", "t")
    b = enc2.forward(eeg, sfreq, channel_names, "r", "t")
    np.testing.assert_array_equal(a.tabular_emb, b.tabular_emb)

