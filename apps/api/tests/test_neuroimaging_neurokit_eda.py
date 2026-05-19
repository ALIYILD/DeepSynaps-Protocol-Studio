"""EDA processing: generate a synthetic signal with NeuroKit2, call process_eda,
assert physiologically plausible outputs.
"""
from __future__ import annotations

import math

import pytest

nk = pytest.importorskip("neurokit2")


def test_eda_features_plausible():
    from app.services.neuroimaging.neurokit_physio import process_eda

    signal = nk.eda_simulate(duration=10, sampling_rate=100, scr_number=3)
    result = process_eda(signal, sampling_rate=100)

    assert result.scr_count >= 1, f"expected at least 1 SCR, got {result.scr_count}"
    assert math.isfinite(result.mean_tonic_microsiemens), "tonic level is not finite"
    assert result.signal_length == len(signal)
