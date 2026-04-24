"""Graph-theoretic metrics on the wPLI matrices.

Thresholds each band's wPLI matrix to keep only the top 20 % of edges, then
computes clustering coefficient, characteristic path length (on the largest
connected component), and small-worldness relative to 10 random graphs with
the same degree sequence.

Output::

    {
      "<band>": {
        "clustering_coef":   float,
        "char_path_length":  float,
        "small_worldness":   float,
      }, ...
    }
"""
from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np

log = logging.getLogger(__name__)

TOP_EDGE_FRACTION = 0.20
N_RANDOM_GRAPHS = 10
RANDOM_SEED = 42


def compute(connectivity: dict[str, Any]) -> dict[str, dict[str, float]]:
    """Compute per-band graph metrics from the wPLI connectivity output.

    Parameters
    ----------
    connectivity : dict
        Output of :func:`deepsynaps_qeeg.features.connectivity.compute`.
        Must contain ``connectivity['wpli'][band]`` as an NxN list-of-lists.

    Returns
    -------
    dict[str, dict[str, float]]
        Band → metric dict. Missing / disconnected bands map to a dict with
        NaN values (still serialisable) rather than crashing.
    """
    try:
        import networkx as nx
    except Exception as exc:  # pragma: no cover
        log.warning("networkx unavailable (%s). Returning empty graph metrics.", exc)
        return {}

    wpli = connectivity.get("wpli") or {}
    out: dict[str, dict[str, float]] = {}
    for band, matrix in wpli.items():
        arr = np.asarray(matrix, dtype=float)
        if arr.ndim != 2 or arr.shape[0] != arr.shape[1] or arr.shape[0] < 3:
            out[band] = _nan_metrics()
            continue
        out[band] = _metrics_for_band(arr, nx)
    return out


def _metrics_for_band(matrix: np.ndarray, nx_mod: Any) -> dict[str, float]:
    thresholded = _threshold_top_fraction(matrix, TOP_EDGE_FRACTION)
    G = nx_mod.from_numpy_array(thresholded)

    # Clustering
    try:
        clustering = float(nx_mod.average_clustering(G, weight="weight"))
    except Exception as exc:
        log.warning("average_clustering failed (%s).", exc)
        clustering = float("nan")

    # Characteristic path length on largest connected component
    cpl = _char_path_length(G, nx_mod)

    # Small-worldness
    sw = _small_worldness(G, nx_mod, clustering, cpl)

    return {
        "clustering_coef": _safe(clustering),
        "char_path_length": _safe(cpl),
        "small_worldness": _safe(sw),
    }


def _threshold_top_fraction(matrix: np.ndarray, fraction: float) -> np.ndarray:
    """Keep only the top ``fraction`` of off-diagonal edges (by magnitude)."""
    n = matrix.shape[0]
    abs_m = np.abs(matrix.copy())
    np.fill_diagonal(abs_m, 0.0)

    # Upper triangle only — symmetric matrix
    iu = np.triu_indices(n, k=1)
    values = abs_m[iu]
    if values.size == 0:
        return np.zeros_like(matrix)

    k = max(1, int(math.ceil(values.size * fraction)))
    if k >= values.size:
        threshold = 0.0
    else:
        threshold = float(np.partition(values, -k)[-k])

    keep = abs_m >= threshold
    np.fill_diagonal(keep, False)
    out = np.where(keep, abs_m, 0.0)
    # Force symmetry
    out = np.maximum(out, out.T)
    return out


def _char_path_length(G: Any, nx_mod: Any) -> float:
    if G.number_of_edges() == 0:
        return float("nan")
    try:
        components = list(nx_mod.connected_components(G))
    except Exception:
        return float("nan")
    if not components:
        return float("nan")
    biggest = max(components, key=len)
    if len(biggest) < 2:
        return float("nan")
    sub = G.subgraph(biggest).copy()
    try:
        # Use unweighted path length; weights here are connectivity strength,
        # which are not distances.
        return float(nx_mod.average_shortest_path_length(sub))
    except Exception as exc:
        log.warning("average_shortest_path_length failed (%s).", exc)
        return float("nan")


def _small_worldness(G: Any, nx_mod: Any, clustering: float, cpl: float) -> float:
    if not math.isfinite(clustering) or not math.isfinite(cpl):
        return float("nan")
    if G.number_of_edges() == 0:
        return float("nan")

    rnd = np.random.default_rng(RANDOM_SEED)
    clusterings: list[float] = []
    cpls: list[float] = []
    degree_seq = [d for _, d in G.degree()]
    for _ in range(N_RANDOM_GRAPHS):
        try:
            rg = nx_mod.configuration_model(
                degree_seq, create_using=nx_mod.Graph, seed=int(rnd.integers(0, 2**31 - 1))
            )
            rg = nx_mod.Graph(rg)  # coalesce multi-edges + drop self-loops
            rg.remove_edges_from(nx_mod.selfloop_edges(rg))
            if rg.number_of_edges() == 0:
                continue
            clusterings.append(float(nx_mod.average_clustering(rg)))
            components = list(nx_mod.connected_components(rg))
            if not components:
                continue
            biggest = max(components, key=len)
            if len(biggest) < 2:
                continue
            sub = rg.subgraph(biggest).copy()
            cpls.append(float(nx_mod.average_shortest_path_length(sub)))
        except Exception as exc:
            log.debug("random graph iteration failed (%s).", exc)
            continue

    if not clusterings or not cpls:
        return float("nan")

    cr = float(np.mean(clusterings)) or float("nan")
    lr = float(np.mean(cpls)) or float("nan")
    if not math.isfinite(cr) or cr == 0 or not math.isfinite(lr) or lr == 0:
        return float("nan")
    return float((clustering / cr) / (cpl / lr))


def _safe(value: float) -> float:
    if value is None:
        return float("nan")
    f = float(value)
    return f if math.isfinite(f) else float("nan")


def _nan_metrics() -> dict[str, float]:
    return {
        "clustering_coef": float("nan"),
        "char_path_length": float("nan"),
        "small_worldness": float("nan"),
    }
