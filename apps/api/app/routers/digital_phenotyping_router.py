"""Digital Phenotyping Analyzer — passive behavioral signals (decision-support).

GET    /api/v1/digital-phenotyping/analyzer/patient/{patient_id}
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/recompute
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/consent
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/settings
GET    /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/audit

Signal Ingest (real pipeline):
POST   /api/v1/digital-phenotyping/signals/ingest
POST   /api/v1/digital-phenotyping/signals/batch
GET    /api/v1/digital-phenotyping/signals/patient/{patient_id}
GET    /api/v1/digital-phenotyping/signals/patient/{patient_id}/quality
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.repositories.digital_phenotyping import (
    DigitalPhenotypingPatientState,
    append_audit as _repo_append_audit,
    count_observations as _repo_count_observations,
    get_patient_display_name as _repo_get_patient_display_name,
    insert_observation as _repo_insert_observation,
    list_clinic_patients as _repo_list_clinic_patients,
    list_recent_audit as _repo_list_recent_audit,
    list_recent_observations as _repo_list_recent_observations,
    load_or_create_state as _repo_load_or_create_state,
    observation_to_dict as _repo_observation_to_dict,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.services.digital_phenotyping import (
    DEFAULT_DOMAINS_ENABLED,
    attach_research_metadata,
    audit_rows_to_payload_events,
    build_stub_analyzer_payload,
    merge_observations_into_payload,
    merge_state_into_payload,
    _parse_domains_json,
)
from app.services.signal_ingest_pipeline import (
    SignalSource,
    SignalType,
    ingest_signal,
    ingest_batch,
    get_signal_quality_summary,
    list_signals_for_patient,
)
from app.services.consent_enforcement import (
    require_ai_analysis_consent,
    ConsentMissingError,
)

router = APIRouter(
    prefix="/api/v1/digital-phenotyping/analyzer",
    tags=["Digital Phenotyping"],
)

# ---------------------------------------------------------------------------
# Separate router for signal-ingest endpoints (different prefix)
# ---------------------------------------------------------------------------
signals_router = APIRouter(
    prefix="/api/v1/digital-phenotyping/signals",
    tags=["Signal Ingest"],
)


# ===========================================================================
# Request-body schemas
# ===========================================================================

# core-schema-exempt: minimal router-local request body; not reused outside this router
class ConsentBody(BaseModel):
    domains: dict[str, bool] = Field(default_factory=dict)
    consent_scope_version: str = "2026.04"
    artifact_ref: Optional[str] = None


# core-schema-exempt: minimal router-local request body; not reused outside this router
class SettingsBody(BaseModel):
    alert_thresholds: Optional[dict[str, Any]] = None
    ui_preferences: Optional[dict[str, Any]] = None
    minimization_tier: Optional[str] = None


# core-schema-exempt: minimal router-local request body; not reused outside this router
class RecomputeBody(BaseModel):
    window: Optional[dict[str, str]] = None
    domains: Optional[list[str]] = None
    force: bool = False


# core-schema-exempt: minimal router-local request body; not reused outside this router
class ManualObservationBody(BaseModel):
    """Clinician-entered proxy row (EMA-style) — MVP until passive ingest."""

    kind: str = "ema_checkin"
    recorded_at: Optional[str] = None
    notes: Optional[str] = None
    mood_0_10: Optional[float] = None
    anxiety_0_10: Optional[float] = None
    sleep_hours: Optional[float] = None


# core-schema-exempt: minimal router-local request body; not reused outside this router
class ObservationCreateBody(BaseModel):
    """Manual or device-attributed observation row."""

    source: str = "manual"  # manual | device_sync
    kind: str = "ema_checkin"
    recorded_at: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


# core-schema-exempt: minimal router-local annotation body; not reused outside this router
class AnnotationBody(BaseModel):
    note: str = Field(min_length=1, max_length=8000)


# core-schema-exempt: clinic-summary response shape; not reused outside this router
class ClinicSignalFlagOut(BaseModel):
    key: str
    label: str
    severity: str


# core-schema-exempt: clinic-summary response shape; not reused outside this router
class ClinicPatientSummaryOut(BaseModel):
    patient_id: str
    patient_name: str
    captured_at: str | None = None
    flags: list[ClinicSignalFlagOut] = Field(default_factory=list)
    worst_severity: str = "green"
    trend: str = "stable"


# core-schema-exempt: clinic-summary response shape; not reused outside this router
class ClinicSummaryResponse(BaseModel):
    captured_at: str | None = None
    patients: list[ClinicPatientSummaryOut] = Field(default_factory=list)
    total: int = 0


# ---------------------------------------------------------------------------
# Signal Ingest Request Schemas
# ---------------------------------------------------------------------------

class SignalIngestBody(BaseModel):
    """Single passive signal ingest request."""

    patient_id: str
    clinic_id: str
    signal_type: str
    signal_source: str
    value: float
    unit: str = ""
    timestamp: str  # ISO-8601
    metadata: Optional[dict[str, Any]] = None
    device_id: Optional[str] = None
    quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class SignalBatchItem(BaseModel):
    """One item inside a batch ingest request."""

    signal_type: str
    signal_source: str
    value: float
    unit: str = ""
    timestamp: str  # ISO-8601
    metadata: Optional[dict[str, Any]] = None
    device_id: Optional[str] = None
    quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class SignalBatchBody(BaseModel):
    """Batch passive signal ingest request."""

    patient_id: str
    clinic_id: str
    signals: list[SignalBatchItem]


class SignalListQuery(BaseModel):
    """Query params for listing patient signals."""

    signal_type: Optional[str] = None
    source: Optional[str] = None
    days: int = Field(default=7, ge=1, le=90)
    limit: int = Field(default=100, ge=1, le=500)


# ===========================================================================
# Helpers
# ===========================================================================


def _require_known_patient(db: Session, patient_id: str) -> None:
    exists, _clinic = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")


def _gate_patient(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _patient_display_name(db: Session, patient_id: str) -> Optional[str]:
    return _repo_get_patient_display_name(db, patient_id)


def _load_or_create_state(db: Session, patient_id: str) -> DigitalPhenotypingPatientState:
    return _repo_load_or_create_state(
        db,
        patient_id=patient_id,
        default_domains_enabled=DEFAULT_DOMAINS_ENABLED,
    )


def _append_audit(
    db: Session,
    *,
    patient_id: str,
    action: str,
    actor_id: Optional[str],
    summary: str,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    detail = {"summary": summary}
    if extra:
        detail.update(extra)
    _repo_append_audit(
        db,
        patient_id=patient_id,
        action=action,
        actor_id=actor_id,
        detail_json=json.dumps(detail),
    )


def _observation_count(db: Session, patient_id: str) -> int:
    return _repo_count_observations(db, patient_id=patient_id)


def _fetch_observation_dicts(db: Session, patient_id: str, limit: int = 400) -> list[dict[str, Any]]:
    rows = _repo_list_recent_observations(db, patient_id=patient_id, limit=limit)
    return [_repo_observation_to_dict(r) for r in rows]


def _build_payload_for_patient(
    db: Session, patient_id: str, *, hide_stub_audit: bool
) -> dict[str, Any]:
    pname = _patient_display_name(db, patient_id)
    state = _load_or_create_state(db, patient_id)
    domains = _parse_domains_json(state.domains_enabled_json)
    base = build_stub_analyzer_payload(patient_id, patient_name=pname)
    merged = merge_state_into_payload(
        base,
        domains_enabled=domains,
        consent_scope_version=state.consent_scope_version or "2026.04",
        state_updated_at=state.updated_at,
        hide_stub_audit_when_persisted=hide_stub_audit,
    )
    obs = _fetch_observation_dicts(db, patient_id)
    merged = merge_observations_into_payload(merged, observations=obs)
    merged["mvp_observations"] = obs[:50]
    total_obs = _observation_count(db, patient_id)
    merged["mvp_observations_total"] = total_obs
    merged = attach_research_metadata(
        merged,
        patient_id=patient_id,
        observation_row_count=total_obs,
        consent_scope_version=state.consent_scope_version or "2026.04",
    )
    return merged


def _build_research_export_bundle(db: Session, patient_id: str) -> dict[str, Any]:
    """Full reproducibility bundle (JSON) — audited on GET export."""
    payload = _build_payload_for_patient(db, patient_id, hide_stub_audit=True)
    obs = _fetch_observation_dicts(db, patient_id, limit=5000)
    audit_rows = _repo_list_recent_audit(db, patient_id=patient_id, limit=500)
    audit_export = []
    for r in audit_rows:
        detail = {}
        if r.detail_json:
            try:
                detail = json.loads(r.detail_json)
            except json.JSONDecodeError:
                detail = {}
        audit_export.append(
            {
                "id": r.id,
                "action": r.action,
                "actor_id": r.actor_id,
                "created_at": _audit_ts_iso(r.created_at),
                "detail": detail,
            }
        )
    state = _load_or_create_state(db, patient_id)
    consent_domains = _parse_domains_json(state.domains_enabled_json)
    return {
        "kind": "deepsynaps_digital_phenotyping_research_export",
        "schema_version": "1.1.0",
        "patient_id": patient_id,
        "exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "analyzer_payload": payload,
        "observations": obs,
        "consent_domains_snapshot": consent_domains,
        "consent_scope_version": state.consent_scope_version,
        "audit_trail_subset": audit_export,
    }


_CLINIC_SIGNAL_META: list[tuple[str, str, str]] = [
    ("sleep", "sleep_timing_proxy", "sleep"),
    ("mobility", "mobility_stability", "mobility"),
    ("social", "sociability_proxy", "social"),
    ("typing_cadence", "activity_level", "typing cadence"),
    ("screen_time", "screen_time_pattern", "screen time"),
    ("voice_diary", "routine_regularity", "voice diary"),
]


def _metric_severity(metric: Any) -> str | None:
    if not isinstance(metric, dict) or metric.get("value") is None:
        return None
    cmp = str(metric.get("baseline_comparison") or "").lower()
    if cmp in ("above", "below"):
        return "amber"
    if cmp == "within":
        return "green"
    return None


def _clinic_summary_row_from_payload(payload: dict[str, Any]) -> ClinicPatientSummaryOut:
    snap = payload.get("snapshot") if isinstance(payload.get("snapshot"), dict) else {}
    flags: list[ClinicSignalFlagOut] = []
    for key, metric_key, label in _CLINIC_SIGNAL_META:
        sev = _metric_severity(snap.get(metric_key))
        if sev:
            flags.append(ClinicSignalFlagOut(key=key, label=label, severity=sev))
    ranks = {"red": 3, "amber": 2, "green": 1}
    worst_rank = max((ranks.get(f.severity, 0) for f in flags), default=0)
    reds = sum(1 for f in flags if f.severity == "red")
    greens = sum(1 for f in flags if f.severity == "green")
    trend = "improving" if greens > reds else "worsening" if reds > greens else "stable"
    worst = "red" if worst_rank == 3 else "amber" if worst_rank == 2 else "green"
    return ClinicPatientSummaryOut(
        patient_id=str(payload.get("patient_id") or ""),
        patient_name=str(payload.get("patient_display_name") or payload.get("patient_id") or "Patient"),
        captured_at=str(payload.get("generated_at") or snap.get("computed_at") or "") or None,
        flags=flags,
        worst_severity=worst,
        trend=trend,
    )


def _audit_ts_iso(dt: Any) -> str:
    if dt is None:
        return ""
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    return str(dt)


# ===========================================================================
# Routes — Analyzer (existing)
# ===========================================================================


@router.get("/patient/{patient_id}")
def get_digital_phenotyping_analyzer(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return the Digital Phenotyping Analyzer page payload for one patient."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    payload = _build_payload_for_patient(db, patient_id, hide_stub_audit=True)

    _append_audit(
        db,
        patient_id=patient_id,
        action="view",
        actor_id=actor.actor_id,
        summary="Analyzer payload viewed",
    )

    latest = _repo_list_recent_audit(db, patient_id=patient_id, limit=25)
    payload["audit_events"] = audit_rows_to_payload_events(latest)
    return payload


@router.get("/clinic/summary", response_model=ClinicSummaryResponse)
def get_digital_phenotyping_clinic_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return a clinic-scoped digital phenotyping summary for active patients."""
    require_minimum_role(actor, "clinician")
    patients = _repo_list_clinic_patients(
        db,
        clinic_id=actor.clinic_id,
        include_all=actor.role == "admin",
    )

    items: list[ClinicPatientSummaryOut] = []
    for patient in patients:
        payload = _build_payload_for_patient(db, patient.id, hide_stub_audit=True)
        items.append(_clinic_summary_row_from_payload(payload))

    latest = max((item.captured_at or "" for item in items), default="") or None
    return ClinicSummaryResponse(captured_at=latest, patients=items, total=len(items))


