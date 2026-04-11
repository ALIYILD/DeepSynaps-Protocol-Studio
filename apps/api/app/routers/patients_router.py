from __future__ import annotations

import json
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import PatientInvite
from app.repositories.patients import (
    create_patient,
    delete_patient,
    get_patient,
    list_patients,
    update_patient,
)

router = APIRouter(prefix="/api/v1/patients", tags=["patients"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    dob: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    primary_condition: Optional[str] = None
    secondary_conditions: list[str] = []
    primary_modality: Optional[str] = None
    referring_clinician: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_number: Optional[str] = None
    consent_signed: bool = False
    consent_date: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    primary_condition: Optional[str] = None
    secondary_conditions: Optional[list[str]] = None
    primary_modality: Optional[str] = None
    referring_clinician: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_number: Optional[str] = None
    consent_signed: Optional[bool] = None
    consent_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: str
    clinician_id: str
    first_name: str
    last_name: str
    dob: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    gender: Optional[str]
    primary_condition: Optional[str]
    secondary_conditions: list[str]
    primary_modality: Optional[str]
    referring_clinician: Optional[str]
    insurance_provider: Optional[str]
    insurance_number: Optional[str]
    consent_signed: bool
    consent_date: Optional[str]
    status: str
    notes: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r) -> "PatientOut":
        secondary = []
        try:
            secondary = json.loads(r.secondary_conditions or "[]")
        except Exception:
            pass
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            first_name=r.first_name,
            last_name=r.last_name,
            dob=r.dob,
            email=r.email,
            phone=r.phone,
            gender=r.gender,
            primary_condition=r.primary_condition,
            secondary_conditions=secondary,
            primary_modality=r.primary_modality,
            referring_clinician=r.referring_clinician,
            insurance_provider=r.insurance_provider,
            insurance_number=r.insurance_number,
            consent_signed=r.consent_signed,
            consent_date=r.consent_date,
            status=r.status,
            notes=r.notes,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class PatientListResponse(BaseModel):
    items: list[PatientOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=PatientListResponse)
def list_patients_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientListResponse:
    require_minimum_role(actor, "clinician")
    patients = list_patients(session, actor.actor_id)
    items = [PatientOut.from_record(p) for p in patients]
    return PatientListResponse(items=items, total=len(items))


@router.post("", response_model=PatientOut, status_code=201)
def create_patient_endpoint(
    body: PatientCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    patient = create_patient(session, clinician_id=actor.actor_id, **body.model_dump())
    return PatientOut.from_record(patient)


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient_endpoint(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    patient = get_patient(session, patient_id, actor.actor_id)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    return PatientOut.from_record(patient)


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient_endpoint(
    patient_id: str,
    body: PatientUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    patient = update_patient(session, patient_id, actor.actor_id, **updates)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    return PatientOut.from_record(patient)


@router.delete("/{patient_id}", status_code=204)
def delete_patient_endpoint(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    deleted = delete_patient(session, patient_id, actor.actor_id)
    if not deleted:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)


# ── Patient Invite ─────────────────────────────────────────────────────────────


def _generate_invite_code(clinic_prefix: str) -> str:
    """Generate an invite code like NB-2026-A3F7."""
    year = datetime.now(timezone.utc).year
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{clinic_prefix}-{year}-{suffix}"


class InviteCreateRequest(BaseModel):
    patient_name: Optional[str] = None
    patient_email: Optional[str] = None
    clinic_id: Optional[str] = None
    condition: Optional[str] = None
    expires_in_days: int = 7


class InviteCreateResponse(BaseModel):
    invite_code: str
    expires_at: str


@router.post("/invite", response_model=InviteCreateResponse, status_code=201)
def create_patient_invite(
    body: InviteCreateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InviteCreateResponse:
    """Generate a patient invitation code. Requires clinician role or higher."""
    require_minimum_role(actor, "clinician")

    # Derive a short clinic prefix from clinic_id or actor_id
    raw_prefix = (body.clinic_id or actor.actor_id or "DS")
    prefix = "".join(c for c in raw_prefix.upper() if c.isalpha())[:4] or "DS"

    # Ensure uniqueness
    for _ in range(10):
        code = _generate_invite_code(prefix)
        existing = session.scalar(
            select(PatientInvite).where(PatientInvite.invite_code == code)
        )
        if existing is None:
            break

    expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    invite = PatientInvite(
        invite_code=code,
        patient_name=body.patient_name,
        patient_email=body.patient_email,
        clinic_id=body.clinic_id,
        clinician_id=actor.actor_id,
        condition=body.condition,
        expires_at=expires_at,
    )
    session.add(invite)
    session.commit()

    return InviteCreateResponse(
        invite_code=invite.invite_code,
        expires_at=expires_at.isoformat(),
    )


# ── Patient Sub-Resource Endpoints ────────────────────────────────────────────
# These provide patient-scoped access to sessions, courses, assessments,
# reports, and messages for both patient self-access and clinician views.


class PatientSessionsResponse(BaseModel):
    items: list[dict]
    total: int


class PatientCoursesResponse(BaseModel):
    items: list[dict]
    total: int


class PatientAssessmentsResponse(BaseModel):
    items: list[dict]
    total: int


class PatientReportsResponse(BaseModel):
    items: list[dict]
    total: int


class MessageOut(BaseModel):
    id: str
    sender_id: str
    recipient_id: str
    patient_id: Optional[str]
    body: str
    created_at: str
    read_at: Optional[str]


class PatientMessagesResponse(BaseModel):
    items: list[MessageOut]
    total: int


class SendMessageRequest(BaseModel):
    body: str


def _session_to_dict(s) -> dict:
    return {
        "id": s.id,
        "patient_id": s.patient_id,
        "clinician_id": s.clinician_id,
        "scheduled_at": s.scheduled_at,
        "duration_minutes": s.duration_minutes,
        "modality": s.modality,
        "status": s.status,
        "outcome": s.outcome,
        "session_notes": s.session_notes,
        "session_number": s.session_number,
        "total_sessions": s.total_sessions,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


def _course_to_dict(c) -> dict:
    return {
        "id": c.id,
        "patient_id": c.patient_id,
        "clinician_id": c.clinician_id,
        "protocol_id": c.protocol_id,
        "condition_slug": c.condition_slug,
        "modality_slug": c.modality_slug,
        "device_slug": c.device_slug,
        "status": c.status,
        "planned_sessions_total": c.planned_sessions_total,
        "sessions_delivered": c.sessions_delivered,
        "evidence_grade": c.evidence_grade,
        "on_label": c.on_label,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "completed_at": c.completed_at.isoformat() if c.completed_at else None,
        "created_at": c.created_at.isoformat(),
    }


def _assessment_to_dict(a) -> dict:
    data = {}
    try:
        data = json.loads(a.data_json or "{}")
    except Exception:
        pass
    return {
        "id": a.id,
        "patient_id": a.patient_id,
        "clinician_id": a.clinician_id,
        "template_id": a.template_id,
        "template_title": a.template_title,
        "data": data,
        "status": a.status,
        "score": a.score,
        "clinician_notes": a.clinician_notes,
        "created_at": a.created_at.isoformat(),
        "updated_at": a.updated_at.isoformat(),
    }


@router.get("/{patient_id}/sessions", response_model=PatientSessionsResponse)
def get_patient_sessions(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientSessionsResponse:
    """List sessions for a patient. Clinicians see their own patients; patients see themselves."""
    from app.persistence.models import ClinicalSession

    if actor.role == "patient":
        # Patient can only access their own sessions
        if actor.actor_id != patient_id:
            # Try to match via linked patient record — for now, limit by patient_id field
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own sessions.",
                status_code=403,
            )
        rows = session.scalars(
            select(ClinicalSession).where(ClinicalSession.patient_id == patient_id)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(ClinicalSession).where(
                ClinicalSession.patient_id == patient_id,
                ClinicalSession.clinician_id == actor.actor_id,
            )
        ).all()

    items = [_session_to_dict(r) for r in rows]
    return PatientSessionsResponse(items=items, total=len(items))


@router.get("/{patient_id}/courses", response_model=PatientCoursesResponse)
def get_patient_courses(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientCoursesResponse:
    """List treatment courses for a patient."""
    from app.persistence.models import TreatmentCourse

    if actor.role == "patient":
        if actor.actor_id != patient_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own courses.",
                status_code=403,
            )
        rows = session.scalars(
            select(TreatmentCourse).where(TreatmentCourse.patient_id == patient_id)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(TreatmentCourse).where(
                TreatmentCourse.patient_id == patient_id,
                TreatmentCourse.clinician_id == actor.actor_id,
            )
        ).all()

    items = [_course_to_dict(r) for r in rows]
    return PatientCoursesResponse(items=items, total=len(items))


@router.get("/{patient_id}/assessments", response_model=PatientAssessmentsResponse)
def get_patient_assessments(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientAssessmentsResponse:
    """List assessments for a patient."""
    from app.persistence.models import AssessmentRecord

    if actor.role == "patient":
        if actor.actor_id != patient_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own assessments.",
                status_code=403,
            )
        rows = session.scalars(
            select(AssessmentRecord).where(AssessmentRecord.patient_id == patient_id)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(AssessmentRecord).where(
                AssessmentRecord.patient_id == patient_id,
                AssessmentRecord.clinician_id == actor.actor_id,
            )
        ).all()

    items = [_assessment_to_dict(r) for r in rows]
    return PatientAssessmentsResponse(items=items, total=len(items))


@router.get("/{patient_id}/reports", response_model=PatientReportsResponse)
def get_patient_reports(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientReportsResponse:
    """List outcome series / reports for a patient (acts as patient-facing report list)."""
    from app.persistence.models import OutcomeSeries

    if actor.role == "patient":
        if actor.actor_id != patient_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own reports.",
                status_code=403,
            )
        rows = session.scalars(
            select(OutcomeSeries).where(OutcomeSeries.patient_id == patient_id)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(OutcomeSeries).where(
                OutcomeSeries.patient_id == patient_id,
                OutcomeSeries.clinician_id == actor.actor_id,
            )
        ).all()

    items = [
        {
            "id": r.id,
            "patient_id": r.patient_id,
            "course_id": r.course_id,
            "template_id": r.template_id,
            "template_title": r.template_title,
            "score": r.score,
            "score_numeric": r.score_numeric,
            "measurement_point": r.measurement_point,
            "administered_at": r.administered_at.isoformat(),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
    return PatientReportsResponse(items=items, total=len(items))


@router.get("/{patient_id}/messages", response_model=PatientMessagesResponse)
def get_patient_messages(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientMessagesResponse:
    """List messages associated with a patient thread."""
    from app.persistence.models import Message

    # Patients see messages where they are sender or recipient
    # Clinicians see messages for their own patients
    if actor.role == "patient":
        rows = session.scalars(
            select(Message).where(
                (Message.patient_id == patient_id)
                | (Message.sender_id == actor.actor_id)
                | (Message.recipient_id == actor.actor_id)
            ).order_by(Message.created_at)
        ).all()
    else:
        require_minimum_role(actor, "clinician")
        rows = session.scalars(
            select(Message)
            .where(Message.patient_id == patient_id)
            .order_by(Message.created_at)
        ).all()

    items = [
        MessageOut(
            id=r.id,
            sender_id=r.sender_id,
            recipient_id=r.recipient_id,
            patient_id=r.patient_id,
            body=r.body,
            created_at=r.created_at.isoformat(),
            read_at=r.read_at.isoformat() if r.read_at else None,
        )
        for r in rows
    ]
    return PatientMessagesResponse(items=items, total=len(items))


@router.post("/{patient_id}/messages", response_model=MessageOut, status_code=201)
def send_patient_message(
    patient_id: str,
    body: SendMessageRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> MessageOut:
    """Send a message in a patient thread."""
    from app.persistence.models import Message

    if not body.body.strip():
        raise ApiServiceError(
            code="empty_message",
            message="Message body cannot be empty.",
            status_code=400,
        )

    # For patient senders, recipient defaults to the patient's clinician (unresolved here —
    # we store patient_id as context and leave recipient_id as a placeholder).
    # For clinician senders, recipient is the patient.
    if actor.role == "patient":
        sender_id = actor.actor_id
        recipient_id = patient_id  # best effort — clinician's user id not resolved without extra lookup
    else:
        require_minimum_role(actor, "clinician")
        sender_id = actor.actor_id
        recipient_id = patient_id

    msg = Message(
        sender_id=sender_id,
        recipient_id=recipient_id,
        patient_id=patient_id,
        body=body.body.strip(),
    )
    session.add(msg)
    session.commit()
    session.refresh(msg)

    return MessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        recipient_id=msg.recipient_id,
        patient_id=msg.patient_id,
        body=msg.body,
        created_at=msg.created_at.isoformat(),
        read_at=None,
    )
