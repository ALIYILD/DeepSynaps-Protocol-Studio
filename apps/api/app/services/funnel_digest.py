"""Phase 13D — weekly onboarding funnel digest builder.

This module is the pure builder for the *weekly* summary of onboarding
funnel activity. The Phase 12 ``OnboardingEvent`` table records each
wizard step transition; the Phase 12 admin endpoint
(``GET /api/v1/onboarding/funnel``) lets ops pull a snapshot on demand.
What was missing is the *push* side — a recurring digest that lands in
Slack and email every Monday morning so the team doesn't have to remember
to look.

Module structure
================

* :func:`build_weekly_digest_text` — pure, side-effect-free function that
  reads the last 7 days of :class:`OnboardingEvent` rows and renders a
  ``(subject, body)`` tuple. Returns ``("", "")`` when the window holds
  zero events so the caller can short-circuit and skip the alert
  entirely (no point posting an empty digest at 09:00 UTC every Monday
  during quiet weeks).
* :func:`emit_weekly_funnel_digest` — orchestrator that wires the
  builder into the existing Phase 11D :func:`post_alert` channel. Returns
  a structured ``{sent, reason}`` dict so the scheduler tick wrapper can
  log without re-parsing exceptions.

Why a separate module?
----------------------
The Phase 12 funnel-aggregation SQL lives inside
``app.routers.onboarding_router`` because it powers the admin endpoint.
We deliberately *re-implement* the count loop here rather than import
from the router for two reasons:

1. The router is owned by a parallel subagent in Phase 13 — strict
   isolation rules forbid touching ``onboarding_router.py``.
2. The digest's window is fixed at 7 days and the rendered shape (ASCII
   bars + plain-text totals + week-ending date) is wholly different from
   the JSON ``FunnelSummary`` model the endpoint returns. Sharing the
   query would just couple two unrelated views of the same table.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Tuple

from sqlalchemy.orm import Session

from app.persistence.models import OnboardingEvent
from app.services.ops_alerting import post_alert

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Window is fixed for the weekly digest — 7 days back from "now".
_WINDOW_DAYS = 7

# Step names mirrored from app.routers.onboarding_router._VALID_STEPS.
# Re-declared inline rather than imported to keep the parallel subagent's
# router untouched (Phase 13 isolation rule). The list is rendered in
# wizard-step order so the bar chart reads top-to-bottom as the funnel.
_STEPS_ORDER: tuple[str, ...] = (
    "started",
    "package_selected",
    "stripe_initiated",
    "stripe_skipped",
    "agents_enabled",
    "team_invited",
    "completed",
    "skipped",
)

# Maximum width (in block characters) of an ASCII bar in the rendered
# body. Slack's monospace blocks render at roughly the same width as the
# email plain-text equivalent, so 24 is wide enough to be readable but
# narrow enough to fit on a phone screen without wrapping.
_BAR_MAX_WIDTH = 24


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _render_bar(count: int, peak: int) -> str:
    """Render an ASCII bar of width proportional to ``count``.

    ``peak`` is the maximum count in the current digest — bars are
    normalised to that so the relative shape of the funnel is visible
    even when absolute counts are small.

    Edge cases
    ----------
    * ``peak == 0`` — returns an empty string (caller will not normally
      hit this because the zero-events short-circuit fires earlier, but
      defensive).
    * ``count == 0`` but ``peak > 0`` — still returns an empty string;
      the rendered line will read e.g. ``stripe_skipped              0``
      with whitespace where the bar would be.
    """
    if peak <= 0 or count <= 0:
        return ""
    width = max(1, round((count / peak) * _BAR_MAX_WIDTH))
    return "█" * width


def _conversion_pct(numerator: int, denominator: int) -> float:
    """Return ``numerator / denominator`` as a percentage, 1 decimal.

    Returns 0.0 when the denominator is zero — matches the Phase 12
    funnel-endpoint convention so digest readers see the same shape they
    see on the admin dashboard.
    """
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100.0, 1)


# ---------------------------------------------------------------------------
# build_weekly_digest_text
# ---------------------------------------------------------------------------


def build_weekly_digest_text(db: Session) -> Tuple[str, str]:
    """Build the (subject, body) tuple for the weekly funnel digest.

    The window is the last 7 days closed on ``created_at``. Counts are
    bucketed per step name; unknown step values (theoretically possible
    via direct DB inserts — the API rejects them) are dropped silently.

    Returns
    -------
    tuple[str, str]
        ``(subject, body)``. Both are empty strings when the 7-day
        window contains zero events — the caller short-circuits on this
        sentinel rather than emitting a noisy "0 events this week" alert.

    Notes
    -----
    * The week-ending date is the *date* component of "now" in UTC. We
      do not snap to Sunday-23:59 because the cron fires Monday 09:00
      UTC and the digest covers the trailing 7×24h window — labelling
      it with the exact tick date is more accurate than pretending it's
      a calendar-week boundary.
    * Body is plain text (with Unicode block chars). Suitable for both
      Slack (renders as text-with-bars) and email (likewise).
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_WINDOW_DAYS)
    # OnboardingEvent.created_at is stored as naive UTC by the writer
    # (see test_onboarding_events._seed_events) — strip tz to match.
    cutoff_naive = cutoff.replace(tzinfo=None)

    rows = (
        db.query(OnboardingEvent.step)
        .filter(OnboardingEvent.created_at >= cutoff_naive)
        .all()
    )

    if not rows:
        return ("", "")

    counts: dict[str, int] = {step: 0 for step in _STEPS_ORDER}
    for (step_value,) in rows:
        if step_value in counts:
            counts[step_value] += 1
        # Unknown step values dropped silently — see module docstring.

    started = counts["started"]
    completed = counts["completed"]
    skipped = counts["skipped"]

    started_to_completed = _conversion_pct(completed, started)
    started_to_skipped = _conversion_pct(skipped, started)

    week_ending = now.date().isoformat()
    subject = f"Weekly onboarding funnel — week ending {week_ending}"

    # Render the bar chart. ``peak`` normalises bar widths so the
    # relative funnel shape is visible regardless of absolute volume.
    peak = max(counts.values()) if counts else 0
    # Pad step labels to the longest name so the bars line up vertically.
    label_width = max(len(s) for s in _STEPS_ORDER)
    bar_lines: list[str] = []
    for step in _STEPS_ORDER:
        n = counts[step]
        bar = _render_bar(n, peak)
        bar_lines.append(f"{step.ljust(label_width)}  {bar} {n}")

    body_lines = [
        f"Onboarding funnel digest for the 7 days ending {week_ending} (UTC).",
        "",
        f"Started: {started}",
        f"Completed: {completed}",
        f"Skipped: {skipped}",
        "",
        f"Conversion started_to_completed: {started_to_completed}%",
        f"Conversion started_to_skipped: {started_to_skipped}%",
        "",
        "Step breakdown:",
        *bar_lines,
    ]
    body = "\n".join(body_lines)

    return (subject, body)


