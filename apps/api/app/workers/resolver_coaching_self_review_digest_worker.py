"""Resolver Coaching Self-Review Digest Worker (DCRO3, 2026-05-02).

Closes section I rec from the Resolver Coaching Inbox (DCRO2, #397):

* DCRO1 (#393) measures resolver calibration accuracy.
* DCRO2 (#397) gives each resolver a private inbox + self-review-note
  flow so they self-correct without admin intervention.
* THIS worker walks every opted-in
  :class:`~app.persistence.models.ResolverCoachingDigestPreference` row
  weekly, computes each resolver's un-self-reviewed wrong
  ``false_positive`` calls, and dispatches a digest via the resolver's
  preferred on-call channel (Slack DM / Twilio SMS / SendGrid email /
  PagerDuty) reusing the :class:`~app.services.oncall_delivery` adapters
  shipped in #374.
* Per-resolver per-week cooldown (default 144h = 6 days) prevents
  weekly-overlap dispatch when the cron drifts.
* Honest ``enabled=False`` default — opt-in only, both at the system
  level (``RESOLVER_COACHING_DIGEST_ENABLED``) and at the per-resolver
  level (``ResolverCoachingDigestPreference.opted_in``).

Closes the loop end-to-end: **DCRO1 measures → DCRO2 self-corrects →
DCRO3 nudges**.

Pattern matches :mod:`app.workers.channel_misconfiguration_detector_worker`
(#389) and :mod:`app.workers.caregiver_delivery_concern_aggregator_worker`
(#390) for lifecycle + audit. Source data: the paired-outcome service
:func:`app.services.resolution_outcome_pairing.pair_resolutions_with_outcomes`
(DCRO1) — pure pairing of existing audit rows; no schema change beyond
the preference table.

Configuration
=============

``RESOLVER_COACHING_DIGEST_ENABLED``
    Must equal exactly ``"1"`` / ``"true"`` / ``"yes"`` to start the
    worker loop. Default off (honest opt-in) so unit tests, CI, and
    local dev runs do not accidentally fire dispatches. Admin can still
    invoke ``tick`` manually via the ``POST /tick`` endpoint even when
    disabled — the env flag only gates the auto-scheduled loop.
``RESOLVER_COACHING_DIGEST_INTERVAL_HOURS``
    Tick cadence in hours. Defaults to 168 (weekly). Bad values fall
    back to 168.
``RESOLVER_COACHING_DIGEST_COOLDOWN_HOURS``
    Re-dispatch cooldown per (resolver, clinic) in hours. Defaults to
    144 (6 days). Prevents weekly-overlap dispatch when the cron tick
    runs slightly under-cadence. Bad values fall back to 144.
``RESOLVER_COACHING_DIGEST_MIN_WRONG_CALLS``
    Minimum un-self-reviewed wrong false_positive calls a resolver must
    have to be eligible for a dispatch. Defaults to 1 — only digest
    resolvers with at least one un-reviewed wrong call.

Audit
=====

Every tick emits ONE row under
``target_type='resolver_coaching_self_review_digest'`` with
``action='resolver_coaching_self_review_digest.tick'`` whose note
encodes ``resolvers_scanned=N digests_dispatched=M errors=E
elapsed_ms=T``. Per-resolver dispatches additionally emit a
``resolver_coaching_self_review_digest.dispatched`` row carrying
``priority=info`` (this is a self-improvement nudge, not an alert) plus
``resolver_user_id``, ``clinic_id``, ``wrong_call_count``, ``channel``,
``dispatched_at`` so the regulator transcript stays unambiguous about
which resolver was nudged via which channel.
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
from app.persistence.models import (
    AuditEventRecord,
    ResolverCoachingDigestPreference,
    User,
)
from app.services.resolution_outcome_pairing import (
    OUTCOME_REFLAGGED,
    pair_resolutions_with_outcomes,
)


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: "Optional[ResolverCoachingSelfReviewDigestWorker]" = None
_TICK_JOB_ID = "resolver_coaching_self_review_digest_worker_tick"


# Surface for the per-tick + per-dispatch audit rows. Distinct from the
# DCRO2 ``resolver_coaching_inbox`` surface so the regulator can join
# "scan tick fired" rows to "specific resolver nudged" rows without
# ambiguity.
WORKER_SURFACE = "resolver_coaching_self_review_digest"

# Action emitted by THIS worker per dispatch.
DISPATCH_ACTION = f"{WORKER_SURFACE}.dispatched"

# Self-review note action emitted by the DCRO2 router. We treat its
# presence (target_id == resolved_audit_id, actor_id == resolver_user_id)
# as the signal that the resolver has already reviewed this row, and so
# it should NOT count toward the digest payload.
SELF_REVIEW_NOTE_ACTION = "resolver_coaching_inbox.self_review_note_filed"


# Default channel when the resolver has no preference row preferred_channel
# AND the clinic EscalationPolicy has no dispatch_order. Email is the
# lowest-disruption channel and the closest match for a self-improvement
# nudge.
FALLBACK_CHANNEL = "email"

# Canonical channel taxonomy. Resolver may pick any of these via the
# preference PUT; the worker maps the channel to an adapter name via
# :func:`app.services.oncall_delivery._channel_to_adapter_name`.
KNOWN_CHANNELS: tuple[str, ...] = (
    "slack",
    "twilio",
    "sendgrid",
    "pagerduty",
    "email",
)


# ---------------------------------------------------------------------------
# Status / tick result snapshots
# ---------------------------------------------------------------------------


@dataclass
class DispatchedDigest:
    resolver_user_id: str
    clinic_id: Optional[str]
    wrong_call_count: int
    channel: str
    dispatch_event_id: str


@dataclass
class TickResult:
    """Result of one :meth:`ResolverCoachingSelfReviewDigestWorker.tick`."""

    resolvers_scanned: int = 0
    digests_dispatched: int = 0
    skipped_opted_out: int = 0
    skipped_cooldown: int = 0
    skipped_below_threshold: int = 0
    skipped_all_self_reviewed: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    dispatched_resolver_ids: list[str] = field(default_factory=list)
    dispatched_audit_event_ids: list[str] = field(default_factory=list)
    dispatched: list[DispatchedDigest] = field(default_factory=list)


@dataclass
class WorkerStatus:
    running: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_resolvers_scanned: int = 0
    last_tick_digests_dispatched: int = 0
    last_tick_errors: int = 0
    digests_dispatched_last_7d: int = 0
    interval_hours: int = 168
    cooldown_hours: int = 144
    min_wrong_calls: int = 1


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
            "resolver_coaching_self_review_digest worker env var not int; using default",
            extra={"event": "rcsrd_worker_bad_env", "name": name, "raw": raw},
        )
        return default
    if v < minimum:
        return default
    return v


def env_enabled() -> bool:
    raw = os.environ.get("RESOLVER_COACHING_DIGEST_ENABLED", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def env_interval_hours() -> int:
    return _env_int(
        "RESOLVER_COACHING_DIGEST_INTERVAL_HOURS", default=168, minimum=1
    )


def env_cooldown_hours() -> int:
    return _env_int(
        "RESOLVER_COACHING_DIGEST_COOLDOWN_HOURS", default=144, minimum=1
    )


def env_min_wrong_calls() -> int:
    return _env_int(
        "RESOLVER_COACHING_DIGEST_MIN_WRONG_CALLS", default=1, minimum=1
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
        f"resolvers_scanned={result.resolvers_scanned} "
        f"digests_dispatched={result.digests_dispatched} "
        f"skipped_opted_out={result.skipped_opted_out} "
        f"skipped_cooldown={result.skipped_cooldown} "
        f"skipped_below_threshold={result.skipped_below_threshold} "
        f"skipped_all_self_reviewed={result.skipped_all_self_reviewed} "
        f"errors={result.errors} "
        f"elapsed_ms={result.elapsed_ms}"
    )
    if clinic_id:
        note = f"clinic_id={clinic_id}; {note}"
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
            actor_id="resolver-coaching-self-review-digest-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception("resolver_coaching_self_review_digest tick audit emit failed")
    return eid


def _emit_dispatch_audit(
    db: Session,
    *,
    resolver_user_id: str,
    clinic_id: Optional[str],
    wrong_call_count: int,
    channel: str,
    delivery_status: str,
    delivery_note: Optional[str],
) -> str:
    """Emit a ``resolver_coaching_self_review_digest.dispatched`` row.

    Carries ``priority=info`` (NOT high) — this is a self-improvement
    nudge, not an alert. The Clinician Inbox HIGH-priority predicate
    explicitly skips these rows.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-dispatched-{resolver_user_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=info; "
        f"resolver_user_id={resolver_user_id}; "
        f"clinic_id={clinic_id or 'null'}; "
        f"wrong_call_count={wrong_call_count}; "
        f"channel={channel}; "
        f"delivery_status={delivery_status}; "
        f"dispatched_at={now.isoformat()}"
    )
    if delivery_note:
        # Strip semicolons so the delivery transcript can't inject extra
        # k=v pairs into the canonical note format.
        safe = str(delivery_note).replace(";", ",")[:200]
        note += f"; delivery_note={safe}"
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=resolver_user_id,
            target_type=WORKER_SURFACE,
            action=DISPATCH_ACTION,
            role="admin",
            actor_id="resolver-coaching-self-review-digest-worker",
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block worker
        _log.exception(
            "resolver_coaching_self_review_digest dispatch audit emit failed"
        )
    return eid


