"""Tier 2 multimodal-MRI TMS response predictor router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_tms_response import (
    TMS_RESPONSE_DISCLAIMER,
    TmsResponseHealthResponse,
    TmsResponsePredictRequest,
    TmsResponsePredictResponse,
    get_predictor,
)

router = APIRouter(prefix="/api/v1/ai/tms-response", tags=["ai-tier2-tms-response"])


@router.get("/health", response_model=TmsResponseHealthResponse)
def get_tms_response_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TmsResponseHealthResponse:
    return get_predictor().health()


@router.post("/predict", response_model=TmsResponsePredictResponse)
def post_tms_response_predict(
    request: TmsResponsePredictRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TmsResponsePredictResponse:
    require_minimum_role(actor, "clinician")
    response = get_predictor().predict(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": TMS_RESPONSE_DISCLAIMER})
    return response
