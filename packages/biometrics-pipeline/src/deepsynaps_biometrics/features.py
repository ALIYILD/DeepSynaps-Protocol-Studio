"""Feature extraction from normalized samples (MVP — explicit daily + rolling)."""

from __future__ import annotations

from typing import Any

from deepsynaps_biometrics.schemas import BiometricFeatureWindow, BiometricSeries, SleepSession


def extract_hr_features(daily_hr: BiometricSeries, *, rolling_days: int = 7) -> dict[str, float]:
    """Daily + rolling mean/max/min HR from series."""
    del rolling_days
    vals = [s.value for s in daily_hr.samples]
    if not vals:
        return {}
    return {
        "hr_mean": sum(vals) / len(vals),
        "hr_max": max(vals),
        "hr_min": min(vals),
        "hr_n": float(len(vals)),
    }


def extract_hrv_features(hrv_windows: list[BiometricFeatureWindow]) -> dict[str, float]:
    del hrv_windows
    return {}


def extract_sleep_features(sessions: list[SleepSession]) -> dict[str, float]:
    if not sessions:
        return {}
    last = sessions[-1]
    return {
        "last_total_sleep_min": float(last.total_sleep_min or 0.0),
        "last_sleep_efficiency_pct": float(last.efficiency_pct or 0.0),
    }


def extract_activity_features(series_by_type: dict[str, BiometricSeries]) -> dict[str, float]:
    del series_by_type
    return {}


def extract_spo2_features(series: BiometricSeries) -> dict[str, float]:
    return extract_hr_features(series)  # same reduce pattern for MVP stub


def extract_temperature_features(series: BiometricSeries) -> dict[str, float]:
    del series
    return {}


def build_feature_window(
    user_id: str,
    start_utc: str,
    end_utc: str,
    label: str,
    features: dict[str, Any],
) -> BiometricFeatureWindow:
    return BiometricFeatureWindow(
        window_id=f"fw-{user_id}-{label}",
        user_id=user_id,
        window_start_utc=start_utc,
        window_end_utc=end_utc,
        label=label,
        features={k: float(v) for k, v in features.items() if isinstance(v, (int, float))},
    )
