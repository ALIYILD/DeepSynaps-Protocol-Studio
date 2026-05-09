"""Unit tests for app.services.home_device_adherence.

Descriptive analytics only — all DB calls are mocked.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services.home_device_adherence import compute_adherence_summary


# ── helpers ───────────────────────────────────────────────────────────────────

def _mock_assignment(planned_total_sessions=10):
    a = MagicMock()
    a.id = "assign-1"
    a.planned_total_sessions = planned_total_sessions
    return a


def _mock_log(
    session_date: str,
    duration_minutes=30.0,
    tolerance_rating=7.0,
    mood_before=5.0,
    mood_after=6.0,
    assignment_id="assign-1",
):
    s = MagicMock()
    s.assignment_id = assignment_id
    s.session_date = session_date
    s.duration_minutes = duration_minutes
    s.tolerance_rating = tolerance_rating
    s.mood_before = mood_before
    s.mood_after = mood_after
    return s


def _make_db(logs=None, side_effects_count=0, open_flags_count=0):
    """Build a mock DB session whose query() returns pre-canned results."""
    db = MagicMock()

    # query(DeviceSessionLog).filter().order_by().all() → logs
    q_log = MagicMock()
    q_log.filter.return_value.order_by.return_value.all.return_value = logs or []

    # query(PatientAdherenceEvent).filter().count() → side_effects
    q_event = MagicMock()
    q_event.filter.return_value.count.return_value = side_effects_count

    # query(HomeDeviceReviewFlag).filter().count() → open_flags
    q_flag = MagicMock()
    q_flag.filter.return_value.count.return_value = open_flags_count

    from app.persistence.models import DeviceSessionLog, HomeDeviceReviewFlag, PatientAdherenceEvent

    def _query_dispatch(model):
        if model is DeviceSessionLog:
            return q_log
        if model is PatientAdherenceEvent:
            return q_event
        if model is HomeDeviceReviewFlag:
            return q_flag
        return MagicMock()

    db.query.side_effect = _query_dispatch
    return db


# ── tests ─────────────────────────────────────────────────────────────────────

class TestAdherenceSummary:
    def test_empty_logs_returns_zero_sessions(self):
        assignment = _mock_assignment(planned_total_sessions=10)
        db = _make_db(logs=[])
        result = compute_adherence_summary(assignment, db)
        assert result["sessions_logged"] == 0

    def test_adherence_rate_calculated_correctly(self):
        assignment = _mock_assignment(planned_total_sessions=10)
        today = date.today()
        logs = [_mock_log((today - timedelta(days=i)).isoformat()) for i in range(5)]
        db = _make_db(logs=logs)
        result = compute_adherence_summary(assignment, db)
        assert result["adherence_rate_pct"] == 50.0

    def test_adherence_rate_none_when_no_planned(self):
        assignment = _mock_assignment(planned_total_sessions=None)
        db = _make_db(logs=[])
        result = compute_adherence_summary(assignment, db)
        assert result["adherence_rate_pct"] is None

    def test_avg_duration_computed(self):
        assignment = _mock_assignment()
        logs = [
            _mock_log("2024-06-01", duration_minutes=30.0),
            _mock_log("2024-06-02", duration_minutes=60.0),
        ]
        db = _make_db(logs=logs)
        result = compute_adherence_summary(assignment, db)
        assert result["avg_duration_min"] == 45.0

    def test_avg_duration_none_when_all_logs_have_none(self):
        assignment = _mock_assignment()
        log = _mock_log("2024-06-01")
        log.duration_minutes = None
        db = _make_db(logs=[log])
        result = compute_adherence_summary(assignment, db)
        assert result["avg_duration_min"] is None

    def test_avg_tolerance_computed(self):
        assignment = _mock_assignment()
        logs = [
            _mock_log("2024-06-01", tolerance_rating=8.0),
            _mock_log("2024-06-02", tolerance_rating=6.0),
        ]
        db = _make_db(logs=logs)
        result = compute_adherence_summary(assignment, db)
        assert result["avg_tolerance"] == 7.0

    def test_streak_best_consecutive_days(self):
        assignment = _mock_assignment()
        # 3 consecutive dates
        logs = [
            _mock_log("2024-06-01"),
            _mock_log("2024-06-02"),
            _mock_log("2024-06-03"),
        ]
        db = _make_db(logs=logs)
        result = compute_adherence_summary(assignment, db)
        assert result["streak_best"] == 3

    def test_streak_best_gaps_break_streak(self):
        assignment = _mock_assignment()
        # 2 + gap + 1
        logs = [
            _mock_log("2024-06-01"),
            _mock_log("2024-06-02"),
            _mock_log("2024-06-05"),  # gap
        ]
        db = _make_db(logs=logs)
        result = compute_adherence_summary(assignment, db)
        assert result["streak_best"] == 2

    def test_side_effect_count_returned(self):
        assignment = _mock_assignment()
        db = _make_db(side_effects_count=3)
        result = compute_adherence_summary(assignment, db)
        assert result["side_effect_count"] == 3

    def test_open_flags_returned(self):
        assignment = _mock_assignment()
        db = _make_db(open_flags_count=2)
        result = compute_adherence_summary(assignment, db)
        assert result["open_flags"] == 2

    def test_logs_by_week_has_8_entries(self):
        assignment = _mock_assignment()
        db = _make_db(logs=[])
        result = compute_adherence_summary(assignment, db)
        assert len(result["logs_by_week"]) == 8

    def test_logs_by_week_contains_week_start_key(self):
        assignment = _mock_assignment()
        db = _make_db(logs=[])
        result = compute_adherence_summary(assignment, db)
        for entry in result["logs_by_week"]:
            assert "week_start" in entry
            assert "count" in entry

    def test_all_required_keys_present(self):
        assignment = _mock_assignment()
        db = _make_db(logs=[])
        result = compute_adherence_summary(assignment, db)
        for key in (
            "sessions_logged",
            "sessions_expected",
            "adherence_rate_pct",
            "streak_current",
            "streak_best",
            "avg_duration_min",
            "avg_tolerance",
            "avg_mood_before",
            "avg_mood_after",
            "side_effect_count",
            "open_flags",
            "logs_by_week",
        ):
            assert key in result, f"Missing summary key: {key}"
