"""Wearable monitoring router.

Clinician endpoints  — /api/v1/wearables/patients/{patient_id}/...
Patient portal endpoints — mounted separately in patient_portal_router.py

All data is labeled by source and timestamped. Nothing here is
clinical-grade unless explicitly sourced from a certified medical device.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    DeviceConnection,
    Patient,
    WearableAlertFlag,
    WearableDailySummary,
    WearableObservation,
)
from app.services.wearable_flags import compute_readiness_score, run_flag_checks

router = APIRouter(prefix="/api/v1/wearables", tags=["Wearable Monitoring"])
_logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _dt(v) -> Optional[str]:
    if v is None:
        return None
    return v.isoformat() if isinstance(v, datetime) else str(v)


def _require_clinician_access(actor: AuthenticatedActor) -> None:
    if actor.role not in ('clinician', 'admin', 'supervisor', 'reviewer', 'technician'):
        raise ApiServiceError(code='forbidden', message='Clinician access required.', status_code=403)


def _require_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> Patient:
    """Verify actor can access this patient (clinician or admin)."""
    _require_clinician_access(actor)
    patient = db.query(Patient).filter_by(id=patient_id).first()
    if patient is None:
        raise ApiServiceError(code='not_found', message='Patient not found.', status_code=404)
    return patient


# ── Response schemas ───────────────────────────────────────────────────────────

class ConnectionOut(BaseModel):
    id: str
    source: str
    source_type: str
    display_name: Optional[str]
    status: str
    consent_given: bool
    connected_at: Optional[str]
    last_sync_at: Optional[str]


class DailySummaryOut(BaseModel):
    id: str
    patient_id: str
    source: str
    date: str
    rhr_bpm: Optional[float]
    hrv_ms: Optional[float]
    sleep_duration_h: Optional[float]
    sleep_consistency_score: Optional[float]
    steps: Optional[int]
    spo2_pct: Optional[float]
    skin_temp_delta: Optional[float]
    readiness_score: Optional[float]
    mood_score: Optional[float]
    pain_score: Optional[float]
    anxiety_score: Optional[float]
    synced_at: str


class AlertFlagOut(BaseModel):
    id: str
    patient_id: str
    course_id: Optional[str]
    flag_type: str
    severity: str
    detail: Optional[str]
    triggered_at: str
    reviewed_at: Optional[str]
    dismissed: bool


class PatientMonitoringOut(BaseModel):
    patient_id: str
    connections: list[ConnectionOut]
    summaries: list[DailySummaryOut]
    recent_alerts: list[AlertFlagOut]
    readiness: dict


# ── Clinician endpoints ────────────────────────────────────────────────────────

@router.get("/patients/{patient_id}/summary", response_model=PatientMonitoringOut)
def get_patient_wearable_summary(
    patient_id: str,
    days: int = Query(default=30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientMonitoringOut:
    """7-30-day wearable trend summary for a patient. Clinician-facing."""
    _require_patient_access(actor, patient_id, db)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

    connections = db.query(DeviceConnection).filter_by(patient_id=patient_id).all()
    summaries = (
        db.query(WearableDailySummary)
        .filter(
            WearableDailySummary.patient_id == patient_id,
            WearableDailySummary.date >= cutoff,
        )
        .order_by(WearableDailySummary.date.asc())
        .all()
    )
    alerts = (
        db.query(WearableAlertFlag)
        .filter(
            WearableAlertFlag.patient_id == patient_id,
            WearableAlertFlag.dismissed.is_(False),
        )
        .order_by(WearableAlertFlag.triggered_at.desc())
        .limit(20)
        .all()
    )

    readiness = compute_readiness_score(summaries)

    return PatientMonitoringOut(
        patient_id=patient_id,
        connections=[_conn_out(c) for c in connections],
        summaries=[_summary_out(s) for s in summaries],
        recent_alerts=[_alert_out(a) for a in alerts],
        readiness=readiness,
    )


@router.get("/patients/{patient_id}/alerts", response_model=list[AlertFlagOut])
def get_patient_alerts(
    patient_id: str,
    include_dismissed: bool = Query(default=False),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[AlertFlagOut]:
    _require_patient_access(actor, patient_id, db)
    q = db.query(WearableAlertFlag).filter_by(patient_id=patient_id)
    if not include_dismissed:
        q = q.filter_by(dismissed=False)
    alerts = q.order_by(WearableAlertFlag.triggered_at.desc()).limit(50).all()
    return [_alert_out(a) for a in alerts]


@router.post("/alerts/{flag_id}/dismiss")
def dismiss_alert(
    flag_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    _require_clinician_access(actor)
    flag = db.query(WearableAlertFlag).filter_by(id=flag_id).first()
    if flag is None:
        raise ApiServiceError(code='not_found', message='Alert flag not found.', status_code=404)
    # Ownership check: non-admin clinicians may only dismiss alerts for patients
    # assigned to them (Patient.clinician_id == actor.actor_id).
    if actor.role != 'admin':
        patient = db.query(Patient).filter_by(id=flag.patient_id, clinician_id=actor.actor_id).first()
        if patient is None:
            raise ApiServiceError(
                code='forbidden',
                message='Not authorized to dismiss this alert.',
                status_code=403,
            )
    flag.dismissed = True
    flag.reviewed_at = datetime.now(timezone.utc)
    flag.reviewed_by = actor.actor_id
    db.commit()
    return {'ok': True, 'flag_id': flag_id}


@router.post("/patients/{patient_id}/run-flag-checks")
def trigger_flag_checks(
    patient_id: str,
    course_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Manually trigger deterministic flag rules for a patient."""
    _require_patient_access(actor, patient_id, db)
    new_flags = run_flag_checks(patient_id, course_id, db)
    return {'new_flags_created': len(new_flags), 'flag_ids': [f.id for f in new_flags]}


