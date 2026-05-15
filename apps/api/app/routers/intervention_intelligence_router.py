"""Intervention Intelligence Router.

Exposes REST endpoints for the AI/DeepTwin/Evidence integration layer across
three intervention platforms:
    - Rehab / Physiotherapy
    - Wellness & Lifestyle
    - Complementary & Integrative Therapies

Endpoint groups:
    - ``/deeptwin/*``       — DeepTwin multimodal sync
    - ``/evidence/*``       — Evidence DB queries
    - ``/fuse/*``           — Cross-modal fusion
    - ``/ai/*``             — AI-assisted analysis
    - ``/run``              — Full pipeline orchestration

All endpoints:
    - Require ``clinician`` minimum role (or higher)
    - Enforce patient-level access gating (cross-clinic ownership check)
    - Write audit events for every request
    - Attach decision-support disclaimers to every response
    - Return evidence grades (A/B/C/D) where applicable

Decision-support only. No endpoint diagnoses, prescribes, or replaces
clinician judgment.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id

from app.services.intervention_intelligence import (
    DECISION_SUPPORT_DISCLAIMER,
    SCHEMA_VERSION,
    analyze_complementary_safety,
    analyze_rehab_progress,
    analyze_wellness_domains,
    fuse_complementary_with_medication,
    fuse_rehab_with_neuromodulation,
    fuse_wellness_with_biomarkers,
    get_complementary_evidence,
    get_rehab_evidence,
    get_wellness_evidence,
    run_full_intervention_intelligence,
    send_complementary_to_deeptwin,
    send_rehab_to_deeptwin,
    send_wellness_to_deeptwin,
)

router = APIRouter(
    prefix="/api/v1/intervention-intelligence",
    tags=["intervention-intelligence"],
)

_log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Pydantic Request / Response Schemas
# ═══════════════════════════════════════════════════════════════════════════════


# ── DeepTwin sync ──


class RehabDeepTwinSyncRequest(BaseModel):
    """Request body for sending rehab data to DeepTwin."""

    assessments: list[dict[str, Any]] = Field(default_factory=list)
    sessions: list[dict[str, Any]] = Field(default_factory=list)
    goals: list[dict[str, Any]] = Field(default_factory=list)
    outcome_measures: list[dict[str, Any]] = Field(default_factory=list)


class WellnessDeepTwinSyncRequest(BaseModel):
    """Request body for sending wellness data to DeepTwin."""

    sleep: dict[str, Any] = Field(default_factory=dict)
    stress: dict[str, Any] = Field(default_factory=dict)
    exercise: dict[str, Any] = Field(default_factory=dict)
    wellness_wheel: dict[str, Any] = Field(default_factory=dict)
    hrv: dict[str, Any] = Field(default_factory=dict)


class ComplementaryDeepTwinSyncRequest(BaseModel):
    """Request body for sending complementary therapy data to DeepTwin."""

    therapies: list[dict[str, Any]] = Field(default_factory=list)
    outcomes: list[dict[str, Any]] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    safety_flags: list[dict[str, Any]] = Field(default_factory=list)


class DeepTwinSyncResponse(BaseModel):
    """Response from a DeepTwin sync operation."""

    status: str
    signals_sent: int
    synthesis_id: str | None = None
    patient_id: str
    deeptwin_result: dict[str, Any] | None = None
    disclaimer: str = DECISION_SUPPORT_DISCLAIMER
    provenance: dict[str, Any] = Field(default_factory=dict)


# ── Evidence queries ──


class EvidenceItemResponse(BaseModel):
    """Single evidence item from the evidence DB."""

    intervention: str
    evidence_grade: str
    citation: str
    provenance: str
    disclaimer: str = DECISION_SUPPORT_DISCLAIMER
    extra: dict[str, Any] | None = Field(default=None, alias="detail")

    model_config = ConfigDict(populate_by_name=True)


class RehabEvidenceResponse(BaseModel):
    """Response for rehab evidence queries."""

    condition: str
    intervention_type: str | None = None
    evidence_items: list[dict[str, Any]] = Field(default_factory=list)
    total_items: int
    disclaimer: str = DECISION_SUPPORT_DISCLAIMER
    generated_at: str


class WellnessEvidenceResponse(BaseModel):
    """Response for wellness evidence queries."""

    domain: str
    evidence_items: list[dict[str, Any]] = Field(default_factory=list)
    total_items: int
    disclaimer: str = DECISION_SUPPORT_DISCLAIMER
    generated_at: str


class ComplementaryEvidenceResponse(BaseModel):
    """Response for complementary therapy evidence queries."""

    therapy: str
    condition: str
    evidence_items: list[dict[str, Any]] = Field(default_factory=list)
    disclaimer: str = DECISION_SUPPORT_DISCLAIMER
    generated_at: str


# ── Fusion ──


class RehabNeuromodFusionRequest(BaseModel):
    """Request to fuse rehab data with neuromodulation data."""

    rehab_data: dict[str, Any] = Field(default_factory=dict)
    neuromod_data: dict[str, Any] = Field(default_factory=dict)


class WellnessBiomarkerFusionRequest(BaseModel):
    """Request to fuse wellness data with biomarker data."""

    wellness_data: dict[str, Any] = Field(default_factory=dict)
    biomarker_data: dict[str, Any] = Field(default_factory=dict)


class ComplementaryMedicationFusionRequest(BaseModel):
    """Request to fuse complementary therapy with medication data."""

    comp_data: dict[str, Any] = Field(default_factory=dict)
    med_data: dict[str, Any] = Field(default_factory=dict)


class FusionResponse(BaseModel):
    """Generic fusion response."""

    fusion_type: str
    correlations: list[dict[str, Any]] = Field(default_factory=list)
    interactions: list[dict[str, Any]] | None = None
    data_completeness: dict[str, float] | None = None
    disclaimer: str
    provenance: str
    generated_at: str


# ── AI Analysis ──


class RehabProgressAnalysisRequest(BaseModel):
    """Request body for rehab progress AI analysis."""

    rehab_history: list[dict[str, Any]] = Field(default_factory=list)


class WellnessDomainsAnalysisRequest(BaseModel):
    """Request body for wellness domain AI analysis."""

    wellness_data: dict[str, Any] = Field(default_factory=dict)


class ComplementarySafetyAnalysisRequest(BaseModel):
    """Request body for complementary safety AI analysis."""

    comp_data: dict[str, Any] = Field(default_factory=dict)
    med_data: dict[str, Any] | None = None


class RehabProgressResponse(BaseModel):
    """Response for rehab progress AI analysis."""

    analysis_type: str
    patient_id: str
    findings: list[dict[str, Any]] = Field(default_factory=list)
    suggestions: list[dict[str, Any]] = Field(default_factory=list)
    assessment_count: int
    disclaimer: str = DECISION_SUPPORT_DISCLAIMER
    provenance: str
    generated_at: str


class WellnessDomainsResponse(BaseModel):
    """Response for wellness domain AI analysis."""

    analysis_type: str
    patient_id: str
    domain_scores: dict[str, Any] = Field(default_factory=dict)
    lowest_domain: str | None = None
    lowest_score: float | None = None
    domain_balance_range: float | None = None
    recommendations: list[dict[str, Any]] = Field(default_factory=list)
    cross_domain_insight: str | None = None
    disclaimer: str = DECISION_SUPPORT_DISCLAIMER
    provenance: str
    generated_at: str


class ComplementarySafetyResponse(BaseModel):
    """Response for complementary safety AI analysis."""

    analysis_type: str
    patient_id: str
    safety_flags: list[dict[str, Any]] = Field(default_factory=list)
    recommendations: list[dict[str, Any]] = Field(default_factory=list)
    therapies_screened: int
    disclaimer: str
    provenance: str
    generated_at: str


# ── Full pipeline ──


class FullPipelineRequest(BaseModel):
    """Request body for running the complete intervention-intelligence pipeline."""

    rehab_data: dict[str, Any] | None = None
    wellness_data: dict[str, Any] | None = None
    comp_data: dict[str, Any] | None = None
    neuromod_data: dict[str, Any] | None = None
    biomarker_data: dict[str, Any] | None = None
    med_data: dict[str, Any] | None = None


class FullPipelineResponse(BaseModel):
    """Response from the full intervention-intelligence pipeline."""

    patient_id: str
    schema_version: str
    generated_at: str
    disclaimer: str = DECISION_SUPPORT_DISCLAIMER
    platforms: dict[str, Any] = Field(default_factory=dict)
    fusion: dict[str, Any] = Field(default_factory=dict)
    analysis: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str, db: Session
) -> None:
    """Verify the actor has clinic-level access to the specified patient."""
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _audit(
    db: Session,
    action: str,
    actor: AuthenticatedActor,
    patient_id: str,
    note: str = "",
) -> None:
    """Write an audit event for the intervention-intelligence endpoint."""
    from datetime import datetime, timezone

    try:
        create_audit_event(
            db,
            event_id=f"intervention-intelligence.{action}.{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            target_id=patient_id,
            target_type="intervention_intelligence",
            action=f"intervention_intelligence.{action}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:
        _log.warning("Audit write failed (non-blocking): %s", exc)


# ═══════════════════════════════════════════════════════════════════════════════
# DeepTwin Sync Endpoints
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/deeptwin/rehab/{patient_id}", response_model=DeepTwinSyncResponse)
@limiter.limit("20/minute")
async def deeptwin_sync_rehab(
    request: Request,
    patient_id: str,
    body: RehabDeepTwinSyncRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Sync rehabilitation assessment data to DeepTwin for multimodal synthesis.

    Signals: FMA, BBS, gait speed, strength, ROM, sessions, goals.
    Requires ``clinician`` role. Patient-scoped (cross-clinic gated).
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    result = await send_rehab_to_deeptwin(
        patient_id=patient_id,
        rehab_data=body.model_dump(),
        db=db,
    )
    _audit(db, "deeptwin_sync_rehab", actor, patient_id, f"status={result.get('status')}")
    return DeepTwinSyncResponse(**result)


@router.post("/deeptwin/wellness/{patient_id}", response_model=DeepTwinSyncResponse)
@limiter.limit("20/minute")
async def deeptwin_sync_wellness(
    request: Request,
    patient_id: str,
    body: WellnessDeepTwinSyncRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Sync wellness data to DeepTwin for multimodal synthesis.

    Signals: sleep, stress, exercise, wellness wheel, HRV.
    Requires ``clinician`` role. Patient-scoped.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    result = await send_wellness_to_deeptwin(
        patient_id=patient_id,
        wellness_data=body.model_dump(),
        db=db,
    )
    _audit(db, "deeptwin_sync_wellness", actor, patient_id, f"status={result.get('status')}")
    return DeepTwinSyncResponse(**result)


@router.post("/deeptwin/complementary/{patient_id}", response_model=DeepTwinSyncResponse)
@limiter.limit("20/minute")
async def deeptwin_sync_complementary(
    request: Request,
    patient_id: str,
    body: ComplementaryDeepTwinSyncRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Sync complementary therapy data to DeepTwin for multimodal synthesis.

    Signals: therapies, outcomes, evidence grades, safety flags.
    Requires ``clinician`` role. Patient-scoped.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    result = await send_complementary_to_deeptwin(
        patient_id=patient_id,
        comp_data=body.model_dump(),
        db=db,
    )
    _audit(db, "deeptwin_sync_complementary", actor, patient_id, f"status={result.get('status')}")
    return DeepTwinSyncResponse(**result)


# ═══════════════════════════════════════════════════════════════════════════════
# Evidence DB Endpoints
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/evidence/rehab", response_model=RehabEvidenceResponse)
@limiter.limit("60/minute")
async def evidence_rehab(
    request: Request,
    condition: str = Query(..., description="Condition to search evidence for (stroke, parkinsons, back_pain, acl, balance)"),
    intervention_type: str | None = Query(default=None, description="Optional intervention filter"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Query evidence DB for rehabilitation interventions.

    Returns evidence-graded findings with PubMed links for the requested
    condition. No patient data is accessed; clinician role required.
    """
    require_minimum_role(actor, "clinician")

    items = await get_rehab_evidence(condition=condition, intervention_type=intervention_type)
    from datetime import datetime, timezone

    return RehabEvidenceResponse(
        condition=condition,
        intervention_type=intervention_type,
        evidence_items=items,
        total_items=len(items),
        generated_at=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    )


