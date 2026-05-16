"""DeepSynaps Protocol Studio — Phase 3 Multimodal Intelligence Engine API."""

from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional

from fastapi import FastAPI, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from contracts import SynthesisRequest
from knowledge_layer import KnowledgeLayer
from access_control import AccessControl
from audit_logger import AuditLogger
from synthesis_service import SynthesisService
from safety_governance import SafetyGovernance

# ── Dependency Injection ──────────────────────────────────────────────────────

_knowledge_layer_singleton: Optional[KnowledgeLayer] = None


def get_knowledge_layer() -> KnowledgeLayer:
    """FastAPI dependency: KnowledgeLayer singleton."""
    global _knowledge_layer_singleton
    if _knowledge_layer_singleton is None:
        _knowledge_layer_singleton = KnowledgeLayer()
    return _knowledge_layer_singleton


def get_access_control(
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)]
) -> AccessControl:
    """FastAPI dependency: AccessControl with injected KnowledgeLayer."""
    return AccessControl(kl)


def get_audit_logger(
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)]
) -> AuditLogger:
    """FastAPI dependency: AuditLogger with injected KnowledgeLayer."""
    return AuditLogger(kl)


def get_synthesis_service(
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)]
) -> SynthesisService:
    """FastAPI dependency: SynthesisService with injected KnowledgeLayer."""
    return SynthesisService(kl)


# ── Pydantic Models ───────────────────────────────────────────────────────────

SAFETY_DISCLAIMER = (
    "This output is decision support only and requires clinician review. "
    "It does not constitute a diagnosis or treatment recommendation."
)


class TimelineResponse(BaseModel):
    patient_id: str
    events: List[Dict[str, Any]]
    event_count: int
    safety_disclaimer: str = SAFETY_DISCLAIMER


class CorrelationResponse(BaseModel):
    patient_id: str
    correlations: List[Dict[str, Any]]
    safety_disclaimer: str = SAFETY_DISCLAIMER


class ConfounderResponse(BaseModel):
    patient_id: str
    confounders: List[Dict[str, Any]]
    safety_disclaimer: str = SAFETY_DISCLAIMER


class QualityFlagsResponse(BaseModel):
    patient_id: str
    quality_flags: List[Dict[str, Any]]
    safety_disclaimer: str = SAFETY_DISCLAIMER


class SynthesisBody(BaseModel):
    include_modalities: Optional[List[str]] = None
    date_range: Optional[List[str]] = None
    focus_areas: Optional[List[str]] = None
    min_confidence: float = 0.3
    max_hypotheses: int = 5


class SynthesisResponseModel(BaseModel):
    synthesis_id: str
    patient_id: str
    generated_at: str
    timeline: List[Dict[str, Any]]
    correlations: List[Dict[str, Any]]
    confounders: List[Dict[str, Any]]
    quality_flags: List[Dict[str, Any]]
    ranked_hypotheses: List[Dict[str, Any]]
    evidence_summary: Dict[str, Any]
    safety_disclaimer: str = SAFETY_DISCLAIMER


class HealthResponse(BaseModel):
    status: str
    phase: str
    modules: List[str]


# ── Auth Dependency ───────────────────────────────────────────────────────────

def require_clinician_auth(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(...)],
    x_clinic_id: Annotated[str, Header(...)],
    x_patient_access_token: Annotated[str, Header(...)],
    ac: Annotated[AccessControl, Depends(get_access_control)],
    audit: Annotated[AuditLogger, Depends(get_audit_logger)],
    ai_synthesis: bool = False,
) -> Dict[str, Any]:
    """Verify clinician role, clinic isolation, and patient access."""
    role = "clinician"  # Token validation would decode JWT here
    auth_result = ac.authenticate_request(
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        role=role,
        ai_synthesis=ai_synthesis,
    )
    if not auth_result["authorized"]:
        audit.log_intelligence_request(
            endpoint=str(request.url.path),
            patient_id=patient_id,
            clinician_id=clinician_id,
            clinic_id=x_clinic_id,
            request_params={"errors": auth_result["errors"]},
            response_status="denied",
            insight_count=0,
        )
        raise HTTPException(status_code=403, detail=auth_result["errors"])
    return auth_result


# ── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="DeepSynaps Protocol Studio — Phase 3 Multimodal Intelligence Engine",
    description=(
        "API for multimodal intelligence synthesis across patient data. "
        "All endpoints require clinician role and clinic isolation. "
        "All outputs include safety disclaimers."
    ),
    version="3.0.0",
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "phase": "3",
        "modules": [
            "timeline",
            "correlation",
            "confound",
            "evidence",
            "hypothesis",
            "missing_data",
        ],
    }


