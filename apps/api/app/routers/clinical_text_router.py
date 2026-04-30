"""Clinical text NLP API — OpenMed-backed analyze / pii / deidentify.

Wraps :mod:`app.services.openmed.adapter` behind FastAPI endpoints with
auth gates and rate limits. The adapter chooses an OpenMed HTTP backend
when ``OPENMED_BASE_URL`` is set; otherwise an in-process heuristic
backend handles requests so the endpoints work even without an upstream.

Decision-support framing only — extracted entities are NLP candidates,
never validated clinical findings.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.limiter import limiter
from app.services.openmed import adapter
from app.services.openmed.schemas import (
    AnalyzeResponse,
    ClinicalTextInput,
    DeidentifyResponse,
    HealthResponse,
    PIIExtractResponse,
    SourceType,
)

router = APIRouter(prefix="/api/v1/clinical-text", tags=["clinical-text"])


class _TextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=200_000)
    source_type: SourceType = "free_text"
    locale: str = "en"

    def to_input(self) -> ClinicalTextInput:
        return ClinicalTextInput(
            text=self.text, source_type=self.source_type, locale=self.locale
        )


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
) -> AnalyzeResponse:
    require_minimum_role(actor, "clinician")
    return adapter.analyze(payload.to_input())


@router.post("/extract-pii", response_model=PIIExtractResponse)
@limiter.limit("30/minute")
def clinical_text_extract_pii(
    request: Request,
    payload: _TextRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PIIExtractResponse:
    require_minimum_role(actor, "clinician")
    return adapter.extract_pii(payload.to_input())


@router.post("/deidentify", response_model=DeidentifyResponse)
@limiter.limit("30/minute")
def clinical_text_deidentify(
    request: Request,
    payload: _TextRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DeidentifyResponse:
    require_minimum_role(actor, "clinician")
    return adapter.deidentify(payload.to_input())


__all__ = ["router"]
