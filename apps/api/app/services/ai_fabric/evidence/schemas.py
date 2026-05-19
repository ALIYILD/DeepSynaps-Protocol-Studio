from __future__ import annotations

from pydantic import BaseModel, Field


class EvidenceGroundingRequest(BaseModel):
    question: str
    citations_required: bool = True


class CitationProvenance(BaseModel):
    source: str
    citation_id: str
    confidence: float = Field(..., ge=0, le=1)


class EvidenceGroundingResponse(BaseModel):
    summary: str
    citations: list[CitationProvenance] = Field(default_factory=list)
