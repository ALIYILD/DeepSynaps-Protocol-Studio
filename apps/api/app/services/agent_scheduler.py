"""Background cron scheduler for agent-ops jobs (Phase 9).

Phase 7 shipped :func:`app.services.ops_alerting.scan_and_alert_abuse_signals`
but nothing fires it — operators had to hit the manual
``POST /api/v1/agent-admin/ops/scan-abuse`` endpoint to surface noisy agent
pairs. This module wires that scanner into an APScheduler
``BackgroundScheduler`` so the FastAPI process polls it on a fixed cadence
without holding the request loop.

Design
======

* ``BackgroundScheduler`` runs in its own daemon thread; it does not block
  the asyncio event loop and does not require uvicorn workers to coordinate.
* The cron is **opt-in** via env var ``DEEPSYNAPS_AGENT_CRON_ENABLED=1``.
  Default off so unit tests, CI, and local dev runs don't accidentally fire
  Slack pings or contend on the test DB.
* The scan callable opens its **own** SQLAlchemy session per tick and closes
  it in ``finally`` — no session is shared with the request lifecycle.
* The wrapper swallows every exception from the scan and logs it, so a
  transient DB error or Slack outage does not crash the scheduler thread
  and prevent future ticks.
* :func:`start_scheduler` is **idempotent** — calling it twice is a no-op.
  This matters because FastAPI's lifespan can fire twice during reload
  scenarios (e.g. uvicorn ``--reload``) and tests that import ``app.main``
  more than once.

Env vars
========

``DEEPSYNAPS_AGENT_CRON_ENABLED``
    Must equal exactly ``"1"`` to start the scheduler. Any other value
    (including unset) leaves the scheduler dormant.

``DEEPSYNAPS_AGENT_CRON_INTERVAL_MIN``
    Polling interval in minutes. Defaults to 60. Bad values fall back to 60
    rather than raising at startup.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app.services.ops_alerting import scan_and_alert_abuse_signals

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------

_SCHEDULER_LOCK = threading.Lock()
_SCHEDULER: Optional[BackgroundScheduler] = None

# Job ID kept stable so we can assert single-registration in tests and
# detect-and-skip on idempotent restarts.
ABUSE_SCAN_JOB_ID = "abuse_scan"


def _resolve_interval_minutes() -> int:
    raw = os.environ.get("DEEPSYNAPS_AGENT_CRON_INTERVAL_MIN", "").strip()
    if not raw:
        return 60
    try:
        value = int(raw)
    except ValueError:
        logger.warning(
            "agent scheduler interval env var is not an int; defaulting to 60",
            extra={
                "event": "agent_scheduler_bad_interval",
                "raw": raw,
            },
        )
        return 60
    if value <= 0:
        logger.warning(
            "agent scheduler interval must be positive; defaulting to 60",
            extra={
                "event": "agent_scheduler_nonpositive_interval",
                "raw": raw,
            },
        )
        return 60
    return value


def _run_abuse_scan() -> None:
    """Scheduler tick — opens a fresh session, runs the scan, swallows errors.

    APScheduler runs jobs in a worker thread; uncaught exceptions are logged
    by the scheduler itself but we wrap defensively anyway so we can attach
    a structured ``event`` log key and avoid leaking SQL strings into the
    scheduler's default exception formatter.
    """
    session = SessionLocal()
    try:
        result = scan_and_alert_abuse_signals(session)
        logger.info(
            "agent abuse scan tick complete",
            extra={
                "event": "agent_abuse_scan_tick",
                "scanned": result.get("scanned"),
                "posted": result.get("posted"),
                "dedupe_skipped": result.get("dedupe_skipped"),
            },
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "agent abuse scan tick failed",
            extra={
                "event": "agent_abuse_scan_tick_error",
                "error": str(exc),
            },
        )
    finally:
        try:
            session.close()
        except Exception:  # pragma: no cover - defensive
            pass


def start_scheduler() -> Optional[BackgroundScheduler]:
    """Start the BackgroundScheduler if enabled by env var; otherwise no-op.

    Returns the live scheduler (or ``None`` if disabled / already-running).
    Idempotent: a second call returns without registering a duplicate job.
    """
    global _SCHEDULER

    if os.environ.get("DEEPSYNAPS_AGENT_CRON_ENABLED", "").strip() != "1":
        logger.info(
            "agent scheduler disabled via env",
            extra={"event": "agent_scheduler_disabled"},
        )
        return None

    with _SCHEDULER_LOCK:
        if _SCHEDULER is not None and _SCHEDULER.running:
            logger.info(
                "agent scheduler already running",
                extra={"event": "agent_scheduler_already_running"},
            )
            return _SCHEDULER

        interval_minutes = _resolve_interval_minutes()

        scheduler = BackgroundScheduler(daemon=True)
        scheduler.add_job(
            _run_abuse_scan,
            trigger="interval",
            minutes=interval_minutes,
            id=ABUSE_SCAN_JOB_ID,
            name=ABUSE_SCAN_JOB_ID,
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        _SCHEDULER = scheduler

        logger.info(
            "agent scheduler started",
            extra={
                "event": "agent_scheduler_started",
                "interval_minutes": interval_minutes,
                "job_id": ABUSE_SCAN_JOB_ID,
            },
        )
        return scheduler


def shutdown_scheduler() -> None:
    """Gracefully stop the scheduler if it was started.

    Safe to call when the scheduler was never started (no-op). Pairs with
    FastAPI's lifespan shutdown branch.
    """
    global _SCHEDULER

    with _SCHEDULER_LOCK:
        sched = _SCHEDULER
        _SCHEDULER = None

    if sched is None:
        return

    try:
        if sched.running:
            sched.shutdown(wait=False)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "agent scheduler shutdown raised",
            extra={
                "event": "agent_scheduler_shutdown_error",
                "error": str(exc),
            },
        )


def _reset_for_tests() -> None:
    """Test helper — fully tear down + drop the singleton reference.

    Important for tests that monkeypatch the env var across cases: we want
    each test to start from a clean slate without leaking BackgroundScheduler
    threads.
    """
    shutdown_scheduler()


__all__ = [
    "ABUSE_SCAN_JOB_ID",
    "shutdown_scheduler",
    "start_scheduler",
]
