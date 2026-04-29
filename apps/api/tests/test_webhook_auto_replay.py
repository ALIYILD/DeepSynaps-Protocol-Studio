"""Tests for Phase 14 — auto-replay cron for failed Stripe webhook events.

Covers:

* Empty :class:`StripeWebhookEvent` table → all-zero result envelope.
* A row aged 30 minutes is below the 1h threshold → not attempted.
* A row aged 2 hours with a ``replay_webhook_event`` mock that returns
  ``ok=True`` → attempted exactly once and the row's ``processed`` flag
  flips to True.
* A row aged 2 hours with ``replay_webhook_event`` returning ``ok=False``
  → counted as failed; a second scan within the same in-process attempts
  window does NOT re-attempt (per-tick rate-limit kicks in only after the
  attempts cap, but the per-event attempt is still recorded — the third
  scan still attempts it because the cap is 3, and after the third scan
  the alert path fires).
* After 3 failed attempts on the same event id, the next scan emits
  ``post_alert`` exactly once with a "webhook auto-replay exhausted"
  message.
* Scheduler test: with ``DEEPSYNAPS_AGENT_CRON_ENABLED=1`` set, after
  ``start_scheduler()`` we observe all three job ids — ``abuse_scan``,
  ``funnel_digest``, ``webhook_auto_replay`` — and a second call is
  idempotent.
* Without the env var, no scheduler / no jobs (existing behaviour
  preserved).

We monkey-patch ``stripe_skus.replay_webhook_event`` and ``post_alert`` so
no real Stripe / Slack network calls are made.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.database import SessionLocal
from app.persistence.models import StripeWebhookEvent
from app.services import agent_scheduler, webhook_auto_replay


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session():
    """Yield a SQLAlchemy session against the per-test sqlite DB.

    The conftest-level ``isolated_database`` fixture has already truncated
    the schema before each test so the scanner sees a clean table.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _reset_attempts_state():
    """Clear the in-process attempts counter + alerted set between tests.

    The helper tracks attempts in a module-level dict (the schema has no
    column to persist them); without this fixture each test would inherit
    counters from the previous case and the assertions would drift.
    """
    webhook_auto_replay._reset_attempts_for_tests()
    yield
    webhook_auto_replay._reset_attempts_for_tests()


def _seed_event(
    session,
    *,
    event_id: str,
    age_minutes: int,
    processed: bool = False,
    event_type: str = "checkout.session.completed",
) -> None:
    """Insert a :class:`StripeWebhookEvent` row backdated by ``age_minutes``."""
    received_at = datetime.now(timezone.utc) - timedelta(minutes=age_minutes)
    received_at_naive = received_at.replace(tzinfo=None)
    session.add(
        StripeWebhookEvent(
            id=event_id,
            event_type=event_type,
            received_at=received_at_naive,
            processed=processed,
        )
    )
    session.commit()


# ---------------------------------------------------------------------------
# scan_and_auto_replay — empty + age gate
# ---------------------------------------------------------------------------


def test_scan_empty_table_returns_zero_envelope(db_session):
    """With nothing to scan, the helper returns a structured zero envelope."""
    result = webhook_auto_replay.scan_and_auto_replay(db_session)
    assert result == {
        "scanned": 0,
        "attempted": 0,
        "succeeded": 0,
        "failed": 0,
        "alerted": 0,
    }


def test_scan_under_one_hour_is_not_attempted(db_session, monkeypatch):
    """A row aged 30 minutes is below the 1h threshold; the replay must not fire."""
    _seed_event(db_session, event_id="evt_recent_001", age_minutes=30)

    calls: list = []

    def _fake_replay(db, *, event_id):
        calls.append(event_id)
        return {"ok": True}

    monkeypatch.setattr(webhook_auto_replay, "replay_webhook_event", _fake_replay)

    result = webhook_auto_replay.scan_and_auto_replay(db_session)

    assert calls == []
    assert result == {
        "scanned": 0,
        "attempted": 0,
        "succeeded": 0,
        "failed": 0,
        "alerted": 0,
    }


# ---------------------------------------------------------------------------
# scan_and_auto_replay — happy path
# ---------------------------------------------------------------------------


