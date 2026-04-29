"""Phase 13D — weekly onboarding funnel digest tests.

Covers
======

* :func:`build_weekly_digest_text` returns ``("", "")`` when the 7-day
  window holds zero events (caller short-circuits on this sentinel).
* The digest body includes total counts, conversion percentages, and
  an ASCII bar-chart line per step.
* :func:`emit_weekly_funnel_digest` calls :func:`post_alert` exactly once
  when there are events, and skips it entirely when there are zero
  events (returning ``{sent: False, reason: "no_events"}``).
* The Phase 13D scheduler wiring registers BOTH the abuse_scan and
  funnel_digest jobs, with idempotent re-registration.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.database import SessionLocal
from app.persistence.models import OnboardingEvent
from app.services import agent_scheduler, funnel_digest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session():
    """Yield a SQLAlchemy session against the per-test sqlite DB.

    The conftest-level ``isolated_database`` fixture has already truncated
    the schema before each test runs, so the digest sees a clean slate.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _seed_steps(session, step_counts: dict[str, int], *, age_hours: int = 2) -> None:
    """Insert ``step_counts`` worth of OnboardingEvent rows backdated by ``age_hours``.

    ``age_hours`` defaults to 2 — well inside the 7-day window the digest
    aggregates over.
    """
    base = datetime.now(timezone.utc) - timedelta(hours=age_hours)
    base_naive = base.replace(tzinfo=None)
    for step, count in step_counts.items():
        for _ in range(count):
            session.add(
                OnboardingEvent(
                    clinic_id=None,
                    actor_id=None,
                    step=step,
                    payload_json=None,
                    created_at=base_naive,
                )
            )
    session.commit()


# ---------------------------------------------------------------------------
# build_weekly_digest_text
# ---------------------------------------------------------------------------


def test_build_weekly_digest_zero_events_returns_empty_tuple(db_session):
    """Empty window → ``("", "")`` sentinel for the caller to short-circuit on."""
    subject, body = funnel_digest.build_weekly_digest_text(db_session)
    assert subject == ""
    assert body == ""


def test_build_weekly_digest_renders_totals_and_conversion(db_session):
    """5 started + 2 completed + 1 skipped → totals + 40.0% conversion in body."""
    _seed_steps(db_session, {"started": 5, "completed": 2, "skipped": 1})

    subject, body = funnel_digest.build_weekly_digest_text(db_session)

    assert "week ending" in subject
    # Subject carries the ISO week-ending date (today, UTC).
    today_iso = datetime.now(timezone.utc).date().isoformat()
    assert today_iso in subject

    # Totals appear verbatim.
    assert "Started: 5" in body
    assert "Completed: 2" in body
    assert "Skipped: 1" in body

    # Conversion is 2/5 = 40.0%, 1 decimal place.
    assert "Conversion: 40.0%" in body or "started_to_completed: 40.0%" in body


def test_build_weekly_digest_includes_ascii_bars(db_session):
    """Body must contain at least one Unicode-block bar character."""
    _seed_steps(db_session, {"started": 5, "completed": 2, "skipped": 1})

    _, body = funnel_digest.build_weekly_digest_text(db_session)

    bar_lines = [line for line in body.splitlines() if "█" in line]
    assert bar_lines, "expected at least one bar-chart line containing █"


def test_build_weekly_digest_excludes_rows_outside_seven_day_window(db_session):
    """A row older than 7 days must be dropped from the totals."""
    # 2 in-window starts + 4 well outside (30 days back).
    _seed_steps(db_session, {"started": 2}, age_hours=2)
    _seed_steps(db_session, {"started": 4, "completed": 1}, age_hours=24 * 30)

    _, body = funnel_digest.build_weekly_digest_text(db_session)

    assert "Started: 2" in body
    assert "Completed: 0" in body


# ---------------------------------------------------------------------------
# emit_weekly_funnel_digest
# ---------------------------------------------------------------------------


def test_emit_weekly_funnel_digest_calls_post_alert_when_events_present(
    db_session, monkeypatch
):
    """Happy path — events in window → exactly one post_alert call."""
    _seed_steps(db_session, {"started": 5, "completed": 2, "skipped": 1})

    captured: list[dict] = []

    def _fake_post_alert(*, severity, title, body, dedupe_key=None):
        captured.append(
            {
                "severity": severity,
                "title": title,
                "body": body,
                "dedupe_key": dedupe_key,
            }
        )
        return {"ok": True, "reason": None, "status_code": 200}

    monkeypatch.setattr(funnel_digest, "post_alert", _fake_post_alert)

    result = funnel_digest.emit_weekly_funnel_digest(db_session)

    assert result == {"sent": True, "reason": "posted"}
    assert len(captured) == 1
    payload = captured[0]
    assert payload["severity"] == "low"
    assert "week ending" in payload["title"]
    assert "Started: 5" in payload["body"]


def test_emit_weekly_funnel_digest_skips_post_alert_when_zero_events(
    db_session, monkeypatch
):
    """Zero events in window → post_alert is NOT invoked, sent=False."""
    calls: list = []

    def _fake_post_alert(**kwargs):
        calls.append(kwargs)
        return {"ok": True, "reason": None, "status_code": 200}

    monkeypatch.setattr(funnel_digest, "post_alert", _fake_post_alert)

    result = funnel_digest.emit_weekly_funnel_digest(db_session)

    assert result == {"sent": False, "reason": "no_events"}
    assert calls == [], "post_alert must not be called when the window is empty"


# ---------------------------------------------------------------------------
# Scheduler wiring — both jobs registered, idempotent
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_scheduler_singleton():
    """Tear down any scheduler the previous test may have left running."""
    agent_scheduler._reset_for_tests()
    yield
    agent_scheduler._reset_for_tests()


@pytest.fixture(autouse=True)
def _scrub_cron_env(monkeypatch):
    """Each test opts in to the cron env var explicitly."""
    monkeypatch.delenv("DEEPSYNAPS_AGENT_CRON_ENABLED", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_AGENT_CRON_INTERVAL_MIN", raising=False)
    yield


def test_start_scheduler_registers_both_abuse_scan_and_funnel_digest(monkeypatch):
    """With the env var set, both jobs appear exactly once."""
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_ENABLED", "1")

    sched = agent_scheduler.start_scheduler()
    try:
        assert sched is not None
        assert sched.running is True

        jobs = sched.get_jobs()
        job_ids = {j.id for j in jobs}
        assert len(jobs) == 2, f"expected 2 jobs, got {len(jobs)}: {job_ids}"
        assert agent_scheduler.ABUSE_SCAN_JOB_ID in job_ids
        assert agent_scheduler.FUNNEL_DIGEST_JOB_ID in job_ids
    finally:
        agent_scheduler.shutdown_scheduler()


def test_start_scheduler_idempotent_keeps_two_jobs(monkeypatch):
    """A second call to start_scheduler must not double-register either job."""
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_ENABLED", "1")

    first = agent_scheduler.start_scheduler()
    second = agent_scheduler.start_scheduler()
    try:
        assert first is not None
        assert second is first
        jobs = second.get_jobs()
        job_ids = {j.id for j in jobs}
        assert len(jobs) == 2
        assert job_ids == {
            agent_scheduler.ABUSE_SCAN_JOB_ID,
            agent_scheduler.FUNNEL_DIGEST_JOB_ID,
        }
    finally:
        agent_scheduler.shutdown_scheduler()
