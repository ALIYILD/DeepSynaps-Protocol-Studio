<<<<<<< HEAD
"""Lightweight multi-modal fusion helpers for qEEG + MRI summaries."""
=======
"""Lightweight multi-modal fusion helpers for qEEG + MRI summaries.

The functions in this module are intentionally dependency-light so the API can
assemble patient-level recommendations from persisted JSON rows even when the
heavier neuro stacks are unavailable.
"""
>>>>>>> aa28508 (Add V3 fusion timeline annotations and export flows)
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _pick_top_qeeg_signals(qeeg: dict[str, Any] | None) -> list[str]:
    if not isinstance(qeeg, dict):
        return []

    signals: list[str] = []
    risk_scores = qeeg.get("risk_scores") or {}
    if isinstance(risk_scores, dict):
        ranked: list[tuple[float, str]] = []
        for label, payload in risk_scores.items():
            if label == "disclaimer" or not isinstance(payload, dict):
                continue
            score = _safe_float(payload.get("score"))
            if score is None:
                continue
            ranked.append((score, str(label).replace("_", " ")))
        for score, label in sorted(ranked, reverse=True)[:2]:
            signals.append(f"qEEG pattern similarity highest for {label} ({score:.0%})")

    flagged = qeeg.get("flagged_conditions")
    if isinstance(flagged, list):
        for item in flagged[:2]:
            if item:
                signals.append(f"Flagged qEEG pattern: {item}")

    protocol = qeeg.get("protocol_recommendation") or {}
    if isinstance(protocol, dict):
        modality = protocol.get("primary_modality")
        target = protocol.get("target_region")
        if modality or target:
            parts = ["qEEG protocol suggestion"]
            if modality:
                parts.append(str(modality))
            if target:
                parts.append(f"targeting {target}")
            signals.append(" ".join(parts))

    brain_age = qeeg.get("brain_age") or {}
    if isinstance(brain_age, dict):
        gap = _safe_float(brain_age.get("gap_years"))
        if gap is not None:
            direction = "older" if gap >= 0 else "younger"
            signals.append(f"qEEG brain-age gap {abs(gap):.1f} years {direction} than chronological age")

    return signals[:3]


def _pick_top_mri_signals(mri: dict[str, Any] | None) -> list[str]:
    if not isinstance(mri, dict):
        return []

    signals: list[str] = []
    targets = mri.get("stim_targets")
    if isinstance(targets, list):
        for target in targets[:2]:
            if not isinstance(target, dict):
                continue
            region = target.get("region_name") or target.get("region_code") or "MRI target"
            modality = target.get("modality") or "neuromodulation"
            confidence = target.get("confidence")
            msg = f"MRI target available: {region} via {modality}"
            if confidence:
                msg += f" ({confidence} confidence)"
            signals.append(msg)

    functional = mri.get("functional") or {}
    anticorr = None
    if isinstance(functional, dict):
        anticorr = functional.get("sgACC_DLPFC_anticorrelation")
    if isinstance(anticorr, dict):
        z = _safe_float(anticorr.get("z"))
        if z is not None:
            signals.append(f"MRI functional marker sgACC-DLPFC anticorrelation z={z:.1f}")

    structural = mri.get("structural") or {}
    brain_age = structural.get("brain_age") if isinstance(structural, dict) else None
    if isinstance(brain_age, dict):
        gap = _safe_float(brain_age.get("brain_age_gap_years"))
        if gap is not None:
            direction = "older" if gap >= 0 else "younger"
            signals.append(f"MRI brain-age gap {abs(gap):.1f} years {direction} than chronological age")

    qc = mri.get("qc") or {}
    if isinstance(qc, dict) and qc.get("passed") is False:
        signals.append("MRI QC did not fully pass; interpret structural and targeting outputs cautiously")

    return signals[:3]


