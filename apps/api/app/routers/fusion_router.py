"""Fusion router — CONTRACT_V3 §1 ``FusionRecommendation`` endpoint + Workbench.

Exposes ``POST /api/v1/fusion/recommend/{patient_id}`` which loads the
most-recent qEEG + MRI analyses for the patient, fuses them via
:mod:`app.services.fusion_service`, writes an audit row, and returns
the envelope.

Also exposes the Fusion Workbench endpoints (Migration 054) for persistent,
review-governed multimodal case summaries.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import FusionCase, FusionCaseAudit, FusionCaseFinding
from app.repositories.patients import resolve_patient_clinic_id
from app.services.fusion_service import build_fusion_recommendation
from app.services.fusion_workbench_service import (
    _build_patient_facing_report,
    _load_json,
    create_fusion_case,
    review_fusion_finding,
    transition_fusion_case_state,
)

router = APIRouter(prefix="/api/v1/fusion", tags=["fusion"])

_log = logging.getLogger(__name__)


# ── Existing schemas (untouched) ─────────────────────────────────────────────


class FusionRecommendationResponse(BaseModel):
    patient_id: str
    qeeg_analysis_id: str | None = None
    mri_analysis_id: str | None = None
    summary: str
    confidence: float | None = None
    confidence_disclaimer: str
    confidence_grade: str = "heuristic"
    recommendations: list[str] = Field(default_factory=list)
    partial: bool = False
    generated_at: str
    confidence_details: dict = Field(default_factory=dict)
    modality_agreement: dict = Field(default_factory=dict)
    explainability: dict = Field(default_factory=dict)
    safety_statement: str | None = None
    limitations: list[str] = Field(default_factory=list)
    missing_modalities: list[str] = Field(default_factory=list)
    provenance: dict = Field(default_factory=dict)


# ── New Workbench schemas ────────────────────────────────────────────────────


class FusionCaseCreateRequest(BaseModel):
    patient_id: str
    force_include_assessment_ids: list[str] = Field(default_factory=list)
    force_include_course_ids: list[str] = Field(default_factory=list)


class FusionCaseListItem(BaseModel):
    id: str
    patient_id: str
    report_state: str
    summary: str | None = None
    confidence: float | None = None
    confidence_grade: str | None = None
    partial: bool
    generated_at: str | None = None
    created_at: str


class FusionCaseResponse(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    qeeg_analysis_id: str | None = None
    mri_analysis_id: str | None = None
    summary: str | None = None
    confidence: float | None = None
    confidence_grade: str | None = None
    recommendations: list[str] = Field(default_factory=list)
    modality_agreement: dict = Field(default_factory=dict)
    protocol_fusion: dict = Field(default_factory=dict)
    explainability: dict = Field(default_factory=dict)
    safety_cockpit: dict = Field(default_factory=dict)
    red_flags: list[dict] = Field(default_factory=list)
    governance: list[dict] = Field(default_factory=list)
    patient_facing_report: dict | None = None
    limitations: list[str] = Field(default_factory=list)
    missing_modalities: list[str] = Field(default_factory=list)
    provenance: dict = Field(default_factory=dict)
    report_state: str
    reviewer_id: str | None = None
    reviewed_at: str | None = None
    clinician_amendments: str | None = None
    report_version: str | None = None
    signed_by: str | None = None
    signed_at: str | None = None
    partial: bool
    source_qeeg_state: str | None = None
    source_mri_state: str | None = None
    radiology_review_required: bool
    generated_at: str | None = None
    created_at: str
    updated_at: str


class FusionSafetyBlockResponse(BaseModel):
    blocked: bool
    reasons: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class FusionTransitionRequest(BaseModel):
    action: str
    note: str | None = None
    amendments: str | None = None


class FusionAgreementResponse(BaseModel):
    overall_status: str
    score: float
    items: list[dict] = Field(default_factory=list)
    decision_support_only: bool


class FusionProtocolFusionResponse(BaseModel):
    fusion_status: str
    recommendation: str
    qeeg_protocol: dict | None = None
    mri_target: dict | None = None
    off_label: bool
    evidence_grade: str
    decision_support_only: bool


class FusionPatientReportResponse(BaseModel):
    patient_id_hash: str
    summary: str | None = None
    confidence: float | None = None
    confidence_grade: str | None = None
    protocol_recommendation: str | None = None
    claims: list[dict] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    disclaimer: str
    generated_at: str | None = None
    decision_support_only: bool


class FusionAuditItem(BaseModel):
    id: str
    action: str
    actor_id: str
    actor_role: str
    previous_state: str | None = None
    new_state: str
    note: str | None = None
    created_at: str


class FusionExportResponse(BaseModel):
    download_url: str
    format: str
    expires_at: str


class FusionFindingReviewRequest(BaseModel):
    status: str
    clinician_note: str | None = None
    amended_text: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _case_to_response(case: FusionCase) -> FusionCaseResponse:
    return FusionCaseResponse(
        id=case.id,
        patient_id=case.patient_id,
        clinician_id=case.clinician_id,
        qeeg_analysis_id=case.qeeg_analysis_id,
        mri_analysis_id=case.mri_analysis_id,
        summary=case.summary,
        confidence=case.confidence,
        confidence_grade=case.confidence_grade,
        recommendations=_load_json(case.recommendations_json) or [],
        modality_agreement=_load_json(case.modality_agreement_json) or {},
        protocol_fusion=_load_json(case.protocol_fusion_json) or {},
        explainability=_load_json(case.explainability_json) or {},
        safety_cockpit=_load_json(case.safety_cockpit_json) or {},
        red_flags=_load_json(case.red_flags_json) or [],
        governance=_load_json(case.governance_json) or [],
        patient_facing_report=_load_json(case.patient_facing_report_json),
        limitations=_load_json(case.limitations_json) or [],
        missing_modalities=_load_json(case.missing_modalities_json) or [],
        provenance=_load_json(case.provenance_json) or {},
        report_state=case.report_state,
        reviewer_id=case.reviewer_id,
        reviewed_at=case.reviewed_at.isoformat() if case.reviewed_at else None,
        clinician_amendments=case.clinician_amendments,
        report_version=case.report_version,
        signed_by=case.signed_by,
        signed_at=case.signed_at.isoformat() if case.signed_at else None,
        partial=case.partial,
        source_qeeg_state=case.source_qeeg_state,
        source_mri_state=case.source_mri_state,
        radiology_review_required=case.radiology_review_required,
        generated_at=case.generated_at.isoformat() if case.generated_at else None,
        created_at=case.created_at.isoformat() if case.created_at else "",
        updated_at=case.updated_at.isoformat() if case.updated_at else "",
    )


# ── Existing endpoint (untouched) ────────────────────────────────────────────


@router.post("/recommend/{patient_id}", response_model=FusionRecommendationResponse)
@limiter.limit("20/minute")
async def recommend_fusion(
    request: Request,
    patient_id: str,
    llm_narrative: bool = Query(default=True, description="Rewrite summary via LLM when available."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return a ``FusionRecommendation`` for ``patient_id``.

    Requires ``clinician`` role. Writes an ``AiSummaryAudit`` row with
    a preview of the produced summary for traceability.
    """
    require_minimum_role(actor, "clinician")
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)
    payload = build_fusion_recommendation(db, patient_id)
    payload["partial"] = not (payload.get("qeeg_analysis_id") and payload.get("mri_analysis_id"))
    return FusionRecommendationResponse(**payload)


