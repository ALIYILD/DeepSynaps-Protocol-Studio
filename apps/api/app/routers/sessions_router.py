from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.sessions import (
    check_conflicts,
    create_session,
    delete_session,
    get_session,
    list_sessions_for_clinician,
    list_sessions_for_patient,
    update_session,
)

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


# ── Valid status transitions ──────────────────────────────────────────────────

VALID_TRANSITIONS: dict[str, set[str]] = {
    "scheduled": {"confirmed", "cancelled", "no_show"},
    "confirmed": {"checked_in", "cancelled", "no_show"},
    "checked_in": {"in_progress", "cancelled"},
    "in_progress": {"completed"},
}

VALID_APPOINTMENT_TYPES = {"session", "assessment", "new_patient", "follow_up", "phone", "consultation"}


def _validate_status_transition(current: str, requested: str) -> None:
    """Raise 400 if the status transition is not allowed."""
    if current == requested:
        return
    allowed = VALID_TRANSITIONS.get(current)
    if allowed is None or requested not in allowed:
        raise ApiServiceError(
            code="invalid_status_transition",
            message=f"Cannot transition from '{current}' to '{requested}'. "
                    f"Allowed transitions from '{current}': {sorted(allowed) if allowed else 'none (terminal state)'}.",
            status_code=400,
        )


# ── Schemas ────────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    patient_id: str
    scheduled_at: str  # ISO datetime string
    duration_minutes: int = Field(default=60, ge=1, le=480)
    modality: Optional[str] = None
    protocol_ref: Optional[str] = None
    session_number: Optional[int] = None
    total_sessions: Optional[int] = None
    billing_code: Optional[str] = None
    appointment_type: str = Field(default="session")
    room_id: Optional[str] = None
    device_id: Optional[str] = None
    recurrence_group: Optional[str] = None


class SessionUpdate(BaseModel):
    scheduled_at: Optional[str] = None
    duration_minutes: Optional[int] = None
    modality: Optional[str] = None
    protocol_ref: Optional[str] = None
    session_number: Optional[int] = None
    total_sessions: Optional[int] = None
    status: Optional[str] = None
    outcome: Optional[str] = None
    session_notes: Optional[str] = None
    adverse_events: Optional[str] = None
    billing_code: Optional[str] = None
    billing_status: Optional[str] = None
    appointment_type: Optional[str] = None
    room_id: Optional[str] = None
    device_id: Optional[str] = None
    cancel_reason: Optional[str] = None
    recurrence_group: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    scheduled_at: str
    duration_minutes: int
    modality: Optional[str]
    protocol_ref: Optional[str]
    session_number: Optional[int]
    total_sessions: Optional[int]
    appointment_type: str
    status: str
    outcome: Optional[str]
    session_notes: Optional[str]
    adverse_events: Optional[str]
    room_id: Optional[str]
    device_id: Optional[str]
    confirmed_at: Optional[str]
    checked_in_at: Optional[str]
    completed_at: Optional[str]
    cancelled_at: Optional[str]
    cancel_reason: Optional[str]
    rescheduled_from: Optional[str]
    billing_code: Optional[str]
    billing_status: str
    recurrence_group: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r) -> "SessionOut":
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            scheduled_at=r.scheduled_at,
            duration_minutes=r.duration_minutes,
            modality=r.modality,
            protocol_ref=r.protocol_ref,
            session_number=r.session_number,
            total_sessions=r.total_sessions,
            appointment_type=r.appointment_type,
            status=r.status,
            outcome=r.outcome,
            session_notes=r.session_notes,
            adverse_events=r.adverse_events,
            room_id=r.room_id,
            device_id=r.device_id,
            confirmed_at=r.confirmed_at,
            checked_in_at=r.checked_in_at,
            completed_at=r.completed_at,
            cancelled_at=r.cancelled_at,
            cancel_reason=r.cancel_reason,
            rescheduled_from=r.rescheduled_from,
            billing_code=r.billing_code,
            billing_status=r.billing_status,
            recurrence_group=r.recurrence_group,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class SessionListResponse(BaseModel):
    items: list[SessionOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=SessionListResponse)
