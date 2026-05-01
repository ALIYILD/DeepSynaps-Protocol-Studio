"""Channel Misconfiguration Detector Worker (2026-05-01).

Closes section I rec from the Clinic Caregiver Channel Override launch
audit (#387):

* The override admin surface (#387) shipped the
  ``ClinicCaregiverPreferenceRow.is_misconfigured`` flag and a one-click
  "Override → clinic chain" CTA. But the admin still has to discover the
  misconfig manually by opening the "Caregiver channels" tab.
* THIS worker walks every ``CaregiverDigestPreference`` row with a
  non-null ``preferred_channel`` once per 24h, evaluates
  ``adapter_available`` per row, and emits a HIGH-priority audit row
  when the caregiver's preferred adapter is unavailable AND no
  successful delivery has been observed in the last 24h.
* The audit row carries ``priority=high`` so the Clinician Inbox (#354)
  HIGH-priority predicate auto-routes it into the admin's inbox without
  any new aggregation logic.
* Cooldown per (caregiver, clinic) — the worker doesn't re-flag the same
  misconfig within the cooldown window (default 24h) so the admin's
  inbox doesn't fill with duplicate rows on every tick.

Pattern matches :mod:`app.workers.auto_page_worker` (#372) for lifecycle
+ audit. Dispatch chain reuse: the misconfig predicate goes through
``_resolve_dispatch_preview`` (the same single-source helper the override
admin tab consults) so the ``is_misconfigured`` flag stays consistent
across the worker, the override tab, and the dispatch-preview banner.

Configuration
=============

``DEEPSYNAPS_CHANNEL_DETECTOR_ENABLED``
    Must equal exactly ``"1"`` to start the worker. Default off so unit
    tests, CI, and local dev runs do not accidentally fire flags.
``DEEPSYNAPS_CHANNEL_DETECTOR_INTERVAL_SEC``
    Tick cadence in seconds. Defaults to 86400 (once per 24h — the
    worker is a nightly scan, not a real-time monitor). Bad values fall
    back to 86400.
``DEEPSYNAPS_CHANNEL_DETECTOR_COOLDOWN_HOURS``
    Re-flag cooldown per (caregiver, clinic) in hours. Defaults to 24.
    Bad values fall back to 24.
``DEEPSYNAPS_CHANNEL_DETECTOR_STALENESS_HOURS``
    A misconfig is only flagged when the caregiver's last successful
    delivery is older than this many hours (or no delivery is recorded
    at all). Defaults to 24. This avoids spurious flags when the
    caregiver's preferred channel briefly hiccups but the digest still
    landed via a fallback adapter within the SLA window.

Audit
=====

Every tick emits ONE row under ``target_type='channel_misconfiguration_detector'``
with ``action='channel_misconfiguration_detector.tick'`` whose note
encodes ``caregivers_scanned=N misconfigs_flagged=M errors=E
elapsed_ms=T``. Per-caregiver flags additionally emit a
``caregiver_portal.channel_misconfigured_detected`` row carrying
``priority=high``, the preferred adapter name, the caregiver_user_id,
the clinic_id, and the hours since last successful delivery so the
admin inbox aggregator can rank + drill-out without a second query.
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
from app.persistence.models import (
    AuditEventRecord,
    CaregiverDigestPreference,
    User,
)


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: "Optional[ChannelMisconfigurationDetectorWorker]" = None
_TICK_JOB_ID = "channel_misconfiguration_detector_worker_tick"


# Surface for the per-tick + page-level audit rows. Distinct from the
# per-caregiver mirror surface ``caregiver_portal`` so the regulator can
# join "scan tick fired" rows to "specific caregiver flagged" rows
# without ambiguity.
WORKER_SURFACE = "channel_misconfiguration_detector"
PORTAL_SURFACE = "caregiver_portal"


# ---------------------------------------------------------------------------
# Status snapshot (in-memory, per-process)
# ---------------------------------------------------------------------------


@dataclass
class TickResult:
    """Result of one :meth:`ChannelMisconfigurationDetectorWorker.tick`."""

    caregivers_scanned: int = 0
    misconfigs_flagged: int = 0
    skipped_cooldown: int = 0
    skipped_no_preference: int = 0
    skipped_adapter_ok: int = 0
    skipped_recent_delivery: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    flagged_caregiver_ids: list[str] = field(default_factory=list)
    flagged_audit_event_ids: list[str] = field(default_factory=list)


@dataclass
class WorkerStatus:
    running: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_caregivers_scanned: int = 0
    last_tick_misconfigs_flagged: int = 0
    last_tick_errors: int = 0
    misconfigs_flagged_last_24h: int = 0
    interval_sec: int = 86400
    cooldown_hours: int = 24
    staleness_hours: int = 24


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
            "channel_misconfiguration_detector worker env var not int; using default",
            extra={"event": "cmd_worker_bad_env", "name": name, "raw": raw},
        )
        return default
    if v < minimum:
        return default
    return v


def env_enabled() -> bool:
    return os.environ.get("DEEPSYNAPS_CHANNEL_DETECTOR_ENABLED", "").strip() == "1"


def env_interval_sec() -> int:
    return _env_int(
        "DEEPSYNAPS_CHANNEL_DETECTOR_INTERVAL_SEC", default=86400, minimum=60
    )


def env_cooldown_hours() -> int:
    return _env_int(
        "DEEPSYNAPS_CHANNEL_DETECTOR_COOLDOWN_HOURS", default=24, minimum=1
    )


def env_staleness_hours() -> int:
    return _env_int(
        "DEEPSYNAPS_CHANNEL_DETECTOR_STALENESS_HOURS", default=24, minimum=1
    )


# ---------------------------------------------------------------------------
# Synthetic actor used for in-process scan
# ---------------------------------------------------------------------------


def _synth_admin_actor(clinic_id: Optional[str]) -> AuthenticatedActor:
    """Synthetic actor representing the worker.

    ``actor_id`` is a stable sentinel so the audit trail attributes every
    flagged row to "the worker" rather than spoofing a real admin.
    """
    return AuthenticatedActor(
        actor_id="channel-misconfiguration-detector-worker",
        display_name="Channel Misconfiguration Detector",
        role="admin",
        package_id="enterprise",
        clinic_id=(clinic_id or "clinic-demo-default"),
        token_id="channel-misconfiguration-detector-worker-internal",
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
        f"caregivers_scanned={result.caregivers_scanned} "
        f"misconfigs_flagged={result.misconfigs_flagged} "
        f"skipped_cooldown={result.skipped_cooldown} "
        f"skipped_no_preference={result.skipped_no_preference} "
        f"skipped_adapter_ok={result.skipped_adapter_ok} "
        f"skipped_recent_delivery={result.skipped_recent_delivery} "
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
            actor_id="channel-misconfiguration-detector-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception("channel_misconfiguration_detector tick audit emit failed")
    return eid


def _emit_misconfig_audit(
    db: Session,
    *,
    caregiver_user_id: str,
    clinic_id: Optional[str],
    preferred_adapter: str,
    preferred_channel: Optional[str],
    hours_since_last_delivery: Optional[float],
) -> str:
    """Emit a ``caregiver_portal.channel_misconfigured_detected`` row.

    Carries the canonical ``priority=high`` marker so the Clinician
    Inbox HIGH-priority predicate (#354) auto-routes this row into the
    admin's inbox feed.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{PORTAL_SURFACE}-channel_misconfigured_detected-{caregiver_user_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    hours_str = (
        f"{hours_since_last_delivery:.1f}"
        if hours_since_last_delivery is not None
        else "unknown"
    )
    note = (
        f"priority=high "
        f"adapter={preferred_adapter} "
        f"channel={preferred_channel or 'null'} "
        f"caregiver_id={caregiver_user_id} "
        f"clinic_id={clinic_id or 'null'} "
        f"hours_since_last_delivery={hours_str}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=caregiver_user_id,
            target_type=PORTAL_SURFACE,
            action=f"{PORTAL_SURFACE}.channel_misconfigured_detected",
            role="admin",
            actor_id="channel-misconfiguration-detector-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception(
            "channel_misconfiguration_detector misconfig audit emit failed"
        )
    return eid


