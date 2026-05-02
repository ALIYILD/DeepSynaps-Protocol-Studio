"""IRB Reviewer SLA Worker (IRB-AMD2, 2026-05-02).

Closes "workflow exists" → "workflow has SLA enforcement". The
IRB-AMD1 amendment workflow (#446) shipped a regulator-credible
lifecycle but no enforcement that reviewers act on submitted
amendments in a bounded time window.

Per tick, this worker:

* Computes :func:`app.services.irb_amendment_reviewer_workload.compute_reviewer_workload`
  for every clinic (or just ``only_clinic_id`` when called from the
  per-clinic admin tick).
* For each reviewer with ``sla_breach=True``, checks whether a recent
  ``irb_reviewer_sla.queue_breach_detected`` audit row already exists
  inside the cooldown window. Skips when found.
* Otherwise emits a HIGH-priority audit row pointing at the reviewer
  with note carrying ``priority=high`` so the existing Clinician Inbox
  aggregator (#354) routes it without any new aggregation logic.

Configuration
=============

``IRB_REVIEWER_SLA_ENABLED``
    Honest opt-in default ``False``. Tests + CI invoke ``tick``
    directly so they don't fire the scheduler.
``IRB_REVIEWER_SLA_INTERVAL_HOURS``
    Tick cadence in hours. Defaults to 24 (daily).
``IRB_REVIEWER_SLA_QUEUE_THRESHOLD``
    Pending-count threshold. Defaults to 5.
``IRB_REVIEWER_SLA_AGE_THRESHOLD_DAYS``
    Oldest-pending-age threshold in days. Defaults to 7.
``IRB_REVIEWER_SLA_COOLDOWN_HOURS``
    Re-emission cooldown per reviewer in hours. Defaults to 23 (one
    full daily tick minus a small buffer so the cooldown gate never
    overlaps with the next tick on the daily cadence).

Audit
=====

* Per-tick row under ``target_type='irb_reviewer_sla'`` with action
  ``irb_reviewer_sla.tick`` carries
  ``clinics_scanned=N reviewers_examined=R breaches_emitted=B
  skipped_cooldown=C elapsed_ms=T``.
* Per-(clinic, reviewer) breach row under
  ``target_type='irb_reviewer'`` with action
  ``irb_reviewer_sla.queue_breach_detected`` and
  ``priority=high``. Note encodes ``clinic_id={cid}
  reviewer_user_id={rid} pending_count={n} oldest_age_days={d}
  priority=high`` per the IRB-AMD2 spec.
"""
from __future__ import annotations

import logging
import os
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User
from app.services.irb_amendment_reviewer_workload import (
    DEFAULT_SLA_AGE_THRESHOLD_DAYS,
    DEFAULT_SLA_QUEUE_THRESHOLD,
    compute_reviewer_workload,
)


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: "Optional[IRBReviewerSLAWorker]" = None
_TICK_JOB_ID = "irb_reviewer_sla_worker_tick"


WORKER_SURFACE = "irb_reviewer_sla"
BREACH_TARGET_TYPE = "irb_reviewer"


# ---------------------------------------------------------------------------
# Status snapshot
# ---------------------------------------------------------------------------


@dataclass
class TickResult:
    """Result of one :meth:`IRBReviewerSLAWorker.tick`."""

    clinics_scanned: int = 0
    reviewers_examined: int = 0
    breaches_emitted: int = 0
    skipped_cooldown: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    breach_audit_event_ids: list[str] = field(default_factory=list)


@dataclass
class WorkerStatus:
    running: bool = False
    last_tick_at: Optional[str] = None
    next_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_reviewers_examined: int = 0
    last_tick_breaches_emitted: int = 0
    last_tick_skipped_cooldown: int = 0
    last_tick_errors: int = 0
    interval_hours: int = 24
    queue_threshold: int = DEFAULT_SLA_QUEUE_THRESHOLD
    age_threshold_days: int = DEFAULT_SLA_AGE_THRESHOLD_DAYS
    cooldown_hours: int = 23


# ---------------------------------------------------------------------------
# Env helpers
# ---------------------------------------------------------------------------


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        v = int(raw)
    except ValueError:
        _log.warning(
            "irb_reviewer_sla worker env var not int; using default",
            extra={"event": "irbamd2_worker_bad_env", "name": name, "raw": raw},
        )
        return default
    if v < minimum:
        return default
    return v


def env_enabled() -> bool:
    raw = os.environ.get("IRB_REVIEWER_SLA_ENABLED", "").strip().lower()
    return raw in ("1", "true", "yes")


def env_interval_hours() -> int:
    return _env_int("IRB_REVIEWER_SLA_INTERVAL_HOURS", default=24, minimum=1)


