"""Risk Stratification router — per-patient traffic-light risk levels.

Endpoints
---------
GET    /api/v1/risk/patient/{patient_id}                  — full 8-category profile
GET    /api/v1/risk/clinic/summary                        — all patients risk overview
POST   /api/v1/risk/patient/{patient_id}/{category}/override — clinician override
POST   /api/v1/risk/patient/{patient_id}/recompute        — force recompute
GET    /api/v1/risk/patient/{patient_id}/audit            — audit trail
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
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
    Patient,
    RiskStratificationAudit,
    RiskStratificationResult,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.services.risk_clinical_scores import (
    SCORE_IDS,
    build_all_clinical_scores,
)
from app.services.risk_evidence_map import RISK_CATEGORIES, RISK_CATEGORY_LABELS
from app.services.risk_stratification import (
    assemble_patient_context,
    compute_risk_profile,
)

router = APIRouter(prefix="/api/v1/risk", tags=["Risk Stratification"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class OverrideRequest(BaseModel):
    level: str  # green | amber | red
    reason: str


class CategoryOut(BaseModel):
    category: str
    label: str
    level: str
    computed_level: str
    override_level: Optional[str] = None
    confidence: str
    rationale: Optional[str] = None
    data_sources: list = []
    evidence_refs: list = []
    override_by: Optional[str] = None
    override_at: Optional[str] = None
    override_reason: Optional[str] = None


class PatientRiskProfile(BaseModel):
    patient_id: str
    computed_at: Optional[str] = None
    categories: list[CategoryOut]


class PatientRiskSummary(BaseModel):
    patient_id: str
    patient_name: str
    worst_level: str
    red_count: int
    amber_count: int
    green_count: int
    categories: list[CategoryOut]


class ClinicRiskSummaryResponse(BaseModel):
    patients: list[PatientRiskSummary]
    total: int


class AuditEntry(BaseModel):
    id: str
    patient_id: str
    category: str
    previous_level: Optional[str]
    new_level: str
    trigger: str
    actor_id: Optional[str]
    created_at: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _result_to_category_out(row: RiskStratificationResult) -> CategoryOut:
    effective_level = row.override_level if row.override_level else row.level
    return CategoryOut(
        category=row.category,
        label=RISK_CATEGORY_LABELS.get(row.category, row.category),
        level=effective_level,
        computed_level=row.level,
        override_level=row.override_level,
        confidence=row.confidence,
        rationale=row.rationale,
        data_sources=json.loads(row.data_sources_json or "[]"),
        evidence_refs=json.loads(row.evidence_refs_json or "[]"),
        override_by=row.override_by,
        override_at=row.override_at.isoformat() if row.override_at else None,
        override_reason=row.override_reason,
    )


def _level_rank(level: str) -> int:
    return {"red": 3, "amber": 2, "green": 1}.get(level, 0)


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    """Cross-clinic ownership gate — safety-critical data must not leak across clinics."""
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/patient/{patient_id}", response_model=PatientRiskProfile)
def get_patient_risk_profile(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return the full 8-category risk profile for a single patient.

    If no results exist or they are older than 24 hours, triggers a fresh compute.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rows = db.execute(
        select(RiskStratificationResult)
        .where(RiskStratificationResult.patient_id == patient_id)
    ).scalars().all()

    # Check if we need a fresh compute (no rows or stale)
    needs_compute = len(rows) < len(RISK_CATEGORIES)
    if not needs_compute and rows:
        latest = max((r.computed_at for r in rows if r.computed_at), default=None)
        if latest:
            # SQLite strips tzinfo on roundtrip — coerce to UTC before comparison.
            latest_utc = latest if latest.tzinfo is not None else latest.replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - latest_utc).total_seconds() / 3600
            if age_hours > 24:
                needs_compute = True

    if needs_compute:
        category_dicts = compute_risk_profile(patient_id, db, clinician_id=actor.actor_id)
        return PatientRiskProfile(
            patient_id=patient_id,
            computed_at=datetime.now(timezone.utc).isoformat(),
            categories=[CategoryOut(**c) for c in category_dicts],
        )

    cats = [_result_to_category_out(r) for r in rows]
    computed_at = max((r.computed_at for r in rows if r.computed_at), default=None)
    return PatientRiskProfile(
        patient_id=patient_id,
        computed_at=computed_at.isoformat() if computed_at else None,
        categories=cats,
    )


@router.get("/clinic/summary", response_model=ClinicRiskSummaryResponse)
def get_clinic_risk_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return a per-patient risk summary for the clinic dashboard."""
    require_minimum_role(actor, "clinician")

    # Fetch all active patients for this clinician
    patients = db.execute(
        select(Patient).where(
            Patient.clinician_id == actor.actor_id,
            Patient.status == "active",
        )
    ).scalars().all()

    summaries: list[PatientRiskSummary] = []

    for patient in patients:
        rows = db.execute(
            select(RiskStratificationResult)
            .where(RiskStratificationResult.patient_id == patient.id)
        ).scalars().all()

        # Compute if no results exist
        if len(rows) < len(RISK_CATEGORIES):
            category_dicts = compute_risk_profile(patient.id, db, clinician_id=actor.actor_id)
            cats = [CategoryOut(**c) for c in category_dicts]
        else:
            cats = [_result_to_category_out(r) for r in rows]

        levels = [c.level for c in cats]
        red_count = levels.count("red")
        amber_count = levels.count("amber")
        green_count = levels.count("green")
        worst = "red" if red_count else ("amber" if amber_count else "green")

        summaries.append(PatientRiskSummary(
            patient_id=patient.id,
            patient_name=f"{patient.first_name or ''} {patient.last_name or ''}".strip() or "Unknown",
            worst_level=worst,
            red_count=red_count,
            amber_count=amber_count,
            green_count=green_count,
            categories=cats,
        ))

    # Sort: RED-first, then AMBER, then GREEN
    summaries.sort(key=lambda s: (-_level_rank(s.worst_level), -s.red_count, -s.amber_count))

    return ClinicRiskSummaryResponse(patients=summaries, total=len(summaries))


