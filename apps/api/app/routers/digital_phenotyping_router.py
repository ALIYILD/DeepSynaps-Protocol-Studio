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
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.persistence.models import (
    DigitalPhenotypingAudit,
    DigitalPhenotypingPatientState,
    Patient,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.services.digital_phenotyping import (
    DEFAULT_DOMAINS_ENABLED,
    audit_rows_to_payload_events,
    build_stub_analyzer_payload,
    merge_state_into_payload,
    _parse_domains_json,
)

router = APIRouter(
    prefix="/api/v1/digital-phenotyping/analyzer",
    tags=["Digital Phenotyping"],
)


class ConsentBody(BaseModel):
    domains: dict[str, bool] = Field(default_factory=dict)
    consent_scope_version: str = "2026.04"
    artifact_ref: Optional[str] = None


class SettingsBody(BaseModel):
    alert_thresholds: Optional[dict[str, Any]] = None
    ui_preferences: Optional[dict[str, Any]] = None
    minimization_tier: Optional[str] = None


class RecomputeBody(BaseModel):
    window: Optional[dict[str, str]] = None
    domains: Optional[list[str]] = None
    force: bool = False


def _require_known_patient(db: Session, patient_id: str) -> None:
    exists, _clinic = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")


def _gate_patient(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _patient_display_name(db: Session, patient_id: str) -> Optional[str]:
    row = db.execute(select(Patient).where(Patient.id == patient_id)).scalar_one_or_none()
    if row is None:
        return None
    parts = [row.first_name or "", row.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or None


def _load_or_create_state(db: Session, patient_id: str) -> DigitalPhenotypingPatientState:
    row = db.execute(
        select(DigitalPhenotypingPatientState).where(
            DigitalPhenotypingPatientState.patient_id == patient_id
        )
    ).scalar_one_or_none()
    if row is None:
        row = DigitalPhenotypingPatientState(
            patient_id=patient_id,
            domains_enabled_json=json.dumps(DEFAULT_DOMAINS_ENABLED),
            ui_settings_json="{}",
            consent_scope_version="2026.04",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


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
    db.add(
        DigitalPhenotypingAudit(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            action=action,
            detail_json=json.dumps(detail),
            actor_id=actor_id,
        )
    )
    db.commit()


def _build_payload_for_patient(
    db: Session, patient_id: str, *, hide_stub_audit: bool
) -> dict[str, Any]:
    pname = _patient_display_name(db, patient_id)
    state = _load_or_create_state(db, patient_id)
    domains = _parse_domains_json(state.domains_enabled_json)
    base = build_stub_analyzer_payload(patient_id, patient_name=pname)
    return merge_state_into_payload(
        base,
        domains_enabled=domains,
        consent_scope_version=state.consent_scope_version or "2026.04",
        state_updated_at=state.updated_at,
        hide_stub_audit_when_persisted=hide_stub_audit,
    )


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

    latest = db.execute(
        select(DigitalPhenotypingAudit)
        .where(DigitalPhenotypingAudit.patient_id == patient_id)
        .order_by(DigitalPhenotypingAudit.created_at.desc())
        .limit(25)
    ).scalars().all()
    payload["audit_events"] = audit_rows_to_payload_events(list(latest))
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

    rows = db.execute(
        select(DigitalPhenotypingAudit)
        .where(DigitalPhenotypingAudit.patient_id == patient_id)
        .order_by(DigitalPhenotypingAudit.created_at.desc())
        .limit(100)
    ).scalars().all()
    events = audit_rows_to_payload_events(list(rows))
    return {"patient_id": patient_id, "events": events, "total": len(events)}