# ── Observation ingest (called by connectors / SDK / manual entry) ────────────

class ObservationIn(BaseModel):
    source: str
    source_type: str = 'wearable'
    metric_type: str
    value: Optional[float] = None
    value_text: Optional[str] = None
    unit: Optional[str] = None
    observed_at: str           # ISO datetime string
    aggregation_window: Optional[str] = None
    quality_flag: Optional[str] = 'good'
    connection_id: Optional[str] = None


class BulkObservationIn(BaseModel):
    observations: list[ObservationIn]


@router.post("/patients/{patient_id}/observations")
def ingest_observations(
    patient_id: str,
    body: BulkObservationIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Ingest raw wearable observations for a patient.

    Intended for connector services and developer testing. All data is
    timestamped, source-labeled, and carries a quality flag.
    """
    _require_patient_access(actor, patient_id, db)

    created = 0
    for obs in body.observations:
        try:
            observed_at = datetime.fromisoformat(obs.observed_at.replace('Z', '+00:00'))
        except ValueError:
            continue  # skip malformed timestamps

        record = WearableObservation(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            connection_id=obs.connection_id,
            source=obs.source,
            source_type=obs.source_type,
            metric_type=obs.metric_type,
            value=obs.value,
            value_text=obs.value_text,
            unit=obs.unit,
            observed_at=observed_at,
            aggregation_window=obs.aggregation_window,
            quality_flag=obs.quality_flag,
        )
        db.add(record)
        created += 1

    db.commit()

    _logger.info(
        "wearable_observations_ingested patient=%s actor=%s role=%s count=%d sources=%s",
        patient_id, actor.actor_id, actor.role, created,
        sorted({obs.source for obs in body.observations}),
    )

    return {'created': created}


# ── Daily summary upsert ──────────────────────────────────────────────────────

class DailySummaryIn(BaseModel):
    source: str
    date: str                          # YYYY-MM-DD
    rhr_bpm: Optional[float] = None
    hrv_ms: Optional[float] = None
    sleep_duration_h: Optional[float] = None
    sleep_consistency_score: Optional[float] = None
    steps: Optional[int] = None
    spo2_pct: Optional[float] = None
    skin_temp_delta: Optional[float] = None
    readiness_score: Optional[float] = None
    mood_score: Optional[float] = None
    pain_score: Optional[float] = None
    anxiety_score: Optional[float] = None
    data_json: Optional[dict] = None


@router.post("/patients/{patient_id}/daily-summaries")
def upsert_daily_summary(
    patient_id: str,
    body: DailySummaryIn,
    run_flags: bool = Query(default=True),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Upsert a daily wearable summary. Runs flag checks if run_flags=true."""
    _require_patient_access(actor, patient_id, db)

    existing = (
        db.query(WearableDailySummary)
        .filter_by(patient_id=patient_id, source=body.source, date=body.date)
        .first()
    )

    data_json_str = json.dumps(body.data_json) if body.data_json else None

    if existing:
        for field in ('rhr_bpm', 'hrv_ms', 'sleep_duration_h', 'sleep_consistency_score',
                      'steps', 'spo2_pct', 'skin_temp_delta', 'readiness_score',
                      'mood_score', 'pain_score', 'anxiety_score'):
            v = getattr(body, field)
            if v is not None:
                setattr(existing, field, v)
        if data_json_str:
            existing.data_json = data_json_str
        existing.synced_at = datetime.now(timezone.utc)
        db.commit()
        summary_id = existing.id
    else:
        summary = WearableDailySummary(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            source=body.source,
            date=body.date,
            rhr_bpm=body.rhr_bpm,
            hrv_ms=body.hrv_ms,
            sleep_duration_h=body.sleep_duration_h,
            sleep_consistency_score=body.sleep_consistency_score,
            steps=body.steps,
            spo2_pct=body.spo2_pct,
            skin_temp_delta=body.skin_temp_delta,
            readiness_score=body.readiness_score,
            mood_score=body.mood_score,
            pain_score=body.pain_score,
            anxiety_score=body.anxiety_score,
            data_json=data_json_str,
        )
        db.add(summary)
        db.commit()
        summary_id = summary.id

    new_flags = []
    if run_flags:
        new_flags = run_flag_checks(patient_id, None, db)

    _logger.info(
        "wearable_daily_summary_upserted patient=%s actor=%s role=%s source=%s date=%s new_flags=%d",
        patient_id, actor.actor_id, actor.role, body.source, body.date, len(new_flags),
    )

    return {'summary_id': summary_id, 'new_flags': len(new_flags)}


# ── Serialisers ───────────────────────────────────────────────────────────────

def _conn_out(c: DeviceConnection) -> ConnectionOut:
    return ConnectionOut(
        id=c.id,
        source=c.source,
        source_type=c.source_type,
        display_name=c.display_name,
        status=c.status,
        consent_given=c.consent_given,
        connected_at=_dt(c.connected_at),
        last_sync_at=_dt(c.last_sync_at),
    )


def _summary_out(s: WearableDailySummary) -> DailySummaryOut:
    return DailySummaryOut(
        id=s.id,
        patient_id=s.patient_id,
        source=s.source,
        date=s.date,
        rhr_bpm=s.rhr_bpm,
        hrv_ms=s.hrv_ms,
        sleep_duration_h=s.sleep_duration_h,
        sleep_consistency_score=s.sleep_consistency_score,
        steps=s.steps,
        spo2_pct=s.spo2_pct,
        skin_temp_delta=s.skin_temp_delta,
        readiness_score=s.readiness_score,
        mood_score=s.mood_score,
        pain_score=s.pain_score,
        anxiety_score=s.anxiety_score,
        synced_at=_dt(s.synced_at) or '',
    )


def _alert_out(a: WearableAlertFlag) -> AlertFlagOut:
    return AlertFlagOut(
        id=a.id,
        patient_id=a.patient_id,
        course_id=a.course_id,
        flag_type=a.flag_type,
        severity=a.severity,
        detail=a.detail,
        triggered_at=_dt(a.triggered_at) or '',
        reviewed_at=_dt(a.reviewed_at),
        dismissed=a.dismissed,
    )


# ── Clinic-wide alert summary (dashboard widget) ──────────────────────────────

class ClinicAlertSummaryOut(BaseModel):
    total_active: int
    urgent_count: int
    warning_count: int
    info_count: int
    patient_ids_with_alerts: list[str]


@router.get("/clinic/alerts/summary", response_model=ClinicAlertSummaryOut)
def get_clinic_alert_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ClinicAlertSummaryOut:
    """Aggregate undismissed wearable alert counts across all clinic patients.
    Used by the clinician dashboard KPI bar to surface wearable degradation
    without N per-patient queries.
    """
    _require_clinician_access(actor)
    q = db.query(WearableAlertFlag).filter(WearableAlertFlag.dismissed == False)  # noqa: E712
    if actor.role != "admin":
        # Scope to patients owned by this clinician so data never leaks across clinics.
        q = q.join(Patient, WearableAlertFlag.patient_id == Patient.id).filter(
            Patient.clinician_id == actor.actor_id
        )
    flags = q.all()
    urgent  = sum(1 for f in flags if f.severity == 'urgent')
    warning = sum(1 for f in flags if f.severity == 'warning')
    info    = sum(1 for f in flags if f.severity == 'info')
    patient_ids = list({f.patient_id for f in flags if f.patient_id})
    return ClinicAlertSummaryOut(
        total_active=len(flags),
        urgent_count=urgent,
        warning_count=warning,
        info_count=info,
        patient_ids_with_alerts=patient_ids,
    )
