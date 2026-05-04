"""PCA / factor analysis on stacked ERP (trials × features)."""

from __future__ import annotations

from typing import Any

import numpy as np


def pfa_on_epochs(
    epochs: Any,
    *,
    n_factors: int,
    rotate: str | None = "promax",
) -> dict[str, Any]:
    """Flatten each epoch (channels × times) → PCA."""
    try:
        from sklearn.decomposition import PCA
    except ImportError:
        return {"ok": False, "error": "sklearn required"}

    data = epochs.get_data(copy=False)
    n_ep, n_ch, n_t = data.shape
    X = data.reshape(n_ep, n_ch * n_t)
    X = X - np.mean(X, axis=0, keepdims=True)
    k = min(n_factors, n_ep, X.shape[1])
    pca = PCA(n_components=k, svd_solver="randomized", random_state=0)
    scores = pca.fit_transform(X)
    comps = pca.components_.reshape(k, n_ch, n_t)

    var_ratio = pca.explained_variance_ratio_.tolist()

    return {
        "ok": True,
        "nFactors": k,
        "explainedVarianceRatio": var_ratio,
        "factorWaveformsUv": (comps * 1e6).astype(np.float32).tolist(),
        "scores": scores.astype(np.float32).tolist(),
        "timesSec": epochs.times.tolist(),
        "rotate": rotate or "none",
    }
