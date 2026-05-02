"""Rotation Policy Advisor Snapshot Worker (CSAHP5, 2026-05-02).

Closes the section I rec from the Rotation Policy Advisor launch audit
(CSAHP4, #428):

* CSAHP4 emits heuristic ``advice_cards`` (REFLAG_HIGH, MANUAL_REFLAG,
  AUTH_DOMINANT) for each clinic but is a pure read endpoint — there is
  no record of WHEN a card was generated, so we cannot answer the
  obvious calibration question: "did the card go away after the clinic
  acted on the advice?"
* THIS worker periodically (default daily) calls
  ``compute_rotation_advice`` for each clinic and emits one
  ``auth_drift_rotation_policy_advisor.advice_snapshot`` audit row per
  active card + one
  ``auth_drift_rotation_policy_advisor.snapshot_run`` row per clinic
  per tick.
* The CSAHP5 outcome-tracker service then pairs each
  ``advice_snapshot`` at time T with the matching snapshot at
  ``T + pair_lookahead_days`` (default 14d, ±2d tolerance) to compute
  ``re_flag_rate_delta`` / ``card_disappeared`` per (channel, advice_code).
* Default-off — opt-in via ``ROTATION_POLICY_ADVISOR_SNAPSHOT_ENABLED``
  so tests / CI / billing-blocked deploys do not generate snapshot rows
  unprompted.

Pattern matches :mod:`app.workers.channel_auth_health_probe_worker`
(CSAHP1, #417) for lifecycle, audit emission, and singleton
management.

Configuration
=============

``ROTATION_POLICY_ADVISOR_SNAPSHOT_ENABLED``
    Must be exactly ``"True"`` / ``"true"`` / ``"1"`` to start the
    background tick loop. Default ``False`` — honest opt-in. Tests and
    admin endpoints invoke :meth:`tick` directly.
``ROTATION_POLICY_ADVISOR_SNAPSHOT_INTERVAL_HOURS``
    Tick cadence in hours. Defaults to 24 (daily).
``ROTATION_POLICY_ADVISOR_SNAPSHOT_COOLDOWN_HOURS``
    Per-clinic cooldown — skip if a ``snapshot_run`` row newer than
    ``now - cooldown_hours`` already exists for the clinic. Defaults to
    23 so two daily ticks don't collide on DST + scheduler drift.

Audit
=====

* Per-tick row under ``target_type='auth_drift_rotation_policy_advisor'``
  with action ``auth_drift_rotation_policy_advisor.tick`` carries
  ``clinic_id={cid|all} clinics_scanned=N total_advice_cards=M
  snapshot_runs=K elapsed_ms=T``.
* Per-clinic ``snapshot_run`` row under the same target_type with
  action ``auth_drift_rotation_policy_advisor.snapshot_run`` —
  ``priority=info``. Note encodes ``clinic_id={cid}
  total_advice_cards={n} channels_with_advice={a,b,c}``.
* Per advice card ``advice_snapshot`` row under the same target_type
  with action ``auth_drift_rotation_policy_advisor.advice_snapshot`` —
  ``priority=info``. Note encodes ``clinic_id={cid} channel={ch}
  advice_code={code} severity={sev} re_flag_rate_pct={x}
  confirmed_count={n} manual_rotation_share_pct={y}
  auth_error_class_share_pct={z} total_drifts={t} rotations={r}``.
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

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User
from app.services.rotation_policy_advisor import (
    RotationAdvice,
    compute_rotation_advice,
)


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: "Optional[RotationPolicyAdvisorSnapshotWorker]" = None
_TICK_JOB_ID = "rotation_policy_advisor_snapshot_worker_tick"


# Surface used for snapshot rows. Same surface as CSAHP4 page-level
# audit rows so the audit-trail viewer groups everything together.
WORKER_SURFACE = "auth_drift_rotation_policy_advisor"


# ---------------------------------------------------------------------------
# Status snapshot
# ---------------------------------------------------------------------------


@dataclass
class TickResult:
    """Result of one
    :meth:`RotationPolicyAdvisorSnapshotWorker.tick`.
    """

    clinics_scanned: int = 0
    snapshot_runs: int = 0
    total_advice_cards: int = 0
    skipped_cooldown: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    snapshot_run_audit_event_ids: list[str] = field(default_factory=list)
    advice_snapshot_audit_event_ids: list[str] = field(default_factory=list)


@dataclass
class WorkerStatus:
    running: bool = False
    last_tick_at: Optional[str] = None
    next_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_clinics_scanned: int = 0
    last_tick_total_advice_cards: int = 0
    last_tick_snapshot_runs: int = 0
    last_tick_errors: int = 0
    interval_hours: int = 24
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
            "rotation_policy_advisor_snapshot worker env var not int; "
            "using default",
            extra={"event": "csahp5_worker_bad_env", "name": name, "raw": raw},
        )
        return default
    if v < minimum:
        return default
    return v


def env_enabled() -> bool:
    raw = os.environ.get(
        "ROTATION_POLICY_ADVISOR_SNAPSHOT_ENABLED", ""
    ).strip().lower()
    return raw in ("1", "true", "yes")


def env_interval_hours() -> int:
    return _env_int(
        "ROTATION_POLICY_ADVISOR_SNAPSHOT_INTERVAL_HOURS",
        default=24,
        minimum=1,
    )


def env_cooldown_hours() -> int:
    return _env_int(
        "ROTATION_POLICY_ADVISOR_SNAPSHOT_COOLDOWN_HOURS",
        default=23,
        minimum=1,
    )


# ---------------------------------------------------------------------------
# Synthetic actor
# ---------------------------------------------------------------------------


def _synth_admin_actor(clinic_id: Optional[str]) -> AuthenticatedActor:
    """Synthetic actor representing the worker."""
    return AuthenticatedActor(
        actor_id="rotation-policy-advisor-snapshot-worker",
        display_name="Rotation Policy Advisor Snapshot Worker",
        role="admin",
        package_id="enterprise",
        clinic_id=(clinic_id or "clinic-demo-default"),
        token_id="rotation-policy-advisor-snapshot-worker-internal",
    )


# ---------------------------------------------------------------------------
# Audit emit helpers
# ---------------------------------------------------------------------------


def _emit_tick_audit(
    db: Session,
    *,
    clinic_id: Optional[str],
    result: TickResult,
) -> str:
    """Emit ONE per-tick audit row under
    ``target_type=WORKER_SURFACE``."""
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-tick-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note = (
        f"clinic_id={clinic_id or 'all'} "
        f"clinics_scanned={result.clinics_scanned} "
        f"total_advice_cards={result.total_advice_cards} "
        f"snapshot_runs={result.snapshot_runs} "
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
            actor_id="rotation-policy-advisor-snapshot-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception(
            "rotation_policy_advisor_snapshot tick audit emit failed"
        )
    return eid


def _emit_snapshot_run_audit(
    db: Session,
    *,
    clinic_id: str,
    total_advice_cards: int,
    channels_with_advice: list[str],
) -> str:
    """Emit ONE ``snapshot_run`` row per (clinic, tick).

    Used by the CSAHP5 outcome tracker to pair "snapshot at T" with
    "snapshot at T+14d" even when card sets shift between snapshots
    (i.e., a card disappeared OR a new card appeared).
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-snapshot_run-{clinic_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    chans = ",".join(sorted(channels_with_advice)) if channels_with_advice else ""
    note = (
        f"priority=info clinic_id={clinic_id} "
        f"total_advice_cards={total_advice_cards} "
        f"channels_with_advice={chans}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(clinic_id),
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.snapshot_run",
            role="admin",
            actor_id="rotation-policy-advisor-snapshot-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception(
            "rotation_policy_advisor_snapshot snapshot_run audit emit failed"
        )
    return eid


def _emit_advice_snapshot_audit(
    db: Session,
    *,
    clinic_id: str,
    card: RotationAdvice,
) -> str:
    """Emit ONE ``advice_snapshot`` row per advice_card.

    Notes encode every supporting metric as ``key=value`` tokens so the
    outcome-tracker service can re-parse them deterministically.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-advice_snapshot-{clinic_id}-{card.channel}-"
        f"{card.advice_code}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )

    metrics = card.supporting_metrics or {}

    def _fmt(v: float | int) -> str:
        if isinstance(v, int):
            return str(v)
        try:
            return f"{float(v):.2f}"
        except Exception:
            return "0"

    note = (
        f"priority=info clinic_id={clinic_id} channel={card.channel} "
        f"advice_code={card.advice_code} severity={card.severity} "
        f"re_flag_rate_pct={_fmt(metrics.get('re_flag_rate_pct', 0.0))} "
        f"confirmed_count={int(metrics.get('confirmed_count', 0) or 0)} "
        f"manual_rotation_share_pct="
        f"{_fmt(metrics.get('manual_rotation_share_pct', 0.0))} "
        f"auth_error_class_share_pct="
        f"{_fmt(metrics.get('auth_error_class_share_pct', 0.0))} "
        f"total_drifts={int(metrics.get('total_drifts', 0) or 0)} "
        f"rotations={int(metrics.get('rotations', 0) or 0)}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(clinic_id),
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.advice_snapshot",
            role="admin",
            actor_id="rotation-policy-advisor-snapshot-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception(
            "rotation_policy_advisor_snapshot advice_snapshot audit emit failed"
        )
    return eid


# ---------------------------------------------------------------------------
# Cooldown helper
# ---------------------------------------------------------------------------


def _was_emitted_within_cooldown(
    db: Session,
    *,
    clinic_id: str,
    cooldown_hours: int,
    now: datetime,
) -> bool:
    """Return True when a ``snapshot_run`` audit row already exists for
    this clinic newer than ``now - cooldown_hours``."""
    cutoff_iso = (now - timedelta(hours=cooldown_hours)).isoformat()
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == f"{WORKER_SURFACE}.snapshot_run",
            AuditEventRecord.created_at >= cutoff_iso,
        )
        .all()
    )
    if not rows:
        return False
    needle = f"clinic_id={clinic_id}"
    for r in rows:
        if needle in (r.note or ""):
            return True
    return False


# ---------------------------------------------------------------------------
# Core worker
# ---------------------------------------------------------------------------


class RotationPolicyAdvisorSnapshotWorker:
    """Periodic snapshot of CSAHP4 advice cards.

    Use :meth:`tick` to run one snapshot iteration synchronously
    (testable without the scheduler thread). Use :meth:`start` /
    :meth:`stop` to register / unregister the APScheduler job.
    """

    def __init__(
        self,
        *,
        interval_hours: Optional[int] = None,
        cooldown_hours: Optional[int] = None,
    ) -> None:
        self.interval_hours = interval_hours or env_interval_hours()
        self.cooldown_hours = cooldown_hours or env_cooldown_hours()
        self.status = WorkerStatus(
            interval_hours=self.interval_hours,
            cooldown_hours=self.cooldown_hours,
        )
        self._scheduler = None
        self._lock = threading.Lock()

    def get_status(self) -> WorkerStatus:
        return self.status

    # --- Tick -------------------------------------------------------------

    def tick(
        self,
        db: Optional[Session] = None,
        *,
        only_clinic_id: Optional[str] = None,
        window_days: int = 90,
    ) -> TickResult:
        """Run one snapshot iteration.

        Parameters
        ----------
        db
            Optional session; opened + closed locally when ``None``.
        only_clinic_id
            When set, scope to one clinic. Routers MUST set this to
            ``actor.clinic_id`` so cross-clinic admins cannot snapshot
            another clinic's advice.
        window_days
            Window passed to ``compute_rotation_advice``.
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
                window_days=window_days,
                now=started_at,
            )
        except Exception as exc:  # pragma: no cover - defensive top-level
            result.errors += 1
            result.last_error = str(exc)
            _log.exception(
                "rotation_policy_advisor_snapshot tick crashed"
            )
        finally:
            elapsed = (
                datetime.now(timezone.utc) - started_at
            ).total_seconds()
            result.elapsed_ms = int(elapsed * 1000)
            try:
                _emit_tick_audit(
                    db, clinic_id=only_clinic_id, result=result
                )
            except Exception:  # pragma: no cover - defensive
                _log.exception(
                    "rotation_policy_advisor_snapshot post-tick audit failed"
                )
            self._update_status(result)
            if owns_session:
                try:
                    db.close()
                except Exception:  # pragma: no cover - defensive
                    pass
        return result

    def _resolve_clinic_ids(
        self, db: Session, only_clinic_id: Optional[str]
    ) -> list[str]:
        if only_clinic_id:
            return [str(only_clinic_id)]
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
        return cids

    def _tick_inner(
        self,
        db: Session,
        result: TickResult,
        *,
        only_clinic_id: Optional[str],
        window_days: int,
        now: datetime,
    ) -> None:
        clinic_ids = self._resolve_clinic_ids(db, only_clinic_id)
        if not clinic_ids:
            return

        for cid in clinic_ids:
            result.clinics_scanned += 1
            try:
                if _was_emitted_within_cooldown(
                    db,
                    clinic_id=cid,
                    cooldown_hours=self.cooldown_hours,
                    now=now,
                ):
                    result.skipped_cooldown += 1
                    continue
            except Exception as exc:  # pragma: no cover - defensive
                result.errors += 1
                result.last_error = f"cooldown_check: {exc}"
                continue

            try:
                cards = compute_rotation_advice(
                    db, clinic_id=cid, window_days=window_days
                )
            except Exception as exc:
                result.errors += 1
                result.last_error = f"compute_rotation_advice: {exc}"
                _log.exception(
                    "rotation_policy_advisor_snapshot compute failed"
                )
                continue

            channels: list[str] = []
            seen_ch: set[str] = set()
            for card in cards:
                try:
                    eid = _emit_advice_snapshot_audit(
                        db, clinic_id=cid, card=card
                    )
                    result.advice_snapshot_audit_event_ids.append(eid)
                    result.total_advice_cards += 1
                    if card.channel not in seen_ch:
                        seen_ch.add(card.channel)
                        channels.append(card.channel)
                except Exception:  # pragma: no cover - defensive
                    result.errors += 1
                    _log.exception(
                        "rotation_policy_advisor_snapshot advice_snapshot emit failed"
                    )

            try:
                run_eid = _emit_snapshot_run_audit(
                    db,
                    clinic_id=cid,
                    total_advice_cards=len(cards),
                    channels_with_advice=channels,
                )
                result.snapshot_run_audit_event_ids.append(run_eid)
                result.snapshot_runs += 1
            except Exception:  # pragma: no cover - defensive
                result.errors += 1
                _log.exception(
                    "rotation_policy_advisor_snapshot snapshot_run emit failed"
                )

    def _update_status(self, result: TickResult) -> None:
        with self._lock:
            now = datetime.now(timezone.utc)
            self.status.last_tick_at = now.isoformat()
            self.status.next_tick_at = (
                now + timedelta(hours=self.interval_hours)
            ).isoformat()
            self.status.last_tick_clinics_scanned = result.clinics_scanned
            self.status.last_tick_total_advice_cards = (
                result.total_advice_cards
            )
            self.status.last_tick_snapshot_runs = result.snapshot_runs
            self.status.last_tick_errors = result.errors
            if result.errors:
                self.status.last_error = result.last_error
                self.status.last_error_at = now.isoformat()

    # --- Lifecycle --------------------------------------------------------

    def start(self) -> bool:
        """Register the APScheduler job. Idempotent — second call is a
        no-op."""
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
                datetime.now(timezone.utc)
                + timedelta(hours=self.interval_hours)
            ).isoformat()
            _log.info(
                "rotation_policy_advisor_snapshot worker started",
                extra={
                    "event": "csahp5_worker_started",
                    "interval_hours": self.interval_hours,
                    "cooldown_hours": self.cooldown_hours,
                },
            )
            return True

    def _scheduled_tick(self) -> None:
        try:
            result = self.tick()
            _log.info(
                "rotation_policy_advisor_snapshot tick complete",
                extra={
                    "event": "csahp5_worker_tick",
                    "clinics_scanned": result.clinics_scanned,
                    "total_advice_cards": result.total_advice_cards,
                    "snapshot_runs": result.snapshot_runs,
                    "errors": result.errors,
                    "elapsed_ms": result.elapsed_ms,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "rotation_policy_advisor_snapshot scheduled tick crashed",
                extra={
                    "event": "csahp5_worker_scheduled_tick_error",
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
                "rotation_policy_advisor_snapshot shutdown raised",
                extra={
                    "event": "csahp5_worker_shutdown_error",
                    "error": str(exc),
                },
            )
        _log.info(
            "rotation_policy_advisor_snapshot worker stopped",
            extra={"event": "csahp5_worker_stopped"},
        )
        return True


# ---------------------------------------------------------------------------
# Module-level accessors
# ---------------------------------------------------------------------------


def get_worker() -> RotationPolicyAdvisorSnapshotWorker:
    """Return the singleton
    :class:`RotationPolicyAdvisorSnapshotWorker`."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = RotationPolicyAdvisorSnapshotWorker()
        return _WORKER_INSTANCE


def start_worker_if_enabled() -> Optional[RotationPolicyAdvisorSnapshotWorker]:
    """FastAPI startup hook. No-op when the env var is not enabled."""
    if not env_enabled():
        _log.info(
            "rotation_policy_advisor_snapshot worker disabled via env",
            extra={"event": "csahp5_worker_disabled"},
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
        _log.exception(
            "rotation_policy_advisor_snapshot shutdown raised"
        )


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
    "RotationPolicyAdvisorSnapshotWorker",
    "TickResult",
    "WorkerStatus",
    "WORKER_SURFACE",
    "env_enabled",
    "env_interval_hours",
    "env_cooldown_hours",
    "get_worker",
    "shutdown_worker",
    "start_worker_if_enabled",
    "_reset_for_tests",
]
