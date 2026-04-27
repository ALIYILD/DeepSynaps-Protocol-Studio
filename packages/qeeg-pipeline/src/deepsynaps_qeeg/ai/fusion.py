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
            f"Review whether the qEEG-informed {primary} strategy is concordant with MRI-guided targeting at {region}."
        )
    elif isinstance(qeeg_protocol, dict):
        primary = qeeg_protocol.get("primary_modality") or "qEEG-guided protocol"
        target = qeeg_protocol.get("target_region")
        if target:
            recommendations.append(f"Clinician review item: qEEG-guided {primary} approach targeting {target}.")
        else:
            recommendations.append(f"Clinician review item: qEEG-guided {primary} approach with target selection verification.")
    elif isinstance(mri_targets, list) and mri_targets:
        target = mri_targets[0] if isinstance(mri_targets[0], dict) else {}
        region = target.get("region_name") or target.get("region_code") or "MRI-defined target"
        modality = target.get("modality") or "neuromodulation"
        recommendations.append(f"Clinician review item: MRI targeting may inform {modality} planning around {region}.")

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


def _agreement(qeeg_signals: list[str], mri_signals: list[str]) -> dict[str, Any]:
    """Return a transparent modality agreement summary."""
    if not qeeg_signals and not mri_signals:
        status = "insufficient_data"
    elif qeeg_signals and mri_signals:
        status = "multimodal_available"
    else:
        status = "single_modality"
    return {
        "status": status,
        "qeeg_signal_count": len(qeeg_signals),
        "mri_signal_count": len(mri_signals),
        "missing_modalities": [
            name for name, signals in (("qEEG", qeeg_signals), ("MRI", mri_signals)) if not signals
        ],
        "note": (
            "This heuristic fusion checks availability and surfaced markers; it does not prove mechanistic agreement."
        ),
    }


def synthesize_fusion_recommendation(
    *,
    patient_id: str,
    qeeg_analysis_id: str | None,
    qeeg: dict[str, Any] | None,
    mri_analysis_id: str | None,
    mri: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build a simple, additive fusion summary from persisted modality payloads."""
    qeeg_signals = _pick_top_qeeg_signals(qeeg)
    mri_signals = _pick_top_mri_signals(mri)
    recommendations = _build_recommendations(patient_id, qeeg, mri)

    modality_count = int(qeeg_analysis_id is not None) + int(mri_analysis_id is not None)
    evidence_points = len(qeeg_signals) + len(mri_signals)
    confidence = _clamp(0.15 + (0.25 * modality_count) + (0.08 * min(evidence_points, 4)))
    if modality_count < 2:
        confidence = min(confidence, 0.55)

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
        "confidence_detail": {
            "basis": "modality availability plus count of surfaced qEEG/MRI signals",
            "modality_count": modality_count,
            "evidence_points": evidence_points,
            "calibrated": False,
            "limitations": [
                "Heuristic fusion is not a validated predictive model.",
                "Missing or low-quality modalities lower confidence.",
            ],
        },
        "modality_agreement": _agreement(qeeg_signals, mri_signals),
        "missing_modalities": [
            name for name, signals in (("qEEG", qeeg_signals), ("MRI", mri_signals)) if not signals
        ],
        "limitations": [
            "Fusion is based on persisted summary fields rather than a validated multimodal model.",
            "Low-quality, stale, or missing modalities reduce interpretability and confidence.",
        ],
        "provenance": {
            "method": "transparent heuristic late fusion",
            "inputs": {
                "qeeg_analysis_id": qeeg_analysis_id,
                "mri_analysis_id": mri_analysis_id,
            },
        },
        "explainability": {
            "qeeg_signals": qeeg_signals,
            "mri_signals": mri_signals,
            "method": "transparent heuristic late fusion",
        },
        "safety_statement": (
            "Decision support only. Fusion output is a clinician review aid, not an autonomous care decision."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
=======
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