def _build_recommendations(
    patient_id: str,
    qeeg: dict[str, Any] | None,
    mri: dict[str, Any] | None,
) -> list[str]:
    recommendations: list[str] = []

    qeeg_protocol = (qeeg or {}).get("protocol_recommendation") if isinstance(qeeg, dict) else None
    mri_targets = (mri or {}).get("stim_targets") if isinstance(mri, dict) else None

    if isinstance(qeeg_protocol, dict) and isinstance(mri_targets, list) and mri_targets:
        primary = qeeg_protocol.get("primary_modality") or "protocol"
        target = mri_targets[0] if isinstance(mri_targets[0], dict) else {}
        region = target.get("region_name") or target.get("region_code") or "MRI-defined target"
        recommendations.append(
            f"Combine the qEEG-informed {primary} strategy with MRI-guided targeting at {region}."
        )
    elif isinstance(qeeg_protocol, dict):
        primary = qeeg_protocol.get("primary_modality") or "qEEG-guided protocol"
        target = qeeg_protocol.get("target_region")
        if target:
            recommendations.append(f"Proceed with the qEEG-guided {primary} approach targeting {target}.")
        else:
<<<<<<< HEAD
            recommendations.append(
                f"Proceed with the qEEG-guided {primary} approach and verify target selection clinically."
            )
=======
            recommendations.append(f"Proceed with the qEEG-guided {primary} approach and verify target selection clinically.")
>>>>>>> aa28508 (Add V3 fusion timeline annotations and export flows)
    elif isinstance(mri_targets, list) and mri_targets:
        target = mri_targets[0] if isinstance(mri_targets[0], dict) else {}
        region = target.get("region_name") or target.get("region_code") or "MRI-defined target"
        modality = target.get("modality") or "neuromodulation"
        recommendations.append(f"Use MRI targeting to guide {modality} planning around {region}.")

    qeeg_signals = _pick_top_qeeg_signals(qeeg)
    mri_signals = _pick_top_mri_signals(mri)

    if qeeg_signals and mri_signals:
        recommendations.append(
            f"For patient {patient_id}, review concordance between qEEG markers and MRI targeting before finalising the protocol."
        )
    elif qeeg_signals or mri_signals:
        recommendations.append(
            "One modality is still missing; treat this summary as a partial recommendation and update it when the second modality is available."
        )
    else:
        recommendations.append(
            "No strong persisted markers were available yet; repeat fusion after qEEG or MRI analyses complete."
        )

    return recommendations[:3]


def synthesize_fusion_recommendation(
    *,
    patient_id: str,
    qeeg_analysis_id: str | None,
    qeeg: dict[str, Any] | None,
    mri_analysis_id: str | None,
    mri: dict[str, Any] | None,
) -> dict[str, Any]:
<<<<<<< HEAD
=======
    """Build a simple, additive fusion summary from persisted modality payloads."""
>>>>>>> aa28508 (Add V3 fusion timeline annotations and export flows)
    qeeg_signals = _pick_top_qeeg_signals(qeeg)
    mri_signals = _pick_top_mri_signals(mri)
    recommendations = _build_recommendations(patient_id, qeeg, mri)

    modality_count = int(qeeg_analysis_id is not None) + int(mri_analysis_id is not None)
    evidence_points = len(qeeg_signals) + len(mri_signals)
    confidence = _clamp(0.15 + (0.25 * modality_count) + (0.08 * min(evidence_points, 4)))

    if modality_count == 0:
        summary = "No completed qEEG or MRI analyses are available for fusion yet."
    elif modality_count == 1:
        missing = "MRI" if qeeg_analysis_id else "qEEG"
        summary = f"Partial fusion available from one modality only. Add {missing} data to strengthen target confidence."
    else:
        summary = "Dual-modality fusion available. qEEG and MRI signals were combined into a single planning summary."

    bullets = (qeeg_signals + mri_signals)[:3]
    if bullets:
        summary += " Key findings: " + "; ".join(bullets) + "."

    return {
        "patient_id": patient_id,
        "qeeg_analysis_id": qeeg_analysis_id,
        "mri_analysis_id": mri_analysis_id,
        "recommendations": recommendations,
        "summary": summary,
        "confidence": round(confidence, 2),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
