"""
Telegram notification service.
Uses python-telegram-bot in simple HTTP mode (no async polling).
Falls back gracefully if TELEGRAM_BOT_TOKEN is not set.
"""
from __future__ import annotations
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _get_bot():
    """Returns a telegram Bot instance or None if not configured."""
    try:
        from telegram import Bot
        from app.settings import get_settings
        settings = get_settings()
        if not settings.telegram_bot_token:
            return None
        return Bot(token=settings.telegram_bot_token)
    except ImportError:
        logger.warning("python-telegram-bot not installed; Telegram notifications disabled.")
        return None
    except Exception as e:
        logger.warning(f"Telegram bot init failed: {e}")
        return None


def send_message(chat_id: str | int, text: str) -> bool:
    """Send a plain text message. Returns True on success."""
    import asyncio
    bot = _get_bot()
    if bot is None:
        return False
    try:
        asyncio.run(bot.send_message(chat_id=chat_id, text=text, parse_mode="Markdown"))
        return True
    except Exception as e:
        logger.error(f"Telegram send_message failed: {e}")
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
    return send_message(chat_id, text)


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
    return send_message(chat_id, text)


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
    return send_message(chat_id, text)


def generate_link_code(user_id: str) -> str:
    """Generate a 6-char alphanumeric code for linking Telegram account."""
    import hashlib
    import time
    raw = f"{user_id}:{int(time.time() // 3600)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:6].upper()
