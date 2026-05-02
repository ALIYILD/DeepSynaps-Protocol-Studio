"""Digital Phenotyping Analyzer — passive behavioral signals (decision-support).

GET    /api/v1/digital-phenotyping/analyzer/patient/{patient_id}
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/recompute
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/consent
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/settings
GET    /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/audit
"""

from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
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
    list_recent_audit as _repo_list_recent_audit,
    list_recent_observations as _repo_list_recent_observations,
    load_or_create_state as _repo_load_or_create_state,
    observation_to_dict as _repo_observation_to_dict,
    update_state as _repo_update_state,
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
        summary="Recompute requested (stub pipeline)",
        extra={"job_id": job_id},
    )

    return {
        "ok": True,
        "job_id": job_id,
        "estimated_ready_at": datetime.now(timezone.utc).isoformat(),
        "message": "Stub recompute accepted; passive ingest pipeline not yet connected.",
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

    rec_at = datetime.now(timezone.utc)
    if recorded_at:
        try:
            raw = recorded_at.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(raw)
            rec_at = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass

    clean = {k: v for k, v in (payload or {}).items() if v is not None and v != ""}
    oid = _repo_insert_observation(
        db,
        patient_id=patient_id,
        source=src,
        kind=kind or "ema_checkin",
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
        extra={"observation_id": oid, "kind": kind, "source": src},
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
