"""
Social Interaction Analysis Pipeline
====================================
Process communication metadata (call/SMS frequency, response latency,
contact diversity) into clinical-grade social phenotyping features.

Social withdrawal is a hallmark symptom of depression and a predictor
of relapse in schizophrenia. Passive sensing enables objective, continuous
monitoring of social engagement patterns.

References
----------
- Choudhury et al. (2013) - Mobile sensing of social interactions
- Saeb et al. (2015) - Depression severity and phone sensor features
- Wang et al. (2018) - CrossCheck: social features and schizophrenia
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


def _compute_entropy(contact_ids: List[str]) -> float:
    """Compute Shannon entropy of contact distribution.

    Higher entropy = more diverse contacts = less concentrated social circle.
    Max entropy = log(N) where N = number of unique contacts.

    Parameters
    ----------
    contact_ids : list of str
        List of contact identifiers.

    Returns
    -------
    float
        Shannon entropy normalized to [0, 1].
    """
    if not contact_ids:
        return 0.0
    counts = Counter(contact_ids)
    total = sum(counts.values())
    if total == 0:
        return 0.0
    probs = np.array([c / total for c in counts.values()])
    raw_entropy = -np.sum(probs * np.log2(probs + 1e-12))
    max_entropy = np.log2(len(counts))
    if max_entropy == 0:
        return 0.0
    return float(raw_entropy / max_entropy)


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


def _grade_social(value: float, metric: str) -> str:
    """Assign clinical evidence grade for social metrics."""
    if metric == "daily_communication":
        if 5 <= value <= 20:
            return "A"
        elif 3 <= value < 5 or 20 < value <= 30:
            return "B"
        elif 1 <= value < 3:
            return "C"
        return "D"
    elif metric == "response_latency":
        if value <= 30:
            return "A"
        elif value <= 120:
            return "B"
        elif value <= 360:
            return "C"
        return "D"
    elif metric == "entropy":
        if value >= 0.7:
            return "A"
        elif value >= 0.5:
            return "B"
        elif value >= 0.3:
            return "C"
        return "D"
    elif metric == "weekend_diff":
        if value < 2:
            return "A"
        elif value < 5:
            return "B"
        elif value < 10:
            return "C"
        return "D"
    elif metric == "conversational_balance":
        if 0.4 <= value <= 0.6:
            return "A"
        elif 0.3 <= value < 0.4 or 0.6 < value <= 0.7:
            return "B"
        elif 0.2 <= value < 0.3 or 0.7 < value <= 0.8:
            return "C"
        return "D"
    return "C"


def analyze_social_signals(
    communication_entries: List[dict],
    days: int = 7,
) -> Dict[str, Any]:
    """Analyze social interaction signals and extract clinical-grade features.

    Parameters
    ----------
    communication_entries : list of dict
        Each dict contains:
        - "timestamp": ISO-8601 datetime string
        - "type": str, one of "call_inbound", "call_outbound", "sms_inbound",
          "sms_outbound", "app_message"
        - "contact_id": str, anonymized contact identifier
        - "duration_seconds": int, call duration (for calls) or message length proxy
        - "response_delay_minutes": float, latency to respond (for inbound)
        - "confidence": float, data quality confidence 0-1
    days : int
        Analysis window in days.

    Returns
    -------
    dict
        Structured social features with evidence grades and safe wording.
    """
    # ------------------------------------------------------------------
    # Edge case: no data
    # ------------------------------------------------------------------
    if not communication_entries:
        return {
            "social_features": {},
            "communication_features": {},
            "evidence_summary": "No communication data available for the requested period.",
            "safe_clinical_summary": (
                "No communication data was recorded. Social interaction patterns are "
                "clinically relevant for depression and social anxiety screening. "
                "Consider using patient-reported measures (e.g., PHQ-9 item 6, SIAS, UCLA Loneliness Scale)."
            ),
            "data_quality": {"status": "no_data", "entries": 0, "days": days},
        }

    # ------------------------------------------------------------------
    # Parse entries
    # ------------------------------------------------------------------
    timestamps = []
    types = []
    contact_ids = []
    durations = []
    response_delays = []
    confidences = []
    dates = []
    weekdays = []

    for entry in communication_entries:
        try:
            ts = datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00"))
        except (ValueError, KeyError):
            continue

        timestamps.append(ts)
        types.append(entry.get("type", "unknown"))
        contact_ids.append(entry.get("contact_id", "unknown"))
        durations.append(entry.get("duration_seconds", np.nan))
        response_delays.append(entry.get("response_delay_minutes", np.nan))
        confidences.append(entry.get("confidence", 0.7))
        dates.append(ts.date())
        weekdays.append(ts.weekday())

    n_valid = len(timestamps)
    if n_valid < 1:
        return {
            "social_features": {},
            "communication_features": {},
            "evidence_summary": "Communication data present but no valid entries after filtering.",
            "safe_clinical_summary": (
                "Communication records were found but could not be validated. "
                "Consider supplementary clinical interviews for social functioning assessment."
            ),
            "data_quality": {
                "status": "insufficient_data",
                "entries": len(communication_entries),
                "valid_entries": 0,
            },
        }

    # ------------------------------------------------------------------
    # Daily aggregation
    # ------------------------------------------------------------------
    daily_counts = Counter(dates)
    daily_totals = dict(daily_counts)
    daily_values = list(daily_totals.values())

    avg_daily_comm = float(np.mean(daily_values)) if daily_values else 0
    communication_cv = float(np.std(daily_values) / np.mean(daily_values)) if daily_values and np.mean(daily_values) > 0 else 0

    # ------------------------------------------------------------------
    # Response latency analysis
    # ------------------------------------------------------------------
    delays_arr = np.array([d for d in response_delays if not np.isnan(d)], dtype=float)
    if len(delays_arr) > 0:
        # Remove extreme outliers (> 24 hours)
        delays_filtered = delays_arr[delays_arr <= 1440]
        if len(delays_filtered) == 0:
            delays_filtered = delays_arr
        avg_delay = float(np.mean(delays_filtered))
        median_delay = float(np.median(delays_filtered))
    else:
        avg_delay = 0.0
        median_delay = 0.0
        delays_filtered = np.array([])

    # ------------------------------------------------------------------
    # Communication entropy (diversity of contacts)
    # ------------------------------------------------------------------
    entropy = _compute_entropy(contact_ids)
    unique_contacts = len(set(contact_ids))

    # ------------------------------------------------------------------
    # Inbound/outbound balance
    # ------------------------------------------------------------------
    inbound_types = {"call_inbound", "sms_inbound", "app_message_inbound"}
    outbound_types = {"call_outbound", "sms_outbound", "app_message_outbound"}

    inbound_count = sum(1 for t in types if t in inbound_types)
    outbound_count = sum(1 for t in types if t in outbound_types)
    total_directional = inbound_count + outbound_count
    if total_directional > 0:
        conversational_balance = min(inbound_count, outbound_count) / max(inbound_count, outbound_count)
    else:
        conversational_balance = 0.5

    # ------------------------------------------------------------------
    # Duration analysis (for voice/video calls)
    # ------------------------------------------------------------------
    call_durations = np.array([d for d, t in zip(durations, types)
                                if not np.isnan(d) and "call" in t], dtype=float)
    if len(call_durations) > 0:
        avg_call_duration = float(np.mean(call_durations))
        total_call_duration = float(np.sum(call_durations))
    else:
        avg_call_duration = 0.0
        total_call_duration = 0.0

    # ------------------------------------------------------------------
    # Weekday vs Weekend analysis
    # ------------------------------------------------------------------
    weekday_comm = [count for date, count in daily_totals.items() if date.weekday() < 5]
    weekend_comm = [count for date, count in daily_totals.items() if date.weekday() >= 5]

    avg_weekday = float(np.mean(weekday_comm)) if weekday_comm else 0
    avg_weekend = float(np.mean(weekend_comm)) if weekend_comm else 0
    weekend_diff = abs(avg_weekday - avg_weekend)

    # ------------------------------------------------------------------
    # Trend analysis
    # ------------------------------------------------------------------
    sorted_daily = [count for _, count in sorted(daily_totals.items())]
    comm_trend, comm_slope = _compute_trend(sorted_daily)

    # ------------------------------------------------------------------
    # Confidence scoring
    # ------------------------------------------------------------------
    base_confidence = min(0.95, 0.5 + 0.04 * n_valid + 0.1 * np.mean(confidences))
    if days < 3:
        base_confidence *= 0.7
    if n_valid < 10:
        base_confidence *= 0.8

    # ------------------------------------------------------------------
    # Evidence summary
    # ------------------------------------------------------------------
    evidence_lines = []
    safe_lines = []

    if avg_daily_comm >= 5 and avg_daily_comm <= 20:
        evidence_lines.append(
            f"Daily communication frequency ({avg_daily_comm:.1f}) is within normal range "
            "(Grade A evidence for social engagement)."
        )
        safe_lines.append("Communication frequency appears within typical range.")
    elif avg_daily_comm < 1:
        evidence_lines.append(
            "Very low communication frequency may indicate social withdrawal, "
            "a core symptom of major depressive disorder (Grade B evidence)."
        )
        safe_lines.append("Communication frequency is markedly reduced, suggesting possible social withdrawal.")
    elif avg_daily_comm < 3:
        evidence_lines.append(
            f"Reduced daily communication ({avg_daily_comm:.1f}) below typical range. "
            "Social disengagement correlates with depression severity (Grade B)."
        )
        safe_lines.append("Communication frequency is below typical range.")
    else:
        evidence_lines.append(
            f"High communication frequency ({avg_daily_comm:.1f}). "
            "Elevated communication may occur during manic episodes or heightened interpersonal stress (Grade C)."
        )
        safe_lines.append("Communication frequency is above typical range.")

    if avg_delay > 360:
        evidence_lines.append(
            f"Extended response latency ({avg_delay:.0f} min) may indicate "
            "social disengagement or avolition (Grade C evidence)."
        )
        safe_lines.append(f"Response latency is notably extended ({avg_delay:.0f} minutes).")
    elif avg_delay > 120:
        evidence_lines.append(
            f"Moderate response delay ({avg_delay:.0f} min). "
            "Delayed responses correlate with negative symptoms in schizophrenia (Grade B)."
        )
        safe_lines.append("Response latency is moderately increased.")

    if entropy < 0.3 and unique_contacts >= 2:
        evidence_lines.append(
            "Low communication entropy (concentrated to few contacts) may indicate "
            "restricted social network, a risk factor for depression relapse (Grade B)."
        )
        safe_lines.append("Communication diversity is limited.")

    if comm_trend == "decreasing" and len(sorted_daily) >= 5:
        evidence_lines.append(
            "Declining communication trend may signal emerging depressive symptoms "
            "or medication non-response (Grade C)."
        )
        safe_lines.append("Communication appears to be declining over the observation period.")

    evidence_lines.append(
        "Social features from passive phone sensing are validated indicators "
        "of depression severity and social functioning (Grade B evidence)."
    )

    # ------------------------------------------------------------------
    # Build response
    # ------------------------------------------------------------------
    return {
        "social_features": {
            "avg_daily_communication_count": {
                "value": round(avg_daily_comm, 1),
                "unit": "count",
                "grade": _grade_social(avg_daily_comm, "daily_communication"),
                "confidence": round(base_confidence, 2),
                "ref_range": "5-20",
                "n_valid": n_valid,
            },
            "communication_variability_cv": {
                "value": round(communication_cv, 2),
                "unit": "coefficient_of_variation",
                "grade": "B",
                "confidence": round(min(0.85, base_confidence - 0.1), 2),
                "ref_range": "<0.6",
            },
            "communication_trend": {
                "value": comm_trend,
                "slope": round(comm_slope, 3),
                "unit": "count/day",
                "grade": "B",
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
            },
            "unique_contacts_count": {
                "value": unique_contacts,
                "unit": "count",
                "grade": "A" if unique_contacts >= 5 else "B",
                "confidence": round(min(0.90, base_confidence - 0.05), 2),
                "ref_range": ">5",
            },
            "communication_entropy": {
                "value": round(entropy, 2),
                "unit": "0-1 (diverse=1)",
                "grade": _grade_social(entropy, "entropy"),
                "confidence": round(min(0.85, base_confidence - 0.1), 2),
                "ref_range": ">0.5",
            },
            "conversational_balance": {
                "value": round(conversational_balance, 2),
                "unit": "0-1 (balanced=0.5)",
                "grade": _grade_social(conversational_balance, "conversational_balance"),
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": "0.4-0.6",
                "inbound_count": inbound_count,
                "outbound_count": outbound_count,
            },
        },
        "communication_features": {
            "avg_response_latency_minutes": {
                "value": round(avg_delay, 1) if avg_delay > 0 else None,
                "unit": "min",
                "grade": _grade_social(avg_delay, "response_latency"),
                "confidence": round(min(0.80, base_confidence - 0.15), 2),
                "ref_range": "<30",
                "median": round(median_delay, 1) if median_delay > 0 else None,
                "note": None if avg_delay > 0 else "Response latency data not available",
            },
            "avg_call_duration_seconds": {
                "value": round(avg_call_duration) if avg_call_duration > 0 else None,
                "unit": "seconds",
                "grade": "B",
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": "60-300",
                "note": None if avg_call_duration > 0 else "Call duration data not available",
            },
            "total_call_duration_minutes": {
                "value": round(total_call_duration / 60, 1) if total_call_duration > 0 else None,
                "unit": "min",
                "grade": "B",
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": ">10",
                "note": None if total_call_duration > 0 else "No call data recorded",
            },
        },
        "weekend_weekday_features": {
            "weekend_communication_difference": {
                "value": round(weekend_diff, 1),
                "unit": "count",
                "grade": _grade_social(weekend_diff, "weekend_diff"),
                "confidence": round(min(0.75, base_confidence - 0.2), 2),
                "ref_range": "<2",
                "weekday_avg": round(avg_weekday, 1),
                "weekend_avg": round(avg_weekend, 1),
            },
        },
        "evidence_summary": " ".join(evidence_lines),
        "safe_clinical_summary": (
            "Social interaction patterns may support clinical assessment of social functioning. "
            + " ".join(safe_lines)
            + " Social withdrawal and communication changes are associated with mood symptoms "
            "and functional decline in research studies. Requires clinical correlation with "
            "patient-reported social functioning measures and clinical interview."
        ),
        "data_quality": {
            "status": "valid",
            "entries": len(communication_entries),
            "valid_entries": n_valid,
            "analysis_days": days,
            "unique_contacts": unique_contacts,
        },
    }


def batch_analyze_social(
    participant_social_map: Dict[str, List[dict]],
    days: int = 7,
) -> Dict[str, Any]:
    """Run social interaction analysis across multiple participants.

    Parameters
    ----------
    participant_social_map : dict
        Mapping of participant_id -> list of communication entries.
    days : int
        Analysis window in days.

    Returns
    -------
    dict
        Mapping of participant_id -> analysis results.
    """
    results = {}
    for participant_id, entries in participant_social_map.items():
        results[participant_id] = analyze_social_signals(entries, days=days)
    return results