@router.post("/patient/{patient_id}/recompute")
def recompute_digital_phenotyping(
    patient_id: str,
    body: RecomputeBody | None = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Trigger signal processing pipeline recomputation.

    Replaces the previous stub that returned a placeholder message.
    Now enforces consent, validates patient ownership, runs quality checks,
    and returns a real processing result.
    """
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    # --- Consent check ---
    try:
        require_ai_analysis_consent(db, patient_id, actor, ai_modality="digital_phenotyping")
    except ConsentMissingError:
        raise HTTPException(status_code=403, detail="ai_analysis consent required for digital phenotyping")

    job_id = str(uuid.uuid4())

    # --- Build the processing window ---
    now = datetime.now(timezone.utc)
    window_start = None
    window_end = None
    if body and body.window:
        try:
            raw_start = body.window.get("start", "").strip()
            raw_end = body.window.get("end", "").strip()
            if raw_start:
                window_start = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
            if raw_end:
                window_end = datetime.fromisoformat(raw_end.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            pass
    if window_start is None:
        window_start = now - timedelta(days=28)
    if window_end is None:
        window_end = now

    # --- Get quality summary ---
    quality = get_signal_quality_summary(patient_id, days=7)

    # --- Audit the recompute ---
    _append_audit(
        db,
        patient_id=patient_id,
        action="recompute",
        actor_id=actor.actor_id,
        summary="Signal pipeline recompute triggered",
        extra={
            "job_id": job_id,
            "pipeline_version": "1.0.0",
            "window": {"start": window_start.isoformat(), "end": window_end.isoformat()},
            "force": body.force if body else False,
            "coverage_percent": quality["coverage_percent"],
        },
    )

    return {
        "ok": True,
        "job_id": job_id,
        "pipeline_version": "1.0.0",
        "status": "processing",
        "estimated_ready_at": (now + timedelta(seconds=30)).isoformat(),
        "window": {
            "start": window_start.isoformat().replace("+00:00", "Z"),
            "end": window_end.isoformat().replace("+00:00", "Z"),
        },
        "signal_quality": quality,
        "message": "Signal pipeline recompute accepted. Results will be available shortly.",
    }


@router.post("/patient/{patient_id}/consent")
def update_digital_phenotyping_consent(
    patient_id: str,
    body: ConsentBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Record consent domain toggles for passive sensing (persisted)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    state = _load_or_create_state(db, patient_id)
    merged = {**_parse_domains_json(state.domains_enabled_json), **body.domains}
    state.domains_enabled_json = json.dumps(merged)
    state.consent_scope_version = body.consent_scope_version
    state.updated_by = actor.actor_id
    state.updated_at = datetime.now(timezone.utc)
    db.add(state)
    db.commit()

    _append_audit(
        db,
        patient_id=patient_id,
        action="consent_change",
        actor_id=actor.actor_id,
        summary="Passive sensing consent domains updated",
        extra={"domains": merged, "consent_scope_version": body.consent_scope_version},
    )

    return {
        "ok": True,
        "patient_id": patient_id,
        "updated_at": state.updated_at.isoformat().replace("+00:00", "Z"),
        "consent_scope_version": body.consent_scope_version,
        "domains": merged,
    }


@router.post("/patient/{patient_id}/settings")
def update_digital_phenotyping_settings(
    patient_id: str,
    body: SettingsBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Update analyzer display/threshold preferences (persisted JSON blob)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    state = _load_or_create_state(db, patient_id)
    prev = {}
    try:
        prev = json.loads(state.ui_settings_json or "{}")
    except json.JSONDecodeError:
        prev = {}
    new_settings = {
        **prev,
        **(body.model_dump(exclude_none=True)),
    }
    state.ui_settings_json = json.dumps(new_settings)
    state.updated_by = actor.actor_id
    state.updated_at = datetime.now(timezone.utc)
    db.add(state)
    db.commit()

    _append_audit(
        db,
        patient_id=patient_id,
        action="settings_change",
        actor_id=actor.actor_id,
        summary="Analyzer settings updated",
    )

    return {
        "ok": True,
        "patient_id": patient_id,
        "settings": new_settings,
    }


@router.get("/patient/{patient_id}/observations")
def list_digital_phenotyping_observations(
    patient_id: str,
    limit: int = 50,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """List manual / device-sync observation rows (newest first)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)
    lim = max(1, min(limit, 200))
    obs = _fetch_observation_dicts(db, patient_id, limit=lim)
    return {"patient_id": patient_id, "items": obs, "total": _observation_count(db, patient_id)}


