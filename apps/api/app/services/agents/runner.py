"""Agent runner — wraps an :class:`AgentDefinition` around a single LLM turn.

The runner is intentionally minimal in v1:

* it validates the user message length,
* (Phase 2 / ToolBroker) when a DB session + actor are supplied, it asks
  :func:`app.services.agents.broker.fetch_context` to pre-fetch every
  read-only tool the agent declares and folds the results into a
  ``<context source="clinic_live">`` block prepended to the user message,
* it also supports a caller-supplied ``context`` dict (legacy / test path),
* delegates to :func:`app.services.chat_service._llm_chat` for the actual
  LLM call (mirroring how reports/assessments routers invoke the LLM), and
* returns a stable schema-tagged envelope so the frontend / audit log can
  treat every agent response uniformly.

Errors never bubble up to the caller — any exception is logged and folded
into the response envelope as ``{"error": "<code>", "reply": ""}``. This
keeps the marketplace surface fail-safe even when upstream LLM providers
flake.
"""
from __future__ import annotations

import json as _json
import logging
from typing import TYPE_CHECKING, Any

from .registry import AgentDefinition

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor

logger = logging.getLogger(__name__)

#: Maximum length of a user message in characters. Anything above this is
#: rejected before the LLM call so we don't burn tokens on accidental dumps.
MAX_MESSAGE_CHARS = 4000

#: Schema id stamped onto every successful (and failed) runner response.
SCHEMA_ID = "deepsynaps.agents.run/v1"

#: Decision-support disclaimer attached to every response.
SAFETY_FOOTER = "decision-support, not autonomous diagnosis"

#: Hard cap on the size of the ``<context source="clinic_live">`` block
#: appended to the system / user message. Belt-and-braces with the
#: per-tool truncation in the broker.
MAX_CONTEXT_CHARS = 16_000

#: Sentence appended to the agent's system prompt when a live context
#: block is present. Tells the model how to use it.
LIVE_CONTEXT_SYSTEM_FOOTER = (
    "You have access to the live <context> block. Use it to ground your "
    "reply. Do not invent data not present in <context>."
)


def _build_user_message(message: str, context: dict[str, Any] | None) -> str:
    """Render the final user-message string sent to the LLM (legacy path).

    If ``context`` is provided, it is serialised inside a ``<context>`` block
    prepended to the user's text. Used when the *caller* hands us a context
    dict (e.g. tests). The ToolBroker live-context path uses
    :func:`_build_user_message_with_live_context` instead so it can stamp a
    distinct ``source="clinic_live"`` attribute.
    """
    if not context:
        return message
    try:
        context_blob = _json.dumps(context, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        context_blob = repr(context)
    return f"<context>{context_blob}</context>\n\n{message}"


def _build_user_message_with_live_context(
    message: str, live_context: dict[str, Any]
) -> str:
    """Prepend a ``<context source="clinic_live">`` block to ``message``."""
    try:
        blob = _json.dumps(live_context, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        blob = repr(live_context)
    if len(blob) > MAX_CONTEXT_CHARS:
        blob = blob[:MAX_CONTEXT_CHARS]
    return (
        f'<context source="clinic_live">\n{blob}\n</context>\n\n{message}'
    )


def run_agent(
    agent: AgentDefinition,
    *,
    message: str,
    context: dict[str, Any] | None = None,
    actor: "AuthenticatedActor | None" = None,
    db: "Session | None" = None,
) -> dict:
    """Execute one turn of ``agent`` against ``message``.

    Parameters
    ----------
    agent:
        The marketplace agent being invoked.
    message:
        The user's message. Hard-capped at :data:`MAX_MESSAGE_CHARS`.
    context:
        Optional caller-supplied context dict. Legacy/test path — kept so
        existing callers (and the router's pass-through ``context`` field)
        continue to work.
    actor, db:
        When *both* are supplied AND the agent declares a non-empty
        ``tool_allowlist``, the ToolBroker pre-fetches tool results and
        embeds them as a ``<context source="clinic_live">`` block. Either
        being ``None`` skips this path (backward-compat with tests that
        don't supply a DB).

    Returns a dict shaped::

        {
            "agent_id": str,
            "reply": str,
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": list[str],   # tool ids actually pre-fetched
            # plus "error": "<code>" on failure (with reply="")
        }

    Never raises — all exceptions are swallowed and surfaced as ``error``.
    """
    if message is None or len(message) > MAX_MESSAGE_CHARS:
        return {
            "agent_id": agent.id,
            "reply": "",
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": [],
            "error": "message_too_long",
        }

    # ---- Phase 2: pre-fetch live clinic context via ToolBroker ----------
    live_context: dict[str, Any] = {}
    context_used: list[str] = []
    system_prompt = agent.system_prompt

    if actor is not None and db is not None and agent.tool_allowlist:
        try:
            from .broker import fetch_context

            live_context = fetch_context(agent, actor, db)
            context_used = sorted(live_context.keys())
        except Exception as exc:  # noqa: BLE001 — fail-safe envelope
            logger.warning(
                "agent_context_fetch_failed",
                extra={
                    "event": "agent_context_fetch_failed",
                    "agent_id": agent.id,
                    "error_type": type(exc).__name__,
                },
            )
            live_context = {}
            context_used = []

    # ---- Compose user message ------------------------------------------
    # When the broker produced a live block AND the caller also handed us
    # a free-form ``context`` dict, fold the caller payload into the same
    # block under a stable key so neither signal is lost.
    if live_context:
        merged: dict[str, Any] = dict(live_context)
        if context:
            merged["caller_context"] = context
        user_content = _build_user_message_with_live_context(message, merged)
        # Stamp the system prompt so the model knows the context block is
        # authoritative live data and must not be hallucinated past.
        system_prompt = f"{agent.system_prompt}\n\n{LIVE_CONTEXT_SYSTEM_FOOTER}"
    else:
        # Legacy path — preserves caller-supplied `context` behaviour.
        user_content = _build_user_message(message, context)

    try:
        # Local import keeps `app.services.chat_service` import side-effects
        # off the cold path of `from app.services.agents import runner`.
        # It also makes monkeypatching trivial in tests:
        #   monkeypatch.setattr("app.services.chat_service._llm_chat", ...)
        from app.services import chat_service

        reply_text = chat_service._llm_chat(
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
            max_tokens=800,
            temperature=0.4,
        )
    except Exception as exc:  # noqa: BLE001 — fail-safe envelope, see docstring
        logger.warning(
            "agent_run_failed",
            extra={
                "event": "agent_run_failed",
                "agent_id": agent.id,
                "error_type": type(exc).__name__,
            },
        )
        return {
            "agent_id": agent.id,
            "reply": "",
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": context_used,
            "error": "llm_call_failed",
        }

    return {
        "agent_id": agent.id,
        "reply": reply_text or "",
        "schema_id": SCHEMA_ID,
        "safety_footer": SAFETY_FOOTER,
        "context_used": context_used,
    }


__all__ = [
    "MAX_CONTEXT_CHARS",
    "MAX_MESSAGE_CHARS",
    "LIVE_CONTEXT_SYSTEM_FOOTER",
    "SAFETY_FOOTER",
    "SCHEMA_ID",
    "run_agent",
]
