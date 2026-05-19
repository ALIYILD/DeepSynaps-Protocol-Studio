"""Tier 2 CBraMod EEG foundation-model router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_cbramod import (
    CBRAMOD_DISCLAIMER,
    CbramodEmbedRequest,
    CbramodEmbedResponse,
    CbramodHealthResponse,
    get_embedder,
)

router = APIRouter(prefix="/api/v1/ai/cbramod", tags=["ai-tier2-cbramod"])


@router.get("/health", response_model=CbramodHealthResponse)
def get_cbramod_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CbramodHealthResponse:
    return get_embedder().health()


@router.post("/embed", response_model=CbramodEmbedResponse)
def post_cbramod_embed(
    request: CbramodEmbedRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CbramodEmbedResponse:
    require_minimum_role(actor, "clinician")
    response = get_embedder().embed(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": CBRAMOD_DISCLAIMER})
    return response
