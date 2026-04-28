"""Agent runner — wraps an :class:`AgentDefinition` around a single LLM turn.

The runner is intentionally minimal in v1:

* it validates the user message length,
* optionally prepends a ``<context>...</context>`` block,
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

import logging
from typing import Any

from .registry import AgentDefinition

logger = logging.getLogger(__name__)

#: Maximum length of a user message in characters. Anything above this is
#: rejected before the LLM call so we don't burn tokens on accidental dumps.
MAX_MESSAGE_CHARS = 4000

#: Schema id stamped onto every successful (and failed) runner response.
SCHEMA_ID = "deepsynaps.agents.run/v1"

#: Decision-support disclaimer attached to every response.
SAFETY_FOOTER = "decision-support, not autonomous diagnosis"


def _build_user_message(message: str, context: dict[str, Any] | None) -> str:
    """Render the final user-message string sent to the LLM.

    If ``context`` is provided, it is serialised inside a ``<context>`` block
    prepended to the user's text. Using an XML-style tag (rather than JSON
    in free text) gives the model a stable, parseable boundary.
    """
    if not context:
        return message

    import json as _json

    try:
        context_blob = _json.dumps(context, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        # Defensive: never let a non-serialisable context kill the call.
        context_blob = repr(context)
    return f"<context>{context_blob}</context>\n\n{message}"


def run_agent(
    agent: AgentDefinition,
    *,
    message: str,
    context: dict[str, Any] | None = None,
) -> dict:
    """Execute one turn of ``agent`` against ``message``.

    Returns a dict shaped::

        {
            "agent_id": str,
            "reply": str,
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
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
            "error": "message_too_long",
        }

    user_content = _build_user_message(message, context)

    try:
        # Local import keeps `app.services.chat_service` import side-effects
        # off the cold path of `from app.services.agents import runner`.
        # It also makes monkeypatching trivial in tests:
        #   monkeypatch.setattr("app.services.chat_service._llm_chat", ...)
        from app.services import chat_service

        reply_text = chat_service._llm_chat(
            system=agent.system_prompt,
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
            "error": "llm_call_failed",
        }

    return {
        "agent_id": agent.id,
        "reply": reply_text or "",
        "schema_id": SCHEMA_ID,
        "safety_footer": SAFETY_FOOTER,
    }


__all__ = ["MAX_MESSAGE_CHARS", "SAFETY_FOOTER", "SCHEMA_ID", "run_agent"]
