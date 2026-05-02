"""Neuromodulation-focused bio database router."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    ClinicalCatalogItem,
    PatientLabResult,
    PatientSubstance,
)
from app.repositories.patients import resolve_patient_clinic_id


router = APIRouter(prefix="/api/v1/bio", tags=["Bio Database"])


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    require_minimum_role(actor, "clinician")
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )
    require_patient_owner(actor, clinic_id)


def _slugify(value: str) -> str:
    raw = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
    return raw.strip("-") or "item"


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        try:
            dt = datetime.fromisoformat(raw + "T00:00:00+00:00")
        except ValueError:
            raise ApiServiceError(
                code="invalid_input",
                message=f"Invalid datetime value: {value}",
                status_code=422,
            )
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _dt(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def _json_loads(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except Exception:
        return []
    if isinstance(payload, list):
        return [str(v) for v in payload if v is not None]
    return []


class CatalogItemOut(BaseModel):
    id: str
    item_type: str
    type: str
    slug: str
    name: str
    display_name: str
    category: Optional[str] = None
    aliases: list[str] = Field(default_factory=list)
    default_unit: Optional[str] = None
    unit_options: list[str] = Field(default_factory=list)
    neuromodulation_relevance: Optional[str] = None
    evidence_note: Optional[str] = None
    active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CatalogListResponse(BaseModel):
    items: list[CatalogItemOut] = Field(default_factory=list)
    total: int = 0


class CatalogSeedResponse(BaseModel):
    created: int = 0
    skipped: int = 0
    total_catalog_items: int = 0


class PatientSubstanceCreate(BaseModel):
    catalog_item_id: Optional[str] = Field(default=None, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    substance_type: str = Field(min_length=1, max_length=24)
    generic_name: Optional[str] = Field(default=None, max_length=255)
    category: Optional[str] = Field(default=None, max_length=120)
    dose: Optional[str] = Field(default=None, max_length=80)
    dose_unit: Optional[str] = Field(default=None, max_length=40)
    frequency: Optional[str] = Field(default=None, max_length=80)
    route: Optional[str] = Field(default=None, max_length=60)
    indication: Optional[str] = Field(default=None, max_length=255)
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    active: Optional[bool] = None
    status: Optional[str] = Field(default=None, max_length=20)
    source: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=4000)


class PatientSubstanceOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    catalog_item_id: Optional[str] = None
    name: str
    generic_name: Optional[str] = None
    category: Optional[str] = None
    substance_type: str
    type: str
    dose: Optional[str] = None
    dose_unit: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    indication: Optional[str] = None
    active: bool = True
    status: str
    source: Optional[str] = None
    notes: Optional[str] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PatientSubstanceListResponse(BaseModel):
    items: list[PatientSubstanceOut] = Field(default_factory=list)
    total: int = 0


class PatientLabCreate(BaseModel):
    catalog_item_id: Optional[str] = Field(default=None, max_length=36)
    lab_name: Optional[str] = Field(default=None, max_length=255)
    biomarker_name: Optional[str] = Field(default=None, max_length=255)
    specimen_type: Optional[str] = Field(default=None, max_length=80)
    value_text: Optional[str] = Field(default=None, max_length=255)
    value_numeric: Optional[float] = None
    unit: Optional[str] = Field(default=None, max_length=40)
    reference_range_low: Optional[float] = None
    reference_range_high: Optional[float] = None
    reference_range_text: Optional[str] = Field(default=None, max_length=255)
    abnormal_flag: Optional[str] = Field(default=None, max_length=20)
    collected_at: Optional[str] = None
    reported_at: Optional[str] = None
    source_lab: Optional[str] = Field(default=None, max_length=255)
    fasting_state: Optional[str] = Field(default=None, max_length=40)
    notes: Optional[str] = Field(default=None, max_length=4000)


class PatientLabOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    catalog_item_id: Optional[str] = None
    lab_name: Optional[str] = None
    biomarker_name: Optional[str] = None
    name: Optional[str] = None
    specimen_type: Optional[str] = None
    value_text: Optional[str] = None
    value_numeric: Optional[float] = None
    unit: Optional[str] = None
    reference_range_low: Optional[float] = None
    reference_range_high: Optional[float] = None
    reference_range_text: Optional[str] = None
    abnormal_flag: Optional[str] = None
    source_lab: Optional[str] = None
    notes: Optional[str] = None
    collected_at: Optional[str] = None
    reported_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PatientLabListResponse(BaseModel):
    items: list[PatientLabOut] = Field(default_factory=list)
    total: int = 0


class PatientBioSummary(BaseModel):
    patient_id: str
    substances_count: int = 0
    active_substance_count: int = 0
    labs_count: int = 0
    abnormal_lab_count: int = 0
    latest_substance_at: Optional[str] = None
    latest_lab_at: Optional[str] = None


_DEFAULT_CATALOG: list[dict[str, object]] = [
    {
        "item_type": "biomarker",
        "display_name": "Vitamin D",
        "default_unit": "ng/mL",
        "category": "nutritional",
        "neuromodulation_relevance": "Deficiency may confound fatigue, pain, mood, and treatment response.",
    },
    {
        "item_type": "biomarker",
        "display_name": "B12",
        "default_unit": "pg/mL",
        "category": "nutritional",
        "neuromodulation_relevance": "Low B12 can mimic cognitive and mood symptoms.",
    },
    {
        "item_type": "biomarker",
        "display_name": "Folate",
        "default_unit": "ng/mL",
        "category": "nutritional",
        "neuromodulation_relevance": "Folate status can affect mood and energy interpretation.",
    },
    {
        "item_type": "biomarker",
        "display_name": "Ferritin",
        "default_unit": "ng/mL",
        "category": "iron",
        "neuromodulation_relevance": "Iron depletion can confound fatigue, RLS, and attention symptoms.",
    },
    {
        "item_type": "biomarker",
        "display_name": "TSH",
        "default_unit": "uIU/mL",
        "category": "thyroid",
        "neuromodulation_relevance": "Thyroid dysfunction can shift mood, anxiety, and cognition.",
    },
    {
        "item_type": "biomarker",
        "display_name": "Free T4",
        "default_unit": "ng/dL",
        "category": "thyroid",
        "neuromodulation_relevance": "Helps interpret thyroid contribution to symptom burden.",
    },
    {
        "item_type": "lab_test",
        "display_name": "CBC",
        "category": "hematology",
        "neuromodulation_relevance": "Screens anemia and inflammation-adjacent hematology issues.",
    },
    {
        "item_type": "lab_test",
        "display_name": "CMP",
        "category": "metabolic",
        "neuromodulation_relevance": "General metabolic and hepatic context before treatment escalation.",
    },
    {
        "item_type": "biomarker",
        "display_name": "HbA1c",
        "default_unit": "%",
        "category": "glycemic",
        "neuromodulation_relevance": "Glucose dysregulation can affect neuropathy, fatigue, and healing.",
    },
    {
        "item_type": "biomarker",
        "display_name": "CRP",
        "default_unit": "mg/L",
        "category": "inflammation",
        "neuromodulation_relevance": "Inflammatory burden may modify response expectations.",
    },
    {
        "item_type": "biomarker",
        "display_name": "hs-CRP",
        "default_unit": "mg/L",
        "category": "inflammation",
        "neuromodulation_relevance": "Higher-sensitivity inflammatory signal for chronic symptom context.",
    },
    {
        "item_type": "biomarker",
        "display_name": "Magnesium",
        "default_unit": "mg/dL",
        "category": "electrolyte",
        "neuromodulation_relevance": "May influence neuromuscular excitability and headache burden.",
    },
    {
        "item_type": "biomarker",
        "display_name": "Omega-3 Index",
        "default_unit": "%",
        "category": "nutritional",
        "neuromodulation_relevance": "Nutritional inflammation context and membrane-health proxy.",
    },
    {
        "item_type": "biomarker",
        "display_name": "Cortisol",
        "default_unit": "ug/dL",
        "category": "stress",
        "neuromodulation_relevance": "Stress-axis dysregulation can shape arousal and sleep interpretation.",
    },
    {"item_type": "medication", "display_name": "Sertraline", "category": "ssri"},
    {"item_type": "medication", "display_name": "Bupropion", "category": "ndri"},
    {"item_type": "medication", "display_name": "Methylphenidate", "category": "stimulant"},
    {"item_type": "medication", "display_name": "Clonazepam", "category": "benzodiazepine"},
    {"item_type": "medication", "display_name": "Lamotrigine", "category": "anticonvulsant"},
    {"item_type": "medication", "display_name": "Lithium", "category": "mood_stabilizer"},
    {"item_type": "supplement", "display_name": "Melatonin", "category": "sleep"},
    {"item_type": "supplement", "display_name": "NAC", "category": "antioxidant"},
    {"item_type": "supplement", "display_name": "Magnesium Glycinate", "category": "mineral"},
    {"item_type": "supplement", "display_name": "Omega-3", "category": "fatty_acid"},
    {"item_type": "supplement", "display_name": "Creatine", "category": "energy"},
    {"item_type": "supplement", "display_name": "SAM-e", "category": "methylation"},
    {"item_type": "supplement", "display_name": "St John's wort", "category": "herbal"},
]


def _catalog_out(row: ClinicalCatalogItem) -> CatalogItemOut:
    return CatalogItemOut(
        id=row.id,
        item_type=row.item_type,
        type=row.item_type,
        slug=row.slug,
        name=row.display_name,
        display_name=row.display_name,
        category=row.category,
        aliases=_json_loads(row.aliases_json),
        default_unit=row.default_unit,
        unit_options=_json_loads(row.unit_options_json),
        neuromodulation_relevance=row.neuromodulation_relevance,
        evidence_note=row.evidence_note,
        active=bool(row.active),
        created_at=_dt(row.created_at),
        updated_at=_dt(row.updated_at),
    )


def _substance_status(row: PatientSubstance) -> str:
    if not row.active and row.stopped_at is not None:
        return "stopped"
    if not row.active:
        return "paused"
    return "active"


def _substance_out(row: PatientSubstance) -> PatientSubstanceOut:
    return PatientSubstanceOut(
        id=row.id,
        patient_id=row.patient_id,
        clinician_id=row.clinician_id,
        catalog_item_id=row.catalog_item_id,
        name=row.name,
        generic_name=row.generic_name,
        category=row.category,
        substance_type=row.substance_type,
        type=row.substance_type,
        dose=row.dose,
        dose_unit=row.dose_unit,
        frequency=row.frequency,
        route=row.route,
        indication=row.indication,
        active=bool(row.active),
        status=_substance_status(row),
        source=row.source,
        notes=row.notes,
        started_at=_dt(row.started_at),
        stopped_at=_dt(row.stopped_at),
        created_at=_dt(row.created_at),
        updated_at=_dt(row.updated_at),
    )


def _lab_out(row: PatientLabResult) -> PatientLabOut:
    name = row.lab_test_name or row.biomarker_name
    return PatientLabOut(
        id=row.id,
        patient_id=row.patient_id,
        clinician_id=row.clinician_id,
        catalog_item_id=row.catalog_item_id,
        lab_name=row.lab_test_name,
        biomarker_name=row.biomarker_name,
        name=name,
        specimen_type=row.specimen_type,
        value_text=row.value_text,
        value_numeric=row.value_numeric,
        unit=row.unit,
        reference_range_low=row.reference_range_low,
        reference_range_high=row.reference_range_high,
        reference_range_text=row.reference_range_text,
        abnormal_flag=row.abnormal_flag,
        source_lab=row.source_lab,
        notes=row.notes,
        collected_at=_dt(row.collected_at),
        reported_at=_dt(row.reported_at),
        created_at=_dt(row.created_at),
        updated_at=_dt(row.updated_at),
    )


@router.get("/catalog", response_model=CatalogListResponse)
def list_catalog(
    item_type: Optional[str] = Query(default=None, max_length=24),
    q: Optional[str] = Query(default=None, max_length=120),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CatalogListResponse:
    require_minimum_role(actor, "clinician")
    query = db.query(ClinicalCatalogItem)
    if item_type:
        query = query.filter(ClinicalCatalogItem.item_type == item_type.strip().lower())
    if q:
        needle = f"%{q.strip()}%"
        query = query.filter(
            or_(
                ClinicalCatalogItem.display_name.ilike(needle),
                ClinicalCatalogItem.slug.ilike(needle),
                ClinicalCatalogItem.category.ilike(needle),
                ClinicalCatalogItem.aliases_json.ilike(needle),
            )
        )
    rows = query.order_by(
        ClinicalCatalogItem.item_type.asc(),
        ClinicalCatalogItem.display_name.asc(),
    ).limit(500).all()
    return CatalogListResponse(
        items=[_catalog_out(row) for row in rows],
        total=len(rows),
    )


@router.post("/catalog/seed-defaults", response_model=CatalogSeedResponse)
def seed_default_catalog(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CatalogSeedResponse:
    require_minimum_role(actor, "clinician")
    existing = {
        (row.item_type, row.slug)
        for row in db.query(ClinicalCatalogItem).all()
    }
    created = 0
    skipped = 0
    now = datetime.now(timezone.utc)
    for item in _DEFAULT_CATALOG:
        item_type = str(item["item_type"])
        display_name = str(item["display_name"])
        slug = _slugify(display_name)
        key = (item_type, slug)
        if key in existing:
            skipped += 1
            continue
        db.add(
            ClinicalCatalogItem(
                item_type=item_type,
                slug=slug,
                display_name=display_name,
                category=item.get("category"),
                aliases_json=json.dumps(item.get("aliases", [])),
                default_unit=item.get("default_unit"),
                unit_options_json=json.dumps(item.get("unit_options", [])),
                neuromodulation_relevance=item.get("neuromodulation_relevance"),
                evidence_note=item.get("evidence_note"),
                active=True,
                created_at=now,
                updated_at=now,
            )
        )
        existing.add(key)
        created += 1
    db.commit()
    return CatalogSeedResponse(
        created=created,
        skipped=skipped,
        total_catalog_items=db.query(ClinicalCatalogItem).count(),
    )


@router.get("/patients/{patient_id}/substances", response_model=PatientSubstanceListResponse)
def list_patient_substances(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientSubstanceListResponse:
    _gate_patient_access(actor, patient_id, db)
    rows = (
        db.query(PatientSubstance)
        .filter(PatientSubstance.patient_id == patient_id)
        .order_by(PatientSubstance.updated_at.desc(), PatientSubstance.created_at.desc())
        .all()
    )
    return PatientSubstanceListResponse(
        items=[_substance_out(row) for row in rows],
        total=len(rows),
    )


@router.post("/patients/{patient_id}/substances", response_model=PatientSubstanceOut, status_code=201)
def create_patient_substance(
    patient_id: str,
    body: PatientSubstanceCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientSubstanceOut:
    _gate_patient_access(actor, patient_id, db)
    substance_type = body.substance_type.strip().lower()
    status = (body.status or "").strip().lower()
    active = body.active
    if active is None:
        active = status not in {"paused", "stopped"}
    row = PatientSubstance(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        catalog_item_id=body.catalog_item_id,
        substance_type=substance_type,
        name=body.name.strip(),
        generic_name=(body.generic_name or None),
        category=(body.category or None),
        dose=(body.dose or None),
        dose_unit=(body.dose_unit or None),
        frequency=(body.frequency or None),
        route=(body.route or None),
        indication=(body.indication or None),
        started_at=_parse_dt(body.started_at),
        stopped_at=_parse_dt(body.stopped_at),
        active=bool(active),
        source=(body.source or None),
        notes=(body.notes or None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _substance_out(row)


@router.delete("/patients/{patient_id}/substances/{substance_id}", status_code=204)
def delete_patient_substance(
    patient_id: str,
    substance_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_patient_access(actor, patient_id, db)
    row = (
        db.query(PatientSubstance)
        .filter(
            PatientSubstance.id == substance_id,
            PatientSubstance.patient_id == patient_id,
        )
        .first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found",
            message="Substance not found.",
            status_code=404,
        )
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.get("/patients/{patient_id}/labs", response_model=PatientLabListResponse)
def list_patient_labs(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientLabListResponse:
    _gate_patient_access(actor, patient_id, db)
    rows = (
        db.query(PatientLabResult)
        .filter(PatientLabResult.patient_id == patient_id)
        .order_by(
            PatientLabResult.collected_at.desc(),
            PatientLabResult.updated_at.desc(),
            PatientLabResult.created_at.desc(),
        )
        .all()
    )
    return PatientLabListResponse(
        items=[_lab_out(row) for row in rows],
        total=len(rows),
    )


@router.post("/patients/{patient_id}/labs", response_model=PatientLabOut, status_code=201)
def create_patient_lab(
    patient_id: str,
    body: PatientLabCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientLabOut:
    _gate_patient_access(actor, patient_id, db)
    if not ((body.lab_name or "").strip() or (body.biomarker_name or "").strip()):
        raise ApiServiceError(
            code="invalid_input",
            message="Provide at least one of `lab_name` or `biomarker_name`.",
            status_code=422,
        )
    row = PatientLabResult(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        catalog_item_id=body.catalog_item_id,
        lab_test_name=(body.lab_name or None),
        biomarker_name=(body.biomarker_name or None),
        specimen_type=(body.specimen_type or None),
        value_text=(body.value_text or None),
        value_numeric=body.value_numeric,
        unit=(body.unit or None),
        reference_range_low=body.reference_range_low,
        reference_range_high=body.reference_range_high,
        reference_range_text=(body.reference_range_text or None),
        abnormal_flag=(body.abnormal_flag or None),
        collected_at=_parse_dt(body.collected_at),
        reported_at=_parse_dt(body.reported_at),
        source_lab=(body.source_lab or None),
        fasting_state=(body.fasting_state or None),
        notes=(body.notes or None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _lab_out(row)


@router.delete("/patients/{patient_id}/labs/{lab_result_id}", status_code=204)
def delete_patient_lab(
    patient_id: str,
    lab_result_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_patient_access(actor, patient_id, db)
    row = (
        db.query(PatientLabResult)
        .filter(
            PatientLabResult.id == lab_result_id,
            PatientLabResult.patient_id == patient_id,
        )
        .first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found",
            message="Lab result not found.",
            status_code=404,
        )
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.get("/patients/{patient_id}/summary", response_model=PatientBioSummary)
def get_patient_bio_summary(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientBioSummary:
    _gate_patient_access(actor, patient_id, db)
    substances = (
        db.query(PatientSubstance)
        .filter(PatientSubstance.patient_id == patient_id)
        .all()
    )
    labs = (
        db.query(PatientLabResult)
        .filter(PatientLabResult.patient_id == patient_id)
        .all()
    )
    latest_substance = max(
        (_dt(row.updated_at or row.created_at) for row in substances),
        default=None,
    )
    latest_lab = max(
        (
            _dt(row.collected_at or row.reported_at or row.updated_at or row.created_at)
            for row in labs
        ),
        default=None,
    )
    abnormal_lab_count = sum(
        1
        for row in labs
        if str(row.abnormal_flag or "").lower() in {
            "abnormal",
            "high",
            "low",
            "critical",
            "out_of_range",
            "low_normal",
        }
    )
    return PatientBioSummary(
        patient_id=patient_id,
        substances_count=len(substances),
        active_substance_count=sum(1 for row in substances if row.active),
        labs_count=len(labs),
        abnormal_lab_count=abnormal_lab_count,
        latest_substance_at=latest_substance,
        latest_lab_at=latest_lab,
    )