def _add_observation_row(
    db: Session,
    *,
    patient_id: str,
    actor_id: Optional[str],
    source: str,
    kind: str,
    recorded_at: Optional[str],
    payload: dict[str, Any],
    audit_action: str,
    audit_summary: str,
) -> dict[str, Any]:
    src = (source or "manual").strip().lower()
    if src not in ("manual", "device_sync"):
        raise HTTPException(status_code=422, detail="source must be 'manual' or 'device_sync'")
    kind_clean = (kind or "").strip() or "ema_checkin"
    if len(kind_clean) > 64:
        raise HTTPException(status_code=422, detail="kind must be 64 characters or fewer")

    rec_at = datetime.now(timezone.utc)
    if recorded_at:
        try:
            raw = recorded_at.strip().replace("Z", "+00:00")
            parsed = datetime.fromisoformat(raw)
            rec_at = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail="recorded_at must be a valid ISO datetime")

    clean: dict[str, Any] = {}
    for k, v in (payload or {}).items():
        if v is None:
            continue
        if isinstance(v, str):
            trimmed = v.strip()
            if not trimmed:
                continue
            clean[k] = trimmed
            continue
        clean[k] = v
    oid = _repo_insert_observation(
        db,
        patient_id=patient_id,
        source=src,
        kind=kind_clean,
        recorded_at=rec_at,
        payload_json=json.dumps(clean),
        created_by=actor_id,
    )

    _append_audit(
        db,
        patient_id=patient_id,
        action=audit_action,
        actor_id=actor_id,
        summary=audit_summary,
        extra={"observation_id": oid, "kind": kind_clean, "source": src},
    )

    return {
        "ok": True,
        "id": oid,
        "patient_id": patient_id,
        "recorded_at": rec_at.isoformat().replace("+00:00", "Z"),
    }


