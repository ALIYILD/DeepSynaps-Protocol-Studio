"""Biometrics API — analytics over ``WearableDailySummary`` + ``deepsynaps_biometrics``.

Normalized ingestion batches persist observations/daily rows via
``app.services.biometrics_analytics``. Clinician/patient wearable APIs remain
under ``/api/v1/wearables`` and ``/api/v1/patient-portal``.
"""

from __future__ import annotations

from typing import Any, Optional, Union

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.services.evidence_intelligence import EvidenceResult
from app.services.biometrics_evidence_bridge import (
    BiometricsEvidenceRequest,
    biometrics_evidence_result,
    provenance_note,
)
from app.services.biometrics_analytics import (
    alerts_payload,
    baseline_payload,
    biometrics_summary_payload,
    correlation_payload,
    features_payload,
    persist_biometric_sync_batch,
    resolve_analytics_patient_id,
    summaries_to_feature_matrix,
    touch_connection_last_sync,
    load_summaries_window,
)
from deepsynaps_biometrics.causal import estimate_intervention_effect
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


class ConnectOut(BaseModel):
    mode: str
    provider: str
    details: dict[str, Any] = Field(default_factory=dict)


class SyncRequest(BaseModel):
    patient_id: Optional[str] = None
    connection_id: Optional[str] = None
    provider: str
    cursor: Optional[str] = None
    batch: list[dict[str, Any]] = Field(default_factory=list)
    run_clinical_flag_checks: bool = True


@router.post("/providers/healthkit/connect", response_model=ConnectOut)
def post_healthkit_connect(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ConnectOut:
    d = connect_healthkit_account(state="", redirect_uri="")
    return ConnectOut(mode=str(d.get("mode")), provider=str(d.get("provider")), details=d)


@router.post("/providers/health-connect/connect", response_model=ConnectOut)
def post_health_connect_connect(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ConnectOut:
    d = connect_health_connect_account()
    return ConnectOut(mode=str(d.get("mode")), provider=str(d.get("provider")), details=d)


@router.post("/providers/oura/connect", response_model=ConnectOut)
def post_oura_connect(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ConnectOut:
    d = connect_oura_account()
    return ConnectOut(mode="oauth", provider=str(d.get("provider")), details=d)


@router.post("/sync")
def post_biometrics_sync(
    body: SyncRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Persist normalized observation rows or daily summaries; optional HK/HC bridge."""
    patient_id = resolve_analytics_patient_id(actor, db, patient_id=body.patient_id)
    stats = persist_biometric_sync_batch(
        db,
        patient_id,
        batch=body.batch,
        run_flag_checks_after=body.run_clinical_flag_checks,
    )
    touch_connection_last_sync(db, body.connection_id, patient_id)
    out = {
        "patient_id": patient_id,
        "connection_id": body.connection_id,
        "provider": body.provider,
        "rows_seen": len(body.batch),
        "cursor_echo": body.cursor,
        **stats,
    }
    return out


@router.get("/summary")
def get_biometrics_summary(
    days: int = Query(default=30, ge=1, le=365),
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    pid = resolve_analytics_patient_id(actor, db, patient_id=patient_id)
    payload = biometrics_summary_payload(db, pid, days=days)
    matrix = summaries_to_feature_matrix(load_summaries_window(db, pid, days=days))
    payload["feature_series_coverage"] = {k: len(v) for k, v in matrix.items()}
    return payload


@router.get("/features")
def get_biometrics_features(
    days: int = Query(default=30, ge=7, le=365),
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    pid = resolve_analytics_patient_id(actor, db, patient_id=patient_id)
    summaries = load_summaries_window(db, pid, days=days)
    matrix = summaries_to_feature_matrix(summaries)
    feat = features_payload(matrix)
    feat["patient_id"] = pid
    feat["window_days"] = days
    return feat


@router.get("/correlations")
def get_biometrics_correlations(
    days: int = Query(default=30, ge=7, le=365),
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    pid = resolve_analytics_patient_id(actor, db, patient_id=patient_id)
    summaries = load_summaries_window(db, pid, days=days)
    matrix = summaries_to_feature_matrix(summaries)
    return correlation_payload(matrix)


@router.get("/baseline", response_model=Union[PersonalBaselineProfile, dict[str, str]])
def get_biometrics_baseline(
    feature: str = Query(..., min_length=1, description="Column e.g. hrv_ms, sleep_duration_h"),
    days: int = Query(default=30, ge=7, le=365),
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PersonalBaselineProfile | dict[str, str]:
    pid = resolve_analytics_patient_id(actor, db, patient_id=patient_id)
    summaries = load_summaries_window(db, pid, days=days)
    matrix = summaries_to_feature_matrix(summaries)
    return baseline_payload(matrix, patient_id=pid, feature=feature)


@router.get("/alerts", response_model=list[PredictiveAlert])
def get_biometrics_alerts(
    days: int = Query(default=30, ge=14, le=365),
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PredictiveAlert]:
    pid = resolve_analytics_patient_id(actor, db, patient_id=patient_id)
    summaries = load_summaries_window(db, pid, days=days)
    matrix = summaries_to_feature_matrix(summaries)
    return alerts_payload(matrix, patient_id=pid)


@router.post("/causal-analysis", response_model=CausalAnalysisResult)
def post_causal_analysis(
    body: CausalAnalysisRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CausalAnalysisResult:
    del db
    del actor
    # Pass aligned matrix when we have stored series keyed by request — P1.
    return estimate_intervention_effect(body, observed_data={})


@router.post("/evidence", response_model=EvidenceResult)
def post_biometrics_evidence(
    body: BiometricsEvidenceRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> EvidenceResult:
    """Rank literature for a biometrics context using the 87k evidence intelligence engine.

    Pass optional ``correlation_snapshot`` / ``features_snapshot`` from
    ``GET /api/biometrics/correlations`` and ``/features`` to enrich ranking.
    """
    pid = resolve_analytics_patient_id(actor, db, patient_id=body.patient_id)
    result = biometrics_evidence_result(body.model_copy(update={"patient_id": pid}))
    note = provenance_note(result.provenance.corpus)
    base = (result.recommended_caution or "").strip()
    caution = f"{base} {note}".strip() if base else note
    return result.model_copy(update={"recommended_caution": caution})


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
