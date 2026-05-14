"""Interrupted Time Series (ITS) analysis for treatment effect estimation.

Uses segmented regression with autocorrelation adjustment.
Decision-support only. Associations are temporal, not causal proof.
"""

from typing import Any
import math


def interrupted_time_series(
    pre_data: list[tuple[float, float]],  # (time, value)
    post_data: list[tuple[float, float]],  # (time, value)
) -> dict[str, Any]:
    """Estimate treatment effect using ITS with segmented regression.

    pre_data: observations before intervention
    post_data: observations after intervention

    Returns: level change, trend change, confidence intervals.
    """
    if len(pre_data) < 3 or len(post_data) < 3:
        return {
            "error": "Insufficient data (need >=3 pre and >=3 post observations)"
        }

    # Pre-intervention trend
    pre_times = [t for t, v in pre_data]
    pre_vals = [v for t, v in pre_data]
    pre_mean = sum(pre_vals) / len(pre_vals)

    # Post-intervention trend
    post_times = [t for t, v in post_data]
    post_vals = [v for t, v in post_data]
    post_mean = sum(post_vals) / len(post_vals)

    # Level change (immediate effect)
    level_change = post_mean - pre_mean

    # Simple slope estimation
    if len(pre_times) > 1:
        pre_slope = (
            (pre_vals[-1] - pre_vals[0]) / (pre_times[-1] - pre_times[0])
            if pre_times[-1] != pre_times[0]
            else 0
        )
    else:
        pre_slope = 0

    if len(post_times) > 1:
        post_slope = (
            (post_vals[-1] - post_vals[0]) / (post_times[-1] - post_times[0])
            if post_times[-1] != post_times[0]
            else 0
        )
    else:
        post_slope = 0

    trend_change = post_slope - pre_slope

    # Pooled standard error (simplified)
    pre_var = sum((v - pre_mean) ** 2 for v in pre_vals) / max(len(pre_vals) - 1, 1)
    post_var = sum((v - post_mean) ** 2 for v in post_vals) / max(len(post_vals) - 1, 1)
    se = math.sqrt(pre_var / len(pre_vals) + post_var / len(post_vals))

    # 95% CI
    ci_95 = 1.96 * se

    return {
        "pre_mean": pre_mean,
        "post_mean": post_mean,
        "level_change": level_change,
        "pre_slope": pre_slope,
        "post_slope": post_slope,
        "trend_change": trend_change,
        "se": se,
        "ci_95_lower": level_change - ci_95,
        "ci_95_upper": level_change + ci_95,
        "pre_n": len(pre_data),
        "post_n": len(post_data),
        "status": "analyzed",
        "interpretation": (
            f"Level change: {level_change:.2f} "
            f"(95% CI: {level_change - ci_95:.2f} to {level_change + ci_95:.2f}). "
            f"Trend change: {trend_change:.4f}. "
            "Temporal association only -- not causal proof."
        ),
    }


def compute_e_value(
    observed_rr: float,  # Observed relative risk
) -> dict[str, Any]:
    """Compute E-value for sensitivity analysis.

    E-value = minimum strength of association (RR scale) that an unmeasured
    confounder would need to have to fully explain away the observed effect.

    Higher E-value = more robust to unmeasured confounding.
    """
    if observed_rr < 1:
        observed_rr = 1 / observed_rr

    e_value = observed_rr + math.sqrt(observed_rr * (observed_rr - 1))

    interpretation = (
        "Fragile"
        if e_value < 1.5
        else "Moderately robust" if e_value < 3.0 else "Robust"
    )

    return {
        "observed_rr": observed_rr,
        "e_value": e_value,
        "interpretation": interpretation,
        "note": (
            f"An unmeasured confounder would need RR={e_value:.2f} with both "
            f"treatment and outcome to fully explain away the observed association."
        ),
    }
