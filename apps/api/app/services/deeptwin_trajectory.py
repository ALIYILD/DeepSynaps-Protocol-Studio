"""Multi-horizon trajectory estimation with widening confidence intervals.

Horizons: 2w, 6w, 12w, 26w
Uncertainty increases with horizon (square-root scaling).
"""

from typing import Any
import math

HORIZONS = {"2w": 14, "6w": 42, "12w": 84, "26w": 182}


def estimate_trajectory(
    historical_scores: list[tuple[float, float]],  # (time_days, score)
    horizon_key: str = "6w",
) -> dict[str, Any]:
    """Estimate trajectory at specified horizon with confidence intervals.

    Uses linear extrapolation with uncertainty widening by sqrt(horizon).
    """
    if not historical_scores or len(historical_scores) < 2:
        return {
            "error": "Need ≥2 historical data points",
            "status": "insufficient_data",
        }

    # Linear trend
    n = len(historical_scores)
    times = [t for t, s in historical_scores]
    scores = [s for t, s in historical_scores]

    mean_t = sum(times) / n
    mean_s = sum(scores) / n

    slope = (
        sum(
            (t - mean_t) * (s - mean_s) for t, s in historical_scores
        )
        / sum((t - mean_t) ** 2 for t in times)
        if sum((t - mean_t) ** 2 for t in times) > 0
        else 0
    )
    intercept = mean_s - slope * mean_t

    # Predict at horizon
    horizon_days = HORIZONS.get(horizon_key, 42)
    last_time = times[-1]
    prediction = intercept + slope * (last_time + horizon_days)

    # CI widens with sqrt(horizon)
    residuals = [s - (intercept + slope * t) for t, s in historical_scores]
    mse = sum(r**2 for r in residuals) / max(len(residuals) - 2, 1)
    se = math.sqrt(mse)

    # Uncertainty scales with sqrt of forecast distance
    forecast_distance = horizon_days / max(times[-1] - times[0], 1)
    ci_multiplier = 1.96 * se * math.sqrt(1 + forecast_distance)

    return {
        "horizon": horizon_key,
        "horizon_days": horizon_days,
        "predicted_score": prediction,
        "ci_95_lower": prediction - ci_multiplier,
        "ci_95_upper": prediction + ci_multiplier,
        "trend_slope": slope,
        "trend_direction": (
            "improving"
            if slope < -0.01
            else "stable"
            if slope < 0.01
            else "worsening"
        ),
        "historical_n": n,
        "calibration_note": "Trajectory is extrapolation. Not a calibrated prediction model.",
        "status": "estimated",
    }
