"""Digital Phenotyping Analyzer — passive behavioral signals (decision-support).

GET    /api/v1/digital-phenotyping/analyzer/patient/{patient_id}
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/recompute
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/consent
POST   /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/settings
GET    /api/v1/digital-phenotyping/analyzer/patient/{patient_id}/audit
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.repositories.patients import resolve_patient_clinic_id
from app.services.digital_phenotyping import build_stub_analyzer_payload
from sqlalchemy.orm import Session

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
    from sqlalchemy import select

    from app.persistence.models import Patient

    row = db.execute(select(Patient).where(Patient.id == patient_id)).scalar_one_or_none()
    if row is None:
        return None
    parts = [row.first_name or "", row.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or None


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

    pname = _patient_display_name(db, patient_id)
    payload = build_stub_analyzer_payload(patient_id, patient_name=pname)
    # Future: merge real consent gating — omit disabled domains from domains[] / snapshot.
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
    # Audit hook: log recompute request (persist when audit store exists)
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
    """Record consent changes (stub — returns echoed state)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)
    now = datetime.now(timezone.utc).isoformat()
    return {
        "ok": True,
        "patient_id": patient_id,
        "updated_at": now,
        "consent_scope_version": body.consent_scope_version,
        "domains": body.domains,
        "note": "Persisted consent storage not yet wired; this acknowledges the request.",
    }


@router.post("/patient/{patient_id}/settings")
def update_digital_phenotyping_settings(
    patient_id: str,
    body: SettingsBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Update analyzer display/threshold preferences (stub)."""
    require_minimum_role(actor, "clinician")
    _require_known_patient(db, patient_id)
    _gate_patient(actor, patient_id, db)
    return {
        "ok": True,
        "patient_id": patient_id,
        "settings": body.model_dump(exclude_none=True),
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
    payload = build_stub_analyzer_payload(patient_id)
    events = payload.get("audit_events") or []
    return {"patient_id": patient_id, "events": events, "total": len(events)}
