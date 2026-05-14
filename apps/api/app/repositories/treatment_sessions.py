"""Repository layer for Intervention Analyzer data access.

Exposes model classes used by treatment_sessions_router.
"""
from __future__ import annotations

from typing import Literal, Optional

from sqlalchemy.orm import Session

from app.persistence.models import (
    AdverseEvent,
    ClinicalSession,
    ClinicalSessionEvent,
    DeliveredSessionParameters,
    Patient,
    TreatmentCourse,
    User,
)

__all__ = [
    "AdverseEvent",
    "ClinicalSession",
    "ClinicalSessionEvent",
    "DeliveredSessionParameters",
    "Patient",
    "TreatmentCourse",
    "User",
    "get_clinical_session",
    "list_clinic_courses",
    "list_clinic_patients",
    "count_adverse_events_for_courses",
]


def get_clinical_session(db: Session, session_id: str) -> ClinicalSession | None:
    """Return a clinical session by ID. Decision-support only."""
    return db.query(ClinicalSession).filter(ClinicalSession.id == session_id).first()


def list_clinic_courses(
    db: Session,
    clinician_ids: list[str],
    status_filter: Optional[str] = None,
    include_archived: bool = False,
) -> list[TreatmentCourse]:
    """Return all intervention courses for a set of clinicians (e.g., clinic-wide).

    Decision-support only. Not a calibrated prediction model.
    Associations shown are temporal, not causal proof.
    """
    q = db.query(TreatmentCourse).filter(
        TreatmentCourse.clinician_id.in_(clinician_ids)
    )
    if status_filter:
        q = q.filter(TreatmentCourse.status == status_filter)
    if not include_archived:
        q = q.filter(TreatmentCourse.status.not_in(["archived", "deleted"]))
    return list(q.all())


def list_clinic_patients(
    db: Session, patient_ids: list[str]
) -> dict[str, Patient]:
    """Return patient rows keyed by patient_id for a batch lookup.

    Decision-support only.
    """
    if not patient_ids:
        return {}
    rows = db.query(Patient).filter(Patient.id.in_(patient_ids)).all()
    return {p.id: p for p in rows}


def count_adverse_events_for_courses(
    db: Session, course_ids: list[str]
) -> dict[str, int]:
    """Return adverse-event counts keyed by course_id for a batch of courses.

    Decision-support only. Requires clinician review.
    """
    if not course_ids:
        return {}
    rows = (
        db.query(AdverseEvent.course_id)
        .filter(AdverseEvent.course_id.in_(course_ids))
        .all()
    )
    counts: dict[str, int] = {}
    for row in rows:
        cid = row[0]
        counts[cid] = counts.get(cid, 0) + 1
    return counts
