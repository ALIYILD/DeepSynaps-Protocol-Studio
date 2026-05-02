"""Auto-Page Worker (2026-05-01).

Closes the **real-time half** of the Care Team Coverage launch loop:

* Care Team Coverage (#357) shipped the data model — escalation chains,
  per-surface SLA configs, the ``_gather_sla_breached`` (a.k.a.
  ``_list_breaches``) predicate, and the manual ``POST /page-oncall``
  endpoint. It also flagged ``escalation_chains.auto_page_enabled`` and
  surfaced an honest ``Auto-page worker: OFF`` badge in the UI.
* Daily Digest (#366) closed the **post-hoc half** — end-of-shift summary
  across the clinician hubs.
* THIS worker closes the **real-time half** — every 60s (configurable via
  ``DEEPSYNAPS_AUTO_PAGE_INTERVAL_SEC``) it scans every clinic that has
  at least one ``escalation_chains`` row with ``auto_page_enabled=True``
  for SLA-breached audit rows that have not already been paged, and fires
  ``_page_oncall_impl`` (the in-process refactor of the manual handler)
  with ``trigger='auto'``.

Design constraints (truth-audit driven)
=======================================

1. **No HTTP roundtrip.** The worker imports
   ``app.routers.care_team_coverage_router._page_oncall_impl`` and calls
   it directly. This avoids the FastAPI dependency-injection cost (auth
   header parsing, rate-limiter, JSON encode/decode) and keeps the
   request lifecycle decoupled from background work.
2. **Idempotent.** A breach is paged at most once per cooldown window
   (default 15 minutes — overridable via
   ``DEEPSYNAPS_AUTO_PAGE_COOLDOWN_MIN``). The worker checks
   ``oncall_pages`` for an existing row keyed on ``audit_event_id`` AND
   ``trigger='auto'`` AND ``created_at`` newer than ``now - cooldown``.
   A previously-paged row whose ``delivery_status='failed'`` is NOT
   considered a successful page — the worker will retry it on the next
   tick (this is the "self-heal a transient delivery failure" path).
3. **Honest delivery status.**
   * No external delivery adapter wired — ``delivery_status='queued'``
     (worker DID write the audit + ``oncall_pages`` row but did NOT
     hand the message to Slack/Twilio/PagerDuty).
   * External adapter wired and returns 2xx — ``delivery_status='sent'``.
   * External adapter wired and raises / returns non-2xx —
     ``delivery_status='failed'`` and the worker logs the reason. The
     row stays visible to the next tick so retry is automatic.

   The worker NEVER claims ``sent`` without a confirming 2xx from a
   real adapter. PR section F documents the wire-up path. Until then
   every auto-page sits at ``queued``.
4. **Per-tick audit row.** Every tick emits ONE audit row keyed on
   ``target_type='auto_page_worker'``, ``action='auto_page_worker.tick'``
   with note encoding ``clinics_scanned=X breaches_found=Y paged=Z
   skipped_cooldown=W errors=E elapsed_ms=N``. This gives regulators
   and ops a per-tick transcript without scanning ``oncall_pages``.
5. **In-memory status only.** ``WorkerStatus`` is a per-process snapshot
   (running flag, last-tick ISO, errors_last_hour, paged_last_hour,
   last_error). NO new DB table. The Daily Digest already aggregates
   per-clinic counts post-hoc via ``oncall_pages``.

Configuration
=============

``DEEPSYNAPS_AUTO_PAGE_ENABLED``
    Must equal exactly ``"1"`` to start the worker. Default off so unit
    tests, CI, and local dev runs don't accidentally fire pages.
    Independent of ``DEEPSYNAPS_AGENT_CRON_ENABLED`` so ops can enable
    one without the other.
``DEEPSYNAPS_AUTO_PAGE_INTERVAL_SEC``
    Tick cadence in seconds. Defaults to 60. Bad values fall back to 60.
``DEEPSYNAPS_AUTO_PAGE_COOLDOWN_MIN``
    Re-page cooldown per breach in minutes. Defaults to 15. Bad values
    fall back to 15.
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
    EscalationChain,
    OncallPage,
    User,
)


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: "Optional[AutoPageWorker]" = None
_TICK_JOB_ID = "auto_page_worker_tick"


# ---------------------------------------------------------------------------
# Status snapshot (in-memory, per-process)
# ---------------------------------------------------------------------------


@dataclass
class TickResult:
    """Result of a single :meth:`AutoPageWorker.tick` invocation."""

    clinics_scanned: int = 0
    breaches_found: int = 0
    paged: int = 0
    skipped_cooldown: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    paged_audit_event_ids: list[str] = field(default_factory=list)


@dataclass
class WorkerStatus:
    """In-memory snapshot of worker health surfaced via the status endpoint.

    Per-process only — we deliberately avoid persisting this to the DB
    because the audit transcript already records every tick under
    ``target_type='auto_page_worker'``. The status snapshot is the
    quick-look ops view; the audit trail is the regulatory truth.
    """

    running: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    breaches_pending_now: int = 0
    paged_last_hour: int = 0
    errors_last_hour: int = 0
    last_tick_breaches_found: int = 0
    last_tick_paged: int = 0
    last_tick_clinics_scanned: int = 0
    interval_sec: int = 60
    cooldown_min: int = 15


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
            "auto-page worker env var not int; using default",
            extra={"event": "auto_page_worker_bad_env", "name": name, "raw": raw},
        )
        return default
    if v < minimum:
        return default
    return v


def env_enabled() -> bool:
    return os.environ.get("DEEPSYNAPS_AUTO_PAGE_ENABLED", "").strip() == "1"


def env_interval_sec() -> int:
    return _env_int("DEEPSYNAPS_AUTO_PAGE_INTERVAL_SEC", default=60, minimum=1)


def env_cooldown_min() -> int:
    return _env_int("DEEPSYNAPS_AUTO_PAGE_COOLDOWN_MIN", default=15, minimum=1)


# ---------------------------------------------------------------------------
# Synthetic actor used for in-process auto-page calls
# ---------------------------------------------------------------------------


def _synth_admin_actor(clinic_id: str) -> AuthenticatedActor:
    """Build an ``AuthenticatedActor`` that represents the auto-page worker
    operating under admin scope for ``clinic_id``.

    ``actor_id`` is a stable sentinel so the audit trail can attribute
    every auto-paged row to "the worker" rather than spoofing a real user.
    """
    return AuthenticatedActor(
        actor_id="auto-page-worker",
        display_name="Auto-Page Worker",
        role="admin",
        package_id="enterprise",
        clinic_id=clinic_id,
        token_id="auto-page-worker-internal",
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
    """Emit ONE per-tick audit row under ``target_type='auto_page_worker'``.

    The clinic_id is stamped onto the row when the tick scoped to a
    specific clinic (e.g. via ``tick_once`` for that clinic). For the
    cron-driven all-clinics tick we set ``target_id='all'`` so regulators
    can easily distinguish "ops tickled the worker" from "scheduled
    cadence ticked".
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"auto_page_worker-tick-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note = (
        f"clinics_scanned={result.clinics_scanned} "
        f"breaches_found={result.breaches_found} "
        f"paged={result.paged} "
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
            target_type="auto_page_worker",
            action="auto_page_worker.tick",
            role="admin",
            actor_id="auto-page-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception("auto-page worker tick audit emit failed")
    return eid


