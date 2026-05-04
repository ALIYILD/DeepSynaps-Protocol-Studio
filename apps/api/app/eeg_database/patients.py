"""Patient card persistence — profile JSON merge + revision rows."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.persistence.models import (
    EegStudioProfileRevision,
    EegStudioRecording,
    Patient,
)

from .profile import deep_merge, dumps_profile, parse_profile


def get_merged_card(db: Session, patient: Patient) -> dict[str, Any]:
    """Merge core ``Patient`` row with ``eeg_studio_profile_json`` for API."""
    prof = parse_profile(patient.eeg_studio_profile_json)
    ident = prof.setdefault("identification", {})
    ident.setdefault("firstName", patient.first_name)
    ident.setdefault("lastName", patient.last_name)
    ident.setdefault("dateOfBirth", patient.dob or "")
    clinical = prof.setdefault("clinical", {})
    if patient.primary_condition:
        clinical.setdefault("diagnosisLabel", patient.primary_condition)
    if patient.referring_clinician:
        clinical.setdefault("referringPhysician", patient.referring_clinician)
    if patient.notes:
        clinical.setdefault("clinicalNotes", patient.notes)
    return {
        "patientId": patient.id,
        "clinicianId": patient.clinician_id,
        "profile": prof,
        "createdAt": patient.created_at.isoformat() if patient.created_at else None,
        "updatedAt": patient.updated_at.isoformat() if patient.updated_at else None,
        "status": patient.status,
    }


def patch_profile(
    db: Session,
    patient: Patient,
    patch: dict[str, Any],
    editor_id: str,
) -> dict[str, Any]:
    """Deep-merge *patch* into stored profile; append revision snapshot."""
    current = parse_profile(patient.eeg_studio_profile_json)
    merged = deep_merge(current, patch)
    snap = dumps_profile(merged)
    rev = EegStudioProfileRevision(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        snapshot_json=snap,
        editor_id=editor_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(rev)
    patient.eeg_studio_profile_json = snap
    patient.updated_at = datetime.now(timezone.utc)
    db.flush()
    return merged


def list_patients_rows(
    db: Session,
    clinician_id: str,
    q: str | None,
    smart: str | None,
    limit: int,
    offset: int,
) -> list[tuple[Patient, datetime | None]]:
    """Return patient rows with optional text filter + smart presets (server-side)."""
    stmt = select(Patient).where(Patient.clinician_id == clinician_id)
    stmt = stmt.where(Patient.status != "merged_away")

    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Patient.first_name).like(like),
                func.lower(Patient.last_name).like(like),
                func.lower(func.coalesce(Patient.notes, "")).like(like),
                func.lower(func.coalesce(Patient.primary_condition, "")).like(like),
            )
        )

    stmt = stmt.order_by(Patient.last_name, Patient.first_name).limit(limit).offset(offset)
    patients = list(db.scalars(stmt).all())
    ids = [p.id for p in patients]
    last_map: dict[str, datetime | None] = {}
    if ids:
        q2 = (
            select(EegStudioRecording.patient_id, func.max(EegStudioRecording.recorded_at))
            .where(
                EegStudioRecording.patient_id.in_(ids),
                EegStudioRecording.deleted_at.is_(None),
            )
            .group_by(EegStudioRecording.patient_id)
        )
        for pid, mx in db.execute(q2).all():
            last_map[str(pid)] = mx

    out: list[tuple[Patient, datetime | None]] = [
        (p, last_map.get(p.id)) for p in patients
    ]

    if smart == "last_7_days":
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        out = [(p, lr) for p, lr in out if lr and lr >= cutoff]
    elif smart == "pediatric":
        out = [(p, lr) for p, lr in out if (p.dob or "") >= "2008"]
    return out


def list_revisions(db: Session, patient_id: str, limit: int = 50) -> list[EegStudioProfileRevision]:
    stmt = (
        select(EegStudioProfileRevision)
        .where(EegStudioProfileRevision.patient_id == patient_id)
        .order_by(EegStudioProfileRevision.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())
