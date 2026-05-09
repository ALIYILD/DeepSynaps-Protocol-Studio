"""Tests for app.services.analyses.network — small-world index + graph metrics.

All functions are pure (numpy/scipy). Tests pin structure, value ranges,
and the clinical-classification logic for hub detection.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.analyses.network import (
    _betweenness_centrality,
    _characteristic_path_length,
    _clustering_coefficient,
    graph_theoretic_indices,
    small_world_index,
)

RNG = np.random.default_rng(99)
SFREQ = 256.0
CH_NAMES = ["Fp1", "Fp2", "F3", "F4", "C3", "C4", "P3", "P4"]
N_CH = len(CH_NAMES)


def _make_ctx(seconds: float = 10.0) -> dict:
    data = RNG.standard_normal((N_CH, int(seconds * SFREQ)))
    return {"data": data, "ch_names": CH_NAMES, "sfreq": SFREQ}


# ---------------------------------------------------------------------------
# _clustering_coefficient
# ---------------------------------------------------------------------------

def test_clustering_coefficient_triangle():
    """Complete triangle: all CC should be 1."""
    adj = np.array([[0, 1, 1], [1, 0, 1], [1, 1, 0]], dtype=float)
    cc = _clustering_coefficient(adj)
    np.testing.assert_array_almost_equal(cc, [1.0, 1.0, 1.0])


def test_clustering_coefficient_isolated_node_zero():
    adj = np.array([[0, 0, 0], [0, 0, 1], [0, 1, 0]], dtype=float)
    cc = _clustering_coefficient(adj)
    assert cc[0] == 0.0  # node 0 is isolated


def test_clustering_coefficient_shape():
    adj = RNG.choice([0, 1], size=(5, 5)).astype(float)
    np.fill_diagonal(adj, 0)
    adj = np.triu(adj) + np.triu(adj).T
    cc = _clustering_coefficient(adj)
    assert cc.shape == (5,)


# ---------------------------------------------------------------------------
# _characteristic_path_length
# ---------------------------------------------------------------------------

def test_cpl_complete_graph():
    """Complete graph of 4 nodes: all paths are 1 hop."""
    adj = np.ones((4, 4)) - np.eye(4)
    cpl = _characteristic_path_length(adj)
    assert abs(cpl - 1.0) < 1e-9


def test_cpl_disconnected_graph_finite_or_inf():
    """Disconnected graph: returns inf (no reachable pairs) or some finite value."""
    adj = np.zeros((4, 4))
    cpl = _characteristic_path_length(adj)
    # Either inf (no reachable pairs) or a value — must not crash
    assert cpl >= 0 or np.isinf(cpl)


def test_cpl_chain_graph():
    """Chain 0-1-2-3: distances are 1,2,3 from 0; CPL should be reasonable."""
    adj = np.zeros((4, 4))
    for i in range(3):
        adj[i, i + 1] = 1
        adj[i + 1, i] = 1
    cpl = _characteristic_path_length(adj)
    assert np.isfinite(cpl)
    assert cpl > 1.0


# ---------------------------------------------------------------------------
# _betweenness_centrality
# ---------------------------------------------------------------------------

def test_betweenness_centrality_star_graph():
    """Star graph: hub should have high BC."""
    n = 5
    adj = np.zeros((n, n))
    # Node 0 is hub connected to all others
    for i in range(1, n):
        adj[0, i] = 1
        adj[i, 0] = 1
    bc = _betweenness_centrality(adj)
    # Hub (node 0) should have the highest BC
    assert bc[0] == max(bc)


def test_betweenness_centrality_shape():
    adj = np.ones((4, 4)) - np.eye(4)
    bc = _betweenness_centrality(adj)
    assert bc.shape == (4,)


def test_betweenness_centrality_values_0_to_1():
    adj = np.ones((4, 4)) - np.eye(4)
    bc = _betweenness_centrality(adj)
    assert np.all(bc >= 0)
    assert np.all(bc <= 1.0 + 1e-9)


# ---------------------------------------------------------------------------
# small_world_index
# ---------------------------------------------------------------------------

def test_small_world_index_top_level_keys():
    ctx = _make_ctx()
    result = small_world_index(ctx)
    assert "data" in result
    assert "summary" in result
    data = result["data"]
    for k in ("clustering_coefficient", "density", "is_small_world", "small_world_index"):
        assert k in data


def test_small_world_index_density_in_range():
    ctx = _make_ctx()
    result = small_world_index(ctx)
    assert 0.0 <= result["data"]["density"] <= 1.0


def test_small_world_index_is_small_world_bool():
    ctx = _make_ctx()
    result = small_world_index(ctx)
    assert isinstance(result["data"]["is_small_world"], bool)


def test_small_world_index_summary_format():
    ctx = _make_ctx()
    result = small_world_index(ctx)
    assert "Small-world index:" in result["summary"]


# ---------------------------------------------------------------------------
# graph_theoretic_indices
# ---------------------------------------------------------------------------

def test_graph_theoretic_indices_keys():
    ctx = _make_ctx()
    result = graph_theoretic_indices(ctx)
    assert "data" in result
    assert "channels" in result["data"]
    assert "global" in result["data"]
    assert "hubs" in result["data"]


def test_graph_theoretic_indices_global_metrics():
    ctx = _make_ctx()
    result = graph_theoretic_indices(ctx)
    g = result["data"]["global"]
    for k in ("mean_clustering", "mean_betweenness", "mean_degree", "density", "global_efficiency"):
        assert k in g


def test_graph_theoretic_indices_per_channel_has_degree():
    ctx = _make_ctx()
    result = graph_theoretic_indices(ctx)
    for ch_data in result["data"]["channels"].values():
        assert "degree" in ch_data
        assert isinstance(ch_data["degree"], int)
        assert "is_hub" in ch_data


def test_graph_theoretic_indices_hubs_is_list():
    ctx = _make_ctx()
    result = graph_theoretic_indices(ctx)
    assert isinstance(result["data"]["hubs"], list)


def test_graph_theoretic_indices_summary_format():
    ctx = _make_ctx()
    result = graph_theoretic_indices(ctx)
    assert "density=" in result["summary"]
    assert "efficiency=" in result["summary"]