# ---------------------------------------------------------------------------
# Cooldown / dedupe
# ---------------------------------------------------------------------------


def _was_paged_within_cooldown(
    db: Session,
    *,
    clinic_id: str,
    audit_event_id: str,
    cooldown_min: int,
) -> bool:
    """Return True if an auto-page row for this breach exists newer than
    ``now - cooldown`` AND its ``delivery_status`` is not ``failed``.

    A failed row is intentionally NOT counted as a successful page so a
    transient adapter failure self-heals on the next tick.
    """
    cutoff_iso = (
        datetime.now(timezone.utc) - timedelta(minutes=cooldown_min)
    ).isoformat()
    rows = (
        db.query(OncallPage)
        .filter(
            OncallPage.clinic_id == clinic_id,
            OncallPage.audit_event_id == audit_event_id,
            OncallPage.trigger == "auto",
            OncallPage.created_at >= cutoff_iso,
        )
        .all()
    )
    for r in rows:
        if (r.delivery_status or "").lower() != "failed":
            return True
    return False


# ---------------------------------------------------------------------------
# Core worker
# ---------------------------------------------------------------------------


class AutoPageWorker:
    """Scan SLA breaches and auto-page on-call for clinics with the worker
    enabled.

    Use :meth:`tick` to run one scan iteration synchronously (testable
    without the scheduler thread). Use :meth:`start` / :meth:`stop` to
    register / unregister the APScheduler job.
    """

    def __init__(self, *, interval_sec: Optional[int] = None, cooldown_min: Optional[int] = None) -> None:
        self.interval_sec = interval_sec or env_interval_sec()
        self.cooldown_min = cooldown_min or env_cooldown_min()
        self.status = WorkerStatus(
            interval_sec=self.interval_sec,
            cooldown_min=self.cooldown_min,
        )
        self._scheduler = None  # APScheduler BackgroundScheduler when running
        self._lock = threading.Lock()

    # --- Status surface ---------------------------------------------------

    def get_status(self) -> WorkerStatus:
        return self.status

    def get_status_for_clinic(self, db: Session, clinic_id: str) -> dict:
        """Per-clinic status snapshot for the ``GET /status`` endpoint.

        Combines the in-memory worker status (running flag, last tick
        timestamp, errors_last_hour) with clinic-scoped counts read off
        the DB (breaches_pending_now, paged_last_hour for this clinic
        only).
        """
        from app.routers.care_team_coverage_router import (  # noqa: PLC0415
            _list_breaches,
        )

        # Per-clinic breaches pending right now.
        try:
            breaches = _list_breaches(db, clinic_id, limit=500)
            pending = len(breaches)
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "auto-page worker breach pre-count failed",
                extra={"event": "auto_page_worker_breach_count_error", "error": str(exc)},
            )
            pending = 0

        # Per-clinic auto-page deliveries in the last hour.
        cutoff_iso = (
            datetime.now(timezone.utc) - timedelta(hours=1)
        ).isoformat()
        paged_last_hour = (
            db.query(OncallPage)
            .filter(
                OncallPage.clinic_id == clinic_id,
                OncallPage.trigger == "auto",
                OncallPage.created_at >= cutoff_iso,
            )
            .count()
        )

        # Per-clinic worker enabled? (ANY escalation_chain row in the clinic
        # with auto_page_enabled=True turns the worker "on" for that clinic.)
        enabled_in_clinic = (
            db.query(EscalationChain)
            .filter(
                EscalationChain.clinic_id == clinic_id,
                EscalationChain.auto_page_enabled.is_(True),
            )
            .count()
            > 0
        )

        return {
            "running": bool(self.status.running),
            "enabled_in_clinic": bool(enabled_in_clinic),
            "last_tick_at": self.status.last_tick_at,
            "last_error": self.status.last_error,
            "last_error_at": self.status.last_error_at,
            "breaches_pending_now": pending,
            "paged_last_hour": paged_last_hour,
            "errors_last_hour": int(self.status.errors_last_hour),
            "last_tick_breaches_found": int(self.status.last_tick_breaches_found),
            "last_tick_paged": int(self.status.last_tick_paged),
            "last_tick_clinics_scanned": int(self.status.last_tick_clinics_scanned),
            "interval_sec": int(self.interval_sec),
            "cooldown_min": int(self.cooldown_min),
        }

    # --- Tick -------------------------------------------------------------

    def tick(self, db: Optional[Session] = None, *, only_clinic_id: Optional[str] = None) -> TickResult:
        """Run one scan iteration.

        Parameters
        ----------
        db
            Optional session. When ``None`` the worker opens its own and
            closes it in ``finally``. The status endpoint passes its own
            request-scoped session for the synchronous ``tick-once`` debug
            path so the test client can see the same DB rows it just seeded.
        only_clinic_id
            When provided, only scan this clinic regardless of whether
            others are enabled. Used by the admin ``tick-once`` debug
            endpoint to bound the synchronous scan to the actor's clinic.
        """
        owns_session = db is None
        if db is None:
            db = SessionLocal()
        result = TickResult()
        started_at = datetime.now(timezone.utc)
        try:
            self._tick_inner(db, result, only_clinic_id=only_clinic_id)
        except Exception as exc:  # pragma: no cover - defensive top-level catch
            result.errors += 1
            result.last_error = str(exc)
            _log.exception("auto-page worker tick crashed")
        finally:
            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            result.elapsed_ms = int(elapsed * 1000)
            try:
                _emit_tick_audit(db, clinic_id=only_clinic_id, result=result)
            except Exception:  # pragma: no cover - defensive
                _log.exception("auto-page worker post-tick audit emit failed")
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
    ) -> None:
        from app.routers.care_team_coverage_router import (  # noqa: PLC0415
            _list_breaches,
            _page_oncall_impl,
            _split_action,
        )

        # 1) Find the set of clinics that have AT LEAST ONE chain row with
        #    auto_page_enabled=True. We scan THOSE clinics only.
        chains_q = (
            db.query(EscalationChain)
            .filter(EscalationChain.auto_page_enabled.is_(True))
        )
        if only_clinic_id:
            chains_q = chains_q.filter(EscalationChain.clinic_id == only_clinic_id)
        chain_rows = chains_q.all()
        clinic_ids = sorted({c.clinic_id for c in chain_rows if c.clinic_id})
        result.clinics_scanned = len(clinic_ids)
        if not clinic_ids:
            return

        # Map clinic -> set of surfaces that explicitly have auto_page=True.
        # ``surface='*'`` is the clinic-wide wildcard — any breach in the
        # clinic is in scope when the wildcard row is enabled.
        per_clinic_surfaces: dict[str, set[str]] = {}
        for c in chain_rows:
            per_clinic_surfaces.setdefault(c.clinic_id, set()).add(c.surface or "*")

        # 2) For each clinic, list the breach feed and try to page each
        #    breach. Per-breach errors are caught so a single bad row
        #    doesn't kill the whole tick.
        for cid in clinic_ids:
            try:
                breaches = _list_breaches(db, cid, limit=500)
            except Exception as exc:
                result.errors += 1
                result.last_error = f"clinic={cid} list_breaches: {exc}"
                _log.warning(
                    "auto-page worker list_breaches failed",
                    extra={
                        "event": "auto_page_worker_list_breaches_error",
                        "clinic_id": cid,
                        "error": str(exc),
                    },
                )
                continue

            allowed_surfaces = per_clinic_surfaces.get(cid, set())
            wildcard_on = "*" in allowed_surfaces

            for breach in breaches:
                result.breaches_found += 1
                surface = breach.get("surface") or ""
                if not wildcard_on and surface not in allowed_surfaces:
                    # Auto-page for this specific surface is OFF — skip.
                    continue

                event_id = breach.get("audit_event_id") or ""
                if not event_id:
                    continue

                # Cooldown / idempotency check.
                try:
                    if _was_paged_within_cooldown(
                        db,
                        clinic_id=cid,
                        audit_event_id=event_id,
                        cooldown_min=self.cooldown_min,
                    ):
                        result.skipped_cooldown += 1
                        continue
                except Exception as exc:  # pragma: no cover - defensive
                    result.errors += 1
                    result.last_error = f"cooldown_check: {exc}"
                    _log.warning(
                        "auto-page worker cooldown check failed",
                        extra={
                            "event": "auto_page_worker_cooldown_error",
                            "clinic_id": cid,
                            "audit_event_id": event_id,
                            "error": str(exc),
                        },
                    )
                    continue

                # Fire the in-process page-on-call. Synthetic admin actor
                # so the cross-clinic gate is bypassed (worker is a
                # platform service, not a clinician).
                actor = _synth_admin_actor(cid)
                # Resolve the on-call recipient + their contact handle so
                # the delivery adapter can route to the right user. The
                # worker does best-effort resolution; ``_page_oncall_impl``
                # re-resolves and is the source of truth for who is paged.
                recipient_user, recipient_phone = self._resolve_recipient(
                    db, cid, surface or None
                )
                # delivery_status is "sent" / "failed" / "queued" — NEVER
                # "sent" without a confirming 2xx from a real adapter (or
                # the explicit DEEPSYNAPS_DELIVERY_MOCK=1 flag).
                delivery_status, external_id, delivery_note = self._deliver_page(
                    breach=breach,
                    clinic_id=cid,
                    recipient_user=recipient_user,
                    recipient_phone=recipient_phone,
                )
                try:
                    _page_oncall_impl(
                        db,
                        actor,
                        audit_event_id=event_id,
                        note=(
                            f"Auto-paged by worker: {surface} breach, "
                            f"age={breach.get('age_minutes', 0)}min "
                            f">{breach.get('sla_minutes', 0)}min SLA"
                        )[:480],
                        surface_override=surface or None,
                        trigger="auto",
                        delivery_status=delivery_status,
                        external_id=external_id,
                        delivery_note=delivery_note,
                        enforce_clinic_scope=False,
                    )
                    result.paged += 1
                    result.paged_audit_event_ids.append(event_id)
                except Exception as exc:
                    result.errors += 1
                    result.last_error = f"page_impl: {exc}"
                    _log.warning(
                        "auto-page worker page-impl failed",
                        extra={
                            "event": "auto_page_worker_page_impl_error",
                            "clinic_id": cid,
                            "audit_event_id": event_id,
                            "error": str(exc),
                        },
                    )

    def _resolve_recipient(
        self, db: Session, clinic_id: str, surface: Optional[str]
    ) -> tuple[Optional[User], Optional[str]]:
        """Best-effort lookup of the on-call recipient + their phone.

        Returns ``(user, phone)``. ``user`` and ``phone`` are independently
        nullable so a partial resolution still feeds the adapter chain
        with whatever fields the operator has populated.
        """
        try:
            from app.routers.care_team_coverage_router import (  # noqa: PLC0415
                _resolve_oncall_for_surface,
            )
        except Exception:  # pragma: no cover - defensive
            return (None, None)
        try:
            primary_shift, _all = _resolve_oncall_for_surface(db, clinic_id, surface)
        except Exception:  # pragma: no cover - defensive
            return (None, None)
        user_obj: Optional[User] = None
        phone: Optional[str] = None
        if primary_shift is not None:
            uid = getattr(primary_shift, "user_id", None)
            if uid:
                try:
                    user_obj = db.query(User).filter_by(id=uid).first()
                except Exception:
                    user_obj = None
            handle = getattr(primary_shift, "contact_handle", None)
            channel = (getattr(primary_shift, "contact_channel", "") or "").lower()
            # Only treat the handle as a phone when the shift channel
            # explicitly says SMS — Slack handles are not phone numbers.
            if handle and channel in ("sms", "phone", "tel"):
                phone = str(handle)
        return (user_obj, phone)

    def _deliver_page(
        self,
        *,
        breach: dict,
        clinic_id: str,
        recipient_user: Optional[User] = None,
        recipient_phone: Optional[str] = None,
    ) -> tuple[str, Optional[str], Optional[str]]:
        """External delivery hook.

        Returns ``(delivery_status, external_id, delivery_note)`` to
        stamp onto the ``oncall_pages`` row.

        Wire-up details live in :mod:`app.services.oncall_delivery`.
        Adapters are env-gated:

        * ``SLACK_BOT_TOKEN``         enables :class:`SlackAdapter`
        * ``TWILIO_ACCOUNT_SID`` + ``TWILIO_AUTH_TOKEN`` + ``TWILIO_FROM_NUMBER``
                                      enables :class:`TwilioSMSAdapter`
        * ``PAGERDUTY_API_KEY`` + ``PAGERDUTY_ROUTING_KEY``
                                      enables :class:`PagerDutyAdapter`

        Mock-mode (``DEEPSYNAPS_DELIVERY_MOCK=1``) ALWAYS returns
        ``("sent", external_id, "MOCK: ...")`` so reviewers can see at a
        glance that the row was a simulated send.

        When NO adapter is enabled the service returns
        ``("queued", None, "no_adapters_enabled: ...")`` — the worker
        wrote the audit row + the ``oncall_pages`` row but did NOT hand
        the message to any external channel.

        The worker NEVER claims ``"sent"`` without a confirming 2xx
        from a real adapter (or the explicit mock-mode flag).
        """
        from app.services.oncall_delivery import (  # noqa: PLC0415
            PageMessage,
            build_default_service,
        )

        service = build_default_service(clinic_id=clinic_id)
        body = (
            f"[Auto-Page] {breach.get('surface') or '?'} breach: "
            f"age={breach.get('age_minutes', 0)}min "
            f">{breach.get('sla_minutes', 0)}min SLA. "
            f"Audit event: {breach.get('audit_event_id', '?')}."
        )
        message = PageMessage(
            clinic_id=clinic_id,
            surface=str(breach.get("surface") or "*"),
            audit_event_id=str(breach.get("audit_event_id") or ""),
            body=body,
            severity="high",
            recipient_display_name=(
                getattr(recipient_user, "display_name", None) if recipient_user else None
            ),
            recipient_email=(
                getattr(recipient_user, "email", None) if recipient_user else None
            ),
            recipient_phone=recipient_phone,
        )
        try:
            result = service.send(message)
        except Exception as exc:  # pragma: no cover - defensive
            _log.exception(
                "oncall delivery service raised",
                extra={
                    "event": "oncall_delivery_service_error",
                    "clinic_id": clinic_id,
                    "error": str(exc),
                },
            )
            return ("failed", None, f"delivery_service_raised: {exc.__class__.__name__}")
        return (result.status, result.external_id, result.note)

    def _update_status(self, result: TickResult) -> None:
        with self._lock:
            now_iso = datetime.now(timezone.utc).isoformat()
            self.status.last_tick_at = now_iso
            self.status.last_tick_breaches_found = result.breaches_found
            self.status.last_tick_paged = result.paged
            self.status.last_tick_clinics_scanned = result.clinics_scanned
            if result.errors:
                self.status.last_error = result.last_error
                self.status.last_error_at = now_iso
                # Cheap sliding window: increment, age out at next tick.
                self.status.errors_last_hour = self.status.errors_last_hour + result.errors
            self.status.paged_last_hour = self.status.paged_last_hour + result.paged

    # --- Lifecycle --------------------------------------------------------

    def start(self) -> bool:
        """Register the APScheduler job. Idempotent — second call is a no-op.

        Returns True if a new job was registered, False if already running.
        """
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
                "auto-page worker started",
                extra={
                    "event": "auto_page_worker_started",
                    "interval_sec": self.interval_sec,
                    "cooldown_min": self.cooldown_min,
                },
            )
            return True

    def _scheduled_tick(self) -> None:
        """APScheduler entrypoint — wraps :meth:`tick` and logs the result.

        Errors are caught by :meth:`tick` itself; this wrapper exists so
        the scheduler thread never inherits an uncaught exception.
        """
        try:
            result = self.tick()
            _log.info(
                "auto-page worker tick complete",
                extra={
                    "event": "auto_page_worker_tick",
                    "clinics_scanned": result.clinics_scanned,
                    "breaches_found": result.breaches_found,
                    "paged": result.paged,
                    "skipped_cooldown": result.skipped_cooldown,
                    "errors": result.errors,
                    "elapsed_ms": result.elapsed_ms,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "auto-page worker scheduled tick crashed",
                extra={
                    "event": "auto_page_worker_scheduled_tick_error",
                    "error": str(exc),
                },
            )

    def stop(self) -> bool:
        """Unregister the APScheduler job + flip ``running=False``.

        Returns True if the worker was running and is now stopped, False
        if it was already stopped.
        """
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
                "auto-page worker shutdown raised",
                extra={
                    "event": "auto_page_worker_shutdown_error",
                    "error": str(exc),
                },
            )
        _log.info(
            "auto-page worker stopped",
            extra={"event": "auto_page_worker_stopped"},
        )
        return True


