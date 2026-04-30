"""MRI Registration QA engine.

Evaluates native-to-template registration quality, segmentation fidelity,
and target coordinate reliability. Blocks target finalisation when confidence
is insufficient.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.persistence.models import MriAnalysis

_log = logging.getLogger(__name__)


def compute_registration_qa(analysis: MriAnalysis) -> dict[str, Any]:
    """Return a comprehensive registration QA panel."""
    structural = _json_loads(analysis.structural_json) or {}
    reg = structural.get("registration") or {}
    qc = _json_loads(analysis.qc_json) or {}
    targets = _json_loads(analysis.stim_targets_json) or []

    confidence = reg.get("confidence", "unknown")
    uncertainty_mm = reg.get("uncertainty_mm")
    status = reg.get("status", "unverified")
    template = reg.get("template_space", "MNI152")

    # Segmentation quality
    seg_failed = qc.get("segmentation_failed_regions") or []
    seg_quality = "good" if not seg_failed else "degraded"

    # Atlas overlap confidence
    atlas_overlap = reg.get("atlas_overlap_dice", None)
    if atlas_overlap is not None:
        atlas_confidence = "high" if float(atlas_overlap) >= 0.85 else "moderate" if float(atlas_overlap) >= 0.70 else "low"
    else:
        atlas_confidence = "unknown"

    # Target drift: compare patient-native vs MNI coordinates
    drift_warnings: list[dict] = []
    for t in targets:
        if not isinstance(t, dict):
            continue
        mni = t.get("mni_xyz")
        native = t.get("patient_xyz")
        if mni and native and len(mni) == 3 and len(native) == 3:
            dx = float(mni[0]) - float(native[0])
            dy = float(mni[1]) - float(native[1])
            dz = float(mni[2]) - float(native[2])
            drift_mm = (dx**2 + dy**2 + dz**2) ** 0.5
            if drift_mm > 10:
                drift_warnings.append({
                    "target_id": t.get("target_id", "unknown"),
                    "drift_mm": round(drift_mm, 1),
                    "severity": "high",
                })

    # Finalisation gate
    can_finalise = (
        status == "ok"
        and confidence in ("high", "moderate")
        and atlas_confidence in ("high", "moderate")
        and not drift_warnings
        and seg_quality == "good"
    )
    block_reasons: list[str] = []
    if status != "ok":
        block_reasons.append("Registration status is not OK")
    if confidence == "low":
        block_reasons.append("Registration confidence is low")
    if atlas_confidence == "low":
        block_reasons.append("Atlas overlap confidence is low")
    if drift_warnings:
        block_reasons.append("Target drift detected")
    if seg_quality != "good":
        block_reasons.append("Segmentation quality is degraded")

    result = {
        "registration_status": status,
        "template_space": template,
        "registration_confidence": confidence,
        "coordinate_uncertainty_mm": uncertainty_mm,
        "segmentation_quality": seg_quality,
        "segmentation_failed_regions": seg_failed,
        "atlas_overlap_dice": atlas_overlap,
        "atlas_overlap_confidence": atlas_confidence,
        "target_drift_warnings": drift_warnings,
        "target_finalisation_allowed": can_finalise,
        "target_finalisation_blocked_reasons": block_reasons,
        "disclaimer": "Decision-support only. Registration metrics are heuristic. Clinician verification required.",
    }

    _log.info(
        "mri_registration_qa_computed",
        extra={
            "event": "mri_registration_qa_computed",
            "analysis_id": analysis.analysis_id,
            "registration_status": status,
            "registration_confidence": confidence,
            "atlas_confidence": atlas_confidence,
            "target_finalisation_allowed": can_finalise,
            "drift_warning_count": len(drift_warnings),
        },
    )

    return result


def _json_loads(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
