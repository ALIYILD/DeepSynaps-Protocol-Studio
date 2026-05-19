"""Phase 3 BrainSpace connectome-gradient tests.

BrainSpace is BSD-3 and in the base deps, so this test should always
discover the module. If it isn't installed the import skip kicks in.
"""
from __future__ import annotations

import math

import pytest

pytest.importorskip("brainspace")


def _symmetric_matrix(n: int) -> list[list[float]]:
    """Build a small symmetric, positive matrix for testing."""
    rows: list[list[float]] = []
    for i in range(n):
        row: list[float] = []
        for j in range(n):
            row.append(1.0 / (1.0 + abs(i - j)))
        rows.append(row)
    return rows


def test_compute_gradients_returns_summary():
    from app.services.neuroimaging.brainspace_grad import compute_gradients
    from app.services.neuroimaging.schemas import GradientSummary

    matrix = _symmetric_matrix(10)
    summary = compute_gradients(matrix, n_components=3)

    assert isinstance(summary, GradientSummary)
    assert summary.n_components == 3
    assert summary.n_regions == 10
    assert len(summary.explained_variance) == 3
    for v in summary.explained_variance:
        assert not math.isnan(v)
        assert v >= 0.0


def test_compute_gradients_default_n_components_is_three():
    from app.services.neuroimaging.brainspace_grad import compute_gradients

    matrix = _symmetric_matrix(8)
    summary = compute_gradients(matrix)
    assert summary.n_components == 3
    assert summary.n_regions == 8


def test_has_brainspace_is_bool():
    from app.services.neuroimaging.brainspace_grad import HAS_BRAINSPACE

    assert isinstance(HAS_BRAINSPACE, bool)
