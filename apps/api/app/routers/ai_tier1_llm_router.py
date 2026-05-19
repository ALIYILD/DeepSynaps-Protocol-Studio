"""Tier 1 LLM router — cloud clinical reasoning (vLLM + Me-LLaMA, stub).

Endpoints:

- GET  /api/v1/ai/tier1/health    — service + endpoint health (any auth role)
- POST /api/v1/ai/tier1/complete  — clinical reasoning call (clinician+)

The router carries the role gate and the disclaimer assertion. The
service itself is in stub mode until a follow-up PR wires the vLLM HTTP
client.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier1_llm import (
    CLINICAL_DISCLAIMER,
    ClinicalReasoningRequest,
    ClinicalReasoningResponse,
    Tier1HealthResponse,
    get_client,
)

router = APIRouter(prefix="/api/v1/ai/tier1", tags=["ai-tier1-llm"])


@router.get("/health", response_model=Tier1HealthResponse)
def get_tier1_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> Tier1HealthResponse:
    """Service health. Any authenticated role (including guest) may probe."""
    return get_client().health()


@router.post("/complete", response_model=ClinicalReasoningResponse)
async def post_tier1_complete(
    request: ClinicalReasoningRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ClinicalReasoningResponse:
    """Clinical-reasoning completion. Clinician-or-above role required.

    In stub mode the response carries ``stub: True, output: None`` with the
    canonical disclaimer attached. Real model output will not appear until
    ``TIER1_LLM_ENDPOINT`` is configured AND the follow-up wiring PR has
    landed.
    """
    require_minimum_role(actor, "clinician")
    response = await get_client().complete(request)
    # Defense-in-depth: every outbound envelope must carry the disclaimer.
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": CLINICAL_DISCLAIMER})
    return response