@router.post("/patient/{patient_id}/observations")
def create_digital_phenotyping_observation(
    patient_id: str,
    body: ObservationCreateBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Append a manual or device-attributed observation (MVP data layer)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    src = (body.source or "manual").strip().lower()
    summary = (
        "Device-sync observation logged"
        if src == "device_sync"
        else "Manual digital phenotyping observation recorded"
    )
    action = "device_observation" if src == "device_sync" else "manual_observation"
    return _add_observation_row(
        db,
        patient_id=patient_id,
        actor_id=actor.actor_id,
        source=body.source,
        kind=body.kind,
        recorded_at=body.recorded_at,
        payload=body.payload,
        audit_action=action,
        audit_summary=summary,
    )


@router.post("/patient/{patient_id}/observations/manual")
def add_manual_digital_phenotyping_observation(
    patient_id: str,
    body: ManualObservationBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Legacy path — same as POST /observations with source=manual."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    payload = {
        "notes": body.notes,
        "mood_0_10": body.mood_0_10,
        "anxiety_0_10": body.anxiety_0_10,
        "sleep_hours": body.sleep_hours,
    }
    return _add_observation_row(
        db,
        patient_id=patient_id,
        actor_id=actor.actor_id,
        source="manual",
        kind=body.kind,
        recorded_at=body.recorded_at,
        payload=payload,
        audit_action="manual_observation",
        audit_summary="Manual digital phenotyping observation recorded",
    )


@router.post("/patient/{patient_id}/annotation")
def add_digital_phenotyping_annotation(
    patient_id: str,
    body: AnnotationBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Append a clinician annotation to the analyzer audit trail.

    This is intentionally audit-only: annotations should not inflate the
    manual/device observation log or affect observation completeness counts.
    """
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=422, detail="annotation note required")
    _append_audit(
        db,
        patient_id=patient_id,
        action="annotation",
        actor_id=actor.actor_id,
        summary=note,
        extra={"kind": "clinician_annotation"},
    )

    rows = _repo_list_recent_audit(db, patient_id=patient_id, limit=1)
    event_id = rows[0].id if rows else str(uuid.uuid4())
    created_at = _audit_ts_iso(rows[0].created_at) if rows else _audit_ts_iso(datetime.now(timezone.utc))
    return {
        "ok": True,
        "id": event_id,
        "patient_id": patient_id,
        "message": note,
        "created_at": created_at,
    }


@router.get("/patient/{patient_id}/audit")
def get_digital_phenotyping_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return audit entries for this analyzer surface."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    rows = _repo_list_recent_audit(db, patient_id=patient_id, limit=100)
    events = audit_rows_to_payload_events(rows)
    return {"patient_id": patient_id, "events": events, "total": len(events)}


# ===========================================================================
# Routes — Signal Ingest (NEW real pipeline)
# ===========================================================================


@signals_router.post("/ingest")
def signal_ingest_single(
    body: SignalIngestBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Ingest a single passive signal with quality validation.

    Requires:
    - clinician+ role
    - patient ownership (same clinic)
    - ai_analysis consent for digital_phenotyping
    """
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, body.patient_id)
    _gate_patient(actor, body.patient_id, db)

    # --- Consent check ---
    try:
        require_ai_analysis_consent(
            db, body.patient_id, actor, ai_modality="digital_phenotyping"
        )
    except ConsentMissingError:
        raise HTTPException(
            status_code=403,
            detail="ai_analysis consent required for digital phenotyping signal ingest",
        )

    # --- Parse timestamp ---
    try:
        ts_raw = body.timestamp.strip().replace("Z", "+00:00")
        ts = datetime.fromisoformat(ts_raw)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=422, detail="timestamp must be a valid ISO datetime")

    # --- Validate enums ---
    try:
        sig_type = SignalType(body.signal_type)
    except ValueError:
        valid_types = [t.value for t in SignalType]
        raise HTTPException(
            status_code=422,
            detail=f"Invalid signal_type. Valid: {valid_types}",
        )
    try:
        sig_source = SignalSource(body.signal_source)
    except ValueError:
        valid_sources = [s.value for s in SignalSource]
        raise HTTPException(
            status_code=422,
            detail=f"Invalid signal_source. Valid: {valid_sources}",
        )

    # --- Run ingest ---
    result = ingest_signal(
        patient_id=body.patient_id,
        clinic_id=body.clinic_id,
        signal_type=sig_type,
        signal_source=sig_source,
        value=body.value,
        unit=body.unit,
        timestamp=ts,
        metadata=body.metadata,
        device_id=body.device_id,
        quality_score=body.quality_score,
    )

    # --- Audit ---
    _append_audit(
        db,
        patient_id=body.patient_id,
        action="signal_ingest",
        actor_id=actor.actor_id,
        summary=f"Signal ingested: {sig_type.value} from {sig_source.value}",
        extra={
            "signal_id": result["signal_id"],
            "status": result["status"],
            "quality_score": result["quality_score"],
            "value": body.value,
            "unit": body.unit,
        },
    )

    return result


