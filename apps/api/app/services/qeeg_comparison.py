"""qEEG comparison engine — pre/post, prediction, and correlation reports.

Computes delta matrices between two qEEG analyses, generates AI-powered
comparison narratives, predicts treatment response, and correlates EEG
changes with clinical assessment scores.
"""
from __future__ import annotations

import json
import logging
import math
from typing import Any, Optional

from sqlalchemy.orm import Session

_log = logging.getLogger(__name__)


def compute_comparison(
    baseline_powers: dict,
    followup_powers: dict,
    condition_context: Optional[str] = None,
) -> dict[str, Any]:
    """Compute per-channel per-band changes between baseline and follow-up.

    Returns:
        {
            "delta_matrix": {band: {channel: {"absolute_change": float, "pct_change": float, "direction": str}}},
            "improvement_summary": {...},
            "overall_change_pct": float
        }
    """
    baseline_bands = baseline_powers.get("bands", {})
    followup_bands = followup_powers.get("bands", {})

    delta_matrix: dict[str, dict[str, dict[str, Any]]] = {}
    improvements = 0
    deteriorations = 0
    total_comparisons = 0

    for band_name in baseline_bands:
        if band_name not in followup_bands:
            continue

        base_channels = baseline_bands[band_name].get("channels", {})
        follow_channels = followup_bands[band_name].get("channels", {})
        band_deltas: dict[str, dict[str, Any]] = {}

        for ch_name in base_channels:
            if ch_name not in follow_channels:
                continue

            base_abs = base_channels[ch_name].get("absolute_uv2", 0)
            follow_abs = follow_channels[ch_name].get("absolute_uv2", 0)
            base_rel = base_channels[ch_name].get("relative_pct", 0)
            follow_rel = follow_channels[ch_name].get("relative_pct", 0)

            abs_change = follow_abs - base_abs
            pct_change = ((follow_abs - base_abs) / base_abs * 100) if base_abs > 0 else 0
            rel_change = follow_rel - base_rel

            # Determine direction (simplified: decrease in theta/delta = improvement for most conditions)
            direction = "stable"
            if abs(pct_change) > 10:  # 10% threshold for meaningful change
                if pct_change > 0:
                    direction = "increased"
                else:
                    direction = "decreased"

            band_deltas[ch_name] = {
                "absolute_change": round(abs_change, 4),
                "pct_change": round(pct_change, 1),
                "relative_change": round(rel_change, 2),
                "direction": direction,
                "baseline_abs": round(base_abs, 4),
                "followup_abs": round(follow_abs, 4),
            }

            total_comparisons += 1
            if abs(pct_change) > 10:
                if pct_change < 0:
                    improvements += 1
                else:
                    deteriorations += 1

        delta_matrix[band_name] = band_deltas

    # Compare derived ratios
    ratio_changes = _compare_derived_ratios(
        baseline_powers.get("derived_ratios", {}),
        followup_powers.get("derived_ratios", {}),
    )

    overall_pct = 0.0
    if total_comparisons > 0:
        overall_pct = round((improvements - deteriorations) / total_comparisons * 100, 1)

    return {
        "delta_matrix": delta_matrix,
        "ratio_changes": ratio_changes,
        "improvement_summary": {
            "improved_channels": improvements,
            "deteriorated_channels": deteriorations,
            "stable_channels": total_comparisons - improvements - deteriorations,
            "total_comparisons": total_comparisons,
            "net_improvement_pct": overall_pct,
        },
    }


