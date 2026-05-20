"""Tier 2 sgACC TMS targeting router (stub).

Endpoints:

- GET  /api/v1/ai/sgacc/health  — service health (any auth role)
- POST /api/v1/ai/sgacc/target  — TMS coil targeting suggestion (clinician+)

sgACC functional connectivity is the strongest published TMS-depression
response predictor (Pearson r ≈ −0.55, prospectively validated). This
adapter ships the contract; real prediction lands in a follow-up PR.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_sgacc import (
    SGACC_DISCLAIMER,
    SgaccHealthResponse,
    SgaccTargetRequest,
    SgaccTargetResponse,
    get_predictor,
)

router = APIRouter(prefix="/api/v1/ai/sgacc", tags=["ai-tier2-sgacc"])


@router.get("/health", response_model=SgaccHealthResponse)
def get_sgacc_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SgaccHealthResponse:
    """Service health. Any authenticated role may probe."""
    return get_predictor().health()


@router.post("/target", response_model=SgaccTargetResponse)
def post_sgacc_target(
    request: SgaccTargetRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SgaccTargetResponse:
    """TMS targeting suggestion. Clinician-or-above role required.

    Stub mode: returns ``stub: True`` with every nullable field set to
    ``None``. No fMRI is fetched and no model is run.
    """
    require_minimum_role(actor, "clinician")
    response = get_predictor().predict(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": SGACC_DISCLAIMER})
    return response