# ---------------------------------------------------------------------------
# emit_weekly_funnel_digest
# ---------------------------------------------------------------------------


def emit_weekly_funnel_digest(db: Session) -> dict:
    """Build the digest and emit via :func:`post_alert`.

    Parameters
    ----------
    db
        SQLAlchemy session (read-only — no writes performed).

    Returns
    -------
    dict
        ``{sent: bool, reason: str}``. ``sent`` is ``True`` when the
        Slack/email side-channel was invoked (regardless of whether the
        webhook was actually configured — that's a deployment concern,
        not a digest concern). ``reason`` is ``"no_events"`` when the
        7-day window held zero events and the alert was suppressed;
        ``"posted"`` when the alert was emitted.
    """
    subject, body = build_weekly_digest_text(db)
    if not subject and not body:
        logger.info(
            "weekly funnel digest skipped — no events in window",
            extra={"event": "weekly_funnel_digest_no_events"},
        )
        return {"sent": False, "reason": "no_events"}

    # Severity is ``low`` — the digest is informational, not an incident.
    # post_alert internally handles the Slack-webhook-unset case as a
    # successful no-op (returns reason="no_webhook_configured") and the
    # email side-channel runs independently. We do not branch on the
    # post_alert return value beyond logging because the digest's
    # contract is "we built and submitted the digest", not "Slack
    # accepted it".
    result = post_alert(severity="low", title=subject, body=body)
    logger.info(
        "weekly funnel digest emitted",
        extra={
            "event": "weekly_funnel_digest_emitted",
            "post_alert_ok": result.get("ok"),
            "post_alert_reason": result.get("reason"),
        },
    )
    return {"sent": True, "reason": "posted"}


__all__ = [
    "build_weekly_digest_text",
    "emit_weekly_funnel_digest",
]
