"""Personal baseline and deviation (z-score style)."""

from __future__ import annotations

from statistics import mean, pstdev

from deepsynaps_biometrics.schemas import PersonalBaselineProfile


def estimate_personal_baseline_and_deviation(
    values: list[float],
    *,
    user_id: str,
    feature_name: str,
    window_days: int,
    effective_from_utc: str,
) -> tuple[PersonalBaselineProfile, float]:
    """Return baseline profile + z-score of last value vs window."""
    clean = [v for v in values if v is not None]
    if len(clean) < 3:
        raise ValueError("Need at least 3 points for a minimal baseline")
    m = mean(clean[:-1])
    sd = pstdev(clean[:-1]) or 1.0
    last = clean[-1]
    z = (last - m) / sd
    profile = PersonalBaselineProfile(
        user_id=user_id,
        feature_name=feature_name,
        mean=m,
        std=sd,
        window_days=window_days,
        effective_from_utc=effective_from_utc,
        n_days_used=len(clean) - 1,
        method="rolling_mean_pstdev",
    )
    return profile, z
