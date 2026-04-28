"""Longitudinal DeepTwin/qEEG Timeline builder.

Aggregates qEEG, symptom scales, treatment sessions, sleep/medication notes,
and outcomes into a unified chronology for clinician review.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.persistence.models import (
    OutcomeEvent,
    OutcomeSeries,
    QEEGAnalysis,
    QEEGComparison,
    QEEGTimelineEvent,
    WearableDailySummary,
)


def build_timeline(patient_id: str, db: Session) -> list[dict]:
    """Build a chronologically sorted timeline for a patient.

    Returns
    -------
    list[dict]
        Each event dict has: date, type, title, summary, status, rci,
        confounders, ai_explanation, confidence, source.
    """
    events: list[dict] = []

    # 1. qEEG analyses
    analyses = (
        db.query(QEEGAnalysis)
        .filter_by(patient_id=patient_id)
        .order_by(QEEGAnalysis.analyzed_at.asc())
        .all()
    )
    baseline_bp: Optional[dict] = None
    for analysis in analyses:
        date_str = _format_date(analysis.analyzed_at or analysis.created_at)
        bp = _json_loads(analysis.band_powers_json) or {}
        status = "unchanged"
        rci: Optional[float] = None
        if baseline_bp is not None:
            rci = _compute_rci(baseline_bp, bp)
            status = _classify_change(rci)
        else:
            baseline_bp = bp

        events.append({
            "date": date_str,
            "event_type": "qeeg_followup" if baseline_bp is not bp else "qeeg_baseline",
            "title": f"qEEG — {analysis.id[:8]}",
            "summary": f"{analysis.channel_count or 0} ch, {analysis.sample_rate_hz or 0:.0f} Hz, {analysis.recording_duration_sec or 0:.0f}s",
            "status": status,
            "rci": rci,
            "confounders": [],
            "ai_explanation": _qeeg_change_summary(bp, baseline_bp) if baseline_bp is not bp else "Baseline recording.",
            "confidence": analysis.interpretability_status or "LIMITED_QUALITY",
            "source": "qEEG Analyzer",
        })

    # 2. Symptom scales (OutcomeSeries)
    outcomes = (
        db.query(OutcomeSeries)
        .filter_by(patient_id=patient_id)
        .order_by(OutcomeSeries.administered_at.asc())
        .all()
    )
    baseline_score: Optional[float] = None
    for outcome in outcomes:
        date_str = _format_date(outcome.administered_at)
        score = outcome.score_numeric
        status = "unchanged"
        rci: Optional[float] = None
        if score is not None and baseline_score is not None:
            rci = score - baseline_score
            status = "improved" if rci < 0 else "worsened" if rci > 0 else "unchanged"
        elif score is not None:
            baseline_score = score

        events.append({
            "date": date_str,
            "event_type": "symptom_scale",
            "title": outcome.template_title,
            "summary": f"Score: {outcome.score or 'N/A'} ({outcome.measurement_point})",
            "status": status,
            "rci": rci,
            "confounders": [],
            "ai_explanation": None,
            "confidence": "moderate",
            "source": "Assessment",
        })

    # 3. Outcome events (treatments, medication changes, sleep notes)
    outcome_events = (
        db.query(OutcomeEvent)
        .filter_by(patient_id=patient_id)
        .order_by(OutcomeEvent.recorded_at.asc())
        .all()
    )
    for evt in outcome_events:
        date_str = _format_date(evt.recorded_at)
        event_type = _map_outcome_event_type(evt.event_type)
        events.append({
            "date": date_str,
            "event_type": event_type,
            "title": evt.title,
            "summary": evt.summary or "",
            "status": "uncertain",
            "rci": None,
            "confounders": [evt.title] if event_type == "confounder" else [],
            "ai_explanation": None,
            "confidence": evt.severity,
            "source": evt.source_type or "clinical",
        })

    # 4. Wearable daily summaries (sleep)
    wearables = (
        db.query(WearableDailySummary)
        .filter_by(patient_id=patient_id)
        .order_by(WearableDailySummary.date.asc())
        .limit(90)
        .all()
    )
    for w in wearables:
        if w.sleep_duration_h is not None:
            events.append({
                "date": w.date,
                "event_type": "sleep_note",
                "title": "Sleep",
                "summary": f"{w.sleep_duration_h:.1f}h sleep",
                "status": "unchanged",
                "rci": None,
                "confounders": [] if w.sleep_duration_h >= 6 else ["short_sleep"],
                "ai_explanation": None,
                "confidence": "moderate",
                "source": w.source,
            })

    # Sort chronologically
    events.sort(key=lambda e: e["date"])
    return events


def persist_timeline_event(
    patient_id: str,
    event_type: str,
    event_date: str,
    event_data: dict,
    source: str,
    confidence: Optional[str],
    db: Session,
) -> QEEGTimelineEvent:
    """Persist a custom timeline event."""
    evt = QEEGTimelineEvent(
        patient_id=patient_id,
        event_type=event_type,
        event_date=event_date,
        event_data_json=json.dumps(event_data),
        source=source,
        confidence=confidence,
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


def _compute_rci(baseline: dict, followup: dict) -> Optional[float]:
    """Compute a simple reliable-change-like index on global theta power."""
    try:
        b_theta = float(baseline.get("global_summary", {}).get("theta_mean_uv2") or 0)
        f_theta = float(followup.get("global_summary", {}).get("theta_mean_uv2") or 0)
        if b_theta == 0:
            return None
        return round(((f_theta - b_theta) / b_theta) * 100, 2)
    except (TypeError, ValueError, AttributeError):
        return None


def _classify_change(rci: Optional[float]) -> str:
    if rci is None:
        return "uncertain"
    if abs(rci) < 10:
        return "unchanged"
    return "improved" if rci < 0 else "worsened"


def _qeeg_change_summary(bp: dict, baseline: dict) -> Optional[str]:
    rci = _compute_rci(baseline, bp)
    if rci is None:
        return None
    direction = "decreased" if rci < 0 else "increased"
    return f"Global theta activity {direction} by {abs(rci):.1f}% relative to baseline."


def _map_outcome_event_type(raw: str) -> str:
    mapping = {
        "treatment_session": "treatment_session",
        "medication_change": "medication_note",
        "sleep_disruption": "sleep_note",
        "adverse_event": "confounder",
        "confounder": "confounder",
    }
    return mapping.get(raw, "outcome")
