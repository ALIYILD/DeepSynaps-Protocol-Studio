"""Biometrics MVP API — normalized schema façade over ``deepsynaps_biometrics``.

These routes document the MVP contract and delegate math to the sibling package.
Existing wearable flows remain under ``/api/v1/wearables`` and ``/api/v1/device-sync``.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import AuthenticatedActor, get_authenticated_actor
from deepsynaps_biometrics.causal import estimate_intervention_effect
from deepsynaps_biometrics.correlation import compute_biomarker_correlation_matrix
from deepsynaps_biometrics.device_catalog import (
    explain_device_recommendation,
    list_supported_marketplace_devices,
    recommend_supported_device,
)
from deepsynaps_biometrics.providers.health_connect import connect_health_connect_account
from deepsynaps_biometrics.providers.healthkit import connect_healthkit_account
from deepsynaps_biometrics.providers.oura import connect_oura_account
from deepsynaps_biometrics.schemas import (
    CausalAnalysisRequest,
    CausalAnalysisResult,
    PersonalBaselineProfile,
    PredictiveAlert,
)

router = APIRouter(prefix="/api/biometrics", tags=["Biometrics MVP"])


# ── Request / response DTOs (OpenAPI) ─────────────────────────────────────────

class ConnectOut(BaseModel):
    mode: str
    provider: str
    details: dict[str, Any] = Field(default_factory=dict)


class SyncRequest(BaseModel):
    connection_id: str
    provider: str
    cursor: Optional[str] = None
    batch: list[dict[str, Any]] = Field(default_factory=list)


class SummaryQuery(BaseModel):
    days: int = Field(default=7, ge=1, le=365)


@router.post("/providers/healthkit/connect", response_model=ConnectOut)
def post_healthkit_connect(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ConnectOut:
    """Register intent to use HealthKit bridge; mobile app completes authorization."""
    del actor
    d = connect_healthkit_account(state="", redirect_uri="")
    return ConnectOut(mode=str(d.get("mode")), provider=str(d.get("provider")), details=d)


@router.post("/providers/health-connect/connect", response_model=ConnectOut)
def post_health_connect_connect(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ConnectOut:
    del actor
    d = connect_health_connect_account()
    return ConnectOut(mode=str(d.get("mode")), provider=str(d.get("provider")), details=d)


@router.post("/providers/oura/connect", response_model=ConnectOut)
def post_oura_connect(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ConnectOut:
    del actor
    d = connect_oura_account()
    return ConnectOut(mode="oauth", provider=str(d.get("provider")), details=d)


@router.post("/sync")
def post_biometrics_sync(
    body: SyncRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Accept semi-normalized batches from mobile bridges (persist in service layer next)."""
    del actor
    return {
        "accepted": True,
        "connection_id": body.connection_id,
        "provider": body.provider,
        "rows_seen": len(body.batch),
    }


@router.get("/summary")
def get_biometrics_summary(
    days: int = 7,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    del actor
    q = SummaryQuery(days=days)
    return {"window_days": q.days, "series_counts": {}, "note": "Wire to WearableDailySummary in P1."}


@router.get("/features")
def get_biometrics_features(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    del actor
    return {"features": {}, "engine": "deepsynaps_biometrics.features"}


@router.get("/correlations")
def get_biometrics_correlations(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    del actor
    matrix = compute_biomarker_correlation_matrix({"a": [1.0, 2.0, 3.0], "b": [2.0, 4.0, 5.0]})
    return {"matrix": {f"{k[0]}:{k[1]}": v for k, v in matrix.items()}}


@router.get("/baseline", response_model=PersonalBaselineProfile | dict[str, str])
def get_biometrics_baseline(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PersonalBaselineProfile | dict[str, str]:
    del actor
    return {"message": "Add user_id + feature query params when wiring persistence."}


@router.get("/alerts", response_model=list[PredictiveAlert])
def get_biometrics_alerts(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[PredictiveAlert]:
    del actor
    return []


@router.post("/causal-analysis", response_model=CausalAnalysisResult)
def post_causal_analysis(
    body: CausalAnalysisRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CausalAnalysisResult:
    """P1 module — observational estimates only; explicit warnings in payload."""
    del actor
    return estimate_intervention_effect(body, observed_data={})


@router.get("/marketplace/devices")
def get_marketplace_devices(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    del actor
    devices = list_supported_marketplace_devices()
    return {"devices": [d.model_dump() for d in devices]}


@router.post("/marketplace/recommend")
def post_marketplace_recommend(
    profile: dict[str, bool],
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    del actor
    picks = recommend_supported_device(profile)
    return {
        "recommendations": [d.model_dump() for d in picks],
        "explanations": [explain_device_recommendation(d, profile) for d in picks[:3]],
    }
