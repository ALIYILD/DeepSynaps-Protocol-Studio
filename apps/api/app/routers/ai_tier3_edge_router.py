"""Tier 3 edge real-time qEEG + BioMistral router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier3_edge import (
    TIER3_DISCLAIMER,
    Tier3ChatRequest,
    Tier3ChatResponse,
    Tier3HealthResponse,
    Tier3ScreenRequest,
    Tier3ScreenResponse,
    get_runner,
)

router = APIRouter(prefix="/api/v1/ai/tier3", tags=["ai-tier3-edge"])


@router.get("/health", response_model=Tier3HealthResponse)
def get_tier3_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> Tier3HealthResponse:
    return get_runner().health()


@router.post("/screen", response_model=Tier3ScreenResponse)
def post_tier3_screen(
    request: Tier3ScreenRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> Tier3ScreenResponse:
    require_minimum_role(actor, "clinician")
    response = get_runner().screen(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": TIER3_DISCLAIMER})
    return response


@router.post("/chat", response_model=Tier3ChatResponse)
def post_tier3_chat(
    request: Tier3ChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> Tier3ChatResponse:
    require_minimum_role(actor, "clinician")
    response = get_runner().chat(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": TIER3_DISCLAIMER})
    return response
