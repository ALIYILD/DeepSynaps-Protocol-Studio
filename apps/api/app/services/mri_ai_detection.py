"""AI-assisted MRI abnormality detection with confidence scoring.

Scans biomarker z-scores across structural, diffusion, functional,
and composite categories.  Flags regions exceeding threshold with
hedged, radiologist-safe language.

Decision-support only.  All findings require radiologist review.
Never produces a diagnosis.
"""

from __future__ import annotations

import logging
from typing import Any

_log = logging.getLogger(__name__)

# ── Default detection parameters ─────────────────────────────────────────────

DEFAULT_THRESHOLD_Z = 2.5
DEFAULT_CONFIDENCE_LEVELS = {
    "high": 3.5,       # |z| > 3.5
    "moderate": 2.5,   # 2.5 < |z| <= 3.5
    "low": 2.0,        # 2.0 < |z| <= 2.5
}

# Mapping from biomarker name prefix to human-readable region name
_REGION_NAME_MAP: dict[str, str] = {
    "cortical_thickness_frontal": "frontal cortex",
    "cortical_thickness_temporal": "temporal cortex",
    "cortical_thickness_parietal": "parietal cortex",
    "cortical_thickness_occipital": "occipital cortex",
    "cortical_thickness_cingulate": "cingulate cortex",
    "cortical_thickness_insula": "insula",
    "hippocampal_volume_left": "left hippocampus",
    "hippocampal_volume_right": "right hippocampus",
    "hippocampal_volume_total": "total hippocampal volume",
    "hippocampal_asymmetry": "hippocampal asymmetry",
    "ventricular_volume_lateral_left": "left lateral ventricle",
    "ventricular_volume_lateral_right": "right lateral ventricle",
    "ventricular_volume_third": "third ventricle",
    "ventricular_volume_total_csf": "total CSF volume",
    "amygdala_volume_left": "left amygdala",
    "amygdala_volume_right": "right amygdala",
    "thalamus_volume_left": "left thalamus",
    "thalamus_volume_right": "right thalamus",
    "caudate_volume_left": "left caudate",
    "caudate_volume_right": "right caudate",
    "putamen_volume_left": "left putamen",
    "putamen_volume_right": "right putamen",
    "pallidum_volume_left": "left globus pallidus",
    "pallidum_volume_right": "right globus pallidus",
    "acc_volume_left": "left anterior cingulate",
    "acc_volume_right": "right anterior cingulate",
    "fractional_anisotropy_corpus_callosum": "corpus callosum FA",
    "fractional_anisotropy_corticospinal": "corticospinal tract FA",
    "fractional_anisotropy_superior_longitudinal": "superior longitudinal fasciculus FA",
    "fractional_anisotropy_uncinate": "uncinate fasciculus FA",
    "fractional_anisotropy_fornix": "fornix FA",
    "mean_diffusivity_frontal_wm": "frontal white matter MD",
    "mean_diffusivity_parietal_wm": "parietal white matter MD",
    "mean_diffusivity_temporal_wm": "temporal white matter MD",
    "mean_diffusivity_occipital_wm": "occipital white matter MD",
    "wmh_burden_total": "white matter hyperintensity burden",
    "wmh_fazekas_periventricular": "periventricular WMH (Fazekas)",
    "wmh_fazekas_deep": "deep WMH (Fazekas)",
    "bold_connectivity_dmn": "default mode network connectivity",
    "bold_connectivity_salience": "salience network connectivity",
    "bold_connectivity_cen": "central executive network connectivity",
    "bold_connectivity_language": "language network connectivity",
    "bold_connectivity_sensorimotor": "sensorimotor network connectivity",
    "bold_connectivity_sgacc_dlpfc": "sgACC-DLPFC anticorrelation",
    "brain_age_gap": "brain age gap",
    "atrophy_score_global": "global atrophy score",
    "ventricular_enlargement_index": "ventricular enlargement",
    "cortical_thinning_index": "cortical thinning index",
    "hippocampal_reduction_index": "hippocampal reduction index",
}


# ── Public API ───────────────────────────────────────────────────────────────


