"""Phase 3: BrainSpace connectome-gradient decomposition (BSD-3, base dep).

BrainSpace exposes a `GradientMaps` estimator that decomposes a symmetric
connectivity matrix into principal gradients (diffusion-map / PCA / LE).
This module wraps it with the project-wide HAS_<LIB> pattern and returns
a `GradientSummary` schema with explained-variance ratios so callers
needn't depend on numpy/sklearn types.
"""
from __future__ import annotations

from .schemas import GradientSummary

try:
    import brainspace as _brainspace  # noqa: F401
    HAS_BRAINSPACE: bool = True
except ImportError:
    HAS_BRAINSPACE = False


def compute_gradients(
    connectome_matrix: list[list[float]],
    n_components: int = 3,
) -> GradientSummary:
    """Run a BrainSpace gradient decomposition on `connectome_matrix`.

    Parameters
    ----------
    connectome_matrix:
        Square symmetric connectivity matrix as a list-of-lists. Cells
        should already be non-negative (e.g. abs-correlations).
    n_components:
        Number of principal gradients to retain. Default 3.

    Returns
    -------
    GradientSummary with n_components, n_regions and per-component
    explained-variance ratios.
    """
    if not HAS_BRAINSPACE:
        raise ImportError("brainspace is not installed")
    if n_components <= 0:
        raise ValueError("n_components must be positive")

    import numpy as np
    from brainspace.gradient import GradientMaps

    arr = np.asarray(connectome_matrix, dtype=float)
    if arr.ndim != 2 or arr.shape[0] != arr.shape[1]:
        raise ValueError("connectome_matrix must be a square 2-D matrix")
    if arr.shape[0] < n_components + 1:
        raise ValueError(
            "matrix dimension must exceed n_components for a stable fit"
        )

    gm = GradientMaps(n_components=int(n_components), random_state=42)
    # sparsity=0 keeps all entries — necessary for small connectomes where
    # the default 0.9 sparsity threshold would zero out the entire matrix.
    gm.fit(arr, sparsity=0)

    # `lambdas_` is the eigenvalue spectrum. Normalize to explained-variance
    # ratios so the response is dimensionless and easy to interpret.
    lambdas = np.abs(np.asarray(gm.lambdas_, dtype=float))
    if lambdas.size == 0 or lambdas.sum() == 0:
        explained = [0.0] * int(n_components)
    else:
        ratios = (lambdas / lambdas.sum())[: int(n_components)].tolist()
        # Pad with zeros if BrainSpace returned fewer eigenvalues than asked.
        while len(ratios) < int(n_components):
            ratios.append(0.0)
        explained = [float(r) for r in ratios]

    return GradientSummary(
        n_components=int(n_components),
        n_regions=int(arr.shape[0]),
        explained_variance=explained,
    )
