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
        },
    )
    return row


__all__ = [
    "MESSAGE_PREVIEW_MAX_CHARS",
    "REPLY_PREVIEW_MAX_CHARS",
    "record_run",
]
