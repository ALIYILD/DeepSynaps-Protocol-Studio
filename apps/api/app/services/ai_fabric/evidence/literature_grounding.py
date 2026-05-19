from __future__ import annotations

from .schemas import CitationProvenance, EvidenceGroundingRequest, EvidenceGroundingResponse


class LiteratureGrounding:
    def ground(self, request: EvidenceGroundingRequest) -> EvidenceGroundingResponse:
        return EvidenceGroundingResponse(
            summary="Synthetic literature grounding scaffold response.",
            citations=[
                CitationProvenance(
                    source="synthetic",
                    citation_id="ai-fabric-dry-run",
                    confidence=0.5,
                )
            ],
        )