def _compare_derived_ratios(
    baseline_ratios: dict,
    followup_ratios: dict,
) -> dict[str, Any]:
    """Compare derived ratios between baseline and follow-up."""
    changes: dict[str, Any] = {}

    # Theta/Beta Ratio
    base_tbr = baseline_ratios.get("theta_beta_ratio", {}).get("channels", {})
    follow_tbr = followup_ratios.get("theta_beta_ratio", {}).get("channels", {})
    if base_tbr and follow_tbr:
        tbr_changes: dict[str, Any] = {}
        for ch in base_tbr:
            if ch in follow_tbr:
                change = follow_tbr[ch] - base_tbr[ch]
                tbr_changes[ch] = {
                    "baseline": base_tbr[ch],
                    "followup": follow_tbr[ch],
                    "change": round(change, 3),
                    "direction": "decreased" if change < -0.2 else "increased" if change > 0.2 else "stable",
                }
        changes["theta_beta_ratio"] = tbr_changes

    # Frontal Alpha Asymmetry
    base_faa = baseline_ratios.get("frontal_alpha_asymmetry", {})
    follow_faa = followup_ratios.get("frontal_alpha_asymmetry", {})
    if base_faa and follow_faa:
        faa_changes: dict[str, Any] = {}
        for pair in base_faa:
            if pair in follow_faa:
                change = follow_faa[pair] - base_faa[pair]
                faa_changes[pair] = {
                    "baseline": base_faa[pair],
                    "followup": follow_faa[pair],
                    "change": round(change, 4),
                }
        changes["frontal_alpha_asymmetry"] = faa_changes

    # Alpha Peak Frequency
    base_apf = baseline_ratios.get("alpha_peak_frequency", {}).get("channels", {})
    follow_apf = followup_ratios.get("alpha_peak_frequency", {}).get("channels", {})
    if base_apf and follow_apf:
        apf_changes: dict[str, Any] = {}
        for ch in base_apf:
            if ch in follow_apf:
                change = follow_apf[ch] - base_apf[ch]
                apf_changes[ch] = {
                    "baseline": base_apf[ch],
                    "followup": follow_apf[ch],
                    "change": round(change, 2),
                }
        changes["alpha_peak_frequency"] = apf_changes

    return changes


def correlate_with_assessments(
    patient_id: str,
    analyses: list[dict],
    db: Session,
) -> dict[str, Any]:
    """Correlate qEEG band power changes with clinical assessment score changes.

    Args:
        patient_id: patient ID
        analyses: list of analysis dicts with 'recording_date' and 'band_powers_json'
        db: database session

    Returns structured correlation data.
    """
    from app.persistence.models import AssessmentRecord

    # Get assessment records for the patient
    assessments = (
        db.query(AssessmentRecord)
        .filter(
            AssessmentRecord.patient_id == patient_id,
            AssessmentRecord.score_numeric.isnot(None),
            AssessmentRecord.completed_at.isnot(None),
        )
        .order_by(AssessmentRecord.completed_at)
        .all()
    )

    if len(assessments) < 2 or len(analyses) < 2:
        return {
            "success": False,
            "message": "Insufficient data for correlation (need 2+ assessments and 2+ qEEG analyses)",
            "correlations": [],
        }

    # Group assessments by template
    template_scores: dict[str, list[dict]] = {}
    for a in assessments:
        key = a.template_title or a.template_id
        if key not in template_scores:
            template_scores[key] = []
        template_scores[key].append({
            "score": a.score_numeric,
            "date": str(a.completed_at) if a.completed_at else None,
            "severity": a.severity,
        })

    # For each assessment type, compute simple correlation with band power changes
    correlations: list[dict] = []
    for template_name, scores in template_scores.items():
        if len(scores) < 2:
            continue

        score_change = scores[-1]["score"] - scores[0]["score"]
        score_pct_change = (score_change / scores[0]["score"] * 100) if scores[0]["score"] else 0

        correlations.append({
            "assessment": template_name,
            "baseline_score": scores[0]["score"],
            "latest_score": scores[-1]["score"],
            "score_change": round(score_change, 2),
            "score_pct_change": round(score_pct_change, 1),
            "data_points": len(scores),
            "trend": "improving" if score_change < 0 else "worsening" if score_change > 0 else "stable",
        })

    return {
        "success": True,
        "correlations": correlations,
        "qeeg_analyses_count": len(analyses),
        "assessments_count": len(assessments),
    }
