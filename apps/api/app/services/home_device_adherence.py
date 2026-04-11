"""Home device adherence analytics.

Stateless functions — pass a DB session and an assignment id.
All calculations are descriptive, not clinical.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import (
    DeviceSessionLog,
    HomeDeviceAssignment,
    HomeDeviceReviewFlag,
    PatientAdherenceEvent,
)


def compute_adherence_summary(
    assignment: HomeDeviceAssignment,
    db: Session,
) -> dict:
    """Return adherence metrics for one assignment.

    Returns
    -------
    dict with keys:
        sessions_logged       int
        sessions_expected     int | None  (None if no planned_total_sessions)
        adherence_rate_pct    float | None
        streak_current        int   (consecutive days with ≥1 session, counting back from today)
        streak_best           int
        avg_duration_min      float | None
        avg_tolerance         float | None
        avg_mood_before       float | None
        avg_mood_after        float | None
        side_effect_count     int
        open_flags            int
        logs_by_week          list[dict]  [{week_start, count}]
    """
    now = datetime.utcnow()

    logs: list[DeviceSessionLog] = (
        db.query(DeviceSessionLog)
        .filter(DeviceSessionLog.assignment_id == assignment.id)
        .order_by(DeviceSessionLog.session_date.asc())
        .all()
    )

    sessions_logged   = len(logs)
    sessions_expected = assignment.planned_total_sessions

    # Adherence rate
    adherence_rate_pct: Optional[float] = None
    if sessions_expected and sessions_expected > 0:
        adherence_rate_pct = round(sessions_logged / sessions_expected * 100, 1)

    # Averages
    def _avg(values: list) -> Optional[float]:
        clean = [v for v in values if v is not None]
        return round(sum(clean) / len(clean), 1) if clean else None

    avg_duration_min = _avg([s.duration_minutes for s in logs])
    avg_tolerance    = _avg([s.tolerance_rating for s in logs])
    avg_mood_before  = _avg([s.mood_before for s in logs])
    avg_mood_after   = _avg([s.mood_after for s in logs])

    # Current streak (consecutive days with ≥1 session going backward from today)
    logged_dates = {s.session_date for s in logs}
    streak_current = 0
    check = now.date()
    while check.isoformat() in logged_dates:
        streak_current += 1
        check -= timedelta(days=1)

    # Best streak
    streak_best    = 0
    current_streak = 0
    all_dates = sorted(logged_dates)
    if all_dates:
        from datetime import date as _date
        prev = _date.fromisoformat(all_dates[0]) - timedelta(days=1)
        for ds in all_dates:
            d = _date.fromisoformat(ds)
            if d == prev + timedelta(days=1):
                current_streak += 1
            else:
                current_streak = 1
            streak_best = max(streak_best, current_streak)
            prev = d

    # Sessions per week (last 8 weeks)
    logs_by_week: list[dict] = []
    for w in range(8):
        week_end   = (now - timedelta(weeks=w)).date()
        week_start = week_end - timedelta(days=6)
        count = sum(
            1 for s in logs
            if week_start.isoformat() <= s.session_date <= week_end.isoformat()
        )
        logs_by_week.append({"week_start": week_start.isoformat(), "count": count})
    logs_by_week.reverse()

    # Side effect count (from adherence events)
    side_effect_count: int = (
        db.query(PatientAdherenceEvent)
        .filter(
            PatientAdherenceEvent.assignment_id == assignment.id,
            PatientAdherenceEvent.event_type == "side_effect",
        )
        .count()
    )

    # Open flags
    open_flags: int = (
        db.query(HomeDeviceReviewFlag)
        .filter(
            HomeDeviceReviewFlag.assignment_id == assignment.id,
            HomeDeviceReviewFlag.dismissed == False,  # noqa: E712
        )
        .count()
    )

    return {
        "sessions_logged": sessions_logged,
        "sessions_expected": sessions_expected,
        "adherence_rate_pct": adherence_rate_pct,
        "streak_current": streak_current,
        "streak_best": streak_best,
        "avg_duration_min": avg_duration_min,
        "avg_tolerance": avg_tolerance,
        "avg_mood_before": avg_mood_before,
        "avg_mood_after": avg_mood_after,
        "side_effect_count": side_effect_count,
        "open_flags": open_flags,
        "logs_by_week": logs_by_week,
    }
