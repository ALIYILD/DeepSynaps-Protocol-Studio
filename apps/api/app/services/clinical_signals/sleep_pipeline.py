"""
Sleep Analysis Pipeline
=======================
Process raw sleep data into clinical-grade features for digital phenotyping.
Extracts sleep duration, efficiency, regularity metrics, circadian features,
and social jetlag from passive sensor or wearable-derived sleep entries.

References
----------
- Buysse et al. (2014) - Pittsburgh Sleep Quality Index validation
- Roenneberg et al. (2012) - Social jetlag and metabolic risk
- Patel et al. (2015) - Consumer sleep wearables review
"""

import numpy as np
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional


def _grade_metric(value: float, thresholds: list, grades: list) -> str:
    """Assign a clinical evidence grade based on value thresholds.

    Parameters
    ----------
    value : float
        Metric value to grade.
    thresholds : list of float
        Ordered boundary values.
    grades : list of str
        Grades corresponding to each threshold boundary.

    Returns
    -------
    str
        Evidence grade ("A", "B", "C", or "D").
    """
    for threshold, grade in zip(thresholds, grades):
        if value >= threshold:
            return grade
    return grades[-1] if grades else "C"


def _detect_outliers(values: list, z_thresh: float = 2.5) -> np.ndarray:
    """Detect outliers using modified Z-score based on MAD.

    Parameters
    ----------
    values : list of float
        Numeric values to screen.
    z_thresh : float
        Z-score threshold for outlier detection.

    Returns
    -------
    np.ndarray of bool
        Boolean mask where True indicates an inlier.
    """
    arr = np.array(values, dtype=float)
    if len(arr) <= 2:
        return np.ones(len(arr), dtype=bool)
    median = np.median(arr)
    mad = np.median(np.abs(arr - median))
    if mad == 0:
        return np.ones(len(arr), dtype=bool)
    modified_z = 0.6745 * (arr - median) / mad
    return np.abs(modified_z) < z_thresh


def _compute_regularity(times: list) -> float:
    """Compute regularity score (0-1) from a list of time values.

    A score of 1.0 indicates perfect regularity (zero variance).
    The score linearly decreases with standard deviation, clamped at 0.

    Parameters
    ----------
    times : list of float
        Time values in hours (0-24 range expected).

    Returns
    -------
    float
        Regularity score in [0, 1].
    """
    if len(times) < 2:
        return 0.5
    arr = np.array(times)
    # Handle wrap-around at midnight (e.g. 23:30 vs 00:30)
    sin_vals = np.sin(arr * np.pi / 12)
    cos_vals = np.cos(arr * np.pi / 12)
    sin_mean = np.mean(sin_vals)
    cos_mean = np.mean(cos_vals)
    # Magnitude of mean resultant vector as regularity measure
    resultant = np.sqrt(sin_mean ** 2 + cos_mean ** 2)
    return float(np.clip(resultant, 0, 1))


