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

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories import nutrition as nutrition_repo
from app.repositories.patients import resolve_patient_clinic_id
from app.schemas.nutrition_analyzer import NutritionAnalyzerPayload
from app.services.nutrition_analyzer import build_patient_nutrition_payload, new_computation_id

router = APIRouter(prefix="/api/v1/nutrition/analyzer", tags=["Nutrition Analyzer"])


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _parse_iso_date(value: str, *, field_name: str) -> str:
    raw = value.strip()
    if not raw:
        raise ApiServiceError(code="invalid_request", message=f"{field_name} is required.", status_code=422)
    try:
        date.fromisoformat(raw)
    except ValueError as exc:
        raise ApiServiceError(
            code="invalid_request",
            message=f"{field_name} must be an ISO date (YYYY-MM-DD).",
            status_code=422,
        ) from exc
    return raw


def _parse_optional_iso_temporal(value: str | None, *, field_name: str) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        parsed_date = date.fromisoformat(raw)
        return parsed_date.isoformat()
    except ValueError:
        pass
    try:
        parsed_dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed_dt.tzinfo is not None:
            parsed_dt = parsed_dt.astimezone(timezone.utc)
        parsed_dt = parsed_dt.replace(microsecond=0)
        return (
            parsed_dt.isoformat().replace("+00:00", "Z")
            if parsed_dt.tzinfo is not None
            else parsed_dt.isoformat()
        )
    except ValueError as exc:
        raise ApiServiceError(
            code="invalid_request",
            message=f"{field_name} must be an ISO date or datetime.",
            status_code=422,
        ) from exc


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    return raw or None


# core-schema-exempt: minimal router-local diet log request body; not reused outside this router
class DietLogCreate(BaseModel):
    log_day: str
    calories_kcal: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    sodium_mg: float | None = None
    fiber_g: float | None = None
    notes: str | None = None


# core-schema-exempt: minimal router-local supplement request body; not reused outside this router
class SupplementCreate(BaseModel):
    name: str
    dose: str | None = None
    frequency: str | None = None
    active: bool = True
    notes: str | None = None
    started_at: str | None = None


# core-schema-exempt: minimal router-local review-note request body; not reused outside this router
class ReviewNoteCreate(BaseModel):
    note: str


# core-schema-exempt: trivial ack envelope; identical to other analyzer routers' local Ack
class AckResponse(BaseModel):
    ok: bool = True


# core-schema-exempt: router-local audit row projection; mirrors NutritionAnalyzerAudit columns and is not reused
class NutritionAuditEntry(BaseModel):
    id: str
    patient_id: str
    event_type: str
    message: str
    actor_id: str | None
    created_at: str


# core-schema-exempt: router-local list envelope for the audit endpoint; not reused
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
    nutrition_repo.append_audit(
        db,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        event_type="recompute",
        message=f"Recompute requested. computation_id={comp}",
    )
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
    day = _parse_iso_date(body.log_day, field_name="log_day")
    nutrition_repo.insert_diet_log(
        db,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        log_day=day,
        calories_kcal=body.calories_kcal,
        protein_g=body.protein_g,
        carbs_g=body.carbs_g,
        fat_g=body.fat_g,
        sodium_mg=body.sodium_mg,
        fiber_g=body.fiber_g,
        notes=_normalize_optional_text(body.notes),
    )
    nutrition_repo.append_audit(
        db,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        event_type="diet_log",
        message=f"Appended diet log for {day}",
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
    if len(name) > 255:
        raise ApiServiceError(
            code="invalid_request",
            message="name must be 255 characters or fewer.",
            status_code=422,
        )
    dose = _normalize_optional_text(body.dose)
    if dose is not None and len(dose) > 120:
        raise ApiServiceError(
            code="invalid_request",
            message="dose must be 120 characters or fewer.",
            status_code=422,
        )
    frequency = _normalize_optional_text(body.frequency)
    if frequency is not None and len(frequency) > 120:
        raise ApiServiceError(
            code="invalid_request",
            message="frequency must be 120 characters or fewer.",
            status_code=422,
        )
    notes = _normalize_optional_text(body.notes)
    started_at = _parse_optional_iso_temporal(body.started_at, field_name="started_at")
    nutrition_repo.insert_supplement(
        db,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        name=name,
        dose=dose,
        frequency=frequency,
        active=body.active,
        notes=notes,
        started_at=started_at,
    )
    nutrition_repo.append_audit(
        db,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        event_type="supplement_add",
        message=f"Added supplement: {name}",
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
    nutrition_repo.append_audit(
        db,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        event_type="review_note",
        message=note,
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
    rows = nutrition_repo.list_audit_rows(
        db,
        patient_id=patient_id,
        actor_id=actor.actor_id,
        is_admin=(actor.role == "admin"),
        limit=200,
    )

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
