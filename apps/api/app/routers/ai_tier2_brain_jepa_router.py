"""Tier 2 Brain-JEPA fMRI foundation-model router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_brain_jepa import (
    BRAIN_JEPA_DISCLAIMER,
    BrainJepaEmbedRequest,
    BrainJepaEmbedResponse,
    BrainJepaHealthResponse,
    get_embedder,
)

router = APIRouter(prefix="/api/v1/ai/brain-jepa", tags=["ai-tier2-brain-jepa"])


@router.get("/health", response_model=BrainJepaHealthResponse)
def get_brain_jepa_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BrainJepaHealthResponse:
    return get_embedder().health()


@router.post("/embed", response_model=BrainJepaEmbedResponse)
def post_brain_jepa_embed(
    request: BrainJepaEmbedRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BrainJepaEmbedResponse:
    require_minimum_role(actor, "clinician")
    response = get_embedder().embed(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": BRAIN_JEPA_DISCLAIMER})
    return response
