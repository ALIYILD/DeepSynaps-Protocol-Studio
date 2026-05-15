"""qEEG-Guided Neurofeedback + Neuromodulation Protocol Planning.

Decision-support only. Final protocol selection requires qualified clinician.

This module implements Deliverables D50–D53 from the DeepSynaps qEEG Analyzer
Roadmap: qEEG-Guided Protocol Selection with safety screening (Week 14).

References:
    - Arns et al. (2012, 2014) qEEG-informed neurofeedback effectiveness trials
    - ISNR Comprehensive Clinical Guidelines (LaVaque et al., 2020)
    - Safety Rule 1: Never-diagnose architecture
    - Safety Rule 13: Human-in-the-loop requirement
"""

from __future__ import annotations

import logging
from typing import Any

_log = logging.getLogger(__name__)

# ── Protocol Library (10 evidence-based templates) ────────────────────────────

PROTOCOL_LIBRARY: dict[str, dict[str, Any]] = {
    "tbr_training": {
        "protocol_id": "tbr_training",
        "name": "Theta/Beta Ratio Training",
        "indication": "ADHD, attention difficulties, executive function support",
        "target": "Cz",
        "inhibitory_band": "Theta (4–8 Hz)",
        "enhancing_band": "Beta (13–21 Hz)",
        "goal": "Reduce TBR below 1.0",
        "evidence_grade": "B",
        "evidence_note": "NEBA FDA-cleared for ADHD adjunctive assessment (K131820)",
        "clinical_use_status": "FDA-Cleared adjunct",
        "contraindications": ["epilepsy", "active psychosis"],
        "caution": ["bipolar disorder (screen)"],
        "sessions_typical": "30–40",
        "frequency": "2–3x per week",
        "session_duration_min": 20,
        "criteria_threshold": {"theta_beta_ratio": "> 1.0"},
    },
    "smr_training": {
        "protocol_id": "smr_training",
        "name": "SMR (12–15 Hz) Training",
        "indication": "Sleep onset insomnia, hyperarousal, epilepsy adjunct",
        "target": "C4",
        "inhibitory_band": None,
        "enhancing_band": "SMR (12–15 Hz)",
        "goal": "Increase SMR amplitude",
        "evidence_grade": "B",
        "evidence_note": "Sterman protocol; established for seizure reduction and sleep",
        "clinical_use_status": "Clinical Adjunct",
        "contraindications": ["none major"],
        "caution": ["ensure EEG quality for SMR bandwidth accuracy"],
        "sessions_typical": "20–30",
        "frequency": "2x per week",
        "session_duration_min": 20,
        "criteria_threshold": {"smr_amplitude": "< 5th percentile"},
    },
    "alpha_theta": {
        "protocol_id": "alpha_theta",
        "name": "Alpha/Theta Deep State Training",
        "indication": "PTSD, trauma, addiction recovery, creativity enhancement",
        "target": "Pz",
        "inhibitory_band": None,
        "enhancing_band": "Alpha crossover (increase theta then alpha)",
        "goal": "Achieve alpha-theta crossover state",
        "evidence_grade": "C",
        "evidence_note": "Peniston protocol variants; promising for PTSD adjunct",
        "clinical_use_status": "Research Tool",
        "contraindications": ["epilepsy (relative)", "dissociative disorders"],
        "caution": ["bipolar disorder (relative)", "requires trained clinician supervision"],
        "sessions_typical": "20–40",
        "frequency": "1–2x per week",
        "session_duration_min": 30,
        "criteria_threshold": {"alpha_theta_ratio": "elevated with trauma history"},
    },
    "faa_training": {
        "protocol_id": "faa_training",
        "name": "Frontal Alpha Asymmetry Training",
        "indication": "Depression, anxiety, mood dysregulation",
        "target": "F3",
        "inhibitory_band": None,
        "enhancing_band": "Alpha (8–12 Hz)",
        "goal": "Reduce frontal alpha asymmetry (F4 > F3) toward balance",
        "evidence_grade": "B",
        "evidence_note": "Davidson asymmetry model; replicated in depression studies",
        "clinical_use_status": "Clinical Adjunct",
        "contraindications": ["bipolar disorder (screen carefully)"],
        "caution": ["active psychosis", "manic phase risk"],
        "sessions_typical": "20–30",
        "frequency": "2x per week",
        "session_duration_min": 20,
        "criteria_threshold": {"frontal_alpha_asymmetry_index": "> 0.1"},
    },
    "alpha_uptraining": {
        "protocol_id": "alpha_uptraining",
        "name": "Alpha Uptraining (Posterior)",
        "indication": "Anxiety, stress, relaxation deficits, insomnia",
        "target": "O1/O2 or Pz",
        "inhibitory_band": None,
        "enhancing_band": "Alpha (8–12 Hz)",
        "goal": "Increase posterior alpha amplitude",
        "evidence_grade": "B",
        "evidence_note": "Well-established for anxiety and relaxation training",
        "clinical_use_status": "Clinical Adjunct",
        "contraindications": ["none major"],
        "caution": ["drowsiness during sessions — monitor alertness"],
        "sessions_typical": "15–25",
        "frequency": "2x per week",
        "session_duration_min": 20,
        "criteria_threshold": {"posterior_alpha": "< 5th percentile"},
    },
    "scp_training": {
        "protocol_id": "scp_training",
        "name": "Slow Cortical Potential (SCP) Training",
        "indication": "ADHD (inattentive subtype), epilepsy, cortical regulation",
        "target": "Cz",
        "inhibitory_band": None,
        "enhancing_band": "SCP negativity",
        "goal": "Learn cortical self-regulation via SCP shifts",
        "evidence_grade": "B",
        "evidence_note": "Heinrich protocol; strong European evidence base for ADHD",
        "clinical_use_status": "Clinical Adjunct",
        "contraindications": ["none major"],
        "caution": ["requires dedicated SCP equipment"],
        "sessions_typical": "25–35",
        "frequency": "2x per week",
        "session_duration_min": 30,
        "criteria_threshold": {"scp_regulation": "poor self-regulation index"},
    },
    "beta_downtraining": {
        "protocol_id": "beta_downtraining",
        "name": "High-Beta Downtraining",
        "indication": "OCD, rumination, tension, hypervigilance",
        "target": "Cz or Fz",
        "inhibitory_band": "High Beta (20–30 Hz)",
        "enhancing_band": None,
        "goal": "Reduce excessive high-beta activity",
        "evidence_grade": "C",
        "evidence_note": "Emerging evidence for OCD and anxiety-related rumination",
        "clinical_use_status": "Research Tool",
        "contraindications": ["none major"],
        "caution": ["ensure EMG artifact not confounding high-beta readings"],
        "sessions_typical": "20–30",
        "frequency": "2x per week",
        "session_duration_min": 20,
        "criteria_threshold": {"high_beta": "> 2 SD above norm"},
    },
    "loreta_zscore": {
        "protocol_id": "loreta_zscore",
        "name": "LORETA Z-Score Multivariate Training",
        "indication": "Complex cases, multiple deviant regions, treatment-resistant",
        "target": "Patient-specific (LORETA-determined)",
        "inhibitory_band": "Patient-specific",
        "enhancing_band": "Patient-specific",
        "goal": "Normalize deviant Brodmann areas toward z=0",
        "evidence_grade": "B",
        "evidence_note": "Thatcher / Collura protocol; widely used in clinical practice",
        "clinical_use_status": "Clinical Adjunct",
        "contraindications": ["none major"],
        "caution": ["requires LORETA software and training", "template MRI limitation ~20 mm error"],
        "sessions_typical": "30–40",
        "frequency": "2x per week",
        "session_duration_min": 30,
        "criteria_threshold": {"deviant_brodmann_areas": "> 3 areas with |z| > 2.0"},
    },
    "dmn_regulation": {
        "protocol_id": "dmn_regulation",
        "name": "Default Mode Network Regulation",
        "indication": "PTSD rumination, depression with self-referential processing",
        "target": "PCC / mPFC (via LORETA or surface proxy)",
        "inhibitory_band": None,
        "enhancing_band": "Alpha or theta depending on presentation",
        "goal": "Normalize DMN connectivity patterns",
        "evidence_grade": "C",
        "evidence_note": "Emerging; DMN hyperconnectivity linked to rumination",
        "clinical_use_status": "Research Tool",
        "contraindications": ["none major"],
        "caution": ["requires connectivity analysis pre-training", "expert interpretation needed"],
        "sessions_typical": "20–30",
        "frequency": "2x per week",
        "session_duration_min": 25,
        "criteria_threshold": {"dmn_connectivity": "elevated PCC–mPFC coupling"},
    },
    "qeeg_guided_tms": {
        "protocol_id": "qeeg_guided_tms",
        "name": "qEEG-Guided TMS/tDCS Targeting",
        "indication": "Treatment-resistant depression, targeted neuromodulation",
        "target": "qEEG-informed (personalized)",
        "inhibitory_band": None,
        "enhancing_band": None,
        "goal": "Deliver neuromodulation to qEEG-identified target regions",
        "evidence_grade": "B",
        "evidence_note": "Personalized targeting may outperform standard DLPFC in subgroups",
        "clinical_use_status": "Clinical Adjunct",
        "contraindications": [
            "epilepsy (rTMS relative)",
            "intracranial metallic implants near target",
            "pacemaker (rTMS)",
        ],
        "caution": [
            "requires qEEG-informed target identification",
            "individual MRI preferred for targeting",
            "neuromodulation specialist required",
        ],
        "sessions_typical": "20–30",
        "frequency": "5x per week (rTMS) or 2x per week (tDCS)",
        "session_duration_min": 20,
        "criteria_threshold": {"deviant_regions": "identified via source localization"},
    },
}


