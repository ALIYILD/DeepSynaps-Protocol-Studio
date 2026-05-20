"""Schemas for the Tier 1 PubMedBERT entity-extraction service."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PubmedbertStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class PubmedbertEntity(BaseModel):
    """A single extracted clinical entity."""

    model_config = ConfigDict(extra="forbid")

    text: str
    type: str  # e.g. "condition", "medication", "procedure", "anatomy"
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    score: float | None = Field(default=None, ge=0.0, le=1.0)


class PubmedbertHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: PubmedbertStatus
    model_loaded: bool
    stub: bool
    message: str


class PubmedbertExtractRequest(BaseModel):
    """Input to a single extraction call.

    ``types`` optionally narrows extraction to a specific entity class
    (e.g. ``["condition", "medication"]``). When ``None`` the extractor
    returns all detected entity types.
    """

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=50_000)
    types: list[str] | None = None


class PubmedbertExtractResponse(BaseModel):
    """Uniform response envelope.

    Stub mode: ``entities=[]``. NEVER fabricate entity spans.
    """

    model_config = ConfigDict(extra="forbid")

    stub: bool
    status: PubmedbertStatus
    entities: list[PubmedbertEntity] = Field(default_factory=list)
    text_length: int
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
