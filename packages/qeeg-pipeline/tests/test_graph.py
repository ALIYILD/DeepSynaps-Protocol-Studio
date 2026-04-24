"""Tests for :mod:`deepsynaps_qeeg.features.graph`."""
from __future__ import annotations

import math

import pytest

pytest.importorskip("networkx")


def _small_matrix(n: int = 8) -> list[list[float]]:
    import numpy as np

    rng = np.random.default_rng(7)
    m = np.abs(rng.standard_normal((n, n)))
    m = 0.5 * (m + m.T)
    np.fill_diagonal(m, 0.0)
    return m.tolist()


def test_graph_metrics_exist_and_finite():
    from deepsynaps_qeeg import FREQ_BANDS
    from deepsynaps_qeeg.features import graph

    connectivity = {
        "wpli": {band: _small_matrix(10) for band in FREQ_BANDS},
        "coherence": {band: _small_matrix(10) for band in FREQ_BANDS},
        "channels": [f"ch{i}" for i in range(10)],
    }
    out = graph.compute(connectivity)
    assert set(out.keys()) == set(FREQ_BANDS)
    for band, metrics in out.items():
        for key in ("clustering_coef", "char_path_length", "small_worldness"):
            assert key in metrics
        # clustering + path length should be finite for a dense random graph
        assert math.isfinite(metrics["clustering_coef"])
        assert math.isfinite(metrics["char_path_length"])
