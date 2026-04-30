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
        "required_checks": ["Verify no seizure history", "Confirm ADHD assessment by qualified clinician"],
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


# ── Phase 2: Brain Map contract → protocol suggestions ───────────────────────
# Consumes the QEEGBrainMapReport payload from Phase 0
# (apps/api/app/services/qeeg_report_template.py) and produces a list of
# ranked protocol candidates for the Protocol Studio "From qEEG" source.
# This is intentionally heuristic and clinician-review only.

# DK ROI → modality+target hints. Z-score sign-aware: deficit (z <= -1.5)
# vs excess (z >= 1.5) drive different recommendations. Hands-off zones
# (motor cortex, etc.) carry mandatory required_checks.
# Evidence-grade tags applied per QEEG evidence-citation audit (2026-04-30).
# See memory file deepsynaps-qeeg-evidence-gaps.md for the full audit. Two
# mappings (tDCS-O1/O2 and tACS-Pz) are NOT supported by any published trial
# and are gated with `enabled: False` so suggest_protocols_from_report skips
# them. Do not delete the entries — they document what was considered and
# rejected, and downstream code may want to surface the gap.
_DK_ROI_PROTOCOL_HINTS: dict[str, dict] = {
    "rostralmiddlefrontal": {
        "lh_deficit": {
            "modality": "rTMS", "target": "left DLPFC", "frequency": "10 Hz",
            "rationale": "Reduced left rostral middle frontal activity is associated with depressive and inattentive presentations.",
            "evidence_grade": "STRONG_FDA_CLEARED",
            "evidence_caveat": "Left DLPFC rTMS at 10 Hz is FDA-cleared for treatment-resistant MDD (multiple meta-analyses).",
            "enabled": True,
        },
        "rh_excess": {
            "modality": "rTMS", "target": "right DLPFC", "frequency": "1 Hz",
            "rationale": "Right-frontal excess is associated with anxious presentations.",
            "evidence_grade": "WEAK_OFF_LABEL_FOR_ANXIETY",
            "evidence_caveat": "Right DLPFC 1 Hz rTMS for primary anxiety is off-label; surface only with explicit clinician review.",
            "enabled": True,
        },
    },
    "superiorfrontal": {
        "lh_deficit": {
            "modality": "rTMS", "target": "left DLPFC", "frequency": "10 Hz",
            "rationale": "Left superior frontal hypoactivation is associated with executive-function difficulties.",
            "evidence_grade": "STRONG_FDA_CLEARED",
            "evidence_caveat": "Left DLPFC rTMS at 10 Hz is FDA-cleared for treatment-resistant MDD; executive-function indication is supportive but secondary.",
            "enabled": True,
        },
    },
    "superiortemporal": {
        "lh_deficit": {
            "modality": "tDCS", "target": "left STG (Wernicke)", "montage": "anodal 1 mA",
            "rationale": "Left superior temporal hypoactivation is associated with language-comprehension difficulties.",
            "evidence_grade": "EV-C",
            "evidence_caveat": "Heuristic mapping — pilot-level evidence only.",
            "enabled": True,
        },
    },
    "lateraloccipital": {
        # AUDIT-DISABLED 2026-04-30: tDCS at O1/O2 is NOT supported by any
        # published trial for insomnia or chronic pain. Published tDCS for
        # insomnia uses bifrontal montages; chronic pain uses M1 or DLPFC.
        "bilateral_deficit": {
            "modality": "tDCS", "target": "O1/O2", "montage": "bipolar 1 mA",
            "rationale": "Posterior alpha hypoactivation is associated with sleep and visual-perception complaints.",
            "evidence_grade": "NOT_SUPPORTED_DO_NOT_SURFACE",
            "evidence_caveat": "No published trial uses tDCS at O1/O2 for insomnia or chronic pain. Disabled at v1 pending evidence; do not surface.",
            "enabled": False,
        },
    },
    "precuneus": {
        # AUDIT-DISABLED 2026-04-30: tACS Pz 10 Hz for rumination/depression
        # is investigational — no trial tests this specific mapping.
        "bilateral_excess": {
            "modality": "tACS", "target": "Pz", "frequency": "10 Hz",
            "rationale": "Precuneus excess is associated with rumination patterns; clinician review required.",
            "evidence_grade": "NOT_SUPPORTED_DO_NOT_SURFACE",
            "evidence_caveat": "No published trial tests tACS Pz 10 Hz for rumination or depression. Disabled at v1 pending evidence; do not surface.",
            "enabled": False,
        },
    },
    "rostralanteriorcingulate": {
        "bilateral_deficit": {
            "modality": "rTMS", "target": "DMPFC", "frequency": "10 Hz",
            "rationale": "Anterior cingulate hypoactivation is associated with emotion-regulation difficulties.",
            "evidence_grade": "MODERATE_NO_RCT_OPEN_LABEL_LARGE_SERIES",
            "evidence_caveat": "DMPFC rTMS for ACC hypoactivation: open-label large case series support; no RCT yet. Requires H-coil or neuronavigation.",
            "enabled": True,
        },
    },
    "precentral": {
        # Motor cortex — flag rather than recommend.
        "any_deviation": {
            "modality": "review_only", "target": "M1",
            "rationale": "Motor cortex deviations require clinician review before any neuromodulation protocol is considered.",
            "evidence_grade": "EV-D",
            "evidence_caveat": "Hands-off zone — review-only flag, never a direct suggestion.",
            "enabled": True,
        },
    },
}


