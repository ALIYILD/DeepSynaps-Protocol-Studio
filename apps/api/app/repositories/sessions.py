from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.persistence.models import ClinicalSession


def create_session(
    session: Session,
    *,
    patient_id: str,
    clinician_id: str,
    scheduled_at: str,
    duration_minutes: int = 60,
    modality: Optional[str] = None,
    protocol_ref: Optional[str] = None,
    session_number: Optional[int] = None,
    total_sessions: Optional[int] = None,
    status: str = "scheduled",
    billing_code: Optional[str] = None,
    appointment_type: str = "session",
    room_id: Optional[str] = None,
    device_id: Optional[str] = None,
    recurrence_group: Optional[str] = None,
) -> ClinicalSession:
    record = ClinicalSession(
        patient_id=patient_id,
        clinician_id=clinician_id,
        scheduled_at=scheduled_at,
        duration_minutes=duration_minutes,
        modality=modality,
        protocol_ref=protocol_ref,
        session_number=session_number,
        total_sessions=total_sessions,
        status=status,
        billing_code=billing_code,
        appointment_type=appointment_type,
        room_id=room_id,
        device_id=device_id,
        recurrence_group=recurrence_group,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_session(session: Session, session_id: str, clinician_id: str) -> Optional[ClinicalSession]:
    return session.scalar(
        select(ClinicalSession).where(
            ClinicalSession.id == session_id,
            ClinicalSession.clinician_id == clinician_id,
        )
    )


def list_sessions_for_clinician(session: Session, clinician_id: str) -> list[ClinicalSession]:
    return list(
        session.scalars(
            select(ClinicalSession)
            .where(ClinicalSession.clinician_id == clinician_id)
            .order_by(ClinicalSession.scheduled_at.desc())
        ).all()
    )


def list_sessions_for_patient(session: Session, patient_id: str, clinician_id: str) -> list[ClinicalSession]:
    return list(
        session.scalars(
            select(ClinicalSession)
            .where(
                ClinicalSession.patient_id == patient_id,
                ClinicalSession.clinician_id == clinician_id,
            )
            .order_by(ClinicalSession.scheduled_at.desc())
        ).all()
    )


def update_session(session: Session, session_id: str, clinician_id: str, **kwargs) -> Optional[ClinicalSession]:
    record = get_session(session, session_id, clinician_id)
    if record is None:
        return None
    for key, value in kwargs.items():
        if hasattr(record, key):
            setattr(record, key, value)
    session.commit()
    session.refresh(record)
    return record


def delete_session(session: Session, session_id: str, clinician_id: str) -> bool:
    record = get_session(session, session_id, clinician_id)
    if record is None:
        return False
    session.delete(record)
    session.commit()
    return True


def check_conflicts(
    session: Session,
    clinician_id: str,
    scheduled_at: str,
    duration_minutes: int,
    room_id: Optional[str] = None,
    device_id: Optional[str] = None,
    exclude_id: Optional[str] = None,
) -> list[ClinicalSession]:
    """Check for overlapping appointments for clinician, room, or device.

    Uses string-based ISO datetime comparison (works with SQLite).
    Returns list of conflicting sessions.
    """
    # Parse the proposed time window
    proposed_start = datetime.fromisoformat(scheduled_at)
    proposed_end = proposed_start + timedelta(minutes=duration_minutes)
    proposed_end_str = proposed_end.isoformat()

    # Active statuses — cancelled / no_show sessions don't block
    active_statuses = ("scheduled", "confirmed", "checked_in", "in_progress")

    # Base overlap condition: existing.start < proposed.end AND existing.end > proposed.start
    # Since we store scheduled_at as ISO string and duration as int, we can't do
    # end-time arithmetic in SQLite easily.  Instead we fetch candidates and filter in Python.
    candidates_query = (
        select(ClinicalSession)
        .where(
            ClinicalSession.status.in_(active_statuses),
            # Quick pre-filter: scheduled_at must be within a reasonable window
            ClinicalSession.scheduled_at < proposed_end_str,
        )
    )

    if exclude_id:
        candidates_query = candidates_query.where(ClinicalSession.id != exclude_id)

    # Build resource overlap conditions
    resource_conditions = [ClinicalSession.clinician_id == clinician_id]
    if room_id:
        resource_conditions.append(ClinicalSession.room_id == room_id)
    if device_id:
        resource_conditions.append(ClinicalSession.device_id == device_id)

    candidates_query = candidates_query.where(or_(*resource_conditions))

    candidates = list(session.scalars(candidates_query).all())

    # Filter in Python for actual overlap
    conflicts = []
    for c in candidates:
        c_start = datetime.fromisoformat(c.scheduled_at)
        c_end = c_start + timedelta(minutes=c.duration_minutes)
        if c_start < proposed_end and c_end > proposed_start:
            conflicts.append(c)

    return conflicts
