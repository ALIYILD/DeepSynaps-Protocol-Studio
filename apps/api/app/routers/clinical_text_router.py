"""Clinical text NLP API — OpenMed-backed analyze / pii / deidentify.

Wraps :mod:`app.services.openmed.adapter` behind FastAPI endpoints with
auth gates and rate limits. The adapter chooses an OpenMed HTTP backend
when ``OPENMED_BASE_URL`` is set; otherwise an in-process heuristic
backend handles requests so the endpoints work even without an upstream.

Decision-support framing only — extracted entities are NLP candidates,
never validated clinical findings.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
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
from app.services.consent_enforcement import (
    require_ai_analysis_consent,
    ConsentMissingError,
)
from app.services.openmed import adapter
from app.services.openmed.schemas import (
    AnalyzeResponse,
    ClinicalTextInput,
    DeidentifyResponse,
    HealthResponse,
    NeuromodulationExtractResponse,
    PIIExtractResponse,
    SourceType,
)

router = APIRouter(prefix="/api/v1/clinical-text", tags=["clinical-text"])


class _TextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=200_000)
    source_type: SourceType = "free_text"
    locale: str = "en"
    patient_id: str | None = None

    def to_input(self) -> ClinicalTextInput:
        return ClinicalTextInput(
            text=self.text, source_type=self.source_type, locale=self.locale
        )


def _validated_input(payload: _TextRequest) -> ClinicalTextInput:
    text = (payload.text or "").strip()
    if not text:
        raise ApiServiceError(
            code="invalid_text",
            message="Text must not be blank.",
            status_code=422,
        )
    return ClinicalTextInput(
        text=text,
        source_type=payload.source_type,
        locale=payload.locale,
    )


def _gate_patient_context(
    actor: AuthenticatedActor,
    patient_id: str | None,
    db: Session,
) -> None:
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


@router.get("/health", response_model=HealthResponse)
def clinical_text_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HealthResponse:
    require_minimum_role(actor, "clinician")
    return adapter.health()


@router.post("/analyze", response_model=AnalyzeResponse)
@limiter.limit("30/minute")
def clinical_text_analyze(
    request: Request,
    payload: _TextRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalyzeResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_context(actor, payload.patient_id, db)
    
    # Enforce ai_analysis consent if patient is specified
    if payload.patient_id:
        try:
            require_ai_analysis_consent(db, payload.patient_id, actor, ai_modality="text")
        except ConsentMissingError:
            raise HTTPException(status_code=403, detail="ai_analysis consent required")
    
    return adapter.analyze(_validated_input(payload))


@router.post("/extract-pii", response_model=PIIExtractResponse)
@limiter.limit("30/minute")
def clinical_text_extract_pii(
    request: Request,
    payload: _TextRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PIIExtractResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_context(actor, payload.patient_id, db)
    
    # Enforce ai_analysis consent if patient is specified
    if payload.patient_id:
        try:
            require_ai_analysis_consent(db, payload.patient_id, actor, ai_modality="text")
        except ConsentMissingError:
            raise HTTPException(status_code=403, detail="ai_analysis consent required")
    
    return adapter.extract_pii(_validated_input(payload))


@router.post("/deidentify", response_model=DeidentifyResponse)
@limiter.limit("30/minute")
def clinical_text_deidentify(
    request: Request,
    payload: _TextRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DeidentifyResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_context(actor, payload.patient_id, db)
    
    # Enforce ai_analysis consent if patient is specified
    if payload.patient_id:
        try:
            require_ai_analysis_consent(db, payload.patient_id, actor, ai_modality="text")
        except ConsentMissingError:
            raise HTTPException(status_code=403, detail="ai_analysis consent required")
    
    return adapter.deidentify(_validated_input(payload))


@router.post("/analyze-neuromodulation", response_model=NeuromodulationExtractResponse)
@limiter.limit("30/minute")
def clinical_text_analyze_neuromodulation(
    request: Request,
    payload: _TextRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> NeuromodulationExtractResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_context(actor, payload.patient_id, db)
    
    # Enforce ai_analysis consent if patient is specified
    if payload.patient_id:
        try:
            require_ai_analysis_consent(db, payload.patient_id, actor, ai_modality="text")
        except ConsentMissingError:
            raise HTTPException(status_code=403, detail="ai_analysis consent required")
    
    return adapter.analyze_neuromodulation(_validated_input(payload))


__all__ = ["router"]