def _band_from_z(z: Optional[float]) -> Optional[str]:
    if z is None:
        return None
    if z >= 2.58:
        return "severe_excess"
    if z >= 1.5:
        return "excess"
    if z <= -2.58:
        return "severe_deficit"
    if z <= -1.5:
        return "deficit"
    return None


def _hint_key(hemi: str, band: Optional[str]) -> Optional[str]:
    if not band:
        return None
    if "deficit" in band:
        return f"{hemi}_deficit"
    if "excess" in band:
        return f"{hemi}_excess"
    return None


def suggest_protocols_from_report(report_payload: dict[str, Any]) -> list[dict]:
    """Map a QEEGBrainMapReport payload to ranked protocol suggestions.

    Parameters
    ----------
    report_payload
        A dict matching the QEEGBrainMapReport contract from Phase 0
        (apps/api/app/services/qeeg_report_template.py). Tolerant of
        missing keys.

    Returns
    -------
    list of suggestion dicts with keys: pattern, modality, target,
    rationale, fit_score (0-1), evidence_grade, contraindications,
    required_checks, related_rois.
    """
    if not isinstance(report_payload, dict):
        return []
    dk_atlas = report_payload.get("dk_atlas") or []
    if not isinstance(dk_atlas, list):
        return []

    # Aggregate by ROI: take the largest-magnitude z across hemispheres,
    # but track per-hemisphere band for sign-aware mapping.
    by_roi: dict[str, dict] = {}
    for row in dk_atlas:
        if not isinstance(row, dict):
            continue
        roi = row.get("roi")
        hemi = row.get("hemisphere")
        z = row.get("z_score")
        if roi is None or hemi not in ("lh", "rh") or z is None:
            continue
        try:
            zf = float(z)
        except (TypeError, ValueError):
            continue
        agg = by_roi.setdefault(roi, {"lh_z": None, "rh_z": None, "max_abs": 0.0})
        agg[f"{hemi}_z"] = zf
        if abs(zf) > agg["max_abs"]:
            agg["max_abs"] = abs(zf)

    suggestions: list[dict] = []
    for roi, agg in by_roi.items():
        hints = _DK_ROI_PROTOCOL_HINTS.get(roi)
        if not hints:
            continue
        lh_band = _band_from_z(agg.get("lh_z"))
        rh_band = _band_from_z(agg.get("rh_z"))

        # Try unilateral hints first
        for hemi, band in (("lh", lh_band), ("rh", rh_band)):
            key = _hint_key(hemi, band)
            if key and key in hints:
                hint = hints[key]
                if not hint.get("enabled", True):
                    # Audit-disabled mapping: do not surface (see audit
                    # 2026-04-30, deepsynaps-qeeg-evidence-gaps.md).
                    continue
                suggestions.append({
                    "pattern": f"{roi}_{key}",
                    "modality": hint.get("modality"),
                    "target": hint.get("target"),
                    "frequency": hint.get("frequency"),
                    "montage": hint.get("montage"),
                    "rationale": hint.get("rationale"),
                    "fit_score": min(1.0, agg["max_abs"] / 3.0),
                    "evidence_grade": hint.get("evidence_grade", "EV-C"),
                    "evidence_caveat": hint.get("evidence_caveat"),
                    "contraindications": ["seizure_history"] if hint.get("modality") == "rTMS" else [],
                    "required_checks": [
                        "Verify no seizure history" if hint.get("modality") == "rTMS" else "Inspect scalp at electrode sites",
                        "Confirm assessment by qualified clinician",
                    ],
                    "related_rois": [f"lh.{roi}" if hemi == "lh" else f"rh.{roi}"],
                })

        # Bilateral patterns
        if lh_band and rh_band:
            if "deficit" in lh_band and "deficit" in rh_band and "bilateral_deficit" in hints:
                hint = hints["bilateral_deficit"]
                if hint.get("enabled", True):
                    suggestions.append({
                        "pattern": f"{roi}_bilateral_deficit",
                        "modality": hint.get("modality"),
                        "target": hint.get("target"),
                        "frequency": hint.get("frequency"),
                        "montage": hint.get("montage"),
                        "rationale": hint.get("rationale"),
                        "fit_score": min(1.0, agg["max_abs"] / 3.0),
                        "evidence_grade": hint.get("evidence_grade", "EV-C"),
                        "evidence_caveat": hint.get("evidence_caveat"),
                        "contraindications": ["skin_lesion_at_site"] if hint.get("modality") == "tDCS" else [],
                        "required_checks": [
                            "Inspect scalp at electrode sites" if hint.get("modality") == "tDCS" else "Confirm assessment by qualified clinician",
                        ],
                        "related_rois": [f"lh.{roi}", f"rh.{roi}"],
                    })
            if "excess" in lh_band and "excess" in rh_band and "bilateral_excess" in hints:
                hint = hints["bilateral_excess"]
                if hint.get("enabled", True):
                    suggestions.append({
                        "pattern": f"{roi}_bilateral_excess",
                        "modality": hint.get("modality"),
                        "target": hint.get("target"),
                        "frequency": hint.get("frequency"),
                        "rationale": hint.get("rationale"),
                        "fit_score": min(1.0, agg["max_abs"] / 3.0),
                        "evidence_grade": hint.get("evidence_grade", "EV-C"),
                        "evidence_caveat": hint.get("evidence_caveat"),
                        "contraindications": [],
                        "required_checks": ["Confirm assessment by qualified clinician"],
                        "related_rois": [f"lh.{roi}", f"rh.{roi}"],
                    })

        # Hands-off zones (motor cortex, etc.) — flag any deviation
        if "any_deviation" in hints and (lh_band or rh_band):
            hint = hints["any_deviation"]
            if hint.get("enabled", True):
                suggestions.append({
                    "pattern": f"{roi}_review_required",
                    "modality": hint.get("modality"),
                    "target": hint.get("target"),
                    "rationale": hint.get("rationale"),
                    "fit_score": 0.0,
                    "evidence_grade": hint.get("evidence_grade", "EV-D"),
                    "evidence_caveat": hint.get("evidence_caveat"),
                    "contraindications": [],
                    "required_checks": ["Mandatory clinician review before any protocol selection."],
                    "related_rois": [f"lh.{roi}", f"rh.{roi}"],
                })

    # Rank descending by fit_score, then alphabetical for stability
    suggestions.sort(key=lambda s: (-(s.get("fit_score") or 0.0), s.get("pattern") or ""))
    return suggestions
