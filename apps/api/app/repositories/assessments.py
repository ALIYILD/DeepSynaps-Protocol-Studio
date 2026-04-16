from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import AssessmentRecord


_ALLOWED_FIELDS = {
    "patient_id", "template_id", "template_title", "clinician_notes",
    "status", "score", "respondent_type", "phase", "scale_version",
    "bundle_id", "approved_status", "reviewed_by", "source",
}


def _coerce_due_date(value: Any) -> Optional[datetime]:
    """Accept either ISO string or datetime for due_date."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            # Accept YYYY-MM-DD as well as full ISO.
            if "T" not in value:
                value = value + "T00:00:00"
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


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
    **extra: Any,
) -> AssessmentRecord:
    """Create an assessment row.

    Extra keyword arguments are filtered against the allowed governance
    fields (respondent_type, phase, due_date, scale_version, bundle_id,
    approved_status, reviewed_by, source) so callers can pass through the
    optional ones without worrying about unknown-field typos.
    """
    kwargs: dict[str, Any] = {
        "clinician_id": clinician_id,
        "patient_id": patient_id,
        "template_id": template_id,
        "template_title": template_title,
        "data_json": json.dumps(data or {}),
        "clinician_notes": clinician_notes,
        "status": status,
        "score": score,
    }
    if "due_date" in extra:
        due = _coerce_due_date(extra.pop("due_date"))
        if due is not None:
            kwargs["due_date"] = due
    if "reviewed_by" in extra and extra.get("reviewed_by"):
        kwargs["reviewed_at"] = datetime.now(timezone.utc)
    if "ai_generated" in extra and extra.pop("ai_generated"):
        kwargs["ai_generated_at"] = datetime.now(timezone.utc)
    for key, value in list(extra.items()):
        if key in _ALLOWED_FIELDS and value is not None:
            kwargs[key] = value

    record = AssessmentRecord(**kwargs)
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
    if "due_date" in kwargs:
        kwargs["due_date"] = _coerce_due_date(kwargs.get("due_date"))
    # Track approval timestamp whenever reviewed_by is set.
    if kwargs.get("reviewed_by") and not kwargs.get("reviewed_at"):
        kwargs["reviewed_at"] = datetime.now(timezone.utc)
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
