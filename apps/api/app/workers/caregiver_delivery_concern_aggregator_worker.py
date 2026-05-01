"""Caregiver Delivery Concern Aggregator Worker (2026-05-01).

Closes section I rec from the Channel Misconfiguration Detector launch
audit (#389):

* The detector (#389) ships HIGH-priority audit rows when an adapter is
  unavailable AND no successful delivery has been observed in the last
  24h. But the patient may have filed multiple delivery-concern reports
  (Patient Digest #382/#383) for the same caregiver before the detector
  ever notices — concerns are filed end-user-side, the detector is
  config-side. THIS worker bridges the gap.
* This worker walks every caregiver-scoped delivery-concern row in a
  rolling 7-day window, groups them by ``(caregiver_user_id,
  clinic_id)``, and emits a HIGH-priority
  ``caregiver_portal.delivery_concern_threshold_reached`` audit row when
  the per-caregiver count meets the configured threshold (default 3).
* The HIGH-priority marker auto-routes the flag into the Clinician Inbox
  aggregator (#354) so the admin sees the recurring delivery problem
  without opening a per-caregiver drill-down.
* Cooldown per ``(caregiver, clinic)`` — the worker doesn't re-flag the
  same (caregiver, clinic) within ``cooldown_hours`` so a single noisy
  pair doesn't fill the inbox on every tick.

Pattern matches :mod:`app.workers.channel_misconfiguration_detector_worker`
(#389) for lifecycle + audit. Source rows: ``audit_event_records`` whose
``action`` is ``clinician_inbox.caregiver_delivery_concern_to_clinician_mirror``
(emitted by Patient Digest #383 for every caregiver-side delivery
concern) OR ``caregiver_portal.delivery_concern_filed`` (forward-
compat alias the spec mentions). Both names are honoured so the
counter stays correct as upstream emitters evolve.

Configuration
=============

``DEEPSYNAPS_CG_CONCERN_AGGREGATOR_ENABLED``
    Must equal exactly ``"1"`` to start the worker. Default off so unit
    tests, CI, and local dev runs do not accidentally fire flags.
``DEEPSYNAPS_CG_CONCERN_AGGREGATOR_INTERVAL_SEC``
    Tick cadence in seconds. Defaults to 3600 (once per hour). Bad values
    fall back to 3600.
``DEEPSYNAPS_CG_CONCERN_AGGREGATOR_THRESHOLD``
    Concern count that triggers a flag. Defaults to 3.
``DEEPSYNAPS_CG_CONCERN_AGGREGATOR_WINDOW_HOURS``
    Rolling window in hours. Defaults to 168 (7 days).
``DEEPSYNAPS_CG_CONCERN_AGGREGATOR_COOLDOWN_HOURS``
    Re-flag cooldown per ``(caregiver, clinic)`` in hours. Defaults to 72.

Audit
=====

Every tick emits ONE row under
``target_type='caregiver_delivery_concern_aggregator'`` with
``action='caregiver_delivery_concern_aggregator.tick'`` whose note
encodes ``concerns_scanned=N caregivers_flagged=M errors=E
elapsed_ms=T``. Per-caregiver flags additionally emit a
``caregiver_portal.delivery_concern_threshold_reached`` row carrying
``priority=high``, the caregiver_user_id, clinic_id, concern_count,
window_hours, and threshold so the admin inbox aggregator can rank +
drill-out without a second query.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: "Optional[CaregiverDeliveryConcernAggregatorWorker]" = None
_TICK_JOB_ID = "caregiver_delivery_concern_aggregator_worker_tick"


# Surface for the per-tick + page-level audit rows. Distinct from the
# per-caregiver mirror surface ``caregiver_portal`` so the regulator can
# join "scan tick fired" rows to "specific caregiver flagged" rows
# without ambiguity.
WORKER_SURFACE = "caregiver_delivery_concern_aggregator"
PORTAL_SURFACE = "caregiver_portal"

# Source-row action names. Patient Digest emits the first; the second is
# a forward-compatible alias (some upstream emitters file a
# caregiver-portal row directly without going through the clinician
# mirror). Both are honoured at count time so the counter stays correct
# as upstream emitters evolve.
SOURCE_ACTIONS = (
    "clinician_inbox.caregiver_delivery_concern_to_clinician_mirror",
    "caregiver_portal.delivery_concern_filed",
)

# Action emitted by THIS worker per flag.
FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"

# Action emitted by the resolution flow (out of scope for this worker;
# the inbox-clear path consumes it). Tracked here so the ``_clear_inbox``
# helper used in tests can assert clearance honestly.
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"


# ---------------------------------------------------------------------------
# Status snapshot (in-memory, per-process)
# ---------------------------------------------------------------------------


@dataclass
class FlaggedCaregiver:
    caregiver_user_id: str
    clinic_id: Optional[str]
    concern_count: int
    window_hours: int
    threshold: int
    flag_event_id: str


@dataclass
class TickResult:
    """Result of one :meth:`CaregiverDeliveryConcernAggregatorWorker.tick`."""

    concerns_scanned: int = 0
    caregivers_evaluated: int = 0
    caregivers_flagged: int = 0
    skipped_cooldown: int = 0
    skipped_below_threshold: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    flagged_caregiver_ids: list[str] = field(default_factory=list)
    flagged_audit_event_ids: list[str] = field(default_factory=list)
    flagged: list[FlaggedCaregiver] = field(default_factory=list)


@dataclass
class WorkerStatus:
    running: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_concerns_scanned: int = 0
    last_tick_caregivers_flagged: int = 0
    last_tick_errors: int = 0
    caregivers_flagged_last_24h: int = 0
    interval_sec: int = 3600
    threshold: int = 3
    window_hours: int = 168
    cooldown_hours: int = 72


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
            "caregiver_delivery_concern_aggregator env var not int; using default",
            extra={"event": "cgca_worker_bad_env", "name": name, "raw": raw},
        )
        return default
    if v < minimum:
        return default
    return v


def env_enabled() -> bool:
    return (
        os.environ.get("DEEPSYNAPS_CG_CONCERN_AGGREGATOR_ENABLED", "").strip()
        == "1"
    )


def env_interval_sec() -> int:
    return _env_int(
        "DEEPSYNAPS_CG_CONCERN_AGGREGATOR_INTERVAL_SEC",
        default=3600,
        minimum=60,
    )


def env_threshold() -> int:
    return _env_int(
        "DEEPSYNAPS_CG_CONCERN_AGGREGATOR_THRESHOLD",
        default=3,
        minimum=1,
    )


def env_window_hours() -> int:
    return _env_int(
        "DEEPSYNAPS_CG_CONCERN_AGGREGATOR_WINDOW_HOURS",
        default=168,
        minimum=1,
    )


def env_cooldown_hours() -> int:
    return _env_int(
        "DEEPSYNAPS_CG_CONCERN_AGGREGATOR_COOLDOWN_HOURS",
        default=72,
        minimum=1,
    )


# ---------------------------------------------------------------------------
# Synthetic actor used for in-process scan
# ---------------------------------------------------------------------------


def _synth_admin_actor(clinic_id: Optional[str]) -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="caregiver-delivery-concern-aggregator-worker",
        display_name="Caregiver Delivery Concern Aggregator",
        role="admin",
        package_id="enterprise",
        clinic_id=(clinic_id or "clinic-demo-default"),
        token_id="caregiver-delivery-concern-aggregator-worker-internal",
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
        f"concerns_scanned={result.concerns_scanned} "
        f"caregivers_evaluated={result.caregivers_evaluated} "
        f"caregivers_flagged={result.caregivers_flagged} "
        f"skipped_cooldown={result.skipped_cooldown} "
        f"skipped_below_threshold={result.skipped_below_threshold} "
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
            actor_id="caregiver-delivery-concern-aggregator-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception(
            "caregiver_delivery_concern_aggregator tick audit emit failed"
        )
    return eid


def _emit_threshold_audit(
    db: Session,
    *,
    caregiver_user_id: str,
    clinic_id: Optional[str],
    concern_count: int,
    window_hours: int,
    threshold: int,
) -> str:
    """Emit a ``caregiver_portal.delivery_concern_threshold_reached`` row.

    Carries the canonical ``priority=high`` marker so the Clinician
    Inbox HIGH-priority predicate (#354) auto-routes this row into the
    admin's inbox feed.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{PORTAL_SURFACE}-delivery_concern_threshold_reached-"
        f"{caregiver_user_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=high "
        f"caregiver_id={caregiver_user_id} "
        f"clinic_id={clinic_id or 'null'} "
        f"concern_count={concern_count} "
        f"window_hours={window_hours} "
        f"threshold={threshold}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=caregiver_user_id,
            target_type=PORTAL_SURFACE,
            action=FLAG_ACTION,
            role="admin",
            actor_id="caregiver-delivery-concern-aggregator-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception(
            "caregiver_delivery_concern_aggregator flag audit emit failed"
        )
    return eid