def test_scan_two_hour_old_row_succeeds_and_flips_processed_flag(
    db_session, monkeypatch
):
    """Aged row + ok=True replay → attempted once, succeeded, processed=True."""
    _seed_event(db_session, event_id="evt_old_success_001", age_minutes=120)

    calls: list = []

    def _fake_replay(db, *, event_id):
        calls.append(event_id)
        return {
            "ok": True,
            "event_id": event_id,
            "event_type": "checkout.session.completed",
            "result": {"applied": True},
        }

    monkeypatch.setattr(webhook_auto_replay, "replay_webhook_event", _fake_replay)

    result = webhook_auto_replay.scan_and_auto_replay(db_session)

    assert calls == ["evt_old_success_001"]
    assert result["scanned"] == 1
    assert result["attempted"] == 1
    assert result["succeeded"] == 1
    assert result["failed"] == 0
    assert result["alerted"] == 0

    # Row's processed flag was flipped so the next scan skips it.
    db_session.expire_all()
    row = (
        db_session.query(StripeWebhookEvent)
        .filter_by(id="evt_old_success_001")
        .one()
    )
    assert row.processed is True

    # Second scan now finds nothing eligible.
    second = webhook_auto_replay.scan_and_auto_replay(db_session)
    assert second["scanned"] == 0


# ---------------------------------------------------------------------------
# scan_and_auto_replay — failure path + per-event attempt accounting
# ---------------------------------------------------------------------------


def test_scan_failed_replay_counts_failed_and_consumes_attempt(
    db_session, monkeypatch
):
    """ok=False → failed counter increments, processed stays False, attempts=1."""
    _seed_event(db_session, event_id="evt_old_fail_002", age_minutes=120)

    def _fake_replay(db, *, event_id):
        return {
            "ok": False,
            "event_id": event_id,
            "event_type": "checkout.session.completed",
            "error": "apply_error: simulated",
        }

    monkeypatch.setattr(webhook_auto_replay, "replay_webhook_event", _fake_replay)

    result = webhook_auto_replay.scan_and_auto_replay(db_session)

    assert result["attempted"] == 1
    assert result["failed"] == 1
    assert result["succeeded"] == 0
    assert result["alerted"] == 0

    # Internal attempts counter was bumped to 1.
    assert webhook_auto_replay._attempts_so_far("evt_old_fail_002") == 1

    # Row's processed flag is still False (the replay failed).
    db_session.expire_all()
    row = (
        db_session.query(StripeWebhookEvent)
        .filter_by(id="evt_old_fail_002")
        .one()
    )
    assert row.processed is False


def test_scan_exhausts_attempts_then_fires_alert(db_session, monkeypatch):
    """3 failed attempts → 4th scan stops attempting and posts an alert exactly once."""
    _seed_event(db_session, event_id="evt_old_exhaust_003", age_minutes=120)

    def _always_fail(db, *, event_id):
        return {
            "ok": False,
            "event_id": event_id,
            "event_type": "checkout.session.completed",
            "error": "apply_error: still broken",
        }

    monkeypatch.setattr(webhook_auto_replay, "replay_webhook_event", _always_fail)

    alerts: list[dict] = []

    def _fake_post_alert(*, severity, title, body, dedupe_key=None):
        alerts.append(
            {
                "severity": severity,
                "title": title,
                "body": body,
                "dedupe_key": dedupe_key,
            }
        )
        return {"ok": True, "reason": None, "status_code": 200}

    monkeypatch.setattr(webhook_auto_replay, "post_alert", _fake_post_alert)

    # Burn through all 3 allowed attempts.
    for _ in range(3):
        result = webhook_auto_replay.scan_and_auto_replay(db_session)
        assert result["attempted"] == 1
        assert result["failed"] == 1
        assert result["alerted"] == 0
    assert webhook_auto_replay._attempts_so_far("evt_old_exhaust_003") == 3
    assert alerts == []

    # 4th scan: attempts cap reached → no replay, single alert fired.
    result = webhook_auto_replay.scan_and_auto_replay(db_session)
    assert result["scanned"] == 1
    assert result["attempted"] == 0
    assert result["alerted"] == 1
    assert len(alerts) == 1
    payload = alerts[0]
    assert payload["severity"] == "high"
    assert "evt_old_exhaust_003" in payload["title"]
    assert "auto-replay" in payload["title"].lower() or "auto-replay" in payload["body"].lower()
    assert payload["dedupe_key"] == "webhook_auto_replay_exhausted:evt_old_exhaust_003"

    # 5th scan: still no replay, still no fresh alert (already alerted).
    result = webhook_auto_replay.scan_and_auto_replay(db_session)
    assert result["attempted"] == 0
    assert result["alerted"] == 0
    assert len(alerts) == 1, "post_alert must only fire once per exhausted event"


