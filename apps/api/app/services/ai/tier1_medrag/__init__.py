"""Tier 1 — MedRAG retrieval-augmented evidence layer.

Stub-mode by default. Reads ``MEDRAG_EMBEDDING_MODEL`` /
``MEDRAG_EVIDENCE_DB_URI`` / ``MEDRAG_TOP_K_DEFAULT`` from the
environment. While the embedding model or DB is unset every ``query``
call returns ``stub: True, answer: None, citations: []`` with the
canonical evidence disclaimer.

No fabricated citations: stub mode returns an empty list. The follow-up
PR wires the real embedding model + evidence DB + ranking.
"""
from .disclaimers import MEDRAG_DISCLAIMER
from .retriever import MedragRetriever, get_retriever
from .schemas import (
    MedragCitation,
    MedragHealthResponse,
    MedragQueryRequest,
    MedragQueryResponse,
    MedragStatus,
)

__all__ = [
    "MEDRAG_DISCLAIMER",
    "MedragRetriever",
    "get_retriever",
    "MedragCitation",
    "MedragHealthResponse",
    "MedragQueryRequest",
    "MedragQueryResponse",
    "MedragStatus",
]
