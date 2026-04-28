"""Route a clinician's free-text Telegram message through the DrClaw
Doctor agent and produce a Telegram-friendly reply.

The clinician Telegram bot is wired up in
:mod:`app.routers.telegram_router`. Pre-existing flows (LINK / CONFIRM /
CANCEL / HELP slash-commands and free-text → ``chat_agent``) stay
untouched. This module adds two integration points:

* :func:`dispatch_clinician_message` — route a non-slash message through
  the ``clinic.drclaw_telegram`` agent and shape the structured envelope
  back into a Telegram payload. When the agent emits a
  ``pending_tool_call`` the dispatcher returns an ``inline_keyboard``
  alongside the prompt so the clinician can approve / reject in-line.
* :func:`handle_drclaw_callback` — driven by the webhook when a
  ``callback_query`` arrives (a button tap). Validates the payload,
  runs the runner's confirmation path for Approve, drops the pending
  call for Reject, edits the original message in place, and answers
  the callback_query so the user's tap registers.
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from app.auth import AuthenticatedActor
from app.persistence.models import User
from app.services.agents import pending_calls
from app.services.agents.registry import AGENT_REGISTRY
from app.services.agents.runner import run_agent
from app.services.telegram_service import (
    answer_callback_query,
    edit_message_text,
    get_user_id_for_chat,
    send_message_with_keyboard,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

#: Stable agent id for the DrClaw Telegram persona — kept as a
#: module-level constant so a typo blows up at import time.
DRCLAW_AGENT_ID = "clinic.drclaw_telegram"

#: URL the dispatcher used to point clinicians to when a write needed
#: explicit confirmation in the web app. Kept around for callers that
#: still want to render a "open in browser" link, but no longer the
#: default behaviour — Telegram-side approval is in-band now.
WEB_APP_URL = "https://deepsynaps-studio-preview.netlify.app/?page=dashboard"

#: Friendly, fixed reply when the inbound chat is not linked to any user.
_REPLY_NO_LINK = (
    "This Telegram account isn't linked. Use /link to set it up."
)

#: Friendly, fixed reply when the linked user lacks an entitled package.
_REPLY_NO_PACKAGE = (
    "DrClaw requires a Pro or Enterprise plan. Visit your "
    "DeepSynaps web dashboard to upgrade."
)

#: Refusal when callback_query arrives from an unlinked Telegram user.
_CB_NOT_LINKED = "This account is not linked."

#: Refusal when callback_data doesn't match the documented shape.
_CB_BAD_SHAPE = "Action not recognised."

#: Stable callback_data namespace + opcode regex. Kept tight so a
#: malformed / spoofed payload can't smuggle non-hex into the lookup.
#: Format: ``drclaw:<apr|rej>:<32-hex call_id>``  → 41 bytes, well
#: under Telegram's 64-byte cap on callback_data.
_CALLBACK_DATA_RE = re.compile(r"^drclaw:(apr|rej):([0-9a-f]{32})$")


def dispatch_clinician_message(
    *,
    db: "Session",
    telegram_user_id: int,
    telegram_chat_id: int,
    message_text: str,
) -> dict:
    """Route a clinician's free-text Telegram message through DrClaw.

    The Telegram webhook owns:

    * webhook-secret validation (already done before we're called),
    * link / unlink / slash-command routing,
    * outbound message sending.

    This dispatcher owns the small slice in between: turn an authenticated
    Telegram chat into an :class:`AuthenticatedActor`, gate it on package
    entitlement, run the agent, and shape the structured envelope into a
    Telegram-friendly payload.

    Returns
    -------
    dict
        Always carries::

            {
                "ok": bool,
                "reason": str | None,           # short stable code
                "reply_text": str,              # always set; safe to send
            }

        And optionally, when the agent issued a ``pending_tool_call`` and
        we want the webhook to render an inline approval keyboard::

            {
                ...,
                "inline_keyboard": [[{"text": ..., "callback_data": ...}, ...]],
                "pending_call_id": str,
            }

        ``ok=False`` is reserved for *expected* refusals (no link, package
        gate). LLM / tool failures still return ``ok=True`` with the
        runner's error envelope flattened to a friendly string — the
        clinician should always get a Telegram reply, never a silent drop.
    """
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

    actor = _actor_from_user(user)

    agent = AGENT_REGISTRY.get(DRCLAW_AGENT_ID)
    if agent is None:  # pragma: no cover — registry is module-level
        return {
            "ok": False,
            "reason": "agent_not_registered",
            "reply_text": "DrClaw is not available in this build.",
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

    response = run_agent(
        agent,
        message=message_text,
        actor=actor,
        db=db,
    )

    envelope = _compose_dispatch_envelope(response)
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
    out: dict = {"ok": True, "reason": None, "reply_text": envelope["reply_text"]}
    if envelope.get("inline_keyboard"):
        out["inline_keyboard"] = envelope["inline_keyboard"]
        out["pending_call_id"] = envelope["pending_call_id"]
    return out


def handle_drclaw_callback(
    *,
    db: "Session",
    bot_kind: str,
    callback_query: dict,
) -> None:
    """Handle a ``callback_query`` update from the clinician bot.

    Lifecycle:

    1. Parse ``callback_data`` against :data:`_CALLBACK_DATA_RE`. Bad
       shape → answerCallbackQuery with a friendly error and stop.
    2. Resolve the linked clinician via the chat_id on
       ``callback_query.message.chat.id``. Unlinked → polite refusal.
    3. Build an :class:`AuthenticatedActor` the same way
       :func:`dispatch_clinician_message` does.
    4. Approve → :func:`run_agent` with ``confirmed_tool_call_id``.
       Reject → drop the pending call directly via
       :func:`pending_calls.discard` (the runner's reject path needs
       both ``confirmed_tool_call_id`` AND a ``"reject"`` message; we
       go straight to discard here so we don't burn an LLM call).
    5. Edit the original message in place (buttons removed). If editing
       fails — message too old, network blip — fall back to a fresh
       message so the clinician still sees the result.
    6. Always answer the callback_query so the spinner clears.

    Never raises — exceptions are logged and swallowed; the webhook
    must always return ``{"ok": True}`` so Telegram doesn't keep
    retrying.
    """
    cq_id = str(callback_query.get("id") or "")
    raw_data = str(callback_query.get("data") or "")

    msg = callback_query.get("message") or {}
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    message_id = msg.get("message_id")
    from_user = callback_query.get("from") or {}
    tg_user_id = from_user.get("id")

    match = _CALLBACK_DATA_RE.match(raw_data)
    if match is None:
        logger.info(
            "drclaw_callback_bad_shape",
            extra={
                "event": "drclaw_callback_bad_shape",
                "telegram_user_id": tg_user_id,
                "telegram_chat_id": chat_id,
            },
        )
        if cq_id:
            answer_callback_query(
                bot_kind=bot_kind,
                callback_query_id=cq_id,
                text=_CB_BAD_SHAPE,
            )
        return

    opcode, call_id = match.group(1), match.group(2)

    if not chat_id:
        # No chat to edit — just acknowledge so the spinner clears.
        if cq_id:
            answer_callback_query(
                bot_kind=bot_kind,
                callback_query_id=cq_id,
                text=_CB_BAD_SHAPE,
            )
        return

    user_id = get_user_id_for_chat(db, chat_id, "clinician")
    if not user_id:
        logger.info(
            "drclaw_callback_unlinked",
            extra={
                "event": "drclaw_callback_unlinked",
                "telegram_user_id": tg_user_id,
                "telegram_chat_id": chat_id,
            },
        )
        if cq_id:
            answer_callback_query(
                bot_kind=bot_kind,
                callback_query_id=cq_id,
                text=_CB_NOT_LINKED,
            )
        return

    user = db.query(User).filter_by(id=user_id).first()
    if user is None:
        if cq_id:
            answer_callback_query(
                bot_kind=bot_kind,
                callback_query_id=cq_id,
                text=_CB_NOT_LINKED,
            )
        return

    actor = _actor_from_user(user)

    agent = AGENT_REGISTRY.get(DRCLAW_AGENT_ID)
    if agent is None:  # pragma: no cover — registry is module-level
        if cq_id:
            answer_callback_query(
                bot_kind=bot_kind,
                callback_query_id=cq_id,
                text="DrClaw not available.",
            )
        return

    if opcode == "rej":
        # Drop the pending call directly — no LLM call needed.
        removed = pending_calls.discard(call_id)
        if removed:
            result_text = "Cancelled."
            tooltip = "Cancelled"
        else:
            result_text = "This action has expired."
            tooltip = "Expired"
        logger.info(
            "drclaw_callback_reject",
            extra={
                "event": "drclaw_callback_reject",
                "actor_id": actor.actor_id,
                "call_id": call_id,
                "removed": removed,
            },
        )
    else:
        # Approve path → drive the runner's confirmation flow.
        response = run_agent(
            agent,
            message="approve",
            actor=actor,
            db=db,
            confirmed_tool_call_id=call_id,
        )
        executed = response.get("tool_call_executed")
        if executed:
            preview = (executed.get("result_preview") or "").strip()
            prefix = "✓" if executed.get("ok") else "✗"
            result_text = f"{prefix} {preview}".rstrip()
            tooltip = "Done" if executed.get("ok") else "Failed"
        else:
            reply = (response.get("reply") or "").strip()
            err = response.get("error")
            if err == "pending_call_not_found" or "expired" in reply.lower():
                result_text = "⚠ This action has expired."
                tooltip = "Expired"
            elif reply:
                result_text = reply
                tooltip = "Done"
            else:
                result_text = "Action could not be completed."
                tooltip = "Error"
        logger.info(
            "drclaw_callback_approve",
            extra={
                "event": "drclaw_callback_approve",
                "actor_id": actor.actor_id,
                "call_id": call_id,
                "had_executed": bool(executed),
                "error_code": response.get("error"),
            },
        )

    truncated = _truncate_for_telegram(result_text)

    edited = False
    if message_id is not None:
        edit_out = edit_message_text(
            bot_kind=bot_kind,
            chat_id=chat_id,
            message_id=int(message_id),
            text=truncated,
            inline_keyboard=None,
        )
        edited = bool(edit_out.get("ok"))
        if not edited:
            logger.info(
                "drclaw_callback_edit_failed",
                extra={
                    "event": "drclaw_callback_edit_failed",
                    "telegram_chat_id": chat_id,
                    "telegram_message_id": message_id,
                    "error": edit_out.get("error"),
                },
            )

    if not edited:
        # Fall back to a fresh message so the clinician still sees the
        # result even if the original message can't be edited.
        send_message_with_keyboard(
            bot_kind=bot_kind,
            chat_id=chat_id,
            text=truncated,
            inline_keyboard=None,
        )

    if cq_id:
        answer_callback_query(
            bot_kind=bot_kind,
            callback_query_id=cq_id,
            text=tooltip,
        )


def _actor_from_user(user: User) -> AuthenticatedActor:
    """Hydrate an :class:`AuthenticatedActor` from a persisted User row.

    Mirrors :func:`app.auth.get_authenticated_actor` for the webhook
    path which has no JWT.
    """
    return AuthenticatedActor(
        actor_id=user.id,
        display_name=user.display_name,
        role=user.role,  # type: ignore[arg-type]
        package_id=user.package_id or "explorer",
        clinic_id=user.clinic_id,
    )


def _truncate_for_telegram(text: str, *, cap: int = 3900) -> str:
    """Mirror :func:`telegram_router._truncate_reply` so callback edits
    obey the same character cap as outbound sends."""
    if len(text) <= cap:
        return text
    return text[: cap - 1] + "…"


def _compose_dispatch_envelope(response: dict) -> dict:
    """Flatten the runner's structured envelope into a Telegram payload.

    Returns a dict carrying ``reply_text`` plus, when relevant,
    ``inline_keyboard`` + ``pending_call_id``.
    """
    pending = response.get("pending_tool_call")
    if pending:
        summary = (pending.get("summary") or "").strip() or pending.get(
            "tool_id", ""
        )
        call_id = str(pending.get("call_id") or "")
        text = (
            f"⚠️ {summary}\n\nApprove or reject below."
        )
        return {
            "reply_text": text,
            "inline_keyboard": [
                [
                    {
                        "text": "✅ Approve",
                        "callback_data": f"drclaw:apr:{call_id}",
                    },
                    {
                        "text": "❌ Reject",
                        "callback_data": f"drclaw:rej:{call_id}",
                    },
                ]
            ],
            "pending_call_id": call_id,
        }

    executed = response.get("tool_call_executed")
    if executed:
        preview = (executed.get("result_preview") or "").strip()
        if executed.get("ok"):
            return {"reply_text": f"✓ {preview}".rstrip()}
        return {"reply_text": f"✗ {preview}".rstrip()}

    reply = (response.get("reply") or "").strip()
    if reply:
        return {"reply_text": reply}

    return {
        "reply_text": (
            "I couldn't generate a reply just now. Please try again in a "
            "moment."
        )
    }


__all__ = [
    "DRCLAW_AGENT_ID",
    "WEB_APP_URL",
    "dispatch_clinician_message",
    "handle_drclaw_callback",
]