# ---------------------------------------------------------------------------
# Cooldown / freshness helpers
# ---------------------------------------------------------------------------


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        cleaned = s.replace(" ", "+").replace("Z", "+00:00")
        if "T" not in cleaned:
            return datetime.fromisoformat(cleaned + "T00:00:00+00:00")
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _was_flagged_within_cooldown(
    db: Session,
    *,
    caregiver_user_id: str,
    clinic_id: Optional[str],
    cooldown_hours: int,
    now: datetime,
) -> bool:
    """Return True when a misconfig audit row already exists for this
    (caregiver, clinic) newer than ``now - cooldown_hours``.

    Reads ``audit_event_records`` only — no second table to maintain.
    The cooldown predicate matches both target_id (caregiver_user_id) AND
    the canonical action so a different surface emitting the same action
    name still counts.
    """
    cutoff_iso = (now - timedelta(hours=cooldown_hours)).isoformat()
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_id == caregiver_user_id,
            AuditEventRecord.action
            == f"{PORTAL_SURFACE}.channel_misconfigured_detected",
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


def _hours_since_last_delivery(
    db: Session,
    *,
    caregiver_user_id: str,
    pref: CaregiverDigestPreference,
    now: datetime,
) -> Optional[float]:
    """Return the freshest "delivered something to this caregiver" age.

    Looks at:
      * ``CaregiverDigestPreference.last_sent_at`` (set by the digest
        worker only when an adapter actually returned 2xx).
      * Recent ``caregiver_portal.email_digest_sent`` audit rows whose
        target_id is this caregiver.

    Returns the SMALLEST age (most recent delivery) in hours. Returns
    ``None`` when no delivery has ever been observed — the caller treats
    that as "stale enough to flag" (the misconfig is the reason no
    delivery has succeeded).
    """
    candidates: list[datetime] = []
    last_sent = _aware(_parse_iso(getattr(pref, "last_sent_at", None)))
    if last_sent is not None:
        candidates.append(last_sent)
    try:
        recent = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_id == caregiver_user_id,
                AuditEventRecord.action
                == f"{PORTAL_SURFACE}.email_digest_sent",
            )
            .order_by(AuditEventRecord.id.desc())
            .limit(5)
            .all()
        )
    except Exception:  # pragma: no cover - defensive
        recent = []
    for r in recent:
        ts = _aware(_parse_iso(r.created_at))
        if ts is not None:
            candidates.append(ts)
    if not candidates:
        return None
    freshest = max(candidates)
    delta = (now - freshest).total_seconds() / 3600.0
    return max(delta, 0.0)


