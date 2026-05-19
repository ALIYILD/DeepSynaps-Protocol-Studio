"""Tier 2 — Brain-JEPA fMRI foundation-model adapter.

Stub-mode by default. Reads ``BRAIN_JEPA_MODEL_PATH`` and
``BRAIN_JEPA_DEVICE`` from the environment; while unset every ``embed``
call returns ``stub: True, embedding: None`` with the canonical fMRI
disclaimer.
"""
from .disclaimers import BRAIN_JEPA_DISCLAIMER
from .embedder import BrainJepaEmbedder, get_embedder
from .schemas import (
    BrainJepaEmbedRequest,
    BrainJepaEmbedResponse,
    BrainJepaHealthResponse,
    BrainJepaStatus,
)

__all__ = [
    "BRAIN_JEPA_DISCLAIMER",
    "BrainJepaEmbedder",
    "get_embedder",
    "BrainJepaEmbedRequest",
    "BrainJepaEmbedResponse",
    "BrainJepaHealthResponse",
    "BrainJepaStatus",
]
