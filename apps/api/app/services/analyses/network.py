"""Network analyses — small-world index, graph theoretic indices.

Registered analyses:
  network/small_world_index
  network/graph_theoretic_indices
"""
from __future__ import annotations

import itertools
from typing import Any

import numpy as np
from scipy.signal import csd, welch

from app.services.analyses._engine import register_analysis


def _build_adjacency_matrix(
    data: np.ndarray,
    sfreq: float,
    fmin: float,
    fmax: float,
    threshold: float = 0.3,
) -> np.ndarray:
    """Build binary adjacency matrix from coherence (thresholded)."""
    n_ch = data.shape[0]
    nperseg = int(2.0 * sfreq)
    if nperseg > data.shape[1]:
        nperseg = data.shape[1]

    coh_matrix = np.zeros((n_ch, n_ch))

    for i, j in itertools.combinations(range(n_ch), 2):
        freqs_xy, pxy = csd(data[i], data[j], fs=sfreq, nperseg=nperseg)
        _, pxx = welch(data[i], fs=sfreq, nperseg=nperseg)
        _, pyy = welch(data[j], fs=sfreq, nperseg=nperseg)

        denom = pxx * pyy
        denom[denom == 0] = 1e-30
        coh = np.abs(pxy) ** 2 / denom

        band_mask = (freqs_xy >= fmin) & (freqs_xy <= fmax)
        mean_coh = float(np.mean(coh[band_mask])) if np.any(band_mask) else 0.0
        coh_matrix[i, j] = mean_coh
        coh_matrix[j, i] = mean_coh

    # Threshold to binary
    adj = (coh_matrix >= threshold).astype(float)
    np.fill_diagonal(adj, 0)
    return adj


def _clustering_coefficient(adj: np.ndarray) -> np.ndarray:
    """Compute clustering coefficient per node."""
    n = adj.shape[0]
    cc = np.zeros(n)
    for i in range(n):
        neighbors = np.where(adj[i] > 0)[0]
        k = len(neighbors)
        if k < 2:
            cc[i] = 0.0
            continue
        # Count edges between neighbors
        subgraph = adj[np.ix_(neighbors, neighbors)]
        edges = np.sum(subgraph) / 2
        cc[i] = 2 * edges / (k * (k - 1))
    return cc


def _characteristic_path_length(adj: np.ndarray) -> float:
    """Compute characteristic path length using BFS."""
    n = adj.shape[0]
    total_dist = 0
    reachable_pairs = 0

    for source in range(n):
        # BFS from source
        visited = np.zeros(n, dtype=bool)
        visited[source] = True
        queue = [source]
        dist = np.full(n, np.inf)
        dist[source] = 0

        while queue:
            node = queue.pop(0)
            neighbors = np.where(adj[node] > 0)[0]
            for nb in neighbors:
                if not visited[nb]:
                    visited[nb] = True
                    dist[nb] = dist[node] + 1
                    queue.append(nb)

        for target in range(n):
            if target != source and np.isfinite(dist[target]):
                total_dist += dist[target]
                reachable_pairs += 1

    return total_dist / reachable_pairs if reachable_pairs > 0 else float("inf")


def _betweenness_centrality(adj: np.ndarray) -> np.ndarray:
    """Compute betweenness centrality per node (simplified BFS-based)."""
    n = adj.shape[0]
    bc = np.zeros(n)

    for s in range(n):
        # BFS from s
        stack = []
        pred: list[list[int]] = [[] for _ in range(n)]
        sigma = np.zeros(n)
        sigma[s] = 1.0
        d = np.full(n, -1)
        d[s] = 0
        queue = [s]

        while queue:
            v = queue.pop(0)
            stack.append(v)
            neighbors = np.where(adj[v] > 0)[0]
            for w in neighbors:
                if d[w] < 0:
                    queue.append(w)
                    d[w] = d[v] + 1
                if d[w] == d[v] + 1:
                    sigma[w] += sigma[v]
                    pred[w].append(v)

        delta = np.zeros(n)
        while stack:
            w = stack.pop()
            for v in pred[w]:
                if sigma[w] > 0:
                    delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w])
            if w != s:
                bc[w] += delta[w]

    # Normalize
    norm = (n - 1) * (n - 2)
    if norm > 0:
        bc = bc / norm

    return bc


# ── 19. Small-World Index ────────────────────────────────────────────────────

