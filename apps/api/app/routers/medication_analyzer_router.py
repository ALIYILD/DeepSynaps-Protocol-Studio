"""Medication Analyzer — aggregated decision-support payload for the Studio UI.

Prefix: ``/api/v1/medications/analyzer`` (does not replace ``/api/v1/medications`` CRUD).

Audit rows, review notes, and timeline annotations persist to SQL tables;
regulatory audit breadcrumbs post to the umbrella ``audit_events`` stream.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends
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
from app.repositories.medication_analyzer import (
    MedicationAnalyzerAudit,
    MedicationAnalyzerReviewNote,
    MedicationAnalyzerTimelineEvent,
    Patient,
    PatientMedication,
    User,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.routers.medications_router import MedicationOut
from app.services import medication_analyzer as med_az
from app.services.medication_analyzer import RULESET_VERSION, build_page_payload

_log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/medications/analyzer",
    tags=["Medication Analyzer"],
)


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _medication_access_filter(stmt, actor: AuthenticatedActor):
    """Clinic-wide medication visibility for covering clinicians; solo fallback."""
    if actor.role == "admin":
        return stmt
    if actor.clinic_id:
        return stmt.where(User.clinic_id == actor.clinic_id)
    return stmt.where(PatientMedication.clinician_id == actor.actor_id)


def _med_rows_for_patient(
    db: Session, patient_id: str, actor: AuthenticatedActor
) -> list[dict[str, Any]]:
    stmt = (
        select(PatientMedication)
        .join(Patient, Patient.id == PatientMedication.patient_id)
        .join(User, User.id == Patient.clinician_id)
        .where(PatientMedication.patient_id == patient_id)
    )
    stmt = _medication_access_filter(stmt, actor)
    records = db.execute(stmt).scalars().all()
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


def _review_notes_from_db(db: Session, patient_id: str) -> list[dict[str, Any]]:
    rows = (
        db.execute(
            select(MedicationAnalyzerReviewNote)
            .where(MedicationAnalyzerReviewNote.patient_id == patient_id)
            .order_by(MedicationAnalyzerReviewNote.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [
        {
            "note_id": r.id,
            "patient_id": r.patient_id,
            "actor_id": r.actor_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "note_text": r.note_text,
            "linked_recommendation_ids": json.loads(r.linked_recommendation_ids_json or "[]"),
        }
        for r in rows
    ]


def _assemble_payload(db: Session, patient_id: str, actor: AuthenticatedActor) -> dict[str, Any]:
    """Full analyzer JSON including persisted review notes (no audit side-effects)."""
    rows = _med_rows_for_patient(db, patient_id, actor)
    extra_tl = _timeline_rows_from_db(db, patient_id)
    payload = build_page_payload(patient_id, rows, extra_timeline_events=extra_tl)
    payload["persisted_review_notes"] = _review_notes_from_db(db, patient_id)
    return payload


def _timeline_rows_from_db(db: Session, patient_id: str) -> list[dict[str, Any]]:
    q = (
        select(MedicationAnalyzerTimelineEvent)
        .where(MedicationAnalyzerTimelineEvent.patient_id == patient_id)
        .order_by(MedicationAnalyzerTimelineEvent.created_at.asc())
    )
    rows = db.execute(q).scalars().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        try:
            payload = json.loads(r.payload_json or "{}")
        except Exception:
            payload = {}
        out.append(
            {
                "id": r.id,
                "patient_id": r.patient_id,
                "event_type": r.event_type,
                "occurred_at": r.occurred_at,
                "medication_id": r.medication_id,
                "payload": payload,
                "source": {
                    "origin": r.source_origin,
                    "recorded_at": r.created_at.isoformat()
                    if r.created_at
                    else datetime.now(timezone.utc).isoformat(),
                    "confidence": 1.0,
                },
                "confidence": 1.0,
            }
        )
    return out


def _umbrella_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    patient_id: str,
    note: str = "",
) -> None:
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"medication_analyzer-{event}-{actor.actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    final_note = (note[:500] if note else event)[:1024]
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=patient_id,
            target_type="medication_analyzer",
            action=f"medication_analyzer.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note,
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block
        _log.exception("medication_analyzer umbrella audit skipped")


def _persist_analyzer_audit(
    db: Session,
    patient_id: str,
    actor_id: str,
    action: str,
    *,
    audit_ref: Optional[str] = None,
    detail: Optional[dict[str, Any]] = None,
) -> MedicationAnalyzerAudit:
    row = MedicationAnalyzerAudit(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        actor_id=actor_id,
        action=action,
        audit_ref=audit_ref,
        ruleset_version=RULESET_VERSION,
        detail_json=json.dumps(detail, default=str) if detail else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _audit_row_to_entry(row: MedicationAnalyzerAudit) -> dict[str, Any]:
    detail = None
    if row.detail_json:
        try:
            detail = json.loads(row.detail_json)
        except Exception:
            detail = {"raw": row.detail_json}
    return {
        "id": row.id,
        "at": row.created_at.isoformat() if row.created_at else None,
        "patient_id": row.patient_id,
        "actor_id": row.actor_id,
        "action": row.action,
        "audit_ref": row.audit_ref,
        "ruleset_version": row.ruleset_version,
        "detail": detail or {},
    }


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class RecomputeBody(BaseModel):
    force: bool = False
    modules: Optional[list[str]] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class RecomputeResponse(BaseModel):
    status: str = "complete"
    audit_ref: Optional[str] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class AdherencePostBody(BaseModel):
    window_days: int = Field(default=30, ge=7, le=365)


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class TimelineEventInput(BaseModel):
    event_type: str
    occurred_at: str
    medication_id: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    source_origin: str = "clinician_entry"


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class TimelineEventResponse(BaseModel):
    ok: bool = True
    event: dict[str, Any]
    full_payload: Optional[dict[str, Any]] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class ReviewNoteBody(BaseModel):
    note_text: str = Field(..., min_length=1, max_length=8000)
    linked_recommendation_ids: list[str] = Field(default_factory=list)


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class ReviewNoteResponse(BaseModel):
    note_id: str
    created_at: str
    full_payload: Optional[dict[str, Any]] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class AuditListResponse(BaseModel):
    entries: list[dict[str, Any]]
    review_notes: list[dict[str, Any]]


@router.get("/patient/{patient_id}")
def get_medication_analyzer_payload(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return the full Medication Analyzer page payload."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    payload = _assemble_payload(db, patient_id, actor)

    _persist_analyzer_audit(
        db,
        patient_id,
        actor.actor_id,
        "analyzer_payload_read",
        audit_ref=payload.get("audit_ref"),
        detail={"audit_ref": payload.get("audit_ref")},
    )
    _umbrella_audit(db, actor, event="payload_view", patient_id=patient_id)
    return payload


@router.post("/patient/{patient_id}/recompute", response_model=RecomputeResponse)
def recompute_medication_analyzer(
    patient_id: str,
    body: RecomputeBody | None = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RecomputeResponse:
    """Recompute payload (synchronous; deterministic rules)."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    payload = _assemble_payload(db, patient_id, actor)

    _persist_analyzer_audit(
        db,
        patient_id,
        actor.actor_id,
        "analyzer_recompute",
        audit_ref=payload.get("audit_ref"),
        detail={"modules": (body.modules if body else None), "audit_ref": payload.get("audit_ref")},
    )
    _umbrella_audit(
        db,
        actor,
        event="recompute",
        patient_id=patient_id,
        note=json.dumps({"modules": body.modules if body else None})[:500],
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
    _persist_analyzer_audit(
        db,
        patient_id,
        actor.actor_id,
        "adherence_estimate",
        detail={"window_days": body.window_days},
    )
    _umbrella_audit(db, actor, event="adherence_query", patient_id=patient_id)
    return est


@router.post("/patient/{patient_id}/timeline-event", response_model=TimelineEventResponse)
def add_timeline_event(
    patient_id: str,
    body: TimelineEventInput,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TimelineEventResponse:
    """Persist a clinician timeline annotation (does not mutate Rx rows)."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    eid = str(uuid.uuid4())
    row = MedicationAnalyzerTimelineEvent(
        id=eid,
        patient_id=patient_id,
        actor_id=actor.actor_id,
        event_type=body.event_type,
        occurred_at=body.occurred_at,
        medication_id=body.medication_id,
        payload_json=json.dumps(body.payload, default=str),
        source_origin=body.source_origin,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    ev = {
        "id": row.id,
        "patient_id": row.patient_id,
        "event_type": row.event_type,
        "occurred_at": row.occurred_at,
        "medication_id": row.medication_id,
        "payload": body.payload,
        "source": {
            "origin": row.source_origin,
            "recorded_at": row.created_at.isoformat(),
            "confidence": 1.0,
        },
        "confidence": 1.0,
    }
    _persist_analyzer_audit(
        db,
        patient_id,
        actor.actor_id,
        "timeline_annotation",
        detail={"event_id": eid},
    )
    _umbrella_audit(db, actor, event="timeline_event_create", patient_id=patient_id, note=eid)
    full = _assemble_payload(db, patient_id, actor)
    return TimelineEventResponse(ok=True, event=ev, full_payload=full)


@router.post("/patient/{patient_id}/review-note", response_model=ReviewNoteResponse)
def add_review_note(
    patient_id: str,
    body: ReviewNoteBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReviewNoteResponse:
    """Persist a clinician review note."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    nid = str(uuid.uuid4())
    row = MedicationAnalyzerReviewNote(
        id=nid,
        patient_id=patient_id,
        actor_id=actor.actor_id,
        note_text=body.note_text,
        linked_recommendation_ids_json=json.dumps(body.linked_recommendation_ids),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    created = row.created_at.isoformat() if row.created_at else datetime.now(timezone.utc).isoformat()

    _persist_analyzer_audit(
        db,
        patient_id,
        actor.actor_id,
        "review_note",
        detail={"note_id": nid, "linked": body.linked_recommendation_ids},
    )
    _umbrella_audit(
        db,
        actor,
        event="review_note_create",
        patient_id=patient_id,
        note=f"id={nid}",
    )
    full = _assemble_payload(db, patient_id, actor)
    return ReviewNoteResponse(note_id=nid, created_at=created, full_payload=full)


@router.get("/patient/{patient_id}/audit", response_model=AuditListResponse)
def list_analyzer_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditListResponse:
    """Return persisted analyzer audit rows and review notes."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    aud_rows = (
        db.execute(
            select(MedicationAnalyzerAudit)
            .where(MedicationAnalyzerAudit.patient_id == patient_id)
            .order_by(MedicationAnalyzerAudit.created_at.desc())
        )
        .scalars()
        .all()
    )
    notes_rows = (
        db.execute(
            select(MedicationAnalyzerReviewNote)
            .where(MedicationAnalyzerReviewNote.patient_id == patient_id)
            .order_by(MedicationAnalyzerReviewNote.created_at.desc())
        )
        .scalars()
        .all()
    )

    entries = [_audit_row_to_entry(r) for r in aud_rows]
    review_notes = [
        {
            "note_id": r.id,
            "patient_id": r.patient_id,
            "actor_id": r.actor_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "note_text": r.note_text,
            "linked_recommendation_ids": json.loads(r.linked_recommendation_ids_json or "[]"),
        }
        for r in notes_rows
    ]
    return AuditListResponse(entries=entries, review_notes=review_notes)
