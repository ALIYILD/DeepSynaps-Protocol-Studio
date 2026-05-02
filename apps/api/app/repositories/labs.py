"""Repository for Patient + PatientLabResult access used by the Labs Analyzer router.

Per Architect Rec #8 PR-A: routers MUST go through `app.repositories` rather than
importing models from `app.persistence.models` directly. This module wraps the
small surface the labs analyzer router needs (patient existence + display name +
inserting clinician-entered lab rows).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import Patient, PatientLabResult


def get_patient_by_id(session: Session, patient_id: str) -> Optional[Patient]:
    """Return the Patient row by its primary key, or None if not found."""
    return session.execute(
        select(Patient).where(Patient.id == patient_id)
    ).scalar_one_or_none()


def get_patient_display_name(session: Session, patient_id: str) -> Optional[str]:
    """Return the patient's display name (first + last) or None if no patient."""
    row = get_patient_by_id(session, patient_id)
    if not row:
        return None
    parts = [row.first_name or "", row.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or None


def get_patient_profile(
    session: Session, patient_id: str
) -> tuple[Optional[str], Optional[str]]:
    """Return (display_name, primary_condition) for the patient, or (None, None)."""
    row = get_patient_by_id(session, patient_id)
    if not row:
        return None, None
    parts = [row.first_name or "", row.last_name or ""]
    name = " ".join(p for p in parts if p).strip() or None
    cond = (row.primary_condition or "").strip() or None
    return name, cond


def insert_lab_result_batch(
    session: Session,
    *,
    patient_id: str,
    clinician_id: str,
    items: Sequence[dict],
    is_demo: bool,
) -> int:
    """Insert a batch of clinician-entered lab results for a patient.

    Each item dict is expected to contain the PatientLabResult column fields
    already validated (analyte_code, analyte_display_name, panel_name,
    value_numeric, value_text, unit_ucum, ref_low, ref_high, ref_text,
    sample_collected_at, source). Caller is responsible for the surrounding
    transaction error handling — we only flush on success here.

    Returns the number of rows added.
    """
    created = 0
    for it in items:
        sample_at = it.get("sample_collected_at")
        if sample_at is not None and not isinstance(sample_at, datetime):
            # Be defensive: caller should have parsed, but normalize just in case.
            sample_at = None
        row = PatientLabResult(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            clinician_id=clinician_id,
            analyte_code=(it["analyte_code"] or "").strip(),
            analyte_display_name=(it["analyte_display_name"] or "").strip(),
            panel_name=it.get("panel_name"),
            value_numeric=it.get("value_numeric"),
            value_text=it.get("value_text"),
            unit_ucum=it.get("unit_ucum"),
            ref_low=it.get("ref_low"),
            ref_high=it.get("ref_high"),
            ref_text=it.get("ref_text"),
            sample_collected_at=sample_at,
            source=(it.get("source") or "manual")[:32],
            is_demo=is_demo,
        )
        session.add(row)
        created += 1
    session.commit()
    return created
