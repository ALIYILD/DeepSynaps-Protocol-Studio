"""Behavioral test: compute_connectome returns correct 3x3 correlation matrix."""
from __future__ import annotations

import numpy as np
import pytest

nilearn = pytest.importorskip("nilearn")


def test_compute_connectome_3x3():
    from app.services.neuroimaging.nilearn_io import compute_connectome

    rng = np.random.default_rng(42)
    ts = rng.standard_normal((50, 3)).tolist()

    result = compute_connectome(ts)

    assert result.n_regions == 3
    assert result.kind == "correlation"
    assert result.truncated is False
    assert result.matrix is not None
    assert len(result.matrix) == 3
    assert len(result.matrix[0]) == 3
    for i in range(3):
        assert abs(result.matrix[i][i] - 1.0) < 1e-6
