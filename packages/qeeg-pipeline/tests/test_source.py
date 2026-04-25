"""Tests for source localization helpers."""

from __future__ import annotations

import pytest

pytest.importorskip("mne")
pytest.importorskip("pandas")


def _make_epochs(raw):
    import mne

    # Keep it small but stable for tests.
    return mne.make_fixed_length_epochs(raw, duration=2.0, preload=True, verbose="WARNING")


def test_forward_builds_for_fsaverage(synthetic_raw):
    from deepsynaps_qeeg.source.forward import build_forward_model

    fwd = build_forward_model(synthetic_raw, subject="fsaverage")
    assert int(fwd["nsource"]) > 0
    assert fwd["sol"]["data"].shape[0] == len(synthetic_raw.ch_names)


def test_inverse_methods(synthetic_raw):
    import numpy as np

    from deepsynaps_qeeg.source.forward import build_forward_model
    from deepsynaps_qeeg.source.inverse import apply_inverse, compute_inverse_operator
    from deepsynaps_qeeg.source.noise import estimate_noise_covariance

    epochs = _make_epochs(synthetic_raw)
    fwd = build_forward_model(synthetic_raw, subject="fsaverage")
    cov = estimate_noise_covariance(epochs=epochs)
    inv = compute_inverse_operator(synthetic_raw, fwd, cov)

    evoked = epochs.average()
    stcs = {}
    for method in ("eLORETA", "sLORETA", "dSPM", "MNE"):
        stc = apply_inverse(evoked, inv, method=method)
        stcs[method] = stc

    ref = stcs["eLORETA"]
    for method, stc in stcs.items():
        assert len(stc.vertices) == len(ref.vertices)
        for v_a, v_b in zip(stc.vertices, ref.vertices):
            assert np.array_equal(np.asarray(v_a), np.asarray(v_b))
        assert np.asarray(stc.data).shape == np.asarray(ref.data).shape


def test_roi_extraction_returns_dataframe(synthetic_raw):
    import numpy as np

    from deepsynaps_qeeg import FREQ_BANDS
    from deepsynaps_qeeg.source.forward import build_forward_model
    from deepsynaps_qeeg.source.inverse import apply_inverse, compute_inverse_operator
    from deepsynaps_qeeg.source.noise import estimate_noise_covariance
    from deepsynaps_qeeg.source.roi import extract_roi_band_power

    epochs = _make_epochs(synthetic_raw)
    fwd = build_forward_model(synthetic_raw, subject="fsaverage")
    cov = estimate_noise_covariance(epochs=epochs)
    inv = compute_inverse_operator(synthetic_raw, fwd, cov)

    # Build per-band power STCs (single time point) derived from patient data.
    source_estimates = {}
    for band, (lo, hi) in FREQ_BANDS.items():
        band_epochs = epochs.copy().filter(
            l_freq=float(lo),
            h_freq=float(hi),
            phase="zero",
            fir_design="firwin",
            verbose="WARNING",
        )
        evoked = band_epochs.average()
        stc = apply_inverse(evoked, inv, method="eLORETA")
        power = np.mean(np.asarray(stc.data) ** 2, axis=1)
        power_stc = stc.copy()
        power_stc._data = power[:, np.newaxis]
        power_stc.tmin = 0.0
        power_stc.tstep = 1.0
        source_estimates[band] = power_stc

    df = extract_roi_band_power(source_estimates, subject="fsaverage")
    assert df.shape == (68, 5)

