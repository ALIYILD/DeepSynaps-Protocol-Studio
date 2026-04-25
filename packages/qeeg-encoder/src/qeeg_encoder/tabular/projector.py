"""Project canonical features to a fixed 128-dim tabular embedding.

Uses a deterministic random projection (Johnson-Lindenstrauss) so behavior is
stable across processes without a trained model. In production this is replaced
by a trained PCA or autoencoder, but the contract stays the same.
"""

from __future__ import annotations

import hashlib

import numpy as np


class TabularProjector:
    """Deterministic random projection from feature vector to fixed-dim embedding."""

    def __init__(self, embedding_dim: int = 128, seed: int = 1729) -> None:
        self.embedding_dim = embedding_dim
        self._seed = seed
        self._matrix: np.ndarray | None = None
        self._input_dim: int | None = None

    def _build(self, input_dim: int) -> np.ndarray:
        rng = np.random.default_rng(self._seed)
        # Sparse random projection (Achlioptas)
        m = rng.choice(
            [-1.0, 0.0, 0.0, 0.0, 1.0],
            size=(self.embedding_dim, input_dim),
        ).astype(np.float32) * np.sqrt(3.0 / self.embedding_dim)
        return m

    def transform(self, x: np.ndarray) -> np.ndarray:
        if x.ndim != 1:
            raise ValueError(f"expected 1-D feature vector, got {x.shape}")
        if self._matrix is None or self._input_dim != x.shape[0]:
            self._matrix = self._build(x.shape[0])
            self._input_dim = x.shape[0]
        return (self._matrix @ x).astype(np.float32)

    def fingerprint(self) -> str:
        """Stable identifier for the projection — useful in audit metadata."""
        h = hashlib.sha256(f"projector:{self._seed}:{self.embedding_dim}".encode()).hexdigest()
        return h[:16]