@register_analysis("network", "small_world_index", "Small-World Index")
def small_world_index(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute small-world index from coherence-based network.

    Small-worldness = (C/C_rand) / (L/L_rand) where:
    - C = clustering coefficient, L = path length
    - C_rand, L_rand = expected values for random graph with same density

    SW > 1 indicates small-world topology (typical of healthy brains).
    """
    data = ctx["data"]
    sfreq = ctx["sfreq"]
    ch_names = ctx["ch_names"]
    n_ch = min(len(ch_names), 19)

    # Build adjacency from alpha-band coherence
    adj = _build_adjacency_matrix(data[:n_ch], sfreq, 8.0, 12.0, threshold=0.3)

    # Compute graph metrics
    cc = _clustering_coefficient(adj)
    mean_cc = float(np.mean(cc))
    cpl = _characteristic_path_length(adj)

    # Random graph expected values (Erdos-Renyi)
    density = np.sum(adj) / (n_ch * (n_ch - 1)) if n_ch > 1 else 0
    cc_rand = density  # Expected clustering for random graph
    # Expected path length for random graph: ln(N) / ln(k) where k = density * (N-1)
    k = density * (n_ch - 1) if n_ch > 1 else 1
    cpl_rand = np.log(n_ch) / np.log(max(k, 1.01)) if n_ch > 1 else 1.0

    # Small-world index
    gamma = mean_cc / cc_rand if cc_rand > 0 else 0
    lam = cpl / cpl_rand if cpl_rand > 0 and np.isfinite(cpl) else float("inf")
    sw = gamma / lam if lam > 0 and np.isfinite(lam) else 0.0

    return {
        "data": {
            "clustering_coefficient": round(mean_cc, 4),
            "path_length": round(cpl, 4) if np.isfinite(cpl) else None,
            "cc_random": round(cc_rand, 4),
            "cpl_random": round(cpl_rand, 4),
            "gamma": round(gamma, 4),
            "lambda": round(lam, 4) if np.isfinite(lam) else None,
            "small_world_index": round(sw, 4),
            "density": round(density, 4),
            "is_small_world": sw > 1.0,
        },
        "summary": f"Small-world index: {round(sw, 2)} ({'small-world' if sw > 1 else 'not small-world'})",
    }


# ── 20. Graph Theoretic Indices ──────────────────────────────────────────────

@register_analysis("network", "graph_theoretic_indices", "Graph Theoretic Indices")
def graph_theoretic_indices(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute comprehensive graph metrics: clustering coefficient,
    characteristic path length, betweenness centrality, degree distribution,
    and network efficiency per channel.
    """
    data = ctx["data"]
    sfreq = ctx["sfreq"]
    ch_names = ctx["ch_names"]
    n_ch = min(len(ch_names), 19)
    used_channels = ch_names[:n_ch]

    adj = _build_adjacency_matrix(data[:n_ch], sfreq, 8.0, 12.0, threshold=0.3)

    # Per-node metrics
    cc = _clustering_coefficient(adj)
    bc = _betweenness_centrality(adj)
    degree = np.sum(adj, axis=1)

    # Global metrics
    mean_cc = float(np.mean(cc))
    cpl = _characteristic_path_length(adj)
    mean_bc = float(np.mean(bc))
    mean_degree = float(np.mean(degree))
    density = float(np.sum(adj)) / (n_ch * (n_ch - 1)) if n_ch > 1 else 0

    # Global efficiency (inverse of path length)
    efficiency = 1.0 / cpl if np.isfinite(cpl) and cpl > 0 else 0.0

    # Per-channel results
    channel_metrics: dict[str, Any] = {}
    for i, ch in enumerate(used_channels):
        channel_metrics[ch] = {
            "clustering_coefficient": round(float(cc[i]), 4),
            "betweenness_centrality": round(float(bc[i]), 4),
            "degree": int(degree[i]),
            "is_hub": float(bc[i]) > mean_bc * 1.5,
        }

    # Identify hubs (nodes with high betweenness)
    hubs = [ch for ch, m in channel_metrics.items() if m["is_hub"]]

    return {
        "data": {
            "channels": channel_metrics,
            "global": {
                "mean_clustering": round(mean_cc, 4),
                "path_length": round(cpl, 4) if np.isfinite(cpl) else None,
                "mean_betweenness": round(mean_bc, 4),
                "mean_degree": round(mean_degree, 2),
                "density": round(density, 4),
                "global_efficiency": round(efficiency, 4),
            },
            "hubs": hubs,
        },
        "summary": f"Network: density={round(density, 2)}, efficiency={round(efficiency, 2)}, hubs={hubs}",
    }
