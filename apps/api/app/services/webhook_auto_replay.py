"""Phase 14 — auto-replay cron for failed Stripe webhook events.

Phase 11B added a manual operator endpoint to replay a Stripe webhook event by
id. That covered the "I noticed a failure in the dashboard, fix it now" path,
but it still required a human in the loop. This module makes the same flow
self-healing: an APScheduler tick (wired in :mod:`agent_scheduler`) calls
:func:`scan_and_auto_replay` on a fixed cadence and re-fires the SKU webhook
handler against any :class:`StripeWebhookEvent` row that:

1. Was claimed by the dedupe gate but never marked ``processed=True`` — i.e.
   the original delivery crashed mid-apply.
2. Is older than :data:`_MIN_AGE_SECONDS` (1 hour), so we don't race with the
   real Stripe retry that has not yet reached us.
3. Has fewer than :data:`_MAX_ATTEMPTS` (3) auto-replay attempts on this
   process. After that we give up and emit a ``post_alert`` so an operator
   can intervene manually.

Why an in-memory attempts counter?
----------------------------------
The :class:`StripeWebhookEvent` schema (migration 051) only stores
``(id, event_type, received_at, processed)``. There is no JSON / text /
counter column we can hijack to persist attempt counts, and adding one is
out of scope for this PR (no model / alembic changes per the Phase 14
isolation rules — owned by other subagents). So we track attempts in a
module-level dict keyed by ``event_id``.

Limitation: a process restart loses the counter and the same event may be
re-attempted up to :data:`_MAX_ATTEMPTS` times again. With the cron firing
every 30 minutes that bounds us at ~96 retries/day per crashed-event in the
worst case (process restart loop) and ~3-6 in the normal case (single
crash, single restart). All retries are idempotent at the Stripe level
because :func:`stripe_skus.replay_webhook_event` re-applies the same canonical
event payload — so over-retrying is safe, just noisy in logs.

The single auditable side-effect is the ``post_alert`` fan-out when
attempts are exhausted: that is fired once per ``(event_id, attempt-window)``
pair via the same dedupe machinery as the abuse-scan alerts.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from app.persistence.models import StripeWebhookEvent
from app.services.ops_alerting import post_alert
from app.services.stripe_skus import replay_webhook_event

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tuning knobs — kept as module constants rather than env vars per Phase 14
# constraint ("DO NOT introduce a new env var"). The cron schedule itself
# already gates frequency in agent_scheduler; these constants gate the
# per-event behaviour within a single tick.
# ---------------------------------------------------------------------------

_MIN_AGE_SECONDS = 60 * 60          # 1 hour — give Stripe's own retry first.
_MAX_ATTEMPTS = 3                   # Stop auto-retrying after N attempts.

# In-process attempts counter. Module-level so it survives across scheduler
# ticks within a single process. Keyed by Stripe event id.
_ATTEMPTS_LOCK = threading.Lock()
_ATTEMPTS: dict[str, int] = {}

# Track which event_ids have already triggered a "give up" alert so the
# scheduler doesn't re-page operators on every subsequent tick after we
# stopped retrying. Same bounded-memory caveat as ops_alerting._DEDUPE_KEYS.
_ALERTED_LOCK = threading.Lock()
_ALERTED: set[str] = set()


def _reset_attempts_for_tests() -> None:
    """Test helper — wipe the in-process attempts counter and alert set.

    Production code never calls this. Tests call it from a fixture so that
    each scenario starts from a clean slate without bleeding state between
    cases.
    """
    with _ATTEMPTS_LOCK:
        _ATTEMPTS.clear()
    with _ALERTED_LOCK:
        _ALERTED.clear()


def _record_attempt(event_id: str) -> int:
    """Atomically bump the attempts counter for ``event_id`` and return it."""
    with _ATTEMPTS_LOCK:
        current = _ATTEMPTS.get(event_id, 0) + 1
        _ATTEMPTS[event_id] = current
        return current


def _attempts_so_far(event_id: str) -> int:
    """Read-only attempts count for ``event_id`` (0 when never seen)."""
    with _ATTEMPTS_LOCK:
        return _ATTEMPTS.get(event_id, 0)


def _mark_alerted(event_id: str) -> bool:
    """Record that we have already alerted for ``event_id``.

    Returns True when this is the first time we are alerting (caller should
    actually fire the alert), False when we have alerted before (caller must
    suppress to avoid pager spam).
    """
    with _ALERTED_LOCK:
        if event_id in _ALERTED:
            return False
        _ALERTED.add(event_id)
        return True


def _now() -> datetime:
    """Wall-clock helper — single seam for monkey-patching in tests."""
    return datetime.now(timezone.utc)


def scan_and_auto_replay(db: "Session") -> dict:
    """Find failed webhook deliveries and re-fire the handler.

    Selection criteria
    ------------------
    A row is eligible when:

    * ``processed`` is False — the original delivery did not complete
      ``_apply_webhook`` cleanly. (Note: in the current schema the dedupe
      INSERT sets ``processed=True`` up-front, so a False row indicates an
      operator manually flipped it back to retry, OR the schema evolves
      to defer the flip until after apply succeeds. Either way this
      scanner is the right place to sweep them.)
    * ``received_at`` is older than :data:`_MIN_AGE_SECONDS`. This avoids
      racing against the real Stripe retry-with-backoff that fires within
      the first hour after a 500.
    * The in-process attempts counter for this event id is below
      :data:`_MAX_ATTEMPTS`.

    Per-tick rate-limit
    -------------------
    Within a single tick we attempt each eligible event AT MOST ONCE. The
    counter is bumped before the replay so a transient DB error or a
    second-pass scan inside the same tick still sees a fresh count.

    Returns
    -------
    dict
        ``{scanned, attempted, succeeded, failed, alerted}`` — counts
        across the scan. ``scanned`` is the number of eligible rows seen
        before the attempts gate; ``attempted`` is the subset we actually
        called :func:`replay_webhook_event` on; ``succeeded`` and
        ``failed`` partition ``attempted`` by ``ok`` flag; ``alerted`` is
        the count of newly-fired exhaustion alerts.
    """
    cutoff = _now() - timedelta(seconds=_MIN_AGE_SECONDS)
    # SQLite stores naive datetimes via the default column type; received_at
    # is written as ``datetime.now(timezone.utc)`` which strips tzinfo on
    # round-trip. Compare using the naive equivalent so the filter works
    # against both the live Postgres prod DB and the test sqlite file.
    cutoff_naive = cutoff.replace(tzinfo=None)

    rows = (
        db.query(StripeWebhookEvent)
        .filter(StripeWebhookEvent.processed.is_(False))
        .filter(StripeWebhookEvent.received_at <= cutoff_naive)
        .all()
    )

    scanned = 0
    attempted = 0
    succeeded = 0
    failed = 0
    alerted = 0

    for row in rows:
        event_id = row.id
        if not event_id:
            continue
        scanned += 1

        prior_attempts = _attempts_so_far(event_id)
        if prior_attempts >= _MAX_ATTEMPTS:
            # Already given up. Fire the operator alert exactly once, then
            # leave the row alone for human intervention.
            if _mark_alerted(event_id):
                alerted += 1
                try:
                    post_alert(
                        severity="high",
                        title=(
                            "Webhook auto-replay exhausted: "
                            f"{event_id}"
                        ),
                        body=(
                            f"Stripe webhook event *{event_id}* "
                            f"(*{row.event_type or 'unknown_type'}*) failed "
                            f"*{prior_attempts}* auto-replay attempts. "
                            "Manual intervention needed — investigate the "
                            "agent_subscription row, then either re-trigger "
                            "via the admin webhook-replay endpoint or mark "
                            "the dedupe row processed to silence further "
                            "scans."
                        ),
                        dedupe_key=f"webhook_auto_replay_exhausted:{event_id}",
                    )
                except Exception as exc:  # pragma: no cover — defensive
                    logger.warning(
                        "webhook auto-replay alert raised",
                        extra={
                            "event": "webhook_auto_replay_alert_error",
                            "event_id": event_id,
                            "error": str(exc),
                        },
                    )
            continue

        # Bump the counter BEFORE the network call so a flaky
        # replay_webhook_event still consumes one attempt — otherwise a
        # failure that raises before returning a result envelope would let
        # the same event be retried infinitely within a single tick on
        # subsequent scanner runs.
        attempt_number = _record_attempt(event_id)
        attempted += 1

        try:
            result = replay_webhook_event(db, event_id=event_id)
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning(
                "webhook auto-replay raised",
                extra={
                    "event": "webhook_auto_replay_raised",
                    "event_id": event_id,
                    "attempt": attempt_number,
                    "error": str(exc),
                },
            )
            failed += 1
            continue

        if result.get("ok") is True:
            succeeded += 1
            # Flip the row's processed flag so subsequent scans skip it.
            # The replay path itself does not touch the dedupe row by
            # design (it preserves the audit trail) — but once we have
            # auto-recovered we want the bookkeeping to reflect that.
            row.processed = True
            try:
                db.commit()
            except Exception as exc:  # pragma: no cover — defensive
                db.rollback()
                logger.warning(
                    "webhook auto-replay processed-flag commit failed",
                    extra={
                        "event": "webhook_auto_replay_commit_error",
                        "event_id": event_id,
                        "error": str(exc),
                    },
                )
            logger.info(
                "webhook auto-replay succeeded",
                extra={
                    "event": "webhook_auto_replay_success",
                    "event_id": event_id,
                    "attempt": attempt_number,
                },
            )
        else:
            failed += 1
            logger.info(
                "webhook auto-replay failed",
                extra={
                    "event": "webhook_auto_replay_failure",
                    "event_id": event_id,
                    "attempt": attempt_number,
                    "reason": result.get("error"),
                },
            )

    return {
        "scanned": scanned,
        "attempted": attempted,
        "succeeded": succeeded,
        "failed": failed,
        "alerted": alerted,
    }


__all__ = [
    "scan_and_auto_replay",
    "_reset_attempts_for_tests",
]
