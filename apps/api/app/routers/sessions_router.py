from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.sessions import (
    create_session,
    delete_session,
    get_session,
    list_sessions_for_clinician,
    list_sessions_for_patient,
    update_session,
)

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    patient_id: str
    scheduled_at: str  # ISO datetime string
    duration_minutes: int = 60
    modality: Optional[str] = None
    protocol_ref: Optional[str] = None
    session_number: Optional[int] = None
    total_sessions: Optional[int] = None
    billing_code: Optional[str] = None


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
    status: str
    outcome: Optional[str]
    session_notes: Optional[str]
    adverse_events: Optional[str]
    billing_code: Optional[str]
    billing_status: str
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
            status=r.status,
            outcome=r.outcome,
            session_notes=r.session_notes,
            adverse_events=r.adverse_events,
            billing_code=r.billing_code,
            billing_status=r.billing_status,
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
    record = update_session(session, session_id, actor.actor_id, **updates)
    if record is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    return SessionOut.from_record(record)


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
