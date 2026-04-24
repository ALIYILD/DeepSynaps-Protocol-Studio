"""Asymmetry analyses — full matrix, frontal dominance, delta dominance, severity.

Registered analyses:
  asymmetry/full_asymmetry_matrix
  asymmetry/frontal_alpha_dominance
  asymmetry/delta_dominance
  asymmetry/regional_asymmetry_severity
"""
from __future__ import annotations

from typing import Any

import numpy as np

from app.services.analyses._engine import register_analysis
from app.services.analyses._helpers import (
    DEFAULT_BANDS,
    HOMOLOGOUS_PAIRS,
    compute_band_power_from_psd,
    safe_log_ratio,
)


# ── 7. Full Asymmetry Matrix ─────────────────────────────────────────────────

@register_analysis("asymmetry", "full_asymmetry_matrix", "Full Asymmetry Matrix")
def full_asymmetry_matrix(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute ln(Right) - ln(Left) asymmetry for all homologous pairs
    across all frequency bands.

    Positive = right > left (relative left hypoactivation).
    """
    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]

    ch_idx_map = {ch: i for i, ch in enumerate(ch_names)}
    matrix: dict[str, dict[str, float]] = {}

    for left, right in HOMOLOGOUS_PAIRS:
        if left not in ch_idx_map or right not in ch_idx_map:
            continue
        pair_key = f"{left}_{right}"
        pair_asym: dict[str, float] = {}

        for bname, (fmin, fmax) in DEFAULT_BANDS.items():
            l_power = float(compute_band_power_from_psd(
                freqs, psd[ch_idx_map[left]:ch_idx_map[left]+1], fmin, fmax
            )[0])
            r_power = float(compute_band_power_from_psd(
                freqs, psd[ch_idx_map[right]:ch_idx_map[right]+1], fmin, fmax
            )[0])
            pair_asym[bname] = round(safe_log_ratio(r_power, l_power), 4)

        matrix[pair_key] = pair_asym

    return {
        "data": {"pairs": matrix, "method": "ln(Right) - ln(Left)"},
        "summary": f"Asymmetry computed for {len(matrix)} pairs across {len(DEFAULT_BANDS)} bands",
    }


# ── 8. Frontal Alpha Dominance Classification ────────────────────────────────

@register_analysis("asymmetry", "frontal_alpha_dominance", "Frontal Alpha Dominance")
def frontal_alpha_dominance(ctx: dict[str, Any]) -> dict[str, Any]:
    """Classify frontal alpha dominance pattern.

    Patterns:
    - Left dominant: more alpha left → healthy/approach motivation
    - Right dominant: more alpha left deficit → withdrawal/depression risk
    - Symmetric: balanced
    """
    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]
    ch_idx_map = {ch: i for i, ch in enumerate(ch_names)}

    frontal_pairs = [("F3", "F4"), ("F7", "F8"), ("Fp1", "Fp2")]
    results: dict[str, Any] = {}

    for left, right in frontal_pairs:
        if left not in ch_idx_map or right not in ch_idx_map:
            continue

        l_alpha = float(compute_band_power_from_psd(
            freqs, psd[ch_idx_map[left]:ch_idx_map[left]+1], 8.0, 12.0
        )[0])
        r_alpha = float(compute_band_power_from_psd(
            freqs, psd[ch_idx_map[right]:ch_idx_map[right]+1], 8.0, 12.0
        )[0])

        faa = safe_log_ratio(r_alpha, l_alpha)

        # Classification
        if abs(faa) < 0.1:
            dominance = "symmetric"
        elif faa > 0:
            dominance = "right_dominant"  # more alpha on right = left hypoactivation
        else:
            dominance = "left_dominant"

        results[f"{left}_{right}"] = {
            "faa": round(faa, 4),
            "left_alpha_uv2": round(l_alpha, 4),
            "right_alpha_uv2": round(r_alpha, 4),
            "dominance": dominance,
        }

    # Overall classification
    faa_values = [v["faa"] for v in results.values()]
    mean_faa = round(np.mean(faa_values), 4) if faa_values else 0.0
    if abs(mean_faa) < 0.1:
        overall = "symmetric"
    elif mean_faa > 0:
        overall = "right_dominant"
    else:
        overall = "left_dominant"

    return {
        "data": {
            "pairs": results,
            "mean_faa": mean_faa,
            "overall_dominance": overall,
        },
        "summary": f"Frontal alpha: {overall} (mean FAA={mean_faa})",
    }


# ── 9. Delta Dominance Laterality ────────────────────────────────────────────

@register_analysis("asymmetry", "delta_dominance", "Delta Dominance Laterality")
def delta_dominance(ctx: dict[str, Any]) -> dict[str, Any]:
    """Assess lateralized delta power excess — can indicate focal pathology
    (e.g., TBI, stroke) or structural lesion.
    """
    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]
    ch_idx_map = {ch: i for i, ch in enumerate(ch_names)}

    pair_results: dict[str, Any] = {}

    for left, right in HOMOLOGOUS_PAIRS:
        if left not in ch_idx_map or right not in ch_idx_map:
            continue

        l_delta = float(compute_band_power_from_psd(
            freqs, psd[ch_idx_map[left]:ch_idx_map[left]+1], 0.5, 4.0
        )[0])
        r_delta = float(compute_band_power_from_psd(
            freqs, psd[ch_idx_map[right]:ch_idx_map[right]+1], 0.5, 4.0
        )[0])

        asym = safe_log_ratio(r_delta, l_delta)

        pair_results[f"{left}_{right}"] = {
            "left_delta_uv2": round(l_delta, 4),
            "right_delta_uv2": round(r_delta, 4),
            "asymmetry": round(asym, 4),
            "lateralized": abs(asym) > 0.2,
            "dominant_side": "right" if asym > 0.2 else ("left" if asym < -0.2 else "none"),
        }

    lateralized_count = sum(1 for v in pair_results.values() if v["lateralized"])

    return {
        "data": {
            "pairs": pair_results,
            "lateralized_pairs": lateralized_count,
        },
        "summary": f"Delta lateralization detected in {lateralized_count}/{len(pair_results)} pairs",
    }


# ── 10. Regional Asymmetry Severity ──────────────────────────────────────────

@register_analysis("asymmetry", "regional_asymmetry_severity", "Regional Asymmetry Severity")
def regional_asymmetry_severity(ctx: dict[str, Any]) -> dict[str, Any]:
    """Score asymmetry severity by brain region (frontal, central, temporal,
    parietal, occipital) using alpha-band asymmetry magnitude.

    Severity levels: normal (< 0.1), mild (0.1-0.2), moderate (0.2-0.4), severe (> 0.4).
    """
    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]
    ch_idx_map = {ch: i for i, ch in enumerate(ch_names)}

    # Map pairs to regions
    region_pairs = {
        "frontal": [("Fp1", "Fp2"), ("F3", "F4"), ("F7", "F8")],
        "central": [("C3", "C4")],
        "temporal": [("T3", "T4"), ("T5", "T6")],
        "parietal": [("P3", "P4")],
        "occipital": [("O1", "O2")],
    }

    regions_data: dict[str, Any] = {}

    for region, pairs in region_pairs.items():
        asymmetries = []
        for left, right in pairs:
            if left not in ch_idx_map or right not in ch_idx_map:
                continue
            l_alpha = float(compute_band_power_from_psd(
                freqs, psd[ch_idx_map[left]:ch_idx_map[left]+1], 8.0, 12.0
            )[0])
            r_alpha = float(compute_band_power_from_psd(
                freqs, psd[ch_idx_map[right]:ch_idx_map[right]+1], 8.0, 12.0
            )[0])
            asymmetries.append(abs(safe_log_ratio(r_alpha, l_alpha)))

        if not asymmetries:
            continue

        mean_asym = np.mean(asymmetries)
        max_asym = max(asymmetries)

        if mean_asym < 0.1:
            severity = "normal"
        elif mean_asym < 0.2:
            severity = "mild"
        elif mean_asym < 0.4:
            severity = "moderate"
        else:
            severity = "severe"

        regions_data[region] = {
            "mean_asymmetry": round(float(mean_asym), 4),
            "max_asymmetry": round(float(max_asym), 4),
            "severity": severity,
            "pairs_evaluated": len(asymmetries),
        }

    # Overall severity
    severities = [v["severity"] for v in regions_data.values()]
    severity_order = {"normal": 0, "mild": 1, "moderate": 2, "severe": 3}
    worst = max(severities, key=lambda s: severity_order.get(s, 0)) if severities else "normal"

    return {
        "data": {
            "regions": regions_data,
            "overall_severity": worst,
        },
        "summary": f"Worst regional asymmetry: {worst}",
    }