def detect_abnormalities(
    analysis_data: dict[str, Any],
    threshold_z: float = DEFAULT_THRESHOLD_Z,
) -> list[dict[str, Any]]:
    """Detect regions with abnormal z-scores across all biomarker categories.

    Parameters
    ----------
    analysis_data:
        Parsed MRI analysis JSON.  May contain keys at any depth
        (structural, diffusion, functional, composite).
    threshold_z:
        Absolute z-score threshold for flagging (default 2.5).

    Returns
    -------
    list[dict]
        Flagged findings sorted by confidence (highest first).
        Each finding carries hedged, radiologist-safe language.
    """
    findings: list[dict[str, Any]] = []

    # Flatten the data for scanning
    flat_data = _flatten_analysis_data(analysis_data)

    for region_key, data in flat_data.items():
        z = _extract_z_score(data)
        if z is None:
            continue
        if abs(z) > threshold_z:
            human_name = _REGION_NAME_MAP.get(region_key, region_key.replace("_", " "))
            evidence_grade = _extract_evidence_grade(data)
            value = _extract_value(data)

            findings.append({
                "region_key": region_key,
                "region_name": human_name,
                "z_score": round(z, 2),
                "abs_z_score": round(abs(z), 2),
                "direction": "reduced" if z < 0 else "elevated",
                "category": _categorize_region(region_key),
                "confidence": _z_to_confidence_level(abs(z)),
                "evidence_grade": evidence_grade,
                "requires_review": True,
                "value": value,
                "safe_language": _safe_language(human_name, z, value),
            })

    # Sort by confidence priority: high > moderate > low
    _confidence_order = {"high": 0, "moderate": 1, "low": 2}
    findings.sort(key=lambda f: (_confidence_order.get(f["confidence"], 3), -f["abs_z_score"]))

    return findings


def detect_abnormalities_by_category(
    analysis_data: dict[str, Any],
    threshold_z: float = DEFAULT_THRESHOLD_Z,
) -> dict[str, list[dict[str, Any]]]:
    """Detect abnormalities grouped by biomarker category.

    Same as :func:`detect_abnormalities` but results are grouped
    under keys: ``structural``, ``diffusion``, ``white_matter``,
    ``functional``, ``composite``.
    """
    all_findings = detect_abnormalities(analysis_data, threshold_z)
    grouped: dict[str, list[dict[str, Any]]] = {
        "structural": [],
        "diffusion": [],
        "white_matter": [],
        "functional": [],
        "composite": [],
    }
    for finding in all_findings:
        cat = finding.get("category", "structural")
        grouped.setdefault(cat, []).append(finding)
    return grouped


