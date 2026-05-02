"""Channel-Specific Auth Health Probe Worker (CSAHP1, 2026-05-02).

Closes the section I rec from the Coaching Digest Delivery Failure
Drilldown launch audit (DCRO5, #406):

* DCRO5 surfaces ``has_matching_misconfig_flag`` for every failed
  dispatch, but the misconfig flag only fires AFTER a delivery has
  actually failed. By the time DCRO5 lights up the drilldown the
  resolver has already missed at least one digest.
* THIS worker proactively probes each clinic's configured adapter
  credentials (Slack OAuth, SendGrid API key, Twilio account auth,
  PagerDuty token) on a fixed cadence and emits an
  ``channel_auth_health_probe.auth_drift_detected`` audit row BEFORE
  the next digest dispatch fails.
* The emitted audit row carries ``priority=high`` and
  ``clinic_id={cid}; channel={ch}; error_class={...}`` so the DCRO5
  drilldown's click-through can join back to the proactive flag via
  the same (channel, week) key the existing
  ``has_matching_misconfig_flag`` check uses.
* On healthy probes the worker emits a low-volume
  ``channel_auth_health_probe.healthy`` row with ``priority=info`` so
  the admin status grid can render an honest "last verified at X"
  timestamp without spamming the audit trail.
* Cooldown per (clinic, channel) is 24h (configurable) — the worker
  doesn't re-emit either flavour within the cooldown window so the
  audit table stays bounded even when the env-gated background loop
  ticks every 12h.

Pattern matches :mod:`app.workers.channel_misconfiguration_detector_worker`
(#389) for lifecycle, audit emission, and singleton management. The
key new wrinkle is the ``httpx_client`` injection point on
:meth:`ChannelAuthHealthProbeWorker._probe_channel` so tests can swap
in an ``AsyncMock`` (or the canned ``_StubClient`` already used in
the SendGrid + Twilio adapter suites) without monkey-patching every
``httpx.Client`` call site.

Configuration
=============

``CHANNEL_AUTH_HEALTH_PROBE_ENABLED``
    Must be exactly ``"True"`` / ``"true"`` / ``"1"`` to start the
    background tick loop. Default ``False`` — honest opt-in. Tests and
    CI invoke :meth:`tick` directly so they don't fire the scheduler.
``CHANNEL_AUTH_HEALTH_PROBE_INTERVAL_HOURS``
    Tick cadence in hours. Defaults to 12 (twice per day — the worker
    is a proactive monitor, not a real-time hook).
``CHANNEL_AUTH_HEALTH_PROBE_COOLDOWN_HOURS``
    Re-emission cooldown per (clinic, channel) in hours. Defaults to
    24. Applies to BOTH ``auth_drift_detected`` AND ``healthy``
    emissions so the status grid's "last verified" timestamp never
    drifts more than 24h while the audit trail stays bounded.
``CHANNEL_AUTH_HEALTH_PROBE_TIMEOUT_SECONDS``
    Per-probe HTTP timeout in seconds. Defaults to 10. Bounded so a
    hung adapter edge can't stall the worker.

Audit
=====

* Per-tick row under ``target_type='channel_auth_health_probe'`` with
  action ``channel_auth_health_probe.tick`` carries
  ``clinics_scanned=N probes_run=M auth_drift_detected=K healthy=H
  errors=E elapsed_ms=T``.
* Per-(clinic, channel) auth-drift row under the same target_type
  with action ``channel_auth_health_probe.auth_drift_detected`` and
  ``priority=high``. Note encodes ``clinic_id={cid}; channel={ch};
  error_class={auth|rate_limit|unreachable|other};
  error_message=<truncated 200 chars>``.
* Per-(clinic, channel) healthy row under the same target_type with
  action ``channel_auth_health_probe.healthy`` and ``priority=info``.
  Note encodes ``clinic_id={cid}; channel={ch}; verified_at=<iso>``.
"""
from __future__ import annotations