def env_queue_threshold() -> int:
    return _env_int(
        "IRB_REVIEWER_SLA_QUEUE_THRESHOLD",
        default=DEFAULT_SLA_QUEUE_THRESHOLD,
        minimum=1,
    )


def env_age_threshold_days() -> int:
    return _env_int(
        "IRB_REVIEWER_SLA_AGE_THRESHOLD_DAYS",
        default=DEFAULT_SLA_AGE_THRESHOLD_DAYS,
        minimum=1,
    )


def env_cooldown_hours() -> int:
    return _env_int(
        "IRB_REVIEWER_SLA_COOLDOWN_HOURS", default=23, minimum=1
    )


# ---------------------------------------------------------------------------
# Audit hooks
# ---------------------------------------------------------------------------


def _emit_tick_audit(
    db: Session,
    *,
    clinic_id: Optional[str],
    result: TickResult,
) -> str:
    """Emit ONE per-tick audit row under ``target_type=WORKER_SURFACE``."""
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = f"{WORKER_SURFACE}-tick-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    note = (
        f"clinic_id={clinic_id or 'all'} "
        f"clinics_scanned={result.clinics_scanned} "
        f"reviewers_examined={result.reviewers_examined} "
        f"breaches_emitted={result.breaches_emitted} "
        f"skipped_cooldown={result.skipped_cooldown} "
        f"errors={result.errors} "
        f"elapsed_ms={result.elapsed_ms}"
    )
    if result.last_error:
        note += f"; last_error={result.last_error[:200]}"
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(clinic_id or "all"),
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.tick",
            role="admin",
            actor_id="irb-reviewer-sla-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception("irb_reviewer_sla tick audit emit failed")
    return eid


