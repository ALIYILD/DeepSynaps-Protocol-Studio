"""Cluster-based permutation testing between two trial groups."""

from __future__ import annotations

from typing import Any

import numpy as np


def cluster_test_between_epochs(epochs: Any, *, cond_a: str, cond_b: str, n_permutations: int = 512) -> dict[str, Any]:
    """Per-channel × time cluster permutation between conditions."""
    try:
        from mne.stats import permutation_cluster_test
    except ImportError:
        return {"ok": False, "error": "mne.stats unavailable"}

    if cond_a not in epochs.event_id or cond_b not in epochs.event_id:
        return {"ok": False, "error": "unknown condition"}

    xa = epochs[cond_a].get_data()
    xb = epochs[cond_b].get_data()
    if xa.shape[0] < 2 or xb.shape[0] < 2:
        return {"ok": False, "error": "need ≥2 epochs per condition"}

    T_obs, clusters, cluster_pv, _H0 = permutation_cluster_test(
        [xa, xb],
        n_permutations=min(n_permutations, 1024),
        threshold=None,
        tail=0,
        n_jobs=1,
        verbose=False,
    )
    return {
        "ok": True,
        "tObsShape": list(T_obs.shape),
        "nClusters": len(clusters),
        "clusterPV": np.asarray(cluster_pv).tolist(),
    }