import logging
import os
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: "Optional[ChannelAuthHealthProbeWorker]" = None
_TICK_JOB_ID = "channel_auth_health_probe_worker_tick"


WORKER_SURFACE = "channel_auth_health_probe"


# Channels CSAHP1 knows how to probe. Order matches the DCRO5 drilldown
# render order so a regulator transcript groups cleanly across both
# surfaces.
PROBE_CHANNELS: tuple[str, ...] = ("slack", "sendgrid", "twilio", "pagerduty")


# Probe URLs per channel. Each lambda returns the request URL given the
# (already-validated) creds dict so the worker can swap out the URL in
# tests via the injected client.
PROBE_URLS: dict[str, str] = {
    "slack": "https://slack.com/api/auth.test",
    "sendgrid": "https://api.sendgrid.com/v3/scopes",
    "twilio": "https://api.twilio.com/2010-04-01/Accounts/{sid}.json",
    "pagerduty": "https://api.pagerduty.com/users/me",
}


# ---------------------------------------------------------------------------
# Status snapshot (in-memory, per-process)
# ---------------------------------------------------------------------------


@dataclass
class TickResult:
    """Result of one :meth:`ChannelAuthHealthProbeWorker.tick`."""

    clinics_scanned: int = 0
    probes_run: int = 0
    auth_drift_detected: int = 0
    healthy: int = 0
    skipped_cooldown: int = 0
    skipped_no_creds: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    auth_drift_audit_event_ids: list[str] = field(default_factory=list)
    healthy_audit_event_ids: list[str] = field(default_factory=list)
    # ``per_channel_status`` is the ``{channel: 'healthy'|'unhealthy'|
    # 'never'}`` snapshot returned to the tick endpoint so the admin
    # frontend can update the status grid synchronously.
    per_channel_status: dict[str, str] = field(default_factory=dict)


@dataclass
class WorkerStatus:
    running: bool = False
    last_tick_at: Optional[str] = None
    next_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_probes_run: int = 0
    last_tick_auth_drift_detected: int = 0
    last_tick_healthy: int = 0
    last_tick_errors: int = 0
    interval_hours: int = 12
    cooldown_hours: int = 24
    timeout_seconds: int = 10


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
            "channel_auth_health_probe worker env var not int; using default",
            extra={"event": "csahp_worker_bad_env", "name": name, "raw": raw},
        )
        return default
    if v < minimum:
        return default
    return v


def env_enabled() -> bool:
    raw = os.environ.get("CHANNEL_AUTH_HEALTH_PROBE_ENABLED", "").strip().lower()
    return raw in ("1", "true", "yes")


def env_interval_hours() -> int:
    return _env_int(
        "CHANNEL_AUTH_HEALTH_PROBE_INTERVAL_HOURS", default=12, minimum=1
    )


def env_cooldown_hours() -> int:
    return _env_int(
        "CHANNEL_AUTH_HEALTH_PROBE_COOLDOWN_HOURS", default=24, minimum=1
    )


def env_timeout_seconds() -> int:
    return _env_int(
        "CHANNEL_AUTH_HEALTH_PROBE_TIMEOUT_SECONDS", default=10, minimum=1
    )


# ---------------------------------------------------------------------------
# Synthetic actor used for in-process scan
# ---------------------------------------------------------------------------


def _synth_admin_actor(clinic_id: Optional[str]) -> AuthenticatedActor:
    """Synthetic actor representing the worker."""
    return AuthenticatedActor(
        actor_id="channel-auth-health-probe-worker",
        display_name="Channel Auth Health Probe",
        role="admin",
        package_id="enterprise",
        clinic_id=(clinic_id or "clinic-demo-default"),
        token_id="channel-auth-health-probe-worker-internal",
    )


# ---------------------------------------------------------------------------
# Credential discovery
# ---------------------------------------------------------------------------