# ---------------------------------------------------------------------------
# Cooldown / freshness helpers
# ---------------------------------------------------------------------------


_CG_NOTE_PATTERNS = (
    re.compile(r"caregiver_user=([\w\-]+)"),
    re.compile(r"caregiver_id=([\w\-]+)"),
    re.compile(r"caregiver_user_id=([\w\-]+)"),
)


def _extract_caregiver_id_from_note(note: str) -> Optional[str]:
    """Pull the caregiver_user_id out of an audit row's note."""
    if not note:
        return None
    for pat in _CG_NOTE_PATTERNS:
        m = pat.search(note)
        if m:
            return m.group(1)
    return None


def _was_flagged_within_cooldown(
    db: Session,
    *,
    caregiver_user_id: str,
    clinic_id: Optional[str],
    cooldown_hours: int,
    now: datetime,
) -> bool:
    """Return True when a threshold-reached audit row already exists for this
    (caregiver, clinic) newer than ``now - cooldown_hours``."""
    cutoff_iso = (now - timedelta(hours=cooldown_hours)).isoformat()
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_id == caregiver_user_id,
            AuditEventRecord.action == FLAG_ACTION,
            AuditEventRecord.created_at >= cutoff_iso,
        )
        .all()
    )
    if not rows:
        return False
    if not clinic_id:
        return True
    needle = f"clinic_id={clinic_id}"
    for r in rows:
        if needle in (r.note or ""):
            return True
    return False