# ---------------------------------------------------------------------------
# Scheduler wiring — three jobs registered, idempotent, env-gated
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


def test_scheduler_registers_all_three_jobs_with_env_var(monkeypatch):
    """With the env var set, abuse_scan + funnel_digest + webhook_auto_replay all appear."""
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_ENABLED", "1")

    sched = agent_scheduler.start_scheduler()
    try:
        assert sched is not None
        assert sched.running is True

        ids = [j.id for j in sched.get_jobs()]
        assert ids.count(agent_scheduler.ABUSE_SCAN_JOB_ID) == 1
        assert ids.count(agent_scheduler.FUNNEL_DIGEST_JOB_ID) == 1
        assert ids.count(agent_scheduler.WEBHOOK_AUTO_REPLAY_JOB_ID) == 1
        # Exactly three jobs, no leftover registrations from other phases.
        assert len(ids) == 3, f"expected exactly 3 jobs, got {ids}"
    finally:
        agent_scheduler.shutdown_scheduler()


def test_scheduler_idempotent_keeps_three_jobs(monkeypatch):
    """A second start_scheduler() call must not duplicate the new job."""
    monkeypatch.setenv("DEEPSYNAPS_AGENT_CRON_ENABLED", "1")

    first = agent_scheduler.start_scheduler()
    second = agent_scheduler.start_scheduler()
    try:
        assert first is not None
        assert second is first

        ids = [j.id for j in second.get_jobs()]
        assert len(ids) == 3
        assert set(ids) == {
            agent_scheduler.ABUSE_SCAN_JOB_ID,
            agent_scheduler.FUNNEL_DIGEST_JOB_ID,
            agent_scheduler.WEBHOOK_AUTO_REPLAY_JOB_ID,
        }
    finally:
        agent_scheduler.shutdown_scheduler()


def test_scheduler_no_jobs_without_env_var():
    """Without the opt-in env var, no scheduler is created and no jobs run.

    Mirrors the existing behaviour exercised by ``test_agent_scheduler.py``
    — the new job must not change that contract.
    """
    result = agent_scheduler.start_scheduler()
    assert result is None
    assert agent_scheduler._SCHEDULER is None


# ---------------------------------------------------------------------------
# Tick wrapper — opens / closes a fresh session and swallows scan errors
# ---------------------------------------------------------------------------


def test_tick_invokes_scan_with_fresh_session(monkeypatch):
    """The scheduled callable must open a SessionLocal session, pass it to
    the scanner, and close it afterward.
    """
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
        return {
            "scanned": 0,
            "attempted": 0,
            "succeeded": 0,
            "failed": 0,
            "alerted": 0,
        }

    monkeypatch.setattr(agent_scheduler, "SessionLocal", _fake_session_local)
    monkeypatch.setattr(agent_scheduler, "scan_and_auto_replay", _fake_scan)

    agent_scheduler._run_webhook_auto_replay()

    assert captured["called"] == 1
    assert captured["session_arg"] is fake_session
    assert fake_session.closed is True
    assert closed_sessions == [fake_session]


def test_tick_swallows_scan_exception(monkeypatch):
    """A raise inside the scanner must not bubble out of the tick wrapper."""
    closed: dict = {"value": False}

    class _FakeSession:
        def close(self):
            closed["value"] = True

    def _fake_session_local():
        return _FakeSession()

    def _explode(_session):
        raise RuntimeError("simulated scanner failure")

    monkeypatch.setattr(agent_scheduler, "SessionLocal", _fake_session_local)
    monkeypatch.setattr(agent_scheduler, "scan_and_auto_replay", _explode)

    # Must not raise.
    agent_scheduler._run_webhook_auto_replay()

    assert closed["value"] is True
