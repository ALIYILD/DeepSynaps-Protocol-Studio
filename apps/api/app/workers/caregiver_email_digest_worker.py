"""Caregiver Email Digest Worker (2026-05-01).

Daily roll-up dispatch of unread caregiver notifications via the
oncall-delivery adapters (#373) in mock mode unless real env vars set.

Mirrors :mod:`app.workers.auto_page_worker` (#372) for lifecycle +
audit. Each tick scans every ``CaregiverDigestPreference`` row with
``enabled=True``, decides whether the current time matches the
frequency window (daily / weekly), and fires the same ``send-now``
in-process implementation a caregiver would trigger from the portal
"Send now" CTA. Default cooldown: 24h per caregiver (the daily
frequency naturally fits this — weekly sends honour 6d 23h to dodge
DST drift).

Configuration
=============

``DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED``
    Must equal exactly ``"1"`` to start the worker. Default off so unit
    tests, CI, and local dev runs do not accidentally fire dispatches.
``DEEPSYNAPS_CAREGIVER_DIGEST_INTERVAL_SEC``
    Tick cadence in seconds. Defaults to 600 (10 min — granular enough
    that a caregiver's 08:00 preference fires within the same hour
    while avoiding adapter-rate-limit churn). Bad values fall back.
``DEEPSYNAPS_CAREGIVER_DIGEST_COOLDOWN_HOURS``
    Re-dispatch cooldown per caregiver in hours. Defaults to 24. Bad
    values fall back.

Audit
=====

Every tick emits ONE row under ``target_type='caregiver_email_digest_worker'``
with ``action='caregiver_email_digest_worker.tick'`` whose note encodes
``caregivers_processed=N digests_sent=M errors=E elapsed_ms=T``. Per-
caregiver dispatches additionally emit a
``caregiver_portal.email_digest_sent`` row (single-sourced with the
manual send-now handler so the regulator transcript stays consistent).
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
    CaregiverDigestPreference,
    User,
)


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: "Optional[CaregiverEmailDigestWorker]" = None
_TICK_JOB_ID = "caregiver_email_digest_worker_tick"


# ---------------------------------------------------------------------------
# Status snapshot (in-memory, per-process)
# ---------------------------------------------------------------------------


@dataclass
class TickResult:
    """Result of one :meth:`CaregiverEmailDigestWorker.tick`."""

    caregivers_processed: int = 0
    digests_sent: int = 0
    skipped_cooldown: int = 0
    skipped_disabled: int = 0
    skipped_consent: int = 0
    skipped_no_unread: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    sent_caregiver_ids: list[str] = field(default_factory=list)


@dataclass
class WorkerStatus:
    running: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_caregivers_processed: int = 0
    last_tick_digests_sent: int = 0
    last_tick_errors: int = 0
    interval_sec: int = 600
    cooldown_hours: int = 24


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
            "caregiver_email_digest worker env var not int; using default",
            extra={"event": "ced_worker_bad_env", "name": name, "raw": raw},
        )
        return default
    if v < minimum:
        return default
    return v


def env_enabled() -> bool:
    return os.environ.get("DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED", "").strip() == "1"


def env_interval_sec() -> int:
    return _env_int(
        "DEEPSYNAPS_CAREGIVER_DIGEST_INTERVAL_SEC", default=600, minimum=10
    )


def env_cooldown_hours() -> int:
    return _env_int(
        "DEEPSYNAPS_CAREGIVER_DIGEST_COOLDOWN_HOURS", default=24, minimum=1
    )


# ---------------------------------------------------------------------------
# Synthetic actor for in-process dispatch
# ---------------------------------------------------------------------------


def _synth_actor_for_caregiver(user: Optional[User], caregiver_user_id: str) -> AuthenticatedActor:
    """Build an ``AuthenticatedActor`` that represents the caregiver the
    worker is dispatching FOR.

    The dispatch path expects an actor whose ``actor_id`` matches the
    caregiver target — that's how the preview + send-now helpers scope
    every read/write to the right user's notifications.
    """
    return AuthenticatedActor(
        actor_id=caregiver_user_id,
        display_name=(getattr(user, "display_name", None) or caregiver_user_id),
        role=(getattr(user, "role", None) or "clinician"),
        package_id=(getattr(user, "package_id", None) or "clinician_pro"),
        clinic_id=(getattr(user, "clinic_id", None) or "clinic-demo-default"),
        token_id=f"caregiver-digest-worker-{caregiver_user_id}",
    )


# ---------------------------------------------------------------------------
# Audit hook
# ---------------------------------------------------------------------------


WORKER_SURFACE = "caregiver_email_digest_worker"


def _emit_tick_audit(db: Session, *, result: TickResult) -> str:
    """Emit ONE per-tick audit row under
    ``target_type='caregiver_email_digest_worker'``.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-tick-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note = (
        f"caregivers_processed={result.caregivers_processed} "
        f"digests_sent={result.digests_sent} "
        f"skipped_cooldown={result.skipped_cooldown} "
        f"skipped_disabled={result.skipped_disabled} "
        f"skipped_consent={result.skipped_consent} "
        f"skipped_no_unread={result.skipped_no_unread} "
        f"errors={result.errors} "
        f"elapsed_ms={result.elapsed_ms}"
    )
    if result.last_error:
        note += f"; last_error={result.last_error[:200]}"
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id="all",
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.tick",
            role="admin",
            actor_id="caregiver-email-digest-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block worker
        _log.exception("caregiver_email_digest worker tick audit emit failed")
    return eid


