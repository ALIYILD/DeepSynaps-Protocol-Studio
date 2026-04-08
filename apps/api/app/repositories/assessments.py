from __future__ import annotations

import json
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import AssessmentRecord


def create_assessment(
    session: Session,
    *,
    clinician_id: str,
    template_id: str,
    template_title: str,
    patient_id: Optional[str] = None,
    data: Optional[dict] = None,
    clinician_notes: Optional[str] = None,
    status: str = "draft",
    score: Optional[str] = None,
) -> AssessmentRecord:
    record = AssessmentRecord(
        clinician_id=clinician_id,
        patient_id=patient_id,
        template_id=template_id,
        template_title=template_title,
        data_json=json.dumps(data or {}),
        clinician_notes=clinician_notes,
        status=status,
        score=score,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_assessment(session: Session, assessment_id: str, clinician_id: str) -> Optional[AssessmentRecord]:
    return session.scalar(
        select(AssessmentRecord).where(
            AssessmentRecord.id == assessment_id,
            AssessmentRecord.clinician_id == clinician_id,
        )
    )


def list_assessments_for_clinician(session: Session, clinician_id: str) -> list[AssessmentRecord]:
    return list(
        session.scalars(
            select(AssessmentRecord)
            .where(AssessmentRecord.clinician_id == clinician_id)
            .order_by(AssessmentRecord.updated_at.desc())
        ).all()
    )


def list_assessments_for_patient(session: Session, patient_id: str, clinician_id: str) -> list[AssessmentRecord]:
    return list(
        session.scalars(
            select(AssessmentRecord)
            .where(
                AssessmentRecord.patient_id == patient_id,
                AssessmentRecord.clinician_id == clinician_id,
            )
            .order_by(AssessmentRecord.updated_at.desc())
        ).all()
    )


def update_assessment(session: Session, assessment_id: str, clinician_id: str, **kwargs) -> Optional[AssessmentRecord]:
    record = get_assessment(session, assessment_id, clinician_id)
    if record is None:
        return None
    if "data" in kwargs:
        kwargs["data_json"] = json.dumps(kwargs.pop("data"))
    for key, value in kwargs.items():
        if hasattr(record, key):
            setattr(record, key, value)
    session.commit()
    session.refresh(record)
    return record


def delete_assessment(session: Session, assessment_id: str, clinician_id: str) -> bool:
    record = get_assessment(session, assessment_id, clinician_id)
    if record is None:
        return False
    session.delete(record)
    session.commit()
    return True