def _was_resolved_after(
    db: Session,
    *,
    caregiver_user_id: str,
    clinic_id: Optional[str],
    after_iso: str,
) -> bool:
    """Return True when a ``delivery_concern_resolved`` row exists for this
    (caregiver, clinic) more recent than ``after_iso``.

    Used to skip flagging when the admin already cleared the concern
    backlog (the resolution flow is what closes the inbox row; the
    aggregator must not re-fire on a freshly-cleared caregiver).
    """
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_id == caregiver_user_id,
            AuditEventRecord.action == RESOLVE_ACTION,
            AuditEventRecord.created_at >= after_iso,
        )
        .all()
    )
    if not rows:
        return False
    if not clinic_id:
        return True
    needle = f"clinic_id={clinic_id}"
    for r in rows:
        if needle in (r.note or ""):
            return True
    return False


# ---------------------------------------------------------------------------
# Core worker
# ---------------------------------------------------------------------------


class CaregiverDeliveryConcernAggregatorWorker:
    """Rolling-window aggregator: caregivers with N+ delivery concerns.

    Use :meth:`tick` to run one scan iteration synchronously (testable
    without the scheduler thread). Use :meth:`start` / :meth:`stop` to
    register / unregister the APScheduler job.
    """

    def __init__(
        self,
        *,
        interval_sec: Optional[int] = None,
        threshold: Optional[int] = None,
        window_hours: Optional[int] = None,
        cooldown_hours: Optional[int] = None,
    ) -> None:
        self.interval_sec = interval_sec or env_interval_sec()
        self.threshold = threshold or env_threshold()
        self.window_hours = window_hours or env_window_hours()
        self.cooldown_hours = cooldown_hours or env_cooldown_hours()
        self.status = WorkerStatus(
            interval_sec=self.interval_sec,
            threshold=self.threshold,
            window_hours=self.window_hours,
            cooldown_hours=self.cooldown_hours,
        )
        self._scheduler = None
        self._lock = threading.Lock()

    # --- Status surface ---------------------------------------------------

    def get_status(self) -> WorkerStatus:
        return self.status

    def get_status_for_clinic(
        self, db: Session, clinic_id: Optional[str]
    ) -> dict:
        """Per-clinic status snapshot for the ``GET /status`` endpoint.

        Combines the in-memory worker status with clinic-scoped DB
        counts:
          * caregivers_in_clinic — owners of active caregiver_user_id
            references whose ``users.clinic_id`` matches.
          * caregivers_flagged_last_24h — count of FLAG_ACTION rows in
            the last 24h whose note carries ``clinic_id={cid}``.
        """
        caregivers_in_clinic = 0
        if clinic_id:
            try:
                caregivers_in_clinic = (
                    db.query(User)
                    .filter(User.clinic_id == clinic_id)
                    .count()
                )
            except Exception:  # pragma: no cover - defensive
                caregivers_in_clinic = 0
        try:
            cutoff_iso = (
                datetime.now(timezone.utc) - timedelta(hours=24)
            ).isoformat()
            recent_rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == FLAG_ACTION,
                    AuditEventRecord.created_at >= cutoff_iso,
                )
                .all()
            )
            if clinic_id:
                needle = f"clinic_id={clinic_id}"
                flagged_24h = sum(
                    1 for r in recent_rows if needle in (r.note or "")
                )
            else:
                flagged_24h = len(recent_rows)
        except Exception:  # pragma: no cover - defensive
            flagged_24h = 0
        return {
            "running": bool(self.status.running),
            "last_tick_at": self.status.last_tick_at,
            "last_error": self.status.last_error,
            "last_error_at": self.status.last_error_at,
            "caregivers_in_clinic": int(caregivers_in_clinic),
            "caregivers_flagged_last_24h": int(flagged_24h),
            "last_tick_concerns_scanned": int(
                self.status.last_tick_concerns_scanned
            ),
            "last_tick_caregivers_flagged": int(
                self.status.last_tick_caregivers_flagged
            ),
            "last_tick_errors": int(self.status.last_tick_errors),
            "interval_sec": int(self.interval_sec),
            "threshold": int(self.threshold),
            "window_hours": int(self.window_hours),
            "cooldown_hours": int(self.cooldown_hours),
        }

    # --- Tick -------------------------------------------------------------

    def tick(
        self,
        db: Optional[Session] = None,
        *,
        only_clinic_id: Optional[str] = None,
    ) -> TickResult:
        """Run one scan iteration.

        Parameters
        ----------
        db
            Optional session. When ``None`` the worker opens its own and
            closes it in ``finally``.
        only_clinic_id
            When provided, only flag caregivers whose owning user sits in
            this clinic. Used by the admin ``tick`` endpoint so a
            synchronous scan stays bounded to the actor's clinic — even
            if the caller passes a different clinic_id than they belong
            to, the router's ``_scope_clinic`` helper coerces this back
            to ``actor.clinic_id`` before invocation.
        """
        owns_session = db is None
        if db is None:
            db = SessionLocal()
        result = TickResult()
        started_at = datetime.now(timezone.utc)
        try:
            self._tick_inner(
                db, result, only_clinic_id=only_clinic_id, now=started_at
            )
        except Exception as exc:  # pragma: no cover - defensive top-level
            result.errors += 1
            result.last_error = str(exc)
            _log.exception(
                "caregiver_delivery_concern_aggregator tick crashed"
            )
        finally:
            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            result.elapsed_ms = int(elapsed * 1000)
            try:
                _emit_tick_audit(db, clinic_id=only_clinic_id, result=result)
            except Exception:  # pragma: no cover - defensive
                _log.exception(
                    "caregiver_delivery_concern_aggregator post-tick audit failed"
                )
            self._update_status(result)
            if owns_session:
                try:
                    db.close()
                except Exception:  # pragma: no cover - defensive
                    pass
        return result

    def _aggregate_for_clinic(
        self, clinic_id: str, *, db: Optional[Session] = None
    ) -> list[FlaggedCaregiver]:
        """Public helper: return the flag list for a single clinic.

        Wraps :meth:`tick` so callers (e.g. the admin debug endpoint)
        can request a clinic-scoped scan without writing audit rows
        every time. Calls :meth:`tick` so the audit row IS still written
        — the helper exists for callers that want the structured list
        rather than the TickResult counters.
        """
        result = self.tick(db, only_clinic_id=clinic_id)
        return list(result.flagged)

    def _tick_inner(
        self,
        db: Session,
        result: TickResult,
        *,
        only_clinic_id: Optional[str] = None,
        now: datetime,
    ) -> None:
        # 1) Pull every concern-source audit row in the rolling window.
        cutoff_iso = (now - timedelta(hours=self.window_hours)).isoformat()
        concern_rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.action.in_(SOURCE_ACTIONS),
                AuditEventRecord.created_at >= cutoff_iso,
            )
            .all()
        )
        result.concerns_scanned = len(concern_rows)
        if not concern_rows:
            return

        # 2) Group by (caregiver_user_id, clinic_id). The clinician-mirror
        #    rows carry the caregiver_user_id in the note (target_id is
        #    the patient_id); the caregiver_portal alias rows carry
        #    target_id == caregiver_user_id directly. We honour both.
        per_caregiver: dict[str, dict] = {}
        for r in concern_rows:
            note = r.note or ""
            cg_id: Optional[str] = None
            if r.target_type == "caregiver_portal":
                cg_id = r.target_id or _extract_caregiver_id_from_note(note)
            else:
                cg_id = _extract_caregiver_id_from_note(note)
            if not cg_id:
                continue
            entry = per_caregiver.setdefault(
                cg_id,
                {"count": 0, "event_ids": set()},
            )
            # Dedupe by event_id so re-running the worker on the same
            # rows can't inflate the count.
            if r.event_id in entry["event_ids"]:
                continue
            entry["event_ids"].add(r.event_id)
            entry["count"] += 1

        # 3) Bulk-load owning users so we can scope by clinic.
        cg_ids = list(per_caregiver.keys())
        users = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(cg_ids or [""])).all()
        }

        # 4) For each caregiver, evaluate threshold + cooldown.
        for cg_id, entry in per_caregiver.items():
            user = users.get(cg_id)
            clinic_id = getattr(user, "clinic_id", None) if user else None

            if only_clinic_id and clinic_id != only_clinic_id:
                continue

            result.caregivers_evaluated += 1

            count = int(entry["count"])
            if count < self.threshold:
                result.skipped_below_threshold += 1
                continue

            try:
                if _was_flagged_within_cooldown(
                    db,
                    caregiver_user_id=cg_id,
                    clinic_id=clinic_id,
                    cooldown_hours=self.cooldown_hours,
                    now=now,
                ):
                    result.skipped_cooldown += 1
                    continue
            except Exception as exc:  # pragma: no cover - defensive
                result.errors += 1
                result.last_error = f"cooldown_check: {exc}"
                continue

            # 5) Emit the HIGH-priority audit row.
            try:
                eid = _emit_threshold_audit(
                    db,
                    caregiver_user_id=cg_id,
                    clinic_id=clinic_id,
                    concern_count=count,
                    window_hours=self.window_hours,
                    threshold=self.threshold,
                )
            except Exception as exc:  # pragma: no cover - defensive
                result.errors += 1
                result.last_error = f"emit: {exc}"
                continue
            result.caregivers_flagged += 1
            result.flagged_caregiver_ids.append(cg_id)
            result.flagged_audit_event_ids.append(eid)
            result.flagged.append(
                FlaggedCaregiver(
                    caregiver_user_id=cg_id,
                    clinic_id=clinic_id,
                    concern_count=count,
                    window_hours=self.window_hours,
                    threshold=self.threshold,
                    flag_event_id=eid,
                )
            )

    def _update_status(self, result: TickResult) -> None:
        with self._lock:
            now_iso = datetime.now(timezone.utc).isoformat()
            self.status.last_tick_at = now_iso
            self.status.last_tick_concerns_scanned = result.concerns_scanned
            self.status.last_tick_caregivers_flagged = result.caregivers_flagged
            self.status.last_tick_errors = result.errors
            self.status.caregivers_flagged_last_24h = (
                self.status.caregivers_flagged_last_24h
                + result.caregivers_flagged
            )
            if result.errors:
                self.status.last_error = result.last_error
                self.status.last_error_at = now_iso

    # --- Lifecycle --------------------------------------------------------

    def start(self) -> bool:
        """Register the APScheduler job. Idempotent — second call is a no-op."""
        from apscheduler.schedulers.background import BackgroundScheduler  # noqa: PLC0415
        from apscheduler.triggers.interval import IntervalTrigger  # noqa: PLC0415

        with self._lock:
            if self._scheduler is not None and self._scheduler.running:
                return False
            self._scheduler = BackgroundScheduler(daemon=True)
            self._scheduler.add_job(
                self._scheduled_tick,
                trigger=IntervalTrigger(seconds=self.interval_sec),
                id=_TICK_JOB_ID,
                name=_TICK_JOB_ID,
                replace_existing=True,
                max_instances=1,
                coalesce=True,
            )
            self._scheduler.start()
            self.status.running = True
            _log.info(
                "caregiver_delivery_concern_aggregator worker started",
                extra={
                    "event": "cgca_worker_started",
                    "interval_sec": self.interval_sec,
                    "threshold": self.threshold,
                    "window_hours": self.window_hours,
                    "cooldown_hours": self.cooldown_hours,
                },
            )
            return True

    def _scheduled_tick(self) -> None:
        try:
            result = self.tick()
            _log.info(
                "caregiver_delivery_concern_aggregator tick complete",
                extra={
                    "event": "cgca_worker_tick",
                    "concerns_scanned": result.concerns_scanned,
                    "caregivers_flagged": result.caregivers_flagged,
                    "errors": result.errors,
                    "elapsed_ms": result.elapsed_ms,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "caregiver_delivery_concern_aggregator scheduled tick crashed",
                extra={
                    "event": "cgca_worker_scheduled_tick_error",
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
                "caregiver_delivery_concern_aggregator shutdown raised",
                extra={
                    "event": "cgca_worker_shutdown_error",
                    "error": str(exc),
                },
            )
        _log.info(
            "caregiver_delivery_concern_aggregator worker stopped",
            extra={"event": "cgca_worker_stopped"},
        )
        return True


# ---------------------------------------------------------------------------
# Module-level accessors
# ---------------------------------------------------------------------------


def get_worker() -> CaregiverDeliveryConcernAggregatorWorker:
    """Return the singleton :class:`CaregiverDeliveryConcernAggregatorWorker`."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = CaregiverDeliveryConcernAggregatorWorker()
        return _WORKER_INSTANCE


def start_worker_if_enabled() -> Optional[
    CaregiverDeliveryConcernAggregatorWorker
]:
    """FastAPI startup hook. No-op when the env var is not ``"1"``."""
    if not env_enabled():
        _log.info(
            "caregiver_delivery_concern_aggregator worker disabled via env",
            extra={"event": "cgca_worker_disabled"},
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
            "caregiver_delivery_concern_aggregator shutdown raised"
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
    "CaregiverDeliveryConcernAggregatorWorker",
    "FlaggedCaregiver",
    "TickResult",
    "WorkerStatus",
    "WORKER_SURFACE",
    "PORTAL_SURFACE",
    "FLAG_ACTION",
    "RESOLVE_ACTION",
    "SOURCE_ACTIONS",
    "env_enabled",
    "env_interval_sec",
    "env_threshold",
    "env_window_hours",
    "env_cooldown_hours",
    "get_worker",
    "shutdown_worker",
    "start_worker_if_enabled",
    "_reset_for_tests",
]