def _emit_breach_audit(
    db: Session,
    *,
    clinic_id: Optional[str],
    reviewer_user_id: str,
    pending_count: int,
    oldest_age_days: int,
) -> str:
    """Emit a HIGH-priority ``queue_breach_detected`` row.

    The ``priority=high`` token routes the row into the Clinician
    Inbox aggregator (#354) without any new aggregation logic.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-queue_breach_detected-"
        f"{(clinic_id or 'na')}-{reviewer_user_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note = (
        f"clinic_id={clinic_id or 'null'} "
        f"reviewer_user_id={reviewer_user_id} "
        f"pending_count={pending_count} "
        f"oldest_age_days={oldest_age_days} "
        f"priority=high"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=reviewer_user_id,
            target_type=BREACH_TARGET_TYPE,
            action=f"{WORKER_SURFACE}.queue_breach_detected",
            role="admin",
            actor_id="irb-reviewer-sla-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception("irb_reviewer_sla breach audit emit failed")
    return eid


# ---------------------------------------------------------------------------
# Cooldown helper
# ---------------------------------------------------------------------------


def _was_breach_emitted_within_cooldown(
    db: Session,
    *,
    clinic_id: Optional[str],
    reviewer_user_id: str,
    cooldown_hours: int,
    now: datetime,
) -> bool:
    """True when an ``queue_breach_detected`` row already exists for this
    (clinic, reviewer) newer than ``now - cooldown_hours``.

    Reads ``audit_event_records`` only — no second table to maintain.
    """
    cutoff_iso = (now - timedelta(hours=cooldown_hours)).isoformat()
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == BREACH_TARGET_TYPE,
            AuditEventRecord.action
            == f"{WORKER_SURFACE}.queue_breach_detected",
            AuditEventRecord.target_id == reviewer_user_id,
            AuditEventRecord.created_at >= cutoff_iso,
        )
        .all()
    )
    if not rows:
        return False
    cid_needle = f"clinic_id={clinic_id or 'null'}"
    for r in rows:
        note = r.note or ""
        if cid_needle in note:
            return True
    return False


# ---------------------------------------------------------------------------
# Core worker
# ---------------------------------------------------------------------------


class IRBReviewerSLAWorker:
    """Periodic per-reviewer queue + SLA enforcement.

    Use :meth:`tick` to run one iteration synchronously (testable
    without the scheduler thread). Use :meth:`start` / :meth:`stop`
    to register / unregister the APScheduler job.
    """

    def __init__(
        self,
        *,
        interval_hours: Optional[int] = None,
        queue_threshold: Optional[int] = None,
        age_threshold_days: Optional[int] = None,
        cooldown_hours: Optional[int] = None,
    ) -> None:
        self.interval_hours = interval_hours or env_interval_hours()
        self.queue_threshold = queue_threshold or env_queue_threshold()
        self.age_threshold_days = (
            age_threshold_days or env_age_threshold_days()
        )
        self.cooldown_hours = cooldown_hours or env_cooldown_hours()
        self.status = WorkerStatus(
            interval_hours=self.interval_hours,
            queue_threshold=self.queue_threshold,
            age_threshold_days=self.age_threshold_days,
            cooldown_hours=self.cooldown_hours,
        )
        self._scheduler = None
        self._lock = threading.Lock()

    # --- Status -----------------------------------------------------------

    def get_status(self) -> WorkerStatus:
        return self.status

    def get_status_dict(self) -> dict:
        return {
            "running": bool(self.status.running),
            "enabled": env_enabled(),
            "last_tick_at": self.status.last_tick_at,
            "next_tick_at": self.status.next_tick_at,
            "last_error": self.status.last_error,
            "last_error_at": self.status.last_error_at,
            "last_tick_reviewers_examined": int(
                self.status.last_tick_reviewers_examined
            ),
            "last_tick_breaches_emitted": int(
                self.status.last_tick_breaches_emitted
            ),
            "last_tick_skipped_cooldown": int(
                self.status.last_tick_skipped_cooldown
            ),
            "last_tick_errors": int(self.status.last_tick_errors),
            "interval_hours": int(self.interval_hours),
            "queue_threshold": int(self.queue_threshold),
            "age_threshold_days": int(self.age_threshold_days),
            "cooldown_hours": int(self.cooldown_hours),
        }

    # --- Tick -------------------------------------------------------------

    def tick(
        self,
        db: Optional[Session] = None,
        *,
        only_clinic_id: Optional[str] = None,
    ) -> TickResult:
        """Run one SLA-check iteration.

        Parameters
        ----------
        db
            Optional session; opened + closed locally when ``None``.
        only_clinic_id
            When set, scope to one clinic. Routers MUST set this to
            ``actor.clinic_id`` so cross-clinic admins cannot scan
            another clinic's reviewers.
        """
        owns_session = db is None
        if db is None:
            db = SessionLocal()
        result = TickResult()
        started_at = datetime.now(timezone.utc)
        try:
            self._tick_inner(
                db,
                result,
                only_clinic_id=only_clinic_id,
                now=started_at,
            )
        except Exception as exc:  # pragma: no cover - defensive top-level
            result.errors += 1
            result.last_error = str(exc)
            _log.exception("irb_reviewer_sla tick crashed")
        finally:
            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            result.elapsed_ms = int(elapsed * 1000)
            try:
                _emit_tick_audit(db, clinic_id=only_clinic_id, result=result)
            except Exception:  # pragma: no cover - defensive
                _log.exception("irb_reviewer_sla post-tick audit failed")
            self._update_status(result)
            if owns_session:
                try:
                    db.close()
                except Exception:  # pragma: no cover - defensive
                    pass
        return result

    def _resolve_clinic_ids(
        self, db: Session, only_clinic_id: Optional[str]
    ) -> list[Optional[str]]:
        if only_clinic_id:
            return [only_clinic_id]
        try:
            cids = sorted(
                {
                    (u.clinic_id or "").strip()
                    for u in db.query(User).all()
                    if (u.clinic_id or "").strip()
                }
            )
        except Exception:  # pragma: no cover - defensive
            cids = []
        return cids or [None]

    def _tick_inner(
        self,
        db: Session,
        result: TickResult,
        *,
        only_clinic_id: Optional[str],
        now: datetime,
    ) -> None:
        clinic_ids = self._resolve_clinic_ids(db, only_clinic_id)
        for cid in clinic_ids:
            result.clinics_scanned += 1
            try:
                workload = compute_reviewer_workload(
                    db,
                    cid,
                    sla_queue_threshold=self.queue_threshold,
                    sla_age_threshold_days=self.age_threshold_days,
                )
            except Exception as exc:  # pragma: no cover - defensive
                result.errors += 1
                result.last_error = f"compute_workload: {exc}"
                continue

            for w in workload:
                result.reviewers_examined += 1
                if not w.sla_breach:
                    continue
                try:
                    in_cooldown = _was_breach_emitted_within_cooldown(
                        db,
                        clinic_id=cid,
                        reviewer_user_id=w.reviewer_user_id,
                        cooldown_hours=self.cooldown_hours,
                        now=now,
                    )
                except Exception as exc:  # pragma: no cover - defensive
                    result.errors += 1
                    result.last_error = f"cooldown_check: {exc}"
                    continue
                if in_cooldown:
                    result.skipped_cooldown += 1
                    continue
                eid = _emit_breach_audit(
                    db,
                    clinic_id=cid,
                    reviewer_user_id=w.reviewer_user_id,
                    pending_count=int(w.total_pending),
                    oldest_age_days=int(w.oldest_pending_age_days),
                )
                result.breaches_emitted += 1
                result.breach_audit_event_ids.append(eid)

    def _update_status(self, result: TickResult) -> None:
        with self._lock:
            now = datetime.now(timezone.utc)
            self.status.last_tick_at = now.isoformat()
            self.status.next_tick_at = (
                now + timedelta(hours=self.interval_hours)
            ).isoformat()
            self.status.last_tick_reviewers_examined = result.reviewers_examined
            self.status.last_tick_breaches_emitted = result.breaches_emitted
            self.status.last_tick_skipped_cooldown = result.skipped_cooldown
            self.status.last_tick_errors = result.errors
            if result.errors:
                self.status.last_error = result.last_error
                self.status.last_error_at = now.isoformat()

    # --- Lifecycle --------------------------------------------------------

    def start(self) -> bool:
        """Register the APScheduler job. Idempotent."""
        from apscheduler.schedulers.background import BackgroundScheduler  # noqa: PLC0415
        from apscheduler.triggers.interval import IntervalTrigger  # noqa: PLC0415

        with self._lock:
            if self._scheduler is not None and self._scheduler.running:
                return False
            self._scheduler = BackgroundScheduler(daemon=True)
            self._scheduler.add_job(
                self._scheduled_tick,
                trigger=IntervalTrigger(hours=self.interval_hours),
                id=_TICK_JOB_ID,
                name=_TICK_JOB_ID,
                replace_existing=True,
                max_instances=1,
                coalesce=True,
            )
            self._scheduler.start()
            self.status.running = True
            self.status.next_tick_at = (
                datetime.now(timezone.utc) + timedelta(hours=self.interval_hours)
            ).isoformat()
            _log.info(
                "irb_reviewer_sla worker started",
                extra={
                    "event": "irbamd2_worker_started",
                    "interval_hours": self.interval_hours,
                    "queue_threshold": self.queue_threshold,
                    "age_threshold_days": self.age_threshold_days,
                    "cooldown_hours": self.cooldown_hours,
                },
            )
            return True

    def _scheduled_tick(self) -> None:
        try:
            result = self.tick()
            _log.info(
                "irb_reviewer_sla tick complete",
                extra={
                    "event": "irbamd2_worker_tick",
                    "reviewers_examined": result.reviewers_examined,
                    "breaches_emitted": result.breaches_emitted,
                    "skipped_cooldown": result.skipped_cooldown,
                    "errors": result.errors,
                    "elapsed_ms": result.elapsed_ms,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "irb_reviewer_sla scheduled tick crashed",
                extra={
                    "event": "irbamd2_worker_scheduled_tick_error",
                    "error": str(exc),
                },
            )

    def stop(self) -> bool:
        with self._lock:
            sched = self._scheduler
            self._scheduler = None
            self.status.running = False
        if sched is None:
            return False
        try:
            if sched.running:
                sched.shutdown(wait=False)
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "irb_reviewer_sla shutdown raised",
                extra={
                    "event": "irbamd2_worker_shutdown_error",
                    "error": str(exc),
                },
            )
        _log.info(
            "irb_reviewer_sla worker stopped",
            extra={"event": "irbamd2_worker_stopped"},
        )
        return True


# ---------------------------------------------------------------------------
# Module-level accessors
# ---------------------------------------------------------------------------


def get_worker() -> IRBReviewerSLAWorker:
    """Return the singleton :class:`IRBReviewerSLAWorker`."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = IRBReviewerSLAWorker()
        return _WORKER_INSTANCE