# ── Public API ────────────────────────────────────────────────────────────────


def plan_neurofeedback_protocol(
    spectral_results: dict[str, Any],
    biomarker_results: dict[str, Any],
    patient_history: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate protocol suggestions based on qEEG findings.

    Returns a ranked list with full safety screening and contraindication
    checking.  All suggestions carry a mandatory disclaimer that final
    protocol selection requires a qualified clinician.

    Parameters
    ----------
    spectral_results
        Spectral analysis outputs: ratios, asymmetry, band powers, IAF.
    biomarker_results
        Biomarker engine outputs: findings with evidence grades.
    patient_history
        Patient medical history dict with keys like epilepsy, bipolar,
        active_psychosis, dissociative_disorder, etc.

    Returns
    -------
    dict
        suggestions: list of protocol dicts with safety_status
        warnings: list of safety warning strings
        safety_screening_passed: bool
        disclaimer: str
        required_credentials: str
    """
    if patient_history is None:
        patient_history = {}

    suggestions: list[dict[str, Any]] = []
    warnings: list[str] = []

    # ── Safety screening ──────────────────────────────────────────────────────
    has_epilepsy = bool(patient_history.get("epilepsy", False))
    has_active_psychosis = bool(patient_history.get("active_psychosis", False))
    has_bipolar = bool(patient_history.get("bipolar_disorder", False))
    has_dissociative = bool(patient_history.get("dissociative_disorder", False))

    if has_epilepsy:
        warnings.append(
            "EPILEPSY PRESENT: Some neurofeedback protocols are contraindicated. "
            "Neurologist clearance and continuous EEG monitoring required."
        )
    if has_active_psychosis:
        warnings.append(
            "ACTIVE PSYCHOSIS: Several protocols contraindicated. "
            "Psychiatric stabilization required before neurofeedback."
        )
    if has_bipolar:
        warnings.append(
            "BIPOLAR DISORDER: Screen for current phase before alpha/theta or FAA training."
        )

    # ── Extract spectral features ─────────────────────────────────────────────
    ratios = spectral_results.get("ratios", {}) if isinstance(spectral_results.get("ratios"), dict) else {}
    asymmetry = spectral_results.get("asymmetry", {}) if isinstance(spectral_results.get("asymmetry"), dict) else {}

    # Theta/Beta Ratio
    tbr_data = ratios.get("theta_beta_ratio", {}) if isinstance(ratios.get("theta_beta_ratio"), dict) else {}
    tbr_value = tbr_data.get("value", 0) if isinstance(tbr_data, dict) else 0

    # Frontal Alpha Asymmetry
    faa_data = asymmetry.get("frontal_alpha", {}) if isinstance(asymmetry.get("frontal_alpha"), dict) else {}
    faa_index = faa_data.get("asymmetry_index", 0) if isinstance(faa_data, dict) else 0

    # Posterior alpha
    band_powers = spectral_results.get("band_powers", {}) if isinstance(spectral_results.get("band_powers"), dict) else {}
    posterior_alpha = _extract_posterior_alpha(band_powers)

    # ── Protocol selection logic ──────────────────────────────────────────────

    # 1. TBR Training (highest evidence for ADHD presentations)
    if tbr_value > 1.0:
        proto = _make_protocol_suggestion(
            "tbr_training",
            qeeg_evidence=f"TBR = {tbr_value:.2f} (elevated; normative cutoff 1.0)",
            has_epilepsy=has_epilepsy,
            has_active_psychosis=has_active_psychosis,
            has_bipolar=has_bipolar,
        )
        if proto:
            suggestions.append(proto)

    # 2. FAA Training (depression/mood)
    if faa_index > 0.1:
        proto = _make_protocol_suggestion(
            "faa_training",
            qeeg_evidence=f"FAA = {faa_index:.2f} (left hypoactivation)",
            has_epilepsy=has_epilepsy,
            has_active_psychosis=has_active_psychosis,
            has_bipolar=has_bipolar,
        )
        if proto:
            suggestions.append(proto)

    # 3. Alpha Uptraining (anxiety/stress — very common)
    proto = _make_protocol_suggestion(
        "alpha_uptraining",
        qeeg_evidence=f"Posterior alpha = {posterior_alpha:.2f} uV2" if posterior_alpha else "General anxiety/stress pattern",
        has_epilepsy=has_epilepsy,
        has_active_psychosis=has_active_psychosis,
        has_bipolar=has_bipolar,
    )
    if proto:
        suggestions.append(proto)

    # 4. SMR Training (generally safe, good for sleep/arousal)
    proto = _make_protocol_suggestion(
        "smr_training",
        qeeg_evidence="General hyperarousal / sleep pattern",
        has_epilepsy=has_epilepsy,
        has_active_psychosis=has_active_psychosis,
        has_bipolar=has_bipolar,
    )
    if proto:
        proto["safety_status"] = "CLEARED with monitoring" if has_epilepsy else "CLEARED"
        suggestions.append(proto)

    # 5. SCP Training (inattentive ADHD)
    if tbr_value > 0.8:  # Broader threshold for inattentive presentations
        proto = _make_protocol_suggestion(
            "scp_training",
            qeeg_evidence=f"TBR = {tbr_value:.2f} (SCP candidate for inattentive subtype)",
            has_epilepsy=has_epilepsy,
            has_active_psychosis=has_active_psychosis,
            has_bipolar=has_bipolar,
        )
        if proto:
            suggestions.append(proto)

    # 6. Alpha/Theta (trauma history)
    if patient_history.get("trauma_history") or patient_history.get("ptsd"):
        proto = _make_protocol_suggestion(
            "alpha_theta",
            qeeg_evidence="Trauma/PTSD history documented",
            has_epilepsy=has_epilepsy,
            has_active_psychosis=has_active_psychosis,
            has_bipolar=has_bipolar,
            extra_caution=["dissociative screening required"] if has_dissociative else [],
        )
        if proto and has_dissociative:
            proto["safety_status"] = "CONTRAINDICATED — Dissociative disorder"
            proto["override_required"] = "Dissociative disorder specialist clearance"
        suggestions.append(proto)

    # 7. High-Beta Downtraining (OCD/rumination)
    high_beta_data = ratios.get("high_beta_ratio", {}) if isinstance(ratios.get("high_beta_ratio"), dict) else {}
    high_beta_value = high_beta_data.get("value", 0) if isinstance(high_beta_data, dict) else 0
    if high_beta_value > 1.5 or patient_history.get("ocd"):
        proto = _make_protocol_suggestion(
            "beta_downtraining",
            qeeg_evidence=f"High-beta elevation = {high_beta_value:.2f}" if high_beta_value > 1.5 else "OCD presentation documented",
            has_epilepsy=has_epilepsy,
            has_active_psychosis=has_active_psychosis,
            has_bipolar=has_bipolar,
        )
        if proto:
            suggestions.append(proto)

    # 8. LORETA Z-Score (complex cases)
    findings = biomarker_results.get("findings", []) if isinstance(biomarker_results.get("findings"), list) else []
    deviant_count = len([f for f in findings if isinstance(f, dict) and f.get("present") and abs(f.get("z_score", 0)) > 2.0])
    if deviant_count >= 3:
        proto = _make_protocol_suggestion(
            "loreta_zscore",
            qeeg_evidence=f"{deviant_count} deviant Brodmann areas (|z| > 2.0)",
            has_epilepsy=has_epilepsy,
            has_active_psychosis=has_active_psychosis,
            has_bipolar=has_bipolar,
        )
        if proto:
            suggestions.append(proto)

    # ── Rank by evidence grade then relevance ─────────────────────────────────
    suggestions.sort(key=_protocol_rank_key, reverse=True)

    return {
        "suggestions": suggestions,
        "warnings": warnings,
        "safety_screening_passed": len(warnings) == 0,
        "screening_completed": True,
        "disclaimer": (
            "Protocol suggestions are decision support only. "
            "Final protocol selection requires a qualified BCIA-certified or equivalent "
            "neurofeedback clinician. These suggestions do not constitute a treatment plan."
        ),
        "required_credentials": "BCIA-certified or equivalent licensed clinician",
        "evidence_note": (
            "Evidence grades: A = Strong (multiple RCTs), B = Moderate (some RCTs), "
            "C = Limited (pilot studies), D = Insufficient (case reports only)."
        ),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_protocol_suggestion(
    protocol_id: str,
    qeeg_evidence: str,
    has_epilepsy: bool,
    has_active_psychosis: bool,
    has_bipolar: bool,
    extra_caution: list[str] | None = None,
) -> dict[str, Any] | None:
    """Create a protocol suggestion with safety screening applied."""
    if protocol_id not in PROTOCOL_LIBRARY:
        _log.warning("Unknown protocol_id: %s", protocol_id)
        return None

    proto = dict(PROTOCOL_LIBRARY[protocol_id])
    proto["qeeeg_evidence"] = qeeg_evidence
    proto["rank_score"] = _evidence_grade_score(proto.get("evidence_grade", "D"))

    # Determine safety status
    contras = set(proto.get("contraindications", []))
    cautions = list(proto.get("caution", []))
    if extra_caution:
        cautions.extend(extra_caution)

    if has_epilepsy and "epilepsy" in contras:
        proto["safety_status"] = "CONTRAINDICATED — Epilepsy"
        proto["override_required"] = "Board-certified neurologist clearance + EEG monitoring"
    elif has_epilepsy and "epilepsy (relative)" in contras:
        proto["safety_status"] = "CAUTION — Epilepsy (relative contraindication)"
        proto["requirement"] = "Neurologist consultation recommended"
    elif has_active_psychosis and "active psychosis" in contras:
        proto["safety_status"] = "CONTRAINDICATED — Active psychosis"
        proto["override_required"] = "Psychiatric stabilization + clearance"
    elif has_bipolar and "bipolar disorder (screen carefully)" in contras:
        proto["safety_status"] = "CAUTION — Bipolar disorder"
        proto["requirement"] = "Verify euthymic state before training"
    else:
        proto["safety_status"] = "CLEARED"

    proto["active_cautions"] = cautions
    return proto


def _evidence_grade_score(grade: str) -> int:
    """Convert evidence grade to numeric rank score."""
    return {"A": 4, "B": 3, "C": 2, "D": 1}.get(grade.upper(), 0)


def _protocol_rank_key(proto: dict[str, Any]) -> float:
    """Sort key: evidence grade score + safety clearance bonus."""
    base = float(proto.get("rank_score", 0))
    if proto.get("safety_status") == "CLEARED":
        base += 0.5
    elif proto.get("safety_status", "").startswith("CAUTION"):
        base += 0.2
    return base


def _extract_posterior_alpha(band_powers: dict[str, Any]) -> float | None:
    """Extract posterior alpha power from band powers dict."""
    if not band_powers or not isinstance(band_powers, dict):
        return None

    # Try O1, O2, Pz for posterior alpha
    for ch_name in ("Oz", "O1", "O2", "Pz", "P3", "P4"):
        ch_data = band_powers.get(ch_name) or band_powers.get(ch_name.lower())
        if isinstance(ch_data, dict):
            bands = ch_data.get("bands", {}) if isinstance(ch_data.get("bands"), dict) else {}
            alpha = bands.get("alpha") or bands.get("Alpha")
            if isinstance(alpha, dict):
                abs_val = alpha.get("absolute")
                if isinstance(abs_val, (int, float)):
                    return float(abs_val)
    return None


# ── Re-exports ────────────────────────────────────────────────────────────────

__all__ = [
    "PROTOCOL_LIBRARY",
    "plan_neurofeedback_protocol",
]
