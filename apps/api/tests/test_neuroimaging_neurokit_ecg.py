"""ECG processing: generate a synthetic signal with NeuroKit2, call process_ecg,
assert physiologically plausible outputs.
"""
from __future__ import annotations

import pytest

nk = pytest.importorskip("neurokit2")


def test_ecg_features_in_range():
    from app.services.neuroimaging.neurokit_physio import process_ecg

    signal = nk.ecg_simulate(duration=10, sampling_rate=250)
    result = process_ecg(signal, sampling_rate=250)

    assert 50 <= result.mean_hr_bpm <= 120, f"mean HR out of range: {result.mean_hr_bpm}"
    assert result.rpeak_count > 5, f"too few R-peaks: {result.rpeak_count}"
    assert result.signal_length == len(signal)
    assert isinstance(result.hrv_sdnn_ms, float)


def test_ecg_signal_too_short():
    from app.errors import ApiServiceError
    from app.services.neuroimaging.neurokit_physio import process_ecg

    signal = nk.ecg_simulate(duration=2, sampling_rate=250)  # only 2 s
    with pytest.raises(ApiServiceError) as exc_info:
        process_ecg(signal, sampling_rate=250)
    assert exc_info.value.code == "signal_too_short"
    assert exc_info.value.status_code == 400
