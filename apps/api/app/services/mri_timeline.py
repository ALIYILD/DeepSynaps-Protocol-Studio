"""MRI Timeline builder.

Aggregates MRI analyses, safety events, red flags, and report state changes
into a unified chronology for clinician review.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.persistence.models import MriAnalysis, MriTimelineEvent


def build_timeline(patient_id: str, db: Session) -> list[dict]:
    """Build a chronologically sorted timeline for a patient.

    Returns
    -------
    list[dict]
        Each event dict has: date, event_type, title, description,
        severity, resolved, source_analysis_id.
    """
    events: list[dict] = []

    # 1. MRI analyses
    analyses = (
        db.query(MriAnalysis)
        .filter_by(patient_id=patient_id)
        .order_by(MriAnalysis.created_at.asc())
        .all()
    )
    for analysis in analyses:
        date_str = _format_date(analysis.created_at)
        events.append({
            "date": date_str,
            "event_type": "mri_analysis",
            "title": f"MRI Analysis — {analysis.analysis_id[:8]}",
            "description": f"Modalities: {_modalities_summary(analysis)}",
            "severity": None,
            "resolved": analysis.report_state in ("MRI_APPROVED", "MRI_REVIEWED_WITH_AMENDMENTS"),
            "source_analysis_id": analysis.analysis_id,
        })

        # Safety cockpit events
        cockpit = _json_loads(analysis.safety_cockpit_json) or {}
        checks = cockpit.get("checks", [])
        for check in checks:
            if check.get("status") == "FAIL":
                events.append({
                    "date": date_str,
                    "event_type": "mri_safety_alert",
                    "title": f"Safety: {check.get('name', 'Unknown')}",
                    "description": check.get("detail", ""),
                    "severity": check.get("severity", "medium"),
                    "resolved": False,
                    "source_analysis_id": analysis.analysis_id,
                })

        # Red flags
        red_flags = _json_loads(analysis.red_flags_json) or []
        for flag in red_flags:
            events.append({
                "date": date_str,
                "event_type": "mri_red_flag",
                "title": flag.get("title", "Red Flag"),
                "description": flag.get("detail", ""),
                "severity": flag.get("severity", "high"),
                "resolved": flag.get("resolved", False),
                "source_analysis_id": analysis.analysis_id,
            })

        # Report state transitions
        if analysis.report_state and analysis.report_state != "MRI_DRAFT_AI":
            events.append({
                "date": date_str,
                "event_type": "mri_report_state",
                "title": f"Report: {analysis.report_state}",
                "description": f"Reviewer: {analysis.reviewer_id or 'N/A'}",
                "severity": None,
                "resolved": analysis.report_state in ("MRI_APPROVED", "MRI_REVIEWED_WITH_AMENDMENTS"),
                "source_analysis_id": analysis.analysis_id,
            })

    # 2. Persisted timeline events
    persisted = (
        db.query(MriTimelineEvent)
        .filter_by(patient_id=patient_id)
        .order_by(MriTimelineEvent.created_at.asc())
        .all()
    )
    for evt in persisted:
        events.append({
            "date": _format_date(evt.created_at),
            "event_type": evt.event_type,
            "title": evt.title,
            "description": evt.description or "",
            "severity": evt.severity,
            "resolved": evt.resolved,
            "source_analysis_id": evt.source_analysis_id,
        })

    # Sort chronologically
    events.sort(key=lambda e: e["date"])
    return events


def persist_timeline_event(
    patient_id: str,
    event_type: str,
    title: str,
    description: Optional[str],
    event_date: Optional[str],
    severity: Optional[str],
    source_analysis_id: Optional[str],
    db: Session,
) -> MriTimelineEvent:
    """Persist a custom timeline event."""
    parsed_date = None
    if event_date:
        try:
            parsed_date = datetime.strptime(event_date, "%Y-%m-%d")
        except ValueError:
            pass

    evt = MriTimelineEvent(
        patient_id=patient_id,
        event_type=event_type,
        title=title,
        description=description,
        event_date=parsed_date,
        severity=severity,
        source_analysis_id=source_analysis_id,
    )
    db.add(evt)
    return evt


# ── Helpers ──────────────────────────────────────────────────────────────────

def _format_date(dt: Optional[datetime]) -> str:
    if dt is None:
        return ""
    return dt.strftime("%Y-%m-%d")


def _json_loads(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _modalities_summary(analysis: MriAnalysis) -> str:
    modalities = _json_loads(analysis.modalities_present_json) or {}
    if isinstance(modalities, dict):
        return ", ".join(k for k, v in modalities.items() if v) or "unknown"
    return str(modalities)
