"""
Screen Time Analysis Pipeline
=============================
Process smartphone screen state transitions (on/off/unlock) into clinical-grade
digital phenotyping features related to sleep, circadian rhythm, and addictive behaviors.

Excessive evening screen use is associated with delayed sleep onset, reduced melatonin,
and poor sleep quality. Screen use patterns also reflect compulsive checking behaviors
relevant to anxiety, ADHD, and behavioral addiction assessment.

References
----------
- LeBourgeois et al. (2017) - Digital media and sleep in children/adolescents
- Christensen et al. (2016) - Direct measurements of smartphone screen-time
- Twenge & Campbell (2019) - Associations between screen time and lower psychological well-being
"""

import numpy as np
from datetime import datetime, timedelta
from collections import Counter
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
    """Compute linear trend direction and slope."""
    if len(values) < 3:
        return "stable", 0.0
    x = np.arange(len(values))
    y = np.array(values)
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


def _grade_screen(value: float, metric: str) -> str:
    """Assign clinical evidence grade for screen time metrics."""
    if metric == "total_hours":
        if value <= 3:
            return "A"
        elif value <= 5:
            return "B"
        elif value <= 8:
            return "C"
        return "D"
    elif metric == "unlock_frequency":
        if value <= 30:
            return "A"
        elif value <= 60:
            return "B"
        elif value <= 100:
            return "C"
        return "D"
    elif metric == "bedtime_use":
        if value <= 15:
            return "A"
        elif value <= 30:
            return "B"
        elif value <= 60:
            return "C"
        return "D"
    elif metric == "session_duration":
        if value <= 5:
            return "A"
        elif value <= 10:
            return "B"
        elif value <= 20:
            return "C"
        return "D"
    elif metric == "nighttime_pickups":
        if value <= 1:
            return "A"
        elif value <= 3:
            return "B"
        elif value <= 5:
            return "C"
        return "D"
    elif metric == "weekend_diff":
        if value < 2:
            return "A"
        elif value < 4:
            return "B"
        elif value < 6:
            return "C"
        return "D"
    return "C"


