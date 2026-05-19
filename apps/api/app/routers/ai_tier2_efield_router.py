"""Tier 2 real-time E-field surrogate router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_efield import (
    EFIELD_DISCLAIMER,
    EfieldHealthResponse,
    EfieldSimulateRequest,
    EfieldSimulateResponse,
    get_surrogate,
)

router = APIRouter(prefix="/api/v1/ai/efield", tags=["ai-tier2-efield"])


@router.get("/health", response_model=EfieldHealthResponse)
def get_efield_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EfieldHealthResponse:
    return get_surrogate().health()


@router.post("/simulate", response_model=EfieldSimulateResponse)
def post_efield_simulate(
    request: EfieldSimulateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EfieldSimulateResponse:
    require_minimum_role(actor, "clinician")
    response = get_surrogate().simulate(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": EFIELD_DISCLAIMER})
    return response
