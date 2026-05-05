from __future__ import annotations

import json
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import Patient, User


def create_patient(
    session: Session,
    *,
    clinician_id: str,
    first_name: str,
    last_name: str,
    dob: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    gender: Optional[str] = None,
    primary_condition: Optional[str] = None,
    secondary_conditions: Optional[list[str]] = None,
    primary_modality: Optional[str] = None,
    referring_clinician: Optional[str] = None,
    insurance_provider: Optional[str] = None,
    insurance_number: Optional[str] = None,
    consent_signed: bool = False,
    consent_date: Optional[str] = None,
    status: str = "active",
    notes: Optional[str] = None,
) -> Patient:
    patient = Patient(
        clinician_id=clinician_id,
        first_name=first_name,
        last_name=last_name,
        dob=dob,
        email=email,
        phone=phone,
        gender=gender,
        primary_condition=primary_condition,
        secondary_conditions=json.dumps(secondary_conditions or []),
        primary_modality=primary_modality,
        referring_clinician=referring_clinician,
        insurance_provider=insurance_provider,
        insurance_number=insurance_number,
        consent_signed=consent_signed,
        consent_date=consent_date,
        status=status,
        notes=notes,
    )
    session.add(patient)
    session.commit()
    session.refresh(patient)
    return patient


def get_patient(session: Session, patient_id: str, clinician_id: str) -> Optional[Patient]:
    return session.scalar(
        select(Patient).where(Patient.id == patient_id, Patient.clinician_id == clinician_id)
    )


def list_patients(session: Session, clinician_id: str) -> list[Patient]:
    return list(
        session.scalars(
            select(Patient)
            .where(Patient.clinician_id == clinician_id)
            .order_by(Patient.last_name, Patient.first_name)
        ).all()
    )


def update_patient(session: Session, patient_id: str, clinician_id: str, **kwargs) -> Optional[Patient]:
    patient = get_patient(session, patient_id, clinician_id)
    if patient is None:
        return None
    if "secondary_conditions" in kwargs and isinstance(kwargs["secondary_conditions"], list):
        kwargs["secondary_conditions"] = json.dumps(kwargs["secondary_conditions"])
    for key, value in kwargs.items():
        if hasattr(patient, key):
            setattr(patient, key, value)
    session.commit()
    session.refresh(patient)
    return patient


def delete_patient(session: Session, patient_id: str, clinician_id: str) -> bool:
    patient = get_patient(session, patient_id, clinician_id)
    if patient is None:
        return False
    session.delete(patient)
    session.commit()
    return True


def resolve_patient_clinic_id(
    session: Session, patient_id: str
) -> tuple[bool, Optional[str]]:
    """Resolve a patient's owning clinic id without role-scoping.

    Patients link to clinics indirectly: ``patients.clinician_id`` is the
    owning clinician's user id, and ``users.clinic_id`` is the clinic.
    A single SELECT joins both columns so the cross-clinic ownership gate
    in :func:`app.auth.require_patient_owner` can decide membership without
    pulling the full Patient row.

    Returns a 2-tuple ``(patient_exists, clinic_id)``:

    * ``(True, "<clinic-uuid>")`` — patient exists and their owning
      clinician is bound to a clinic.
    * ``(True, None)`` — patient exists but has no clinic (orphaned: the
      clinician's ``clinic_id`` is NULL, e.g. a freshly-registered solo
      practitioner who hasn't joined a clinic yet).
    * ``(False, None)`` — no Patient row matches ``patient_id``. Callers
      decide whether that's a 404 (real endpoint over real data) or a pass
      (synthetic / demo endpoint that generates data from the id).
    """
    if not patient_id:
        return False, None
    row = session.execute(
        select(Patient.clinician_id, User.clinic_id)
        .join(User, User.id == Patient.clinician_id, isouter=True)
        .where(Patient.id == patient_id)
    ).first()
    if row is None:
        return False, None
    return True, row[1]


def get_patient_primary_condition(
    session: Session, patient_id: str
) -> Optional[str]:
    """Return the patient's primary condition without exposing ORM access to routers."""
    if not patient_id:
        return None
    condition = session.scalar(
        select(Patient.primary_condition).where(Patient.id == patient_id)
    )
    if condition is None:
        return None
    normalized = str(condition).strip()
    return normalized or None
