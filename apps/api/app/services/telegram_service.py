"""
Telegram notification service.
Uses python-telegram-bot in simple HTTP mode (no async polling).
Falls back gracefully if TELEGRAM_BOT_TOKEN is not set.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy.orm import Session

from app.persistence.models import TelegramPendingLink, TelegramUserChat
from app.settings import get_settings

logger = logging.getLogger(__name__)

BotKind = Literal["patient", "clinician"]


# ---------------------------------------------------------------------------
# MarkdownV2 helpers
# ---------------------------------------------------------------------------
# Telegram's MarkdownV2 parser reserves 18 characters that must be escaped
# whenever they appear as literal text inside a formatted message. Reference:
# https://core.telegram.org/bots/api#markdownv2-style
#
# Use :func:`escape_markdown_v2` on user-supplied substrings BEFORE splicing
# them into a markdown template. We never auto-escape the entire reply
# because the LLM is asked (in the DrClaw system prompt) to emit
# already-escaped MarkdownV2 — auto-escaping its output would double-escape
# the bold / italic / monospace markers it intentionally produced.
_MV2_SPECIAL = r"_*[]()~`>#+-=|{}.!"


def escape_markdown_v2(text: str) -> str:
    """Escape characters that have semantic meaning in MarkdownV2.

    Use on user-supplied substrings before splicing into a markdown
    template. The 18 reserved characters are documented as
    ``_*[]()~`>#+-=|{}.!`` — every one of them must be prefixed with a
    backslash whenever rendered as literal text. Don't shrink the set,
    even for characters that "look harmless" (``.``, ``-``, ``=``) —
    Telegram still rejects the message if any reserved character is
    unescaped.

    Reference: https://core.telegram.org/bots/api#markdownv2-style
    """
    out: list[str] = []
    for ch in text:
        if ch in _MV2_SPECIAL:
            out.append("\\")
        out.append(ch)
    return "".join(out)


def _is_parse_entities_error(exc: Exception) -> bool:
    """Heuristic — does the Telegram error look like a MarkdownV2 parse failure?

    Telegram returns 400 with a body like ``can't parse entities: ...``
    when the parse_mode payload is malformed. python-telegram-bot raises
    a :class:`telegram.error.BadRequest` whose ``str()`` carries that
    message. We can't ``isinstance`` against the SDK exception class
    without importing it (and it's optional), so we string-match.
    """
    msg = str(exc).lower()
    return "can't parse" in msg or "parse entities" in msg or "bad request" in msg


def _token_for_kind(bot_kind: BotKind) -> str | None:
    s = get_settings()
    if bot_kind == "patient":
        t = (s.telegram_bot_token_patient or s.telegram_bot_token or "").strip()
    else:
        t = (s.telegram_bot_token_clinician or s.telegram_bot_token or "").strip()
    return t or None


def _make_bot(token: str):
    try:
        from telegram import Bot
        return Bot(token=token)
    except ImportError:
        logger.warning("python-telegram-bot not installed; Telegram notifications disabled.")
        return None
    except Exception as e:
        logger.warning("Telegram bot init failed: %s", e)
        return None


def _build_inline_markup(inline_keyboard: list[list[dict]] | None):
    """Convert a JSON-shaped inline keyboard into a python-telegram-bot
    :class:`InlineKeyboardMarkup`.

    The dispatcher / webhook stay in plain dicts so callers don't have
    to import the telegram SDK; this helper does the one-shot mapping.
    Returns ``None`` when ``inline_keyboard`` is empty or the SDK is
    unavailable — the caller falls back to a plain text message.
    """
    if not inline_keyboard:
        return None
    try:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    except ImportError:  # pragma: no cover — telegram SDK missing
        logger.warning("python-telegram-bot not installed; keyboard skipped.")
        return None
    rows = []
    for row in inline_keyboard:
        buttons = []
        for btn in row:
            text = btn.get("text", "")
            cb = btn.get("callback_data")
            url = btn.get("url")
            if cb is not None:
                buttons.append(InlineKeyboardButton(text=text, callback_data=cb))
            elif url is not None:
                buttons.append(InlineKeyboardButton(text=text, url=url))
        if buttons:
            rows.append(buttons)
    if not rows:
        return None
    return InlineKeyboardMarkup(rows)


def send_message_with_keyboard(
    *,
    bot_kind: BotKind,
    chat_id: int | str,
    text: str,
    inline_keyboard: list[list[dict]] | None = None,
    parse_mode: str | None = None,
) -> dict:
    """Send Telegram message with optional inline keyboard.

    ``inline_keyboard`` follows the Telegram Bot API shape, e.g.::

        [[{"text": "✅ Approve", "callback_data": "drclaw:apr:<call_id>"},
          {"text": "❌ Reject",  "callback_data": "drclaw:rej:<call_id>"}]]

    Returns a dict ``{"ok": bool, "message_id": int | None}`` so callers
    can correlate later edits. Errors are swallowed and surface as
    ``{"ok": False, ...}`` — Telegram outages must not crash the webhook.
    """
    token = _token_for_kind(bot_kind)
    if not token:
        return {"ok": False, "message_id": None, "error": "no_token"}
    bot = _make_bot(token)
    if bot is None:
        return {"ok": False, "message_id": None, "error": "no_bot"}
    markup = _build_inline_markup(inline_keyboard)
    kwargs: dict = {"chat_id": chat_id, "text": text}
    if parse_mode:
        kwargs["parse_mode"] = parse_mode
    if markup is not None:
        kwargs["reply_markup"] = markup
    try:
        sent = asyncio.run(bot.send_message(**kwargs))
        message_id = getattr(sent, "message_id", None)
        return {"ok": True, "message_id": message_id}
    except Exception as e:
        # MarkdownV2 fallback: when Telegram rejects the formatted payload
        # (bad escapes, unbalanced markers), retry once as plain text so
        # the clinician still sees a readable message instead of silence.
        if parse_mode and _is_parse_entities_error(e):
            snippet = text if len(text) <= 200 else text[:199] + "…"
            logger.warning(
                "Telegram parse_mode=%s rejected; retrying as plain text. "
                "error=%s text=%r",
                parse_mode,
                e,
                snippet,
            )
            try:
                fallback_kwargs = dict(kwargs)
                fallback_kwargs.pop("parse_mode", None)
                sent = asyncio.run(bot.send_message(**fallback_kwargs))
                message_id = getattr(sent, "message_id", None)
                return {"ok": True, "message_id": message_id, "fallback": True}
            except Exception as e2:
                logger.error(
                    "Telegram send_message_with_keyboard plain-text retry failed: %s",
                    e2,
                )
                return {"ok": False, "message_id": None, "error": str(e2)}
        logger.error("Telegram send_message_with_keyboard failed: %s", e)
        return {"ok": False, "message_id": None, "error": str(e)}


def send_message(
    chat_id: str | int,
    text: str,
    *,
    bot_kind: BotKind = "patient",
    parse_mode: str | None = "Markdown",
) -> bool:
    """Send a plain text message. Returns True on success.

    Thin wrapper around :func:`send_message_with_keyboard` so existing
    callers (slash-command flows, daily digests, reminders) stay on the
    same code path as the new keyboard-aware send.
    """
    out = send_message_with_keyboard(
        bot_kind=bot_kind,
        chat_id=chat_id,
        text=text,
        inline_keyboard=None,
        parse_mode=parse_mode,
    )
    return bool(out.get("ok"))


def edit_message_text(
    *,
    bot_kind: BotKind,
    chat_id: int | str,
    message_id: int,
    text: str,
    inline_keyboard: list[list[dict]] | None = None,
    parse_mode: str | None = None,
) -> dict:
    """Edit a message previously sent by the bot.

    Used after a callback_query has been handled so the inline buttons
    disappear and the result text replaces the prompt. Pass an empty /
    ``None`` keyboard to drop the buttons.
    """
    token = _token_for_kind(bot_kind)
    if not token:
        return {"ok": False, "error": "no_token"}
    bot = _make_bot(token)
    if bot is None:
        return {"ok": False, "error": "no_bot"}
    markup = _build_inline_markup(inline_keyboard)
    kwargs: dict = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
    }
    if parse_mode:
        kwargs["parse_mode"] = parse_mode
    if markup is not None:
        kwargs["reply_markup"] = markup
    try:
        asyncio.run(bot.edit_message_text(**kwargs))
        return {"ok": True}
    except Exception as e:
        # Same single-shot fallback as send_message_with_keyboard so a
        # malformed MarkdownV2 edit doesn't leave stale buttons on a
        # message — retry once as plain text.
        if parse_mode and _is_parse_entities_error(e):
            snippet = text if len(text) <= 200 else text[:199] + "…"
            logger.warning(
                "Telegram parse_mode=%s rejected on edit; retrying as plain text. "
                "error=%s text=%r",
                parse_mode,
                e,
                snippet,
            )
            try:
                fallback_kwargs = dict(kwargs)
                fallback_kwargs.pop("parse_mode", None)
                asyncio.run(bot.edit_message_text(**fallback_kwargs))
                return {"ok": True, "fallback": True}
            except Exception as e2:
                logger.error(
                    "Telegram edit_message_text plain-text retry failed: %s",
                    e2,
                )
                return {"ok": False, "error": str(e2)}
        logger.error("Telegram edit_message_text failed: %s", e)
        return {"ok": False, "error": str(e)}


def answer_callback_query(
    *,
    bot_kind: BotKind,
    callback_query_id: str,
    text: str = "",
    show_alert: bool = False,
) -> dict:
    """Acknowledge a callback_query.

    Telegram requires this within ~10s — without it the user's tap
    never resolves and they see a perpetual spinner on the button. We
    swallow errors so an outage on this leg can't crash the webhook.
    """
    token = _token_for_kind(bot_kind)
    if not token:
        return {"ok": False, "error": "no_token"}
    bot = _make_bot(token)
    if bot is None:
        return {"ok": False, "error": "no_bot"}
    try:
        kwargs: dict = {"callback_query_id": callback_query_id}
        if text:
            kwargs["text"] = text
        if show_alert:
            kwargs["show_alert"] = True
        asyncio.run(bot.answer_callback_query(**kwargs))
        return {"ok": True}
    except Exception as e:
        logger.error("Telegram answer_callback_query failed: %s", e)
        return {"ok": False, "error": str(e)}


def send_session_reminder(chat_id: str | int, patient_name: str, session_time: str, modality: str, session_num: int, total: int) -> bool:
    text = (
        f"🧠 *DeepSynaps Session Reminder*\n\n"
        f"Hi {patient_name},\n\n"
        f"You have a *{modality}* session scheduled:\n"
        f"📅 {session_time}\n"
        f"📊 Session {session_num} of {total}\n\n"
        f"Reply *CONFIRM* to confirm or *CANCEL* to request rescheduling.\n\n"
        f"_DeepSynaps Protocol Studio_"
    )
    return send_message(chat_id, text, bot_kind="patient")


def send_clinician_daily_digest(chat_id: str | int, clinician_name: str, sessions: list[dict]) -> bool:
    if not sessions:
        text = f"📋 *Daily Digest for {clinician_name}*\n\nNo sessions scheduled today. ✅"
    else:
        lines = "\n".join(f"• {s['time']} — {s['patient']} ({s['modality']})" for s in sessions)
        text = (
            f"📋 *Daily Digest for {clinician_name}*\n\n"
            f"You have *{len(sessions)}* session(s) today:\n\n"
            f"{lines}\n\n"
            f"_DeepSynaps Protocol Studio_"
        )
    return send_message(chat_id, text, bot_kind="clinician")


def send_assessment_complete_alert(chat_id: str | int, patient_name: str, assessment_title: str, score: str | None) -> bool:
    score_line = f"Score: *{score}*\n" if score else ""
    text = (
        f"📊 *Assessment Completed*\n\n"
        f"Patient *{patient_name}* has completed:\n"
        f"_{assessment_title}_\n"
        f"{score_line}\n"
        f"Review in DeepSynaps Protocol Studio.\n\n"
        f"_DeepSynaps Protocol Studio_"
    )
    return send_message(chat_id, text, bot_kind="clinician")


def _random_code() -> str:
    return secrets.token_hex(3).upper()[:6]


def create_pending_link(db: Session, user_id: str, user_role: str, bot_kind: BotKind) -> str:
    """Insert a short-lived LINK code (1 hour). Replaces any prior pending code for this user+bot."""
    now = datetime.now(timezone.utc)
    db.query(TelegramPendingLink).filter(
        TelegramPendingLink.user_id == user_id,
        TelegramPendingLink.bot_kind == bot_kind,
    ).delete()
    for _ in range(8):
        code = _random_code()
        clash = db.query(TelegramPendingLink).filter_by(code=code).first()
        if clash:
            continue
        row = TelegramPendingLink(
            code=code,
            user_id=user_id,
            user_role=user_role,
            bot_kind=bot_kind,
            expires_at=now + timedelta(hours=1),
        )
        db.add(row)
        db.commit()
        return code
    raise RuntimeError("Could not allocate Telegram link code")


def consume_pending_link(db: Session, code: str, bot_kind: BotKind) -> tuple[str, str] | None:
    """If code is valid and matches bot_kind, delete row and return (user_id, user_role)."""
    raw = (code or "").strip().upper()
    if not raw:
        return None
    now = datetime.now(timezone.utc)
    row = (
        db.query(TelegramPendingLink)
        .filter(
            TelegramPendingLink.code == raw,
            TelegramPendingLink.bot_kind == bot_kind,
            TelegramPendingLink.expires_at > now,
        )
        .first()
    )
    if not row:
        return None
    uid, role = row.user_id, row.user_role
    db.delete(row)
    db.commit()
    return uid, role


def upsert_user_chat(db: Session, user_id: str, chat_id: str, bot_kind: BotKind) -> None:
    existing = db.query(TelegramUserChat).filter_by(user_id=user_id, bot_kind=bot_kind).first()
    if existing:
        existing.chat_id = str(chat_id)
    else:
        db.add(TelegramUserChat(user_id=user_id, chat_id=str(chat_id), bot_kind=bot_kind))
    db.commit()


def get_user_id_for_chat(db: Session, chat_id: str | int, bot_kind: BotKind) -> str | None:
    cid = str(chat_id)
    row = db.query(TelegramUserChat).filter_by(chat_id=cid, bot_kind=bot_kind).first()
    return row.user_id if row else None


def generate_link_code(user_id: str) -> str:
    """Deprecated: hash-based code without DB (kept for tests that patch this)."""
    import hashlib
    import time
    raw = f"{user_id}:{int(time.time() // 3600)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:6].upper()