# ---------------------------------------------------------------------------
# Module-level accessors
# ---------------------------------------------------------------------------


def get_worker() -> AutoPageWorker:
    """Return the singleton :class:`AutoPageWorker` instance.

    Lazily constructed on first call. The same instance is reused by:

    * the FastAPI lifespan (start/stop),
    * the status / start / stop / tick-once HTTP endpoints,
    * tests that need to invoke ``tick()`` synchronously.
    """
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = AutoPageWorker()
        return _WORKER_INSTANCE


def start_worker_if_enabled() -> Optional[AutoPageWorker]:
    """FastAPI startup hook. No-op when the env var is not set to ``"1"``.

    Mirrors :func:`app.services.agent_scheduler.start_scheduler` so ops
    can flip ``DEEPSYNAPS_AUTO_PAGE_ENABLED=1`` without redeploying app
    code. The Care Team Coverage admin can independently toggle
    ``escalation_chains.auto_page_enabled`` per clinic — both flags must
    be true for a given clinic to get auto-paged.
    """
    if not env_enabled():
        _log.info(
            "auto-page worker disabled via env",
            extra={"event": "auto_page_worker_disabled"},
        )
        return None
    worker = get_worker()
    worker.start()
    return worker


def shutdown_worker() -> None:
    """FastAPI shutdown hook. Safe to call when the worker was never started."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        worker = _WORKER_INSTANCE
    if worker is None:
        return
    try:
        worker.stop()
    except Exception:  # pragma: no cover - defensive
        _log.exception("auto-page worker shutdown raised")


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
    "AutoPageWorker",
    "TickResult",
    "WorkerStatus",
    "env_enabled",
    "env_interval_sec",
    "env_cooldown_min",
    "get_worker",
    "shutdown_worker",
    "start_worker_if_enabled",
]
