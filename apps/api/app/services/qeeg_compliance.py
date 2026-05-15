"""qEEG Compliance Dashboard — regulatory metrics and quality tracking.

This module implements Deliverable D59 from the DeepSynaps qEEG Analyzer
Roadmap: Compliance metrics for regulatory reporting (Week 16).

Tracks:
- Analysis approval rates and sign-off completion
- Safety review coverage
- Overdue analysis alerts
- IQCB 2025 + ACNS Guideline 7 alignment metrics

All outputs are decision-support. Compliance scores are advisory only.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

_log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Time thresholds for alerts
OVERDUE_REVIEW_HOURS = 24
OVERDUE_REVIEW_CRITICAL_HOURS = 72
STALE_ANALYSIS_DAYS = 7

# Compliance scoring weights
WEIGHT_APPROVAL = 0.60
WEIGHT_SIGNED = 0.40

# Rating thresholds
COMPLIANCE_EXCELLENT = 90.0
COMPLIANCE_GOOD = 75.0
COMPLIANCE_ACCEPTABLE = 60.0


# ── Data structures ───────────────────────────────────────────────────────────


@dataclass
class ComplianceAlert:
    """A single compliance alert."""

    analysis_id: str
    alert_type: str
    severity: str  # critical, high, medium, low
    message: str
    created_at: datetime | None = None
    recommendation: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_id": self.analysis_id,
            "type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "recommendation": self.recommendation,
        }


@dataclass
class ComplianceMetrics:
    """Complete compliance metrics for a clinic/period."""

    period_days: int
    total_analyses: int
    approved: int
    approval_rate: float
    signed: int
    sign_rate: float
    safety_review_rate: float
    compliance_score: float
    compliance_rating: str
    alerts: list[ComplianceAlert] = field(default_factory=list)
    breakdown_by_day: dict[str, dict[str, int]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "period_days": self.period_days,
            "total_analyses": self.total_analyses,
            "approved": self.approved,
            "approval_rate": round(self.approval_rate, 3),
            "signed": self.signed,
            "sign_rate": round(self.sign_rate, 3),
            "safety_review_rate": round(self.safety_review_rate, 3),
            "compliance_score": self.compliance_score,
            "compliance_rating": self.compliance_rating,
            "alerts": [a.to_dict() for a in self.alerts],
            "breakdown_by_day": self.breakdown_by_day,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


# ── Public API ────────────────────────────────────────────────────────────────


def compute_compliance_metrics(
    analyses: list[Any],
    days: int = 30,
) -> dict[str, Any]:
    """Compute compliance metrics for qEEG analyses.

    Parameters
    ----------
    analyses
        List of analysis objects (ORM rows or dicts) with attributes:
        report_state, signed_by, safety_cockpit_json, created_at, analysis_id/id
    days
        Reporting period in days (default 30).

    Returns
    -------
    dict
        Compliance metrics with counts, rates, scores, and alerts.
    """
    if not analyses:
        return {
            "period_days": days,
            "total_analyses": 0,
            "approved": 0,
            "approval_rate": 0.0,
            "signed": 0,
            "sign_rate": 0.0,
            "safety_review_rate": 0.0,
            "compliance_score": 0.0,
            "compliance_rating": "no_data",
            "alerts": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    total = len(analyses)
    approved = 0
    signed = 0
    with_safety_review = 0

    # Collect day-by-day breakdown
    day_breakdown: dict[str, dict[str, int]] = {}

    for a in analyses:
        state = _get_attr(a, "report_state", "DRAFT_AI")
        if state in ("APPROVED", "APPROVED_SIGNED", "REVIEWED_WITH_AMENDMENTS"):
            approved += 1
        if _get_attr(a, "signed_by", None):
            signed += 1
        if _get_attr(a, "safety_cockpit_json", None):
            with_safety_review += 1

        # Day breakdown
        created = _get_created_at(a)
        if created:
            day_key = created.strftime("%Y-%m-%d")
            if day_key not in day_breakdown:
                day_breakdown[day_key] = {"total": 0, "approved": 0, "signed": 0}
            day_breakdown[day_key]["total"] += 1
            if state in ("APPROVED", "APPROVED_SIGNED", "REVIEWED_WITH_AMENDMENTS"):
                day_breakdown[day_key]["approved"] += 1
            if _get_attr(a, "signed_by", None):
                day_breakdown[day_key]["signed"] += 1

    approval_rate = approved / total if total else 0.0
    sign_rate = signed / total if total else 0.0
    safety_rate = with_safety_review / total if total else 0.0

    # Weighted compliance score (0–100)
    compliance_score = round(
        ((approval_rate * WEIGHT_APPROVAL) + (sign_rate * WEIGHT_SIGNED)) * 100, 1
    )

    # Rating label
    if compliance_score >= COMPLIANCE_EXCELLENT:
        rating = "excellent"
    elif compliance_score >= COMPLIANCE_GOOD:
        rating = "good"
    elif compliance_score >= COMPLIANCE_ACCEPTABLE:
        rating = "acceptable"
    else:
        rating = "needs_improvement"

    # Generate alerts
    alerts = _generate_qeeg_alerts(analyses)

    metrics = ComplianceMetrics(
        period_days=days,
        total_analyses=total,
        approved=approved,
        approval_rate=approval_rate,
        signed=signed,
        sign_rate=sign_rate,
        safety_review_rate=safety_rate,
        compliance_score=compliance_score,
        compliance_rating=rating,
        alerts=alerts,
        breakdown_by_day=dict(sorted(day_breakdown.items())),
    )

    return metrics.to_dict()


def compute_clinic_summary(
    clinic_analyses: list[Any],
    clinic_id: str,
) -> dict[str, Any]:
    """Compute a clinic-wide summary for dashboard display.

    Parameters
    ----------
    clinic_analyses
        All analyses belonging to a clinic.
    clinic_id
        The clinic identifier.

    Returns
    -------
    dict
        Summary with metrics, trends, and action items.
    """
    metrics = compute_compliance_metrics(clinic_analyses, days=30)

    # Count analyses by state
    state_counts: dict[str, int] = {}
    for a in clinic_analyses:
        state = _get_attr(a, "report_state", "DRAFT_AI")
        state_counts[state] = state_counts.get(state, 0) + 1

    # Pending sign-off queue
    pending_signoff = [
        {
            "analysis_id": _get_attr(a, "id", "unknown"),
            "patient_id": _get_attr(a, "patient_id", "unknown"),
            "created_at": _get_created_at_iso(a),
            "hours_pending": _hours_since(_get_created_at(a)),
        }
        for a in clinic_analyses
        if _get_attr(a, "report_state", "") == "DRAFT_AI"
    ]
    pending_signoff.sort(key=lambda x: x.get("hours_pending", 0), reverse=True)

    return {
        "clinic_id": clinic_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "compliance_metrics": metrics,
        "state_distribution": state_counts,
        "pending_signoff_queue": pending_signoff[:20],  # Top 20 oldest
        "pending_signoff_total": len(pending_signoff),
        "action_items": _generate_action_items(metrics, pending_signoff),
    }


# ── Alert generation ──────────────────────────────────────────────────────────


def _generate_qeeg_alerts(analyses: list[Any]) -> list[ComplianceAlert]:
    """Generate compliance alerts for a list of analyses."""
    alerts: list[ComplianceAlert] = []
    now = datetime.now(timezone.utc)

    for a in analyses:
        analysis_id = _get_attr(a, "id", "unknown")
        state = _get_attr(a, "report_state", "DRAFT_AI")
        created = _get_created_at(a)

        if not created:
            continue

        age_hours = (now - created).total_seconds() / 3600

        # Overdue review alert
        if state == "DRAFT_AI" and age_hours > OVERDUE_REVIEW_HOURS:
            severity = "critical" if age_hours > OVERDUE_REVIEW_CRITICAL_HOURS else "medium"
            alerts.append(
                ComplianceAlert(
                    analysis_id=analysis_id,
                    alert_type="overdue_review",
                    severity=severity,
                    message=(
                        f"Analysis {analysis_id} has been in DRAFT_AI state for "
                        f"{age_hours:.1f} hours (threshold: {OVERDUE_REVIEW_HOURS}h)"
                    ),
                    created_at=created,
                    recommendation="Assign to qualified clinician for review and sign-off.",
                )
            )

        # Missing safety review
        if not _get_attr(a, "safety_cockpit_json", None):
            alerts.append(
                ComplianceAlert(
                    analysis_id=analysis_id,
                    alert_type="missing_safety_review",
                    severity="high",
                    message=f"Analysis {analysis_id} has no safety cockpit review.",
                    created_at=created,
                    recommendation="Run safety cockpit analysis before clinical interpretation.",
                )
            )

        # Approved but not signed
        if state == "APPROVED" and not _get_attr(a, "signed_by", None):
            alerts.append(
                ComplianceAlert(
                    analysis_id=analysis_id,
                    alert_type="approved_not_signed",
                    severity="high",
                    message=f"Analysis {analysis_id} is approved but lacks clinician signature.",
                    created_at=created,
                    recommendation="Complete sign-off workflow before distribution.",
                )
            )

        # Stale analysis (no state change for extended period)
        if age_hours > STALE_ANALYSIS_DAYS * 24 and state == "DRAFT_AI":
            alerts.append(
                ComplianceAlert(
                    analysis_id=analysis_id,
                    alert_type="stale_analysis",
                    severity="medium",
                    message=f"Analysis {analysis_id} is {age_hours / 24:.1f} days old with no review activity.",
                    created_at=created,
                    recommendation="Review analysis status or archive if no longer needed.",
                )
            )

    return alerts


def _generate_action_items(
    metrics: dict[str, Any],
    pending_signoff: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Generate prioritized action items from metrics."""
    actions: list[dict[str, str]] = []

    if metrics.get("compliance_score", 0) < COMPLIANCE_ACCEPTABLE:
        actions.append({
            "priority": "urgent",
            "action": "Review and sign-off on pending analyses",
            "detail": f"Compliance score {metrics['compliance_score']}% is below acceptable threshold ({COMPLIANCE_ACCEPTABLE}%)",
        })

    if metrics.get("safety_review_rate", 0) < 1.0:
        actions.append({
            "priority": "high",
            "action": "Complete safety cockpit reviews",
            "detail": f"Only {metrics.get('safety_review_rate', 0):.0%} of analyses have safety reviews",
        })

    if pending_signoff:
        oldest = pending_signoff[0]
        actions.append({
            "priority": "high",
            "action": f"Clear pending sign-off queue ({len(pending_signoff)} analyses)",
            "detail": f"Oldest pending: {oldest.get('analysis_id', 'unknown')} ({oldest.get('hours_pending', 0):.1f}h)",
        })

    if metrics.get("approval_rate", 0) < 0.8:
        actions.append({
            "priority": "medium",
            "action": "Increase analysis review throughput",
            "detail": f"Current approval rate: {metrics.get('approval_rate', 0):.0%}",
        })

    return actions