# ---------------------------------------------------------------------------
# Cooldown / freshness helpers
# ---------------------------------------------------------------------------


def _coerce_dt(iso: Optional[str]) -> Optional[datetime]:
    """SQLite roundtrips strip tzinfo; coerce to tz-aware UTC."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _was_dispatched_within_cooldown(
    db: Session,
    *,
    resolver_user_id: str,
    clinic_id: Optional[str],
    cooldown_hours: int,
    now: datetime,
) -> bool:
    """Return True when a dispatched audit row already exists for this
    (resolver, clinic) newer than ``now - cooldown_hours``.

    Reads ``audit_event_records`` directly so the cooldown survives a
    process restart (the in-memory ``last_dispatched_at`` snapshot would
    not).
    """
    cutoff_iso = (now - timedelta(hours=cooldown_hours)).isoformat()
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_id == resolver_user_id,
            AuditEventRecord.action == DISPATCH_ACTION,
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


def _resolver_has_self_reviewed(
    db: Session,
    *,
    resolver_user_id: str,
    resolved_audit_id: str,
) -> bool:
    """Return True iff a self-review-note row exists for this
    (resolver, resolved_audit_id) pair.

    Mirrors :func:`app.routers.resolver_coaching_inbox_router._find_self_review_note`
    (#397) but as a cheap boolean — we don't need to surface the note
    text, only confirm the row exists.
    """
    if not resolver_user_id or not resolved_audit_id:
        return False
    row = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == SELF_REVIEW_NOTE_ACTION,
            AuditEventRecord.target_id == resolved_audit_id,
            AuditEventRecord.actor_id == resolver_user_id,
        )
        .first()
    )
    return row is not None


# ---------------------------------------------------------------------------
# Channel resolution chain
# ---------------------------------------------------------------------------


def _resolve_dispatch_channel(
    db: Session,
    *,
    resolver_user_id: str,
    clinic_id: Optional[str],
    pref: Optional[ResolverCoachingDigestPreference],
) -> str:
    """Resolve the channel name to dispatch the digest through.

    Order of precedence:

    1. ``pref.preferred_channel`` (resolver-level explicit choice).
    2. The first entry in the clinic's
       :class:`~app.persistence.models.EscalationPolicy.dispatch_order`
       JSON array (#374). Treated as the resolver's preferred channel
       since the worker is dispatching ON BEHALF OF the resolver — they
       inherit the clinic's escalation policy when they have no
       individual override.
    3. ``email`` — the safest, least-disruptive fallback for a
       self-improvement nudge.

    Defensive at every step — any DB / JSON parse failure quietly falls
    back to the next layer so a misconfigured policy can never block a
    digest dispatch.
    """
    # Layer 1: resolver-level explicit choice.
    if pref is not None and pref.preferred_channel:
        c = str(pref.preferred_channel).strip().lower()
        if c in KNOWN_CHANNELS:
            return c

    # Layer 2: clinic EscalationPolicy.dispatch_order[0].
    if clinic_id:
        try:
            import json as _json  # noqa: PLC0415

            from app.persistence.models import EscalationPolicy  # noqa: PLC0415

            row = (
                db.query(EscalationPolicy)
                .filter(EscalationPolicy.clinic_id == clinic_id)
                .one_or_none()
            )
            if row is not None and row.dispatch_order:
                try:
                    order = _json.loads(row.dispatch_order) or []
                except Exception:
                    order = []
                if isinstance(order, list):
                    for raw in order:
                        if not isinstance(raw, str):
                            continue
                        c = raw.strip().lower()
                        if c in KNOWN_CHANNELS:
                            return c
        except Exception:  # pragma: no cover - defensive
            _log.exception(
                "resolver_coaching_self_review_digest channel resolution failed"
            )

    # Layer 3: hard fallback.
    return FALLBACK_CHANNEL


# ---------------------------------------------------------------------------
# Digest body builder
# ---------------------------------------------------------------------------


def _build_digest_body(
    *,
    resolver_user_id: str,
    wrong_calls: list[dict],
    inbox_url: str = "/#/resolver-coaching-inbox",
) -> dict:
    """Build the digest subject + body the adapter consumes.

    Returns a dict with keys:

    * ``subject`` — string (Slack/email "subject" line)
    * ``body`` — plain-text body, multi-line
    * ``recipient_label`` — short caregiver-side identifier list

    Format mirrors the spec literal so the adapter transcripts stay
    grep-able for the regulator audit trail.
    """
    n = len(wrong_calls)
    subject = (
        f"Your weekly coaching digest — {n} un-reviewed wrong false_positive call"
        f"{'' if n == 1 else 's'}"
    )
    bullets: list[str] = []
    for c in wrong_calls:
        nm = (
            c.get("caregiver_name")
            or c.get("caregiver_user_id")
            or "(unknown caregiver)"
        )
        days = c.get("days_to_re_flag")
        if days is None:
            bullets.append(f"  - {nm}")
        else:
            bullets.append(f"  - {nm} (re-flagged {days}d after your call)")
    bullet_block = "\n".join(bullets) if bullets else "  - (none)"
    body = (
        f"You have {n} resolutions in the last 30 days where you marked a "
        f"caregiver \"false_positive\" but the system re-flagged them within "
        f"30 days.\n"
        f"\n"
        f"Review at: {inbox_url}\n"
        f"\n"
        f"Caregivers needing review:\n"
        f"{bullet_block}"
    )
    return {
        "subject": subject,
        "body": body,
        "recipient_label": ", ".join(
            (c.get("caregiver_name") or c.get("caregiver_user_id") or "?")
            for c in wrong_calls
        )[:256],
    }


# ---------------------------------------------------------------------------
# Adapter dispatch (best-effort — defaults to MOCK in tests)
# ---------------------------------------------------------------------------


def _dispatch_via_channel(
    *,
    channel: str,
    resolver_user: Optional[User],
    digest: dict,
) -> tuple[str, Optional[str]]:
    """Dispatch the digest via the requested channel.

    Returns ``(delivery_status, delivery_note)``. ``delivery_status`` is
    one of ``"sent"`` / ``"failed"`` / ``"queued"`` (matches the
    OncallDeliveryService taxonomy).

    In test / dev we run in mock-mode unconditionally — the adapter
    factory chain in :mod:`app.services.oncall_delivery` requires real
    env vars (``SLACK_BOT_TOKEN`` etc.) to be set, otherwise every
    adapter is registered as ``enabled=False``. That's fine: the
    audit-row stamps ``delivery_status=queued`` truthfully ("no adapter
    enabled") which is the canonical honest-default carried forward
    from #372.
    """
    from app.services.oncall_delivery import (  # noqa: PLC0415
        Adapter,
        DeliveryResult,
        OncallDeliveryService,
        PageMessage,
        _channel_to_adapter_name,
    )

    adapter_name = _channel_to_adapter_name(channel) or channel
    if not adapter_name:
        return ("queued", "no adapter resolved")

    # Build the on-call PageMessage. Recipient identification is
    # best-effort; the resolver may not have a contact mapping row, in
    # which case the adapter will still log the dispatch but mark it
    # ``failed`` (no recipient resolved).
    msg = PageMessage(
        clinic_id=getattr(resolver_user, "clinic_id", "") or "",
        surface=WORKER_SURFACE,
        audit_event_id=f"pre-dispatch-{uuid.uuid4().hex[:8]}",
        body=f"Subject: {digest['subject']}\n\n{digest['body']}",
        severity="info",
        recipient_display_name=getattr(resolver_user, "display_name", None),
        recipient_email=getattr(resolver_user, "email", None),
    )

    try:
        # Prefer the per-channel adapter directly so the resolver's
        # explicit preference is honoured even if the clinic policy
        # would have ordered things differently.
        from app.services.oncall_delivery import (  # noqa: PLC0415
            _ADAPTER_FACTORIES,
        )

        cls = _ADAPTER_FACTORIES.get(adapter_name)
        adapters: list[Adapter] = [cls()] if cls is not None else []
        svc = OncallDeliveryService(
            clinic_id=msg.clinic_id, adapters=adapters or None
        )
        res: DeliveryResult = svc.send(msg)
        return (
            res.status or "queued",
            res.note or res.adapter or None,
        )
    except Exception as exc:  # pragma: no cover - defensive
        _log.warning(
            "resolver_coaching_self_review_digest dispatch raised",
            extra={"event": "rcsrd_dispatch_error", "err": str(exc)},
        )
        return ("failed", f"dispatch_error: {str(exc)[:120]}")


# ---------------------------------------------------------------------------
# Core worker
# ---------------------------------------------------------------------------


class ResolverCoachingSelfReviewDigestWorker:
    """Weekly nudge: resolvers with un-reviewed wrong false_positive calls.

    Use :meth:`tick` to run one scan iteration synchronously (testable
    without the scheduler thread). Use :meth:`start` / :meth:`stop` to
    register / unregister the APScheduler job.
    """

    def __init__(
        self,
        *,
        interval_hours: Optional[int] = None,
        cooldown_hours: Optional[int] = None,
        min_wrong_calls: Optional[int] = None,
    ) -> None:
        self.interval_hours = interval_hours or env_interval_hours()
        self.cooldown_hours = cooldown_hours or env_cooldown_hours()
        self.min_wrong_calls = min_wrong_calls or env_min_wrong_calls()
        self.status = WorkerStatus(
            interval_hours=self.interval_hours,
            cooldown_hours=self.cooldown_hours,
            min_wrong_calls=self.min_wrong_calls,
        )
        self._scheduler = None
        self._lock = threading.Lock()

    # --- Status surface ---------------------------------------------------

    def get_status(self) -> WorkerStatus:
        return self.status

    def get_status_for_clinic(
        self, db: Session, clinic_id: Optional[str]
    ) -> dict:
        """Per-clinic status snapshot for the ``GET /status`` endpoint."""
        try:
            opted_in_count = (
                db.query(ResolverCoachingDigestPreference)
                .filter(
                    ResolverCoachingDigestPreference.clinic_id == (clinic_id or ""),
                    ResolverCoachingDigestPreference.opted_in.is_(True),
                )
                .count()
                if clinic_id
                else 0
            )
        except Exception:  # pragma: no cover - defensive
            opted_in_count = 0
        try:
            cutoff_iso = (
                datetime.now(timezone.utc) - timedelta(days=7)
            ).isoformat()
            recent_rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == DISPATCH_ACTION,
                    AuditEventRecord.created_at >= cutoff_iso,
                )
                .all()
            )
            if clinic_id:
                needle = f"clinic_id={clinic_id}"
                recent_count = sum(
                    1 for r in recent_rows if needle in (r.note or "")
                )
            else:
                recent_count = len(recent_rows)
        except Exception:  # pragma: no cover - defensive
            recent_count = 0
        return {
            "running": bool(self.status.running),
            "enabled": env_enabled(),
            "last_tick_at": self.status.last_tick_at,
            "last_error": self.status.last_error,
            "last_error_at": self.status.last_error_at,
            "opted_in_resolvers_in_clinic": int(opted_in_count),
            "digests_dispatched_last_7d": int(recent_count),
            "last_tick_resolvers_scanned": int(
                self.status.last_tick_resolvers_scanned
            ),
            "last_tick_digests_dispatched": int(
                self.status.last_tick_digests_dispatched
            ),
            "last_tick_errors": int(self.status.last_tick_errors),
            "interval_hours": int(self.interval_hours),
            "cooldown_hours": int(self.cooldown_hours),
            "min_wrong_calls": int(self.min_wrong_calls),
        }

    # --- Tick -------------------------------------------------------------

    def tick(
        self,
        db: Optional[Session] = None,
        *,
        only_clinic_id: Optional[str] = None,
        only_resolver_user_id: Optional[str] = None,
    ) -> TickResult:
        """Run one scan iteration.

        Parameters
        ----------
        db
            Optional session. When ``None`` the worker opens its own and
            closes it in ``finally``.
        only_clinic_id
            When provided, scan only opted-in resolvers whose preference
            row sits in this clinic. Bound to ``actor.clinic_id`` by the
            admin tick endpoint.
        only_resolver_user_id
            When provided, further restrict to a single resolver in the
            ``only_clinic_id`` clinic. Used for "send my digest right
            now" debugging.
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
                only_resolver_user_id=only_resolver_user_id,
                now=started_at,
            )
        except Exception as exc:  # pragma: no cover - defensive top-level
            result.errors += 1
            result.last_error = str(exc)
            _log.exception("resolver_coaching_self_review_digest tick crashed")
        finally:
            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            result.elapsed_ms = int(elapsed * 1000)
            try:
                _emit_tick_audit(db, clinic_id=only_clinic_id, result=result)
            except Exception:  # pragma: no cover - defensive
                _log.exception(
                    "resolver_coaching_self_review_digest post-tick audit failed"
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
        only_resolver_user_id: Optional[str] = None,
        now: datetime,
    ) -> None:
        # 1) Pull every opted-in preference row, optionally bounded to
        #    the actor's clinic / a single resolver.
        q = db.query(ResolverCoachingDigestPreference).filter(
            ResolverCoachingDigestPreference.opted_in.is_(True)
        )
        if only_clinic_id:
            q = q.filter(
                ResolverCoachingDigestPreference.clinic_id == only_clinic_id
            )
        if only_resolver_user_id:
            q = q.filter(
                ResolverCoachingDigestPreference.resolver_user_id
                == only_resolver_user_id
            )
        prefs = q.all()
        if not prefs:
            return

        # Group by clinic so we only run pair_resolutions_with_outcomes
        # once per clinic — N resolvers in the same clinic share the
        # same paired-outcome scan.
        by_clinic: dict[str, list[ResolverCoachingDigestPreference]] = {}
        for pref in prefs:
            by_clinic.setdefault(str(pref.clinic_id or ""), []).append(pref)

        for clinic_id, clinic_prefs in by_clinic.items():
            if not clinic_id:
                continue

            # Pair resolutions with outcomes for this clinic. The DCRO1
            # service already handles the cross-clinic substring needle.
            try:
                records = pair_resolutions_with_outcomes(db, clinic_id, window_days=30)
            except Exception as exc:
                result.errors += 1
                result.last_error = f"pair: {exc}"
                continue

            # Bulk-load resolver users so digest body / recipient
            # resolution doesn't re-query per resolver.
            user_map = {
                u.id: u
                for u in db.query(User)
                .filter(
                    User.id.in_([p.resolver_user_id for p in clinic_prefs])
                )
                .all()
            }

            # Bulk-load caregiver names so digest bullets carry pretty
            # names where possible.
            cg_ids = sorted({rec.caregiver_user_id for rec in records})
            cg_map = {
                u.id: u
                for u in db.query(User).filter(User.id.in_(cg_ids or [""])).all()
            }

            for pref in clinic_prefs:
                rid = pref.resolver_user_id
                result.resolvers_scanned += 1

                # Defensive: opted_in must be true (caller filtered, but
                # belt-and-braces).
                if not pref.opted_in:
                    result.skipped_opted_out += 1
                    continue

                # Cooldown check first — cheap predicate, avoid the
                # heavier wrong-call scan when we'd skip anyway.
                try:
                    if _was_dispatched_within_cooldown(
                        db,
                        resolver_user_id=rid,
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

                # Find the resolver's wrong-fp calls (resolver=rid AND
                # reason=false_positive AND outcome=re_flagged_within_30d).
                resolver_wrong_calls = [
                    rec
                    for rec in records
                    if rec.resolver_user_id == rid
                    and rec.resolution_reason == "false_positive"
                    and rec.outcome == OUTCOME_REFLAGGED
                ]
                # Filter out rows the resolver has already self-reviewed.
                un_reviewed: list[dict] = []
                for rec in resolver_wrong_calls:
                    if _resolver_has_self_reviewed(
                        db,
                        resolver_user_id=rid,
                        resolved_audit_id=rec.resolved_audit_id,
                    ):
                        continue
                    cg = cg_map.get(rec.caregiver_user_id)
                    cg_name = (
                        getattr(cg, "display_name", None)
                        or getattr(cg, "email", None)
                        or rec.caregiver_user_id
                    )
                    un_reviewed.append(
                        {
                            "resolved_audit_id": rec.resolved_audit_id,
                            "caregiver_user_id": rec.caregiver_user_id,
                            "caregiver_name": cg_name,
                            "days_to_re_flag": (
                                int(round(rec.days_to_re_flag))
                                if rec.days_to_re_flag is not None
                                else None
                            ),
                        }
                    )

                wrong_count = len(un_reviewed)
                if wrong_count == 0 and resolver_wrong_calls:
                    # All wrong calls already self-reviewed — no nudge
                    # needed.
                    result.skipped_all_self_reviewed += 1
                    continue
                if wrong_count < self.min_wrong_calls:
                    result.skipped_below_threshold += 1
                    continue

                # Channel resolution.
                try:
                    channel = _resolve_dispatch_channel(
                        db,
                        resolver_user_id=rid,
                        clinic_id=clinic_id,
                        pref=pref,
                    )
                except Exception as exc:  # pragma: no cover - defensive
                    result.errors += 1
                    result.last_error = f"channel: {exc}"
                    continue

                digest = _build_digest_body(
                    resolver_user_id=rid,
                    wrong_calls=un_reviewed,
                )

                # Dispatch + audit.
                resolver_user = user_map.get(rid)
                try:
                    delivery_status, delivery_note = _dispatch_via_channel(
                        channel=channel,
                        resolver_user=resolver_user,
                        digest=digest,
                    )
                except Exception as exc:  # pragma: no cover - defensive
                    delivery_status = "failed"
                    delivery_note = f"dispatch_exc: {str(exc)[:160]}"

                try:
                    eid = _emit_dispatch_audit(
                        db,
                        resolver_user_id=rid,
                        clinic_id=clinic_id,
                        wrong_call_count=wrong_count,
                        channel=channel,
                        delivery_status=delivery_status,
                        delivery_note=delivery_note,
                    )
                except Exception as exc:  # pragma: no cover - defensive
                    result.errors += 1
                    result.last_error = f"audit: {exc}"
                    continue

                # Stamp the preference row's last_dispatched_at — the
                # cooldown predicate reads the audit table, but the
                # preference column is the friendly UI surface.
                try:
                    pref.last_dispatched_at = now.isoformat()
                    pref.updated_at = now.isoformat()
                    db.commit()
                except Exception:  # pragma: no cover - defensive
                    db.rollback()

                result.digests_dispatched += 1
                result.dispatched_resolver_ids.append(rid)
                result.dispatched_audit_event_ids.append(eid)
                result.dispatched.append(
                    DispatchedDigest(
                        resolver_user_id=rid,
                        clinic_id=clinic_id,
                        wrong_call_count=wrong_count,
                        channel=channel,
                        dispatch_event_id=eid,
                    )
                )

    def _update_status(self, result: TickResult) -> None:
        with self._lock:
            now_iso = datetime.now(timezone.utc).isoformat()
            self.status.last_tick_at = now_iso
            self.status.last_tick_resolvers_scanned = result.resolvers_scanned
            self.status.last_tick_digests_dispatched = result.digests_dispatched
            self.status.last_tick_errors = result.errors
            self.status.digests_dispatched_last_7d = (
                self.status.digests_dispatched_last_7d + result.digests_dispatched
            )
            if result.errors:
                self.status.last_error = result.last_error
                self.status.last_error_at = now_iso

    # --- Lifecycle --------------------------------------------------------

    def start(self) -> bool:
        """Register the APScheduler job. Idempotent — second call is a no-op."""
        from apscheduler.schedulers.background import (  # noqa: PLC0415
            BackgroundScheduler,
        )
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
            _log.info(
                "resolver_coaching_self_review_digest worker started",
                extra={
                    "event": "rcsrd_worker_started",
                    "interval_hours": self.interval_hours,
                    "cooldown_hours": self.cooldown_hours,
                    "min_wrong_calls": self.min_wrong_calls,
                },
            )
            return True

    def _scheduled_tick(self) -> None:
        try:
            result = self.tick()
            _log.info(
                "resolver_coaching_self_review_digest tick complete",
                extra={
                    "event": "rcsrd_worker_tick",
                    "resolvers_scanned": result.resolvers_scanned,
                    "digests_dispatched": result.digests_dispatched,
                    "errors": result.errors,
                    "elapsed_ms": result.elapsed_ms,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning(
                "resolver_coaching_self_review_digest scheduled tick crashed",
                extra={
                    "event": "rcsrd_worker_scheduled_tick_error",
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
                "resolver_coaching_self_review_digest shutdown raised",
                extra={
                    "event": "rcsrd_worker_shutdown_error",
                    "error": str(exc),
                },
            )
        _log.info(
            "resolver_coaching_self_review_digest worker stopped",
            extra={"event": "rcsrd_worker_stopped"},
        )
        return True


# ---------------------------------------------------------------------------
# Module-level accessors
# ---------------------------------------------------------------------------


def get_worker() -> ResolverCoachingSelfReviewDigestWorker:
    """Return the singleton :class:`ResolverCoachingSelfReviewDigestWorker`."""
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = ResolverCoachingSelfReviewDigestWorker()
        return _WORKER_INSTANCE


def start_worker_if_enabled() -> Optional[ResolverCoachingSelfReviewDigestWorker]:
    """FastAPI startup hook. No-op when the env var is not enabled (default)."""
    if not env_enabled():
        _log.info(
            "resolver_coaching_self_review_digest worker disabled via env",
            extra={"event": "rcsrd_worker_disabled"},
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
        _log.exception("resolver_coaching_self_review_digest shutdown raised")


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
    "ResolverCoachingSelfReviewDigestWorker",
    "TickResult",
    "WorkerStatus",
    "DispatchedDigest",
    "WORKER_SURFACE",
    "DISPATCH_ACTION",
    "FALLBACK_CHANNEL",
    "KNOWN_CHANNELS",
    "env_enabled",
    "env_interval_hours",
    "env_cooldown_hours",
    "env_min_wrong_calls",
    "get_worker",
    "shutdown_worker",
    "start_worker_if_enabled",
    "_reset_for_tests",
]
