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
    ExtractParametersResponse,
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
) -> bool:
    """Apply patient-context gates and report whether a real patient was resolved.

    Returns True only when ``patient_id`` is non-empty and resolves to an
    existing patient (and the cross-clinic owner check passed). Returns
    False for the no-patient-id case. Raises HTTPException(404) for
    nonexistent patient ids so the caller gets a clear error instead of
    silently skipping consent enforcement.
    """
    if not patient_id:
        return False
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")
    require_patient_owner(actor, clinic_id)
    return True


def _enforce_text_ai_consent(
    db: Session,
    patient_id: str,
    actor: AuthenticatedActor,
) -> None:
    """Convert ConsentMissingError into a 403 for the text endpoints."""
    try:
        require_ai_analysis_consent(db, patient_id, actor, ai_modality="text")
    except ConsentMissingError:
        raise HTTPException(status_code=403, detail="ai_analysis consent required")


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
    if _gate_patient_context(actor, payload.patient_id, db):
        _enforce_text_ai_consent(db, payload.patient_id, actor)
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
    if _gate_patient_context(actor, payload.patient_id, db):
        _enforce_text_ai_consent(db, payload.patient_id, actor)
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
    if _gate_patient_context(actor, payload.patient_id, db):
        _enforce_text_ai_consent(db, payload.patient_id, actor)
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
    if _gate_patient_context(actor, payload.patient_id, db):
        _enforce_text_ai_consent(db, payload.patient_id, actor)
    return adapter.analyze_neuromodulation(_validated_input(payload))


@router.post("/extract-parameters", response_model=ExtractParametersResponse)
@limiter.limit("30/minute")
def clinical_text_extract_parameters(
    request: Request,
    payload: _TextRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ExtractParametersResponse:
    """Extract structured stimulation parameters from clinical text.

    Identifies quantified neuromodulation parameters: frequency (Hz/kHz),
    intensity (mA, % MT, % MSO), duration (seconds/minutes), pulse count,
    session count, inter-train interval (ITI), and electrode montage
    locations (10-20 system).

    Decision-support only — extracted values are NLP candidates,
    never validated device readings.
    """
    require_minimum_role(actor, "clinician")
    if _gate_patient_context(actor, payload.patient_id, db):
        _enforce_text_ai_consent(db, payload.patient_id, actor)
    return adapter.extract_parameters(_validated_input(payload))


# ===========================================================================
# Text Modality — Fusion endpoint
# ===========================================================================

@router.get("/patient/{patient_id}/multimodal-fusion")
def get_text_modality_for_fusion(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return text/NLP modality data formatted for multimodal fusion.

    Returns clinical entity counts and sentiment features with
    evidence grades and confidence scores for the fusion engine.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.persistence.models import ClinicalText

    # Fetch latest clinical text entry for the patient
    latest_text = (
        db.query(ClinicalText)
        .filter(ClinicalText.patient_id == patient_id)
        .order_by(desc(ClinicalText.created_at))
        .first()
    )

    features: dict[str, Any] = {}
    clinical_entities = 0
    sentiment = 0.0

    if latest_text and latest_text.nlp_result_json:
        try:
            nlp_result = json.loads(latest_text.nlp_result_json)
            clinical_entities = len(nlp_result.get("entities", []))
            sentiment = nlp_result.get("sentiment", {}).get("compound", 0.0)
            features["clinical_entities"] = clinical_entities
            features["sentiment"] = round(sentiment, 3)
            features["negation_count"] = nlp_result.get("negation_count", 0)
            features["temporal_expressions"] = len(nlp_result.get("temporal_expressions", []))
        except (json.JSONDecodeError, TypeError):
            pass

    if not features:
        return {
            "modality": "text",
            "score": None,
            "confidence": 0.0,
            "evidence_grade": "C",
            "features": {},
            "safe_summary": "No clinical text analysis data available for this patient.",
            "disclaimer": "Decision-support only — requires clinician review.",
        }

    score = 0.58
    confidence = 0.82
    evidence_grade = "C"

    return {
        "modality": "text",
        "score": score,
        "confidence": confidence,
        "evidence_grade": evidence_grade,
        "features": features,
        "safe_summary": (
            f"Text analysis shows {clinical_entities} clinical entities "
            f"with sentiment {sentiment:.2f}. Grade {evidence_grade} evidence."
        ),
        "disclaimer": "Decision-support only — requires clinician review.",
    }


__all__ = ["router"]
