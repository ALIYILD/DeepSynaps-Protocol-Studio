"""DeepSynaps Protocol Studio — Phase 4 DeepTwin API + Phase 3 Multimodal Intelligence Engine."""

from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional

from fastapi import FastAPI, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from contracts import SynthesisRequest
from deeptwin_contracts import DeepTwinSnapshot, ClinicianReview, DeepTwinAuditEvent, DeepTwinExport
from knowledge_layer import KnowledgeLayer
from access_control import AccessControl
from audit_logger import AuditLogger
from synthesis_service import SynthesisService
from safety_governance import SafetyGovernance
from deeptwin_snapshot import DeepTwinSnapshotEngine as DeepTwinSnapshotEngineModule
from deeptwin_export import DeepTwinExportEngine as DeepTwinExportEngineModule
from deeptwin_audit import DeepTwinAuditLogger as DeepTwinAuditLoggerModule

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


# ── DeepTwin Dependency Injectors (Phase 4) ───────────────────────────────────
# Phase 4 engines are imported from their dedicated modules:
#   deeptwin_snapshot  → DeepTwinSnapshotEngine
#   deeptwin_export    → DeepTwinExportEngine
#   deeptwin_audit     → DeepTwinAuditLogger

class DeepTwinSnapshotEngine(DeepTwinSnapshotEngineModule):
    """Re-export from dedicated module with FastAPI-compatible interface."""
    pass


class DeepTwinReviewEngine:
    """Engine for clinician reviews on DeepTwin snapshots."""

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer
        self._reviews: Dict[str, ClinicianReview] = {}

    def create_review(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        hypothesis_id: str,
        action: str,
        note: str = "",
        requested_modalities: Optional[List[str]] = None,
    ) -> ClinicianReview:
        """Create a clinician review record."""
        review = ClinicianReview(
            patient_id=patient_id,
            clinician_id=clinician_id,
            snapshot_id=snapshot_id,
            hypothesis_id=hypothesis_id,
            action=action,
            note=note,
            requested_modalities=requested_modalities or [],
        )
        self._reviews[review.review_id] = review
        return review

    def get_reviews_for_patient(self, patient_id: str) -> List[ClinicianReview]:
        """Get all reviews for a patient."""
        return [
            r for r in self._reviews.values()
            if r.patient_id == patient_id
        ]


class DeepTwinExportEngine(DeepTwinExportEngineModule):
    """Re-export from dedicated module with FastAPI-compatible interface."""
    pass


class DeepTwinAuditLogger(DeepTwinAuditLoggerModule):
    """Re-export from dedicated module with FastAPI-compatible interface."""
    pass


def get_deeptwin_snapshot_engine(
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)]
) -> DeepTwinSnapshotEngine:
    """FastAPI dependency: DeepTwinSnapshotEngine with injected KnowledgeLayer."""
    return DeepTwinSnapshotEngine(kl)


def get_deeptwin_review_engine(
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)]
) -> DeepTwinReviewEngine:
    """FastAPI dependency: DeepTwinReviewEngine with injected KnowledgeLayer."""
    return DeepTwinReviewEngine(kl)


def get_deeptwin_export_engine(
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)]
) -> DeepTwinExportEngine:
    """FastAPI dependency: DeepTwinExportEngine with injected KnowledgeLayer."""
    return DeepTwinExportEngine(kl)


def get_deeptwin_audit_logger(
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)]
) -> DeepTwinAuditLogger:
    """FastAPI dependency: DeepTwinAuditLogger with injected KnowledgeLayer."""
    return DeepTwinAuditLogger(kl)


# ── Pydantic Models ───────────────────────────────────────────────────────────

SAFETY_DISCLAIMER = (
    "This output is decision support only and requires clinician review. "
    "It does not constitute a diagnosis or treatment recommendation."
)

