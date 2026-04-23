"""Deterministic home-device alert flag rules.

Rules fire on threshold conditions — no ML, no diagnosis.
All flags require clinician review before any clinical action.

Flag types
----------
missed_sessions        Patient has not logged expected sessions this week
tolerance_drop         Tolerance rating has fallen ≥2 points across consecutive logs
side_effect_escalation New adherence event with severity 'high' or 'urgent'
adherence_concern      Logged session rate <50% of prescribed frequency over 2+ weeks
low_mood_post_session  Mood-after ≤2 on ≥2 consecutive sessions
urgent_symptom         Any adherence event submitted with severity='urgent'
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.persistence.models import (
    DeviceSessionLog,
    HomeDeviceAssignment,
    HomeDeviceReviewFlag,
    PatientAdherenceEvent,
)


# ── Thresholds ─────────────────────────────────────────────────────────────────

_TOLERANCE_DROP_THRESHOLD    = 2      # drop of ≥2 tolerance points = flag
_ADHERENCE_RATE_CONCERN      = 0.50   # <50% of expected sessions = adherence concern
_ADHERENCE_CONCERN_MIN_WEEKS = 2      # require at least 2 weeks of history
_LOW_MOOD_THRESHOLD          = 2      # mood_after ≤2/5
_LOW_MOOD_CONSECUTIVE        = 2      # on ≥N consecutive sessions
_DEDUP_HOURS                 = 48     # suppress same flag_type within 48h


# ── Internal helpers ───────────────────────────────────────────────────────────

def _already_flagged(
    patient_id: str,
    flag_type: str,
    assignment_id: Optional[str],
    db: Session,
) -> bool:
    """Return True if an active flag of this type was raised within the dedup window."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_DEDUP_HOURS)
    q = (
        db.query(HomeDeviceReviewFlag)
        .filter(
            HomeDeviceReviewFlag.patient_id == patient_id,
            HomeDeviceReviewFlag.flag_type == flag_type,
            HomeDeviceReviewFlag.triggered_at >= cutoff,
            HomeDeviceReviewFlag.dismissed == False,  # noqa: E712
        )
    )
    if assignment_id:
        q = q.filter(HomeDeviceReviewFlag.assignment_id == assignment_id)
    return q.first() is not None