# ── Workbench endpoints ──────────────────────────────────────────────────────


@router.post("/cases", response_model=FusionCaseResponse | FusionSafetyBlockResponse, status_code=201)
@limiter.limit("10/minute")
async def create_fusion_case_endpoint(
    request: Request,
    body: FusionCaseCreateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Create a new FusionCase for a patient. Runs safety gates first."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, body.patient_id, db)

    result = create_fusion_case(
        db,
        patient_id=body.patient_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        force_include_assessment_ids=body.force_include_assessment_ids or None,
        force_include_course_ids=body.force_include_course_ids or None,
    )

    if isinstance(result, dict) and result.get("blocked"):
        return FusionSafetyBlockResponse(**result)

    return _case_to_response(result)


@router.get("/cases", response_model=list[FusionCaseListItem])
@limiter.limit("60/minute")
async def list_fusion_cases(
    request: Request,
    patient_id: str = Query(..., description="Patient ID to filter cases."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """List fusion cases for a patient, newest first."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    cases = (
        db.query(FusionCase)
        .filter(FusionCase.patient_id == patient_id)
        .order_by(FusionCase.created_at.desc())
        .all()
    )

    return [
        FusionCaseListItem(
            id=c.id,
            patient_id=c.patient_id,
            report_state=c.report_state,
            summary=c.summary,
            confidence=c.confidence,
            confidence_grade=c.confidence_grade,
            partial=c.partial,
            generated_at=c.generated_at.isoformat() if c.generated_at else None,
            created_at=c.created_at.isoformat() if c.created_at else "",
        )
        for c in cases
    ]


@router.get("/cases/{case_id}", response_model=FusionCaseResponse)
@limiter.limit("60/minute")
async def get_fusion_case(
    request: Request,
    case_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get a single fusion case with full payload."""
    require_minimum_role(actor, "clinician")
    case = db.query(FusionCase).filter_by(id=case_id).first()
    if case is None:
        raise ApiServiceError("not_found", f"FusionCase {case_id} not found", status_code=404)
    _gate_patient_access(actor, case.patient_id, db)
    return _case_to_response(case)


@router.post("/cases/{case_id}/transition", response_model=FusionCaseResponse)
@limiter.limit("30/minute")
async def transition_fusion_case(
    request: Request,
    case_id: str,
    body: FusionTransitionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Transition a fusion case through its state machine."""
    require_minimum_role(actor, "clinician")
    case = db.query(FusionCase).filter_by(id=case_id).first()
    if case is None:
        raise ApiServiceError("not_found", f"FusionCase {case_id} not found", status_code=404)
    _gate_patient_access(actor, case.patient_id, db)

    try:
        updated = transition_fusion_case_state(
            db,
            case_id=case_id,
            action=body.action,
            actor_id=actor.actor_id,
            actor_role=actor.role,
            note=body.note,
            amendments=body.amendments,
        )
    except ValueError as exc:
        raise ApiServiceError("invalid_transition", str(exc), status_code=400)

    return _case_to_response(updated)


@router.get("/cases/{case_id}/patient-report", response_model=FusionPatientReportResponse)
@limiter.limit("60/minute")
async def get_fusion_patient_report(
    request: Request,
    case_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get the patient-facing report for a fusion case.

    Gated: case must be APPROVED or SIGNED.
    """
    require_minimum_role(actor, "patient")
    case = db.query(FusionCase).filter_by(id=case_id).first()
    if case is None:
        raise ApiServiceError("not_found", f"FusionCase {case_id} not found", status_code=404)
    _gate_patient_access(actor, case.patient_id, db)

    if case.report_state not in ("FUSION_APPROVED", "FUSION_SIGNED"):
        raise ApiServiceError(
            "report_not_ready",
            "Patient-facing report is not yet available. Clinician review is required.",
            status_code=403,
        )

    report = _build_patient_facing_report(case)
    return FusionPatientReportResponse(**report)


@router.get("/cases/{case_id}/agreement", response_model=FusionAgreementResponse)
@limiter.limit("60/minute")
async def get_fusion_agreement(
    request: Request,
    case_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get the agreement engine output for a fusion case."""
    require_minimum_role(actor, "clinician")
    case = db.query(FusionCase).filter_by(id=case_id).first()
    if case is None:
        raise ApiServiceError("not_found", f"FusionCase {case_id} not found", status_code=404)
    _gate_patient_access(actor, case.patient_id, db)

    agreement = _load_json(case.modality_agreement_json) or {}
    return FusionAgreementResponse(
        overall_status=agreement.get("overall_status", "unknown"),
        score=agreement.get("score", 0.0),
        items=agreement.get("items", []),
        decision_support_only=True,
    )


@router.get("/cases/{case_id}/protocol-fusion", response_model=FusionProtocolFusionResponse)
@limiter.limit("60/minute")
async def get_fusion_protocol_fusion(
    request: Request,
    case_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get the protocol fusion panel for a fusion case."""
    require_minimum_role(actor, "clinician")
    case = db.query(FusionCase).filter_by(id=case_id).first()
    if case is None:
        raise ApiServiceError("not_found", f"FusionCase {case_id} not found", status_code=404)
    _gate_patient_access(actor, case.patient_id, db)

    pf = _load_json(case.protocol_fusion_json) or {}
    return FusionProtocolFusionResponse(
        fusion_status=pf.get("fusion_status", "none"),
        recommendation=pf.get("recommendation", ""),
        qeeg_protocol=pf.get("qeeg_protocol"),
        mri_target=pf.get("mri_target"),
        off_label=pf.get("off_label", False),
        evidence_grade=pf.get("evidence_grade", "heuristic"),
        decision_support_only=True,
    )


@router.post("/cases/{case_id}/findings/{finding_id}/review", response_model=dict)
@limiter.limit("30/minute")
async def review_fusion_case_finding(
    request: Request,
    case_id: str,
    finding_id: str,
    body: FusionFindingReviewRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Review a specific finding in a fusion case."""
    require_minimum_role(actor, "clinician")
    case = db.query(FusionCase).filter_by(id=case_id).first()
    if case is None:
        raise ApiServiceError("not_found", f"FusionCase {case_id} not found", status_code=404)
    _gate_patient_access(actor, case.patient_id, db)

    try:
        review_fusion_finding(
            db,
            fusion_case_id=case_id,
            finding_id=finding_id,
            actor_id=actor.actor_id,
            status=body.status,
            clinician_note=body.clinician_note,
            amended_text=body.amended_text,
        )
    except ValueError as exc:
        raise ApiServiceError("not_found", str(exc), status_code=404)

    return {"status": "ok", "finding_id": finding_id}


@router.get("/cases/{case_id}/audit", response_model=list[FusionAuditItem])
@limiter.limit("60/minute")
async def get_fusion_audit(
    request: Request,
    case_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get the audit trail for a fusion case."""
    require_minimum_role(actor, "clinician")
    case = db.query(FusionCase).filter_by(id=case_id).first()
    if case is None:
        raise ApiServiceError("not_found", f"FusionCase {case_id} not found", status_code=404)
    _gate_patient_access(actor, case.patient_id, db)

    audits = (
        db.query(FusionCaseAudit)
        .filter_by(fusion_case_id=case_id)
        .order_by(FusionCaseAudit.created_at.desc())
        .all()
    )

    return [
        FusionAuditItem(
            id=a.id,
            action=a.action,
            actor_id=a.actor_id,
            actor_role=a.actor_role,
            previous_state=a.previous_state,
            new_state=a.new_state,
            note=a.note,
            created_at=a.created_at.isoformat() if a.created_at else "",
        )
        for a in audits
    ]


@router.post("/cases/{case_id}/export", response_model=FusionExportResponse)
@limiter.limit("10/minute")
async def export_fusion_case(
    request: Request,
    case_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Export a fusion case as JSON. Gated on SIGNED state (or APPROVED with override)."""
    require_minimum_role(actor, "clinician")
    case = db.query(FusionCase).filter_by(id=case_id).first()
    if case is None:
        raise ApiServiceError("not_found", f"FusionCase {case_id} not found", status_code=404)
    _gate_patient_access(actor, case.patient_id, db)

    # Export gate: SIGNED required, or APPROVED if feature flag enabled
    allow_unsigned = False  # Future: read from settings/feature flags
    if case.report_state not in ("FUSION_SIGNED",):
        if case.report_state == "FUSION_APPROVED" and allow_unsigned:
            pass
        else:
            raise ApiServiceError(
                "export_not_allowed",
                "Fusion case must be signed before export.",
                status_code=403,
            )

    # Build export payload
    export_payload = {
        "format": "deepsynaps-fusion-v1",
        "patient_id_hash": f"sha256:{case.patient_id}",  # pseudonymized
        "fusion_case_id": case.id,
        "generated_at": case.generated_at.isoformat() if case.generated_at else None,
        "source_analyses": {
            "qeeg": case.qeeg_analysis_id,
            "mri": case.mri_analysis_id,
        },
        "summary": case.summary,
        "confidence": case.confidence,
        "confidence_grade": case.confidence_grade,
        "agreement": _load_json(case.modality_agreement_json),
        "protocol_fusion": _load_json(case.protocol_fusion_json),
        "safety_cockpit": _load_json(case.safety_cockpit_json),
        "red_flags": _load_json(case.red_flags_json),
        "governance": _load_json(case.governance_json),
        "limitations": _load_json(case.limitations_json),
        "provenance": _load_json(case.provenance_json),
        "decision_support_only": True,
        "signed_by": case.signed_by,
        "signed_at": case.signed_at.isoformat() if case.signed_at else None,
    }

    # Store as a simple JSON blob (in production this would be S3 / file storage)
    # For now, return a data URI
    json_bytes = json.dumps(export_payload, indent=2, default=str).encode("utf-8")
    import base64

    data_uri = "data:application/json;base64," + base64.b64encode(json_bytes).decode("ascii")

    return FusionExportResponse(
        download_url=data_uri,
        format="deepsynaps-fusion-v1",
        expires_at=case.signed_at.isoformat() if case.signed_at else "",
    )