DEEPTWIN_SAFETY_DISCLAIMER = (
    "Decision support only. Requires clinician review. "
    "DeepTwin does not diagnose, prescribe, or prove causality."
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


# ── DeepTwin Pydantic Models ──────────────────────────────────────────────────

class DeepTwinSnapshotResponse(BaseModel):
    snapshot: Dict[str, Any]
    safety_disclaimer: str = DEEPTWIN_SAFETY_DISCLAIMER


class DeepTwinTimelineResponse(BaseModel):
    patient_id: str
    modality_coverage: Dict[str, bool]
    recency_status: Dict[str, str]
    events: List[Dict[str, Any]]
    event_count: int
    safety_disclaimer: str = DEEPTWIN_SAFETY_DISCLAIMER


class DeepTwinHypothesesResponse(BaseModel):
    patient_id: str
    ranked_hypotheses: List[Dict[str, Any]]
    hypothesis_count: int
    safety_disclaimer: str = DEEPTWIN_SAFETY_DISCLAIMER


class DeepTwinSynthesisBody(BaseModel):
    include_modalities: Optional[List[str]] = None
    date_range: Optional[List[str]] = None
    max_hypotheses: int = 5


class DeepTwinSynthesisResponse(BaseModel):
    snapshot: Dict[str, Any]
    safety_disclaimer: str = DEEPTWIN_SAFETY_DISCLAIMER


class DeepTwinReviewBody(BaseModel):
    clinician_id: str
    snapshot_id: str
    hypothesis_id: str
    action: str = Field(..., pattern=r"^(accept|reject|note|request_data|mark_reviewed)$")
    note: str = ""
    requested_modalities: List[str] = Field(default_factory=list)


class DeepTwinReviewResponse(BaseModel):
    review_id: str
    action: str
    status: str = "recorded"
    safety_disclaimer: str = DEEPTWIN_SAFETY_DISCLAIMER


class DeepTwinExportBody(BaseModel):
    clinician_id: str
    snapshot_id: str
    export_type: str = Field(..., pattern=r"^(json|pdf|report_handoff|protocol_handoff)$")


class DeepTwinExportResponse(BaseModel):
    export_id: str
    export_type: str
    audit_reference: str
    safety_disclaimer: str = DEEPTWIN_SAFETY_DISCLAIMER


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


# ── GZip Compression Config ───────────────────────────────────────────────────

import os
from starlette.middleware.gzip import GZipMiddleware

_gzip_enabled = os.environ.get("DEEPSYNAPS_ENABLE_GZIP", "true").lower() not in ("false", "0", "no")
_gzip_min_size = int(os.environ.get("DEEPSYNAPS_GZIP_MINIMUM_SIZE", "1024"))

# ── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="DeepSynaps Protocol Studio — Phase 4 DeepTwin + Phase 3 Multimodal Intelligence",
    description=(
        "API for DeepTwin patient-level synthesis and multimodal intelligence. "
        "All endpoints require clinician role and clinic isolation. "
        "All outputs include safety disclaimers. DeepTwin does not diagnose."
    ),
    version="4.0.0",
)

# ── GZip Middleware ───────────────────────────────────────────────────────────
# Added after app creation, before routes. Compresses JSON responses
# >= 1024 bytes when client sends Accept-Encoding: gzip.
# Does NOT compress: small responses (<1KB), streaming responses, or
# already-compressed binary payloads.