def _emit(
    *,
    patient_id: str,
    flag_type: str,
    severity: str,
    detail: str,
    assignment_id: Optional[str] = None,
    session_log_id: Optional[str] = None,
    adherence_event_id: Optional[str] = None,
    course_id: Optional[str] = None,
    db: Session,
) -> Optional[HomeDeviceReviewFlag]:
    """Persist a new flag if not already active within dedup window."""
    # Pessimistic re-check inside transaction (mirrors wearable_flags pattern)
    if _already_flagged(patient_id, flag_type, assignment_id, db):
        return None

    flag = HomeDeviceReviewFlag(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        assignment_id=assignment_id,
        session_log_id=session_log_id,
        adherence_event_id=adherence_event_id,
        course_id=course_id,
        flag_type=flag_type,
        severity=severity,
        detail=detail,
        auto_generated=True,
        triggered_at=datetime.now(timezone.utc),
        dismissed=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(flag)
    # flush() stages the write within the current transaction;
    # caller (router) is responsible for commit() to persist the flags.
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        # Flag already exists due to concurrent insert — expected, skip.
        return None
    return flag


# ── Public entry point ─────────────────────────────────────────────────────────

def run_home_device_flag_checks(
    patient_id: str,
    assignment: HomeDeviceAssignment,
    db: Session,
    *,
    new_session_log: Optional[DeviceSessionLog] = None,
    new_adherence_event: Optional[PatientAdherenceEvent] = None,
) -> list[HomeDeviceReviewFlag]:
    """Run all flag checks for one assignment and persist any new flags.

    Called after:
    - Patient logs a home session (pass new_session_log)
    - Patient submits an adherence event (pass new_adherence_event)

    Returns list of newly created flags.
    """
    new_flags: list[HomeDeviceReviewFlag] = []
    now = datetime.now(timezone.utc)

    # ── 1. Urgent symptom — immediate flag on urgent adherence event ───────────
    if new_adherence_event and new_adherence_event.severity == "urgent":
        flag = _emit(
            patient_id=patient_id,
            flag_type="urgent_symptom",
            severity="urgent",
            detail=(
                f"Patient reported urgent concern: "
                f"{(new_adherence_event.body or '')[:200]}"
            ),
            assignment_id=assignment.id,
            adherence_event_id=new_adherence_event.id,
            course_id=assignment.course_id,
            db=db,
        )
        if flag:
            new_flags.append(flag)

    # ── 2. Side-effect escalation — high/urgent adherence event ───────────────
    if (
        new_adherence_event
        and new_adherence_event.event_type == "side_effect"
        and new_adherence_event.severity in ("high", "urgent")
    ):
        flag = _emit(
            patient_id=patient_id,
            flag_type="side_effect_escalation",
            severity="urgent" if new_adherence_event.severity == "urgent" else "warning",
            detail=(
                f"Patient reported {new_adherence_event.severity} side effect. "
                f"Review required before next session."
            ),
            assignment_id=assignment.id,
            adherence_event_id=new_adherence_event.id,
            course_id=assignment.course_id,
            db=db,
        )
        if flag:
            new_flags.append(flag)

    # ── Pull recent session logs for trend checks ─────────────────────────────
    recent_logs: list[DeviceSessionLog] = (
        db.query(DeviceSessionLog)
        .filter(
            DeviceSessionLog.assignment_id == assignment.id,
            DeviceSessionLog.patient_id == patient_id,
        )
        .order_by(DeviceSessionLog.session_date.desc())
        .limit(14)
        .all()
    )

    # ── 3. Tolerance drop ─────────────────────────────────────────────────────
    rated = [s for s in recent_logs if s.tolerance_rating is not None]
    if len(rated) >= 2:
        latest_tol   = rated[0].tolerance_rating
        previous_tol = rated[1].tolerance_rating
        if previous_tol - latest_tol >= _TOLERANCE_DROP_THRESHOLD:
            flag = _emit(
                patient_id=patient_id,
                flag_type="tolerance_drop",
                severity="warning",
                detail=(
                    f"Tolerance dropped from {previous_tol}/5 to {latest_tol}/5 "
                    f"across last two sessions."
                ),
                assignment_id=assignment.id,
                session_log_id=new_session_log.id if new_session_log else None,
                course_id=assignment.course_id,
                db=db,
            )
            if flag:
                new_flags.append(flag)

    # ── 4. Low mood post-session ───────────────────────────────────────────────
    mood_vals = [
        s.mood_after for s in recent_logs
        if s.mood_after is not None
    ][:_LOW_MOOD_CONSECUTIVE]
    if (
        len(mood_vals) >= _LOW_MOOD_CONSECUTIVE
        and all(m <= _LOW_MOOD_THRESHOLD for m in mood_vals)
    ):
        flag = _emit(
            patient_id=patient_id,
            flag_type="low_mood_post_session",
            severity="warning",
            detail=(
                f"Mood after session rated ≤{_LOW_MOOD_THRESHOLD}/5 on last "
                f"{_LOW_MOOD_CONSECUTIVE} sessions."
            ),
            assignment_id=assignment.id,
            session_log_id=new_session_log.id if new_session_log else None,
            course_id=assignment.course_id,
            db=db,
        )
        if flag:
            new_flags.append(flag)

    # ── 5. Missed sessions (weekly check) ────────────────────────────────────
    if assignment.session_frequency_per_week:
        week_start = (now - timedelta(days=now.weekday())).date()
        sessions_this_week = sum(
            1 for s in recent_logs
            if s.session_date >= week_start.isoformat()
        )
        expected = assignment.session_frequency_per_week
        # Flag on Friday or later if more than 1 session still missing
        days_remaining = 6 - now.weekday()
        if (
            sessions_this_week < expected - 1
            and days_remaining <= 2
        ):
            flag = _emit(
                patient_id=patient_id,
                flag_type="missed_sessions",
                severity="info",
                detail=(
                    f"Patient has logged {sessions_this_week}/{expected} expected "
                    f"sessions this week with {days_remaining} days remaining."
                ),
                assignment_id=assignment.id,
                course_id=assignment.course_id,
                db=db,
            )
            if flag:
                new_flags.append(flag)

    # ── 6. Adherence concern (multi-week) ─────────────────────────────────────
    if assignment.session_frequency_per_week and assignment.planned_total_sessions:
        cutoff_2w = (now - timedelta(weeks=2)).date().isoformat()
        logs_2w = [s for s in recent_logs if s.session_date >= cutoff_2w]
        expected_2w = assignment.session_frequency_per_week * 2
        if expected_2w > 0:
            rate = len(logs_2w) / expected_2w
            if rate < _ADHERENCE_RATE_CONCERN:
                flag = _emit(
                    patient_id=patient_id,
                    flag_type="adherence_concern",
                    severity="warning",
                    detail=(
                        f"Adherence rate over last 2 weeks: "
                        f"{len(logs_2w)}/{expected_2w} sessions "
                        f"({rate * 100:.0f}% of prescribed frequency)."
                    ),
                    assignment_id=assignment.id,
                    course_id=assignment.course_id,
                    db=db,
                )
                if flag:
                    new_flags.append(flag)

    return new_flags
