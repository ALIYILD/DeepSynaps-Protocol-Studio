"""Medication Analyzer — aggregated decision-support payload for the Studio UI.

Prefix: ``/api/v1/medications/analyzer`` (does not replace ``/api/v1/medications`` CRUD).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.persistence.models import PatientMedication
from app.repositories.patients import resolve_patient_clinic_id
from app.routers.medications_router import MedicationOut
from app.services.medication_analyzer import build_page_payload, json_dump_stable
from app.services import medication_analyzer as med_az

router = APIRouter(
    prefix="/api/v1/medications/analyzer",
    tags=["Medication Analyzer"],
)

# In-memory audit + review notes (MVP; replace with DB table when productized)
_ANALYZER_AUDIT: list[dict[str, Any]] = []
_REVIEW_NOTES: list[dict[str, Any]] = []


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _med_rows_for_patient(
    db: Session, patient_id: str, actor: AuthenticatedActor
) -> list[dict[str, Any]]:
    q = db.query(PatientMedication).filter(PatientMedication.patient_id == patient_id)
    if actor.role != "admin":
        q = q.filter(PatientMedication.clinician_id == actor.actor_id)
    records = q.order_by(PatientMedication.created_at.desc()).all()
    rows: list[dict[str, Any]] = []
    for r in records:
        mo = MedicationOut.from_record(r)
        rows.append(
            {
                "id": mo.id,
                "patient_id": mo.patient_id,
                "name": mo.name,
                "generic_name": mo.generic_name,
                "drug_class": mo.drug_class or "",
                "dose": mo.dose,
                "frequency": mo.frequency,
                "route": mo.route,
                "indication": mo.indication,
                "active": mo.active,
                "started_at": mo.started_at,
                "stopped_at": mo.stopped_at,
                "created_at": mo.created_at,
                "updated_at": mo.updated_at,
                "source": "clinician_entry",
            }
        )
    return rows


def _append_audit(
    patient_id: str,
    actor_id: str,
    action: str,
    detail: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    entry = {
        "id": str(uuid.uuid4()),
        "at": datetime.now(timezone.utc).isoformat(),
        "patient_id": patient_id,
        "actor_id": actor_id,
        "action": action,
        "detail": detail or {},
        "payload_hash": None,
    }
    if detail and "payload" in detail:
        import hashlib

        entry["payload_hash"] = hashlib.sha256(
            json_dump_stable(detail["payload"]).encode()
        ).hexdigest()[:24]
    _ANALYZER_AUDIT.append(entry)
    return entry


class RecomputeBody(BaseModel):
    force: bool = False
    modules: Optional[list[str]] = None


class RecomputeResponse(BaseModel):
    status: str = "complete"
    audit_ref: Optional[str] = None


class AdherencePostBody(BaseModel):
    window_days: int = Field(default=30, ge=7, le=365)


class TimelineEventInput(BaseModel):
    event_type: str
    occurred_at: str
    medication_id: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    source_origin: str = "clinician_entry"


class TimelineEventResponse(BaseModel):
    ok: bool = True
    event: dict[str, Any]


class ReviewNoteBody(BaseModel):
    note_text: str = Field(..., min_length=1, max_length=8000)
    linked_recommendation_ids: list[str] = Field(default_factory=list)


class ReviewNoteResponse(BaseModel):
    note_id: str
    created_at: str


class AuditListResponse(BaseModel):
    entries: list[dict[str, Any]]


@router.get("/patient/{patient_id}")
def get_medication_analyzer_payload(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return the full Medication Analyzer page payload."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rows = _med_rows_for_patient(db, patient_id, actor)
    payload = build_page_payload(patient_id, rows)
    _append_audit(
        patient_id,
        actor.actor_id,
        "analyzer_payload_read",
        {"audit_ref": payload.get("audit_ref")},
    )
    return payload


@router.post("/patient/{patient_id}/recompute", response_model=RecomputeResponse)
def recompute_medication_analyzer(
    patient_id: str,
    body: RecomputeBody | None = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RecomputeResponse:
    """Recompute payload (MVP: synchronous; rules-only)."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rows = _med_rows_for_patient(db, patient_id, actor)
    payload = build_page_payload(patient_id, rows)
    _append_audit(
        patient_id,
        actor.actor_id,
        "analyzer_recompute",
        {"modules": (body.modules if body else None), "audit_ref": payload.get("audit_ref")},
    )
    return RecomputeResponse(status="complete", audit_ref=payload.get("audit_ref"))


@router.post("/patient/{patient_id}/adherence")
def post_adherence_window(
    patient_id: str,
    body: AdherencePostBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return adherence estimate for the requested window."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rows = _med_rows_for_patient(db, patient_id, actor)
    active_n = sum(1 for r in rows if r.get("active"))
    est = med_az.estimate_medication_adherence(active_n)
    est["window_days"] = body.window_days
    _append_audit(patient_id, actor.actor_id, "adherence_estimate", {"window_days": body.window_days})
    return est


@router.post("/patient/{patient_id}/timeline-event", response_model=TimelineEventResponse)
def add_timeline_event(
    patient_id: str,
    body: TimelineEventInput,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TimelineEventResponse:
    """Record an analyzer timeline annotation (does not mutate Rx rows in MVP)."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    ev = {
        "id": f"anno-{uuid.uuid4().hex[:12]}",
        "patient_id": patient_id,
        "event_type": body.event_type,
        "occurred_at": body.occurred_at,
        "medication_id": body.medication_id,
        "payload": body.payload,
        "source": {
            "origin": body.source_origin,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "confidence": 1.0,
        },
        "confidence": 1.0,
    }
    _append_audit(
        patient_id,
        actor.actor_id,
        "timeline_annotation",
        {"event_id": ev["id"]},
    )
    return TimelineEventResponse(ok=True, event=ev)


@router.post("/patient/{patient_id}/review-note", response_model=ReviewNoteResponse)
def add_review_note(
    patient_id: str,
    body: ReviewNoteBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReviewNoteResponse:
    """Attach a clinician review note to the analyzer context."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    nid = str(uuid.uuid4())
    created = datetime.now(timezone.utc).isoformat()
    _REVIEW_NOTES.append(
        {
            "note_id": nid,
            "patient_id": patient_id,
            "actor_id": actor.actor_id,
            "created_at": created,
            "note_text": body.note_text,
            "linked_recommendation_ids": body.linked_recommendation_ids,
        }
    )
    _append_audit(
        patient_id,
        actor.actor_id,
        "review_note",
        {"note_id": nid, "linked": body.linked_recommendation_ids},
    )
    return ReviewNoteResponse(note_id=nid, created_at=created)


@router.get("/patient/{patient_id}/audit", response_model=AuditListResponse)
def list_analyzer_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditListResponse:
    """Return analyzer-specific audit entries for the patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    entries = [e for e in _ANALYZER_AUDIT if e.get("patient_id") == patient_id]
    return AuditListResponse(entries=entries)
