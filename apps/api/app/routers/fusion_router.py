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
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AiSummaryAudit
from app.services import fusion_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/fusion", tags=["fusion"])


# ── POST /recommend/{patient_id} ────────────────────────────────────────────


@router.post("/recommend/{patient_id}")
async def recommend_fusion(
    patient_id: str,
    llm_narrative: bool = Query(default=True, description="Rewrite summary via LLM when available."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return a ``FusionRecommendation`` for ``patient_id``.

    Requires ``clinician`` role. Writes an ``AiSummaryAudit`` row with
    a preview of the produced summary for traceability.
    """
    require_minimum_role(actor, "clinician")

    if not patient_id:
        raise ApiServiceError(
            code="patient_id_required",
            message="patient_id is required.",
            status_code=422,
        )

    try:
        envelope = await fusion_service.recommend_fusion_for_patient(
            patient_id,
            db,
            llm_narrative=bool(llm_narrative),
        )
    except Exception as exc:
        log.exception("Fusion recommendation failed for patient %s", patient_id)
        raise ApiServiceError(
            code="fusion_failed",
            message=f"Fusion recommendation failed: {exc}",
            status_code=500,
        )

    _audit_fusion(db, actor, patient_id, envelope)
    return envelope


def _audit_fusion(
    db: Session,
    actor: AuthenticatedActor,
    patient_id: str,
    envelope: dict[str, Any],
) -> None:
    """Write an ``AiSummaryAudit`` row for a fusion recommendation."""
    try:
        preview = str(envelope.get("summary") or "")[:200]
        sources = {
            "modalities_used": envelope.get("modalities_used") or [],
            "qeeg_analysis_id": envelope.get("qeeg_analysis_id"),
            "mri_analysis_id": envelope.get("mri_analysis_id"),
            "n_recommendations": len(envelope.get("recommendations") or []),
        }
        audit = AiSummaryAudit(
            patient_id=patient_id,
            actor_id=actor.actor_id,
            actor_role=actor.role,
            summary_type="fusion_recommendation",
            prompt_hash=None,
            response_preview=preview,
            sources_used=json.dumps(sources),
            model_used="deepsynaps_fusion",
        )
        db.add(audit)
        db.commit()
    except Exception as exc:  # pragma: no cover - audit never blocks
        log.warning("Failed to write fusion audit row: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
