"""Labs / Blood Biomarkers Analyzer — decision-support payload + audit (MVP)."""

from __future__ import annotations

import uuid
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
from app.persistence.models import Patient
from app.repositories.patients import resolve_patient_clinic_id
from app.schemas.labs_analyzer import (
    LabReviewAuditEvent,
    LabsAnalyzerPagePayload,
    LabsAuditResponse,
)
from app.services.labs_analyzer import (
    append_audit_event,
    build_labs_analyzer_payload,
    get_audit_trail,
    recompute_and_payload,
)

router = APIRouter(prefix="/api/v1/labs/analyzer", tags=["Labs Analyzer"])


class AnnotationRequest(BaseModel):
    target_type: str = Field(..., description="interpretation | result | flag")
    target_id: str
    text: str = Field(..., min_length=1, max_length=8000)
    tags: list[str] = Field(default_factory=list)


class ReviewNoteRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=8000)
    acknowledged_alert_ids: list[str] = Field(default_factory=list)
    evidence_ack_ids: list[str] = Field(default_factory=list)


class RecomputeRequest(BaseModel):
    reason: str = "manual"
    options: dict[str, Any] = Field(default_factory=dict)


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _patient_display_name(db: Session, patient_id: str) -> Optional[str]:
    row = db.execute(select(Patient).where(Patient.id == patient_id)).scalar_one_or_none()
    if not row:
        return None
    parts = [row.first_name or "", row.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or None


@router.get("/patient/{patient_id}", response_model=LabsAnalyzerPagePayload)
def get_labs_analyzer_payload(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    display = _patient_display_name(db, patient_id)
    append_audit_event(
        patient_id,
        LabReviewAuditEvent(
            event_id=str(uuid.uuid4()),
            event_type="view",
            actor_user_id=actor.actor_id,
            timestamp=_ts(),
            payload={"source": "get_labs_analyzer_payload"},
        ),
    )
    return build_labs_analyzer_payload(patient_id, db, patient_name=display)


def _ts() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@router.post("/patient/{patient_id}/recompute", response_model=LabsAnalyzerPagePayload)
def post_labs_recompute(
    patient_id: str,
    body: RecomputeRequest | None = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    del body
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    display = _patient_display_name(db, patient_id)
    return recompute_and_payload(
        patient_id, db, patient_name=display, actor_id=actor.actor_id
    )


@router.post("/patient/{patient_id}/annotation", response_model=dict)
def post_labs_annotation(
    patient_id: str,
    body: AnnotationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    append_audit_event(
        patient_id,
        LabReviewAuditEvent(
            event_id=str(uuid.uuid4()),
            event_type="annotation",
            actor_user_id=actor.actor_id,
            timestamp=_ts(),
            payload={
                "target_type": body.target_type,
                "target_id": body.target_id,
                "text": body.text,
                "tags": body.tags,
            },
        ),
    )
    return {"ok": True, "patient_id": patient_id}


@router.post("/patient/{patient_id}/review-note", response_model=dict)
def post_labs_review_note(
    patient_id: str,
    body: ReviewNoteRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    append_audit_event(
        patient_id,
        LabReviewAuditEvent(
            event_id=str(uuid.uuid4()),
            event_type="note",
            actor_user_id=actor.actor_id,
            timestamp=_ts(),
            payload={
                "note": body.note,
                "acknowledged_alert_ids": body.acknowledged_alert_ids,
                "evidence_ack_ids": body.evidence_ack_ids,
            },
        ),
    )
    return {"ok": True, "patient_id": patient_id}


@router.get("/patient/{patient_id}/audit", response_model=LabsAuditResponse)
def get_labs_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    items = get_audit_trail(patient_id)
    return LabsAuditResponse(patient_id=patient_id, items=items)