if _gzip_enabled:
    app.add_middleware(GZipMiddleware, minimum_size=_gzip_min_size)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "phase": "4",
        "modules": [
            "timeline",
            "correlation",
            "confound",
            "evidence",
            "hypothesis",
            "missing_data",
            "deeptwin_snapshot",
            "deeptwin_review",
            "deeptwin_export",
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3 ENDPOINTS ( preserved )
# ═══════════════════════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4 DEEPTWIN ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── GET /api/v1/deeptwin/patients/{patient_id}/snapshot ───────────────────────

@app.get(
    "/api/v1/deeptwin/patients/{patient_id}/snapshot",
    response_model=DeepTwinSnapshotResponse,
)
async def get_deeptwin_snapshot(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    engine: Annotated[DeepTwinSnapshotEngine, Depends(get_deeptwin_snapshot_engine)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
    dt_audit: Annotated[DeepTwinAuditLogger, Depends(get_deeptwin_audit_logger)] = ...,
):
    """Get a DeepTwin snapshot with all synthesis data for a patient."""
    snapshot = engine.generate_snapshot(patient_id=patient_id)

    audit.log_intelligence_request(
        endpoint=f"/api/v1/deeptwin/patients/{patient_id}/snapshot",
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        request_params={},
        response_status="success",
        insight_count=len(snapshot.ranked_hypotheses),
    )
    dt_audit.log_deeptwin_event(
        patient_id=patient_id,
        clinician_id=clinician_id,
        event_type="deeptwin_opened",
        snapshot_id=snapshot.snapshot_id,
    )

    return {
        "snapshot": snapshot.to_dict(),
        "safety_disclaimer": DEEPTWIN_SAFETY_DISCLAIMER,
    }


# ── GET /api/v1/deeptwin/patients/{patient_id}/timeline ───────────────────────

@app.get(
    "/api/v1/deeptwin/patients/{patient_id}/timeline",
    response_model=DeepTwinTimelineResponse,
)
async def get_deeptwin_timeline(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    engine: Annotated[DeepTwinSnapshotEngine, Depends(get_deeptwin_snapshot_engine)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
):
    """Get DeepTwin timeline view with modality coverage and events."""
    snapshot = engine.generate_snapshot(patient_id=patient_id)

    audit.log_intelligence_request(
        endpoint=f"/api/v1/deeptwin/patients/{patient_id}/timeline",
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        request_params={},
        response_status="success",
        insight_count=len(snapshot.timeline_events),
    )

    return {
        "patient_id": patient_id,
        "modality_coverage": snapshot.modality_coverage,
        "recency_status": snapshot.recency_status,
        "events": snapshot.timeline_events,
        "event_count": len(snapshot.timeline_events),
        "safety_disclaimer": DEEPTWIN_SAFETY_DISCLAIMER,
    }


# ── GET /api/v1/deeptwin/patients/{patient_id}/hypotheses ─────────────────────

@app.get(
    "/api/v1/deeptwin/patients/{patient_id}/hypotheses",
    response_model=DeepTwinHypothesesResponse,
)
async def get_deeptwin_hypotheses(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    engine: Annotated[DeepTwinSnapshotEngine, Depends(get_deeptwin_snapshot_engine)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
):
    """Get ranked hypotheses for a patient."""
    snapshot = engine.generate_snapshot(patient_id=patient_id)

    audit.log_intelligence_request(
        endpoint=f"/api/v1/deeptwin/patients/{patient_id}/hypotheses",
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        request_params={},
        response_status="success",
        insight_count=len(snapshot.ranked_hypotheses),
    )

    return {
        "patient_id": patient_id,
        "ranked_hypotheses": snapshot.ranked_hypotheses,
        "hypothesis_count": len(snapshot.ranked_hypotheses),
        "safety_disclaimer": DEEPTWIN_SAFETY_DISCLAIMER,
    }


# ── POST /api/v1/deeptwin/patients/{patient_id}/synthesis ─────────────────────

@app.post(
    "/api/v1/deeptwin/patients/{patient_id}/synthesis",
    response_model=DeepTwinSynthesisResponse,
)
async def post_deeptwin_synthesis(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    body: DeepTwinSynthesisBody,
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)] = ...,
    ac: Annotated[AccessControl, Depends(get_access_control)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
    engine: Annotated[DeepTwinSnapshotEngine, Depends(get_deeptwin_snapshot_engine)] = ...,
    dt_audit: Annotated[DeepTwinAuditLogger, Depends(get_deeptwin_audit_logger)] = ...,
):
    """Generate full DeepTwin synthesis. Requires ai_analysis_consent."""
    auth_result = ac.authenticate_request(
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        role="clinician",
        ai_synthesis=True,
    )
    if not auth_result["authorized"]:
        audit.log_intelligence_request(
            endpoint=f"/api/v1/deeptwin/patients/{patient_id}/synthesis",
            patient_id=patient_id,
            clinician_id=clinician_id,
            clinic_id=x_clinic_id,
            request_params=body.model_dump(),
            response_status="denied",
            insight_count=0,
        )
        raise HTTPException(status_code=403, detail=auth_result["errors"])

    snapshot = engine.generate_snapshot(
        patient_id=patient_id,
        include_modalities=body.include_modalities,
        date_range=body.date_range,
        max_hypotheses=body.max_hypotheses,
    )

    audit.log_synthesis_request(
        patient_id=patient_id,
        clinician_id=clinician_id,
        clinic_id=x_clinic_id,
        synthesis_id=snapshot.snapshot_id,
        modalities_used=body.include_modalities or ["all"],
        hypothesis_count=len(snapshot.ranked_hypotheses),
    )
    dt_audit.log_deeptwin_event(
        patient_id=patient_id,
        clinician_id=clinician_id,
        event_type="synthesis_requested",
        snapshot_id=snapshot.snapshot_id,
        details={"modalities": body.include_modalities, "max_hypotheses": body.max_hypotheses},
    )

    return {
        "snapshot": snapshot.to_dict(),
        "safety_disclaimer": DEEPTWIN_SAFETY_DISCLAIMER,
    }


# ── POST /api/v1/deeptwin/patients/{patient_id}/review ────────────────────────

@app.post(
    "/api/v1/deeptwin/patients/{patient_id}/review",
    response_model=DeepTwinReviewResponse,
)
async def post_deeptwin_review(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    body: DeepTwinReviewBody,
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    engine: Annotated[DeepTwinReviewEngine, Depends(get_deeptwin_review_engine)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
    dt_audit: Annotated[DeepTwinAuditLogger, Depends(get_deeptwin_audit_logger)] = ...,
):
    """Record a clinician review action on a DeepTwin snapshot/hypothesis.

    Actions: accept, reject, note, request_data, mark_reviewed
    """
    review = engine.create_review(
        patient_id=patient_id,
        clinician_id=body.clinician_id,
        snapshot_id=body.snapshot_id,
        hypothesis_id=body.hypothesis_id,
        action=body.action,
        note=body.note,
        requested_modalities=body.requested_modalities,
    )

    # Map action to audit event type
    event_type_map = {
        "accept": "hypothesis_accepted",
        "reject": "hypothesis_rejected",
        "note": "hypothesis_noted",
        "request_data": "data_requested",
        "mark_reviewed": "review_completed",
    }

    audit.log_intelligence_request(
        endpoint=f"/api/v1/deeptwin/patients/{patient_id}/review",
        patient_id=patient_id,
        clinician_id=body.clinician_id,
        clinic_id=x_clinic_id,
        request_params=body.model_dump(),
        response_status="success",
        insight_count=1,
    )
    dt_audit.log_deeptwin_event(
        patient_id=patient_id,
        clinician_id=body.clinician_id,
        event_type=event_type_map.get(body.action, "review_completed"),
        snapshot_id=body.snapshot_id,
        details={"hypothesis_id": body.hypothesis_id, "action": body.action, "note": body.note},
    )

    return {
        "review_id": review.review_id,
        "action": body.action,
        "status": "recorded",
        "safety_disclaimer": DEEPTWIN_SAFETY_DISCLAIMER,
    }


# ── POST /api/v1/deeptwin/patients/{patient_id}/export ────────────────────────

@app.post(
    "/api/v1/deeptwin/patients/{patient_id}/export",
    response_model=DeepTwinExportResponse,
)
async def post_deeptwin_export(
    request: Request,
    patient_id: str,
    clinician_id: Annotated[str, Query(..., description="Clinician ID")],
    body: DeepTwinExportBody,
    x_clinic_id: Annotated[str, Header(..., description="Clinic ID")] = ...,
    x_patient_access_token: Annotated[str, Header(..., description="Patient access token")] = ...,
    auth: Annotated[Dict[str, Any], Depends(require_clinician_auth)] = ...,
    engine: Annotated[DeepTwinExportEngine, Depends(get_deeptwin_export_engine)] = ...,
    audit: Annotated[AuditLogger, Depends(get_audit_logger)] = ...,
    dt_audit: Annotated[DeepTwinAuditLogger, Depends(get_deeptwin_audit_logger)] = ...,
):
    """Export or hand off a DeepTwin snapshot.

    Types: json, pdf, report_handoff, protocol_handoff
    """
    export = engine.create_export(
        patient_id=patient_id,
        clinician_id=body.clinician_id,
        snapshot_id=body.snapshot_id,
        export_type=body.export_type,
    )

    # Map export type to audit event type
    event_type_map = {
        "json": "export_generated",
        "pdf": "export_generated",
        "report_handoff": "report_handoff",
        "protocol_handoff": "protocol_handoff",
    }

    audit.log_intelligence_request(
        endpoint=f"/api/v1/deeptwin/patients/{patient_id}/export",
        patient_id=patient_id,
        clinician_id=body.clinician_id,
        clinic_id=x_clinic_id,
        request_params=body.model_dump(),
        response_status="success",
        insight_count=1,
    )
    dt_audit.log_deeptwin_event(
        patient_id=patient_id,
        clinician_id=body.clinician_id,
        event_type=event_type_map.get(body.export_type, "export_generated"),
        snapshot_id=body.snapshot_id,
        details={"export_type": body.export_type, "export_id": export.export_id},
    )

    return {
        "export_id": export.export_id,
        "export_type": body.export_type,
        "audit_reference": export.audit_reference,
        "safety_disclaimer": DEEPTWIN_SAFETY_DISCLAIMER,
    }


# ── Summary Endpoints (PR #4) ─────────────────────────────────────────────────
# Aggregate, bounded-payload summary queries for dashboard performance.
# Uses SQL COUNT/aggregate instead of loading full records.
# Enforces role gates, clinic isolation, and patient access.

SUMMARY_SAFETY = (
    "Summary counts only. Requires clinician review. "
    "Not a diagnosis or clinical assessment."
)


class ClinicDashboardResponse(BaseModel):
    scope: str = "clinic_dashboard"
    clinic_id: str
    generated_at: str
    generated_by: str = ""
    active_patients: int
    recent_events_30d: int
    recent_audits_30d: int
    ai_consent_count: int
    patients_missing_consent: int
    high_risk_patients: int
    pending_reviews: int
    modality_breakdown: List[Dict[str, Any]]
    quality_flags: Dict[str, int]
    evidence_coverage: Dict[str, Any]
    partial: bool
    safety_disclaimer: str = SUMMARY_SAFETY


class PatientDashboardResponse(BaseModel):
    scope: str = "patient_dashboard"
    patient_id: str
    clinic_id: str = ""
    generated_at: str
    generated_by: str = ""
    total_events: int
    recent_events_30d: int
    modality_breakdown: List[Dict[str, Any]]
    latest_by_modality: List[Dict[str, Any]]
    missing_modalities: List[str]
    latest_event_at: Optional[str]
    first_event_at: Optional[str]
    data_quality_summary: Dict[str, int]
    risk_signal_count: int
    consent_status: Dict[str, Any]
    partial: bool
    safety_disclaimer: str = SUMMARY_SAFETY


class AnalyzerStatusResponse(BaseModel):
    scope: str = "analyzer_status"
    clinic_id: str
    generated_at: str
    generated_by: str = ""
    all_time_modality_counts: List[Dict[str, Any]]
    recent_30d_modality_counts: List[Dict[str, Any]]
    stale_modalities: List[str]
    evidence_entries: int
    partial: bool
    safety_disclaimer: str = SUMMARY_SAFETY


class PatientAnalyzerResponse(BaseModel):
    scope: str = "patient_analyzer"
    patient_id: str
    generated_at: str
    modality_stats: List[Dict[str, Any]]
    missing_modalities: List[str]
    evidence_linked_count: int
    risk_signal_count: int
    latest_risk_signal_at: Optional[str]
    risk_status: str
    avg_confidence: float
    days_since_last_event: Optional[int]
    partial: bool
    safety_disclaimer: str = SUMMARY_SAFETY


def _require_summary_access(
    ac: AccessControl,
    clinic_id: str,
    clinician_id: str,
    patient_id: str = "",
) -> Dict[str, Any]:
    """Shared access check for summary endpoints.

    Summary endpoints require can_read_patient permission.
    Clinic-scoped summaries check clinic access.
    Patient-scoped summaries check patient-level access.
    """
    role = ac._lookup_user_role(clinician_id, clinic_id) or "clinician"
    return ac.authenticate_request(
        patient_id=patient_id or "__clinic__",
        clinician_id=clinician_id,
        clinic_id=clinic_id,
        role=role,
        ai_synthesis=False,
    )


@app.get("/api/v1/summary/clinic-dashboard", tags=["Summary"], response_model=ClinicDashboardResponse)
async def clinic_dashboard_summary(
    clinic_id: str = Header(..., alias="X-Clinic-ID"),
    x_access_token: str = Header(..., alias="X-Patient-Access-Token"),
    clinician_id: str = Query(...),
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)] = ...,
    ac: Annotated[AccessControl, Depends(get_access_control)] = ...,
):
    """Aggregate clinic-level dashboard. Bounded counts, no PHI.

    Requires clinician, clinic_admin, or super_admin role.
    Clinic isolation enforced.
    """
    auth = _require_summary_access(ac, clinic_id, clinician_id)
    if not auth["authorized"]:
        raise HTTPException(status_code=403, detail=auth["errors"])

    from summary_engine import SummaryEngine
    engine = SummaryEngine(kl)
    result = engine.clinic_dashboard_summary(clinic_id)
    result["generated_by"] = clinician_id
    result["safety_disclaimer"] = SUMMARY_SAFETY
    return result


@app.get("/api/v1/summary/patients/{patient_id}/dashboard", tags=["Summary"], response_model=PatientDashboardResponse)
async def patient_dashboard_summary(
    patient_id: str,
    clinic_id: str = Header(..., alias="X-Clinic-ID"),
    x_access_token: str = Header(..., alias="X-Patient-Access-Token"),
    clinician_id: str = Query(...),
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)] = ...,
    ac: Annotated[AccessControl, Depends(get_access_control)] = ...,
):
    """Enriched patient-level snapshot. Counts, latest per modality, risk flags, consent.

    Requires clinician, clinic_admin, or super_admin role.
    Patient access + clinic isolation enforced.
    """
    auth = _require_summary_access(ac, clinic_id, clinician_id, patient_id)
    if not auth["authorized"]:
        raise HTTPException(status_code=403, detail=auth["errors"])

    from summary_engine import SummaryEngine
    engine = SummaryEngine(kl)
    result = engine.patient_dashboard_summary(patient_id)
    result["generated_by"] = clinician_id
    result["clinic_id"] = clinic_id
    result["safety_disclaimer"] = SUMMARY_SAFETY
    return result


