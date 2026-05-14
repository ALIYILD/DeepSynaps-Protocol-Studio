"""
Mobility Analysis Pipeline
==========================
Process step counts, GPS radius of gyration, and active/sedentary minutes
into clinical-grade mobility features for digital phenotyping.

Mobility patterns serve as proxies for functional status, depression severity,
social engagement, and treatment response in psychiatric and neurological conditions.

References
----------
- Canzian & Musolesi (2015) - Trajectories of depression
- Saeb et al. (2015) - Mobile phone sensor correlates of depression severity
- Wang et al. (2018) - CrossCheck: schizophrenia relapses and mobility
"""

import numpy as np
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple


def _detect_outliers(values: np.ndarray, z_thresh: float = 2.5) -> np.ndarray:
    """Detect outliers using modified Z-score based on MAD."""
    arr = np.asarray(values, dtype=float)
    if len(arr) <= 2:
        return np.ones(len(arr), dtype=bool)
    median = np.median(arr)
    mad = np.median(np.abs(arr - median))
    if mad == 0:
        return np.ones(len(arr), dtype=bool)
    modified_z = 0.6745 * (arr - median) / mad
    return np.abs(modified_z) < z_thresh


def _compute_trend(values: List[float]) -> Tuple[str, float]:
    """Compute linear trend direction and slope.

    Returns
    -------
    (direction, slope) where direction is 'increasing', 'decreasing', or 'stable'.
    """
    if len(values) < 3:
        return "stable", 0.0
    x = np.arange(len(values))
    y = np.array(values)
    # Simple linear regression
    x_mean, y_mean = np.mean(x), np.mean(y)
    denom = np.sum((x - x_mean) ** 2)
    if denom == 0:
        return "stable", 0.0
    slope = np.sum((x - x_mean) * (y - y_mean)) / denom
    if slope > np.std(y) * 0.1:
        return "increasing", float(slope)
    elif slope < -np.std(y) * 0.1:
        return "decreasing", float(slope)
    return "stable", float(slope)


def _grade_mobility(value: float, metric: str) -> str:
    """Assign clinical evidence grade for mobility metrics.

    Parameters
    ----------
    value : float
        Metric value.
    metric : str
        One of: steps, radius, active_ratio, weekend_diff.
    """
    if metric == "steps":
        if value >= 8000:
            return "A"
        elif value >= 5000:
            return "B"
        elif value >= 3000:
            return "C"
        return "D"
    elif metric == "radius":
        if value >= 2.0:
            return "A"
        elif value >= 1.0:
            return "B"
        elif value >= 0.5:
            return "C"
        return "D"
    elif metric == "active_ratio":
        if value >= 0.3:
            return "A"
        elif value >= 0.2:
            return "B"
        elif value >= 0.1:
            return "C"
        return "D"
    elif metric == "weekend_diff":
        if value < 1000:
            return "A"
        elif value < 3000:
            return "B"
        elif value < 5000:
            return "C"
        return "D"
    return "C"


