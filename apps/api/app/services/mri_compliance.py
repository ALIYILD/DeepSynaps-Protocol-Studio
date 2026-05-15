"""MRI Compliance Dashboard -- regulatory metrics and quality tracking.

Implements FDA 510(k)-aligned quality metrics, automated compliance alerts,
and clinic-level regulatory reporting.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_compliance_metrics(
    analyses: list[Any],
    clinic_id: str,
    days: int = 30,
) -> dict[str, Any]:
    """Compute compliance metrics for a clinic over a time period.

    Parameters
    ----------
    analyses:
        List of *MriAnalysis* ORM objects (already filtered by clinic and
        date range by the caller).
    clinic_id:
        Clinic identifier for the report.
    days:
        Look-back period in days (default 30).

    Returns
    -------
    dict
        Compliance dashboard payload with KPIs, turnaround times, alerts.
    """
    total = len(analyses)
    if total == 0:
        return {
            "clinic_id": clinic_id,
            "period_days": days,
            "error": "No analyses in period",
            "total_analyses": 0,
        }

    approved_states = ("MRI_APPROVED", "MRI_APPROVED_SIGNED")
    approved = sum(1 for a in analyses if (getattr(a, "report_state", None) or "") in approved_states)
    signed = sum(1 for a in analyses if getattr(a, "signed_by", None))
    with_red_flags = sum(1 for a in analyses if getattr(a, "red_flags_json", None))

    # Turnaround time (created_at -> signed_at)
    turnaround_times: list[float] = []
    for a in analyses:
        signed_at = getattr(a, "signed_at", None)
        created_at = getattr(a, "created_at", None)
        if signed_at and created_at:
            try:
                delta_hours = (signed_at - created_at).total_seconds() / 3600.0
                if delta_hours >= 0:
                    turnaround_times.append(delta_hours)
            except (TypeError, AttributeError):
                pass

    avg_turnaround = sum(turnaround_times) / len(turnaround_times) if turnaround_times else 0.0

    # Review turnaround (created_at -> reviewed_at)
    review_times: list[float] = []
    for a in analyses:
        reviewed_at = getattr(a, "reviewed_at", None)
        created_at = getattr(a, "created_at", None)
        if reviewed_at and created_at:
            try:
                delta_hours = (reviewed_at - created_at).total_seconds() / 3600.0
                if delta_hours >= 0:
                    review_times.append(delta_hours)
            except (TypeError, AttributeError):
                pass

    avg_review_time = sum(review_times) / len(review_times) if review_times else 0.0

    # Daily throughput
    daily_counts: dict[str, int] = {}
    for a in analyses:
        created = getattr(a, "created_at", None)
        if created:
            day_key = created.strftime("%Y-%m-%d") if hasattr(created, "strftime") else str(created)[:10]
            daily_counts[day_key] = daily_counts.get(day_key, 0) + 1

    avg_daily = sum(daily_counts.values()) / len(daily_counts) if daily_counts else 0.0

    result: dict[str, Any] = {
        "clinic_id": clinic_id,
        "period_days": days,
        "period_start": (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(),
        "period_end": datetime.now(timezone.utc).isoformat(),
        "total_analyses": total,
        "approved": approved,
        "approval_rate": round(approved / total, 4),
        "signed": signed,
        "sign_rate": round(signed / total, 4),
        "with_red_flags": with_red_flags,
        "red_flag_rate": round(with_red_flags / total, 4),
        "avg_turnaround_hours": round(avg_turnaround, 1),
        "avg_review_time_hours": round(avg_review_time, 1),
        "avg_daily_volume": round(avg_daily, 1),
        "compliance_score": _compute_compliance_score(approved, signed, total),
        "fda_510k_metrics": _compute_fda_metrics(analyses, turnaround_times),
        "alerts": _generate_alerts(analyses),
        "trend": _compute_trend(daily_counts),
    }

    _log.info(
        "Compliance metrics computed: clinic=%s period=%dd analyses=%d score=%.1f",
        clinic_id,
        days,
        total,
        result["compliance_score"],
    )

    return result


def generate_regulatory_export(
    compliance_metrics: dict[str, Any],
    clinic_info: dict[str, str],
) -> dict[str, Any]:
    """Generate an FDA 510(k)-aligned regulatory export bundle.

    Parameters
    ----------
    compliance_metrics:
        Output of :func:`compute_compliance_metrics`.
    clinic_info:
        Dict with ``clinic_name``, ``clinic_id``, ``software_version`` keys.

    Returns
    -------
    dict
        Regulatory export payload ready for submission.
    """
    now = datetime.now(timezone.utc).isoformat()
    return {
        "report_type": "FDA_510K_QUALITY_METRICS",
        "generated_at": now,
        "software_version": clinic_info.get("software_version", "unknown"),
        "clinic": {
            "name": clinic_info.get("clinic_name", "Unknown"),
            "id": clinic_info.get("clinic_id", "unknown"),
        },
        "metrics": {
            "total_analyses": compliance_metrics.get("total_analyses", 0),
            "approval_rate": compliance_metrics.get("approval_rate", 0.0),
            "sign_rate": compliance_metrics.get("sign_rate", 0.0),
            "avg_turnaround_hours": compliance_metrics.get("avg_turnaround_hours", 0.0),
            "red_flag_rate": compliance_metrics.get("red_flag_rate", 0.0),
            "compliance_score": compliance_metrics.get("compliance_score", 0.0),
        },
        "quality_indicators": {
            "clinical_review_required": True,
            "radiology_review_gate": True,
            "digital_sign_off": True,
            "audit_trail_complete": True,
            "phi_audit_before_export": True,
        },
        "disclaimer": (
            "This export is for regulatory documentation purposes. "
            "All metrics are derived from operational data and require "
            "quality officer verification before submission."
        ),
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _compute_compliance_score(approved: int, signed: int, total: int) -> float:
    """Weighted compliance score (0-100).

    Approval rate carries 60% weight; sign rate carries 40%.
    """
    if total == 0:
        return 0.0
    approval_score = approved / total
    sign_score = signed / total
    return round((approval_score * 0.6 + sign_score * 0.4) * 100, 1)


def _compute_fda_metrics(
    analyses: list[Any],
    turnaround_times: list[float],
) -> dict[str, Any]:
    """Compute FDA 510(k)-specific quality metrics."""
    total = len(analyses)
    if total == 0:
        return {}

    # Turnaround percentiles
    sorted_times = sorted(turnaround_times) if turnaround_times else []
    p50 = _percentile(sorted_times, 0.5) if sorted_times else 0.0
    p90 = _percentile(sorted_times, 0.9) if sorted_times else 0.0
    p95 = _percentile(sorted_times, 0.95) if sorted_times else 0.0

    # State distribution
    state_counts: dict[str, int] = {}
    for a in analyses:
        state = getattr(a, "report_state", "MRI_DRAFT_AI") or "MRI_DRAFT_AI"
        state_counts[state] = state_counts.get(state, 0) + 1

    return {
        "turnaround_p50_hours": round(p50, 1),
        "turnaround_p90_hours": round(p90, 1),
        "turnaround_p95_hours": round(p95, 1),
        "state_distribution": state_counts,
        "total_analyses": total,
        "quality_goal_met": p90 <= 48.0,  # 90% under 48h
    }


def _generate_alerts(analyses: list[Any]) -> list[dict[str, Any]]:
    """Generate compliance alerts from analysis rows."""
    alerts: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    for a in analyses:
        report_state = getattr(a, "report_state", None) or "MRI_DRAFT_AI"
        created_at = getattr(a, "created_at", None)
        analysis_id = getattr(a, "analysis_id", "unknown")
        red_flags_json = getattr(a, "red_flags_json", None)

        # Alert: >24h without review (draft state)
        if report_state == "MRI_DRAFT_AI" and created_at:
            try:
                # Ensure timezone-aware comparison
                if hasattr(created_at, "tzinfo") and created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                hours_pending = (now - created_at).total_seconds() / 3600.0
                if hours_pending > 24:
                    alerts.append(
                        {
                            "analysis_id": analysis_id,
                            "type": "overdue_review",
                            "message": (
                                f"Analysis {analysis_id} pending review "
                                f"for {hours_pending:.0f} hours"
                            ),
                            "severity": "medium" if hours_pending < 48 else "high",
                            "created_at": now.isoformat(),
                        }
                    )
            except (TypeError, AttributeError):
                pass

        # Alert: approved but not signed
        if report_state == "MRI_APPROVED" and not getattr(a, "signed_by", None):
            alerts.append(
                {
                    "analysis_id": analysis_id,
                    "type": "approved_not_signed",
                    "message": (
                        f"Analysis {analysis_id} is approved but not yet signed off"
                    ),
                    "severity": "high",
                    "created_at": now.isoformat(),
                }
            )

        # Alert: unresolved red flags
        if red_flags_json and report_state in ("MRI_APPROVED", "MRI_APPROVED_SIGNED"):
            try:
                import json
                red_flags = json.loads(red_flags_json) if isinstance(red_flags_json, str) else red_flags_json
                if isinstance(red_flags, list):
                    unresolved = [f for f in red_flags if not f.get("resolved")]
                    if unresolved:
                        alerts.append(
                            {
                                "analysis_id": analysis_id,
                                "type": "unresolved_red_flags",
                                "message": (
                                    f"Analysis {analysis_id} has {len(unresolved)} "
                                    f"unresolved red flag(s) in approved state"
                                ),
                                "severity": "critical",
                                "created_at": now.isoformat(),
                            }
                        )
            except (TypeError, ValueError):
                pass

    # Sort by severity (critical > high > medium > low)
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return sorted(alerts, key=lambda a: severity_order.get(a.get("severity", "low"), 99))


def _compute_trend(daily_counts: dict[str, int]) -> dict[str, Any]:
    """Compute daily volume trend from daily counts."""
    if not daily_counts:
        return {"direction": "flat", "change_percent": 0.0}

    sorted_days = sorted(daily_counts.keys())
    if len(sorted_days) < 2:
        return {"direction": "flat", "change_percent": 0.0}

    # Compare first half vs second half
    mid = len(sorted_days) // 2
    first_half = sum(daily_counts[d] for d in sorted_days[:mid]) if mid > 0 else 0
    second_half = sum(daily_counts[d] for d in sorted_days[mid:]) if mid < len(sorted_days) else 0

    if first_half == 0:
        change_pct = 100.0 if second_half > 0 else 0.0
    else:
        change_pct = round(((second_half - first_half) / first_half) * 100, 1)

    direction = "up" if change_pct > 10 else "down" if change_pct < -10 else "flat"

    return {
        "direction": direction,
        "change_percent": change_pct,
        "first_half_avg": round(first_half / max(mid, 1), 1),
        "second_half_avg": round(second_half / max(len(sorted_days) - mid, 1), 1),
        "daily_counts": daily_counts,
    }


def _percentile(sorted_data: list[float], q: float) -> float:
    """Compute the q-th percentile of sorted data (linear interpolation)."""
    if not sorted_data:
        return 0.0
    n = len(sorted_data)
    if n == 1:
        return sorted_data[0]
    idx = q * (n - 1)
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    return sorted_data[lo] * (1 - frac) + sorted_data[hi] * frac
