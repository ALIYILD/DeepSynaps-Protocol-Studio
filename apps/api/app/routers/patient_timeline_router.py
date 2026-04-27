"""Patient Timeline aggregator — CONTRACT_V3 §6.

Single endpoint:

* ``GET /api/v1/patient-timeline/{patient_id}`` — aggregates rows from
  ``qeeg_analyses``, ``mri_analyses``, ``assessment_records``,
  ``clinical_sessions``, and (optionally) ``outcome_events`` into a flat
  list of time-ordered events for a patient timeline swim-lane view.

Return shape (CONTRACT_V3 §6)::

    {"events": [
        {"type": str, "at": iso8601, "summary": str,
         "ref_id": str, "lane": str, "connects_to": [str]},
        ...
    ]}

Lanes are one of ``{"qeeg", "mri", "assessment", "session", "outcome"}``.

Demo-mode behaviour
-------------------
When the patient has zero rows in every table (e.g. offline Netlify preview
or CI using a fresh sqlite), the endpoint synthesises 6 events dated across
the last 90 days so the frontend swim-lane page has something to paint.

Role gate: clinician or above. Regulatory posture: banned-word sanitised
on every ``summary`` field before shipping to the browser.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.persistence.models import (
    AssessmentRecord,
    ClinicalSession,
    MriAnalysis,
    QEEGAnalysis,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/patient-timeline", tags=["patient-timeline"])


# ── Banned-word sanitiser (CONTRACT §8) ─────────────────────────────────────
_BANNED_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\btreatment\s+recommendations?\b", re.IGNORECASE), "protocol consideration"),
    (re.compile(r"\bdiagnoses\b", re.IGNORECASE), "findings"),
    (re.compile(r"\bdiagnosis\b", re.IGNORECASE), "finding"),
    (re.compile(r"\bdiagnostic\b", re.IGNORECASE), "finding-oriented"),
    (re.compile(r"\bdiagnose(s|d)?\b", re.IGNORECASE), "identify"),
]


def _sanitise(text: Any) -> str:
    """Scrub banned words out of a user-facing summary string."""
    if not isinstance(text, str):
        return "" if text is None else str(text)
    out = text
    for pat, repl in _BANNED_PATTERNS:
        out = pat.subn(repl, out)[0]
    return out


# ── Helpers ─────────────────────────────────────────────────────────────────


def _isofmt(value: Any) -> str:
    """Serialise a ``datetime`` / iso-string into a stable UTC iso8601 string."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


def _outcome_event_model():
    """Optionally resolve ``OutcomeEvent`` model when Agent R has landed it.

    Returns ``None`` when the class / table hasn't been added yet so this
    router stays import-safe across agent rollout order.
    """
    try:
        from app.persistence import models as _models
    except Exception:  # pragma: no cover - defensive
        return None
    return getattr(_models, "OutcomeEvent", None)


def _synth_demo_events(patient_id: str) -> list[dict[str, Any]]:
    """Synthesise 6 representative events spread across the last 90 days.

    Used only when the patient has zero real events across all tables. The
    shape + lanes match the live path exactly.
    """
    now = datetime.now(timezone.utc)

    def _d(days_ago: int) -> str:
        return (now - timedelta(days=days_ago)).isoformat()

    events = [
        {
            "type": "qeeg_analysis",
            "at": _d(85),
            "summary": "Baseline qEEG: elevated frontal theta; low alpha PAF",
            "ref_id": f"demo-qeeg-1-{patient_id}",
            "lane": "qeeg",
            "connects_to": [],
        },
        {
            "type": "assessment",
            "at": _d(80),
            "summary": "PHQ-9 baseline: score 18 (moderately severe)",
            "ref_id": f"demo-phq9-1-{patient_id}",
            "lane": "assessment",
            "connects_to": [],
        },
        {
            "type": "mri_analysis",
            "at": _d(70),
            "summary": "MRI structural + rs-fMRI: sgACC–DLPFC anticorrelation z=-2.6",
            "ref_id": f"demo-mri-1-{patient_id}",
            "lane": "mri",
            "connects_to": [],
        },
        {
            "type": "session",
            "at": _d(60),
            "summary": "rTMS session #1 (left DLPFC, 10 Hz) — well tolerated",
            "ref_id": f"demo-sess-1-{patient_id}",
            "lane": "session",
            "connects_to": [f"demo-mri-1-{patient_id}"],
        },
        {
            "type": "session",
            "at": _d(30),
            "summary": "rTMS session #20 (mid-course) — protocol adherence 95%",
            "ref_id": f"demo-sess-20-{patient_id}",
            "lane": "session",
            "connects_to": [f"demo-mri-1-{patient_id}"],
        },
        {
            "type": "qeeg_analysis",
            "at": _d(10),
            "summary": "Follow-up qEEG: frontal theta normalising; PAF +0.8 Hz",
            "ref_id": f"demo-qeeg-2-{patient_id}",
            "lane": "qeeg",
            "connects_to": [],
        },
    ]
    # Apply the sanitiser so the demo path is consistent with live.
    for ev in events:
        ev["summary"] = _sanitise(ev["summary"])
    return events


# ── Loaders — one per source table, all guard on row-presence ───────────────