@router.post("/patient/{patient_id}/{category}/override")
def override_risk_category(
    patient_id: str,
    category: str,
    body: OverrideRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Clinician manual override of a risk category traffic light."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    if category not in RISK_CATEGORIES:
        raise ApiServiceError(
            code="invalid_category",
            message=f"Invalid category: {category}. Must be one of {RISK_CATEGORIES}",
            status_code=422,
        )
    if body.level not in ("green", "amber", "red"):
        raise ApiServiceError(
            code="invalid_level",
            message="Level must be green, amber, or red",
            status_code=422,
        )

    row = db.execute(
        select(RiskStratificationResult).where(
            RiskStratificationResult.patient_id == patient_id,
            RiskStratificationResult.category == category,
        )
    ).scalar_one_or_none()

    if not row:
        # Compute first, then override
        compute_risk_profile(patient_id, db, clinician_id=actor.actor_id)
        row = db.execute(
            select(RiskStratificationResult).where(
                RiskStratificationResult.patient_id == patient_id,
                RiskStratificationResult.category == category,
            )
        ).scalar_one_or_none()

    if not row:
        raise ApiServiceError(
            code="not_found",
            message="Patient or risk category not found",
            status_code=404,
        )

    previous_effective = row.override_level or row.level

    row.override_level = body.level
    row.override_by = actor.actor_id
    row.override_at = datetime.now(timezone.utc)
    row.override_reason = body.reason
    row.updated_at = datetime.now(timezone.utc)

    # Audit trail
    if previous_effective != body.level:
        db.add(RiskStratificationAudit(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            category=category,
            previous_level=previous_effective,
            new_level=body.level,
            trigger="manual_override",
            actor_id=actor.actor_id,
        ))

    db.commit()
    return {"status": "ok", "category": category, "override_level": body.level}


@router.post("/patient/{patient_id}/recompute", response_model=PatientRiskProfile)
def recompute_patient_risk(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Force a full recompute of all 8 risk categories."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    category_dicts = compute_risk_profile(patient_id, db, clinician_id=actor.actor_id)
    return PatientRiskProfile(
        patient_id=patient_id,
        computed_at=datetime.now(timezone.utc).isoformat(),
        categories=[CategoryOut(**c) for c in category_dicts],
    )


@router.get("/patient/{patient_id}/clinical-scores")
def get_patient_clinical_scores(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Unified decision-support clinical scores for a patient.

    Returns the eight scores (anxiety, depression, stress, mci,
    brain_age, relapse_risk, adherence_risk, response_probability) using
    the ``ScoreResponse`` schema. PROM assessments are PRIMARY anchors;
    biomarkers are supporting only. NEVER a diagnosis.
    """
    require_minimum_role(actor, "guest")

    ctx = assemble_patient_context(patient_id, db)
    if not ctx.patient:
        return {"patient_id": patient_id, "scores": {}, "error": "patient_not_found"}

    chronological_age: Optional[int] = None
    age_val = (ctx.patient or {}).get("age")
    if isinstance(age_val, (int, float)):
        chronological_age = int(age_val)

    # Adverse events — count unresolved as risk signal
    adverse_event_count = len(ctx.adverse_events or [])

    # NB: qeeg_risk_payload, brain_age_payload, trajectory_change_scores,
    # wearable_summary and adherence_summary are intentionally NOT
    # recomputed here — Stream 4 only consumes upstream payloads. The
    # router accepts None and the score builders degrade gracefully.
    wearable_summary: Optional[dict] = None
    if ctx.wearable_summaries:
        wearable_summary = ctx.wearable_summaries[0]

    scores = build_all_clinical_scores(
        assessments=ctx.assessments,
        qeeg_risk_payload=None,
        brain_age_payload=None,
        wearable_summary=wearable_summary,
        trajectory_change_scores=None,
        adverse_event_count=adverse_event_count,
        adherence_summary=None,
        chronological_age=chronological_age,
        response_target="depression",
    )

    return {
        "patient_id": patient_id,
        "score_ids": list(SCORE_IDS),
        "scores": {sid: s.model_dump(mode="json") for sid, s in scores.items()},
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/patient/{patient_id}/audit")
def get_risk_audit_trail(
    patient_id: str,
    limit: int = Query(50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return the audit trail of risk-level changes for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rows = db.execute(
        select(RiskStratificationAudit)
        .where(RiskStratificationAudit.patient_id == patient_id)
        .order_by(RiskStratificationAudit.created_at.desc())
        .limit(limit)
    ).scalars().all()

    entries = []
    for r in rows:
        entries.append(AuditEntry(
            id=r.id,
            patient_id=r.patient_id,
            category=r.category,
            previous_level=r.previous_level,
            new_level=r.new_level,
            trigger=r.trigger,
            actor_id=r.actor_id,
            created_at=r.created_at.isoformat() if r.created_at else "",
        ))

    return {"items": entries, "total": len(entries)}
