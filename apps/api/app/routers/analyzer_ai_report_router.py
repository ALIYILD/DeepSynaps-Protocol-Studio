"""Unified AI report + PDF endpoints for every analyzer page.

Routes:
- POST /api/v1/analyzer-reports/{analyzer_type}/{analysis_id}/ai-report
    Generate (or regenerate) the LLM decision-support narrative for an
    analysis. Returns the structured ``data`` envelope plus literature refs.

- GET  /api/v1/analyzer-reports/{analyzer_type}/{analysis_id}/pdf
    Render the most recent narrative as a clinical-grade PDF and stream it
    as ``application/pdf``. If no narrative exists yet, the endpoint
    transparently regenerates one before rendering.

Cross-clinic ownership gating mirrors the qEEG router: every loaded
analysis surfaces a ``patient_id`` that is checked against the actor's
clinic via ``resolve_patient_clinic_id`` + ``require_patient_owner``.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
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
from app.repositories.patients import resolve_patient_clinic_id
from app.services.analyzer_ai_report import (
    generate_decision_support_report,
    get_registration,
    is_registered,
    list_registered,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/analyzer-reports", tags=["analyzer-reports"])


# ── Models ───────────────────────────────────────────────────────────────────


# core-schema-exempt: AI report request body — only consumed by /api/v1/analyzers/ai-report POST handler
class AIReportRequest(BaseModel):
    """Request body for the AI report endpoint."""

    patient_context: Optional[str] = Field(
        default=None,
        max_length=4000,
        description="Clinician-supplied free-text context to colour the prompt.",
    )


# core-schema-exempt: literature-ref projection used only inside AIReportOut envelope on this router
class LiteratureRef(BaseModel):
    pmid: str = ""
    doi: str = ""
    title: str = ""
    authors: str = ""
    year: str = ""
    journal: str = ""


# core-schema-exempt: AI report key-finding leaf type; only nested inside DecisionSupportData
class KeyFinding(BaseModel):
    title: str = ""
    observation: str = ""
    severity: str = "moderate"
    confidence: float = 0.0


# core-schema-exempt: structured AI-report payload shape; nested inside AIReportOut on this router only
class DecisionSupportData(BaseModel):
    executive_summary: str = ""
    key_findings: list[KeyFinding] = Field(default_factory=list)
    clinical_significance: str = ""
    differential_considerations: list[str] = Field(default_factory=list)
    recommended_followup: list[str] = Field(default_factory=list)
    decision_support_notes: str = ""
    limitations: list[str] = Field(default_factory=list)
    confidence_overall: str = "moderate"


# core-schema-exempt: AI report response envelope; only emitted from /analyzers/ai-report endpoints on this router
class AIReportOut(BaseModel):
    model_config = {"protected_namespaces": ()}

    success: bool
    source: str  # "llm" | "deterministic_fallback"
    analyzer_type: str
    analysis_id: str
    patient_id: str
    title: str
    data: DecisionSupportData
    literature_refs: list[LiteratureRef]
    prompt_hash: str
    model_used: Optional[str] = None
    generated_at: str


# core-schema-exempt: trivial analyzer-type list response; lives only on this router's /analyzers GET
class AnalyzersOut(BaseModel):
    analyzer_types: list[str]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str, db: Session
) -> None:
    """Cross-clinic ownership gate (mirrors qeeg_analysis_router pattern)."""
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _ensure_registered(analyzer_type: str) -> None:
    if not is_registered(analyzer_type):
        raise ApiServiceError(
            code="unknown_analyzer",
            message=(
                f"Unknown analyzer_type: {analyzer_type}. "
                f"Registered: {', '.join(list_registered())}"
            ),
            status_code=400,
        )


def _load_payload_or_404(analyzer_type: str, analysis_id: str, db: Session) -> Any:
    reg = get_registration(analyzer_type)
    if not reg:
        raise ApiServiceError(
            code="unknown_analyzer",
            message=f"Unknown analyzer_type: {analyzer_type}",
            status_code=400,
        )
    loader = reg["loader"]
    try:
        payload = loader(analysis_id, db)
    except Exception as exc:  # pragma: no cover — defensive
        _log.exception("loader raised for %s/%s: %s", analyzer_type, analysis_id, exc)
        raise ApiServiceError(
            code="loader_error",
            message=f"Loader failed for {analyzer_type}",
            status_code=500,
        )
    if payload is None:
        raise ApiServiceError(
            code="not_found",
            message=f"No analysis row for {analyzer_type}/{analysis_id}",
            status_code=404,
        )
    return payload


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("", response_model=AnalyzersOut)
def list_analyzers(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AnalyzersOut:
    """List analyzer types that support AI report generation."""
    require_minimum_role(actor, "clinician")
    return AnalyzersOut(analyzer_types=list_registered())


@router.post(
    "/{analyzer_type}/{analysis_id}/ai-report",
    response_model=AIReportOut,
    status_code=201,
)
@limiter.limit("20/minute")
async def generate_ai_report(
    request: Request,
    analyzer_type: str,
    analysis_id: str,
    body: AIReportRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIReportOut:
    """Generate an AI decision-support narrative for any registered analyzer."""
    require_minimum_role(actor, "clinician")
    _ensure_registered(analyzer_type)

    payload = _load_payload_or_404(analyzer_type, analysis_id, db)
    _gate_patient_access(actor, payload.patient_id, db)

    result = await generate_decision_support_report(
        analyzer_type=analyzer_type,
        payload=payload,
        patient_context=body.patient_context,
        db_session=db,
    )

    return AIReportOut(
        success=bool(result.get("success")),
        source=str(result.get("source") or "deterministic_fallback"),
        analyzer_type=analyzer_type,
        analysis_id=analysis_id,
        patient_id=payload.patient_id,
        title=payload.title,
        data=DecisionSupportData(**result.get("data", {})),
        literature_refs=[
            LiteratureRef(**r) for r in (result.get("literature_refs") or [])
        ],
        prompt_hash=str(result.get("prompt_hash") or ""),
        model_used=result.get("model_used"),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/{analyzer_type}/{analysis_id}/pdf")
@limiter.limit("10/minute")
async def export_ai_report_pdf(
    request: Request,
    analyzer_type: str,
    analysis_id: str,
    patient_context: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    """Render the AI decision-support narrative as a clinical PDF."""
    require_minimum_role(actor, "clinician")
    _ensure_registered(analyzer_type)

    payload = _load_payload_or_404(analyzer_type, analysis_id, db)
    _gate_patient_access(actor, payload.patient_id, db)

    result = await generate_decision_support_report(
        analyzer_type=analyzer_type,
        payload=payload,
        patient_context=patient_context,
        db_session=db,
    )

    # Render HTML → PDF via the existing weasyprint pipeline.
    from app.report.decision_support_template import render_decision_support_html
    from app.report.render_pdf import html_to_pdf_bytes

    generated_at = datetime.now(timezone.utc).isoformat()
    html = render_decision_support_html(
        analyzer_type=analyzer_type,
        analysis_id=analysis_id,
        title=payload.title,
        patient_id=payload.patient_id,
        data=result.get("data", {}),
        literature_refs=result.get("literature_refs") or [],
        metadata=payload.metadata,
        source=str(result.get("source") or "deterministic_fallback"),
        prompt_hash=str(result.get("prompt_hash") or ""),
        generated_at=generated_at,
        clinic_label=getattr(actor, "clinic_id", "—") or "—",
        clinician_label=getattr(actor, "user_id", None)
        or getattr(actor, "actor_id", "—")
        or "—",
    )

    try:
        pdf_bytes = html_to_pdf_bytes(html)
    except Exception as exc:
        _log.exception(
            "PDF render failed for %s/%s: %s", analyzer_type, analysis_id, exc
        )
        raise ApiServiceError(
            code="pdf_render_failed",
            message="PDF rendering failed (weasyprint unavailable?)",
            status_code=500,
        )

    short_id = analysis_id[:8] if analysis_id else "report"
    filename = f"{analyzer_type}_decision_support_{short_id}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
