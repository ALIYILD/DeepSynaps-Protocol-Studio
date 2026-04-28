"""Lightweight audit trail for agent runs.

This iteration is logging-only — every run emits one structured line via
the standard library logger so existing log-shippers (Sentry breadcrumbs,
Fly logs, SOC pipeline) capture it without a new DB table. A follow-up
migration can persist these events to a real ``agent_runs`` table without
changing the public helper signature.

The previews are intentionally truncated so PHI in either the request or
the LLM reply does not balloon the log payload. Truncation length matches
the message-preview convention used elsewhere in the codebase.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

#: Max characters retained from message and reply previews. Tuned to keep
#: each log line well under typical structured-log limits while preserving
#: enough context to debug production issues.
_PREVIEW_MAX_CHARS = 200


def _truncate(text: str | None) -> str:
    """Return ``text`` clipped to :data:`_PREVIEW_MAX_CHARS`, never ``None``.

    Trailing whitespace is stripped before clipping so previews don't end
    in a stray space when the original ended with a newline.
    """
    if not text:
        return ""
    clean = text.strip()
    if len(clean) <= _PREVIEW_MAX_CHARS:
        return clean
    return clean[:_PREVIEW_MAX_CHARS] + "…"


def record_run(
    actor_id: str,
    agent_id: str,
    message_preview: str,
    reply_preview: str,
    ok: bool,
) -> None:
    """Emit one structured log line describing an agent run.

    Parameters
    ----------
    actor_id:
        The :class:`AuthenticatedActor.actor_id` that invoked the agent.
    agent_id:
        The :class:`AgentDefinition.id` that was invoked.
    message_preview:
        Raw user message; will be truncated to a safe preview length.
    reply_preview:
        LLM reply; will be truncated to a safe preview length.
    ok:
        ``True`` when the runner returned a non-empty reply with no
        ``error`` key, ``False`` otherwise.
    """
    logger.info(
        "agent_run",
        extra={
            "event": "agent_run",
            "actor_id": actor_id,
            "agent_id": agent_id,
            "ok": bool(ok),
            "message_preview": _truncate(message_preview),
            "reply_preview": _truncate(reply_preview),
        },
    )


__all__ = ["record_run"]