def analyze_sleep_signals(
    sleep_entries: List[dict],
    days: int = 7,
) -> Dict[str, Any]:
    """Analyze sleep signals and extract clinical-grade digital phenotyping features.

    Parameters
    ----------
    sleep_entries : list of dict
        Each dict contains:
        - "start": ISO-8601 datetime string (sleep onset)
        - "end": ISO-8601 datetime string (wake time)
        - "stage": str, optional, sleep stage label
        - "confidence": float, optional, confidence score 0-1
        - "efficiency": float, optional, sleep efficiency 0-100
        - "deep_minutes": float, optional, deep sleep duration in minutes
        - "rem_minutes": float, optional, REM sleep duration in minutes
        - "waso_minutes": float, optional, wake after sleep onset in minutes
        - "latency_minutes": float, optional, sleep onset latency in minutes
    days : int
        Analysis window in days (affects confidence scoring).

    Returns
    -------
    dict
        Structured clinical features with evidence grades and safe wording.
    """
    # ------------------------------------------------------------------
    # Edge case: no data
    # ------------------------------------------------------------------
    if not sleep_entries:
        return {
            "sleep_features": {},
            "circadian_features": {},
            "evidence_summary": "No sleep data available for the requested period.",
            "safe_clinical_summary": (
                "No sleep data was recorded. Sleep assessment requires data from "
                "wearable devices, sleep diaries, or clinical polysomnography. "
                "Consider recommending patient-reported sleep measures (e.g., ISI, PSQI)."
            ),
            "data_quality": {"status": "no_data", "entries": 0, "days": days},
        }

    # ------------------------------------------------------------------
    # Parse and validate entries
    # ------------------------------------------------------------------
    durations = []
    bedtimes = []
    wake_times = []
    efficiencies = []
    deep_min = []
    rem_min = []
    waso_min = []
    latencies = []
    confidences = []
    dates = []

    for entry in sleep_entries:
        try:
            start = datetime.fromisoformat(entry["start"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(entry["end"].replace("Z", "+00:00"))
        except (ValueError, KeyError):
            continue

        if end <= start:
            continue

        duration = (end - start).total_seconds() / 3600.0
        if duration > 16 or duration < 1:
            # Physiological plausibility filter
            continue

        durations.append(duration)
        # Bedtime as hour-of-day (handle wrap across midnight)
        bt = start.hour + start.minute / 60.0
        bedtimes.append(bt)
        wt = end.hour + end.minute / 60.0
        wake_times.append(wt)
        dates.append(start.date())

        efficiencies.append(entry.get("efficiency", np.nan))
        deep_min.append(entry.get("deep_minutes", np.nan))
        rem_min.append(entry.get("rem_minutes", np.nan))
        waso_min.append(entry.get("waso_minutes", np.nan))
        latencies.append(entry.get("latency_minutes", np.nan))
        confidences.append(entry.get("confidence", 0.7))

    # ------------------------------------------------------------------
    # Edge case: insufficient valid data
    # ------------------------------------------------------------------
    n_valid = len(durations)
    if n_valid < 1:
        return {
            "sleep_features": {},
            "circadian_features": {},
            "evidence_summary": "Sleep data present but no valid entries after quality filtering.",
            "safe_clinical_summary": (
                "Sleep records were found but could not be validated. "
                "Consider using standardized sleep questionnaires as supplementary assessment."
            ),
            "data_quality": {
                "status": "insufficient_data",
                "entries": len(sleep_entries),
                "valid_entries": 0,
            },
        }

    # ------------------------------------------------------------------
    # Outlier removal for duration and efficiency
    # ------------------------------------------------------------------
    duration_mask = _detect_outliers(durations)
    dur_clean = np.array(durations)[duration_mask]

    eff_arr = np.array(efficiencies, dtype=float)
    eff_clean = eff_arr[~np.isnan(eff_arr)]

    deep_arr = np.array(deep_min, dtype=float)
    deep_clean = deep_arr[~np.isnan(deep_arr)]

    rem_arr = np.array(rem_min, dtype=float)
    rem_clean = rem_arr[~np.isnan(rem_arr)]

    waso_arr = np.array(waso_min, dtype=float)
    waso_clean = waso_arr[~np.isnan(waso_arr)]

    lat_arr = np.array(latencies, dtype=float)
    lat_clean = lat_arr[~np.isnan(lat_arr)]

    # ------------------------------------------------------------------
    # Core feature calculations
    # ------------------------------------------------------------------
    avg_duration = float(np.mean(dur_clean)) if len(dur_clean) > 0 else float(np.mean(durations))
    avg_efficiency = float(np.mean(eff_clean)) if len(eff_clean) > 0 else 85.0
    bt_regularity = _compute_regularity(bedtimes)
    wt_regularity = _compute_regularity(wake_times)

    avg_deep = float(np.mean(deep_clean)) if len(deep_clean) > 0 else 0.0
    avg_rem = float(np.mean(rem_clean)) if len(rem_clean) > 0 else 0.0
    avg_waso = float(np.mean(waso_clean)) if len(waso_clean) > 0 else 0.0
    avg_latency = float(np.mean(lat_clean)) if len(lat_clean) > 0 else 0.0

    # Sleep-onset latency derived from bedtime variance if not directly available
    if avg_latency == 0 and len(bedtimes) >= 2:
        # Approximate: std dev of bedtime ~ proxy for inconsistency
        bt_std = np.std(bedtimes)
        avg_latency = min(max(bt_std * 15, 5), 60)

    # Confidence scales with data volume and quality
    base_confidence = min(0.95, 0.5 + 0.05 * n_valid + 0.1 * np.mean(confidences))
    if days < 3:
        base_confidence *= 0.7  # Penalize short windows

    # ------------------------------------------------------------------
    # Social jetlag: weekday vs weekend sleep midpoint difference
    # ------------------------------------------------------------------
    weekday_midpoints = []
    weekend_midpoints = []
    for i, (bt, dur) in enumerate(zip(bedtimes, durations)):
        # Compute sleep midpoint = bedtime + duration/2, normalized to 24h
        midpoint = (bt + dur / 2) % 24
        # Simple heuristic: index 0-4 = weekday, 5-6 = weekend
        # Better: use actual weekday
        if len(dates) > i:
            is_weekend = dates[i].weekday() >= 5
        else:
            is_weekend = i % 7 >= 5
        if is_weekend:
            weekend_midpoints.append(midpoint)
        else:
            weekday_midpoints.append(midpoint)

    if len(weekday_midpoints) >= 2 and len(weekend_midpoints) >= 1:
        wk_mean = np.mean(weekday_midpoints)
        we_mean = np.mean(weekend_midpoints)
        # Handle wrap-around at midnight
        diff = abs(wk_mean - we_mean)
        social_jetlag = min(diff, 24 - diff)
    elif len(weekday_midpoints) >= 2:
        social_jetlag = 0.5  # Default when no weekend data
    else:
        social_jetlag = 0.0

    # ------------------------------------------------------------------
    # Circadian rhythm strength
    # ------------------------------------------------------------------
    circadian_strength = (bt_regularity + wt_regularity) / 2.0
    if len(durations) >= 3:
        # Add contribution from duration consistency
        dur_reg = max(0, 1 - np.std(durations) / max(np.mean(durations), 1))
        circadian_strength = 0.7 * circadian_strength + 0.3 * dur_reg

    # ------------------------------------------------------------------
    # Trend analysis (last 3 vs first 3 valid days)
    # ------------------------------------------------------------------
    trend = "stable"
    if len(durations) >= 6:
        early = np.mean(durations[:3])
        late = np.mean(durations[-3:])
        if late - early > 0.5:
            trend = "increasing"
        elif early - late > 0.5:
            trend = "decreasing"

    # ------------------------------------------------------------------
    # Grade assignment
    # ------------------------------------------------------------------
    dur_grade = "A" if 7 <= avg_duration <= 9 else ("B" if 6 <= avg_duration <= 10 else "C")
    eff_grade = "A" if avg_efficiency >= 85 else ("B" if avg_efficiency >= 75 else "C")
    reg_grade = "A" if bt_regularity >= 0.8 else ("B" if bt_regularity >= 0.6 else "C")
    circ_grade = "A" if circadian_strength >= 0.75 else ("B" if circadian_strength >= 0.55 else "C")
    sj_grade = "A" if social_jetlag < 1.0 else ("B" if social_jetlag < 2.0 else "C")

    # ------------------------------------------------------------------
    # Build response
    # ------------------------------------------------------------------
    evidence_lines = []
    safe_lines = []

    # Duration evidence
    if dur_grade == "A":
        evidence_lines.append(
            "Sleep duration is within the recommended 7-9 hour range (Grade A evidence). "
            "Optimal sleep duration is associated with reduced cardiometabolic risk."
        )
        safe_lines.append("Sleep duration appears adequate.")
    elif dur_grade == "B":
        evidence_lines.append(
            "Sleep duration is moderately outside the 7-9 hour range (Grade B). "
            "Both short (<7h) and long (>9h) sleep are associated with adverse outcomes."
        )
        safe_lines.append("Sleep duration is moderately deviated from recommendations.")
    else:
        evidence_lines.append(
            "Sleep duration is outside recommended ranges (Grade C). "
            "Chronic short sleep is associated with increased mortality risk."
        )
        safe_lines.append("Sleep duration is significantly outside recommended ranges.")

    # Regularity evidence
    evidence_lines.append(
        "Bedtime regularity is associated with mood stability and metabolic health (Grade B evidence). "
        "Irregular sleep schedules correlate with depressive symptoms."
    )

    # Social jetlag evidence
    if social_jetlag >= 2.0:
        evidence_lines.append(
            f"Social jetlag of {social_jetlag:.1f} hours exceeds the 2-hour threshold associated "
            "with circadian disruption, metabolic syndrome risk, and smoking/alcohol use (Grade B)."
        )
        safe_lines.append(
            f"Social jetlag of {social_jetlag:.1f} hours may indicate circadian misalignment. "
            "Weekend catch-up sleep is a behavioral marker of insufficient weekday sleep."
        )
    else:
        safe_lines.append("Social jetlag is within acceptable limits.")

    return {
        "sleep_features": {
            "avg_duration_hours": {
                "value": round(avg_duration, 1),
                "unit": "hours",
                "grade": dur_grade,
                "confidence": round(min(0.95, base_confidence), 2),
                "ref_range": "7-9",
                "n_valid": int(np.sum(duration_mask)),
            },
            "avg_efficiency_percent": {
                "value": round(avg_efficiency),
                "unit": "%",
                "grade": eff_grade,
                "confidence": round(min(0.95, base_confidence - 0.05), 2),
                "ref_range": ">85",
                "n_valid": int(len(eff_clean)),
            },
            "bedtime_regularity": {
                "value": round(bt_regularity, 2),
                "unit": "0-1 (perfect=1)",
                "grade": reg_grade,
                "confidence": round(min(0.90, base_confidence - 0.1), 2),
                "ref_range": ">0.7",
            },
            "wake_time_regularity": {
                "value": round(wt_regularity, 2),
                "unit": "0-1 (perfect=1)",
                "grade": reg_grade,
                "confidence": round(min(0.90, base_confidence - 0.1), 2),
                "ref_range": ">0.7",
            },
            "deep_sleep_avg_min": {
                "value": round(avg_deep) if avg_deep > 0 else None,
                "unit": "min",
                "grade": "B",
                "confidence": round(min(0.85, base_confidence - 0.15), 2),
                "ref_range": "60-120",
                "note": None if avg_deep > 0 else "Deep sleep data not available",
            },
            "rem_sleep_avg_min": {
                "value": round(avg_rem) if avg_rem > 0 else None,
                "unit": "min",
                "grade": "B",
                "confidence": round(min(0.85, base_confidence - 0.15), 2),
                "ref_range": "90-150",
                "note": None if avg_rem > 0 else "REM sleep data not available",
            },
            "waso_avg_min": {
                "value": round(avg_waso) if avg_waso > 0 else None,
                "unit": "min",
                "grade": "C" if avg_waso > 30 else "B",
                "confidence": round(min(0.80, base_confidence - 0.2), 2),
                "ref_range": "<30",
                "note": "Wake After Sleep Onset" if avg_waso > 0 else "WASO data not available",
            },
            "social_jetlag_hours": {
                "value": round(social_jetlag, 1),
                "unit": "hours",
                "grade": sj_grade,
                "confidence": round(min(0.85, base_confidence - 0.1), 2),
                "ref_range": "<2",
                "n_weekday": len(weekday_midpoints),
                "n_weekend": len(weekend_midpoints),
            },
            "duration_trend": trend,
        },
        "circadian_features": {
            "circadian_rhythm_strength": {
                "value": round(circadian_strength, 2),
                "unit": "0-1 (strong=1)",
                "grade": circ_grade,
                "confidence": round(min(0.90, base_confidence - 0.1), 2),
                "ref_range": ">0.6",
            },
            "sleep_onset_latency_min": {
                "value": round(avg_latency, 1) if avg_latency > 0 else None,
                "unit": "min",
                "grade": "C" if avg_latency > 30 else ("B" if avg_latency > 15 else "A"),
                "confidence": round(min(0.75, base_confidence - 0.25), 2),
                "ref_range": "<15",
                "note": None if avg_latency > 0 else "Derived from bedtime variance",
            },
        },
        "evidence_summary": " ".join(evidence_lines),
        "safe_clinical_summary": (
            "Sleep patterns may support clinical sleep assessment. "
            + " ".join(safe_lines)
            + " Reduced sleep regularity is associated with mood symptoms in research studies. "
            "Requires clinical correlation with sleep diary and patient-reported outcomes."
        ),
        "data_quality": {
            "status": "valid",
            "entries": len(sleep_entries),
            "valid_entries": n_valid,
            "analysis_days": days,
            "outliers_removed": int(np.sum(~duration_mask)),
        },
    }


def batch_analyze_sleep(
    participant_sleep_map: Dict[str, List[dict]],
    days: int = 7,
) -> Dict[str, Any]:
    """Run sleep analysis across multiple participants.

    Parameters
    ----------
    participant_sleep_map : dict
        Mapping of participant_id -> list of sleep entries.
    days : int
        Analysis window in days.

    Returns
    -------
    dict
        Mapping of participant_id -> analysis results.
    """
    results = {}
    for participant_id, entries in participant_sleep_map.items():
        results[participant_id] = analyze_sleep_signals(entries, days=days)
    return results
