"""Slack alerting on agent abuse signals.

Posts alerts to a configured Slack incoming-webhook URL when abuse signals
exceed configured thresholds. Reads ``SLACK_OPS_WEBHOOK_URL`` from the
environment. When the env var is unset the module is a silent no-op (Slack
is an optional ops integration; absence is not an error).

Module structure
================

* :func:`post_alert` — low-level, builds the Slack attachment body and
  POSTs it with ``httpx``. Returns a structured ``{ok, reason, status_code}``
  dict so callers can log without re-parsing exceptions.
* :func:`scan_and_alert_abuse_signals` — re-runs the same SQL the existing
  ``/api/v1/agents/ops/abuse-signals`` endpoint uses, then fires one
  alert per signal at-or-above the configured severity threshold. Carries
  an in-memory dedupe table keyed by ``(clinic_id, agent_id, hour-bucket)``
  so the scanner can be polled aggressively without spamming Slack.

Why duplicate the abuse-signal SQL inline rather than import from
``agents_router``? The router is owned by a parallel subagent in this
phase and we must not modify it. The query is short enough to re-implement
without materially diverging.

Decision-support framing only — Slack alerts are operator notifications,
not autonomous action.
"""
from __future__ import annotations

import logging
import os
import statistics
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.persistence.models import AgentRunAudit

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Slack attachment colours per severity bucket
# ---------------------------------------------------------------------------

_SEVERITY_COLOR: dict[str, str] = {
    "low": "#3a87ad",   # info blue
    "med": "#f0ad4e",   # warning orange
    "high": "#d9534f",  # danger red
}

_SEVERITY_RANK: dict[str, int] = {"low": 1, "med": 2, "high": 3}


# ---------------------------------------------------------------------------
# In-memory dedupe set — capped at 1000 entries to bound memory.
#
# A DB-backed dedupe table is in scope for the parallel infrastructure
# subagent's migration; this in-memory store is the bridge until that
# lands. Loss-of-state on restart is acceptable: at worst a single
# duplicate Slack message goes out per (clinic, agent, hour) per process.
# ---------------------------------------------------------------------------

_DEDUPE_MAX = 1000
_DEDUPE_KEYS: set[str] = set()
_DEDUPE_LOCK = threading.Lock()


def _dedupe_seen(key: str) -> bool:
    """Atomic check-and-add. Returns True when the key was already present."""
    with _DEDUPE_LOCK:
        if key in _DEDUPE_KEYS:
            return True
        # Cap memory: drop arbitrary entries when the cap is hit. The set is
        # a cache, not a source-of-truth — eviction is fine.
        if len(_DEDUPE_KEYS) >= _DEDUPE_MAX:
            try:
                _DEDUPE_KEYS.pop()
            except KeyError:  # pragma: no cover - defensive
                pass
        _DEDUPE_KEYS.add(key)
        return False


def _reset_dedupe_for_tests() -> None:
    """Test helper — drops the in-memory dedupe set."""
    with _DEDUPE_LOCK:
        _DEDUPE_KEYS.clear()


# ---------------------------------------------------------------------------
# post_alert — wraps the Slack incoming-webhook POST
# ---------------------------------------------------------------------------


def _build_payload(*, severity: str, title: str, body: str) -> dict[str, Any]:
    """Build the structured Slack attachment payload.

    Slack incoming webhooks accept either ``text`` or ``attachments``; we
    use ``attachments`` so the severity colour bar renders. The plain
    ``text`` field is also populated as a screen-reader / notification
    fallback.
    """
    color = _SEVERITY_COLOR.get(severity, _SEVERITY_COLOR["low"])
    return {
        "text": f"[{severity.upper()}] {title}",
        "attachments": [
            {
                "color": color,
                "title": title,
                "text": body,
                "fields": [
                    {"title": "severity", "value": severity, "short": True},
                ],
                "mrkdwn_in": ["text", "title"],
            }
        ],
    }