# ---------------------------------------------------------------------------
# Frequency / cooldown
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


def _due_for_dispatch(
    pref: CaregiverDigestPreference,
    *,
    now: datetime,
    cooldown_hours: int,
) -> bool:
    """Return True when the current time is past the per-caregiver
    cooldown AND falls within the frequency window.

    For daily frequency the cooldown alone is the gate (24h since last
    send). For weekly frequency we still respect the cooldown but
    require ~7d since the last send (cooldown_hours * 7) so a daily-
    cadence tick doesn't fire weekly preferences too eagerly.
    """
    last = _aware(_parse_iso(pref.last_sent_at))
    if last is None:
        return True
    minutes_since = (now - last).total_seconds() / 60.0
    if pref.frequency == "weekly":
        # Weekly: 7 days minus 1h slack to dodge DST drift.
        threshold_min = (cooldown_hours * 24 * 7) - 60
    else:
        threshold_min = (cooldown_hours * 60) - 60
    return minutes_since >= max(threshold_min, 60)


# ---------------------------------------------------------------------------
# Core worker
# ---------------------------------------------------------------------------


class CaregiverEmailDigestWorker:
    """Scan caregiver preferences and dispatch daily digests.

    Use :meth:`tick` to run one scan iteration synchronously (testable
    without the scheduler thread). Use :meth:`start` / :meth:`stop` to
    register / unregister the APScheduler job.
    """

    def __init__(
        self,
        *,
        interval_sec: Optional[int] = None,
        cooldown_hours: Optional[int] = None,
    ) -> None:
        self.interval_sec = interval_sec or env_interval_sec()
        self.cooldown_hours = cooldown_hours or env_cooldown_hours()
        self.status = WorkerStatus(
            interval_sec=self.interval_sec,
            cooldown_hours=self.cooldown_hours,
        )
        self._scheduler = None
        self._lock = threading.Lock()

    # --- Status surface ---------------------------------------------------

    def get_status(self) -> WorkerStatus:
        return self.status

    # --- Tick -------------------------------------------------------------

    def tick(self, db: Optional[Session] = None) -> TickResult:
        """Run one scan iteration.

        Opens its own session when ``db`` is None and closes it in
        ``finally``. The optional ``db`` is for tests that want to
        inspect the same session the worker writes to.
        """
        owns_session = db is None
        if db is None:
            db = SessionLocal()
        result = TickResult()
        started_at = datetime.now(timezone.utc)
        try:
            self._tick_inner(db, result, now=started_at)
        except Exception as exc:  # pragma: no cover — defensive top-level
            result.errors += 1
            result.last_error = str(exc)
            _log.exception("caregiver_email_digest worker tick crashed")
        finally:
            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            result.elapsed_ms = int(elapsed * 1000)
            try:
                _emit_tick_audit(db, result=result)
            except Exception:  # pragma: no cover — defensive
                _log.exception("caregiver_email_digest post-tick audit emit failed")
            self._update_status(result)
            if owns_session:
                try:
                    db.close()
                except Exception:  # pragma: no cover — defensive
                    pass
        return result

    def _tick_inner(
        self,
        db: Session,
        result: TickResult,
        *,
        now: datetime,
    ) -> None:
        # 1) Pull every preference row that opted in.
        rows = (
            db.query(CaregiverDigestPreference)
            .filter(CaregiverDigestPreference.enabled.is_(True))
            .all()
        )
        if not rows:
            return

        from app.routers.caregiver_email_digest_router import (  # noqa: PLC0415
            _build_preview_for_actor,
            _has_digest_consent_grant,
        )
        from app.services.oncall_delivery import (  # noqa: PLC0415
            PageMessage,
            build_default_service,
            build_email_digest_service,
            is_mock_mode_enabled,
        )

        for pref in rows:
            cg_id = pref.caregiver_user_id
            result.caregivers_processed += 1

            if not pref.enabled:
                result.skipped_disabled += 1
                continue
            try:
                if not _due_for_dispatch(
                    pref, now=now, cooldown_hours=self.cooldown_hours
                ):
                    result.skipped_cooldown += 1
                    continue
            except Exception as exc:  # pragma: no cover — defensive
                result.errors += 1
                result.last_error = f"due_check: {exc}"
                continue

            # Resolve the caregiver's User row and a synthetic actor for
            # the dispatch path.
            try:
                user_row = db.query(User).filter_by(id=cg_id).first()
            except Exception:
                user_row = None
            actor = _synth_actor_for_caregiver(user_row, cg_id)

            # Consent gate — single-sourced with the send-now handler.
            try:
                grant = _has_digest_consent_grant(db, cg_id)
            except Exception as exc:
                result.errors += 1
                result.last_error = f"consent_check: {exc}"
                continue
            if grant is None:
                result.skipped_consent += 1
                continue

            # Build the preview using the same join the in-app feed uses.
            try:
                pv = _build_preview_for_actor(db, actor)
            except Exception as exc:
                result.errors += 1
                result.last_error = f"preview: {exc}"
                continue
            unread_count = pv["unread_count"]
            if unread_count == 0:
                result.skipped_no_unread += 1
                continue

            # Hand to the on-call delivery service. Mock-mode short-
            # circuits to a synthetic ``"sent"`` so reviewers can see the
            # full pipeline without a real adapter.
            recipient_email = (getattr(user_row, "email", None) or "") or None
            recipient_name = (
                getattr(user_row, "display_name", None) or cg_id
            )
            body = (
                f"[Caregiver Digest] {unread_count} unread notification"
                f"{'s' if unread_count != 1 else ''} for "
                f"{recipient_name or 'caregiver'}. "
                f"Top: {(pv['items'][0]['summary'] if pv['items'] else '-')[:120]}"
            )
            message = PageMessage(
                clinic_id="caregiver-digest",
                surface="caregiver_email_digest",
                audit_event_id=f"caregiver-digest-worker-{cg_id}",
                body=body,
                severity="low",
                recipient_display_name=recipient_name,
                recipient_email=recipient_email,
                recipient_phone=None,
            )
            try:
                # Prefer the email-channel chain (SendGrid first when
                # SENDGRID_API_KEY + SENDGRID_FROM_ADDRESS are set). If
                # the email chain has zero enabled adapters AND mock-mode
                # is off, fall back to the loud-signal default chain so
                # the audit transcript still records ``queued`` honestly
                # rather than silently dropping the dispatch on the
                # floor.
                service = build_email_digest_service()
                if (
                    not service.get_enabled_adapters()
                    and not is_mock_mode_enabled()
                ):
                    service = build_default_service(clinic_id=None)
                dispatch = service.send(message)
            except Exception as exc:  # pragma: no cover — defensive
                result.errors += 1
                result.last_error = f"dispatch: {exc.__class__.__name__}"
                continue

            delivery_status = dispatch.status
            adapter_name = dispatch.adapter
            external_id = dispatch.external_id
            delivery_note = (dispatch.note or "")[:240]

            # Stamp last_sent_at + emit the per-caregiver audit row even
            # when the dispatch fell back to ``queued`` (no adapters
            # enabled and no mock) — the audit row records intent. We
            # only update last_sent_at on a confirmed ``sent`` so a
            # transient adapter outage self-heals on the next tick.
            try:
                self._emit_per_caregiver_audit(
                    db,
                    actor=actor,
                    unread_count=unread_count,
                    delivery_status=delivery_status,
                    adapter_name=adapter_name,
                    external_id=external_id,
                    grant_id=grant.id,
                    delivery_note=delivery_note,
                    recipient_email=recipient_email,
                )
            except Exception as exc:  # pragma: no cover — defensive
                result.errors += 1
                result.last_error = f"per_caregiver_audit: {exc}"

            if delivery_status == "sent":
                pref.last_sent_at = datetime.now(timezone.utc).isoformat()
                pref.updated_at = pref.last_sent_at
                try:
                    db.commit()
                except Exception:  # pragma: no cover — defensive
                    db.rollback()
                    result.errors += 1
                    result.last_error = "commit_last_sent_at"
                    continue
                result.digests_sent += 1
                result.sent_caregiver_ids.append(cg_id)

    def _emit_per_caregiver_audit(
        self,
        db: Session,
        *,
        actor: AuthenticatedActor,
        unread_count: int,
        delivery_status: str,
        adapter_name: Optional[str],
        external_id: Optional[str],
        grant_id: str,
        delivery_note: str,
        recipient_email: Optional[str],
    ) -> str:
        """Emit a ``caregiver_portal.email_digest_sent`` row attributed
        to the worker. Single-sourced with the manual send-now handler.
        """
        from app.repositories.audit import create_audit_event  # noqa: PLC0415

        now = datetime.now(timezone.utc)
        eid = (
            f"caregiver_portal-email_digest_sent-{actor.actor_id}-"
            f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        note = (
            f"unread={unread_count}; recipient={recipient_email or '-'}; "
            f"delivery_status={delivery_status}; "
            f"adapter={adapter_name or '-'}; "
            f"external_id={external_id or '-'}; "
            f"grant_id={grant_id}; "
            f"delivery_note={delivery_note[:160]}; "
            f"trigger=worker"
        )
        try:
            create_audit_event(
                db,
                event_id=eid,
                target_id=actor.actor_id,
                target_type="caregiver_portal",
                action="caregiver_portal.email_digest_sent",
                role="admin",
                actor_id="caregiver-email-digest-worker",
                note=note[:1024],
                created_at=now.isoformat(),
            )
        except Exception:  # pragma: no cover — audit must never block worker
            _log.exception("caregiver_email_digest per-caregiver audit failed")
        return eid

    def _update_status(self, result: TickResult) -> None:
        with self._lock:
            now_iso = datetime.now(timezone.utc).isoformat()
            self.status.last_tick_at = now_iso
            self.status.last_tick_caregivers_processed = result.caregivers_processed
            self.status.last_tick_digests_sent = result.digests_sent
            self.status.last_tick_errors = result.errors
            if result.errors:
                self.status.last_error = result.last_error
                self.status.last_error_at = now_iso

    # --- Lifecycle --------------------------------------------------------

    def start(self) -> bool:
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
                "caregiver_email_digest worker started",
                extra={
                    "event": "ced_worker_started",
                    "interval_sec": self.interval_sec,
                    "cooldown_hours": self.cooldown_hours,
                },
            )
            return True

    def _scheduled_tick(self) -> None:
        try:
            result = self.tick()
            _log.info(
                "caregiver_email_digest worker tick complete",
                extra={
                    "event": "ced_worker_tick",
                    "caregivers_processed": result.caregivers_processed,
                    "digests_sent": result.digests_sent,
                    "errors": result.errors,
                    "elapsed_ms": result.elapsed_ms,
                },
            )
        except Exception as exc:  # pragma: no cover — defensive
            _log.warning(
                "caregiver_email_digest worker scheduled tick crashed",
                extra={"event": "ced_worker_scheduled_tick_error", "error": str(exc)},
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
        except Exception as exc:  # pragma: no cover — defensive
            _log.warning(
                "caregiver_email_digest worker shutdown raised",
                extra={"event": "ced_worker_shutdown_error", "error": str(exc)},
            )
        _log.info(
            "caregiver_email_digest worker stopped",
            extra={"event": "ced_worker_stopped"},
        )
        return True


# ---------------------------------------------------------------------------
# Module-level accessors
# ---------------------------------------------------------------------------


def get_worker() -> CaregiverEmailDigestWorker:
    """Return the singleton :class:`CaregiverEmailDigestWorker`."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = CaregiverEmailDigestWorker()
        return _WORKER_INSTANCE


def start_worker_if_enabled() -> Optional[CaregiverEmailDigestWorker]:
    """FastAPI startup hook. No-op when the env var is not ``"1"``."""
    if not env_enabled():
        _log.info(
            "caregiver_email_digest worker disabled via env",
            extra={"event": "ced_worker_disabled"},
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
    except Exception:  # pragma: no cover — defensive
        _log.exception("caregiver_email_digest worker shutdown raised")


def _reset_for_tests() -> None:
    """Test helper — fully tear down + drop the singleton reference."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        worker = _WORKER_INSTANCE
        _WORKER_INSTANCE = None
    if worker is not None:
        try:
            worker.stop()
        except Exception:  # pragma: no cover — defensive
            pass


__all__ = [
    "CaregiverEmailDigestWorker",
    "TickResult",
    "WorkerStatus",
    "env_enabled",
    "env_interval_sec",
    "env_cooldown_hours",
    "get_worker",
    "shutdown_worker",
    "start_worker_if_enabled",
    "_reset_for_tests",
    "WORKER_SURFACE",
]
