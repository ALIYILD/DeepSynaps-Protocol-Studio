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
    # 026_assessments_golive — nullable go-live columns
    "score_numeric", "severity", "interpretation",
    "ai_summary", "ai_model", "ai_confidence",
    "escalated", "escalation_reason", "escalated_by",
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
    if "completed_at" in extra:
        ca = _coerce_due_date(extra.pop("completed_at"))
        if ca is not None:
            kwargs["completed_at"] = ca
    if "escalated_at" in extra:
        ea = _coerce_due_date(extra.pop("escalated_at"))
        if ea is not None:
            kwargs["escalated_at"] = ea
    if "items" in extra:
        items_val = extra.pop("items")
        if items_val is not None:
            kwargs["items_json"] = json.dumps(items_val)
    if "subscales" in extra:
        subs_val = extra.pop("subscales")
        if subs_val is not None:
            kwargs["subscales_json"] = json.dumps(subs_val)
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
    if "items" in kwargs:
        items_val = kwargs.pop("items")
        kwargs["items_json"] = json.dumps(items_val) if items_val is not None else None
    if "subscales" in kwargs:
        subs_val = kwargs.pop("subscales")
        kwargs["subscales_json"] = json.dumps(subs_val) if subs_val is not None else None
    if "due_date" in kwargs:
        kwargs["due_date"] = _coerce_due_date(kwargs.get("due_date"))
    if "completed_at" in kwargs:
        kwargs["completed_at"] = _coerce_due_date(kwargs.get("completed_at"))
    if "escalated_at" in kwargs:
        kwargs["escalated_at"] = _coerce_due_date(kwargs.get("escalated_at"))
    # Track approval timestamp whenever reviewed_by is set.
    if kwargs.get("reviewed_by") and not kwargs.get("reviewed_at"):
        kwargs["reviewed_at"] = datetime.now(timezone.utc)
    # If status flips to completed and no completed_at supplied, stamp it.
    if kwargs.get("status") == "completed" and not kwargs.get("completed_at") and record.completed_at is None:
        kwargs["completed_at"] = datetime.now(timezone.utc)
    # If AI summary text is set without an explicit ai_generated_at, mark timestamp.
    if kwargs.get("ai_summary") and not kwargs.get("ai_generated_at"):
        kwargs["ai_generated_at"] = datetime.now(timezone.utc)
    # If escalated flipped true and no explicit escalated_at, stamp it.
    if kwargs.get("escalated") and record.escalated_at is None and not kwargs.get("escalated_at"):
        kwargs["escalated_at"] = datetime.now(timezone.utc)
    # Defense-in-depth allowlist: even though the route's Pydantic schema
    # (AssessmentUpdate) defaults to dropping extras, an open `setattr` loop
    # gated only by `hasattr(record, key)` is a foot-gun — any future schema
    # broadening would silently let callers mutate sensitive columns
    # (reviewed_by, reviewed_at, escalated, escalated_at, ai_summary,
    # clinician_id, etc.) via crafted JSON. Restrict updates to the column
    # set the route is documented to mutate.
    _UPDATABLE_FIELDS = frozenset({
        # Patient-supplied or clinician-PATCH content (gated by the route's
        # Pydantic schema — AssessmentUpdate exposes these and only these to
        # the public endpoint; the schema is the primary mass-assignment
        # gate, this allowlist is defense-in-depth).
        "patient_id",
        "data_json",
        "items_json",
        "subscales_json",
        "clinician_notes",
        "status",
        "score",
        "score_numeric",
        "interpretation",
        "severity",
        "respondent_type",
        "phase",
        "due_date",
        "completed_at",
        "scale_version",
        "bundle_id",
        # Governance fields written by dedicated internal route handlers
        # only (`/{id}/approve`, `/{id}/escalate`, `/{id}/ai-summary`) which
        # build the kwargs dict explicitly — never reachable via the generic
        # PATCH endpoint because AssessmentUpdate schema does not expose
        # them. Listed here so those internal handlers continue to work.
        "approved_status",
        "reviewed_by",
        "ai_summary",
        "ai_model",
        "ai_confidence",
        "escalated",
        "escalated_by",
        "escalation_reason",
        # Timestamps stamped by this function above (not from caller payload).
        "reviewed_at",
        "ai_generated_at",
        "escalated_at",
    })
    for key, value in kwargs.items():
        if key in _UPDATABLE_FIELDS and hasattr(record, key):
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
