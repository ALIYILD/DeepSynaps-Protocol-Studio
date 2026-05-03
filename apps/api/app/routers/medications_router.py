"""Medication Safety router.

Endpoints
---------
GET    /api/v1/medications/patient/{patient_id}             — get patient medication list
POST   /api/v1/medications/patient/{patient_id}             — add/update medication
DELETE /api/v1/medications/patient/{patient_id}/{med_id}    — remove medication
POST   /api/v1/medications/check-interactions               — run interaction check
GET    /api/v1/medications/interaction-log                  — clinic-wide interaction alert log
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import MedicationInteractionLog, PatientMedication

import logging as _logging
_med_log = _logging.getLogger(__name__)

def _trigger_med_risk_recompute(patient_id: str, trigger: str, actor_id: str | None, db_sess):
    """Fire risk recompute for medication-related categories."""
    try:
        from app.services.risk_stratification import recompute_categories
        recompute_categories(patient_id, ["medication_interaction", "seizure_risk", "allergy"], trigger, actor_id, db_sess)
    except Exception:
        _med_log.debug("Risk recompute skipped after %s", trigger, exc_info=True)

router = APIRouter(prefix="/api/v1/medications", tags=["Medication Safety"])


# ── Known interaction rules (V1 in-memory; replace with external API in V2) ────

# Curated in-repo rules for development / decision-support only — not a verified drug–drug database.
_INTERACTION_RULES: list[dict] = [
    {
        "drugs": ["sertraline", "tramadol"],
        "severity": "severe",
        "description": "Possible additive serotonergic activity (serotonin syndrome is a recognised concern with SSRI + tramadol combinations).",
        "recommendation": "Requires clinician/pharmacist review and monitoring per your clinic medication safety protocol; this screen does not replace formulary or pharmacist review.",
    },
    {
        "drugs": ["warfarin", "aspirin"],
        "severity": "moderate",
        "description": "Possible increased bleeding risk due to additive antiplatelet/anticoagulant effects.",
        "recommendation": "Requires clinician/pharmacist review; bleeding-risk monitoring per local protocol — not a dosing directive from this tool.",
    },
    {
        "drugs": ["ssri", "maoi"],
        "severity": "severe",
        "description": "High-risk serotonergic combination in many references; washout and sequencing decisions require specialist review.",
        "recommendation": "Requires clinician/pharmacist review before any regimen change; follow clinic policy — this tool does not determine washout or substitution.",
    },
    {
        "drugs": ["lithium", "ibuprofen"],
        "severity": "moderate",
        "description": "NSAIDs can alter lithium clearance in some patients.",
        "recommendation": "Requires clinician/pharmacist review with lithium level monitoring per local protocol if clinically indicated.",
    },
    {
        "drugs": ["tms", "tricyclics"],
        "severity": "mild",
        "description": "Tricyclic antidepressants may lower seizure threshold; relevance depends on dose and TMS protocol.",
        "recommendation": "Requires clinician review with neuromodulation prescriber per seizure-precaution protocols — not an instruction to change medication here.",
    },
    {
        "drugs": ["tdcs", "stimulants"],
        "severity": "mild",
        "description": "Stimulants can alter cortical excitability; interaction with tDCS response is context-dependent.",
        "recommendation": "Requires clinician review when interpreting neuromodulation tolerability/response — no autonomous medication timing advice.",
    },
]

INTERACTION_ENGINE_ID = "ds_med_rules_v1"
INTERACTION_ENGINE_DETAIL = (
    "Rule-based substring match against a small in-repository curated list. "
    "Not a commercial drug–drug interaction database; possible false negatives/positives."
)


# ── Schemas ────────────────────────────────────────────────────────────────────

class MedicationCreate(BaseModel):
    name: str
    generic_name: Optional[str] = None
    drug_class: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    indication: Optional[str] = None
    prescriber: Optional[str] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    active: bool = True
    notes: Optional[str] = None


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    generic_name: Optional[str] = None
    drug_class: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    indication: Optional[str] = None
    prescriber: Optional[str] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


class MedicationOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    name: str
    generic_name: Optional[str]
    drug_class: Optional[str]
    dose: Optional[str]
    frequency: Optional[str]
    route: Optional[str]
    indication: Optional[str]
    prescriber: Optional[str]
    started_at: Optional[str]
    stopped_at: Optional[str]
    active: bool
    notes: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: PatientMedication) -> "MedicationOut":
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            name=r.name,
            generic_name=r.generic_name,
            drug_class=r.drug_class,
            dose=r.dose,
            frequency=r.frequency,
            route=r.route,
            indication=r.indication,
            prescriber=r.prescriber,
            started_at=r.started_at,
            stopped_at=r.stopped_at,
            active=r.active,
            notes=r.notes,
            created_at=_dt(r.created_at),
            updated_at=_dt(r.updated_at),
        )


class MedicationListResponse(BaseModel):
    items: list[MedicationOut]
    total: int


class InteractionCheckRequest(BaseModel):
    patient_id: Optional[str] = None
    medications: list[str]  # list of drug names / classes


class InteractionResult(BaseModel):
    drugs: list[str]
    severity: str
    description: str
    recommendation: str


class InteractionCheckResponse(BaseModel):
    medications_checked: list[str]
    interactions: list[InteractionResult]
    severity_summary: str  # none, mild, moderate, severe
    engine_id: str = INTERACTION_ENGINE_ID
    engine_detail: str = INTERACTION_ENGINE_DETAIL
    requires_clinician_review: bool = True


class InteractionLogOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    medications_checked: list[str]
    interactions_found: list[dict]
    severity_summary: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: MedicationInteractionLog) -> "InteractionLogOut":
        meds: list[str] = []
        interactions: list[dict] = []
        try:
            meds = json.loads(r.medications_checked_json or "[]")
        except Exception:
            pass
        try:
            interactions = json.loads(r.interactions_found_json or "[]")
        except Exception:
            pass
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            medications_checked=meds,
            interactions_found=interactions,
            severity_summary=r.severity_summary,
            created_at=r.created_at.isoformat(),
        )


class InteractionLogListResponse(BaseModel):
    items: list[InteractionLogOut]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────

_SEVERITY_ORDER = {"none": 0, "mild": 1, "moderate": 2, "severe": 3}


def _run_interaction_check(med_names: list[str]) -> tuple[list[InteractionResult], str]:
    """Simple local heuristic interaction check against known rules."""
    lower_names = [m.lower() for m in med_names]
    found: list[InteractionResult] = []
    worst = "none"

    for rule in _INTERACTION_RULES:
        matched = all(
            any(drug in name for name in lower_names)
            for drug in rule["drugs"]
        )
        if matched:
            found.append(InteractionResult(
                drugs=rule["drugs"],
                severity=rule["severity"],
                description=rule["description"],
                recommendation=rule["recommendation"],
            ))
            if _SEVERITY_ORDER.get(rule["severity"], 0) > _SEVERITY_ORDER.get(worst, 0):
                worst = rule["severity"]

    return found, worst


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/interaction-log", response_model=InteractionLogListResponse)
def get_interaction_log(
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InteractionLogListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(MedicationInteractionLog)
    if actor.role != "admin":
        q = q.filter(MedicationInteractionLog.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(MedicationInteractionLog.patient_id == patient_id)
    records = q.order_by(MedicationInteractionLog.created_at.desc()).all()
    items = [InteractionLogOut.from_record(r) for r in records]
    return InteractionLogListResponse(items=items, total=len(items))


@router.post("/check-interactions", response_model=InteractionCheckResponse)
def check_interactions(
    body: InteractionCheckRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InteractionCheckResponse:
    require_minimum_role(actor, "clinician")
    if not body.medications:
        raise ApiServiceError(
            code="invalid_request",
            message="At least one medication name is required.",
            status_code=422,
        )
    interactions, severity_summary = _run_interaction_check(body.medications)

    # Log the check
    if body.patient_id:
        log = MedicationInteractionLog(
            patient_id=body.patient_id,
            clinician_id=actor.actor_id,
            medications_checked_json=json.dumps(body.medications),
            interactions_found_json=json.dumps([i.model_dump() for i in interactions]),
            severity_summary=severity_summary,
        )
        db.add(log)
        db.commit()

    return InteractionCheckResponse(
        medications_checked=body.medications,
        interactions=interactions,
        severity_summary=severity_summary,
        engine_id=INTERACTION_ENGINE_ID,
        engine_detail=INTERACTION_ENGINE_DETAIL,
        requires_clinician_review=True,
    )


@router.get("/patient/{patient_id}", response_model=MedicationListResponse)
def get_patient_medications(
    patient_id: str,
    active_only: bool = Query(default=False),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> MedicationListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(PatientMedication).filter(PatientMedication.patient_id == patient_id)
    if actor.role != "admin":
        q = q.filter(PatientMedication.clinician_id == actor.actor_id)
    if active_only:
        q = q.filter(PatientMedication.active.is_(True))
    records = q.order_by(PatientMedication.created_at.desc()).all()
    items = [MedicationOut.from_record(r) for r in records]
    return MedicationListResponse(items=items, total=len(items))


@router.post("/patient/{patient_id}", response_model=MedicationOut, status_code=201)
def add_medication(
    patient_id: str,
    body: MedicationCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> MedicationOut:
    require_minimum_role(actor, "clinician")
    med = PatientMedication(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        name=body.name.strip(),
        generic_name=body.generic_name,
        drug_class=body.drug_class,
        dose=body.dose,
        frequency=body.frequency,
        route=body.route,
        indication=body.indication,
        prescriber=body.prescriber,
        started_at=body.started_at,
        stopped_at=body.stopped_at,
        active=body.active,
        notes=body.notes,
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    _trigger_med_risk_recompute(patient_id, "medication_added", actor.actor_id, db)
    return MedicationOut.from_record(med)


@router.delete("/patient/{patient_id}/{med_id}", status_code=204)
def remove_medication(
    patient_id: str,
    med_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    med = db.query(PatientMedication).filter_by(id=med_id, patient_id=patient_id).first()
    if med is None:
        raise ApiServiceError(code="not_found", message="Medication not found.", status_code=404)
    if actor.role != "admin" and med.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Medication not found.", status_code=404)
    db.delete(med)
    db.commit()
    _trigger_med_risk_recompute(patient_id, "medication_removed", actor.actor_id, db)