def analyze_screen_signals(
    screen_entries: List[dict],
    days: int = 7,
    bedtime_hour: int = 22,
    wake_hour: int = 7,
) -> Dict[str, Any]:
    """Analyze screen state signals and extract clinical-grade features.

    Parameters
    ----------
    screen_entries : list of dict
        Each dict contains:
        - "timestamp": ISO-8601 datetime string
        - "event": str, one of "screen_on", "screen_off", "unlock", "lock"
        - "app_category": str, optional, app category (social, messaging, entertainment, etc.)
        - "session_duration_seconds": float, duration of screen session (for screen_off events)
        - "confidence": float, data quality confidence 0-1
    days : int
        Analysis window in days.
    bedtime_hour : int
        Hour (0-23) considered typical bedtime for evening screen use analysis.
    wake_hour : int
        Hour (0-23) considered typical wake time for nighttime analysis.

    Returns
    -------
    dict
        Structured screen time features with evidence grades and safe wording.
    """
    # ------------------------------------------------------------------
    # Edge case: no data
    # ------------------------------------------------------------------
    if not screen_entries:
        return {
            "screen_time_features": {},
            "usage_pattern_features": {},
            "evidence_summary": "No screen time data available for the requested period.",
            "safe_clinical_summary": (
                "No screen time data was recorded. Screen use patterns are clinically relevant "
                "for sleep hygiene assessment and behavioral addiction screening. "
                "Consider self-report measures (e.g., SABAS, Bergen Social Media Addiction Scale)."
            ),
            "data_quality": {"status": "no_data", "entries": 0, "days": days},
        }

    # ------------------------------------------------------------------
    # Parse entries
    # ------------------------------------------------------------------
    timestamps = []
    events = []
    app_categories = []
    session_durations = []
    confidences = []
    dates = []
    weekdays = []

    for entry in screen_entries:
        try:
            ts = datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00"))
        except (ValueError, KeyError):
            continue

        timestamps.append(ts)
        events.append(entry.get("event", "unknown"))
        app_categories.append(entry.get("app_category", "unknown"))
        session_durations.append(entry.get("session_duration_seconds", np.nan))
        confidences.append(entry.get("confidence", 0.7))
        dates.append(ts.date())
        weekdays.append(ts.weekday())

    n_valid = len(timestamps)
    if n_valid < 1:
        return {
            "screen_time_features": {},
            "usage_pattern_features": {},
            "evidence_summary": "Screen time data present but no valid entries after filtering.",
            "safe_clinical_summary": (
                "Screen time records were found but could not be validated. "
                "Consider supplementary clinical interviews."
            ),
            "data_quality": {
                "status": "insufficient_data",
                "entries": len(screen_entries),
                "valid_entries": 0,
            },
        }

    # ------------------------------------------------------------------
    # Daily aggregation
    # ------------------------------------------------------------------
    daily_total_seconds = Counter()
    daily_unlock_count = Counter()
    daily_session_count = Counter()

    for ts, event, dur in zip(timestamps, events, session_durations):
        if event == "screen_off" and not np.isnan(dur):
            daily_total_seconds[ts.date()] += dur
            daily_session_count[ts.date()] += 1
        if event == "unlock":
            daily_unlock_count[ts.date()] += 1

    # Also estimate from session durations if available
    for ts, dur in zip(timestamps, session_durations):
        if not np.isnan(dur) and daily_total_seconds[ts.date()] == 0:
            daily_total_seconds[ts.date()] += dur

    # Fill in dates with unlocks but no duration data (estimate from typical session length)
    for date in daily_unlock_count:
        if daily_total_seconds[date] == 0 and daily_unlock_count[date] > 0:
            # Estimate: 3 minutes per unlock
            daily_total_seconds[date] = daily_unlock_count[date] * 180

    daily_hours = {d: s / 3600 for d, s in daily_total_seconds.items()}
    daily_hours_values = list(daily_hours.values())

    # ------------------------------------------------------------------
    # Core metrics
    # ------------------------------------------------------------------
    avg_daily_hours = float(np.mean(daily_hours_values)) if daily_hours_values else 0
    screen_cv = float(np.std(daily_hours_values) / np.mean(daily_hours_values)) if daily_hours_values and np.mean(daily_hours_values) > 0 else 0

    daily_unlock_values = list(daily_unlock_count.values())
    avg_unlocks = float(np.mean(daily_unlock_values)) if daily_unlock_values else 0

    # Session duration analysis
    valid_sessions = [s for s in session_durations if not np.isnan(s)]
    if valid_sessions:
        avg_session_seconds = float(np.mean(valid_sessions))
        median_session_seconds = float(np.median(valid_sessions))
    else:
        avg_session_seconds = 0
        median_session_seconds = 0

    # ------------------------------------------------------------------
    # Bedtime screen use analysis (1 hour before bedtime)
    # ------------------------------------------------------------------
    bedtime_use_seconds = []
    for ts, event, dur in zip(timestamps, events, session_durations):
        hour = ts.hour + ts.minute / 60
        # Define bedtime window: 1 hour before typical bedtime
        bedtime_start = bedtime_hour - 1
        bedtime_end = bedtime_hour + 1
        if bedtime_start <= hour <= bedtime_end:
            if event == "screen_off" and not np.isnan(dur):
                bedtime_use_seconds.append(dur)

    avg_bedtime_use_min = float(np.mean(bedtime_use_seconds) / 60) if bedtime_use_seconds else 0

    # ------------------------------------------------------------------
    # Nighttime pickups (between bedtime and wake hour)
    # ------------------------------------------------------------------
    nighttime_unlocks = Counter()
    for ts, event in zip(timestamps, events):
        hour = ts.hour
        if event == "unlock":
            # Nighttime: between bedtime and wake hour
            is_nighttime = False
            if bedtime_hour <= wake_hour:
                # Normal case (e.g., 22:00 to 07:00)
                is_nighttime = bedtime_hour <= hour or hour < wake_hour
            else:
                is_nighttime = bedtime_hour <= hour or hour < wake_hour
            if is_nighttime:
                nighttime_unlocks[ts.date()] += 1

    nighttime_values = list(nighttime_unlocks.values())
    avg_nighttime_pickups = float(np.mean(nighttime_values)) if nighttime_values else 0

    # ------------------------------------------------------------------
    # App category analysis
    # ------------------------------------------------------------------
    category_durations = Counter()
    for ts, cat, dur in zip(timestamps, app_categories, session_durations):
        if cat != "unknown" and not np.isnan(dur):
            category_durations[cat] += dur

    total_categorized = sum(category_durations.values())
    category_percentages = {}
    if total_categorized > 0:
        for cat, dur in category_durations.most_common(5):
            category_percentages[cat] = round(dur / total_categorized * 100, 1)

    # Check for dominant social/entertainment use
    social_entertainment_seconds = (
        category_durations.get("social", 0)
        + category_durations.get("entertainment", 0)
        + category_durations.get("video", 0)
        + category_durations.get("games", 0)
    )
    social_entertainment_pct = (
        round(social_entertainment_seconds / total_categorized * 100, 1)
        if total_categorized > 0 else 0
    )

    # ------------------------------------------------------------------
    # Weekday vs Weekend analysis
    # ------------------------------------------------------------------
    weekday_hours = [h for d, h in daily_hours.items() if d.weekday() < 5]
    weekend_hours = [h for d, h in daily_hours.items() if d.weekday() >= 5]

    avg_weekday_hours = float(np.mean(weekday_hours)) if weekday_hours else 0
    avg_weekend_hours = float(np.mean(weekend_hours)) if weekend_hours else 0
    weekend_diff = abs(avg_weekday_hours - avg_weekend_hours)

    weekday_unlocks = [c for d, c in daily_unlock_count.items() if d.weekday() < 5]
    weekend_unlocks = [c for d, c in daily_unlock_count.items() if d.weekday() >= 5]

    avg_weekday_unlocks = float(np.mean(weekday_unlocks)) if weekday_unlocks else 0
    avg_weekend_unlocks = float(np.mean(weekend_unlocks)) if weekend_unlocks else 0

    # ------------------------------------------------------------------
    # First unlock time (proxy for sleep/wake timing)
    # ------------------------------------------------------------------
    daily_first_unlock = {}
    for ts, event in zip(timestamps, events):
        if event == "unlock":
            date = ts.date()
            hour = ts.hour + ts.minute / 60
            if date not in daily_first_unlock or hour < daily_first_unlock[date]:
                daily_first_unlock[date] = hour

    first_unlock_values = list(daily_first_unlock.values())
    avg_first_unlock = float(np.mean(first_unlock_values)) if first_unlock_values else 0
    first_unlock_reg = (
        max(0, 1 - np.std(first_unlock_values) / 4) if len(first_unlock_values) > 1 else 0.5
    )

    # ------------------------------------------------------------------
    # Last screen-off time (proxy for bedtime)
    # ------------------------------------------------------------------
    daily_last_screen_off = {}
    for ts, event in zip(timestamps, events):
        if event == "screen_off":
            date = ts.date()
            hour = ts.hour + ts.minute / 60
            if date not in daily_last_screen_off or hour > daily_last_screen_off[date]:
                daily_last_screen_off[date] = hour

    last_screen_values = list(daily_last_screen_off.values())
    avg_last_screen = float(np.mean(last_screen_values)) if last_screen_values else 0

    # ------------------------------------------------------------------
    # Trend analysis
    # ------------------------------------------------------------------
    sorted_hours = [h for _, h in sorted(daily_hours.items())]
    hours_trend, hours_slope = _compute_trend(sorted_hours)

    # ------------------------------------------------------------------
    # Confidence scoring
    # ------------------------------------------------------------------
    base_confidence = min(0.95, 0.5 + 0.04 * len(daily_hours) + 0.1 * np.mean(confidences))
    if days < 3:
        base_confidence *= 0.7
    if n_valid < 20:
        base_confidence *= 0.85

    # ------------------------------------------------------------------
    # Evidence summary
    # ------------------------------------------------------------------
    evidence_lines = []
    safe_lines = []

    if avg_daily_hours > 8:
        evidence_lines.append(
            f"Daily screen time ({avg_daily_hours:.1f}h) exceeds 8 hours. "
            "Excessive screen use is associated with reduced well-being, sleep disruption, "
            "and depressive symptoms (Grade B evidence)."
        )
        safe_lines.append("Screen time is notably elevated.")
    elif avg_daily_hours > 5:
        evidence_lines.append(
            f"Daily screen time ({avg_daily_hours:.1f}h) is moderately elevated. "
            "Screen time >5 hours/day correlates with lower psychological well-being (Grade B)."
        )
        safe_lines.append("Screen time is moderately above recommended levels.")
    elif avg_daily_hours > 3:
        evidence_lines.append(
            f"Daily screen time ({avg_daily_hours:.1f}h) is slightly above recommendations. "
            "Moderate screen use is generally acceptable with proper sleep hygiene (Grade B)."
        )
        safe_lines.append("Screen time is slightly elevated.")
    else:
        evidence_lines.append(
            f"Daily screen time ({avg_daily_hours:.1f}h) is within recommended limits. "
            "Low screen use is associated with better sleep quality (Grade B evidence)."
        )
        safe_lines.append("Screen time appears within recommended limits.")

    if avg_bedtime_use_min > 30:
        evidence_lines.append(
            f"Bedtime screen use ({avg_bedtime_use_min:.0f} min) is high. "
            "Evening screen exposure suppresses melatonin and delays sleep onset (Grade B evidence)."
        )
        safe_lines.append(
            f"Significant screen use detected near bedtime ({avg_bedtime_use_min:.0f} min), "
            "which may impact sleep onset."
        )
    elif avg_bedtime_use_min > 15:
        evidence_lines.append(
            f"Moderate bedtime screen use ({avg_bedtime_use_min:.0f} min). "
            "Blue light exposure within 1 hour of bedtime impairs sleep quality (Grade B)."
        )
        safe_lines.append("Some screen use detected near bedtime.")

    if avg_unlocks > 80:
        evidence_lines.append(
            f"Frequent screen checking ({avg_unlocks:.0f} times/day) may indicate "
            "compulsive checking behavior relevant to anxiety or behavioral addiction (Grade C)."
        )
        safe_lines.append("Screen checking frequency is notably high.")
    elif avg_unlocks > 60:
        evidence_lines.append(
            f"Elevated unlock frequency ({avg_unlocks:.0f} times/day). "
            "Frequent checking correlates with anxiety symptoms (Grade C evidence)."
        )
        safe_lines.append("Screen checking frequency is elevated.")

    if avg_nighttime_pickups > 3:
        evidence_lines.append(
            f"Frequent nighttime screen pickups ({avg_nighttime_pickups:.1f}/night) "
            "suggest sleep disruption or insomnia (Grade B evidence)."
        )
        safe_lines.append("Nighttime screen pickups are frequent, suggesting possible sleep disruption.")

    if hours_trend == "increasing" and len(sorted_hours) >= 5:
        evidence_lines.append(
            "Increasing screen time trend may signal symptom worsening or "
            "increased reliance on digital coping mechanisms (Grade C)."
        )
        safe_lines.append("Screen time appears to be increasing over the observation period.")

    evidence_lines.append(
        "Screen time features from passive sensing are validated indicators "
        "of digital behavior patterns with clinical relevance (Grade B evidence)."
    )

    # ------------------------------------------------------------------
    # Build response
    # ------------------------------------------------------------------
    return {
        "screen_time_features": {
            "avg_daily_screen_hours": {
                "value": round(avg_daily_hours, 1),
                "unit": "hours",
                "grade": _grade_screen(avg_daily_hours, "total_hours"),
                "confidence": round(base_confidence, 2),
                "ref_range": "<3",
                "n_valid_days": len(daily_hours),
            },
            "screen_time_variability_cv": {
                "value": round(screen_cv, 2),
                "unit": "coefficient_of_variation",
                "grade": "B",
                "confidence": round(min(0.85, base_confidence - 0.1), 2),
                "ref_range": "<0.5",
            },
            "screen_time_trend": {
                "value": hours_trend,
                "slope": round(hours_slope, 3),
                "unit": "hours/day",
                "grade": "B",
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
            },
            "avg_daily_unlocks": {
                "value": round(avg_unlocks),
                "unit": "count",
                "grade": _grade_screen(avg_unlocks, "unlock_frequency"),
                "confidence": round(min(0.85, base_confidence - 0.1), 2),
                "ref_range": "<30",
            },
            "avg_session_duration_minutes": {
                "value": round(avg_session_seconds / 60, 1) if avg_session_seconds > 0 else None,
                "unit": "min",
                "grade": _grade_screen(avg_session_seconds / 60, "session_duration") if avg_session_seconds > 0 else "B",
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": "<5",
                "median_minutes": round(median_session_seconds / 60, 1) if median_session_seconds > 0 else None,
                "note": None if avg_session_seconds > 0 else "Session data estimated from unlocks",
            },
        },
        "bedtime_features": {
            "bedtime_screen_use_minutes": {
                "value": round(avg_bedtime_use_min, 1),
                "unit": "min",
                "grade": _grade_screen(avg_bedtime_use_min, "bedtime_use"),
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": "<15",
                "window": f"{bedtime_hour-1}:00-{bedtime_hour+1}:00",
            },
            "avg_nighttime_pickups": {
                "value": round(avg_nighttime_pickups, 1),
                "unit": "count",
                "grade": _grade_screen(avg_nighttime_pickups, "nighttime_pickups"),
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": "<1",
                "window": f"{bedtime_hour}:00-{wake_hour}:00",
            },
            "avg_last_screen_off_hour": {
                "value": round(avg_last_screen, 1) if avg_last_screen > 0 else None,
                "unit": "hour_of_day",
                "grade": "C" if avg_last_screen > bedtime_hour + 1 else "B",
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": f"<{bedtime_hour+1}",
                "note": None if avg_last_screen > 0 else "No screen-off events recorded",
            },
            "avg_first_unlock_hour": {
                "value": round(avg_first_unlock, 1) if avg_first_unlock > 0 else None,
                "unit": "hour_of_day",
                "grade": "A" if avg_first_unlock <= wake_hour + 1 else "B",
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": f"<={wake_hour+1}",
                "regularity": round(first_unlock_reg, 2),
                "note": None if avg_first_unlock > 0 else "No unlock events recorded",
            },
        },
        "usage_pattern_features": {
            "social_entertainment_percentage": {
                "value": round(social_entertainment_pct, 1),
                "unit": "%",
                "grade": "C" if social_entertainment_pct > 70 else "B",
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": "<60",
                "breakdown": category_percentages,
            },
        },
        "weekend_weekday_features": {
            "weekend_screen_difference_hours": {
                "value": round(weekend_diff, 1),
                "unit": "hours",
                "grade": _grade_screen(weekend_diff, "weekend_diff"),
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": "<2",
                "weekday_avg": round(avg_weekday_hours, 1),
                "weekend_avg": round(avg_weekend_hours, 1),
            },
            "weekend_unlock_difference": {
                "value": round(abs(avg_weekday_unlocks - avg_weekend_unlocks)),
                "unit": "count",
                "grade": "B",
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": "<15",
                "weekday_avg": round(avg_weekday_unlocks),
                "weekend_avg": round(avg_weekend_unlocks),
            },
        },
        "evidence_summary": " ".join(evidence_lines),
        "safe_clinical_summary": (
            "Screen time patterns may support clinical assessment of digital behavior and sleep hygiene. "
            + " ".join(safe_lines)
            + " Excessive evening screen use is associated with delayed sleep onset and reduced sleep quality. "
            "Requires clinical correlation with patient-reported sleep measures and clinical interview."
        ),
        "data_quality": {
            "status": "valid",
            "entries": len(screen_entries),
            "valid_entries": n_valid,
            "analysis_days": days,
            "days_with_data": len(daily_hours),
        },
    }


def batch_analyze_screen(
    participant_screen_map: Dict[str, List[dict]],
    days: int = 7,
    bedtime_hour: int = 22,
    wake_hour: int = 7,
) -> Dict[str, Any]:
    """Run screen time analysis across multiple participants.

    Parameters
    ----------
    participant_screen_map : dict
        Mapping of participant_id -> list of screen state entries.
    days : int
        Analysis window in days.
    bedtime_hour : int
        Hour considered typical bedtime.
    wake_hour : int
        Hour considered typical wake time.

    Returns
    -------
    dict
        Mapping of participant_id -> analysis results.
    """
    results = {}
    for participant_id, entries in participant_screen_map.items():
        results[participant_id] = analyze_screen_signals(
            entries, days=days, bedtime_hour=bedtime_hour, wake_hour=wake_hour
        )
    return results
