"""Phase 2c: braindecode model-build smoke test.

Skipped automatically when braindecode/torch are not installed.
"""
from __future__ import annotations

import pytest

_braindecode = pytest.importorskip("braindecode")

from app.services.neuroimaging.braindecode_models import build_eegnet


def test_build_eegnet_returns_summary():
    summary = build_eegnet(n_channels=8, n_classes=4, input_window_samples=256)
    assert summary.param_count > 0
    assert summary.layer_count > 0
    assert summary.model_name != ""
    assert summary.n_channels == 8
    assert summary.n_classes == 4
    assert summary.input_window_samples == 256
