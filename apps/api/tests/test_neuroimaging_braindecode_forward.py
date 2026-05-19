"""Phase 2c: braindecode forward-pass smoke test.

Skipped automatically when braindecode/torch are not installed.
"""
from __future__ import annotations

import pytest

_braindecode = pytest.importorskip("braindecode")

from app.services.neuroimaging.braindecode_models import build_eegnet, forward_pass


def test_forward_pass_output_shape():
    summary = build_eegnet(n_channels=8, n_classes=4, input_window_samples=256)
    result = forward_pass(summary.model_dump(), input_shape=(1, 8, 256))
    assert result["output_shape"] == [1, 4]
    assert result["device"] == "cpu"
