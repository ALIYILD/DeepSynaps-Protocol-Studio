"""Route a clinician's free-text Telegram message through the AliClaw
Doctor agent and produce a Telegram-friendly reply.

The clinician Telegram bot is wired up in
:mod:`app.routers.telegram_router`. Pre-existing flows (LINK / CONFIRM /
CANCEL / HELP slash-commands and free-text → ``chat_agent``) stay
untouched. This module adds a single, narrow integration: when a linked
clinician sends a non-slash message, route it through the
``clinic.aliclaw_doctor_telegram`` agent registered in
:mod:`app.services.agents.registry` and turn the structured agent
envelope back into a single short Telegram message.

Phase 1 deliberately defers two-step *write* tool calls. When the agent
returns a ``pending_tool_call`` we do NOT register a Telegram callback
button — instead we tell the clinician to switch to the web app to
approve. Telegram inline-keyboard / callback_query handling is a phase 2
concern (see TODO inline below).
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.auth import AuthenticatedActor
from app.persistence.models import User
from app.services.agents.registry import AGENT_REGISTRY
from app.services.agents.runner import run_agent
from app.services.telegram_service import get_user_id_for_chat

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

#: Stable agent id for the AliClaw Doctor Telegram persona — kept as a
#: module-level constant so a typo blows up at import time.
ALICLAW_AGENT_ID = "clinic.aliclaw_doctor_telegram"

#: URL the dispatcher points clinicians to when a write needs explicit
#: confirmation in the web app. Lives in ``CLAUDE.md`` as the canonical
#: preview deploy.
WEB_APP_URL = "https://deepsynaps-studio-preview.netlify.app/?page=dashboard"

#: Friendly, fixed reply when the inbound chat is not linked to any user.
_REPLY_NO_LINK = (
    "This Telegram account isn't linked. Use /link to set it up."
)

#: Friendly, fixed reply when the linked user lacks an entitled package.
_REPLY_NO_PACKAGE = (
    "AliClaw Doctor requires a Pro or Enterprise plan. Visit your "
    "DeepSynaps web dashboard to upgrade."
)


def dispatch_clinician_message(
    *,
    db: "Session",
    telegram_user_id: int,
    telegram_chat_id: int,
    message_text: str,
) -> dict:
    """Route a clinician's free-text Telegram message through AliClaw Doctor.

    The Telegram webhook owns:

    * webhook-secret validation (already done before we're called),
    * link / unlink / slash-command routing,
    * outbound message sending.

    This dispatcher owns the small slice in between: turn an authenticated
    Telegram chat into an :class:`AuthenticatedActor`, gate it on package
    entitlement, run the agent, and shape the structured envelope into one
    short Telegram-friendly string.

    Returns
    -------
    dict
        Always shaped::

            {
                "ok": bool,
                "reason": str | None,           # short stable code
                "reply_text": str,              # always set; safe to send
            }

        ``ok=False`` is reserved for *expected* refusals (no link, package
        gate). LLM / tool failures still return ``ok=True`` with the
        runner's error envelope flattened to a friendly string — the
        clinician should always get a Telegram reply, never a silent drop.
    """
    # Step 1 — resolve the linked clinician user. ``telegram_user_id`` is
    # the Telegram-side numeric user id; the existing wiring keys
    # ``TelegramUserChat`` rows by ``chat_id`` (which is what the existing
    # webhook handler stores). For a 1:1 private DM the chat_id and user
    # id are interchangeable; mirror the existing handler's behaviour and
    # look the row up by chat_id so this dispatcher composes cleanly with
    # what's already on disk.
    user_id = get_user_id_for_chat(db, telegram_chat_id, "clinician")
    if not user_id:
        logger.info(
            "telegram_agent_dispatch",
            extra={
                "event": "telegram_agent_dispatch",
                "outcome": "no_linked_account",
                "telegram_user_id": telegram_user_id,
                "telegram_chat_id": telegram_chat_id,
            },
        )
        return {
            "ok": False,
            "reason": "no_linked_account",
            "reply_text": _REPLY_NO_LINK,
        }

    # Step 2 — hydrate an AuthenticatedActor from the User row. The
    # webhook does not carry a JWT, so we synthesise the actor the same
    # way :func:`app.auth.get_authenticated_actor` would for a logged-in
    # session. Missing User row = treat as unlinked (the chat row is
    # stale).
    user = db.query(User).filter_by(id=user_id).first()
    if user is None:
        logger.info(
            "telegram_agent_dispatch",
            extra={
                "event": "telegram_agent_dispatch",
                "outcome": "no_linked_account",
                "telegram_user_id": telegram_user_id,
                "telegram_chat_id": telegram_chat_id,
                "user_id": user_id,
            },
        )
        return {
            "ok": False,
            "reason": "no_linked_account",
            "reply_text": _REPLY_NO_LINK,
        }

    actor = AuthenticatedActor(
        actor_id=user.id,
        display_name=user.display_name,
        role=user.role,  # type: ignore[arg-type]
        package_id=user.package_id or "explorer",
        clinic_id=user.clinic_id,
    )

    # Step 3 — package gate. Mirror :mod:`app.routers.agents_router`'s
    # check verbatim so a clinician who's blocked on the web /run endpoint
    # is also blocked here. Bail BEFORE invoking the LLM so we don't burn
    # tokens on a request we'd refuse anyway.
    agent = AGENT_REGISTRY.get(ALICLAW_AGENT_ID)
    if agent is None:  # pragma: no cover — registry is module-level
        return {
            "ok": False,
            "reason": "agent_not_registered",
            "reply_text": "AliClaw Doctor is not available in this build.",
        }

    if agent.package_required and (
        actor.package_id not in agent.package_required
    ):
        logger.info(
            "telegram_agent_dispatch",
            extra={
                "event": "telegram_agent_dispatch",
                "outcome": "package_not_allowed",
                "actor_id": actor.actor_id,
                "actor_package": actor.package_id,
                "required": agent.package_required,
            },
        )
        return {
            "ok": False,
            "reason": "package_not_allowed",
            "reply_text": _REPLY_NO_PACKAGE,
        }

    # Step 4 — run the agent. The runner already writes an
    # ``AgentRunAudit`` row, so we MUST NOT double-audit here.
    #
    # TODO(phase 2): Telegram-side approval of pending_tool_call via
    # callback_query / inline keyboard buttons. v1 punts on this and
    # tells the clinician to approve in the web app instead.
    response = run_agent(
        agent,
        message=message_text,
        actor=actor,
        db=db,
    )

    reply_text = _compose_reply(response)
    logger.info(
        "telegram_agent_dispatch",
        extra={
            "event": "telegram_agent_dispatch",
            "outcome": "dispatched",
            "actor_id": actor.actor_id,
            "agent_id": agent.id,
            "had_pending_tool_call": bool(response.get("pending_tool_call")),
            "had_tool_call_executed": bool(response.get("tool_call_executed")),
            "error_code": response.get("error"),
        },
    )
    return {"ok": True, "reason": None, "reply_text": reply_text}


def _compose_reply(response: dict) -> str:
    """Flatten the runner's structured envelope into one Telegram string.

    Priority (mirrors the contract documented in the runner):

    1. ``pending_tool_call`` — write requires confirmation. Phase 1 routes
       the clinician to the web app rather than handling the approval
       in-line over Telegram.
    2. ``tool_call_executed`` — a previously-confirmed write ran. Prefix
       with ``"✓"`` on success or ``"✗"`` on failure so the clinician can
       scan the outcome at a glance.
    3. ``reply`` — plain LLM reply. Returned verbatim.

    Any unexpected envelope (empty reply + no tool fields) collapses to a
    short generic message so the clinician never sees a blank chat
    bubble.
    """
    pending = response.get("pending_tool_call")
    if pending:
        summary = (pending.get("summary") or "").strip() or pending.get(
            "tool_id", ""
        )
        return (
            "⚠️ This action needs your confirmation. I can't yet do that "
            "from Telegram — please open the DeepSynaps app:\n"
            f"{WEB_APP_URL}\n\n"
            f"The agent suggested: {summary}"
        )

    executed = response.get("tool_call_executed")
    if executed:
        preview = (executed.get("result_preview") or "").strip()
        if executed.get("ok"):
            return f"✓ {preview}".rstrip()
        return f"✗ {preview}".rstrip()

    reply = (response.get("reply") or "").strip()
    if reply:
        return reply

    # Defensive fallback. The runner's failure path already records an
    # audit row with the error code; surface a brief note to the
    # clinician so the chat doesn't go silent.
    return (
        "I couldn't generate a reply just now. Please try again in a "
        "moment."
    )


__all__ = [
    "ALICLAW_AGENT_ID",
    "WEB_APP_URL",
    "dispatch_clinician_message",
]
