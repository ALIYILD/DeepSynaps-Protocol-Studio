"""qEEG + MRI fusion router.

Read-only heuristic endpoint for combining the latest persisted qEEG and MRI
analyses for a patient. This intentionally ships as a thin orchestration layer
over existing data rather than a new model or pipeline stage.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.patients import resolve_patient_clinic_id
from app.services.fusion_service import build_fusion_recommendation

router = APIRouter(prefix="/api/v1/fusion", tags=["fusion"])


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


@router.post("/recommend/{patient_id}", response_model=FusionRecommendationResponse)
def recommend_fusion(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FusionRecommendationResponse:
    require_minimum_role(actor, "clinician")
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)
    payload = build_fusion_recommendation(db, patient_id)
    payload["partial"] = not (payload.get("qeeg_analysis_id") and payload.get("mri_analysis_id"))
    return FusionRecommendationResponse(**payload)
