"""RSP processing: generate a synthetic signal with NeuroKit2, call process_rsp,
assert physiologically plausible outputs.
"""
from __future__ import annotations

import pytest

nk = pytest.importorskip("neurokit2")


def test_rsp_features_in_range():
    from app.services.neuroimaging.neurokit_physio import process_rsp

    signal = nk.rsp_simulate(duration=30, sampling_rate=50, respiratory_rate=15)
    result = process_rsp(signal, sampling_rate=50)

    assert 10 <= result.mean_rate_bpm <= 25, f"mean rate out of range: {result.mean_rate_bpm}"
    assert result.signal_length == len(signal)
    assert isinstance(result.rrv_sdbb_ms, float)
