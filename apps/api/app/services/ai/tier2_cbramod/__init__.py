"""Tier 2 — CBraMod EEG foundation-model adapter (stub)."""
from .disclaimers import CBRAMOD_DISCLAIMER
from .embedder import CbramodEmbedder, get_embedder
from .schemas import (
    CbramodEmbedRequest,
    CbramodEmbedResponse,
    CbramodHealthResponse,
    CbramodStatus,
)

__all__ = [
    "CBRAMOD_DISCLAIMER",
    "CbramodEmbedder",
    "get_embedder",
    "CbramodEmbedRequest",
    "CbramodEmbedResponse",
    "CbramodHealthResponse",
    "CbramodStatus",
]
