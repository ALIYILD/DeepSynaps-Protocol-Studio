"""Tier 2 LightGBM DBS motor-outcome predictor router (stub)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.ai.tier2_lightgbm_dbs import (
    LIGHTGBM_DBS_DISCLAIMER,
    DbsHealthResponse,
    DbsPredictRequest,
    DbsPredictResponse,
    get_predictor,
)

router = APIRouter(prefix="/api/v1/ai/dbs-predict", tags=["ai-tier2-dbs"])


@router.get("/health", response_model=DbsHealthResponse)
def get_dbs_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DbsHealthResponse:
    return get_predictor().health()


@router.post("/predict", response_model=DbsPredictResponse)
def post_dbs_predict(
    request: DbsPredictRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DbsPredictResponse:
    require_minimum_role(actor, "clinician")
    response = get_predictor().predict(request)
    if not response.disclaimer:
        response = response.model_copy(update={"disclaimer": LIGHTGBM_DBS_DISCLAIMER})
    return response