def start_worker_if_enabled() -> Optional[IRBReviewerSLAWorker]:
    """FastAPI startup hook. No-op when the env var is not enabled."""
    if not env_enabled():
        _log.info(
            "irb_reviewer_sla worker disabled via env",
            extra={"event": "irbamd2_worker_disabled"},
        )
        return None
    worker = get_worker()
    worker.start()
    return worker


def shutdown_worker() -> None:
    """FastAPI shutdown hook. Safe to call when never started."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        worker = _WORKER_INSTANCE
    if worker is None:
        return
    try:
        worker.stop()
    except Exception:  # pragma: no cover - defensive
        _log.exception("irb_reviewer_sla shutdown raised")


def _reset_for_tests() -> None:
    """Test helper — fully tear down + drop the singleton reference."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        worker = _WORKER_INSTANCE
        _WORKER_INSTANCE = None
    if worker is not None:
        try:
            worker.stop()
        except Exception:  # pragma: no cover - defensive
            pass


__all__ = [
    "IRBReviewerSLAWorker",
    "TickResult",
    "WorkerStatus",
    "WORKER_SURFACE",
    "BREACH_TARGET_TYPE",
    "env_enabled",
    "env_interval_hours",
    "env_queue_threshold",
    "env_age_threshold_days",
    "env_cooldown_hours",
    "get_worker",
    "shutdown_worker",
    "start_worker_if_enabled",
    "_reset_for_tests",
]