def _load_qeeg(db: Session, patient_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(QEEGAnalysis)
        .filter(QEEGAnalysis.patient_id == patient_id)
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        at = row.analyzed_at or row.created_at
        flagged = row.flagged_conditions or ""
        if flagged:
            try:
                parsed = json.loads(flagged)
                if isinstance(parsed, list):
                    flagged = ", ".join(str(x) for x in parsed)
            except (ValueError, TypeError):
                pass
        summary = f"qEEG analysis ({row.analysis_status or 'pending'})"
        if flagged:
            summary += f": flagged {flagged}"
        out.append({
            "type": "qeeg_analysis",
            "at": _isofmt(at),
            "summary": _sanitise(summary),
            "ref_id": row.id,
            "lane": "qeeg",
            "connects_to": [],
        })
    return out


def _load_mri(db: Session, patient_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(MriAnalysis)
        .filter(MriAnalysis.patient_id == patient_id)
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        cond = row.condition or "—"
        targets_desc = ""
        try:
            targets = json.loads(row.stim_targets_json or "[]")
            if isinstance(targets, list) and targets:
                regions = [str(t.get("region_name") or t.get("target_id") or "")
                           for t in targets if isinstance(t, dict)]
                regions = [r for r in regions if r][:3]
                if regions:
                    targets_desc = " · targets: " + ", ".join(regions)
        except (ValueError, TypeError):
            pass
        summary = f"MRI analysis ({cond}, state={row.state}){targets_desc}"
        out.append({
            "type": "mri_analysis",
            "at": _isofmt(row.created_at),
            "summary": _sanitise(summary),
            "ref_id": row.analysis_id,
            "lane": "mri",
            "connects_to": [],
        })
    return out


def _load_assessments(db: Session, patient_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(AssessmentRecord)
        .filter(AssessmentRecord.patient_id == patient_id)
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        summary = f"{row.template_title or row.template_id or 'Assessment'}"
        if row.score:
            summary += f": score {row.score}"
        out.append({
            "type": "assessment",
            "at": _isofmt(getattr(row, "created_at", None) or getattr(row, "due_date", None)),
            "summary": _sanitise(summary),
            "ref_id": row.id,
            "lane": "assessment",
            "connects_to": [],
        })
    return out


def _load_sessions(db: Session, patient_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == patient_id)
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        modality = row.modality or row.appointment_type or "session"
        num = row.session_number
        total = row.total_sessions
        sess_str = f" #{num}" if num else ""
        if total:
            sess_str += f"/{total}"
        summary = f"{modality}{sess_str} ({row.status})"
        # Cross-lane arrow — connect the session back to the protocol ref if
        # one is set. Frontend resolves the ref_id against the mri/qeeg lane.
        connects = [row.protocol_ref] if row.protocol_ref else []
        out.append({
            "type": "session",
            "at": _isofmt(row.scheduled_at),
            "summary": _sanitise(summary),
            "ref_id": row.id,
            "lane": "session",
            "connects_to": connects,
        })
    return out


def _load_outcomes(db: Session, patient_id: str) -> list[dict[str, Any]]:
    """Load outcome events, guarding for the case where the table doesn't
    exist yet (Agent R's migration 042).
    """
    OutcomeEvent = _outcome_event_model()
    if OutcomeEvent is None:
        return []
    # Even when the model class exists, the table may not — inspect.
    try:
        insp = sa_inspect(db.get_bind())
        if not insp.has_table(getattr(OutcomeEvent, "__tablename__", "outcome_events")):
            return []
    except Exception:  # pragma: no cover - defensive
        return []
    try:
        rows = db.query(OutcomeEvent).filter(
            OutcomeEvent.patient_id == patient_id
        ).all()
    except Exception as exc:  # pragma: no cover - defensive
        _log.warning("outcome_events query failed: %s", exc)
        return []
    out: list[dict[str, Any]] = []
    for row in rows:
        modality = getattr(row, "protocol_modality", None) or "outcome"
        region = getattr(row, "target_region", None) or "—"
        accepted = getattr(row, "accepted", None)
        summary = f"Outcome ({modality} · {region})"
        if accepted is not None:
            summary += " · accepted" if accepted else " · rejected"
        ref_id = getattr(row, "id", None) or getattr(row, "recommendation_id", "")
        connects = []
        rec_id = getattr(row, "recommendation_id", None)
        if rec_id:
            connects.append(str(rec_id))
        sess_id = getattr(row, "session_id", None)
        if sess_id:
            connects.append(str(sess_id))
        out.append({
            "type": "outcome",
            "at": _isofmt(getattr(row, "started_at", None) or getattr(row, "created_at", None)),
            "summary": _sanitise(summary),
            "ref_id": str(ref_id),
            "lane": "outcome",
            "connects_to": connects,
        })
    return out


# ── Endpoint ────────────────────────────────────────────────────────────────


@router.get("/{patient_id}")
def get_patient_timeline(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return the aggregated timeline for a patient.

    Parameters
    ----------
    patient_id
        Patient id (maps to ``qeeg_analyses.patient_id`` /
        ``mri_analyses.patient_id`` / ``assessment_records.patient_id`` /
        ``clinical_sessions.patient_id``).

    Returns
    -------
    dict
        ``{"events": [...]}`` per CONTRACT_V3 §6. Events sorted newest first.
    """
    require_minimum_role(actor, "clinician")

    events: list[dict[str, Any]] = []
    events.extend(_load_qeeg(db, patient_id))
    events.extend(_load_mri(db, patient_id))
    events.extend(_load_assessments(db, patient_id))
    events.extend(_load_sessions(db, patient_id))
    events.extend(_load_outcomes(db, patient_id))

    # Demo-mode synthesis — when nothing real exists, fabricate a plausible
    # 6-event history so the frontend swim-lane page always has content.
    if not events:
        events = _synth_demo_events(patient_id)

    events.sort(key=lambda e: e.get("at") or "", reverse=True)
    return {"events": events}
