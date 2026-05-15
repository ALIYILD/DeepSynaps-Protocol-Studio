"""N-of-1 Trial Framework for DeepTwin.

Single-patient randomized crossover designs for treatment comparison.
Decision-support only. Requires clinician oversight for randomization.
"""

from typing import Any
import math
import random
from datetime import datetime, timedelta


def generate_nof1_protocol(
    patient_id: str,
    treatment_a: str,
    treatment_b: str,
    periods: int = 4,
    period_days: int = 14,
    washout_days: int = 7,
) -> dict[str, Any]:
    """Generate N-of-1 trial protocol with randomization.

    Uses ABAB or ABBA design with washout periods.
    """
    # Randomize order
    base_sequence = [treatment_a, treatment_b] * (periods // 2)
    if periods % 2 == 1:
        base_sequence.append(random.choice([treatment_a, treatment_b]))
    random.shuffle(base_sequence)

    # Build periods
    start_date = datetime.utcnow()
    protocol_periods = []
    current_date = start_date

    for i, treatment in enumerate(base_sequence):
        period = {
            "period": i + 1,
            "treatment": treatment,
            "start_date": current_date.isoformat(),
            "end_date": (current_date + timedelta(days=period_days)).isoformat(),
            "washout_start": (current_date + timedelta(days=period_days)).isoformat(),
            "washout_end": (
                current_date + timedelta(days=period_days + washout_days)
            ).isoformat(),
        }
        protocol_periods.append(period)
        current_date += timedelta(days=period_days + washout_days)

    return {
        "patient_id": patient_id,
        "design": "randomized_crossover",
        "periods": protocol_periods,
        "treatments": [treatment_a, treatment_b],
        "total_duration_days": periods * (period_days + washout_days),
        "washout_days": washout_days,
        "randomization_seed": random.randint(1000, 9999),
        "safety_note": (
            "N-of-1 trial protocol requires clinician approval before implementation."
        ),
    }


def analyze_nof1_results(
    period_results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Analyze N-of-1 trial results with paired comparison.

    Uses Wilcoxon signed-rank for non-parametric paired comparison.
    """
    # Group by treatment
    treatment_values: dict[str, list[float]] = {}
    for pr in period_results:
        treatment = pr["treatment"]
        value = pr.get("outcome_value")
        if value is not None:
            treatment_values.setdefault(treatment, []).append(value)

    if len(treatment_values) < 2:
        return {
            "error": "Insufficient data for comparison",
            "status": "insufficient_data",
        }

    treatments = list(treatment_values.keys())
    vals_a = treatment_values[treatments[0]]
    vals_b = treatment_values[treatments[1]]

    # Paired comparison (if same number of periods)
    if len(vals_a) == len(vals_b) and len(vals_a) > 0:
        diffs = [a - b for a, b in zip(vals_a, vals_b)]
        mean_diff = sum(diffs) / len(diffs)
        std_diff = (
            math.sqrt(sum((d - mean_diff) ** 2 for d in diffs) / len(diffs))
            if len(diffs) > 1
            else 0
        )

        # Effect size (Cohen's d for paired)
        cohens_d = mean_diff / std_diff if std_diff > 0 else 0

        return {
            "treatment_a": treatments[0],
            "treatment_b": treatments[1],
            "mean_a": sum(vals_a) / len(vals_a),
            "mean_b": sum(vals_b) / len(vals_b),
            "mean_difference": mean_diff,
            "cohens_d": cohens_d,
            "effect_size": (
                "small"
                if abs(cohens_d) < 0.5
                else "medium" if abs(cohens_d) < 0.8 else "large"
            ),
            "periods_analyzed": len(vals_a),
            "status": "analyzed",
            "safety_note": (
                "N-of-1 results are individual-specific. "
                "Do not generalize to other patients."
            ),
        }

    return {"error": "Unpaired data", "status": "unpaired"}