def _read_clinic_creds(db: Session, clinic_id: Optional[str]) -> dict[str, dict]:
    """Read each adapter's credentials for ``clinic_id``.

    The current code base reads adapter credentials from environment
    variables (see :mod:`app.services.oncall_delivery`). Per-clinic
    overrides are not yet wired into the DB schema (#387 introduced
    ``CaregiverDigestPreference.preferred_channel`` but the credential
    storage layer is still env-only). We honor that contract here by
    returning the env-derived creds for every clinic — the cooldown
    + audit row both still carry ``clinic_id`` so when the per-clinic
    schema lands the call site needs no churn.

    Returns a ``{channel: {<creds...>}}`` dict. Channels with missing
    creds are OMITTED so callers can skip them without a probe.
    """
    out: dict[str, dict] = {}
    slack_token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
    if slack_token:
        out["slack"] = {"token": slack_token}
    sendgrid_key = os.environ.get("SENDGRID_API_KEY", "").strip()
    if sendgrid_key:
        out["sendgrid"] = {"api_key": sendgrid_key}
    twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    if twilio_sid and twilio_token:
        out["twilio"] = {"sid": twilio_sid, "token": twilio_token}
    pd_key = os.environ.get("PAGERDUTY_API_KEY", "").strip()
    if pd_key:
        out["pagerduty"] = {"api_key": pd_key}
    return out


def _classify_error(
    *,
    status_code: Optional[int],
    exc: Optional[Exception],
) -> str:
    """Map probe outcome to ``error_class``.

    * ``auth`` — 401 / 403.
    * ``rate_limit`` — 429.
    * ``unreachable`` — timeouts, connection errors, 5xx.
    * ``other`` — anything else (4xx other than auth / rate_limit).
    """
    if exc is not None:
        # Treat httpx.TimeoutException + ConnectError as unreachable.
        cls_name = exc.__class__.__name__.lower()
        if "timeout" in cls_name or "connect" in cls_name or "network" in cls_name:
            return "unreachable"
        return "other"
    if status_code is None:
        return "other"
    if status_code in (401, 403):
        return "auth"
    if status_code == 429:
        return "rate_limit"
    if status_code >= 500:
        return "unreachable"
    return "other"


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
        f"probes_run={result.probes_run} "
        f"auth_drift_detected={result.auth_drift_detected} "
        f"healthy={result.healthy} "
        f"skipped_cooldown={result.skipped_cooldown} "
        f"skipped_no_creds={result.skipped_no_creds} "
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
            actor_id="channel-auth-health-probe-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception("channel_auth_health_probe tick audit emit failed")
    return eid


def _emit_auth_drift_audit(
    db: Session,
    *,
    clinic_id: Optional[str],
    channel: str,
    error_class: str,
    error_message: str,
) -> str:
    """Emit a HIGH-priority ``auth_drift_detected`` row.

    DCRO5's ``has_matching_misconfig_flag`` join uses ``channel`` and
    the ISO week of ``created_at`` as the join key — note format below
    keeps that contract.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-auth_drift_detected-"
        f"{(clinic_id or 'na')}-{channel}-{int(now.timestamp())}-"
        f"{uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=high "
        f"clinic_id={clinic_id or 'null'} "
        f"channel={channel} "
        f"error_class={error_class} "
        f"error_message={(error_message or '')[:200]}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(clinic_id or "all"),
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.auth_drift_detected",
            role="admin",
            actor_id="channel-auth-health-probe-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception("channel_auth_health_probe auth_drift audit emit failed")
    return eid


def _emit_healthy_audit(
    db: Session,
    *,
    clinic_id: Optional[str],
    channel: str,
) -> str:
    """Emit a low-volume ``healthy`` row.

    ``priority=info`` so the Clinician Inbox HIGH-priority predicate
    does NOT pick this up — it's a status-grid timestamp source, not
    an alarm signal.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-healthy-"
        f"{(clinic_id or 'na')}-{channel}-{int(now.timestamp())}-"
        f"{uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=info "
        f"clinic_id={clinic_id or 'null'} "
        f"channel={channel} "
        f"verified_at={now.isoformat()}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(clinic_id or "all"),
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.healthy",
            role="admin",
            actor_id="channel-auth-health-probe-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception("channel_auth_health_probe healthy audit emit failed")
    return eid


