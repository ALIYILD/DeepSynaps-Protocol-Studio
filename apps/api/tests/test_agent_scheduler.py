"""Unit tests for the Phase 9 APScheduler hourly abuse-signal cron.

Covers
======

* Env-var gating — no job registered unless ``DEEPSYNAPS_AGENT_CRON_ENABLED=1``.
* Idempotency — calling :func:`start_scheduler` twice still leaves a single
  ``abuse_scan`` job.
* Cron tick wraps :func:`scan_and_alert_abuse_signals` with try/except so a
  scan exception does not bubble out and crash the scheduler thread.
* :func:`shutdown_scheduler` leaves the scheduler stopped + the module
  singleton reset.

Notes
-----

The real scan opens a SQLAlchemy session against the configured DB. We
monkeypatch :func:`scan_and_alert_abuse_signals` at the
``app.services.agent_scheduler`` import site so tests don't hit the DB or
Slack and run in milliseconds. The scheduler itself is a real
``BackgroundScheduler`` so the registration/idempotency assertions exercise
the genuine APScheduler API rather than a mock.
"""
from __future__ import annotations

import pytest

from app.services import agent_scheduler


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_scheduler_singleton():
    """Tear down any scheduler the previous test left running."""
    agent_scheduler._reset_for_tests()
    yield
    agent_scheduler._reset_for_tests()


@pytest.fixture(autouse=True)
def _scrub_cron_env(monkeypatch):
    """Each test opts in to the cron env var explicitly."""
    monkeypatch.delenv("DEEPSYNAPS_AGENT_CRON_ENABLED", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_AGENT_CRON_INTERVAL_MIN", raising=False)
    yield


# ---------------------------------------------------------------------------
# start_scheduler — env-var gating
# ---------------------------------------------------------------------------


def test_start_scheduler_noop_when_env_unset():
    """Without the opt-in env var, no scheduler is created and no job is registered."""
    result = agent_scheduler.start_scheduler()
    assert result is None
    assert agent_scheduler._SCHEDULER is None


def test_start_scheduler_noop_when_env_not_one(monkeypatch):
    """Any value other than the literal '1' must not start the scheduler."""
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_ENABLED", "true")
    result = agent_scheduler.start_scheduler()
    assert result is None
    assert agent_scheduler._SCHEDULER is None


# ---------------------------------------------------------------------------
# start_scheduler — happy path + idempotency
# ---------------------------------------------------------------------------


def test_start_scheduler_registers_single_named_job(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_ENABLED", "1")
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_INTERVAL_MIN", "60")

    sched = agent_scheduler.start_scheduler()
    try:
        assert sched is not None
        assert sched.running is True

        jobs = sched.get_jobs()
        assert len(jobs) == 1
        assert jobs[0].id == agent_scheduler.ABUSE_SCAN_JOB_ID
        assert jobs[0].name == agent_scheduler.ABUSE_SCAN_JOB_ID
    finally:
        agent_scheduler.shutdown_scheduler()


def test_start_scheduler_is_idempotent(monkeypatch):
    """Calling start twice keeps a single registered job and a single live scheduler."""
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_ENABLED", "1")

    first = agent_scheduler.start_scheduler()
    second = agent_scheduler.start_scheduler()
    try:
        assert first is not None
        assert second is first  # idempotent: returns the same instance
        assert second.running is True
        assert len(second.get_jobs()) == 1
        assert second.get_jobs()[0].id == agent_scheduler.ABUSE_SCAN_JOB_ID
    finally:
        agent_scheduler.shutdown_scheduler()


# ---------------------------------------------------------------------------
# Tick callable — invokes the scan with a fresh session and swallows errors
# ---------------------------------------------------------------------------


def test_tick_invokes_scan_with_fresh_session(monkeypatch):
    """The scheduled callable must open a SessionLocal session and pass it to the scan."""
    captured: dict = {"called": 0, "session_arg": None}
    closed_sessions: list = []

    class _FakeSession:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True
            closed_sessions.append(self)

    fake_session = _FakeSession()

    def _fake_session_local():
        return fake_session

    def _fake_scan(session):
        captured["called"] += 1
        captured["session_arg"] = session
        return {"scanned": 0, "posted": 0, "dedupe_skipped": 0}

    monkeypatch.setattr(agent_scheduler, "SessionLocal", _fake_session_local)
    monkeypatch.setattr(
        agent_scheduler, "scan_and_alert_abuse_signals", _fake_scan
    )

    agent_scheduler._run_abuse_scan()

    assert captured["called"] == 1
    assert captured["session_arg"] is fake_session
    # Session must be closed in the finally branch.
    assert fake_session.closed is True
    assert closed_sessions == [fake_session]


def test_tick_swallows_scan_exception(monkeypatch):
    """A raise inside the scan must not bubble out of the tick wrapper."""
    closed: dict = {"value": False}

    class _FakeSession:
        def close(self):
            closed["value"] = True

    def _fake_session_local():
        return _FakeSession()

    def _explode(_session):
        raise RuntimeError("simulated scan failure")

    monkeypatch.setattr(agent_scheduler, "SessionLocal", _fake_session_local)
    monkeypatch.setattr(agent_scheduler, "scan_and_alert_abuse_signals", _explode)

    # Must not raise.
    agent_scheduler._run_abuse_scan()

    # Session must still be closed even when the scan raised.
    assert closed["value"] is True


# ---------------------------------------------------------------------------
# shutdown_scheduler
# ---------------------------------------------------------------------------


def test_shutdown_scheduler_after_start_leaves_scheduler_stopped(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_ENABLED", "1")

    sched = agent_scheduler.start_scheduler()
    assert sched is not None
    assert sched.running is True

    agent_scheduler.shutdown_scheduler()

    assert sched.running is False
    assert agent_scheduler._SCHEDULER is None


def test_shutdown_scheduler_when_never_started_is_safe():
    """Calling shutdown with no live scheduler must not raise."""
    agent_scheduler.shutdown_scheduler()  # no-op
    assert agent_scheduler._SCHEDULER is None
