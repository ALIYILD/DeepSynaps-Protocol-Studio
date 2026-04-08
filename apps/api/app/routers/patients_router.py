from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.patients import (
    create_patient,
    delete_patient,
    get_patient,
    list_patients,
    update_patient,
)

router = APIRouter(prefix="/api/v1/patients", tags=["patients"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    dob: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    primary_condition: Optional[str] = None
    secondary_conditions: list[str] = []
    primary_modality: Optional[str] = None
    referring_clinician: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_number: Optional[str] = None
    consent_signed: bool = False
    consent_date: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    primary_condition: Optional[str] = None
    secondary_conditions: Optional[list[str]] = None
    primary_modality: Optional[str] = None
    referring_clinician: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_number: Optional[str] = None
    consent_signed: Optional[bool] = None
    consent_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: str
    clinician_id: str
    first_name: str
    last_name: str
    dob: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    gender: Optional[str]
    primary_condition: Optional[str]
    secondary_conditions: list[str]
    primary_modality: Optional[str]
    referring_clinician: Optional[str]
    insurance_provider: Optional[str]
    insurance_number: Optional[str]
    consent_signed: bool
    consent_date: Optional[str]
    status: str
    notes: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r) -> "PatientOut":
        secondary = []
        try:
            secondary = json.loads(r.secondary_conditions or "[]")
        except Exception:
            pass
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            first_name=r.first_name,
            last_name=r.last_name,
            dob=r.dob,
            email=r.email,
            phone=r.phone,
            gender=r.gender,
            primary_condition=r.primary_condition,
            secondary_conditions=secondary,
            primary_modality=r.primary_modality,
            referring_clinician=r.referring_clinician,
            insurance_provider=r.insurance_provider,
            insurance_number=r.insurance_number,
            consent_signed=r.consent_signed,
            consent_date=r.consent_date,
            status=r.status,
            notes=r.notes,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class PatientListResponse(BaseModel):
    items: list[PatientOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=PatientListResponse)
def list_patients_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientListResponse:
    require_minimum_role(actor, "clinician")
    patients = list_patients(session, actor.actor_id)
    items = [PatientOut.from_record(p) for p in patients]
    return PatientListResponse(items=items, total=len(items))


@router.post("", response_model=PatientOut, status_code=201)
def create_patient_endpoint(
    body: PatientCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    patient = create_patient(session, clinician_id=actor.actor_id, **body.model_dump())
    return PatientOut.from_record(patient)


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient_endpoint(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    patient = get_patient(session, patient_id, actor.actor_id)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    return PatientOut.from_record(patient)


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient_endpoint(
    patient_id: str,
    body: PatientUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PatientOut:
    require_minimum_role(actor, "clinician")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    patient = update_patient(session, patient_id, actor.actor_id, **updates)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    return PatientOut.from_record(patient)


@router.delete("/{patient_id}", status_code=204)
def delete_patient_endpoint(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    deleted = delete_patient(session, patient_id, actor.actor_id)
    if not deleted:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
