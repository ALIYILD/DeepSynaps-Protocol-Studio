"""Nutrition, Supplements & Diet Analyzer router (MVP scaffold).

Endpoints
---------
GET  /api/v1/nutrition/analyzer/patient/{patient_id}              — aggregated payload
POST /api/v1/nutrition/analyzer/patient/{patient_id}/recompute    — new computation_id
POST /api/v1/nutrition/analyzer/patient/{patient_id}/diet-log      — append diet row
POST /api/v1/nutrition/analyzer/patient/{patient_id}/supplement    — append supplement
POST /api/v1/nutrition/analyzer/patient/{patient_id}/review-note   — audit note
GET  /api/v1/nutrition/analyzer/patient/{patient_id}/audit        — audit events list
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import NutritionAnalyzerAudit, PatientNutritionDietLog, PatientSupplement
from app.repositories.patients import resolve_patient_clinic_id
from app.schemas.nutrition_analyzer import NutritionAnalyzerPayload
from app.services.nutrition_analyzer import build_patient_nutrition_payload, new_computation_id

router = APIRouter(prefix="/api/v1/nutrition/analyzer", tags=["Nutrition Analyzer"])


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


class DietLogCreate(BaseModel):
    log_day: str
    calories_kcal: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    sodium_mg: float | None = None
    fiber_g: float | None = None
    notes: str | None = None


class SupplementCreate(BaseModel):
    name: str
    dose: str | None = None
    frequency: str | None = None
    active: bool = True
    notes: str | None = None
    started_at: str | None = None


class ReviewNoteCreate(BaseModel):
    note: str


class AckResponse(BaseModel):
    ok: bool = True


class NutritionAuditEntry(BaseModel):
    id: str
    patient_id: str
    event_type: str
    message: str
    actor_id: str | None
    created_at: str


class NutritionAuditListResponse(BaseModel):
    items: list[NutritionAuditEntry]
    total: int


@router.get("/patient/{patient_id}", response_model=NutritionAnalyzerPayload)
def get_nutrition_analyzer_payload(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> NutritionAnalyzerPayload:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    return build_patient_nutrition_payload(
        patient_id,
        db,
        actor.actor_id,
        is_admin=(actor.role == "admin"),
    )


@router.post("/patient/{patient_id}/recompute", response_model=NutritionAnalyzerPayload)
def recompute_nutrition_analyzer(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> NutritionAnalyzerPayload:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    comp = new_computation_id()
    row = NutritionAnalyzerAudit(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        event_type="recompute",
        message=f"Recompute requested. computation_id={comp}",
        actor_id=actor.actor_id,
    )
    db.add(row)
    db.commit()
    return build_patient_nutrition_payload(
        patient_id,
        db,
        actor.actor_id,
        computation_id=comp,
        is_admin=(actor.role == "admin"),
    )


@router.post("/patient/{patient_id}/diet-log", response_model=AckResponse)
def append_diet_log(
    patient_id: str,
    body: DietLogCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AckResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    day = body.log_day.strip()
    if not day:
        raise ApiServiceError(code="invalid_request", message="log_day is required.", status_code=422)
    row = PatientNutritionDietLog(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        log_day=day,
        calories_kcal=body.calories_kcal,
        protein_g=body.protein_g,
        carbs_g=body.carbs_g,
        fat_g=body.fat_g,
        sodium_mg=body.sodium_mg,
        fiber_g=body.fiber_g,
        notes=body.notes,
    )
    db.add(row)
    db.add(
        NutritionAnalyzerAudit(
            patient_id=patient_id,
            clinician_id=actor.actor_id,
            event_type="diet_log",
            message=f"Appended diet log for {day}",
            actor_id=actor.actor_id,
        )
    )
    db.commit()
    return AckResponse()


@router.post("/patient/{patient_id}/supplement", response_model=AckResponse)
def append_supplement(
    patient_id: str,
    body: SupplementCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AckResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    name = body.name.strip()
    if not name:
        raise ApiServiceError(code="invalid_request", message="name is required.", status_code=422)
    row = PatientSupplement(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        name=name,
        dose=body.dose,
        frequency=body.frequency,
        active=body.active,
        notes=body.notes,
        started_at=body.started_at,
    )
    db.add(row)
    db.add(
        NutritionAnalyzerAudit(
            patient_id=patient_id,
            clinician_id=actor.actor_id,
            event_type="supplement_add",
            message=f"Added supplement: {name}",
            actor_id=actor.actor_id,
        )
    )
    db.commit()
    return AckResponse()


@router.post("/patient/{patient_id}/review-note", response_model=AckResponse)
def append_review_note(
    patient_id: str,
    body: ReviewNoteCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AckResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    note = (body.note or "").strip()
    if not note:
        raise ApiServiceError(code="invalid_request", message="note is required.", status_code=422)
    db.add(
        NutritionAnalyzerAudit(
            patient_id=patient_id,
            clinician_id=actor.actor_id,
            event_type="review_note",
            message=note[:4000],
            actor_id=actor.actor_id,
        )
    )
    db.commit()
    return AckResponse()


@router.get("/patient/{patient_id}/audit", response_model=NutritionAuditListResponse)
def list_nutrition_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> NutritionAuditListResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    q = db.query(NutritionAnalyzerAudit).filter(NutritionAnalyzerAudit.patient_id == patient_id)
    if actor.role != "admin":
        q = q.filter(NutritionAnalyzerAudit.clinician_id == actor.actor_id)
    rows = q.order_by(NutritionAnalyzerAudit.created_at.desc()).limit(200).all()

    def _dt(v: datetime | None) -> str:
        if v is None:
            return ""
        return v.isoformat().replace("+00:00", "Z")

    items = [
        NutritionAuditEntry(
            id=r.id,
            patient_id=r.patient_id,
            event_type=r.event_type,
            message=r.message or "",
            actor_id=r.actor_id,
            created_at=_dt(r.created_at),
        )
        for r in rows
    ]
    return NutritionAuditListResponse(items=items, total=len(items))