def analyze_mobility_signals(
    daily_entries: List[dict],
    days: int = 7,
) -> Dict[str, Any]:
    """Analyze mobility signals and extract clinical-grade features.

    Parameters
    ----------
    daily_entries : list of dict
        Each dict contains:
        - "date": ISO-8601 date string
        - "steps": int, daily step count
        - "gps_radius_km": float, radius of gyration in km
        - "active_minutes": int, minutes of moderate+ activity
        - "sedentary_minutes": int, minutes of sedentary behavior
        - "locations_visited": int, number of unique locations
        - "home_time_hours": float, hours spent at home
        - "confidence": float, data quality confidence 0-1
    days : int
        Analysis window in days.

    Returns
    -------
    dict
        Structured mobility features with evidence grades and safe wording.
    """
    # ------------------------------------------------------------------
    # Edge case: no data
    # ------------------------------------------------------------------
    if not daily_entries:
        return {
            "mobility_features": {},
            "activity_features": {},
            "evidence_summary": "No mobility data available for the requested period.",
            "safe_clinical_summary": (
                "No mobility data was recorded. Physical activity and mobility patterns "
                "are clinically relevant for functional status assessment. Consider "
                "recommending patient-reported measures (e.g., IPAQ, SF-36 physical function)."
            ),
            "data_quality": {"status": "no_data", "entries": 0, "days": days},
        }

    # ------------------------------------------------------------------
    # Parse entries
    # ------------------------------------------------------------------
    dates = []
    steps = []
    radii = []
    active_min = []
    sedentary_min = []
    locations = []
    home_hours = []
    confidences = []

    for entry in daily_entries:
        try:
            date = datetime.fromisoformat(entry["date"].replace("Z", "+00:00")).date()
        except (ValueError, KeyError, AttributeError):
            continue

        step_count = entry.get("steps", np.nan)
        radius = entry.get("gps_radius_km", np.nan)
        active = entry.get("active_minutes", np.nan)
        sedentary = entry.get("sedentary_minutes", np.nan)
        locs = entry.get("locations_visited", np.nan)
        home_h = entry.get("home_time_hours", np.nan)
        conf = entry.get("confidence", 0.7)

        # Skip entries with all NaN values
        if all(np.isnan(v) for v in [step_count, radius, active, sedentary]):
            continue

        dates.append(date)
        steps.append(step_count if not np.isnan(step_count) else 0)
        radii.append(radius if not np.isnan(radius) else 0)
        active_min.append(active if not np.isnan(active) else 0)
        sedentary_min.append(sedentary if not np.isnan(sedentary) else 0)
        locations.append(int(locs) if not np.isnan(locs) else 0)
        home_hours.append(home_h if not np.isnan(home_h) else 0)
        confidences.append(conf)

    n_valid = len(dates)
    if n_valid < 1:
        return {
            "mobility_features": {},
            "activity_features": {},
            "evidence_summary": "Mobility data present but no valid entries after quality filtering.",
            "safe_clinical_summary": (
                "Mobility records were found but could not be validated. "
                "Consider supplementary patient-reported functional assessments."
            ),
            "data_quality": {
                "status": "insufficient_data",
                "entries": len(daily_entries),
                "valid_entries": 0,
            },
        }

    # ------------------------------------------------------------------
    # Outlier removal
    # ------------------------------------------------------------------
    steps_arr = np.array(steps, dtype=float)
    radii_arr = np.array(radii, dtype=float)
    active_arr = np.array(active_min, dtype=float)
    sedentary_arr = np.array(sedentary_min, dtype=float)

    steps_mask = _detect_outliers(steps_arr)
    radii_mask = _detect_outliers(radii_arr)

    steps_clean = steps_arr[steps_mask]
    radii_clean = radii_arr[radii_mask]

    # ------------------------------------------------------------------
    # Core metrics
    # ------------------------------------------------------------------
    avg_steps = float(np.mean(steps_clean)) if len(steps_clean) > 0 else float(np.mean(steps_arr))
    steps_trend, steps_slope = _compute_trend(steps)

    avg_radius = float(np.mean(radii_clean)) if len(radii_clean) > 0 else float(np.mean(radii_arr))

    active_total = float(np.sum(active_arr))
    sedentary_total = float(np.sum(sedentary_arr))
    active_ratio = active_total / (active_total + sedentary_total) if (active_total + sedentary_total) > 0 else 0

    avg_locations = float(np.mean([l for l in locations if l > 0])) if any(l > 0 for l in locations) else 0
    avg_home_hours = float(np.mean([h for h in home_hours if h > 0])) if any(h > 0 for h in home_hours) else 0

    # ------------------------------------------------------------------
    # Weekday vs Weekend analysis
    # ------------------------------------------------------------------
    weekday_steps = []
    weekend_steps = []
    weekday_active = []
    weekend_active = []
    weekday_radius = []
    weekend_radius = []

    for i, d in enumerate(dates):
        if d.weekday() >= 5:  # Saturday=5, Sunday=6
            weekend_steps.append(steps_arr[i])
            weekend_active.append(active_arr[i])
            weekend_radius.append(radii_arr[i])
        else:
            weekday_steps.append(steps_arr[i])
            weekday_active.append(active_arr[i])
            weekday_radius.append(radii_arr[i])

    weekend_step_diff = 0.0
    if len(weekday_steps) >= 1 and len(weekend_steps) >= 1:
        weekend_step_diff = abs(float(np.mean(weekday_steps)) - float(np.mean(weekend_steps)))

    weekend_active_diff = 0.0
    if len(weekday_active) >= 1 and len(weekend_active) >= 1:
        weekend_active_diff = abs(float(np.mean(weekday_active)) - float(np.mean(weekend_active)))

    # ------------------------------------------------------------------
    # Variability metrics (coefficient of variation)
    # ------------------------------------------------------------------
    steps_cv = float(np.std(steps_arr) / np.mean(steps_arr)) if np.mean(steps_arr) > 0 else 0
    radius_cv = float(np.std(radii_arr) / np.mean(radii_arr)) if np.mean(radii_arr) > 0 else 0

    # ------------------------------------------------------------------
    # Confidence scoring
    # ------------------------------------------------------------------
    base_confidence = min(0.95, 0.5 + 0.04 * n_valid + 0.1 * np.mean(confidences))
    if days < 3:
        base_confidence *= 0.7

    # ------------------------------------------------------------------
    # Evidence summary generation
    # ------------------------------------------------------------------
    evidence_lines = []
    safe_lines = []

    if avg_steps >= 8000:
        evidence_lines.append(
            f"Daily step count ({avg_steps:.0f}) meets activity guidelines "
            "(Grade A evidence for cardiovascular and mental health benefits)."
        )
        safe_lines.append("Physical activity levels appear adequate.")
    elif avg_steps >= 5000:
        evidence_lines.append(
            f"Daily step count ({avg_steps:.0f}) is moderate. "
            "Sedentary behavior reduction is associated with improved mood outcomes (Grade B)."
        )
        safe_lines.append("Physical activity is moderate; increased movement may be beneficial.")
    elif avg_steps >= 3000:
        evidence_lines.append(
            f"Daily step count ({avg_steps:.0f}) is below guidelines. "
            "Low step counts correlate with depression severity (Grade B evidence)."
        )
        safe_lines.append("Physical activity is below recommended levels.")
    else:
        evidence_lines.append(
            f"Daily step count ({avg_steps:.0f}) is very low. "
            "Severe mobility restriction may indicate functional impairment, social withdrawal, "
            "or acute psychiatric symptoms (Grade B evidence)."
        )
        safe_lines.append(
            "Physical activity is markedly reduced. This pattern may indicate functional impairment "
            "or social withdrawal."
        )

    if avg_radius < 1.0 and n_valid >= 3:
        evidence_lines.append(
            f"GPS radius of gyration ({avg_radius:.1f} km) is restricted. "
            "Reduced mobility range is associated with depressive episodes (Grade B)."
        )
        safe_lines.append("Mobility range is limited.")

    if steps_trend == "decreasing" and len(steps) >= 5:
        evidence_lines.append(
            "Declining step trend over the observation period may signal symptom worsening "
            "or medication side effects (Grade C)."
        )
        safe_lines.append("Activity levels appear to be declining over time.")

    evidence_lines.append(
        "Mobility features from passive sensing are validated biomarkers for "
        "depression severity tracking (Grade B evidence)."
    )

    # ------------------------------------------------------------------
    # Build response
    # ------------------------------------------------------------------
    return {
        "mobility_features": {
            "avg_daily_steps": {
                "value": round(avg_steps),
                "unit": "steps",
                "grade": _grade_mobility(avg_steps, "steps"),
                "confidence": round(base_confidence, 2),
                "ref_range": ">8000",
                "n_valid": n_valid,
            },
            "steps_trend": {
                "value": steps_trend,
                "slope": round(steps_slope, 2),
                "unit": "steps/day",
                "grade": "B",
                "confidence": round(min(0.85, base_confidence - 0.1), 2),
            },
            "steps_variability_cv": {
                "value": round(steps_cv, 2),
                "unit": "coefficient_of_variation",
                "grade": "B",
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": "<0.5",
            },
            "gps_radius_avg_km": {
                "value": round(avg_radius, 1),
                "unit": "km",
                "grade": _grade_mobility(avg_radius, "radius"),
                "confidence": round(min(0.90, base_confidence - 0.05), 2),
                "ref_range": ">2",
            },
            "locations_visited_avg": {
                "value": round(avg_locations, 1) if avg_locations > 0 else None,
                "unit": "count",
                "grade": "B",
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": ">3",
                "note": None if avg_locations > 0 else "Location data not available",
            },
            "home_time_avg_hours": {
                "value": round(avg_home_hours, 1) if avg_home_hours > 0 else None,
                "unit": "hours",
                "grade": "C" if avg_home_hours > 16 else "B",
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": "<12",
                "note": None if avg_home_hours > 0 else "Home time data not available",
            },
        },
        "activity_features": {
            "avg_active_minutes": {
                "value": round(float(np.mean(active_arr))),
                "unit": "min",
                "grade": "A" if float(np.mean(active_arr)) >= 30 else "B",
                "confidence": round(min(0.85, base_confidence - 0.1), 2),
                "ref_range": ">30",
            },
            "avg_sedentary_minutes": {
                "value": round(float(np.mean(sedentary_arr))),
                "unit": "min",
                "grade": "C" if float(np.mean(sedentary_arr)) > 600 else "B",
                "confidence": round(min(0.85, base_confidence - 0.1), 2),
                "ref_range": "<600",
            },
            "active_sedentary_ratio": {
                "value": round(active_ratio, 2),
                "unit": "ratio",
                "grade": _grade_mobility(active_ratio, "active_ratio"),
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": ">0.3",
            },
        },
        "weekend_weekday_features": {
            "weekend_step_difference": {
                "value": round(weekend_step_diff),
                "unit": "steps",
                "grade": _grade_mobility(weekend_step_diff, "weekend_diff"),
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": "<1000",
            },
            "weekend_active_min_difference": {
                "value": round(weekend_active_diff),
                "unit": "min",
                "grade": "B",
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": "<20",
            },
        },
        "evidence_summary": " ".join(evidence_lines),
        "safe_clinical_summary": (
            "Mobility patterns may support functional status assessment. "
            + " ".join(safe_lines)
            + " Reduced physical activity and restricted mobility range are associated "
            "with depressive symptoms in research studies. Requires clinical correlation."
        ),
        "data_quality": {
            "status": "valid",
            "entries": len(daily_entries),
            "valid_entries": n_valid,
            "analysis_days": days,
            "outliers_removed_steps": int(np.sum(~steps_mask)),
        },
    }


def batch_analyze_mobility(
    participant_mobility_map: Dict[str, List[dict]],
    days: int = 7,
) -> Dict[str, Any]:
    """Run mobility analysis across multiple participants.

    Parameters
    ----------
    participant_mobility_map : dict
        Mapping of participant_id -> list of daily mobility entries.
    days : int
        Analysis window in days.

    Returns
    -------
    dict
        Mapping of participant_id -> analysis results.
    """
    results = {}
    for participant_id, entries in participant_mobility_map.items():
        results[participant_id] = analyze_mobility_signals(entries, days=days)
    return results
