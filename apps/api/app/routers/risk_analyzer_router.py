"""Risk Analyzer workspace — unified decision-support surface for clinicians."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import RiskAnalyzerAudit, RiskStratificationAudit
from app.repositories.patients import resolve_patient_clinic_id
from app.services.risk_analyzer_payload import (
    append_analyzer_audit,
    build_risk_analyzer_payload,
    load_or_create_formulation_row,
    merge_formulation_patch,
    merge_safety_plan_patch,
)
from app.services.risk_evidence_map import RISK_CATEGORIES
from app.services.risk_stratification import apply_category_override, compute_risk_profile

router = APIRouter(prefix="/api/v1/risk/analyzer", tags=["Risk Analyzer"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class FormulationPatch(BaseModel):
    presenting_concerns: Optional[list] = None
    dynamic_drivers: Optional[list] = None
    protective_factors: Optional[list] = None
    access_to_means: Optional[dict] = None
    family_carer_concerns: Optional[str] = None
    narrative_formulation: Optional[str] = None
    clinician_concerns: Optional[str] = None
    safety_plan_status: Optional[dict] = None


class SafetyPlanPatch(BaseModel):
    status: Optional[str] = None
    summary: Optional[str] = None
    last_reviewed_at: Optional[str] = None
    next_review_due: Optional[str] = None
    warning_signs_documented: Optional[bool] = None
    coping_steps_documented: Optional[bool] = None
    supports_documented: Optional[bool] = None
    means_restriction_discussed: Optional[bool] = None
    crisis_numbers_given: Optional[bool] = None


class RecomputeBody(BaseModel):
    reason: Optional[str] = None


class CategoryOverrideBody(BaseModel):
    category: str = Field(..., description="risk category key")
    level: str = Field(..., pattern="^(green|amber|red)$")
    reason: str = Field(..., min_length=3)


def _gate(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _merge_audit_entries(db: Session, patient_id: str, risk_audit_limit: int) -> list[dict]:
    ra_rows = db.execute(
        select(RiskAnalyzerAudit)
        .where(RiskAnalyzerAudit.patient_id == patient_id)
        .order_by(RiskAnalyzerAudit.created_at.desc())
        .limit(80)
    ).scalars().all()

    rs_rows = db.execute(
        select(RiskStratificationAudit)
        .where(RiskStratificationAudit.patient_id == patient_id)
        .order_by(RiskStratificationAudit.created_at.desc())
        .limit(risk_audit_limit)
    ).scalars().all()

    events = []
    for r in ra_rows:
        events.append({
            "event_id": r.id,
            "patient_id": r.patient_id,
            "event_type": r.event_type,
            "actor_id": r.actor_id,
            "occurred_at": r.created_at.isoformat() if r.created_at else None,
            "payload_summary": r.payload_summary,
            "source": "risk_analyzer",
        })
    for r in rs_rows:
        events.append({
            "event_id": r.id,
            "patient_id": r.patient_id,
            "event_type": f"stratification_{r.trigger}",
            "category": r.category,
            "previous_level": r.previous_level,
            "new_level": r.new_level,
            "actor_id": r.actor_id,
            "occurred_at": r.created_at.isoformat() if r.created_at else None,
            "payload_summary": f"{r.category}: {r.previous_level} → {r.new_level}",
            "source": "risk_stratification_audit",
        })

    events.sort(key=lambda x: x.get("occurred_at") or "", reverse=True)
    return events[: max(risk_audit_limit, 80)]


@router.get("/patient/{patient_id}")
def get_risk_analyzer_page(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
    audit_limit: int = Query(50, ge=1, le=200),
):
    require_minimum_role(actor, "clinician")
    _gate(actor, patient_id, db)

    payload = build_risk_analyzer_payload(patient_id, db, actor_id=actor.actor_id)
    if payload.get("error") == "patient_not_found":
        raise ApiServiceError(code="not_found", message="Patient not found", status_code=404)

    payload["audit_events"] = _merge_audit_entries(db, patient_id, audit_limit)
    return payload


@router.post("/patient/{patient_id}/recompute")
def recompute_risk_analyzer(
    patient_id: str,
    body: Optional[RecomputeBody] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate(actor, patient_id, db)

    compute_risk_profile(patient_id, db, clinician_id=actor.actor_id)
    summary = "Full stratification recompute" + (f": {body.reason}" if body and body.reason else "")
    append_analyzer_audit(db, patient_id, "recompute", actor.actor_id, summary, {"reason": body.reason if body else None})

    payload = build_risk_analyzer_payload(patient_id, db, actor_id=actor.actor_id, ensure_compute=False)
    payload["audit_events"] = _merge_audit_entries(db, patient_id, 50)
    return payload


@router.post("/patient/{patient_id}/override")
def override_via_analyzer(
    patient_id: str,
    body: CategoryOverrideBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate(actor, patient_id, db)

    if body.category not in RISK_CATEGORIES:
        raise ApiServiceError(
            code="invalid_category",
            message=f"Invalid category. Expected one of {list(RISK_CATEGORIES)}",
            status_code=422,
        )

    res = apply_category_override(
        patient_id, body.category, body.level, body.reason, actor.actor_id, db
    )
    if not res.get("ok"):
        raise ApiServiceError(code="not_found", message="Patient or category not found", status_code=404)

    append_analyzer_audit(
        db,
        patient_id,
        "category_override",
        actor.actor_id,
        f"Override {body.category} → {body.level}",
        {"category": body.category, "level": body.level, "reason": body.reason},
    )

    payload = build_risk_analyzer_payload(patient_id, db, actor_id=actor.actor_id, ensure_compute=False)
    payload["audit_events"] = _merge_audit_entries(db, patient_id, 50)
    return payload


@router.post("/patient/{patient_id}/formulation")
def save_formulation(
    patient_id: str,
    body: FormulationPatch,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate(actor, patient_id, db)

    row = load_or_create_formulation_row(db, patient_id)
    try:
        base = json.loads(row.formulation_json or "{}")
    except json.JSONDecodeError:
        base = {}
    patch = body.model_dump(exclude_none=True)
    merged = merge_formulation_patch(base, patch)
    merged["updated_by"] = actor.actor_id
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()

    row.formulation_json = json.dumps(merged)
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = actor.actor_id
    db.commit()

    append_analyzer_audit(
        db,
        patient_id,
        "formulation_save",
        actor.actor_id,
        "Formulation updated",
        {"keys": list(patch.keys())},
    )

    return {"status": "ok", "formulation": merged}


@router.post("/patient/{patient_id}/safety-plan")
def save_safety_plan(
    patient_id: str,
    body: SafetyPlanPatch,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate(actor, patient_id, db)

    row = load_or_create_formulation_row(db, patient_id)
    try:
        base = json.loads(row.safety_plan_json or "{}")
    except json.JSONDecodeError:
        base = {}
    merged = merge_safety_plan_patch(base, body.model_dump(exclude_none=True))
    merged["last_reviewed_at"] = datetime.now(timezone.utc).isoformat()
    merged["reviewed_by"] = actor.actor_id
    merged.setdefault("provenance", {})["source"] = "studio"

    row.safety_plan_json = json.dumps(merged)
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = actor.actor_id
    db.commit()

    append_analyzer_audit(db, patient_id, "safety_plan_update", actor.actor_id, "Safety plan updated", merged)

    return {"status": "ok", "safety_plan": merged}


@router.get("/patient/{patient_id}/audit")
def get_analyzer_audit(
    patient_id: str,
    limit: int = Query(80, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate(actor, patient_id, db)

    return {"patient_id": patient_id, "events": _merge_audit_entries(db, patient_id, limit)}
