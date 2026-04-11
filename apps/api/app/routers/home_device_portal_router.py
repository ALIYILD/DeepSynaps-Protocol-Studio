"""Home device patient portal router — self-service endpoints for patient-role users.

Patients can:
- View their active device assignment
- Log home sessions
- Submit adherence / side-effect / concern events
- View their adherence history

Clinicians review all submissions before any clinical interpretation.

Endpoints
---------
GET  /api/v1/patient-portal/home-device                 Active assignment (device + instructions)
GET  /api/v1/patient-portal/home-sessions               Patient's session log history
POST /api/v1/patient-portal/home-sessions               Log a new session
GET  /api/v1/patient-portal/adherence-events            Patient's adherence event history
POST /api/v1/patient-portal/adherence-events            Submit a new adherence / side-effect event
GET  /api/v1/patient-portal/home-adherence-summary      Adherence stats for active assignment
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    DeviceSessionLog,
    HomeDeviceAssignment,
    Patient,
    PatientAdherenceEvent,
)
from app.services.home_device_adherence import compute_adherence_summary
from app.services.home_device_flags import run_home_device_flag_checks

router = APIRouter(prefix="/api/v1/patient-portal", tags=["Patient Portal — Home Device"])

_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"


# ── Helpers ──────────────────────────────────────────────────────────────────────

def _dt(v) -> Optional[str]:
    if v is None:
        return None
    return v.isoformat() if isinstance(v, datetime) else str(v)


def _require_patient(actor: AuthenticatedActor, db: Session) -> Patient:
    from app.persistence.models import User
    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        patient = db.query(Patient).filter(Patient.email == "patient@demo.com").first()
        if patient:
            return patient
        raise ApiServiceError(
            code="patient_not_linked",
            message="No demo patient record found.",
            status_code=404,
        )
    user = db.query(User).filter_by(id=actor.actor_id).first()
    if user is None:
        raise ApiServiceError(code="not_found", message="User not found.", status_code=404)
    patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="patient_not_linked",
            message="No patient record linked to this user account.",
            status_code=404,
        )
    return patient


def _get_active_assignment(patient_id: str, db: Session) -> Optional[HomeDeviceAssignment]:
    return (
        db.query(HomeDeviceAssignment)
        .filter(
            HomeDeviceAssignment.patient_id == patient_id,
            HomeDeviceAssignment.status == "active",
        )
        .order_by(HomeDeviceAssignment.created_at.desc())
        .first()
    )


# ── Response schemas ──────────────────────────────────────────────────────────────

class PortalAssignmentOut(BaseModel):
    id: str
    device_name: str
    device_model: Optional[str]
    device_category: str
    parameters: dict
    instructions_text: Optional[str]
    session_frequency_per_week: Optional[int]
    planned_total_sessions: Optional[int]
    status: str
    assigned_at: str


class PortalSessionLogOut(BaseModel):
    id: str
    session_date: str
    logged_at: str
    duration_minutes: Optional[int]
    completed: bool
    tolerance_rating: Optional[int]
    mood_before: Optional[int]
    mood_after: Optional[int]
    side_effects_during: Optional[str]
    notes: Optional[str]
    status: str


class PortalAdherenceEventOut(BaseModel):
    id: str
    event_type: str
    severity: Optional[str]
    report_date: str
    body: Optional[str]
    status: str
    created_at: str


# ── Request schemas ───────────────────────────────────────────────────────────────

class LogSessionRequest(BaseModel):
    session_date: str = Field(..., description="YYYY-MM-DD")
    duration_minutes: Optional[int] = Field(None, ge=1, le=480)
    completed: bool = True
    actual_intensity: Optional[str] = None
    electrode_placement: Optional[str] = None
    side_effects_during: Optional[str] = None
    tolerance_rating: Optional[int] = Field(None, ge=1, le=5)
    mood_before: Optional[int] = Field(None, ge=1, le=5)
    mood_after: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None


class SubmitAdherenceEventRequest(BaseModel):
    event_type: str       # adherence_report | side_effect | tolerance_change | break_request | concern | positive_feedback
    severity: Optional[str] = None     # low | moderate | high | urgent
    report_date: str = Field(..., description="YYYY-MM-DD")
    body: Optional[str] = None
    structured: dict = {}


_VALID_EVENT_TYPES = frozenset({
    "adherence_report", "side_effect", "tolerance_change",
    "break_request", "concern", "positive_feedback",
})
_VALID_SEVERITIES = frozenset({"low", "moderate", "high", "urgent"})


# ── Routes ────────────────────────────────────────────────────────────────────────

@router.get("/home-device")
def get_home_device(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    patient = _require_patient(actor, db)
    assignment = _get_active_assignment(patient.id, db)
    if assignment is None:
        return {"assignment": None}

    params = {}
    try:
        params = json.loads(assignment.parameters_json or "{}")
    except Exception:
        pass

    return {
        "assignment": PortalAssignmentOut(
            id=assignment.id,
            device_name=assignment.device_name,
            device_model=assignment.device_model,
            device_category=assignment.device_category,
            parameters=params,
            instructions_text=assignment.instructions_text,
            session_frequency_per_week=assignment.session_frequency_per_week,
            planned_total_sessions=assignment.planned_total_sessions,
            status=assignment.status,
            assigned_at=_dt(assignment.created_at),
        ).model_dump(),
    }


@router.get("/home-sessions", response_model=list[PortalSessionLogOut])
def list_home_sessions(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalSessionLogOut]:
    patient = _require_patient(actor, db)
    rows = (
        db.query(DeviceSessionLog)
        .filter(DeviceSessionLog.patient_id == patient.id)
        .order_by(DeviceSessionLog.session_date.desc())
        .limit(90)
        .all()
    )
    return [
        PortalSessionLogOut(
            id=r.id, session_date=r.session_date, logged_at=_dt(r.logged_at),
            duration_minutes=r.duration_minutes, completed=r.completed,
            tolerance_rating=r.tolerance_rating, mood_before=r.mood_before,
            mood_after=r.mood_after, side_effects_during=r.side_effects_during,
            notes=r.notes, status=r.status,
        )
        for r in rows
    ]


@router.post("/home-sessions", response_model=PortalSessionLogOut, status_code=201)
def log_home_session(
    body: LogSessionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalSessionLogOut:
    patient = _require_patient(actor, db)
    assignment = _get_active_assignment(patient.id, db)
    if assignment is None:
        raise ApiServiceError(
            code="no_active_assignment",
            message="No active device assignment found. Ask your clinician to assign a device.",
            status_code=404,
        )

    now = datetime.now(timezone.utc)
    log = DeviceSessionLog(
        id=str(uuid.uuid4()),
        assignment_id=assignment.id,
        patient_id=patient.id,
        course_id=assignment.course_id,
        session_date=body.session_date,
        logged_at=now,
        duration_minutes=body.duration_minutes,
        completed=body.completed,
        actual_intensity=body.actual_intensity,
        electrode_placement=body.electrode_placement,
        side_effects_during=body.side_effects_during,
        tolerance_rating=body.tolerance_rating,
        mood_before=body.mood_before,
        mood_after=body.mood_after,
        notes=body.notes,
        status="pending_review",
        created_at=now,
    )
    db.add(log)
    db.flush()

    # Run flag checks — may persist new HomeDeviceReviewFlag rows
    try:
        run_home_device_flag_checks(
            patient_id=patient.id,
            assignment=assignment,
            db=db,
            new_session_log=log,
        )
    except Exception:
        pass  # flags are advisory; never block session logging

    db.commit()
    db.refresh(log)

    return PortalSessionLogOut(
        id=log.id, session_date=log.session_date, logged_at=_dt(log.logged_at),
        duration_minutes=log.duration_minutes, completed=log.completed,
        tolerance_rating=log.tolerance_rating, mood_before=log.mood_before,
        mood_after=log.mood_after, side_effects_during=log.side_effects_during,
        notes=log.notes, status=log.status,
    )


@router.get("/adherence-events", response_model=list[PortalAdherenceEventOut])
def list_adherence_events(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalAdherenceEventOut]:
    patient = _require_patient(actor, db)
    rows = (
        db.query(PatientAdherenceEvent)
        .filter(PatientAdherenceEvent.patient_id == patient.id)
        .order_by(PatientAdherenceEvent.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        PortalAdherenceEventOut(
            id=r.id, event_type=r.event_type, severity=r.severity,
            report_date=r.report_date, body=r.body,
            status=r.status, created_at=_dt(r.created_at),
        )
        for r in rows
    ]


@router.post("/adherence-events", response_model=PortalAdherenceEventOut, status_code=201)
def submit_adherence_event(
    body: SubmitAdherenceEventRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalAdherenceEventOut:
    patient = _require_patient(actor, db)

    if body.event_type not in _VALID_EVENT_TYPES:
        raise ApiServiceError(
            code="invalid_event_type",
            message=f"event_type must be one of: {', '.join(sorted(_VALID_EVENT_TYPES))}",
            status_code=422,
        )
    if body.severity and body.severity not in _VALID_SEVERITIES:
        raise ApiServiceError(
            code="invalid_severity",
            message=f"severity must be one of: {', '.join(sorted(_VALID_SEVERITIES))}",
            status_code=422,
        )

    assignment = _get_active_assignment(patient.id, db)
    now = datetime.now(timezone.utc)

    event = PatientAdherenceEvent(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        assignment_id=assignment.id if assignment else None,
        course_id=assignment.course_id if assignment else None,
        event_type=body.event_type,
        severity=body.severity,
        report_date=body.report_date,
        body=body.body,
        structured_json=json.dumps(body.structured),
        status="open",
        created_at=now,
    )
    db.add(event)
    db.flush()

    # Run flag checks for side effects and urgent events
    if assignment:
        try:
            run_home_device_flag_checks(
                patient_id=patient.id,
                assignment=assignment,
                db=db,
                new_adherence_event=event,
            )
        except Exception:
            pass

    db.commit()
    db.refresh(event)

    return PortalAdherenceEventOut(
        id=event.id, event_type=event.event_type, severity=event.severity,
        report_date=event.report_date, body=event.body,
        status=event.status, created_at=_dt(event.created_at),
    )


@router.get("/home-adherence-summary")
def get_home_adherence_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    patient = _require_patient(actor, db)
    assignment = _get_active_assignment(patient.id, db)
    if assignment is None:
        return {"assignment": None, "adherence": None}
    adherence = compute_adherence_summary(assignment, db)
    return {"assignment_id": assignment.id, "adherence": adherence}