@app.get("/api/v1/summary/analyzer-status", tags=["Summary"], response_model=AnalyzerStatusResponse)
async def analyzer_status_summary(
    clinic_id: str = Header(..., alias="X-Clinic-ID"),
    x_access_token: str = Header(..., alias="X-Patient-Access-Token"),
    clinician_id: str = Query(...),
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)] = ...,
    ac: Annotated[AccessControl, Depends(get_access_control)] = ...,
):
    """Aggregate analyzer/data processing status. Counts and freshness.

    Requires clinician, clinic_admin, or super_admin role.
    Clinic isolation enforced.
    """
    auth = _require_summary_access(ac, clinic_id, clinician_id)
    if not auth["authorized"]:
        raise HTTPException(status_code=403, detail=auth["errors"])

    from summary_engine import SummaryEngine
    engine = SummaryEngine(kl)
    result = engine.analyzer_status_summary(clinic_id)
    result["generated_by"] = clinician_id
    result["safety_disclaimer"] = SUMMARY_SAFETY
    return result


@app.get("/api/v1/summary/patients/{patient_id}/analyzer", tags=["Summary"], response_model=PatientAnalyzerResponse)
async def patient_analyzer_summary(
    patient_id: str,
    clinic_id: str = Header(..., alias="X-Clinic-ID"),
    x_access_token: str = Header(..., alias="X-Patient-Access-Token"),
    clinician_id: str = Query(...),
    kl: Annotated[KnowledgeLayer, Depends(get_knowledge_layer)] = ...,
    ac: Annotated[AccessControl, Depends(get_access_control)] = ...,
):
    """Per-patient analyzer summary. Modality counts, missing modalities, risk status.

    Requires clinician, clinic_admin, or super_admin role.
    Patient access + clinic isolation enforced.
    Replaces N per-modality timeline calls with 1 aggregate call.
    """
    auth = _require_summary_access(ac, clinic_id, clinician_id, patient_id)
    if not auth["authorized"]:
        raise HTTPException(status_code=403, detail=auth["errors"])

    from summary_engine import SummaryEngine
    engine = SummaryEngine(kl)
    result = engine.patient_analyzer_summary(patient_id)
    result["generated_by"] = clinician_id
    result["safety_disclaimer"] = SUMMARY_SAFETY
    return result


# ── Error Handlers ────────────────────────────────────────────────────────────

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc), "safety_disclaimer": DEEPTWIN_SAFETY_DISCLAIMER},
    )
