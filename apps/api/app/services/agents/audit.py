"""Persistent audit trail for agent runs.

Every successful or failed agent invocation writes one row into
``agent_run_audit`` (migration 048) AND emits the same payload as a
structured log line so existing log-shippers (Sentry breadcrumbs, Fly
logs, SOC pipeline) continue to capture it without configuration churn.

Previews are intentionally truncated so PHI in either the request or
the LLM reply does not balloon the row size or the log payload:

* ``message_preview`` → 200 chars + ``"…"`` ellipsis on overflow.
* ``reply_preview``   → 500 chars + ``"…"`` ellipsis on overflow.

The DB table is the source of truth for the admin "agent run history"
view (`GET /api/v1/agents/runs`) and for future ratelimit / abuse
detection. The log line remains so on-call still has greppable
breadcrumbs even if the table is unavailable.
"""
from __future__ import annotations

import json as _json
import logging
from typing import TYPE_CHECKING

from app.persistence.models import AgentRunAudit

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor

logger = logging.getLogger(__name__)

#: Max characters retained from the user's *message* preview. Mirrors the
#: ``message_preview`` column width in :class:`AgentRunAudit`.
MESSAGE_PREVIEW_MAX_CHARS = 200

#: Max characters retained from the LLM *reply* preview. Replies tend to
#: be longer than the original prompt, so this gets a wider budget than
#: :data:`MESSAGE_PREVIEW_MAX_CHARS` while still capping row growth.
REPLY_PREVIEW_MAX_CHARS = 500


# ── Phase 7 — fixed price card for cost_pence accounting ────────────────────
#
# These are decision-support numbers, not a real invoice. They drive the
# per-package budget pre-check in :mod:`app.services.agents.runner` and
# the displayed "spend so far" tile. Operators can tune the cap row in
# :class:`PackageTokenBudget` without touching this file; the price card
# only changes when the underlying provider's price card changes.

#: Pence charged per *input* token. Multiply tokens_in by this.
PRICE_PENCE_PER_INPUT_TOKEN = 0.001

#: Pence charged per *output* token. Output tokens are roughly 3x more
#: expensive than input across the providers we currently route through.
PRICE_PENCE_PER_OUTPUT_TOKEN = 0.003


def compute_cost_pence(tokens_in: int, tokens_out: int) -> int:
    """Return the integer-pence cost of a run from its token usage.

    Both inputs are clamped to ``>=0`` so a misreported negative count
    cannot drive ``cost_pence`` below zero. Truncation (``int()``) is
    intentional — fractional pence are dropped, never rounded up — so
    the figure stays a conservative lower bound on the displayed spend.
    """
    ti = max(0, int(tokens_in or 0))
    to = max(0, int(tokens_out or 0))
    return max(
        0,
        int(ti * PRICE_PENCE_PER_INPUT_TOKEN + to * PRICE_PENCE_PER_OUTPUT_TOKEN),
    )


def _truncate(text: str | None, *, limit: int) -> str:
    """Return ``text`` clipped to ``limit`` chars, never ``None``.

    Trailing whitespace is stripped before clipping so previews don't
    end in a stray space when the original ended with a newline. An
    ellipsis is appended when truncation actually happens so downstream
    viewers can tell the row was clipped.
    """
    if not text:
        return ""
    clean = text.strip()
    if len(clean) <= limit:
        return clean
    return clean[:limit] + "…"