# ---------------------------------------------------------------------------
# Cooldown helper
# ---------------------------------------------------------------------------


def _was_emitted_within_cooldown(
    db: Session,
    *,
    clinic_id: Optional[str],
    channel: str,
    cooldown_hours: int,
    now: datetime,
) -> bool:
    """Return True when EITHER an auth_drift_detected OR a healthy audit
    row already exists for this (clinic, channel) newer than
    ``now - cooldown_hours``.

    Reads ``audit_event_records`` only — no second table to maintain.
    """
    cutoff_iso = (now - timedelta(hours=cooldown_hours)).isoformat()
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action.in_(
                [
                    f"{WORKER_SURFACE}.auth_drift_detected",
                    f"{WORKER_SURFACE}.healthy",
                ]
            ),
            AuditEventRecord.created_at >= cutoff_iso,
        )
        .all()
    )
    if not rows:
        return False
    cid_needle = f"clinic_id={clinic_id or 'null'}"
    ch_needle = f"channel={channel}"
    for r in rows:
        note = r.note or ""
        if cid_needle in note and ch_needle in note:
            return True
    return False


# ---------------------------------------------------------------------------
# Probe — HTTP layer with injection point
# ---------------------------------------------------------------------------


class _ProbeOutcome:
    """Lightweight outcome of one ``_probe_channel`` call.

    Not a dataclass to keep the test fakes minimal (any duck-typed
    object with ``.healthy`` / ``.error_class`` / ``.error_message``
    works).
    """

    def __init__(
        self,
        *,
        healthy: bool,
        error_class: str = "",
        error_message: str = "",
        status_code: Optional[int] = None,
    ) -> None:
        self.healthy = healthy
        self.error_class = error_class
        self.error_message = error_message
        self.status_code = status_code


def _build_probe_request(channel: str, creds: dict) -> tuple[str, dict, Optional[tuple]]:
    """Return ``(url, headers, auth)`` for a probe of ``channel``."""
    if channel == "slack":
        return (
            PROBE_URLS["slack"],
            {"Authorization": f"Bearer {creds.get('token', '')}"},
            None,
        )
    if channel == "sendgrid":
        return (
            PROBE_URLS["sendgrid"],
            {"Authorization": f"Bearer {creds.get('api_key', '')}"},
            None,
        )
    if channel == "twilio":
        sid = creds.get("sid", "")
        return (
            PROBE_URLS["twilio"].format(sid=sid),
            {},
            (sid, creds.get("token", "")),
        )
    if channel == "pagerduty":
        return (
            PROBE_URLS["pagerduty"],
            {
                "Authorization": f"Token token={creds.get('api_key', '')}",
                "Accept": "application/vnd.pagerduty+json;version=2",
            },
            None,
        )
    return ("", {}, None)


def _interpret_probe_response(
    channel: str,
    status_code: Optional[int],
    payload: Any,
    exc: Optional[Exception],
) -> _ProbeOutcome:
    """Map a probe HTTP response to a :class:`_ProbeOutcome`."""
    if exc is not None:
        return _ProbeOutcome(
            healthy=False,
            error_class=_classify_error(status_code=None, exc=exc),
            error_message=f"{exc.__class__.__name__}: {str(exc)[:160]}",
        )
    if status_code is None:
        return _ProbeOutcome(
            healthy=False,
            error_class="other",
            error_message="no status_code",
        )
    if 200 <= status_code < 300:
        # Slack returns 200 OK with ok=false on logical errors. Honor
        # that flag.
        if channel == "slack" and isinstance(payload, dict):
            if payload.get("ok") is True:
                return _ProbeOutcome(healthy=True, status_code=status_code)
            err = str(payload.get("error") or "ok=false")
            return _ProbeOutcome(
                healthy=False,
                error_class="auth" if "auth" in err.lower() or "token" in err.lower() else "other",
                error_message=err[:200],
                status_code=status_code,
            )
        return _ProbeOutcome(healthy=True, status_code=status_code)
    return _ProbeOutcome(
        healthy=False,
        error_class=_classify_error(status_code=status_code, exc=None),
        error_message=f"http {status_code}",
        status_code=status_code,
    )


