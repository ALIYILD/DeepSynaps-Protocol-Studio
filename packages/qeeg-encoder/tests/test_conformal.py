"""Tests for the MAPIE-style conformal wrapper."""

from __future__ import annotations

import numpy as np
import pytest

from qeeg_encoder.conformal.wrapper import ConformalWrapper


def test_invalid_alpha():
    with pytest.raises(ValueError):
        ConformalWrapper(alpha=0.0)
    with pytest.raises(ValueError):
        ConformalWrapper(alpha=1.0)


def test_regression_coverage():
    rng = np.random.default_rng(0)
    y_true = rng.normal(size=2000)
    y_pred = y_true + rng.normal(scale=0.5, size=2000)
    cal_idx = np.arange(0, 1000)
    test_idx = np.arange(1000, 2000)

    cw = ConformalWrapper(alpha=0.10)
    cw.calibrate_regression(y_true[cal_idx], y_pred[cal_idx])

    inside = 0
    for i in test_idx:
        out = cw.predict_regression(float(y_pred[i]))
        if out.lower <= y_true[i] <= out.upper:
            inside += 1
    cov = inside / len(test_idx)
    # Should be near 90% with healthy slack
    assert 0.85 <= cov <= 0.95


def test_classification_set():
    rng = np.random.default_rng(0)
    n, k = 1000, 3
    scores = rng.dirichlet(np.ones(k), size=n).astype(np.float32)
    y = scores.argmax(axis=1)

    cw = ConformalWrapper(alpha=0.10)
    cw.calibrate_classification(scores, y)

    sample = scores[0]
    out = cw.predict_classification(sample, ["a", "b", "c"])
    assert out.top_label in {"a", "b", "c"}
    assert len(out.label_set) >= 1
    assert set(out.label_set).issubset({"a", "b", "c"})


def test_uncalibrated_raises():
    cw = ConformalWrapper(alpha=0.10)
    with pytest.raises(RuntimeError):
        cw.predict_regression(0.0)
    with pytest.raises(RuntimeError):
        cw.predict_classification(np.array([0.5, 0.5]), ["a", "b"])

