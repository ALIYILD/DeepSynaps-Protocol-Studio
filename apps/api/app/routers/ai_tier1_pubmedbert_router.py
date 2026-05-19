"""Tier 1 PubMedBERT entity-extraction router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier1_pubmedbert import (
    PUBMEDBERT_DISCLAIMER,
    PubmedbertExtractRequest,
    PubmedbertExtractResponse,
    PubmedbertHealthResponse,
    get_extractor,
)

router = APIRouter(prefix="/api/v1/ai/pubmedbert", tags=["ai-tier1-pubmedbert"])


@router.get("/health", response_model=PubmedbertHealthResponse)
def get_pubmedbert_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PubmedbertHealthResponse:
    return get_extractor().health()


@router.post("/extract", response_model=PubmedbertExtractResponse)
def post_pubmedbert_extract(
    request: PubmedbertExtractRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PubmedbertExtractResponse:
    """Clinical entity extraction. Clinician-or-above required.

    Stub mode: returns ``entities: []`` with the disclaimer attached.
    """
    require_minimum_role(actor, "clinician")
    response = get_extractor().extract(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": PUBMEDBERT_DISCLAIMER})
    return response
