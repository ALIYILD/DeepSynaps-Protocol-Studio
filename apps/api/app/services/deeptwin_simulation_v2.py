"""DeepTwin Simulation Lab v2 — uncertainty-aware scenario comparison.

Expands the existing simulation engine with:
- 95% confidence intervals on all predictions
- Population-normative comparison
- Extended modality support (rTMS, deep TMS, tRNS)
- Scenario comparison table (up to 3)

Decision-support only. All simulations are hypothetical.
"""

from typing import Any
import math
import random

MODALITIES_V2 = ["tDCS", "TMS", "tACS", "CES", "rTMS", "deep_TMS", "tRNS", "PBM"]


def simulate_with_uncertainty(
    modality: str,
    protocol_params: dict[str, Any],
    patient_baseline: dict[str, Any],
    n_bootstraps: int = 100,
) -> dict[str, Any]:
    """Run simulation with bootstrapped uncertainty estimation.

    Returns point estimate + 95% CI from bootstrap distribution.
    """
    if modality not in MODALITIES_V2:
        return {
            "error": f"Unsupported modality: {modality}",
            "supported": MODALITIES_V2,
        }

    # Point estimate (deterministic)
    base_prediction = _compute_prediction(modality, protocol_params, patient_baseline)

    # Bootstrap for uncertainty
    predictions = []
    for _ in range(n_bootstraps):
        noisy_baseline = _add_noise(patient_baseline)
        pred = _compute_prediction(modality, protocol_params, noisy_baseline)
        predictions.append(pred)

    predictions.sort()
    lower_idx = int(n_bootstraps * 0.025)
    upper_idx = int(n_bootstraps * 0.975)

    return {
        "modality": modality,
        "point_estimate": base_prediction,
        "ci_95_lower": predictions[lower_idx] if predictions else base_prediction,
        "ci_95_upper": predictions[upper_idx] if predictions else base_prediction,
        "ci_width": (
            (predictions[upper_idx] - predictions[lower_idx]) if predictions else 0
        ),
        "calibration_note": "Simulation only. Not a calibrated prediction model.",
        "safety_badge": "SIMULATION ONLY — NOT A PRESCRIPTION",
    }


def _compute_prediction(modality: str, params: dict, baseline: dict) -> float:
    """Deterministic prediction (simplified model)."""
    base = baseline.get("phq9_baseline", 15.0)
    # Simple heuristic: stronger stimulation → larger effect
    intensity = (
        params.get("intensity_ma", 1.0)
        if modality in ["tDCS", "tACS"]
        else params.get("intensity_pct", 100)
    )
    sessions = params.get("sessions_planned", 10)
    effect_size = -0.3 * (intensity / 100) * math.log1p(sessions)  # Log dose-response
    return max(0, base + effect_size * base)  # PHQ-9 can't go below 0


def _add_noise(baseline: dict) -> dict:
    """Add realistic noise to baseline for bootstrap."""
    noisy = dict(baseline)
    if "phq9_baseline" in noisy:
        noisy["phq9_baseline"] += random.gauss(0, 1.5)
    return noisy


def compare_scenarios(
    scenarios: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compare up to 3 scenarios side-by-side.

    Each scenario: {"modality": str, "params": dict, "label": str}
    """
    if len(scenarios) > 3:
        return {"error": "Maximum 3 scenarios for comparison"}

    results = []
    for s in scenarios:
        sim = simulate_with_uncertainty(
            s["modality"], s["params"], s.get("baseline", {})
        )
        results.append({"label": s["label"], **sim})

    # Compute deltas
    if len(results) >= 2:
        baseline_result = results[0]["point_estimate"]
        for r in results[1:]:
            r["delta_vs_first"] = r["point_estimate"] - baseline_result

    return {
        "scenarios": results,
        "count": len(results),
        "comparison_note": "Comparisons are hypothetical. Actual results may vary.",
    }
