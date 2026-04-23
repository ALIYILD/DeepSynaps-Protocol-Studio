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


def send_message(
    chat_id: str | int,
    text: str,
    *,
    bot_kind: BotKind = "patient",
    parse_mode: str | None = "Markdown",
) -> bool:
    """Send a plain text message. Returns True on success."""
    token = _token_for_kind(bot_kind)
    if not token:
        return False
    bot = _make_bot(token)
    if bot is None:
        return False
    try:
        kwargs = {"chat_id": chat_id, "text": text}
        if parse_mode:
            kwargs["parse_mode"] = parse_mode
        asyncio.run(bot.send_message(**kwargs))
        return True
    except Exception as e:
        logger.error("Telegram send_message failed: %s", e)
        return False


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
