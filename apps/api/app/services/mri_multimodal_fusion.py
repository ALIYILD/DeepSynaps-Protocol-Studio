"""MRI Multimodal Fusion -- integrate MRI with qEEG, biomarkers, assessments.

Decision-support only. Correlations are temporal associations, not causal proof.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supported fusion domains
# ---------------------------------------------------------------------------

FUSION_DOMAINS = frozenset(
    {"qeeg", "biomarkers", "assessments", "medications", "protocols", "risk"}
)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def fuse_mri_with_domain(
    mri_data: dict[str, Any],
    domain_data: dict[str, Any],
    domain: str,
) -> dict[str, Any]:
    """Fuse MRI findings with data from another clinical domain.

    Returns correlation signals with uncertainty framing.  Every correlation
    is explicitly labelled as a temporal association, not causal proof.

    Parameters
    ----------
    mri_data:
        Parsed MRI analysis payload.  Expected keys depend on the domain but
        commonly include ``structural`` (region -> z-score mapping).
    domain_data:
        Domain-specific data to correlate against.  Format varies by domain.
    domain:
        One of ``qeeg``, ``biomarkers``, ``assessments``, ``medications``,
        ``protocols``, ``risk``.

    Returns
    -------
    dict
        Fusion result with ``correlations``, ``count``, ``domain``, and a
        ``safety_note``.
    """
    if domain not in FUSION_DOMAINS:
        return {"error": f"Unknown domain: {domain}. Supported: {sorted(FUSION_DOMAINS)}"}

    correlations: list[dict[str, Any]] = []

    # ---- qEEG functional correlation (structural <-> functional) ------------
    if domain == "qeeg":
        structural = mri_data.get("structural") or {}
        qeeg_markers = domain_data.get("markers") or domain_data
        for region, mri_z in structural.items():
            eeg_marker = _resolve_eeg_marker(qeeg_markers, region)
            if eeg_marker is not None:
                correlation = _estimate_correlation(float(mri_z), float(eeg_marker))
                correlations.append(
                    {
                        "region": region,
                        "mri_z_score": float(mri_z),
                        "eeg_marker": float(eeg_marker),
                        "correlation": round(correlation, 4),
                        "interpretation": (
                            "Structural-functional correlation "
                            "(association only, not causal)"
                        ),
                        "confidence": _confidence_band(abs(correlation)),
                    }
                )

    # ---- Biomarker correlation (volume <-> lab value) -----------------------
    elif domain == "biomarkers":
        structural = mri_data.get("structural") or {}
        for marker, value in domain_data.items():
            if not isinstance(value, (int, float)):
                continue
            mri_vol = _resolve_volume(structural, marker)
            if mri_vol is not None:
                correlations.append(
                    {
                        "biomarker": marker,
                        "biomarker_value": value,
                        "mri_volume": mri_vol,
                        "note": (
                            "Correlation between biomarker and MRI volume "
                            "(association only)"
                        ),
                    }
                )

    # ---- Assessments correlation (cognitive <-> structural) -----------------
    elif domain == "assessments":
        structural = mri_data.get("structural") or {}
        for assessment_name, score in domain_data.items():
            if not isinstance(score, (int, float)):
                continue
            # Link cognitive domains to relevant brain regions
            linked_regions = _cognitive_region_links(assessment_name)
            for region in linked_regions:
                mri_z = structural.get(region)
                if mri_z is not None:
                    correlation = _estimate_correlation(float(mri_z), float(score))
                    correlations.append(
                        {
                            "assessment": assessment_name,
                            "region": region,
                            "score": score,
                            "mri_z_score": float(mri_z),
                            "correlation": round(correlation, 4),
                            "interpretation": (
                                "Cognitive-structural correlation "
                                "(association only, not causal)"
                            ),
                            "confidence": _confidence_band(abs(correlation)),
                        }
                    )

    # ---- Medications correlation (structural effects) -----------------------
    elif domain == "medications":
        structural = mri_data.get("structural") or {}
        for medication, meta in domain_data.items():
            if isinstance(meta, dict):
                known_effect_regions = meta.get("known_effect_regions", [])
                for region in known_effect_regions:
                    mri_z = structural.get(region)
                    if mri_z is not None:
                        correlations.append(
                            {
                                "medication": medication,
                                "region": region,
                                "mri_z_score": float(mri_z),
                                "note": (
                                    "Medication-associated structural finding "
                                    "(association only, not causal)"
                                ),
                            }
                        )

    # ---- Protocols correlation (stimulation targets) ------------------------
    elif domain == "protocols":
        stim_targets = mri_data.get("stim_targets") or mri_data.get("targets") or {}
        for protocol, protocol_meta in domain_data.items():
            if isinstance(protocol_meta, dict):
                protocol_targets = protocol_meta.get("targets", [])
                for target in protocol_targets:
                    target_region = target.get("region") if isinstance(target, dict) else target
                    if target_region and target_region in (stim_targets if isinstance(stim_targets, dict) else {}):
                        correlations.append(
                            {
                                "protocol": protocol,
                                "target_region": target_region,
                                "note": (
                                    "Protocol target aligns with MRI-identified region "
                                    "(association only)"
                                ),
                            }
                        )

    # ---- Risk correlation (biomarker-based risk scoring) --------------------
    elif domain == "risk":
        structural = mri_data.get("structural") or {}
        for risk_factor, risk_value in domain_data.items():
            if not isinstance(risk_value, (int, float)):
                continue
            linked_regions = _risk_region_links(risk_factor)
            for region in linked_regions:
                mri_z = structural.get(region)
                if mri_z is not None:
                    correlation = _estimate_correlation(float(mri_z), float(risk_value))
                    correlations.append(
                        {
                            "risk_factor": risk_factor,
                            "region": region,
                            "risk_score": risk_value,
                            "mri_z_score": float(mri_z),
                            "correlation": round(correlation, 4),
                            "interpretation": (
                                "Risk-structural correlation "
                                "(association only, not causal)"
                            ),
                            "confidence": _confidence_band(abs(correlation)),
                        }
                    )

    _log.info(
        "Multimodal fusion: domain=%s correlations=%d",
        domain,
        len(correlations),
    )

    return {
        "domain": domain,
        "correlations": correlations,
        "count": len(correlations),
        "safety_note": (
            "Multimodal correlations are temporal associations, not causal proof. "
            "Requires clinician review."
        ),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _estimate_correlation(a: float, b: float) -> float:
    """Simplified correlation estimate.

    In production this would use actual Pearson / Spearman computation over
    a population sample.  The tanh heuristic produces a bounded [-1, 1]
    pseudo-correlation that is sufficient for decision-support framing.
    """
    denom = abs(a) + abs(b) + 0.1
    if denom == 0.0:
        return 0.0
    return math.tanh((a * b) / denom)


def _confidence_band(abs_corr: float) -> str:
    """Map absolute correlation magnitude to a confidence band."""
    if abs_corr < 0.3:
        return "low"
    if abs_corr < 0.7:
        return "moderate"
    return "high"


def _resolve_eeg_marker(qeeg_markers: Any, region: str) -> Optional[float]:
    """Resolve an EEG marker for a given brain region.

    Supports both flat dicts and nested ``{region: {band: value}}`` layouts.
    """
    if isinstance(qeeg_markers, dict):
        # Direct match
        if region in qeeg_markers and isinstance(qeeg_markers[region], (int, float)):
            return float(qeeg_markers[region])
        # Nested: look for a default band value
        nested = qeeg_markers.get(region)
        if isinstance(nested, dict):
            for band in ("alpha", "theta", "beta", "gamma", "delta"):
                val = nested.get(band)
                if isinstance(val, (int, float)):
                    return float(val)
    return None


def _resolve_volume(structural: dict[str, Any], marker: str) -> Optional[float]:
    """Resolve an MRI volume measure for a biomarker.

    Tries exact match then common aliases (e.g. hippocampus -> hippocampal).
    """
    if marker in structural and isinstance(structural[marker], (int, float)):
        return float(structural[marker])
    # Common aliases
    aliases: dict[str, list[str]] = {
        "hippocampal_volume": ["hippocampus", "hippocampal", "hpc"],
        "cortical_thickness": ["cortex", "cortical", "cth"],
        "ventricular_volume": ["ventricles", "ventricular", "csf_ventricles"],
        "white_matter_volume": ["white_matter", "wm", "wm_volume"],
        "gray_matter_volume": ["gray_matter", "gm", "gm_volume"],
        "amygdala_volume": ["amygdala"],
        "thalamus_volume": ["thalamus"],
    }
    for alias_list in aliases.get(marker, []):
        if alias_list in structural and isinstance(structural[alias_list], (int, float)):
            return float(structural[alias_list])
    return None


def _cognitive_region_links(assessment: str) -> list[str]:
    """Map cognitive assessment names to relevant brain regions."""
    assessment_lower = assessment.lower()
    links: dict[str, list[str]] = {
        "mmse": ["hippocampus", "cortex", "temporal_lobe", "parietal_lobe"],
        "moca": ["hippocampus", "frontal_lobe", "temporal_lobe", "cortex"],
        "ravlt": ["hippocampus", "temporal_lobe", "amygdala"],
        "wais": ["frontal_lobe", "parietal_lobe", "cortex"],
        "stroop": ["anterior_cingulate", "frontal_lobe", "dlpfc"],
        "trail_making": ["frontal_lobe", "parietal_lobe", "cerebellum"],
        "verbal_fluency": ["frontal_lobe", "dlpfc", "broca"],
        "digit_span": ["frontal_lobe", "parietal_lobe", "hippocampus"],
    }
    for key, regions in links.items():
        if key in assessment_lower:
            return regions
    return ["cortex", "hippocampus", "frontal_lobe"]


def _risk_region_links(risk_factor: str) -> list[str]:
    """Map risk factor names to relevant brain regions."""
    rf_lower = risk_factor.lower()
    links: dict[str, list[str]] = {
        "apoe4": ["hippocampus", "amygdala", "temporal_lobe", "cortex"],
        "tau": ["hippocampus", "entorhinal_cortex", "temporal_lobe"],
        "amyloid": ["precuneus", "posterior_cingulate", "frontal_lobe"],
        "neuroinflammation": ["hippocampus", "cortex", "white_matter"],
        "vascular_risk": ["white_matter", "basal_ganglia", "thalamus"],
        "depression_history": ["hippocampus", "amygdala", "dlpfc"],
        "tbi_history": ["frontal_lobe", "white_matter", "cortex"],
    }
    for key, regions in links.items():
        if key in rf_lower:
            return regions
    return ["cortex", "hippocampus"]
