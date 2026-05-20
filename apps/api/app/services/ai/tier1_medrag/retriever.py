"""MedRAG retriever.

Stub-only. Reads ``MEDRAG_EMBEDDING_MODEL`` / ``MEDRAG_EVIDENCE_DB_URI``
/ ``MEDRAG_TOP_K_DEFAULT`` from the environment. Stays in stub mode
whenever the embedding model name or evidence DB pointer is unset.

Real embedding + DB + ranking integration is a follow-up PR. This module
ships the contract only — no network calls, no embedding model loaded,
no fabricated citations.
"""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import MEDRAG_DISCLAIMER
from .schemas import MedragHealthResponse, MedragQueryRequest, MedragQueryResponse

_STUB_MESSAGE = (
    "MedRAG embedding model and/or evidence DB are not wired. Provide "
    "MEDRAG_EMBEDDING_MODEL and MEDRAG_EVIDENCE_DB_URI, then land the "
    "follow-up retrieval PR to enable real evidence grounding."
)


def _coerce_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


class MedragRetriever:
    """Stub retrieval-augmented evidence layer."""

    def __init__(self) -> None:
        self.embedding_model: Optional[str] = os.getenv("MEDRAG_EMBEDDING_MODEL") or None
        self.evidence_db_uri: Optional[str] = os.getenv("MEDRAG_EVIDENCE_DB_URI") or None
        self.top_k_default: int = _coerce_int(os.getenv("MEDRAG_TOP_K_DEFAULT"), 5)

    @property
    def embedding_model_loaded(self) -> bool:
        # The follow-up PR will instantiate a real model; setting the env
        # var alone does not constitute "loaded".
        return False

    @property
    def evidence_db_connected(self) -> bool:
        return False

    @property
    def is_stub(self) -> bool:
        return not (self.embedding_model_loaded and self.evidence_db_connected)

    def health(self) -> MedragHealthResponse:
        return MedragHealthResponse(
            status="stub",
            embedding_model_loaded=self.embedding_model_loaded,
            evidence_db_connected=self.evidence_db_connected,
            stub=True,
            message=_STUB_MESSAGE,
        )

    async def query(self, request: MedragQueryRequest) -> MedragQueryResponse:
        start = time.monotonic()
        # Touch the request so static analysers see it as used.
        _ = request.question
        latency_ms = int((time.monotonic() - start) * 1000)

        return MedragQueryResponse(
            stub=True,
            status="stub",
            question=request.question,
            answer=None,
            citations=[],
            latency_ms=latency_ms,
            disclaimer=MEDRAG_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[MedragRetriever] = None


def get_retriever() -> MedragRetriever:
    """Return a process-wide ``MedragRetriever`` singleton."""
    global _singleton
    if _singleton is None:
        _singleton = MedragRetriever()
    return _singleton