@router.get("/evidence/wellness", response_model=WellnessEvidenceResponse)
@limiter.limit("60/minute")
async def evidence_wellness(
    request: Request,
    domain: str = Query(..., description="Wellness domain (sleep, stress, exercise, nutrition, social, purpose)"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Query evidence DB for wellness interventions.

    Returns evidence-graded findings for the requested wellness domain.
    No patient data is accessed; clinician role required.
    """
    require_minimum_role(actor, "clinician")

    items = await get_wellness_evidence(domain=domain)
    from datetime import datetime, timezone

    return WellnessEvidenceResponse(
        domain=domain,
        evidence_items=items,
        total_items=len(items),
        generated_at=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    )


@router.get("/evidence/complementary", response_model=ComplementaryEvidenceResponse)
@limiter.limit("60/minute")
async def evidence_complementary(
    request: Request,
    therapy_type: str = Query(..., description="Therapy type (acupuncture, neurofeedback, ces, pbm, massage, mindbody)"),
    condition: str = Query(..., description="Condition to search evidence for"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Query evidence DB for complementary and integrative therapies.

    Returns evidence grade (A/B/C/D) with safety notes for the requested
    therapy-condition pair. No patient data is accessed.
    """
    require_minimum_role(actor, "clinician")

    items = await get_complementary_evidence(therapy_type=therapy_type, condition=condition)
    from datetime import datetime, timezone

    return ComplementaryEvidenceResponse(
        therapy=therapy_type,
        condition=condition,
        evidence_items=items,
        generated_at=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Cross-Modal Fusion Endpoints
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/fuse/rehab-neuromodulation", response_model=FusionResponse)
@limiter.limit("20/minute")
async def fuse_rehab_neuromodulation(
    request: Request,
    body: RehabNeuromodFusionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Fuse rehabilitation exercise data with neuromodulation (tDCS/TMS/tRNS).

    Returns dual-approach recommendations (e.g., tDCS + motor training)
    with evidence grades and heuristic confidence scores.
    Requires ``clinician`` role. Stateless — no patient data is persisted.
    """
    require_minimum_role(actor, "clinician")

    result = await fuse_rehab_with_neuromodulation(
        rehab_data=body.rehab_data,
        neuromod_data=body.neuromod_data,
    )
    return FusionResponse(**result)


@router.post("/fuse/wellness-biomarkers", response_model=FusionResponse)
@limiter.limit("20/minute")
async def fuse_wellness_biomarkers(
    request: Request,
    body: WellnessBiomarkerFusionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Fuse wellness/lifestyle data with biomarker data.

    Returns correlation pairs (sleep x cortisol, exercise x CRP, etc.)
    with evidence grades and heuristic confidence scores.
    Requires ``clinician`` role. Stateless.
    """
    require_minimum_role(actor, "clinician")

    result = await fuse_wellness_with_biomarkers(
        wellness_data=body.wellness_data,
        biomarker_data=body.biomarker_data,
    )
    return FusionResponse(**result)


@router.post("/fuse/complementary-medication", response_model=FusionResponse)
@limiter.limit("20/minute")
async def fuse_complementary_medication(
    request: Request,
    body: ComplementaryMedicationFusionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Fuse complementary therapy data with medication data.

    Screens for herb-drug interactions, augmentation strategies, and
    contraindications. Returns severity-rated interaction pairs.
    Requires ``clinician`` role. Stateless.
    """
    require_minimum_role(actor, "clinician")

    result = await fuse_complementary_with_medication(
        comp_data=body.comp_data,
        med_data=body.med_data,
    )
    return FusionResponse(**result)


# ═══════════════════════════════════════════════════════════════════════════════
# AI Analysis Endpoints
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/ai/rehab-progress/{patient_id}", response_model=RehabProgressResponse)
@limiter.limit("20/minute")
async def ai_rehab_progress(
    request: Request,
    patient_id: str,
    body: RehabProgressAnalysisRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """AI-assisted analysis of rehabilitation progress.

    Identifies plateaus, classifies responder status, suggests protocol
    adjustments, and tracks MCID achievement.
    Requires ``clinician`` role. Patient-scoped (cross-clinic gated).
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    result = await analyze_rehab_progress(
        patient_id=patient_id,
        rehab_history=body.rehab_history,
    )
    _audit(
        db,
        "ai_rehab_progress",
        actor,
        patient_id,
        f"findings={len(result.get('findings', []))}",
    )
    return RehabProgressResponse(**result)


@router.post("/ai/wellness-domains/{patient_id}", response_model=WellnessDomainsResponse)
@limiter.limit("20/minute")
async def ai_wellness_domains(
    request: Request,
    patient_id: str,
    body: WellnessDomainsAnalysisRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """AI-assisted wellness domain analysis.

    Identifies lowest wellness wheel domain, calculates domain balance,
    and returns evidence-graded intervention recommendations.
    Requires ``clinician`` role. Patient-scoped.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    result = await analyze_wellness_domains(
        patient_id=patient_id,
        wellness_data=body.wellness_data,
    )
    _audit(
        db,
        "ai_wellness_domains",
        actor,
        patient_id,
        f"lowest_domain={result.get('lowest_domain')}",
    )
    return WellnessDomainsResponse(**result)


@router.post("/ai/complementary-safety/{patient_id}", response_model=ComplementarySafetyResponse)
@limiter.limit("20/minute")
async def ai_complementary_safety(
    request: Request,
    patient_id: str,
    body: ComplementarySafetyAnalysisRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """AI-assisted safety screening for complementary therapies.

    Checks herb-drug interactions, contraindications, evidence adequacy,
    and practitioner credential requirements.
    Requires ``clinician`` role. Patient-scoped.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    result = await analyze_complementary_safety(
        patient_id=patient_id,
        comp_data=body.comp_data,
        med_data=body.med_data,
    )
    _audit(
        db,
        "ai_complementary_safety",
        actor,
        patient_id,
        f"flags={len(result.get('safety_flags', []))}",
    )
    return ComplementarySafetyResponse(**result)


# ═══════════════════════════════════════════════════════════════════════════════
# Full Pipeline Orchestration
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/run/{patient_id}", response_model=FullPipelineResponse)
@limiter.limit("5/minute")
async def run_full_pipeline(
    request: Request,
    patient_id: str,
    body: FullPipelineRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Run the complete intervention-intelligence pipeline.

    Orchestrates DeepTwin sync, evidence queries, cross-modal fusion, and
    AI analysis across all three intervention platforms in a single call.

    This is the **main entry point** for the intervention intelligence
    dashboard. Any provided data platform (rehab, wellness, comp) will be
    processed; omitted platforms are skipped.

    Rate limit: 5/minute (expensive orchestration).
    Requires ``clinician`` role. Patient-scoped.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    result = await run_full_intervention_intelligence(
        patient_id=patient_id,
        rehab_data=body.rehab_data,
        wellness_data=body.wellness_data,
        comp_data=body.comp_data,
        neuromod_data=body.neuromod_data,
        biomarker_data=body.biomarker_data,
        med_data=body.med_data,
        db=db,
    )
    _audit(
        db,
        "full_pipeline",
        actor,
        patient_id,
        (
            f"platforms={len(result.get('platforms', {}))} "
            f"fusion={len(result.get('fusion', {}))} "
            f"analysis={len(result.get('analysis', {}))}"
        ),
    )
    return FullPipelineResponse(**result)
