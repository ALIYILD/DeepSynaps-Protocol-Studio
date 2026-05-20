"""Tier 2 MEDFuse multimodal fusion router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_medfuse import (
    MEDFUSE_DISCLAIMER,
    MedfuseFuseRequest,
    MedfuseFuseResponse,
    MedfuseHealthResponse,
    get_fuser,
)

router = APIRouter(prefix="/api/v1/ai/medfuse", tags=["ai-tier2-medfuse"])


@router.get("/health", response_model=MedfuseHealthResponse)
def get_medfuse_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MedfuseHealthResponse:
    return get_fuser().health()


@router.post("/fuse", response_model=MedfuseFuseResponse)
def post_medfuse_fuse(
    request: MedfuseFuseRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MedfuseFuseResponse:
    require_minimum_role(actor, "clinician")
    response = get_fuser().fuse(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": MEDFUSE_DISCLAIMER})
    return response