def record_run(
    *,
    db: "Session",
    actor: "AuthenticatedActor | None",
    agent_id: str,
    message: str,
    reply: str,
    context_used: list[str] | None,
    latency_ms: int | None,
    ok: bool,
    error_code: str | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    cost_pence: int | None = None,
) -> AgentRunAudit:
    """Persist one agent run + emit the matching structured log line.

    Parameters
    ----------
    db:
        Active SQLAlchemy session. Caller owns the transaction; we
        ``add`` + ``commit`` here because the audit row's lifecycle is
        independent of the calling endpoint's response.
    actor:
        The authenticated invoker. ``None`` is allowed for guest /
        anonymous probes so the audit trail still captures abusive
        unauth traffic.
    agent_id:
        :attr:`AgentDefinition.id` that was invoked.
    message:
        Raw user message — truncated to :data:`MESSAGE_PREVIEW_MAX_CHARS`.
    reply:
        LLM reply — truncated to :data:`REPLY_PREVIEW_MAX_CHARS`.
    context_used:
        Tool ids the broker actually fetched. JSON-encoded into the
        ``context_used_json`` column.
    latency_ms:
        Wall-clock latency of the LLM call in milliseconds; ``None``
        when the runner could not measure it.
    ok:
        ``True`` if a non-empty reply was produced with no error code.
    error_code:
        Stable error tag (e.g. ``"llm_call_failed"``,
        ``"message_too_long"``) when ``ok`` is ``False``.
    tokens_in / tokens_out:
        Phase 7 — token usage as captured (or estimated) by the runner.
        ``None`` is allowed so legacy callers that don't supply usage
        don't crash; the row is written with ``0`` in that case so the
        column never carries ``NULL`` in newly-written rows.
    cost_pence:
        Phase 7 — pence cost computed by :func:`compute_cost_pence`.
        ``None`` triggers a recompute from ``tokens_in`` / ``tokens_out``
        so the caller has one less thing to remember.

    Returns
    -------
    AgentRunAudit
        The persisted row, with ``id`` / ``created_at`` populated.
    """
    msg_preview = _truncate(message, limit=MESSAGE_PREVIEW_MAX_CHARS)
    reply_preview = _truncate(reply, limit=REPLY_PREVIEW_MAX_CHARS)
    ctx_list = list(context_used or [])
    try:
        ctx_json: str | None = _json.dumps(ctx_list) if ctx_list else None
    except (TypeError, ValueError):
        # Fallback — coerce non-serialisable entries to str so the column
        # still gets *some* signal and we don't lose the audit row.
        ctx_json = _json.dumps([str(x) for x in ctx_list])

    actor_id = actor.actor_id if actor is not None else None
    clinic_id = actor.clinic_id if actor is not None else None

    # Normalise the Phase-7 metering fields. Default to 0 (not None) on
    # the persisted row so downstream SUM(...) queries don't have to
    # COALESCE every time.
    ti = max(0, int(tokens_in)) if tokens_in is not None else 0
    to = max(0, int(tokens_out)) if tokens_out is not None else 0
    if cost_pence is None:
        cp = compute_cost_pence(ti, to)
    else:
        cp = max(0, int(cost_pence))

    row = AgentRunAudit(
        actor_id=actor_id,
        clinic_id=clinic_id,
        agent_id=agent_id,
        message_preview=msg_preview,
        reply_preview=reply_preview,
        context_used_json=ctx_json,
        latency_ms=latency_ms,
        ok=bool(ok),
        error_code=error_code,
        tokens_in_used=ti,
        tokens_out_used=to,
        cost_pence=cp,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Side-effect: keep the log line so existing log-based dashboards /
    # SIEM rules continue to fire without a code change.
    logger.info(
        "agent_run",
        extra={
            "event": "agent_run",
            "audit_id": row.id,
            "actor_id": actor_id,
            "clinic_id": clinic_id,
            "agent_id": agent_id,
            "ok": bool(ok),
            "error_code": error_code,
            "latency_ms": latency_ms,
            "context_used": ctx_list,
            "message_preview": msg_preview,
            "reply_preview": reply_preview,
            "tokens_in_used": ti,
            "tokens_out_used": to,
            "cost_pence": cp,
        },
    )
    return row


__all__ = [
    "MESSAGE_PREVIEW_MAX_CHARS",
    "REPLY_PREVIEW_MAX_CHARS",
    "PRICE_PENCE_PER_INPUT_TOKEN",
    "PRICE_PENCE_PER_OUTPUT_TOKEN",
    "compute_cost_pence",
    "record_run",
]
