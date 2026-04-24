"""Tests for :mod:`deepsynaps_qeeg.preprocess`."""
from __future__ import annotations

import pytest

pytest.importorskip("mne")


def test_preprocess_resamples_to_250(synthetic_raw):
    from deepsynaps_qeeg import preprocess

    # start at 500 Hz so the resample path is actually exercised
    raw = synthetic_raw.copy().resample(500, verbose="WARNING")
    cleaned, quality = preprocess.run(raw, bandpass=(1.0, 45.0), notch=None, resample=250.0)

    assert abs(cleaned.info["sfreq"] - 250.0) < 1e-6
    assert quality["sfreq_output"] == pytest.approx(250.0)
    assert quality["sfreq_input"] == pytest.approx(500.0)
    assert quality["bandpass"] == [1.0, 45.0]
    assert "bad_channels" in quality
    assert isinstance(quality["bad_channels"], list)


def test_preprocess_notch_honoured(synthetic_raw):
    from deepsynaps_qeeg import preprocess

    cleaned, quality = preprocess.run(
        synthetic_raw, bandpass=(1.0, 45.0), notch=50.0, resample=250.0
    )
    assert quality["notch_hz"] == 50.0
    # Should still have 19 channels
    assert len(cleaned.ch_names) == 19
