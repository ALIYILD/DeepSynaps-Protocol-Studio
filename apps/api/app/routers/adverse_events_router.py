"""Adverse events router.

Endpoints
---------
POST  /api/v1/adverse-events           Report a new adverse event
GET   /api/v1/adverse-events           List adverse events (filter by patient / course)
GET   /api/v1/adverse-events/{id}      Get event detail
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.repositories.patients import resolve_patient_clinic_id


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str | None, db: Session) -> None:
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import AdverseEvent, ClinicalSession, TreatmentCourse

import logging as _logging
_ae_log = _logging.getLogger(__name__)

def _trigger_ae_risk_recompute(patient_id: str, actor_id: str | None, db_sess):
    """Fire risk recompute for all categories after adverse event."""
    try:
        from app.services.risk_stratification import compute_risk_profile
        compute_risk_profile(patient_id, db_sess, clinician_id=actor_id)
    except Exception:
        _ae_log.debug("Risk recompute skipped after AE creation", exc_info=True)

router = APIRouter(prefix="/api/v1/adverse-events", tags=["Adverse Events"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class AdverseEventCreate(BaseModel):
    patient_id: str
    course_id: Optional[str] = None
    session_id: Optional[str] = None
    event_type: str           # e.g. "headache", "seizure", "syncope", "scalp_discomfort"
    severity: Literal["mild", "moderate", "severe", "serious"]

    @field_validator("severity", mode="before")
    @classmethod
    def _normalize_severity(cls, v: object) -> object:
        return v.strip().lower() if isinstance(v, str) else v
    description: Optional[str] = None
    onset_timing: Optional[str] = None   # e.g. "during", "immediately_after", "24h_post"
    resolution: Optional[str] = None     # e.g. "resolved", "ongoing", "unknown"
    action_taken: Optional[str] = None   # e.g. "none", "session_paused", "session_stopped", "referred"
    reported_at: Optional[str] = None    # ISO datetime; defaults to now


class AdverseEventOut(BaseModel):
    id: str
    patient_id: str
    course_id: Optional[str]
    session_id: Optional[str]
    clinician_id: str
    event_type: str
    severity: str
    description: Optional[str]
    onset_timing: Optional[str]
    resolution: Optional[str]
    action_taken: Optional[str]
    reported_at: str
    resolved_at: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: AdverseEvent) -> "AdverseEventOut":
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            course_id=r.course_id,
            session_id=r.session_id,
            clinician_id=r.clinician_id,
            event_type=r.event_type,
            severity=r.severity,
            description=r.description,
            onset_timing=r.onset_timing,
            resolution=r.resolution,
            action_taken=r.action_taken,
            reported_at=_dt(r.reported_at),
            resolved_at=_dt(r.resolved_at),
            created_at=_dt(r.created_at),
        )


class AdverseEventListResponse(BaseModel):
    items: list[AdverseEventOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=AdverseEventOut, status_code=201)
@limiter.limit("30/minute")
def report_adverse_event(
    body: AdverseEventCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, body.patient_id, db)

    # FK-stuffing guard: course_id and session_id are written verbatim onto
    # the AdverseEvent row, and downstream analytics aggregate by course_id /
    # session_id. Without this verification a clinician at clinic A with one
    # of their own patients could attach a fabricated AE to clinic B's
    # course_id or session_id, contaminating clinic B's safety queries.
    if body.course_id:
        course = db.query(TreatmentCourse).filter_by(id=body.course_id).first()
        if course is None or course.patient_id != body.patient_id:
            raise ApiServiceError(
                code="invalid_course",
                message="course_id does not match the supplied patient_id.",
                status_code=422,
            )
    if body.session_id:
        sess = db.query(ClinicalSession).filter_by(id=body.session_id).first()
        if sess is None or sess.patient_id != body.patient_id:
            raise ApiServiceError(
                code="invalid_session",
                message="session_id does not match the supplied patient_id.",
                status_code=422,
            )

    severity = body.severity  # already validated by Pydantic Literal

    reported_at = datetime.now(timezone.utc)
    if body.reported_at:
        try:
            reported_at = datetime.fromisoformat(body.reported_at.rstrip("Z"))
        except ValueError:
            pass

    event = AdverseEvent(
        patient_id=body.patient_id,
        course_id=body.course_id,
        session_id=body.session_id,
        clinician_id=actor.actor_id,
        event_type=body.event_type.strip(),
        severity=severity,
        description=body.description,
        onset_timing=body.onset_timing,
        resolution=body.resolution,
        action_taken=body.action_taken,
        reported_at=reported_at,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    _trigger_ae_risk_recompute(body.patient_id, actor.actor_id, db)
    return AdverseEventOut.from_record(event)


@router.get("", response_model=AdverseEventListResponse)
def list_adverse_events(
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventListResponse:
    require_minimum_role(actor, "clinician")

    q = db.query(AdverseEvent)
    if actor.role != "admin":
        q = q.filter(AdverseEvent.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(AdverseEvent.patient_id == patient_id)
    if course_id:
        q = q.filter(AdverseEvent.course_id == course_id)
    if severity:
        q = q.filter(AdverseEvent.severity == severity.lower())

    records = q.order_by(AdverseEvent.reported_at.desc()).all()
    items = [AdverseEventOut.from_record(r) for r in records]
    return AdverseEventListResponse(items=items, total=len(items))


@router.get("/{event_id}", response_model=AdverseEventOut)
def get_adverse_event(
    event_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    require_minimum_role(actor, "clinician")
    event = db.query(AdverseEvent).filter_by(id=event_id).first()
    if event is None:
        raise ApiServiceError(code="not_found", message="Adverse event not found.", status_code=404)
    if actor.role != "admin" and event.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Adverse event not found.", status_code=404)
    return AdverseEventOut.from_record(event)


class AdverseEventResolve(BaseModel):
    resolution: Optional[str] = "resolved"


@router.patch("/{event_id}/resolve", response_model=AdverseEventOut)
def resolve_adverse_event(
    event_id: str,
    body: AdverseEventResolve = AdverseEventResolve(),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    """Mark an adverse event as resolved by setting resolved_at."""
    require_minimum_role(actor, "clinician")
    event = db.query(AdverseEvent).filter_by(id=event_id).first()
    if event is None:
        raise ApiServiceError(code="not_found", message="Adverse event not found.", status_code=404)
    if actor.role != "admin" and event.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Adverse event not found.", status_code=404)
    event.resolved_at = datetime.now(timezone.utc)
    event.resolution = body.resolution or "resolved"
    db.commit()
    db.refresh(event)
    return AdverseEventOut.from_record(event)
