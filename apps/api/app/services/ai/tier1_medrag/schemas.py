"""Schemas for the Tier 1 MedRAG evidence retrieval layer.

Local Pydantic models. Kept inside the ``tier1_medrag`` module so this
PR does not have to touch ``deepsynaps_core_schema``.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MedragStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class MedragCitation(BaseModel):
    """A single retrieved citation.

    Every field except ``source`` is optional so the retriever can attach
    whatever provenance it has without inventing missing identifiers.
    """

    model_config = ConfigDict(extra="forbid")

    source: str  # e.g. "evidence_db", "openalex", "pubmed"
    title: str | None = None
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    pmid: str | None = None
    doi: str | None = None
    openalex_id: str | None = None
    url: str | None = None
    evidence_grade: str | None = None
    relevance_score: float | None = None


class MedragHealthResponse(BaseModel):
    """Service health.

    ``stub`` is ``True`` whenever the embedding model is not loaded or
    the evidence DB is not reachable.
    """

    model_config = ConfigDict(extra="forbid")

    status: MedragStatus
    embedding_model_loaded: bool
    evidence_db_connected: bool
    stub: bool
    message: str


class MedragQueryRequest(BaseModel):
    """Input to a single MedRAG retrieval call."""

    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1)
    indication: str | None = None
    modality: str | None = None
    top_k: int = Field(default=5, ge=1, le=20)


class MedragQueryResponse(BaseModel):
    """Uniform response envelope for MedRAG queries.

    Stub mode: ``answer=None, citations=[]``. NEVER pre-populate citations
    with fabricated identifiers.
    """

    model_config = ConfigDict(extra="forbid")

    stub: bool
    status: MedragStatus
    question: str
    answer: str | None
    citations: list[MedragCitation] = Field(default_factory=list)
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