def post_alert(
    *,
    severity: str,
    title: str,
    body: str,
    dedupe_key: str | None = None,
) -> dict[str, Any]:
    """POST a structured Slack message via the configured incoming webhook.

    Parameters
    ----------
    severity
        ``"low"``, ``"med"`` or ``"high"`` — drives the attachment colour.
        Unknown values fall back to ``"low"`` blue.
    title
        Single-line title — surfaces in the Slack notification and as the
        attachment title.
    body
        Multi-line description; supports Slack's mrkdwn.
    dedupe_key
        Optional. When provided, repeated calls with the same key return
        ``{ok: True, reason: "deduped"}`` without actually POSTing.

    Returns
    -------
    dict
        ``{ok: bool, reason: str | None, status_code: int | None}``.

        * ``{ok: True, reason: "no_webhook_configured"}`` — env var unset.
        * ``{ok: True, reason: "deduped"}`` — already alerted with this key.
        * ``{ok: True, reason: None, status_code: 200}`` — Slack accepted.
        * ``{ok: False, reason: "slack_4xx"|"slack_5xx", status_code: int}``
          — Slack rejected; we log and swallow rather than raise so the
          caller's audit/scan loop is not interrupted.
        * ``{ok: False, reason: "transport_error"}`` — network / DNS failure.
    """
    webhook_url = os.environ.get("SLACK_OPS_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return {"ok": True, "reason": "no_webhook_configured", "status_code": None}

    if dedupe_key is not None and _dedupe_seen(dedupe_key):
        return {"ok": True, "reason": "deduped", "status_code": None}

    payload = _build_payload(severity=severity, title=title, body=body)

    try:
        resp = httpx.post(webhook_url, json=payload, timeout=5.0)
    except httpx.HTTPError as exc:
        logger.warning(
            "slack webhook transport error",
            extra={"event": "slack_webhook_transport_error", "error": str(exc)},
        )
        return {"ok": False, "reason": "transport_error", "status_code": None}

    if 200 <= resp.status_code < 300:
        return {"ok": True, "reason": None, "status_code": resp.status_code}

    if 400 <= resp.status_code < 500:
        logger.warning(
            "slack webhook rejected request",
            extra={
                "event": "slack_webhook_4xx",
                "status_code": resp.status_code,
            },
        )
        return {"ok": False, "reason": "slack_4xx", "status_code": resp.status_code}

    logger.warning(
        "slack webhook server error",
        extra={
            "event": "slack_webhook_5xx",
            "status_code": resp.status_code,
        },
    )
    return {"ok": False, "reason": "slack_5xx", "status_code": resp.status_code}


# ---------------------------------------------------------------------------
# scan_and_alert_abuse_signals
# ---------------------------------------------------------------------------


def _hour_bucket(now: datetime | None = None) -> str:
    """Return the current UTC hour as ``"YYYY-MM-DDTHH"``.

    Used as the dedupe granularity for abuse alerts — re-firing the same
    (clinic, agent) signal more than once per hour adds Slack noise
    without surfacing new information.
    """
    ts = now or datetime.now(timezone.utc)
    return ts.strftime("%Y-%m-%dT%H")


def _classify_severity(ratio: float) -> str:
    if ratio >= 10.0:
        return "high"
    if ratio > 7.5:
        return "med"
    if ratio > 5.0:
        return "low"
    return ""  # Below the flag threshold.


def scan_and_alert_abuse_signals(
    db: Session,
    *,
    window_minutes: int = 60,
    severity_threshold: str = "high",
) -> dict[str, int]:
    """Scan recent agent runs and fire Slack alerts for noisy pairs.

    Re-implements the SQL from ``/api/v1/agents/ops/abuse-signals`` (kept
    in sync intentionally rather than imported — the endpoint module is
    owned by a parallel subagent).

    Parameters
    ----------
    db
        SQLAlchemy session (read-only — no writes are performed).
    window_minutes
        Lookback in minutes. Mirrors the endpoint's ``window_minutes``
        query parameter.
    severity_threshold
        Minimum severity to alert on. ``"low" | "med" | "high"``. Defaults
        to ``"high"`` so the scanner only escalates the most egregious
        spikes by default.

    Returns
    -------
    dict
        ``{scanned: int, posted: int, dedupe_skipped: int}`` — counts
        across the scan. ``scanned`` is the count of signals at-or-above
        the threshold; ``posted`` is the count actually delivered to
        Slack (includes ``no_webhook_configured`` no-ops as 0); and
        ``dedupe_skipped`` is the count blocked by the in-memory dedupe.
    """
    threshold_rank = _SEVERITY_RANK.get(severity_threshold, _SEVERITY_RANK["high"])

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    cutoff_naive = cutoff.replace(tzinfo=None)

    rows = (
        db.query(
            AgentRunAudit.clinic_id,
            AgentRunAudit.agent_id,
            func.count(AgentRunAudit.id).label("runs_count"),
        )
        .filter(AgentRunAudit.created_at >= cutoff_naive)
        .group_by(AgentRunAudit.clinic_id, AgentRunAudit.agent_id)
        .all()
    )

    if not rows:
        return {"scanned": 0, "posted": 0, "dedupe_skipped": 0}

    counts = [int(r.runs_count) for r in rows]
    median = float(statistics.median(counts))
    if median <= 0:
        return {"scanned": 0, "posted": 0, "dedupe_skipped": 0}

    bucket = _hour_bucket()

    scanned = 0
    posted = 0
    dedupe_skipped = 0

    for r in rows:
        n = int(r.runs_count)
        ratio = n / median
        severity = _classify_severity(ratio)
        if not severity:
            continue
        if _SEVERITY_RANK[severity] < threshold_rank:
            continue

        scanned += 1

        clinic_label = r.clinic_id or "<no-clinic>"
        dedupe_key = f"{clinic_label}:{r.agent_id}:{bucket}"

        title = (
            f"Agent abuse signal: {severity.upper()} "
            f"({clinic_label} / {r.agent_id})"
        )
        body = (
            f"Pair *{clinic_label}* / *{r.agent_id}* recorded *{n}* runs in the "
            f"last *{window_minutes}* minutes — *{round(ratio, 1)}x* the "
            f"cohort median ({median})."
        )

        result = post_alert(
            severity=severity,
            title=title,
            body=body,
            dedupe_key=dedupe_key,
        )
        if result.get("reason") == "deduped":
            dedupe_skipped += 1
        elif result.get("ok"):
            # Treat unset-webhook as a successful no-op (do not count as posted).
            if result.get("reason") != "no_webhook_configured":
                posted += 1

    return {"scanned": scanned, "posted": posted, "dedupe_skipped": dedupe_skipped}


__all__ = [
    "post_alert",
    "scan_and_alert_abuse_signals",
    "_reset_dedupe_for_tests",
]
