from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.persistence.models import MriAnalysis, QEEGAnalysis

logger = logging.getLogger(__name__)


def _load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("Fusion service could not decode persisted JSON payload")
        return None


def _qeeg_payload(row: QEEGAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    flagged = _load_json(getattr(row, "flagged_conditions", None))
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "analysis_status": row.analysis_status,
        "band_powers": _load_json(row.band_powers_json),
        "advanced_analyses": _load_json(row.advanced_analyses_json),
        "brain_age": _load_json(getattr(row, "brain_age_json", None)),
        "risk_scores": _load_json(getattr(row, "risk_scores_json", None)),
        "protocol_recommendation": _load_json(getattr(row, "protocol_recommendation_json", None)),
        "flagged_conditions": flagged if isinstance(flagged, list) else [],
        "similar_cases": _load_json(getattr(row, "similar_cases_json", None)),
        "quality_metrics": _load_json(getattr(row, "quality_metrics_json", None)),
        "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _mri_payload(row: MriAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "analysis_id": row.analysis_id,
        "patient_id": row.patient_id,
        "state": row.state,
        "modalities_present": _load_json(row.modalities_present_json),
        "structural": _load_json(row.structural_json),
        "functional": _load_json(row.functional_json),
        "diffusion": _load_json(row.diffusion_json),
        "stim_targets": _load_json(row.stim_targets_json),
        "qc": _load_json(row.qc_json),
        "condition": row.condition,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _latest_qeeg_analysis(db: Session, patient_id: str) -> QEEGAnalysis | None:
    return (
        db.query(QEEGAnalysis)
        .filter(
            QEEGAnalysis.patient_id == patient_id,
            QEEGAnalysis.analysis_status == "completed",
        )
        .order_by(QEEGAnalysis.analyzed_at.desc(), QEEGAnalysis.created_at.desc())
        .first()
    )


def _latest_mri_analysis(db: Session, patient_id: str) -> MriAnalysis | None:
    return (
        db.query(MriAnalysis)
        .filter(
            MriAnalysis.patient_id == patient_id,
            MriAnalysis.state == "SUCCESS",
        )
        .order_by(MriAnalysis.created_at.desc())
        .first()
    )


def build_fusion_recommendation(db: Session, patient_id: str) -> dict[str, Any]:
    try:
        from deepsynaps_qeeg.ai.fusion import synthesize_fusion_recommendation
        _has_fusion = True
    except ImportError:
        _has_fusion = False

    qeeg_row = _latest_qeeg_analysis(db, patient_id)
    mri_row = _latest_mri_analysis(db, patient_id)

    if not _has_fusion:
        return {
            "patient_id": patient_id,
            "recommendation": None,
            "summary": "Fusion AI module not available in this environment.",
            "confidence": None,
            "qeeg_analysis_id": qeeg_row.id if qeeg_row else None,
            "mri_analysis_id": mri_row.analysis_id if mri_row else None,
            "error": "deepsynaps_qeeg.ai.fusion not installed",
        }

    return synthesize_fusion_recommendation(
        patient_id=patient_id,
        qeeg_analysis_id=qeeg_row.id if qeeg_row else None,
        qeeg=_qeeg_payload(qeeg_row),
        mri_analysis_id=mri_row.analysis_id if mri_row else None,
        mri=_mri_payload(mri_row),
    )