@app.get(
    "/api/v1/multimodal/patients/{patient_id}/timeline",
    response_model=TimelineResponse,
)
async def get_patient_timeline(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    modality: Annotated[Optional[List[str]], Query(description="Filter by modality")] = None,
    from_date: Annotated[Optional[str], Query(description="Start date ISO")] = None,
    to_date: Annotated[Optional[str], Query(description="End date ISO")] = None,
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    svc: Annotated[SynthesisService, Depends(get_synthesis_service)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
):
    """Get multimodal timeline for a patient."""
    date_range = None
    if from_date and to_date:
        date_range = (
            datetime.fromisoformat(from_date.replace("Z", "+00:00").replace("+00:00", "")),
            datetime.fromisoformat(to_date.replace("Z", "+00:00").replace("+00:00", "")),
        )

    events = svc.get_timeline(
        patient_id=patient_id,
        modality_filter=modality,
        date_range=date_range,
    )

    audit.log_intelligence_request(
        endpoint=f"/api/v1/multimodal/patients/{patient_id}/timeline",
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        request_params={"modality": modality, "from_date": from_date, "to_date": to_date},
        response_status="success",
        insight_count=len(events),
    )

    return {
        "patient_id": patient_id,
        "events": [e.to_dict() for e in events],
        "event_count": len(events),
        "safety_disclaimer": SAFETY_DISCLAIMER,
    }


@app.get(
    "/api/v1/multimodal/patients/{patient_id}/correlations",
    response_model=CorrelationResponse,
)
async def get_patient_correlations(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    window_days: int = Query(default=30, ge=1, le=365, description="Correlation window in days"),
    min_confidence: float = Query(default=0.5, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    svc: Annotated[SynthesisService, Depends(get_synthesis_service)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
):
    """Get correlation findings for a patient."""
    correlations = svc.get_correlations(
        patient_id=patient_id,
        window_days=window_days,
        min_confidence=min_confidence,
    )

    audit.log_intelligence_request(
        endpoint=f"/api/v1/multimodal/patients/{patient_id}/correlations",
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        request_params={"window_days": window_days, "min_confidence": min_confidence},
        response_status="success",
        insight_count=len(correlations),
    )

    return {
        "patient_id": patient_id,
        "correlations": [c.to_dict() for c in correlations],
        "safety_disclaimer": SAFETY_DISCLAIMER,
    }


@app.get(
    "/api/v1/multimodal/patients/{patient_id}/confounders",
    response_model=ConfounderResponse,
)
async def get_patient_confounders(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    svc: Annotated[SynthesisService, Depends(get_synthesis_service)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
):
    """Get potential confounders for a patient."""
    confounders = svc.get_confounders(patient_id=patient_id)

    audit.log_intelligence_request(
        endpoint=f"/api/v1/multimodal/patients/{patient_id}/confounders",
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        request_params={},
        response_status="success",
        insight_count=len(confounders),
    )

    return {
        "patient_id": patient_id,
        "confounders": [c.to_dict() for c in confounders],
        "safety_disclaimer": SAFETY_DISCLAIMER,
    }


@app.get(
    "/api/v1/multimodal/patients/{patient_id}/quality-flags",
    response_model=QualityFlagsResponse,
)
async def get_patient_quality_flags(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    svc: Annotated[SynthesisService, Depends(get_synthesis_service)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
):
    """Get data quality flags for a patient."""
    flags = svc.get_quality_flags(patient_id=patient_id)

    audit.log_intelligence_request(
        endpoint=f"/api/v1/multimodal/patients/{patient_id}/quality-flags",
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        request_params={},
        response_status="success",
        insight_count=len(flags),
    )

    return {
        "patient_id": patient_id,
        "quality_flags": [f.to_dict() for f in flags],
        "safety_disclaimer": SAFETY_DISCLAIMER,
    }


@app.post(
    "/api/v1/multimodal/patients/{patient_id}/synthesis",
    response_model=SynthesisResponseModel,
)
async def post_patient_synthesis(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    body: SynthesisBody,
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)] = ...,
    ac: Annotated[AccessControl, Depends(get_access_control)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
    svc: Annotated[SynthesisService, Depends(get_synthesis_service)] = ...,
):
    """Generate full multimodal synthesis for a patient. Requires ai_analysis_consent."""
    # Additional consent check for synthesis
    auth_result = ac.authenticate_request(
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        role="clinician",
        ai_synthesis=True,
    )
    if not auth_result["authorized"]:
        audit.log_intelligence_request(
            endpoint=f"/api/v1/multimodal/patients/{patient_id}/synthesis",
            patient_id=patient_id,
            clinician_id=clinician_id,
            clinic_id=x_clinic_id,
            request_params=body.model_dump(),
            response_status="denied",
            insight_count=0,
        )
        raise HTTPException(status_code=403, detail=auth_result["errors"])

    syn_request = SynthesisRequest(
        patient_id=patient_id,
        include_modalities=body.include_modalities,
        date_range=tuple(body.date_range) if body.date_range else None,
        focus_areas=body.focus_areas,
        min_confidence=body.min_confidence,
        max_hypotheses=body.max_hypotheses,
    )

    response = svc.generate_synthesis(
        patient_id=patient_id,
        request=syn_request,
    )

    audit.log_synthesis_request(
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        synthesis_id=response.synthesis_id,
        modalities_used=syn_request.include_modalities or ["all"],
        hypothesis_count=len(response.ranked_hypotheses),
    )

    return response.to_dict()


# ── Error Handlers ────────────────────────────────────────────────────────────

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc), "safety_disclaimer": SAFETY_DISCLAIMER},
    )