# ---------------------------------------------------------------------------
# Core worker
# ---------------------------------------------------------------------------


class ChannelAuthHealthProbeWorker:
    """Periodic adapter-credential health probe.

    Use :meth:`tick` to run one probe iteration synchronously (testable
    without the scheduler thread). Use :meth:`start` / :meth:`stop` to
    register / unregister the APScheduler job.
    """

    def __init__(
        self,
        *,
        interval_hours: Optional[int] = None,
        cooldown_hours: Optional[int] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.interval_hours = interval_hours or env_interval_hours()
        self.cooldown_hours = cooldown_hours or env_cooldown_hours()
        self.timeout_seconds = timeout_seconds or env_timeout_seconds()
        self.status = WorkerStatus(
            interval_hours=self.interval_hours,
            cooldown_hours=self.cooldown_hours,
            timeout_seconds=self.timeout_seconds,
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

        Reads the most recent ``healthy`` / ``auth_drift_detected`` row
        per (clinic, channel) so the admin frontend can render
        per-channel "Last verified at X" timestamps.
        """
        per_channel: dict[str, dict] = {
            ch: {"status": "never", "last_probed_at": None, "error_class": None}
            for ch in PROBE_CHANNELS
        }
        try:
            cid_needle = f"clinic_id={clinic_id or 'null'}"
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == WORKER_SURFACE,
                    AuditEventRecord.action.in_(
                        [
                            f"{WORKER_SURFACE}.auth_drift_detected",
                            f"{WORKER_SURFACE}.healthy",
                        ]
                    ),
                )
                .order_by(AuditEventRecord.id.desc())
                .limit(500)
                .all()
            )
            seen: set[str] = set()
            for r in rows:
                note = r.note or ""
                if cid_needle not in note:
                    continue
                ch = ""
                for tok in note.split():
                    if tok.startswith("channel="):
                        ch = tok.split("=", 1)[1]
                        break
                if not ch or ch not in per_channel or ch in seen:
                    continue
                seen.add(ch)
                if (r.action or "").endswith(".auth_drift_detected"):
                    err_class = ""
                    for tok in note.split():
                        if tok.startswith("error_class="):
                            err_class = tok.split("=", 1)[1]
                            break
                    per_channel[ch] = {
                        "status": "unhealthy",
                        "last_probed_at": r.created_at,
                        "error_class": err_class or "other",
                    }
                else:
                    per_channel[ch] = {
                        "status": "healthy",
                        "last_probed_at": r.created_at,
                        "error_class": None,
                    }
        except Exception:  # pragma: no cover - defensive
            pass
        return {
            "running": bool(self.status.running),
            "enabled": env_enabled(),
            "last_tick_at": self.status.last_tick_at,
            "next_tick_at": self.status.next_tick_at,
            "last_error": self.status.last_error,
            "last_error_at": self.status.last_error_at,
            "last_tick_probes_run": int(self.status.last_tick_probes_run),
            "last_tick_auth_drift_detected": int(
                self.status.last_tick_auth_drift_detected
            ),
            "last_tick_healthy": int(self.status.last_tick_healthy),
            "last_tick_errors": int(self.status.last_tick_errors),
            "interval_hours": int(self.interval_hours),
            "cooldown_hours": int(self.cooldown_hours),
            "timeout_seconds": int(self.timeout_seconds),
            "per_channel": per_channel,
        }

    # --- Tick -------------------------------------------------------------

    def tick(
        self,
        db: Optional[Session] = None,
        *,
        only_clinic_id: Optional[str] = None,
        only_channel: Optional[str] = None,
        httpx_client: Optional[Callable[..., Any]] = None,
    ) -> TickResult:
        """Run one probe iteration.

        Parameters
        ----------
        db
            Optional session; opened + closed locally when ``None``.
        only_clinic_id
            When set, scope to one clinic. Routers MUST set this to
            ``actor.clinic_id`` so cross-clinic admins cannot probe
            another clinic's creds.
        only_channel
            When set, probe only this channel.
        httpx_client
            Optional callable returning a context-manager HTTP client
            (mirrors the ``httpx.Client`` interface). Used by tests to
            inject mocked-success / mocked-401 / mocked-timeout behavior
            without monkey-patching the global ``httpx`` module.
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
                only_channel=only_channel,
                httpx_client=httpx_client,
                now=started_at,
            )
        except Exception as exc:  # pragma: no cover - defensive top-level
            result.errors += 1
            result.last_error = str(exc)
            _log.exception("channel_auth_health_probe tick crashed")
        finally:
            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            result.elapsed_ms = int(elapsed * 1000)
            try:
                _emit_tick_audit(db, clinic_id=only_clinic_id, result=result)
            except Exception:  # pragma: no cover - defensive
                _log.exception(
                    "channel_auth_health_probe post-tick audit failed"
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
        only_channel: Optional[str],
        httpx_client: Optional[Callable[..., Any]],
        now: datetime,
    ) -> None:
        clinic_ids = self._resolve_clinic_ids(db, only_clinic_id)
        channels = (
            [c for c in PROBE_CHANNELS if c == only_channel]
            if only_channel
            else list(PROBE_CHANNELS)
        )

        for cid in clinic_ids:
            result.clinics_scanned += 1
            creds_by_channel = _read_clinic_creds(db, cid)
            for ch in channels:
                creds = creds_by_channel.get(ch)
                if not creds:
                    result.skipped_no_creds += 1
                    result.per_channel_status[ch] = "never"
                    continue

                # Cooldown — skip if we already emitted within the window.
                try:
                    if _was_emitted_within_cooldown(
                        db,
                        clinic_id=cid,
                        channel=ch,
                        cooldown_hours=self.cooldown_hours,
                        now=now,
                    ):
                        result.skipped_cooldown += 1
                        continue
                except Exception as exc:  # pragma: no cover - defensive
                    result.errors += 1
                    result.last_error = f"cooldown_check: {exc}"
                    continue

                outcome = self._probe_channel(
                    channel=ch, creds=creds, db=db, httpx_client=httpx_client
                )
                result.probes_run += 1

                if outcome.healthy:
                    eid = _emit_healthy_audit(
                        db, clinic_id=cid, channel=ch
                    )
                    result.healthy += 1
                    result.healthy_audit_event_ids.append(eid)
                    result.per_channel_status[ch] = "healthy"
                else:
                    eid = _emit_auth_drift_audit(
                        db,
                        clinic_id=cid,
                        channel=ch,
                        error_class=outcome.error_class or "other",
                        error_message=outcome.error_message or "",
                    )
                    result.auth_drift_detected += 1
                    result.auth_drift_audit_event_ids.append(eid)
                    result.per_channel_status[ch] = "unhealthy"

    def _probe_channel(
        self,
        *,
        channel: str,
        creds: dict,
        db: Session,
        httpx_client: Optional[Callable[..., Any]] = None,
    ) -> _ProbeOutcome:
        """Probe one (clinic, channel) tuple.

        ``httpx_client`` is the test injection point. When ``None`` the
        worker constructs a real ``httpx.Client`` with the configured
        timeout. The client must be a context manager exposing a
        ``request()`` (or ``get()``) method that returns an object with
        ``.status_code`` and ``.json()``.
        """
        url, headers, auth = _build_probe_request(channel, creds)
        if not url:
            return _ProbeOutcome(
                healthy=False,
                error_class="other",
                error_message=f"unsupported channel {channel}",
            )

        if httpx_client is None:
            try:
                import httpx  # noqa: PLC0415
            except Exception as exc:  # pragma: no cover - import always works
                return _ProbeOutcome(
                    healthy=False,
                    error_class="other",
                    error_message=f"httpx import failed: {exc}",
                )

            def _factory(*args: Any, **kwargs: Any) -> Any:
                return httpx.Client(timeout=self.timeout_seconds)

            client_factory: Callable[..., Any] = _factory
        else:
            client_factory = httpx_client

        try:
            with client_factory() as client:
                resp = client.get(url, headers=headers, auth=auth)
        except Exception as exc:
            return _interpret_probe_response(
                channel=channel,
                status_code=None,
                payload=None,
                exc=exc,
            )

        status_code = getattr(resp, "status_code", None)
        try:
            payload = resp.json()
        except Exception:
            payload = None
        return _interpret_probe_response(
            channel=channel,
            status_code=status_code,
            payload=payload,
            exc=None,
        )

    def _update_status(self, result: TickResult) -> None:
        with self._lock:
            now = datetime.now(timezone.utc)
            self.status.last_tick_at = now.isoformat()
            self.status.next_tick_at = (
                now + timedelta(hours=self.interval_hours)
            ).isoformat()
            self.status.last_tick_probes_run = result.probes_run
            self.status.last_tick_auth_drift_detected = result.auth_drift_detected
            self.status.last_tick_healthy = result.healthy
            self.status.last_tick_errors = result.errors
            if result.errors:
                self.status.last_error = result.last_error
                self.status.last_error_at = now.isoformat()

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
                "channel_auth_health_probe worker started",
                extra={
                    "event": "csahp_worker_started",
                    "interval_hours": self.interval_hours,
                    "cooldown_hours": self.cooldown_hours,
                    "timeout_seconds": self.timeout_seconds,
                },
            )
            return True

    def _scheduled_tick(self) -> None:
        try:
            result = self.tick()
            _log.info(
                "channel_auth_health_probe tick complete",
                extra={
                    "event": "csahp_worker_tick",
                    "probes_run": result.probes_run,
                    "auth_drift_detected": result.auth_drift_detected,
                    "healthy": result.healthy,
                    "errors": result.errors,
                    "elapsed_ms": result.elapsed_ms,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "channel_auth_health_probe scheduled tick crashed",
                extra={
                    "event": "csahp_worker_scheduled_tick_error",
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
                "channel_auth_health_probe shutdown raised",
                extra={
                    "event": "csahp_worker_shutdown_error",
                    "error": str(exc),
                },
            )
        _log.info(
            "channel_auth_health_probe worker stopped",
            extra={"event": "csahp_worker_stopped"},
        )
        return True


# ---------------------------------------------------------------------------
# Module-level accessors
# ---------------------------------------------------------------------------


def get_worker() -> ChannelAuthHealthProbeWorker:
    """Return the singleton :class:`ChannelAuthHealthProbeWorker`."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = ChannelAuthHealthProbeWorker()
        return _WORKER_INSTANCE


def start_worker_if_enabled() -> Optional[ChannelAuthHealthProbeWorker]:
    """FastAPI startup hook. No-op when the env var is not enabled."""
    if not env_enabled():
        _log.info(
            "channel_auth_health_probe worker disabled via env",
            extra={"event": "csahp_worker_disabled"},
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
        _log.exception("channel_auth_health_probe shutdown raised")


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
    "ChannelAuthHealthProbeWorker",
    "TickResult",
    "WorkerStatus",
    "WORKER_SURFACE",
    "PROBE_CHANNELS",
    "env_enabled",
    "env_interval_hours",
    "env_cooldown_hours",
    "env_timeout_seconds",
    "get_worker",
    "shutdown_worker",
    "start_worker_if_enabled",
    "_reset_for_tests",
]
