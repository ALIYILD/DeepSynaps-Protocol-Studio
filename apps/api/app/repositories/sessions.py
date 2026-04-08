from __future__ import annotations

from typing import Optional

from sqlalchemy import select
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
