"""Tests for the night-shift fallback bad-channel detector in preprocess.py.

These exercise :func:`deepsynaps_qeeg.preprocess._detect_bad_channels_correlation_deviation`
directly with a synthetic Raw so we don't depend on PyPREP being installed.
"""
from __future__ import annotations

import pytest

pytest.importorskip("mne")
pytest.importorskip("numpy")


def _make_raw_with_bad_channel():
    """Return a 19-channel synthetic Raw where one channel has 50x the std."""
    import mne
    import numpy as np

    ch_names = [
        "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
        "T7", "C3", "Cz", "C4", "T8",
        "P7", "P3", "Pz", "P4", "P8",
        "O1", "O2",
    ]
    sfreq = 250.0
    rng = np.random.default_rng(2026)
    n_samp = 5000
    data = rng.standard_normal((len(ch_names), n_samp)) * 1e-6
    # Inject a known-bad channel: huge std + uncorrelated noise
    bad_idx = ch_names.index("T8")
    data[bad_idx] = rng.standard_normal(n_samp) * 50e-6
    info = mne.create_info(ch_names, sfreq=sfreq, ch_types="eeg")
    raw = mne.io.RawArray(data, info, verbose="WARNING")
    montage = mne.channels.make_standard_montage("standard_1020")
    raw.set_montage(montage, on_missing="ignore")
    return raw, "T8"


def test_fallback_bad_channel_detector_flags_extreme_std() -> None:
    from deepsynaps_qeeg.preprocess import _detect_bad_channels_correlation_deviation

    raw, expected_bad = _make_raw_with_bad_channel()
    bads = _detect_bad_channels_correlation_deviation(raw)
    assert expected_bad in bads, (
        f"expected {expected_bad} in flagged channels, got {bads}"
    )


def test_quality_flag_set_when_pyprep_unavailable(monkeypatch) -> None:
    """If PyPREP is unavailable the quality dict must mark the fallback path."""
    from deepsynaps_qeeg import preprocess

    raw, _ = _make_raw_with_bad_channel()
    # Force the fallback path even if pyprep is installed by stubbing the
    # internal robust-ref function.
    def _force_fallback(_raw):
        return preprocess._fallback_average_ref(_raw)

    monkeypatch.setattr(preprocess, "_robust_average_reference", _force_fallback)

    cleaned, quality = preprocess.run(raw, bandpass=(1.0, 45.0), notch=None, resample=250.0)
    assert quality["prep_used"] is False
    assert quality["bad_channel_detector"] == "correlation_deviation_fallback"
    assert isinstance(quality["bad_channels"], list)
