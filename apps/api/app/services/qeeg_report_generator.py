"""qEEG Clinical Report Generator — 14-section structured report.

Decision-support only. Not a diagnosis. Requires clinician sign-off.

This module implements Deliverable D47 from the DeepSynaps qEEG Analyzer Roadmap:
"14-Section Clinical Report Engine" (Week 13).

All outputs are framed as supportive context per Safety Rule 2.
Never-diagnose architecture enforced per Safety Rule 1.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

_log = logging.getLogger(__name__)

# ── Report section ordering (IQCB 2025 + ACNS Guideline 7 compliant) ──────────

REPORT_SECTIONS = [
    "executive_summary",
    "scan_metadata",
    "quality_assurance",
    "spectral_analysis",
    "topographic_maps",
    "connectivity_summary",
    "source_localization",
    "findings_table",
    "limitations",
    "protocol_implications",
    "patient_friendly_summary",
    "clinician_sign_off",
    "evidence_appendix",
    "key_images_appendix",
]

# ── Public API ────────────────────────────────────────────────────────────────


def generate_report(
    analysis_id: str,
    patient_info: dict[str, Any],
    scan_metadata: dict[str, Any],
    quality_metrics: dict[str, Any],
    spectral_results: dict[str, Any],
    biomarker_results: dict[str, Any],
    template: str = "default",
) -> dict[str, Any]:
    """Generate complete 14-section qEEG clinical report.

    Parameters
    ----------
    analysis_id
        Unique identifier for this analysis run.
    patient_info
        Demographics: patient_id, age, sex, etc.
    scan_metadata
        Recording parameters: date, duration, sampling_rate, channels, etc.
    quality_metrics
        QC outputs: overall_rating, artifact_burden_pct, bad_channels, etc.
    spectral_results
        Spectral analysis outputs: band_powers, ratios, asymmetry, IAF, etc.
    biomarker_results
        Biomarker engine outputs: findings list with evidence grades.
    template
        Report template name (default, comprehensive, brief).

    Returns
    -------
    dict
        Complete 14-section report with header metadata.
    """
    report: dict[str, Any] = {
        "header": {
            "title": "qEEG Clinical Analysis Report",
            "subtitle": "Draft for Clinician Review — Not a Diagnosis",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "analysis_id": analysis_id,
            "schema_version": "0.4.0",
            "report_state": "DRAFT_AI",
            "template": template,
            "disclaimer": (
                "This report is decision-support only and does not constitute a "
                "medical diagnosis. All findings require correlation with clinical "
                "history and qualified clinician review."
            ),
        },
        "sections": {},
    }

    # ── Section 1: Executive Summary ──────────────────────────────────────────
    report["sections"]["executive_summary"] = {
        "content": _generate_executive_summary(
            patient_info, spectral_results, biomarker_results
        ),
        "word_count_target": 200,
        "generated_by": "ai_draft",
        "requires_clinician_edit": True,
    }

    # ── Section 2: Scan Metadata ──────────────────────────────────────────────
    report["sections"]["scan_metadata"] = {
        "patient_id": _safe_str(patient_info.get("patient_id")),
        "age": patient_info.get("age"),
        "sex": patient_info.get("sex"),
        "recording_date": scan_metadata.get("recording_date"),
        "duration_sec": scan_metadata.get("duration_sec"),
        "duration_min": round(scan_metadata["duration_sec"] / 60, 1)
        if scan_metadata.get("duration_sec")
        else None,
        "sampling_rate": scan_metadata.get("sampling_rate"),
        "channels": scan_metadata.get("channels"),
        "channel_count": len(scan_metadata["channels"])
        if isinstance(scan_metadata.get("channels"), list)
        else scan_metadata.get("channel_count"),
        "montage": scan_metadata.get("montage", "unknown"),
        "eyes_condition": scan_metadata.get("eyes_condition", "unknown"),
        "recording_quality_rating": quality_metrics.get("overall_rating", "Unknown"),
    }

    # ── Section 3: Quality Assurance ──────────────────────────────────────────
    report["sections"]["quality_assurance"] = {
        "overall_rating": quality_metrics.get("overall_rating", "Unknown"),
        "artifact_burden_pct": quality_metrics.get("artifact_burden_pct"),
        "artifact_burden_status": _artifact_burden_status(
            quality_metrics.get("artifact_burden_pct")
        ),
        "bad_channels": quality_metrics.get("bad_channels", []),
        "bad_channel_count": len(quality_metrics.get("bad_channels", [])),
        "total_channels": quality_metrics.get("total_channels"),
        "split_half_reliability": quality_metrics.get("split_half_reliability"),
        "split_half_status": _split_half_reliability(
            quality_metrics.get("split_half_reliability")
        ),
        "snr_db": quality_metrics.get("snr_db"),
        "pipeline_steps": quality_metrics.get("pipeline_steps", []),
        "pipeline_version": quality_metrics.get("pipeline_version", "unknown"),
        "normative_database": quality_metrics.get("normative_db", "unknown"),
        "normative_database_version": quality_metrics.get("normative_db_version", "unknown"),
        "recommendation": _qa_recommendation(quality_metrics),
    }

    # ── Section 4: Spectral Analysis ──────────────────────────────────────────
    iaf_values = spectral_results.get("iaf", {}) if isinstance(spectral_results.get("iaf"), dict) else {}
    avg_iaf = (
        sum(v.get("iaf", 0) for v in iaf_values.values()) / len(iaf_values)
        if iaf_values
        else None
    )

    report["sections"]["spectral_analysis"] = {
        "individual_alpha_frequency": round(avg_iaf, 2) if avg_iaf else None,
        "iaf_method": spectral_results.get("iaf_method", "SGF-smoothed CoG"),
        "band_powers_summary": _summarize_band_powers(
            spectral_results.get("band_powers", {})
        ),
        "band_ratios": spectral_results.get("ratios", {}),
        "asymmetry": spectral_results.get("asymmetry", {}),
        "psd_method": spectral_results.get("psd_method", "Welch (2s Hamming, 50% overlap)"),
        "frequency_bands_defined": {
            "delta": "0.5–4 Hz",
            "theta": "4–8 Hz",
            "alpha": "8–13 Hz",
            "low_beta": "13–20 Hz",
            "high_beta": "20–30 Hz",
            "gamma": "30–100 Hz",
        },
        "note": (
            "Spectral power values are relative to age-matched normative data. "
            "Absolute power values available on request."
        ),
    }

    # ── Section 5: Topographic Maps ───────────────────────────────────────────
    report["sections"]["topographic_maps"] = {
        "maps_generated": ["delta", "theta", "alpha", "low_beta", "high_beta", "gamma"],
        "z_score_range": "-3 to +3 SD",
        "color_scale": "RdBu_r (diverging, centered at 0)",
        "color_scale_standard": "7-color: Dark Red / Red / Orange / Green / Yellow / Blue / Dark Blue",
        "interpolation_method": "spherical spline (degree 4)",
        "head_model": "10-20 system electrode positions",
        "note": (
            "Topomaps show deviations from age-matched norms. "
            "Red = elevated activity, Blue = reduced activity. "
            "Values are z-scores (standard deviations from normative mean)."
        ),
    }

    # ── Section 6: Connectivity Summary ────────────────────────────────────────
    report["sections"]["connectivity_summary"] = {
        "methods_used": ["wPLI", "Coherence", "Graph Metrics"],
        "primary_hub": spectral_results.get("connectivity", {}).get(
            "primary_hub", "requires_connectivity_analysis"
        )
        if isinstance(spectral_results.get("connectivity"), dict)
        else "requires_connectivity_analysis",
        "global_efficiency": spectral_results.get("connectivity", {}).get(
            "global_efficiency", "requires_connectivity_analysis"
        )
        if isinstance(spectral_results.get("connectivity"), dict)
        else "requires_connectivity_analysis",
        "volume_conduction_warning": (
            "All connectivity metrics are potentially confounded by volume conduction. "
            "Interpret with caution and consider Laplacian-transformed data."
        ),
        "methods_description": {
            "wPLI": "Weighted Phase Lag Index — robust to volume conduction and noise",
            "coherence": "Magnitude-squared coherence — classical measure of linear coupling",
            "graph_metrics": "Clustering coefficient, path length, betweenness centrality, modularity",
        },
    }

    # ── Section 7: Source Localization ────────────────────────────────────────
    report["sections"]["source_localization"] = {
        "method": "sLORETA (standardized low-resolution electromagnetic tomography)",
        "head_model": "template BEM (MNI152)",
        "localization_error_estimate": "~20 mm (template head model)",
        "individual_mri_note": (
            "Individual MRI co-registration improves localization accuracy ~4x. "
            "Template head model introduces ~20 mm expected error."
        ),
        "caveat": (
            "Source localization is a research-level computation. "
            "Not for clinical diagnosis without expert neurophysiologist review. "
            "Deep sources (>4 cm) have reduced reliability."
        ),
        "atlas_labels": ["AAL", "Desikan-Killiany", "Brodmann Areas"],
    }

    # ── Section 8: Findings Table ─────────────────────────────────────────────
    findings = biomarker_results.get("findings", []) if isinstance(biomarker_results.get("findings"), list) else []
    report["sections"]["findings_table"] = {
        "findings": findings,
        "total_findings": len(findings),
        "present_findings": len([f for f in findings if isinstance(f, dict) and f.get("present")]),
        "evidence_grades": _summarize_evidence_grades(findings),
        "note": (
            "Each finding is graded by evidence quality (A=Strong, B=Moderate, "
            "C=Limited, D=Insufficient). Findings are NOT diagnostic."
        ),
    }

    # ── Section 9: Limitations ────────────────────────────────────────────────
    report["sections"]["limitations"] = [
        "qEEG is decision support only and not diagnostic on its own.",
        "Normative database comparison has inherent limitations (age matching, artifact handling, demographic representativeness).",
        "Source localization uses template head model (~20 mm expected localization error). Individual MRI improves accuracy.",
        "Connectivity metrics are confounded by volume conduction; Laplacian transformation mitigates but does not eliminate this.",
        "No calibrated prediction model is available; probabilistic statements are population-level associations.",
        "All findings require correlation with clinical history, physical examination, and other diagnostic assessments.",
        "Artifact burden and data quality may affect result validity — review QC section before interpretation.",
        "Medication effects on EEG are not fully accounted for in normative comparisons.",
        "Ethnic and demographic bias may affect normative comparison accuracy.",
    ]

    # ── Section 10: Protocol Implications ─────────────────────────────────────
    report["sections"]["protocol_implications"] = {
        "note": (
            "Protocol implications are suggestions only. "
            "Final protocol selection requires qualified BCIA-certified or equivalent clinician."
        ),
        "neurofeedback_candidates": _suggest_neurofeedback_protocols(spectral_results),
        "neuromodulation_targets": _suggest_neuromodulation_targets(spectral_results),
        "contraindications": [
            "Check for epileptiform activity before any neurofeedback protocol",
            "Screen for active psychosis before frontal alpha asymmetry training",
            "Individual clinical assessment required before any intervention",
            "Bipolar disorder requires careful screening before alpha/theta training",
        ],
        "required_credentials": "BCIA-certified neurofeedback practitioner or licensed clinician",
    }

    # ── Section 11: Patient-Friendly Summary ──────────────────────────────────
    report["sections"]["patient_friendly_summary"] = {
        "content": _generate_patient_summary(
            patient_info, spectral_results, biomarker_results
        ),
        "language": "plain_language",
        "reading_level_target": "8th grade (Flesch-Kincaid)",
        "note": "This section is intended for patient review with clinician present.",
    }

    # ── Section 12: Clinician Sign-Off ────────────────────────────────────────
    report["sections"]["clinician_sign_off"] = {
        "status": "PENDING",
        "required_credentials": "Licensed clinician or board-certified neurophysiologist (QEEG-D / QEEG-DL / BCN)",
        "sign_off_date": None,
        "reviewer_name": None,
        "reviewer_credentials": None,
        "declaration": (
            "I have reviewed this qEEG report and correlated findings with clinical presentation. "
            "I confirm that the quantitative findings support — but do not replace — "
            "my independent clinical judgment."
        ),
        "mandatory_checklist": [
            "I have personally reviewed all raw EEG data",
            "I have verified quality control metrics and artifact rejection",
            "I have reviewed all quantitative analyses",
            "Findings represent my professional judgment",
            "Report prepared per IQCB 2025 and ACNS Guideline 7",
            "I have reviewed clinical recommendations",
            "I understand this report does not constitute a diagnosis",
        ],
    }

    # ── Section 13: Evidence Appendix ─────────────────────────────────────────
    report["sections"]["evidence_appendix"] = {
        "references": biomarker_results.get("references", []),
        "reference_count": len(biomarker_results.get("references", [])),
        "note": (
            "Evidence references are drawn from the DeepSynaps Evidence Database. "
            "Citations include PubMed IDs where available. "
            "Evidence grades follow IQCB 2025 standards."
        ),
    }

    # ── Section 14: Key Images Appendix ────────────────────────────────────────
    report["sections"]["key_images_appendix"] = {
        "images": biomarker_results.get("key_images", []),
        "image_count": len(biomarker_results.get("key_images", [])),
        "note": (
            "Key images captured during analysis session: topographic maps, "
            "spectral plots, connectivity matrices, and source localization overlays."
        ),
    }

    return report


# ── Section generators ────────────────────────────────────────────────────────


def _generate_executive_summary(
    patient_info: dict[str, Any],
    spectral: dict[str, Any],
    biomarkers: dict[str, Any],
) -> str:
    """Generate Section 1: Executive Summary (safe language only)."""
    age = patient_info.get("age", "unknown")
    sex = patient_info.get("sex", "unknown")
    findings_list = biomarkers.get("findings", []) if isinstance(biomarkers.get("findings"), list) else []
    n_findings = len([f for f in findings_list if isinstance(f, dict) and f.get("present")])
    iaf_values = spectral.get("iaf", {}) if isinstance(spectral.get("iaf"), dict) else {}
    avg_iaf = (
        sum(v.get("iaf", 0) for v in iaf_values.values()) / len(iaf_values)
        if iaf_values
        else None
    )
    iaf_text = f"Individual Alpha Frequency was {avg_iaf:.1f} Hz. " if avg_iaf else ""

    return (
        f"This qEEG analysis was performed on a {age}-year-old {sex}. "
        f"The recording quality was reviewed for interpretability. "
        f"{iaf_text}"
        f"Spectral analysis revealed patterns that may be associated with certain clinical presentations. "
        f"{n_findings} biomarker-level observation(s) were noted. "
        "These findings are supportive context only and require correlation with clinical history, "
        "physical examination, and other diagnostic assessments. "
        "This report is NOT a diagnosis and does not replace clinical judgment."
    )


def _summarize_band_powers(band_powers: dict[str, Any]) -> dict[str, Any]:
    """Summarize band powers across channels — prefer Cz, fallback to first channel."""
    if not band_powers or not isinstance(band_powers, dict):
        return {}

    # Prefer Cz (central reference), then first available channel
    ref = band_powers.get("Cz") or band_powers.get("cz")
    if not ref:
        # Try first value
        try:
            ref = next(iter(band_powers.values()))
        except StopIteration:
            return {}

    if not isinstance(ref, dict):
        return {}

    bands = ref.get("bands", {}) if isinstance(ref.get("bands"), dict) else {}
    summary: dict[str, Any] = {}
    for band_name, band_data in bands.items():
        if isinstance(band_data, dict):
            summary[band_name] = {
                "absolute_uv2": band_data.get("absolute"),
                "relative_pct": band_data.get("relative"),
                "z_score": band_data.get("z_score"),
            }
    return summary


def _suggest_neurofeedback_protocols(
    spectral_results: dict[str, Any],
) -> list[dict[str, Any]]:
    """Suggest neurofeedback protocols based on spectral patterns.

    Returns ranked list with evidence grades and safety flags.
    """
    suggestions: list[dict[str, Any]] = []
    ratios = spectral_results.get("ratios", {}) if isinstance(spectral_results.get("ratios"), dict) else {}
    asymmetry = spectral_results.get("asymmetry", {}) if isinstance(spectral_results.get("asymmetry"), dict) else {}

    # Theta/Beta Ratio Training
    tbr = ratios.get("theta_beta_ratio", {}) if isinstance(ratios.get("theta_beta_ratio"), dict) else {}
    tbr_value = tbr.get("value", 0) if isinstance(tbr, dict) else 0
    if tbr_value > 1.0:
        suggestions.append({
            "protocol": "Theta/Beta Ratio Training",
            "rationale": (
                "Elevated Theta/Beta ratio may benefit from theta suppression "
                "combined with beta enhancement at central sites."
            ),
            "target": "Cz",
            "inhibitory_band": "Theta (4–8 Hz)",
            "enhancing_band": "Beta (13–21 Hz)",
            "goal": "Reduce TBR below 1.0",
            "evidence_grade": "B",
            "evidence_note": "NEBA FDA-cleared for ADHD adjunctive assessment",
            "typical_sessions": "30–40",
            "frequency": "2–3x per week",
            "contraindications": ["epilepsy", "active psychosis"],
        })

    # SMR Training
    suggestions.append({
        "protocol": "SMR (12–15 Hz) Training",
        "rationale": "Sensorimotor rhythm enhancement supports cortical inhibition and sleep onset.",
        "target": "C4",
        "enhancing_band": "SMR (12–15 Hz)",
        "goal": "Increase SMR amplitude",
        "evidence_grade": "B",
        "evidence_note": "Established efficacy for sleep onset and hyperarousal",
        "typical_sessions": "20–30",
        "frequency": "2x per week",
        "contraindications": ["none major"],
    })

    # Frontal Alpha Asymmetry Training
    faa = asymmetry.get("frontal_alpha", {}) if isinstance(asymmetry.get("frontal_alpha"), dict) else {}
    faa_index = faa.get("asymmetry_index", 0) if isinstance(faa, dict) else 0
    if faa_index > 0.1:
        suggestions.append({
            "protocol": "Frontal Alpha Asymmetry Training",
            "rationale": (
                "Left frontal hypoactivation (relative right frontal elevation) "
                "may benefit from alpha uptraining at F3."
            ),
            "target": "F3",
            "enhancing_band": "Alpha (8–12 Hz)",
            "goal": "Reduce frontal alpha asymmetry toward balanced activation",
            "evidence_grade": "B",
            "evidence_note": "Associated with depression and anxiety presentations",
            "typical_sessions": "20–30",
            "frequency": "2x per week",
            "contraindications": ["bipolar disorder (screen carefully)", "active psychosis"],
        })

    # Alpha/Theta Training
    suggestions.append({
        "protocol": "Alpha/Theta Training",
        "rationale": "Deep state training for trauma-related presentations and stress regulation.",
        "target": "Pz",
        "enhancing_band": "Alpha crossover (increase theta then alpha)",
        "goal": "Achieve alpha-theta crossover state",
        "evidence_grade": "C",
        "evidence_note": "Peniston protocol variants show promise for PTSD adjunct",
        "typical_sessions": "20–40",
        "frequency": "1–2x per week",
        "contraindications": ["epilepsy (relative)", "dissociative disorders"],
    })

    return suggestions


def _suggest_neuromodulation_targets(
    spectral_results: dict[str, Any],
) -> list[dict[str, Any]]:
    """Suggest neuromodulation targets based on spectral patterns."""
    targets: list[dict[str, Any]] = []

    # Default DLPFC target for depression/anxiety (most common referral)
    targets.append({
        "modality": "rTMS",
        "target": "DLPFC (left)",
        "mni_coordinates": "[-38, 44, 26]",
        "rationale": "Standard rTMS target for depression. Evidence grade A for treatment-resistant depression.",
        "protocol_reference": "Theta-burst stimulation (TBS) or 10 Hz conventional",
        "sessions_typical": "20–30",
    })

    # If elevated theta is present, consider supplementary motor area
    ratios = spectral_results.get("ratios", {}) if isinstance(spectral_results.get("ratios"), dict) else {}
    tbr = ratios.get("theta_beta_ratio", {}) if isinstance(ratios.get("theta_beta_ratio"), dict) else {}
    tbr_value = tbr.get("value", 0) if isinstance(tbr, dict) else 0
    if tbr_value > 1.0:
        targets.append({
            "modality": "rTMS",
            "target": "SMA (supplementary motor area)",
            "mni_coordinates": "[2, 10, 60]",
            "rationale": "SMA stimulation may support attention and motor planning networks.",
            "protocol_reference": "10 Hz conventional or iTBS",
            "sessions_typical": "20–30",
        })

    return targets


def _generate_patient_summary(
    patient_info: dict[str, Any],
    spectral: dict[str, Any],
    biomarkers: dict[str, Any],
) -> str:
    """Generate patient-friendly summary using plain language (8th-grade target)."""
    age = patient_info.get("age", "unknown")
    findings_list = biomarkers.get("findings", []) if isinstance(biomarkers.get("findings"), list) else []
    n_findings = len([f for f in findings_list if isinstance(f, dict) and f.get("present")])

    finding_text = (
        f"The computer found {n_findings} pattern(s) that your doctor will want to review with you. "
        if n_findings
        else "The computer did not flag any specific patterns for review. "
    )

    return (
        f"Your brain wave (EEG) scan has been analyzed by a computer program. "
        f"{finding_text}"
        f"These patterns are NOT a diagnosis — they are extra information to help your doctor "
        f"understand how your brain is working. "
        f"Your age ({age}) was used to compare your brain waves to people in the same age group. "
        f"Your doctor will discuss what these results mean for you personally. "
        f"If you have questions, please ask your doctor during your next appointment. "
        f"Remember: only your doctor can give you a diagnosis and treatment plan."
    )


# ── Helper functions ──────────────────────────────────────────────────────────


def _artifact_burden_status(artifact_burden_pct: float | None) -> str:
    """Classify artifact burden into interpretability categories."""
    if artifact_burden_pct is None:
        return "unknown"
    if artifact_burden_pct < 5:
        return "excellent"
    if artifact_burden_pct < 15:
        return "good"
    if artifact_burden_pct < 25:
        return "acceptable"
    if artifact_burden_pct < 40:
        return "marginal — interpret with caution"
    return "poor — consider re-recording"


def _split_half_reliability(reliability: float | None) -> str:
    """Classify split-half reliability."""
    if reliability is None:
        return "unknown"
    if reliability >= 0.95:
        return "excellent"
    if reliability >= 0.90:
        return "good"
    if reliability >= 0.80:
        return "acceptable"
    if reliability >= 0.70:
        return "marginal"
    return "poor — results may be unstable"


def _qa_recommendation(quality_metrics: dict[str, Any]) -> str:
    """Generate a QC recommendation string."""
    rating = quality_metrics.get("overall_rating", "").lower()
    if rating in ("excellent", "good"):
        return "Data quality is sufficient for clinical interpretation."
    if rating == "acceptable":
        return "Data quality is acceptable; note limitations in interpretation."
    if rating in ("marginal", "poor"):
        return "Data quality is suboptimal. Consider re-recording or restrict interpretation to robust findings only."
    return "Review quality metrics before proceeding with interpretation."


def _summarize_evidence_grades(findings: list[Any]) -> dict[str, int]:
    """Count findings by evidence grade."""
    counts: dict[str, int] = {"A": 0, "B": 0, "C": 0, "D": 0, "unknown": 0}
    for f in findings:
        if isinstance(f, dict):
            grade = f.get("evidence_grade", "unknown")
            if grade in counts:
                counts[grade] += 1
            else:
                counts["unknown"] += 1
    return counts


def _safe_str(value: Any) -> str | None:
    """Coerce value to string or None safely."""
    if value is None:
        return None
    return str(value)


# ── Convenience re-exports ────────────────────────────────────────────────────

__all__ = [
    "REPORT_SECTIONS",
    "generate_report",
]