# ---------------------------------------------------------------------------
# Core worker
# ---------------------------------------------------------------------------


class ChannelMisconfigurationDetectorWorker:
    """Nightly scanner: caregiver preferred channel reachable?

    Use :meth:`tick` to run one scan iteration synchronously (testable
    without the scheduler thread). Use :meth:`start` / :meth:`stop` to
    register / unregister the APScheduler job.
    """

    def __init__(
        self,
        *,
        interval_sec: Optional[int] = None,
        cooldown_hours: Optional[int] = None,
        staleness_hours: Optional[int] = None,
    ) -> None:
        self.interval_sec = interval_sec or env_interval_sec()
        self.cooldown_hours = cooldown_hours or env_cooldown_hours()
        self.staleness_hours = staleness_hours or env_staleness_hours()
        self.status = WorkerStatus(
            interval_sec=self.interval_sec,
            cooldown_hours=self.cooldown_hours,
            staleness_hours=self.staleness_hours,
        )
        self._scheduler = None
        self._lock = threading.Lock()

    # --- Status surface ---------------------------------------------------

    def get_status(self) -> WorkerStatus:
        return self.status

    def get_status_for_clinic(self, db: Session, clinic_id: str) -> dict:
        """Per-clinic status snapshot for the ``GET /status`` endpoint.

        Combines the in-memory worker status with clinic-scoped DB
        counts:
          * caregivers_in_clinic — preference rows whose owner sits in
            ``clinic_id``.
          * misconfigs_flagged_last_24h — count of
            ``caregiver_portal.channel_misconfigured_detected`` rows in
            the last 24h whose note carries ``clinic_id={cid}``.
        """
        try:
            caregivers_in_clinic = (
                db.query(CaregiverDigestPreference)
                .join(User, User.id == CaregiverDigestPreference.caregiver_user_id)
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
                    AuditEventRecord.action
                    == f"{PORTAL_SURFACE}.channel_misconfigured_detected",
                    AuditEventRecord.created_at >= cutoff_iso,
                )
                .all()
            )
            needle = f"clinic_id={clinic_id}"
            flagged_24h = sum(
                1 for r in recent_rows if needle in (r.note or "")
            )
        except Exception:  # pragma: no cover - defensive
            flagged_24h = 0
        return {
            "running": bool(self.status.running),
            "last_tick_at": self.status.last_tick_at,
            "last_error": self.status.last_error,
            "last_error_at": self.status.last_error_at,
            "caregivers_in_clinic": int(caregivers_in_clinic),
            "misconfigs_flagged_last_24h": int(flagged_24h),
            "last_tick_caregivers_scanned": int(
                self.status.last_tick_caregivers_scanned
            ),
            "last_tick_misconfigs_flagged": int(
                self.status.last_tick_misconfigs_flagged
            ),
            "last_tick_errors": int(self.status.last_tick_errors),
            "interval_sec": int(self.interval_sec),
            "cooldown_hours": int(self.cooldown_hours),
            "staleness_hours": int(self.staleness_hours),
        }

    # --- Tick -------------------------------------------------------------

    def tick(
        self, db: Optional[Session] = None, *, only_clinic_id: Optional[str] = None
    ) -> TickResult:
        """Run one scan iteration.

        Parameters
        ----------
        db
            Optional session. When ``None`` the worker opens its own and
            closes it in ``finally``. The status endpoint passes its own
            request-scoped session for the synchronous ``tick-once`` debug
            path so the test client can see the same DB rows it just seeded.
        only_clinic_id
            When provided, only scan caregivers whose owning user sits in
            this clinic. Used by the admin ``tick-once`` debug endpoint
            so a synchronous scan stays bounded to the actor's clinic.
        """
        owns_session = db is None
        if db is None:
            db = SessionLocal()
        result = TickResult()
        started_at = datetime.now(timezone.utc)
        try:
            self._tick_inner(db, result, only_clinic_id=only_clinic_id, now=started_at)
        except Exception as exc:  # pragma: no cover - defensive top-level
            result.errors += 1
            result.last_error = str(exc)
            _log.exception("channel_misconfiguration_detector tick crashed")
        finally:
            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            result.elapsed_ms = int(elapsed * 1000)
            try:
                _emit_tick_audit(db, clinic_id=only_clinic_id, result=result)
            except Exception:  # pragma: no cover - defensive
                _log.exception(
                    "channel_misconfiguration_detector post-tick audit failed"
                )
            self._update_status(result)
            if owns_session:
                try:
                    db.close()
                except Exception:  # pragma: no cover - defensive
                    pass
        return result

    def _tick_inner(
        self,
        db: Session,
        result: TickResult,
        *,
        only_clinic_id: Optional[str] = None,
        now: datetime,
    ) -> None:
        # Reuse the override router's resolution helpers so the
        # is_misconfigured predicate stays single-sourced. Lazy import to
        # avoid a circular dep with the router.
        from app.routers.caregiver_email_digest_router import (  # noqa: PLC0415
            _resolve_dispatch_preview,
        )
        from app.services.oncall_delivery import (  # noqa: PLC0415
            _channel_to_adapter_name,
        )

        # 1) Pull every preference row with a non-null preferred_channel.
        rows = (
            db.query(CaregiverDigestPreference)
            .filter(CaregiverDigestPreference.preferred_channel.isnot(None))
            .all()
        )
        if not rows:
            return

        # Bulk-load owning users so we can scope by clinic and (if
        # requested) skip rows outside ``only_clinic_id``.
        cg_ids = [r.caregiver_user_id for r in rows]
        users = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(cg_ids or [""])).all()
        }

        for pref in rows:
            cg_id = pref.caregiver_user_id
            user = users.get(cg_id)
            clinic_id = getattr(user, "clinic_id", None)

            if only_clinic_id and clinic_id != only_clinic_id:
                continue

            result.caregivers_scanned += 1

            preferred_channel = getattr(pref, "preferred_channel", None)
            if not preferred_channel:
                # NULL preferred_channel can't be misconfigured.
                result.skipped_no_preference += 1
                continue

            preferred_adapter = _channel_to_adapter_name(preferred_channel)
            if not preferred_adapter:
                result.skipped_no_preference += 1
                continue

            # 2) Compute the dispatch-preview to get adapter_available.
            try:
                preview = _resolve_dispatch_preview(
                    db, caregiver_user_id=cg_id, clinic_id=clinic_id
                )
            except Exception as exc:
                result.errors += 1
                result.last_error = f"preview: {exc}"
                continue

            adapter_avail = preview.get("adapter_available") or {}
            if adapter_avail.get(preferred_adapter, False):
                # Adapter is reachable — not a misconfig.
                result.skipped_adapter_ok += 1
                continue

            # 3) Cooldown — don't re-flag the same (caregiver, clinic).
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

            # 4) Staleness — only flag when no successful delivery has
            #    been observed in the last ``staleness_hours``.
            try:
                age_hours = _hours_since_last_delivery(
                    db, caregiver_user_id=cg_id, pref=pref, now=now
                )
            except Exception as exc:  # pragma: no cover - defensive
                result.errors += 1
                result.last_error = f"freshness_check: {exc}"
                continue
            if age_hours is not None and age_hours < self.staleness_hours:
                # Recently delivered via fallback — don't flag.
                result.skipped_recent_delivery += 1
                continue

            # 5) Emit the HIGH-priority audit row.
            try:
                eid = _emit_misconfig_audit(
                    db,
                    caregiver_user_id=cg_id,
                    clinic_id=clinic_id,
                    preferred_adapter=preferred_adapter,
                    preferred_channel=preferred_channel,
                    hours_since_last_delivery=age_hours,
                )
            except Exception as exc:  # pragma: no cover - defensive
                result.errors += 1
                result.last_error = f"emit: {exc}"
                continue
            result.misconfigs_flagged += 1
            result.flagged_caregiver_ids.append(cg_id)
            result.flagged_audit_event_ids.append(eid)

    def _update_status(self, result: TickResult) -> None:
        with self._lock:
            now_iso = datetime.now(timezone.utc).isoformat()
            self.status.last_tick_at = now_iso
            self.status.last_tick_caregivers_scanned = result.caregivers_scanned
            self.status.last_tick_misconfigs_flagged = result.misconfigs_flagged
            self.status.last_tick_errors = result.errors
            # Cheap sliding 24h count — increments per tick. The status
            # endpoint also reads the audit table directly so this in-
            # memory counter is just a fast path for the panel chip.
            self.status.misconfigs_flagged_last_24h = (
                self.status.misconfigs_flagged_last_24h + result.misconfigs_flagged
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
                "channel_misconfiguration_detector worker started",
                extra={
                    "event": "cmd_worker_started",
                    "interval_sec": self.interval_sec,
                    "cooldown_hours": self.cooldown_hours,
                    "staleness_hours": self.staleness_hours,
                },
            )
            return True

    def _scheduled_tick(self) -> None:
        try:
            result = self.tick()
            _log.info(
                "channel_misconfiguration_detector tick complete",
                extra={
                    "event": "cmd_worker_tick",
                    "caregivers_scanned": result.caregivers_scanned,
                    "misconfigs_flagged": result.misconfigs_flagged,
                    "errors": result.errors,
                    "elapsed_ms": result.elapsed_ms,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "channel_misconfiguration_detector scheduled tick crashed",
                extra={
                    "event": "cmd_worker_scheduled_tick_error",
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
                "channel_misconfiguration_detector shutdown raised",
                extra={
                    "event": "cmd_worker_shutdown_error",
                    "error": str(exc),
                },
            )
        _log.info(
            "channel_misconfiguration_detector worker stopped",
            extra={"event": "cmd_worker_stopped"},
        )
        return True


# ---------------------------------------------------------------------------
# Module-level accessors
# ---------------------------------------------------------------------------


def get_worker() -> ChannelMisconfigurationDetectorWorker:
    """Return the singleton :class:`ChannelMisconfigurationDetectorWorker`."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = ChannelMisconfigurationDetectorWorker()
        return _WORKER_INSTANCE


def start_worker_if_enabled() -> Optional[ChannelMisconfigurationDetectorWorker]:
    """FastAPI startup hook. No-op when the env var is not ``"1"``."""
    if not env_enabled():
        _log.info(
            "channel_misconfiguration_detector worker disabled via env",
            extra={"event": "cmd_worker_disabled"},
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
        _log.exception("channel_misconfiguration_detector shutdown raised")


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
    "ChannelMisconfigurationDetectorWorker",
    "TickResult",
    "WorkerStatus",
    "WORKER_SURFACE",
    "PORTAL_SURFACE",
    "env_enabled",
    "env_interval_sec",
    "env_cooldown_hours",
    "env_staleness_hours",
    "get_worker",
    "shutdown_worker",
    "start_worker_if_enabled",
    "_reset_for_tests",
]
