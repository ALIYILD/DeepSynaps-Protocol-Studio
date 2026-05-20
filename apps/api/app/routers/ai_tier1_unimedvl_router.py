"""Tier 1 UniMedVL multimodal text+image router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier1_unimedvl import (
    UNIMEDVL_DISCLAIMER,
    UniMedVlHealthResponse,
    UniMedVlUnderstandRequest,
    UniMedVlUnderstandResponse,
    get_engine,
)

router = APIRouter(prefix="/api/v1/ai/unimedvl", tags=["ai-tier1-unimedvl"])


@router.get("/health", response_model=UniMedVlHealthResponse)
def get_unimedvl_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> UniMedVlHealthResponse:
    return get_engine().health()


@router.post("/understand", response_model=UniMedVlUnderstandResponse)
def post_unimedvl_understand(
    request: UniMedVlUnderstandRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> UniMedVlUnderstandResponse:
    require_minimum_role(actor, "clinician")
    response = get_engine().understand(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": UNIMEDVL_DISCLAIMER})
    return response
