"""ToolBroker — pre-fetches grounded context for an agent run.

The broker walks the agent's ``tool_allowlist`` and invokes each registered
read-only handler against the live DB. Results are returned as a dict keyed
by tool id and folded into the ``<context>`` block prepended to the user
message in :func:`app.services.agents.runner.run_agent`.

Design notes
------------
* This is *not* LLM function-calling. We pre-fetch everything the agent
  *might* need, and let the model use it. Function-calling is Phase 2.5.
* Failures never propagate. An unknown tool id, a missing handler, or an
  exception inside a handler all degrade to a small dict with ``error`` /
  ``unavailable`` so the LLM still gets *something* it can reason about.
* Per-tool payloads are clipped to ~2 KB of serialised JSON to bound the
  total context size and to avoid one chatty tool starving the others.
* Total context is also clipped at the runner layer (~16 KB) as a defence
  in depth.
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from .tools.registry import TOOL_REGISTRY, is_write_tool

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor
    from app.services.agents.registry import AgentDefinition

logger = logging.getLogger(__name__)


#: Maximum serialised JSON length per tool. Anything larger is truncated
#: with a marker so the model still sees the head of the payload.
PER_TOOL_MAX_CHARS = 2000


def _truncate_payload(tool_id: str, payload: Any) -> Any:
    """Return ``payload`` clipped to :data:`PER_TOOL_MAX_CHARS` of JSON.

    If the payload serialises larger than the budget we replace it with a
    ``{"truncated": true, ...}`` marker carrying the head of the original
    JSON so the model still has *some* signal.
    """
    try:
        as_json = json.dumps(payload, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return {"error": "non_serialisable_payload"}
    if len(as_json) <= PER_TOOL_MAX_CHARS:
        return payload
    head = as_json[:PER_TOOL_MAX_CHARS]
    logger.info(
        "agent_tool_payload_truncated",
        extra={
            "event": "agent_tool_payload_truncated",
            "tool_id": tool_id,
            "original_chars": len(as_json),
            "kept_chars": PER_TOOL_MAX_CHARS,
        },
    )
    return {
        "truncated": True,
        "original_chars": len(as_json),
        "kept_chars": PER_TOOL_MAX_CHARS,
        "head": head,
    }


def fetch_context(
    agent: "AgentDefinition",
    actor: "AuthenticatedActor",
    db: "Session",
) -> dict[str, Any]:
    """Pre-fetch tool results for ``agent`` on behalf of ``actor``.

    Returns a dict shaped ``{tool_id: result_or_error_dict}``. Tool ids
    that are unknown to the registry, or are write-only, are skipped (with
    a warning log on unknowns).

    Never raises — every per-tool exception is caught and folded into the
    return dict so the runner can still build a context block.
    """
    out: dict[str, Any] = {}
    for tool_id in agent.tool_allowlist:
        tool = TOOL_REGISTRY.get(tool_id)
        if tool is None:
            logger.warning(
                "agent_tool_unknown",
                extra={
                    "event": "agent_tool_unknown",
                    "agent_id": agent.id,
                    "tool_id": tool_id,
                },
            )
            continue
        if is_write_tool(tool):
            # Write tools are documented in the registry but skipped at
            # pre-fetch time. Phase 2.5 will surface them via function-
            # calling instead.
            continue
        try:
            result = tool.handler(actor, db)  # type: ignore[misc]
        except Exception as exc:  # noqa: BLE001 — fail-safe envelope
            logger.warning(
                "agent_tool_failed",
                extra={
                    "event": "agent_tool_failed",
                    "agent_id": agent.id,
                    "tool_id": tool_id,
                    "error_type": type(exc).__name__,
                },
            )
            out[tool_id] = {"error": str(exc)[:200]}
            continue
        out[tool_id] = _truncate_payload(tool_id, result)
    return out


__all__ = ["PER_TOOL_MAX_CHARS", "fetch_context"]