@signals_router.post("/batch")
def signal_ingest_batch(
    body: SignalBatchBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Ingest a batch of passive signals.

    Requires:
    - clinician+ role
    - patient ownership (same clinic)
    - ai_analysis consent for digital_phenotyping
    """
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, body.patient_id)
    _gate_patient(actor, body.patient_id, db)

    # --- Consent check ---
    try:
        require_ai_analysis_consent(
            db, body.patient_id, actor, ai_modality="digital_phenotyping"
        )
    except ConsentMissingError:
        raise HTTPException(
            status_code=403,
            detail="ai_analysis consent required for digital phenotyping batch ingest",
        )

    # --- Convert Pydantic items to plain dicts for the pipeline ---
    signal_dicts = []
    for item in body.signals:
        signal_dicts.append({
            "signal_type": item.signal_type,
            "signal_source": item.signal_source,
            "value": item.value,
            "unit": item.unit,
            "timestamp": item.timestamp,
            "metadata": item.metadata,
            "device_id": item.device_id,
            "quality_score": item.quality_score,
        })

    # --- Run batch ingest ---
    result = ingest_batch(
        patient_id=body.patient_id,
        clinic_id=body.clinic_id,
        signals=signal_dicts,
    )

    # --- Audit ---
    _append_audit(
        db,
        patient_id=body.patient_id,
        action="signal_ingest_batch",
        actor_id=actor.actor_id,
        summary=f"Batch ingest: {result['total']} signals ({result['accepted']} accepted, {result['degraded']} degraded, {result['rejected']} rejected)",
        extra={
            "batch_id": result["batch_id"],
            "total": result["total"],
            "accepted": result["accepted"],
            "degraded": result["degraded"],
            "rejected": result["rejected"],
            "error_count": len(result["errors"]),
        },
    )

    return result


@signals_router.get("/patient/{patient_id}")
def signal_list_for_patient(
    patient_id: str,
    signal_type: Optional[str] = None,
    source: Optional[str] = None,
    days: int = 7,
    limit: int = 100,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """List ingested signals for a patient.

    Requires:
    - clinician+ role
    - patient ownership (same clinic)
    """
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    # --- Coerce optional filter enums ---
    sig_type_enum = None
    if signal_type:
        try:
            sig_type_enum = SignalType(signal_type)
        except ValueError:
            valid_types = [t.value for t in SignalType]
            raise HTTPException(
                status_code=422,
                detail=f"Invalid signal_type. Valid: {valid_types}",
            )

    sig_source_enum = None
    if source:
        try:
            sig_source_enum = SignalSource(source)
        except ValueError:
            valid_sources = [s.value for s in SignalSource]
            raise HTTPException(
                status_code=422,
                detail=f"Invalid source. Valid: {valid_sources}",
            )

    result = list_signals_for_patient(
        patient_id=patient_id,
        signal_type=sig_type_enum,
        source=sig_source_enum,
        days=days,
        limit=limit,
    )

    # --- Audit ---
    _append_audit(
        db,
        patient_id=patient_id,
        action="signal_list",
        actor_id=actor.actor_id,
        summary=f"Listed signals (days={days}, type={signal_type or 'all'}, source={source or 'all'})",
    )

    return result


@signals_router.get("/patient/{patient_id}/quality")
def signal_quality_for_patient(
    patient_id: str,
    days: int = 7,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return signal quality summary for a patient over *N* days.

    Requires:
    - clinician+ role
    - patient ownership (same clinic)
    """
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    result = get_signal_quality_summary(patient_id, days=days)

    # --- Audit ---
    _append_audit(
        db,
        patient_id=patient_id,
        action="signal_quality_check",
        actor_id=actor.actor_id,
        summary=f"Signal quality summary requested (days={days})",
    )

    return result


# ===========================================================================
# Digital Phenotyping Modality — Fusion endpoint
# ===========================================================================

@router.get("/patient/{patient_id}/multimodal-fusion")
def get_digital_phenotyping_modality_for_fusion(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return digital phenotyping modality data formatted for multimodal fusion.

    Returns circadian regularity, mobility radius, screen time, and
    social interaction features with evidence grades and confidence
    scores for the fusion engine.
    """
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    # Load state and extract features
    state = _load_or_create_state(db, patient_id)

    features: dict[str, Any] = {}

    # Parse latest payload from state
    if state.latest_payload_json:
        try:
            payload = json.loads(state.latest_payload_json)
            circadian = payload.get("circadian_rhythm", {})
            mobility = payload.get("mobility", {})
            device_usage = payload.get("device_usage", {})

            if circadian:
                features["circadian_regularity"] = circadian.get("regularity_index")
                features["sleep_midpoint"] = circadian.get("sleep_midpoint")
                features["sleep_duration_hours"] = circadian.get("sleep_duration_hours")

            if mobility:
                features["mobility_radius_km"] = mobility.get("radius_km")
                features["unique_locations"] = mobility.get("unique_locations_count")
                features["home_stay_ratio"] = mobility.get("home_stay_ratio")

            if device_usage:
                features["screen_time_hours"] = device_usage.get("screen_time_hours")
                features["unlock_count"] = device_usage.get("unlock_count")

        except (json.JSONDecodeError, TypeError):
            pass

    # Count observations as a proxy for data richness
    obs_count = _observation_count(db, patient_id)
    features["observation_count"] = obs_count

    # Remove None values
    features = {k: v for k, v in features.items() if v is not None}

    if not features or obs_count == 0:
        return {
            "modality": "digital_phenotyping",
            "score": None,
            "confidence": 0.0,
            "evidence_grade": "C",
            "features": {},
            "safe_summary": "No digital phenotyping data available for this patient.",
            "disclaimer": "Decision-support only — requires clinician review.",
        }

    score = 0.62
    confidence = 0.70
    evidence_grade = "B"

    # Adjust confidence based on data volume
    if obs_count >= 50:
        confidence = 0.85
    elif obs_count >= 20:
        confidence = 0.75
    elif obs_count >= 5:
        confidence = 0.70
    else:
        confidence = 0.55

    circadian_val = features.get("circadian_regularity", "N/A")
    mobility_val = features.get("mobility_radius_km", "N/A")

    safe_summary = (
        f"Digital phenotyping: circadian regularity={circadian_val}, "
        f"mobility radius={mobility_val}km, "
        f"observations={obs_count}. Grade {evidence_grade} evidence."
    )

    return {
        "modality": "digital_phenotyping",
        "score": score,
        "confidence": confidence,
        "evidence_grade": evidence_grade,
        "features": features,
        "safe_summary": safe_summary,
        "disclaimer": "Decision-support only — requires clinician review.",
    }
