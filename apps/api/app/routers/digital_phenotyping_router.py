"""Digital Phenotyping Analyzer — passive behavioral signals (decision-support).

GET    /api/v1/digital-phenotyping/analyzer/patient/{patient_id}
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/recompute
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/consent
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/settings
GET    /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/audit
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

router = APIRouter(
    prefix="/api/v1/digital-phenotyping/analyzer",
    tags=["Digital Phenotyping"],
)


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
    """Trigger recomputation (stub — returns job id)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)
    job_id = str(uuid.uuid4())

    _append_audit(
        db,
        patient_id=patient_id,
        action="recompute",
        actor_id=actor.actor_id,
        summary="Recompute requested — passive signal ingest pipeline is in preview",
        extra={"job_id": job_id, "status": "preview"},
    )

    return {
        "status": "preview",
        "message": "Passive signal ingest pipeline is in preview. Live recompute not yet connected.",
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


# ── Behaviour sub-router (preview — full backend integration pending) ──────────

_behaviour_router = APIRouter(
    prefix="/api/v1/digital-phenotyping/behaviour",
    tags=["Digital Phenotyping — Behaviour"],
)


# core-schema-exempt: behaviour response shape; not reused outside this router
class BehaviourProtocolOut(BaseModel):
    type: str
    label: str
    status: str
    notes: str | None = None
    started_at: str | None = None


# core-schema-exempt: behaviour response shape; not reused outside this router
class BehaviourObservationOut(BaseModel):
    recorded_at: str | None = None
    category: str
    note: str
    recorded_by: str | None = None


# core-schema-exempt: behaviour response shape; not reused outside this router
class BehaviourOutcomeOut(BaseModel):
    type: str
    label: str
    latest_value: float | None = None
    previous_value: float | None = None
    trend: str = "stable"
    history: list[float] = Field(default_factory=list)


# core-schema-exempt: behaviour response shape; not reused outside this router
class BehaviourSafetyFlagOut(BaseModel):
    level: str
    category: str
    description: str | None = None
    raised_at: str | None = None
    raised_by: str | None = None


# core-schema-exempt: behaviour response shape; not reused outside this router
class BehaviourPatientProfileOut(BaseModel):
    patient_id: str
    patient_name: str
    protocols: list[BehaviourProtocolOut] = Field(default_factory=list)
    observations: list[BehaviourObservationOut] = Field(default_factory=list)
    outcomes: list[BehaviourOutcomeOut] = Field(default_factory=list)
    safety_flags: list[BehaviourSafetyFlagOut] = Field(default_factory=list)
    last_reviewed_at: str | None = None
    reviewed_by: str | None = None


# core-schema-exempt: behaviour response shape; not reused outside this router
class BehaviourClinicPatientOut(BaseModel):
    patient_id: str
    patient_name: str
    active_protocol_count: int = 0
    flag_count: int = 0
    last_observation_at: str | None = None
    worst_flag: str | None = None


# core-schema-exempt: behaviour response shape; not reused outside this router
class BehaviourClinicSummaryOut(BaseModel):
    patients: list[BehaviourClinicPatientOut] = Field(default_factory=list)
    total_active_protocols: int = 0
    total_flags: int = 0
    captured_at: str | None = None
    preview_note: str = "Preview workspace — full behavioural backend integration pending"


def _check_behaviour_consent(db: Session, patient_id: str) -> bool:
    """Check if patient has consented to behavioural data collection."""
    state = _repo_load_or_create_state(
        db,
        patient_id=patient_id,
        default_domains_enabled=DEFAULT_DOMAINS_ENABLED,
    )
    domains = _parse_domains_json(state.domains_enabled_json)
    return domains.get("ema_active", False) or domains.get("device_engagement", False)


def _minimal_behaviour_profile(patient_id: str, patient_name: str | None) -> BehaviourPatientProfileOut:
    """Return a minimal honest profile when no behavioural backend is connected."""
    return BehaviourPatientProfileOut(
        patient_id=patient_id,
        patient_name=patient_name or patient_id,
        protocols=[],
        observations=[],
        outcomes=[],
        safety_flags=[],
        last_reviewed_at=None,
        reviewed_by=None,
    )


def _minimal_behaviour_clinic_summary(clinic_id: str) -> BehaviourClinicSummaryOut:
    """Return a minimal honest clinic summary when no behavioural backend is connected."""
    return BehaviourClinicSummaryOut(
        patients=[],
        total_active_protocols=0,
        total_flags=0,
        captured_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        preview_note="Preview workspace — full behavioural backend integration pending",
    )


@_behaviour_router.get("/clinic-summary", response_model=BehaviourClinicSummaryOut)
def get_behaviour_clinic_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return clinic-scoped behavioural summary (preview — returns minimal data)."""
    require_minimum_role(actor, "clinician")

    _append_audit(
        db,
        patient_id=f"clinic-{actor.clinic_id}",
        action="behaviour_clinic_summary",
        actor_id=actor.actor_id,
        summary="Behaviour clinic summary requested (preview)",
        extra={"clinic_id": actor.clinic_id, "status": "preview"},
    )

    patients = _repo_list_clinic_patients(
        db,
        clinic_id=actor.clinic_id,
        include_all=actor.role == "admin",
    )

    items: list[BehaviourClinicPatientOut] = []
    for patient in patients:
        pname = _patient_display_name(db, patient.id) or patient.id
        items.append(BehaviourClinicPatientOut(
            patient_id=patient.id,
            patient_name=pname or patient.id,
            active_protocol_count=0,
            flag_count=0,
            last_observation_at=None,
            worst_flag=None,
        ))

    return BehaviourClinicSummaryOut(
        patients=items,
        total_active_protocols=0,
        total_flags=0,
        captured_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        preview_note="Preview workspace — full behavioural backend integration pending",
    )


@_behaviour_router.get("/patient/{patient_id}/profile", response_model=BehaviourPatientProfileOut)
def get_behaviour_patient_profile(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return behavioural profile for one patient (preview — returns minimal data)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    consent_ok = _check_behaviour_consent(db, patient_id)
    pname = _patient_display_name(db, patient_id)

    _append_audit(
        db,
        patient_id=patient_id,
        action="behaviour_profile_view",
        actor_id=actor.actor_id,
        summary="Behaviour patient profile viewed (preview)",
        extra={"consent_ok": consent_ok, "status": "preview"},
    )

    return _minimal_behaviour_profile(patient_id, pname)


@_behaviour_router.get("/patient/{patient_id}/audit")
def get_behaviour_patient_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return behavioural audit trail for one patient (preview — returns empty)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)

    _append_audit(
        db,
        patient_id=patient_id,
        action="behaviour_audit_view",
        actor_id=actor.actor_id,
        summary="Behaviour patient audit viewed (preview)",
        extra={"status": "preview"},
    )

    rows = _repo_list_recent_audit(db, patient_id=patient_id, limit=50)
    events = audit_rows_to_payload_events(rows)
    return {"patient_id": patient_id, "items": events, "total": len(events), "preview_note": "Preview workspace — full behavioural backend integration pending"}


router_behaviour = _behaviour_router
