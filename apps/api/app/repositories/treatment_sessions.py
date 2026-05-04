"""Repository layer for Treatment Sessions data access.

Exposes model classes used by treatment_sessions_router.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.persistence.models import (
    ClinicalSession,
    ClinicalSessionEvent,
    DeliveredSessionParameters,
    TreatmentCourse,
)

__all__ = [
    "ClinicalSession",
    "ClinicalSessionEvent",
    "DeliveredSessionParameters",
    "TreatmentCourse",
]


def get_clinical_session(db: Session, session_id: str) -> ClinicalSession | None:
    return db.query(ClinicalSession).filter(ClinicalSession.id == session_id).first()