# ── Attribute access helpers ──────────────────────────────────────────────────


def _get_attr(obj: Any, name: str, default: Any = None) -> Any:
    """Safely get an attribute from an object or dict."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _get_created_at(obj: Any) -> datetime | None:
    """Extract created_at datetime from object or dict."""
    val = _get_attr(obj, "created_at", None)
    if val is None:
        return None
    if isinstance(val, datetime):
        # Ensure timezone-aware
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except (ValueError, TypeError):
            return None
    return None


def _get_created_at_iso(obj: Any) -> str | None:
    """Get created_at as ISO string."""
    dt = _get_created_at(obj)
    return dt.isoformat() if dt else None


def _hours_since(dt: datetime | None) -> float:
    """Calculate hours since a datetime."""
    if dt is None:
        return 0.0
    now = datetime.now(timezone.utc)
    return max(0.0, (now - dt).total_seconds() / 3600)


# ── Re-exports ────────────────────────────────────────────────────────────────

__all__ = [
    "ComplianceAlert",
    "ComplianceMetrics",
    "compute_compliance_metrics",
    "compute_clinic_summary",
    "OVERDUE_REVIEW_HOURS",
    "OVERDUE_REVIEW_CRITICAL_HOURS",
    "COMPLIANCE_EXCELLENT",
    "COMPLIANCE_GOOD",
    "COMPLIANCE_ACCEPTABLE",
]
