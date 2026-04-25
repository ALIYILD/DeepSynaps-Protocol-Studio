"""Foundation-model EEG embeddings.

This package provides a small, explicit surface:

- Model-specific embedders (:class:`~deepsynaps_qeeg.embeddings.labram.LaBraMEmbedder`,
  :class:`~deepsynaps_qeeg.embeddings.eegpt.EEGPTEmbedder`)
- Pooling helpers (:mod:`deepsynaps_qeeg.embeddings.pooling`)
- A registry/factory with license+pin enforcement (:func:`deepsynaps_qeeg.embeddings.registry.get_embedder`)

Weights are downloaded on first use into a host-mounted cache directory. See
``docs/FOUNDATION_MODELS.md`` for deployment requirements and license policy.
"""

from __future__ import annotations

from .registry import get_embedder

__all__ = ["get_embedder"]