def get_detection_summary(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """Generate a summary of AI-detected findings.

    Parameters
    ----------
    findings:
        Output from :func:`detect_abnormalities`.

    Returns
    -------
    dict
        Counts by confidence, category, and direction; plus a
        human-readable summary string.
    """
    total = len(findings)
    by_confidence: dict[str, int] = {"high": 0, "moderate": 0, "low": 0}
    by_category: dict[str, int] = {}
    by_direction: dict[str, int] = {"reduced": 0, "elevated": 0}

    for f in findings:
        conf = f.get("confidence", "low")
        by_confidence[conf] = by_confidence.get(conf, 0) + 1
        cat = f.get("category", "unknown")
        by_category[cat] = by_category.get(cat, 0) + 1
        direction = f.get("direction", "unknown")
        by_direction[direction] = by_direction.get(direction, 0) + 1

    high_priority = by_confidence["high"]
    summary_parts: list[str] = []
    if total == 0:
        summary_parts.append("No abnormalities detected above threshold.")
    else:
        summary_parts.append(
            f"{total} finding(s) detected: "
            f"{by_confidence['high']} high, "
            f"{by_confidence['moderate']} moderate, "
            f"{by_confidence['low']} low confidence."
        )
        if high_priority > 0:
            summary_parts.append(
                f"{high_priority} high-confidence finding(s) require "
                f"urgent radiologist review."
            )

    return {
        "total_findings": total,
        "by_confidence": by_confidence,
        "by_category": by_category,
        "by_direction": by_direction,
        "summary": " ".join(summary_parts),
        "safety_note": (
            "AI findings are decision support only. "
            "All flagged regions require radiologist review. "
            "Not a diagnostic device."
        ),
        "requires_clinical_correlation": True,
    }


# ── Internal helpers ─────────────────────────────────────────────────────────


def _flatten_analysis_data(data: dict[str, Any]) -> dict[str, Any]:
    """Flatten nested analysis data into a flat dict keyed by region name.

    Handles the various payload shapes from the MRI pipeline:
    - structural.cortical_thickness_mm.dlpfc_l = {value: 2.31, z: -1.8, ...}
    - structural.subcortical_volume_mm3.hippocampus_l = {value: 3400, z: -1.1, ...}
    - functional.networks[] = [{network: "DMN", mean_within_fc: {value: 0.41, z: -1.3}}]
    - diffusion.bundles[] = [{bundle: "UF_L", mean_FA: {value: 0.41, z: -1.9}}]
    """
    flat: dict[str, Any] = {}
    if not isinstance(data, dict):
        return flat

    structural = data.get("structural") or {}
    if isinstance(structural, dict):
        # Cortical thickness
        ct = structural.get("cortical_thickness_mm") or {}
        if isinstance(ct, dict):
            for key, val in ct.items():
                flat[key] = val
        # Subcortical volumes
        sv = structural.get("subcortical_volume_mm3") or {}
        if isinstance(sv, dict):
            for key, val in sv.items():
                flat[key] = val
        # Top-level scalar values
        for scalar_key in ["wmh_volume_ml", "ventricular_volume_ml", "icv_ml"]:
            if scalar_key in structural:
                flat[scalar_key] = structural[scalar_key]
        # Brain age
        ba = structural.get("brain_age") or {}
        if isinstance(ba, dict):
            flat["brain_age"] = ba

    functional = data.get("functional") or {}
    if isinstance(functional, dict):
        networks = functional.get("networks") or []
        if isinstance(networks, list):
            for net in networks:
                if isinstance(net, dict) and "network" in net:
                    net_name = net["network"]
                    flat[f"network_{net_name}"] = net.get("mean_within_fc", net)
        sgacc = functional.get("sgACC_DLPFC_anticorrelation")
        if sgacc is not None:
            flat["sgACC_DLPFC_anticorrelation"] = sgacc

    diffusion = data.get("diffusion") or {}
    if isinstance(diffusion, dict):
        bundles = diffusion.get("bundles") or []
        if isinstance(bundles, list):
            for bundle in bundles:
                if isinstance(bundle, dict) and "bundle" in bundle:
                    bname = bundle["bundle"]
                    flat[f"bundle_{bname}"] = bundle

    return flat


def _extract_z_score(data: Any) -> float | None:
    """Extract a numeric z-score from a biomarker data node."""
    if isinstance(data, dict):
        # Direct z field
        z = data.get("z")
        if z is not None:
            try:
                return float(z)
            except (TypeError, ValueError):
                pass
        # z_score field
        z = data.get("z_score")
        if z is not None:
            try:
                return float(z)
            except (TypeError, ValueError):
                pass
        # Nested within a metric dict
        for nested_key in ["mean_FA", "mean_MD", "mean_within_fc"]:
            nested = data.get(nested_key)
            if isinstance(nested, dict):
                z = nested.get("z")
                if z is not None:
                    try:
                        return float(z)
                    except (TypeError, ValueError):
                        pass
        # Brain age gap
        gap = data.get("brain_age_gap_years")
        if gap is not None:
            try:
                return float(gap)
            except (TypeError, ValueError):
                pass
    elif isinstance(data, (int, float)):
        # Scalar value -- cannot compute z without mean/std
        return None
    return None


def _extract_evidence_grade(data: Any) -> str:
    """Extract evidence grade from a biomarker data node (default D)."""
    if isinstance(data, dict):
        return data.get("evidence_grade", "D")
    return "D"


def _extract_value(data: Any) -> Any:
    """Extract the raw measurement value from a biomarker data node."""
    if isinstance(data, dict):
        for key in ["value", "brain_age_gap_years", "predicted_age_years"]:
            if key in data:
                return data[key]
        # Nested value lookup
        for nested_key in ["mean_FA", "mean_MD", "mean_within_fc"]:
            nested = data.get(nested_key)
            if isinstance(nested, dict) and "value" in nested:
                return nested["value"]
    return data


def _z_to_confidence_level(z_abs: float) -> str:
    """Map absolute z-score to confidence level string."""
    if z_abs > DEFAULT_CONFIDENCE_LEVELS["high"]:
        return "high"
    if z_abs > DEFAULT_CONFIDENCE_LEVELS["moderate"]:
        return "moderate"
    return "low"


def _categorize_region(region_key: str) -> str:
    """Map a region key to its biomarker category."""
    if region_key.startswith(("cortical_thickness", "hippocampal", "ventricular",
                              "amygdala", "thalamus", "caudate", "putamen",
                              "pallidum", "acc_volume", "icv", "brain_age")):
        return "structural"
    if region_key.startswith(("fractional_anisotropy", "mean_diffusivity", "bundle_")):
        return "diffusion"
    if region_key.startswith(("wmh_",)):
        return "white_matter"
    if region_key.startswith(("network_", "sgACC", "bold_connectivity")):
        return "functional"
    if region_key in ("brain_age_gap", "atrophy_score", "ventricular_enlargement_index",
                       "cortical_thinning_index", "hippocampal_reduction_index"):
        return "composite"
    return "structural"  # default


def _safe_language(region_name: str, z: float, value: Any) -> str:
    """Generate hedged, radiologist-safe language for a finding.

    Never says "diagnosis" or "abnormal".  Uses "finding requiring review"
    and "possible" framing per the MRI safety protocol.
    """
    direction = "reduced" if z < 0 else "elevated"
    confidence = _z_to_confidence_level(abs(z))

    # Build the safe-language statement
    parts = [
        f"{region_name} shows {direction} signal",
    ]
    if value is not None:
        parts.append(f"(value={value}, z={z:.1f})")
    else:
        parts.append(f"(z={z:.1f})")

    if confidence == "high":
        parts.append("-- notable finding requiring radiologist review.")
    elif confidence == "moderate":
        parts.append("-- possible finding requiring radiologist review.")
    else:
        parts.append("-- subtle change; consider in clinical context.")

    parts.append("Not a diagnosis.")
    return " ".join(parts)
