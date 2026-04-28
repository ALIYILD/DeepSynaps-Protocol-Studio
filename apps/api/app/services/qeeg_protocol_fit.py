"""AI Protocol Fit engine for qEEG analyses.

Links qEEG patterns to candidate protocols for clinician review only.
Follows docs/protocol-evidence-governance-policy.md.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.errors import ApiServiceError
from app.persistence.models import Patient, QEEGAnalysis, QEEGProtocolFit

_log = logging.getLogger(__name__)


# ── Protocol pattern library (simplified heuristic mapping) ──────────────────
# In production this would query the condition-package registry.
_PATTERN_LIBRARY: list[dict] = [
    {
        "pattern": "frontal_theta_elevation",
        "bands": {"theta": {"regions": ["frontal"], "z_threshold": 1.5}},
        "candidate": {"modality": "rTMS", "target": "left DLPFC", "frequency": "10 Hz"},
        "conditions": ["MDD", "ADHD"],
        "evidence_grade": "EV-B",
        "contraindications": ["seizure_history", "cranial_metal_implant"],
        "required_checks": ["Verify no seizure history", "Confirm MRI safety screening"],
    },
    {
        "pattern": "frontal_alpha_asymmetry",
        "bands": {"alpha": {"regions": ["frontal"], "asymmetry": True}},
        "candidate": {"modality": "rTMS", "target": "right DLPFC", "frequency": "1 Hz"},
        "conditions": ["MDD", "anxiety"],
        "evidence_grade": "EV-B",
        "contraindications": ["seizure_history"],
        "required_checks": ["Verify no seizure history", "Assess mood stability"],
    },
    {
        "pattern": "posterior_alpha_hypoactivation",
        "bands": {"alpha": {"regions": ["parietal", "occipital"], "z_threshold": -1.5}},
        "candidate": {"modality": "tDCS", "target": "O1/O2", "montage": "bipolar"},
        "conditions": ["insomnia", "chronic_pain"],
        "evidence_grade": "EV-C",
        "contraindications": ["skin_lesion_at_site"],
        "required_checks": ["Inspect scalp at electrode sites"],
    },
    {
        "pattern": "elevated_tbr",
        "bands": {"theta_beta_ratio": {"threshold": 4.5}},
        "candidate": {"modality": "rTMS", "target": "right inferior frontal gyrus", "frequency": "1 Hz"},
        "conditions": ["ADHD"],
        "evidence_grade": "EV-C",
        "contraindications": ["seizure_history"],
        "required_checks": ["Verify no seizure history", "Confirm ADHD diagnosis by qualified clinician"],
    },
]


def compute_protocol_fit(analysis: QEEGAnalysis, patient: Patient, db: Session) -> QEEGProtocolFit:
    """Compute and persist a protocol-fit recommendation.

    Parameters
    ----------
    analysis: QEEGAnalysis
    patient: Patient
    db: Session

    Returns
    -------
    QEEGProtocolFit
        The persisted protocol-fit row (caller must commit).
    """
    band_powers = _json_loads(analysis.band_powers_json) or {}
    normative = _json_loads(analysis.normative_zscores_json) or {}
    ratios = (band_powers.get("derived_ratios") or {}) if isinstance(band_powers, dict) else {}

    matches: list[dict] = []
    for pattern in _PATTERN_LIBRARY:
        score = _score_pattern(pattern, band_powers, normative, ratios)
        if score > 0:
            matches.append({"pattern": pattern, "score": score})

    matches.sort(key=lambda x: x["score"], reverse=True)
    top = matches[0]["pattern"] if matches else None

    candidate: Optional[dict] = None
    alternatives: list[dict] = []
    if top:
        candidate = dict(top["candidate"])
        candidate["evidence_grade"] = top["evidence_grade"]
        candidate["conditions"] = top["conditions"]
        for alt in matches[1:3]:
            p = alt["pattern"]
            alt_proto = dict(p["candidate"])
            alt_proto["evidence_grade"] = p["evidence_grade"]
            alternatives.append(alt_proto)

    contras: list[str] = []
    required_checks: list[str] = []
    if top:
        contras = list(top.get("contraindications") or [])
        required_checks = list(top.get("required_checks") or [])

    # Off-label flag: if patient primary_condition not in pattern conditions
    off_label = False
    if top and patient.primary_condition:
        if patient.primary_condition not in top.get("conditions", []):
            off_label = True

    evidence_grade = top["evidence_grade"] if top else None

    fit = QEEGProtocolFit(
        analysis_id=analysis.id,
        patient_id=patient.id,
        pattern_summary=_build_pattern_summary(matches, band_powers, ratios),
        symptom_linkage_json=json.dumps({"primary_condition": patient.primary_condition, "matches": [m["pattern"]["pattern"] for m in matches[:3]]}),
        contraindications_json=json.dumps(contras),
        evidence_grade=evidence_grade,
        off_label_flag=off_label,
        candidate_protocol_json=json.dumps(candidate) if candidate else None,
        alternative_protocols_json=json.dumps(alternatives) if alternatives else None,
        match_rationale=_build_match_rationale(top, matches) if top else None,
        caution_rationale=_build_caution_rationale(top, off_label, patient) if top else None,
        required_checks_json=json.dumps(required_checks),
    )
    db.add(fit)
    return fit


def _build_pattern_summary(matches: list[dict], band_powers: dict, ratios: dict) -> str:
    parts: list[str] = []
    tbr = ratios.get("theta_beta_ratio")
    if tbr is not None:
        parts.append(f"TBR = {float(tbr):.2f}")
    if matches:
        parts.append(f"Top pattern: {matches[0]['pattern']['pattern']}")
    return "; ".join(parts) if parts else "No dominant qEEG pattern identified."


def _build_match_rationale(top: dict, matches: list[dict]) -> str:
    return (
        f"The qEEG shows features matching the '{top['pattern']}' pattern "
        f"(score {matches[0]['score']:.0f}/100). "
        f"This pattern has been associated with {', '.join(top['conditions'])} in research literature. "
        "This is a decision-support suggestion, not a treatment recommendation."
    )


def _build_caution_rationale(top: dict, off_label: bool, patient: Patient) -> str:
    parts: list[str] = []
    if off_label:
        parts.append(
            f"The patient's primary condition ({patient.primary_condition or 'unspecified'}) "
            f"is not in the direct evidence base for this pattern ({', '.join(top['conditions'])}). "
            "Use as off-label / investigational."
        )
    parts.append("All protocol suggestions require clinician review before use.")
    return " ".join(parts)


def _score_pattern(pattern: dict, band_powers: dict, normative: dict, ratios: dict) -> int:
    score = 0
    bands_cfg = pattern.get("bands") or {}
    for band, cfg in bands_cfg.items():
        if band == "theta_beta_ratio":
            val = ratios.get("theta_beta_ratio")
            thresh = cfg.get("threshold")
            if val is not None and thresh is not None and float(val) >= float(thresh):
                score += 40
            continue
        z_threshold = cfg.get("z_threshold")
        regions = cfg.get("regions") or []
        # Check normative z-scores
        z_data = _extract_z_scores(normative, band)
        for region in regions:
            for ch, z in z_data.items():
                if region.lower() in ch.lower():
                    if z_threshold is not None and z_threshold > 0 and z >= z_threshold:
                        score += 25
                    elif z_threshold is not None and z_threshold < 0 and z <= z_threshold:
                        score += 25
    return min(score, 100)


def _extract_z_scores(normative: dict, band: str) -> dict[str, float]:
    out: dict[str, float] = {}
    if not isinstance(normative, dict):
        return out
    if "spectral" in normative and "bands" in normative["spectral"]:
        payload = normative["spectral"]["bands"].get(band) or {}
        abs_z = payload.get("absolute_uv2") or {}
        for ch, z in abs_z.items():
            try:
                out[ch] = float(z)
            except (TypeError, ValueError):
                continue
    else:
        # Legacy flat format
        for ch, bands in normative.items():
            if isinstance(bands, dict) and band in bands:
                try:
                    out[ch] = float(bands[band])
                except (TypeError, ValueError):
                    continue
    return out


def _json_loads(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
