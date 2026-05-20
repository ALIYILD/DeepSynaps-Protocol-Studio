"""Tier 2 BrainHarmony structure-function fusion router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_brainharmony import (
    BRAINHARMONY_DISCLAIMER,
    BrainHarmonyFuseRequest,
    BrainHarmonyFuseResponse,
    BrainHarmonyHealthResponse,
    get_fuser,
)

router = APIRouter(prefix="/api/v1/ai/brainharmony", tags=["ai-tier2-brainharmony"])


@router.get("/health", response_model=BrainHarmonyHealthResponse)
def get_brainharmony_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BrainHarmonyHealthResponse:
    return get_fuser().health()


@router.post("/fuse", response_model=BrainHarmonyFuseResponse)
def post_brainharmony_fuse(
    request: BrainHarmonyFuseRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BrainHarmonyFuseResponse:
    require_minimum_role(actor, "clinician")
    response = get_fuser().fuse(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": BRAINHARMONY_DISCLAIMER})
    return response
