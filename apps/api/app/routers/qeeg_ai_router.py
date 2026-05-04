"""qEEG AI co-pilot overlay — Phase 5.

Ten public endpoints. Each wraps one ``app.services.raw_ai`` function and returns
the canonical ``{result, reasoning, features}`` envelope so the UI can show
"why this suggestion" beside every AI output. All require ``clinician``
role.

The AI proposal endpoints **also** write a ``CleaningDecision`` row at
proposal time (handled inside :mod:`app.services.raw_ai`) — this gives a
complete audit trail of "the AI said X at time T" even if the clinician
never accepts/rejects.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
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
from app.persistence.models import QEEGAnalysis
from app.repositories.patients import resolve_patient_clinic_id
from app.services import raw_ai

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qeeg-ai", tags=["qeeg-ai"])


# ── Response envelope ───────────────────────────────────────────────────────


class AIEnvelope(BaseModel):
    """Canonical Phase-5 response shape for every AI endpoint."""

    analysis_id: str
    result: Any = None
    reasoning: str = ""
    features: dict[str, Any] = Field(default_factory=dict)


class ClassifySegmentRequest(BaseModel):
    start_sec: float = Field(ge=0.0)
    end_sec: float = Field(ge=0.0)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _ensure_analysis(
    analysis_id: str, db: Session, actor: AuthenticatedActor | None = None
) -> QEEGAnalysis:
    """Load a qEEG analysis, enforcing the cross-clinic ownership gate.

    The optional ``actor`` parameter activates the same security gate
    used by qeeg_raw_router._load_analysis: patient's owning clinic is
    resolved and ``require_patient_owner`` blocks cross-clinic reads.
    Cross-clinic 403/forbidden is converted to 404 to avoid leaking row
    existence to probing actors.
    """
    row = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Analysis not found.", status_code=404
        )
    if actor is not None and row.patient_id:
        exists, clinic_id = resolve_patient_clinic_id(db, row.patient_id)
        if exists:
            try:
                require_patient_owner(actor, clinic_id)
            except ApiServiceError as exc:
                if exc.code in {"cross_clinic_access_denied", "forbidden"}:
                    raise ApiServiceError(
                        code="not_found",
                        message="Analysis not found.",
                        status_code=404,
                    ) from exc
                raise
    return row


def _envelope(analysis_id: str, payload: dict[str, Any]) -> AIEnvelope:
    return AIEnvelope(
        analysis_id=analysis_id,
        result=payload.get("result"),
        reasoning=str(payload.get("reasoning") or ""),
        features=payload.get("features") or {},
    )


# ── 1. quality_score ────────────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/quality_score",
    response_model=AIEnvelope,
    summary="Quality scorecard with subscores + LLM narrative.",
)
def post_quality_score(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(analysis_id, raw_ai.quality_score(analysis_id, db))


# ── 2. auto_clean_propose ───────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/auto_clean_propose",
    response_model=AIEnvelope,
    summary="Merged auto-clean proposal — drop into /auto-scan/decide unchanged.",
)
def post_auto_clean_propose(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(analysis_id, raw_ai.auto_clean_propose(analysis_id, db))


# ── 3. explain_bad_channel ──────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/explain_bad_channel/{channel}",
    response_model=AIEnvelope,
    summary="Plain-language explanation of why a channel was flagged.",
)
def post_explain_bad_channel(
    analysis_id: str,
    channel: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(
        analysis_id, raw_ai.explain_bad_channel(analysis_id, db, channel)
    )


# ── 4. classify_components ──────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/classify_components",
    response_model=AIEnvelope,
    summary="Per-IC label + confidence + short explanation.",
)
def post_classify_components(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(analysis_id, raw_ai.classify_components(analysis_id, db))


# ── 5. classify_segment ─────────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/classify_segment",
    response_model=AIEnvelope,
    summary="Predict the dominant artifact reason in a [start, end) segment.",
)
def post_classify_segment(
    analysis_id: str,
    body: ClassifySegmentRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    if body.end_sec <= body.start_sec:
        raise ApiServiceError(
            code="invalid_segment",
            message="end_sec must be greater than start_sec.",
            status_code=422,
        )
    return _envelope(
        analysis_id,
        raw_ai.classify_segment(
            analysis_id, db, start_sec=body.start_sec, end_sec=body.end_sec
        ),
    )


# ── 6. recommend_filters ────────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/recommend_filters",
    response_model=AIEnvelope,
    summary="Suggest LFF / HFF / notch filter settings.",
)
def post_recommend_filters(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(analysis_id, raw_ai.recommend_filters(analysis_id, db))


# ── 7. recommend_montage ────────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/recommend_montage",
    response_model=AIEnvelope,
    summary="Suggest a montage based on channel count + eyes condition.",
)
def post_recommend_montage(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(analysis_id, raw_ai.recommend_montage(analysis_id, db))


# ── 8. segment_eo_ec ────────────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/segment_eo_ec",
    response_model=AIEnvelope,
    summary="Approximate EO/EC fragments.",
)
def post_segment_eo_ec(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(analysis_id, raw_ai.segment_eo_ec(analysis_id, db))


# ── 9. narrate ──────────────────────────────────────────────────────────────


@router.post(
    "/{analysis_id}/narrate",
    response_model=AIEnvelope,
    summary="Free-text recording summary.",
)
def post_narrate(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(analysis_id, raw_ai.narrate(analysis_id, db))


# ── 10. copilot_assist_bundle ───────────────────────────────────────────────


@router.post(
    "/{analysis_id}/copilot_assist_bundle",
    response_model=AIEnvelope,
    summary="Aggregated QC assist: segments, channel rank, readiness, actions.",
)
def post_copilot_assist_bundle(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AIEnvelope:
    require_minimum_role(actor, "clinician")
    _ensure_analysis(analysis_id, db, actor)
    return _envelope(
        analysis_id, raw_ai.copilot_assist_bundle(analysis_id, db)
    )


__all__ = ["router"]
