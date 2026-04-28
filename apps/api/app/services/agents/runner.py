"""Agent runner — wraps an :class:`AgentDefinition` around a single LLM turn.

The runner is intentionally minimal in v1:

* it validates the user message length,
* (Phase 2 / ToolBroker) when a DB session + actor are supplied, it asks
  :func:`app.services.agents.broker.fetch_context` to pre-fetch every
  read-only tool the agent declares and folds the results into a
  ``<context source="clinic_live">`` block prepended to the user message,
* it also supports a caller-supplied ``context`` dict (legacy / test path),
* (Phase 2.5 / tool calls) the runner injects a system-prompt block telling
  the LLM how to *request* a write action via a one-line JSON object on the
  first line of its reply. Requests are NOT auto-executed; they're returned
  to the client as a ``pending_tool_call`` for explicit clinician approval,
  which arrives on a follow-up ``/run`` call carrying
  ``confirmed_tool_call_id``,
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
import time
from datetime import datetime, timedelta, timezone
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

#: Template for the tool-calling instruction injected into every system
#: prompt. ``{tools_csv}`` is filled with the agent's allowed *write*
#: tool ids at runtime. When the agent has no write tools the runner
#: omits this block entirely.
TOOL_CALL_SYSTEM_TEMPLATE = (
    "You can request a write action when the clinician asks you to. "
    "To request one, output exactly ONE JSON object on the FIRST LINE "
    "of your reply (no markdown, no prose before it):\n"
    '{{"tool_call": {{"id": "<tool_id>", "args": {{...}}, '
    '"summary": "<one sentence describing the change for the clinician '
    'to confirm>"}}}}\n'
    "After the JSON, you may add a short prose paragraph explaining why. "
    "The clinician must approve before any write happens. Available "
    "write tools for you: {tools_csv}.\n"
    "If no write is needed, just reply normally."
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


def _agent_write_tool_ids(agent: AgentDefinition) -> list[str]:
    """Return the subset of ``agent.tool_allowlist`` that are write tools.

    The truth source is :data:`tools.registry.TOOL_REGISTRY` — a tool is
    treated as "write" when its registry entry carries ``write_only=True``.
    Tools not in the registry are skipped (the broker logs a warning
    elsewhere).
    """
    from .tools.registry import TOOL_REGISTRY

    out: list[str] = []
    for tid in agent.tool_allowlist:
        tool = TOOL_REGISTRY.get(tid)
        if tool is not None and tool.write_only:
            out.append(tid)
    return out


def _augment_system_prompt(
    base_prompt: str, agent: AgentDefinition
) -> str:
    """Return ``base_prompt`` with the tool-calling instruction appended.

    Returns the unchanged prompt when the agent has no write tools.
    """
    write_tools = _agent_write_tool_ids(agent)
    if not write_tools:
        return base_prompt
    block = TOOL_CALL_SYSTEM_TEMPLATE.format(tools_csv=", ".join(write_tools))
    return f"{base_prompt}\n\n{block}"


def _try_parse_tool_call(reply: str) -> dict | None:
    """Extract a ``tool_call`` request from the FIRST LINE of ``reply``.

    Returns the inner ``tool_call`` dict if and only if:

    * the first line of ``reply`` is valid JSON, AND
    * that JSON is a dict containing a ``tool_call`` key whose value is
      itself a dict with at least an ``id`` and an ``args`` field.

    Anything else returns ``None`` (caller should treat the whole reply
    as plain text).
    """
    if not reply:
        return None
    first_line = reply.split("\n", 1)[0].strip()
    if not first_line or not first_line.startswith("{"):
        return None
    try:
        parsed = _json.loads(first_line)
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, dict):
        return None
    tc = parsed.get("tool_call")
    if not isinstance(tc, dict):
        return None
    tool_id = tc.get("id")
    args = tc.get("args")
    if not isinstance(tool_id, str) or not isinstance(args, dict):
        return None
    return tc


def _expires_at_iso(seconds_from_now: float) -> str:
    """Return an ISO-8601 UTC timestamp ``seconds_from_now`` in the future."""
    return (
        datetime.now(timezone.utc) + timedelta(seconds=seconds_from_now)
    ).isoformat()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def run_agent(
    agent: AgentDefinition,
    *,
    message: str,
    context: dict[str, Any] | None = None,
    actor: "AuthenticatedActor | None" = None,
    db: "Session | None" = None,
    confirmed_tool_call_id: str | None = None,
) -> dict:
    """Execute one turn of ``agent`` against ``message``.

    Two distinct flows are supported on the same entry point:

    * **First-call (no ``confirmed_tool_call_id``)** — the runner
      composes the system prompt (with the tool-call instruction when
      the agent has write tools), invokes the LLM, and either returns
      the plain text reply OR a ``pending_tool_call`` envelope when
      the LLM requested a write.
    * **Confirmation (``confirmed_tool_call_id`` set)** — the runner
      looks up the pending call in
      :mod:`app.services.agents.pending_calls`, verifies it belongs to
      this actor + agent, and executes it via the tool dispatcher.

    Reject path: a ``message`` of ``"reject"`` (case-insensitive) at
    confirmation time discards the pending call and returns
    ``{"reply": "OK, cancelled."}``.

    Returns a dict shaped::

        {
            "agent_id": str,
            "reply": str,
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": list[str],
            # plus optionally:
            "pending_tool_call": {...},
            "tool_call_executed": {...},
            "error": "<code>",
        }

    Never raises — all exceptions are swallowed and surfaced as ``error``.
    """
    # ---- Confirmation path --------------------------------------------
    # Routed first so the message-length gate doesn't reject a tiny
    # "approve" payload sitting next to a long original prompt.
    if confirmed_tool_call_id is not None:
        return _run_confirmation(
            agent=agent,
            message=message or "",
            actor=actor,
            db=db,
            confirmed_tool_call_id=confirmed_tool_call_id,
        )

    if message is None or len(message) > MAX_MESSAGE_CHARS:
        envelope = {
            "agent_id": agent.id,
            "reply": "",
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": [],
            "error": "message_too_long",
        }
        _safe_record_run(
            db=db,
            actor=actor,
            agent_id=agent.id,
            message=message or "",
            reply="",
            context_used=[],
            latency_ms=None,
            ok=False,
            error_code="message_too_long",
        )
        return envelope

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

    # ---- Phase 2.5: tool-calling instruction ---------------------------
    system_prompt = _augment_system_prompt(system_prompt, agent)

    t0 = time.monotonic()
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
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.warning(
            "agent_run_failed",
            extra={
                "event": "agent_run_failed",
                "agent_id": agent.id,
                "error_type": type(exc).__name__,
            },
        )
        _safe_record_run(
            db=db,
            actor=actor,
            agent_id=agent.id,
            message=message,
            reply="",
            context_used=context_used,
            latency_ms=latency_ms,
            ok=False,
            error_code="llm_call_failed",
        )
        return {
            "agent_id": agent.id,
            "reply": "",
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": context_used,
            "error": "llm_call_failed",
        }

    latency_ms = int((time.monotonic() - t0) * 1000)
    reply_str = reply_text or ""

    # ---- Phase 2.5: parse a possible tool-call request -----------------
    tool_call = _try_parse_tool_call(reply_str)
    if tool_call is not None:
        return _handle_tool_call_request(
            agent=agent,
            actor=actor,
            db=db,
            message=message,
            full_reply=reply_str,
            tool_call=tool_call,
            context_used=context_used,
            latency_ms=latency_ms,
        )

    _safe_record_run(
        db=db,
        actor=actor,
        agent_id=agent.id,
        message=message,
        reply=reply_str,
        context_used=context_used,
        latency_ms=latency_ms,
        ok=bool(reply_str),
        error_code=None if reply_str else "empty_reply",
    )
    return {
        "agent_id": agent.id,
        "reply": reply_str,
        "schema_id": SCHEMA_ID,
        "safety_footer": SAFETY_FOOTER,
        "context_used": context_used,
    }


# ---------------------------------------------------------------------------
# Phase 2.5 — tool-call request + confirmation paths
# ---------------------------------------------------------------------------


def _handle_tool_call_request(
    *,
    agent: AgentDefinition,
    actor: "AuthenticatedActor | None",
    db: "Session | None",
    message: str,
    full_reply: str,
    tool_call: dict,
    context_used: list[str],
    latency_ms: int,
) -> dict:
    """Vet an LLM-issued tool call and either register it or refuse.

    On a valid request we register a pending entry and return an
    envelope carrying the ``call_id`` the clinician must echo back to
    approve. On refusal (unknown tool, not in agent's allowlist, or
    actor missing) we return a plain reply explaining why and DO NOT
    register anything.
    """
    from . import pending_calls
    from .tool_dispatcher import WRITE_HANDLERS

    tool_id = str(tool_call.get("id") or "").strip()
    args = tool_call.get("args") or {}
    summary = str(tool_call.get("summary") or "").strip() or (
        f"Run {tool_id}"
    )

    # Refuse anything outside the agent's allowlist OR not in the dispatcher.
    allowed = set(agent.tool_allowlist or [])
    in_dispatcher = tool_id in WRITE_HANDLERS
    if tool_id not in allowed or not in_dispatcher:
        refusal = (
            f"I can't do that with this agent — '{tool_id}' is not in my "
            "allowed tool list. Try again or pick a different agent."
        )
        _safe_record_run(
            db=db,
            actor=actor,
            agent_id=agent.id,
            message=message,
            reply=refusal,
            context_used=context_used,
            latency_ms=latency_ms,
            ok=False,
            error_code=f"tool_not_allowed:{tool_id}",
        )
        return {
            "agent_id": agent.id,
            "reply": refusal,
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": context_used,
        }

    # Without an authenticated actor we can't scope the pending call.
    if actor is None:
        refusal = (
            "Tool call requested but no authenticated actor is available "
            "to confirm it."
        )
        _safe_record_run(
            db=db,
            actor=actor,
            agent_id=agent.id,
            message=message,
            reply=refusal,
            context_used=context_used,
            latency_ms=latency_ms,
            ok=False,
            error_code="tool_call_no_actor",
        )
        return {
            "agent_id": agent.id,
            "reply": refusal,
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": context_used,
        }

    pending = pending_calls.register(
        actor_id=actor.actor_id,
        agent_id=agent.id,
        tool_id=tool_id,
        args=dict(args),
        summary=summary,
    )

    # Surface the LLM's prose-after-JSON (if any) as the reply so the UI
    # can show the model's rationale next to the confirmation prompt.
    rationale = full_reply.split("\n", 1)[1].strip() if "\n" in full_reply else ""
    reply_text = rationale or "Awaiting your approval."
    _safe_record_run(
        db=db,
        actor=actor,
        agent_id=agent.id,
        message=message,
        reply=reply_text,
        context_used=context_used,
        latency_ms=latency_ms,
        ok=True,
        error_code=f"pending:{tool_id}",
    )
    return {
        "agent_id": agent.id,
        "reply": reply_text,
        "schema_id": SCHEMA_ID,
        "safety_footer": SAFETY_FOOTER,
        "context_used": context_used,
        "pending_tool_call": {
            "call_id": pending.call_id,
            "tool_id": pending.tool_id,
            "args": dict(pending.args),
            "summary": pending.summary,
            "expires_at": _expires_at_iso(pending_calls.PENDING_TTL_SECONDS),
        },
    }


def _run_confirmation(
    *,
    agent: AgentDefinition,
    message: str,
    actor: "AuthenticatedActor | None",
    db: "Session | None",
    confirmed_tool_call_id: str,
) -> dict:
    """Resolve a clinician confirmation of a previously-issued tool call."""
    from . import pending_calls
    from .tool_dispatcher import InvalidArgs, UnknownTool, execute

    # Reject path — clinician explicitly cancelled.
    if (message or "").strip().lower() == "reject":
        pending_calls.discard(confirmed_tool_call_id)
        _safe_record_run(
            db=db,
            actor=actor,
            agent_id=agent.id,
            message=message,
            reply="OK, cancelled.",
            context_used=[],
            latency_ms=None,
            ok=True,
            error_code="rejected",
        )
        return {
            "agent_id": agent.id,
            "reply": "OK, cancelled.",
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": [],
        }

    if actor is None or db is None:
        return {
            "agent_id": agent.id,
            "reply": "",
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": [],
            "error": "confirmation_requires_actor",
        }

    pending = pending_calls.consume(
        confirmed_tool_call_id,
        actor_id=actor.actor_id,
        agent_id=agent.id,
    )
    if pending is None:
        msg = "This confirmation has expired or was not found."
        _safe_record_run(
            db=db,
            actor=actor,
            agent_id=agent.id,
            message=message,
            reply=msg,
            context_used=[],
            latency_ms=None,
            ok=False,
            error_code="pending_call_not_found",
        )
        return {
            "agent_id": agent.id,
            "reply": msg,
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": [],
            "error": "pending_call_not_found",
        }

    try:
        outcome = execute(pending.tool_id, pending.args, actor, db)
    except UnknownTool:
        msg = (
            f"Tool '{pending.tool_id}' is not registered in this build."
        )
        _safe_record_run(
            db=db,
            actor=actor,
            agent_id=agent.id,
            message=message,
            reply=msg,
            context_used=[],
            latency_ms=None,
            ok=False,
            error_code=f"unknown_tool:{pending.tool_id}",
        )
        return {
            "agent_id": agent.id,
            "reply": msg,
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": [],
            "error": "unknown_tool",
        }
    except InvalidArgs as ie:
        msg = (
            f"The args for '{pending.tool_id}' failed validation: "
            f"{ie.errors!r}"
        )
        _safe_record_run(
            db=db,
            actor=actor,
            agent_id=agent.id,
            message=message,
            reply=msg,
            context_used=[],
            latency_ms=None,
            ok=False,
            error_code=f"invalid_args:{pending.tool_id}",
        )
        return {
            "agent_id": agent.id,
            "reply": msg,
            "schema_id": SCHEMA_ID,
            "safety_footer": SAFETY_FOOTER,
            "context_used": [],
            "error": "invalid_args",
        }

    ok = bool(outcome.get("ok"))
    result = outcome.get("result")
    result_text = result if isinstance(result, str) else _json.dumps(
        result, default=str
    )
    error_code = (
        f"executed:{pending.tool_id}" if ok else f"failed:{pending.tool_id}"
    )

    audit_row = _safe_record_run(
        db=db,
        actor=actor,
        agent_id=agent.id,
        message=message,
        reply=result_text,
        context_used=[],
        latency_ms=None,
        ok=ok,
        error_code=error_code,
    )

    audit_id = getattr(audit_row, "id", None) if audit_row is not None else None
    return {
        "agent_id": agent.id,
        "reply": result_text,
        "schema_id": SCHEMA_ID,
        "safety_footer": SAFETY_FOOTER,
        "context_used": [],
        "tool_call_executed": {
            "tool_id": pending.tool_id,
            "ok": ok,
            "result_preview": result_text[:200],
            "audit_id": audit_id,
        },
    }


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------


def _safe_record_run(
    *,
    db: "Session | None",
    actor: "AuthenticatedActor | None",
    agent_id: str,
    message: str,
    reply: str,
    context_used: list[str],
    latency_ms: int | None,
    ok: bool,
    error_code: str | None,
):
    """Best-effort wrapper around :func:`audit.record_run`.

    The audit table is non-critical to the user-facing response — if a
    DB hiccup or a misconfigured test session breaks the insert we log
    a warning and continue. The agent reply is what the user is waiting
    for; losing the audit row never blocks it.

    Skipped entirely when ``db`` is ``None`` (legacy callers / unit tests
    that exercise the runner without a DB).

    Returns the persisted ``AgentRunAudit`` row on success, or ``None``
    when audit was skipped or failed. Phase 2.5's tool-execution path
    needs the row id back so it can echo it in ``tool_call_executed``.
    """
    if db is None:
        return None
    try:
        from . import audit

        return audit.record_run(
            db=db,
            actor=actor,
            agent_id=agent_id,
            message=message,
            reply=reply,
            context_used=context_used,
            latency_ms=latency_ms,
            ok=ok,
            error_code=error_code,
        )
    except Exception as exc:  # noqa: BLE001 — never break the run on audit failure
        logger.warning(
            "agent_run_audit_failed",
            extra={
                "event": "agent_run_audit_failed",
                "agent_id": agent_id,
                "error_type": type(exc).__name__,
                "error_message": str(exc),
            },
        )
        return None


__all__ = [
    "MAX_CONTEXT_CHARS",
    "MAX_MESSAGE_CHARS",
    "LIVE_CONTEXT_SYSTEM_FOOTER",
    "SAFETY_FOOTER",
    "SCHEMA_ID",
    "TOOL_CALL_SYSTEM_TEMPLATE",
    "run_agent",
]