def list_sessions_endpoint(
    patient_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionListResponse:
    require_minimum_role(actor, "clinician")
    if patient_id:
        records = list_sessions_for_patient(session, patient_id, actor.actor_id)
    else:
        records = list_sessions_for_clinician(session, actor.actor_id)
    items = [SessionOut.from_record(r) for r in records]
    return SessionListResponse(items=items, total=len(items))


@router.post("", response_model=SessionOut, status_code=201)
def create_session_endpoint(
    body: SessionCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionOut:
    require_minimum_role(actor, "clinician")

    # Validate appointment_type
    if body.appointment_type not in VALID_APPOINTMENT_TYPES:
        raise ApiServiceError(
            code="invalid_appointment_type",
            message=f"Invalid appointment_type '{body.appointment_type}'. Must be one of: {sorted(VALID_APPOINTMENT_TYPES)}.",
            status_code=400,
        )

    # Check for scheduling conflicts
    conflicts = check_conflicts(
        session,
        clinician_id=actor.actor_id,
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
        room_id=body.room_id,
        device_id=body.device_id,
    )
    if conflicts:
        conflict_ids = [c.id for c in conflicts]
        raise ApiServiceError(
            code="scheduling_conflict",
            message=f"Overlapping appointment(s) detected: {conflict_ids}",
            status_code=409,
            details={"conflicting_session_ids": conflict_ids},
        )

    record = create_session(session, clinician_id=actor.actor_id, **body.model_dump())
    return SessionOut.from_record(record)


@router.get("/{session_id}", response_model=SessionOut)
def get_session_endpoint(
    session_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionOut:
    require_minimum_role(actor, "clinician")
    record = get_session(session, session_id, actor.actor_id)
    if record is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    return SessionOut.from_record(record)


@router.patch("/{session_id}", response_model=SessionOut)
def update_session_endpoint(
    session_id: str,
    body: SessionUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionOut:
    require_minimum_role(actor, "clinician")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Fetch existing record
    record = get_session(session, session_id, actor.actor_id)
    if record is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    # Validate appointment_type if being changed
    if "appointment_type" in updates and updates["appointment_type"] not in VALID_APPOINTMENT_TYPES:
        raise ApiServiceError(
            code="invalid_appointment_type",
            message=f"Invalid appointment_type '{updates['appointment_type']}'. Must be one of: {sorted(VALID_APPOINTMENT_TYPES)}.",
            status_code=400,
        )

    # Enforce status transition rules
    if "status" in updates:
        _validate_status_transition(record.status, updates["status"])
        now_iso = datetime.now(timezone.utc).isoformat()
        new_status = updates["status"]
        if new_status == "confirmed":
            updates.setdefault("confirmed_at", now_iso)
        elif new_status == "checked_in":
            updates.setdefault("checked_in_at", now_iso)
        elif new_status == "completed":
            updates.setdefault("completed_at", now_iso)
        elif new_status == "cancelled":
            updates.setdefault("cancelled_at", now_iso)

    # Check for scheduling conflicts if time/resource changed
    time_changed = "scheduled_at" in updates or "duration_minutes" in updates
    resource_changed = "room_id" in updates or "device_id" in updates
    if time_changed or resource_changed:
        conflicts = check_conflicts(
            session,
            clinician_id=actor.actor_id,
            scheduled_at=updates.get("scheduled_at", record.scheduled_at),
            duration_minutes=updates.get("duration_minutes", record.duration_minutes),
            room_id=updates.get("room_id", record.room_id),
            device_id=updates.get("device_id", record.device_id),
            exclude_id=session_id,
        )
        if conflicts:
            conflict_ids = [c.id for c in conflicts]
            raise ApiServiceError(
                code="scheduling_conflict",
                message=f"Overlapping appointment(s) detected: {conflict_ids}",
                status_code=409,
                details={"conflicting_session_ids": conflict_ids},
            )

    result = update_session(session, session_id, actor.actor_id, **updates)
    if result is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    return SessionOut.from_record(result)


@router.delete("/{session_id}", status_code=204)
def delete_session_endpoint(
    session_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    deleted = delete_session(session, session_id, actor.actor_id)
    if not deleted:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
