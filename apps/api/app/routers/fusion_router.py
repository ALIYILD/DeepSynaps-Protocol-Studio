"""Fusion router — CONTRACT_V3 §1 ``FusionRecommendation`` endpoint.

Exposes ``POST /api/v1/fusion/recommend/{patient_id}`` which loads the
most-recent qEEG + MRI analyses for the patient, fuses them via
:mod:`app.services.fusion_service`, writes an audit row, and returns
the envelope.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
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
    limitations: list[str] = Field(default_factory=list)
    missing_modalities: list[str] = Field(default_factory=list)
    provenance: dict = Field(default_factory=dict)


@router.post("/recommend/{patient_id}", response_model=FusionRecommendationResponse)
async def recommend_fusion(
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
