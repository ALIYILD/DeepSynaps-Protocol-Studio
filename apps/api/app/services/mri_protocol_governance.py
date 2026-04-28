"""MRI Target Planning Governance.

Evaluates each stimulation target for safety and suitability.
Follows the qEEG Protocol Fit pattern for consistency.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.persistence.models import MriAnalysis, MriTargetPlan, Patient

_log = logging.getLogger(__name__)


def compute_target_plan_governance(
    analysis: MriAnalysis,
    patient: Patient,
    db: Session,
) -> list[MriTargetPlan]:
    """Compute and persist target-plan governance records for each stim target.

    Parameters
    ----------
    analysis: MriAnalysis
    patient: Patient
    db: Session

    Returns
    -------
    list[MriTargetPlan]
        The persisted plan rows (caller must commit).
    """
    targets = _json_loads(analysis.stim_targets_json) or []
    structural = _json_loads(analysis.structural_json) or {}
    atlas_meta = _json_loads(analysis.atlas_metadata_json) or {}
    registration = structural.get("registration", {})
    qc = _json_loads(analysis.qc_json) or {}

    plans: list[MriTargetPlan] = []
    for idx, target in enumerate(targets):
        if not isinstance(target, dict):
            continue

        label = target.get("anatomical_label", "Unknown")
        modality = target.get("modality", "unknown")

        # Registration confidence from structural QC
        reg_conf = registration.get("confidence", "moderate")
        uncertainty = registration.get("uncertainty_mm")
        if uncertainty is None:
            uncertainty = _estimate_uncertainty(reg_conf, qc)

        # Contraindications check
        contras: list[str] = []
        if qc.get("motion_score", 0) > 0.5:
            contras.append("Motion artifact may degrade target accuracy")
        if qc.get("registration_score", 1.0) < 0.7:
            contras.append("Poor registration confidence")
        if patient.implant_risk == "red":
            contras.append("Patient has implant risk flag — verify MRI safety screening")

        # Evidence grade
        evidence_grade = target.get("evidence_grade", "EV-C")

        # Off-label flag
        off_label = False
        patient_condition = (patient.primary_condition or analysis.condition or "").lower()
        supported_conditions = [c.lower() for c in target.get("supported_conditions", [])]
        if supported_conditions and patient_condition not in supported_conditions:
            off_label = True

        plan = MriTargetPlan(
            analysis_id=analysis.analysis_id,
            target_index=idx,
            anatomical_label=label,
            modality_compatibility=json.dumps([modality]) if modality else None,
            atlas_version=atlas_meta.get("atlas_version", "unknown"),
            registration_confidence=reg_conf,
            coordinate_uncertainty_mm=uncertainty,
            contraindications=json.dumps(contras) if contras else None,
            evidence_grade=evidence_grade,
            off_label_flag=off_label,
            match_rationale=_build_match_rationale(label, target, patient),
            caution_rationale=_build_caution_rationale(label, contras, off_label),
            required_checks=json.dumps(_build_required_checks(label, contras, off_label)),
        )
        db.add(plan)
        plans.append(plan)

    return plans


def _estimate_uncertainty(reg_conf: str, qc: dict) -> Optional[float]:
    """Estimate coordinate uncertainty in mm from registration confidence."""
    mapping = {
        "high": 1.0,
        "moderate": 2.5,
        "low": 5.0,
    }
    base = mapping.get(reg_conf, 3.0)
    if qc.get("motion_score", 0) > 0.5:
        base += 2.0
    return base


def _build_match_rationale(label: str, target: dict, patient: Patient) -> str:
    rationale = f"Candidate target for clinician review: {label}. "
    if target.get("mni_coordinates"):
        coords = target["mni_coordinates"]
        rationale += f"MNI coordinates ({coords.get('x', '?')}, {coords.get('y', '?')}, {coords.get('z', '?')}). "
    rationale += (
        "This target was derived from structural MRI registration against a standard atlas. "
        "Anatomical accuracy depends on image quality and registration fidelity."
    )
    return rationale


def _build_caution_rationale(label: str, contras: list[str], off_label: bool) -> str:
    parts: list[str] = []
    if contras:
        parts.append(f"Cautions for {label}: {'; '.join(contras)}.")
    if off_label:
        parts.append("Target application may be off-label for this patient's condition.")
    parts.append("All stimulation targets require clinician verification before use.")
    return " ".join(parts)


def _build_required_checks(label: str, contras: list[str], off_label: bool) -> list[str]:
    checks = [f"Verify {label} anatomical accuracy on native scan"]
    if contras:
        checks.append("Review QC warnings before proceeding")
    if off_label:
        checks.append("Confirm off-label use is appropriate")
    checks.append("Confirm patient has no contraindications for planned modality")
    return checks


def _json_loads(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
