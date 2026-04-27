"""
Telegram webhook + account linking endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.limiter import limiter
from app.services import telegram_service as tg
from app.services.chat_service import chat_agent, chat_patient
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])

_MAX_TG_REPLY = 3900


def _truncate_reply(text: str) -> str:
    if len(text) <= _MAX_TG_REPLY:
        return text
    return text[: _MAX_TG_REPLY - 1] + "…"


class TelegramLinkResponse(BaseModel):
    code: str
    instructions: str


def _webhook_secret_ok(x_telegram_bot_api_secret_token: str | None) -> bool:
    _settings = get_settings()
    if not _settings.telegram_webhook_secret:
        return True
    return x_telegram_bot_api_secret_token == _settings.telegram_webhook_secret


def _help_text(bot_kind: str) -> str:
    s = get_settings()
    if bot_kind == "patient":
        handle = s.telegram_bot_username_patient or "DeepSynapsPatientBot"
        return (
            f"🧠 *DeepSynaps — Patient assistant*\n\n"
            f"Commands:\n"
            f"• LINK [CODE] — Link your account (code from the patient portal)\n"
            f"• CONFIRM — Confirm an upcoming session\n"
            f"• CANCEL — Request session cancellation\n"
            f"• Or ask a question — answers use general guidance (not a substitute for your clinician).\n\n"
            f"_Bot: @{handle}_"
        )
    handle = s.telegram_bot_username_clinician or "DeepSynapsClinicBot"
    return (
        f"🧠 *DeepSynaps — Clinic assistant*\n\n"
        f"Commands:\n"
        f"• LINK [CODE] — Link your clinician account (code from Settings)\n"
        f"• Or ask about queue, protocols, and workflow.\n\n"
        f"_Bot: @{handle}_"
    )


async def _handle_telegram_update(
    request: Request,
    x_telegram_bot_api_secret_token: str | None,
    bot_kind: tg.BotKind,
    db: Session,
) -> dict:
    if not _webhook_secret_ok(x_telegram_bot_api_secret_token):
        return {"ok": True}

    try:
        payload = await request.json()
        message = payload.get("message") or {}
        text = (message.get("text") or "").strip()
        chat_id = message.get("chat", {}).get("id")

        if not chat_id:
            return {"ok": True}

        chat_id_str = str(chat_id)

        if text.upper().startswith("LINK "):
            code = text[5:].strip()
            consumed = tg.consume_pending_link(db, code, bot_kind)
            if not consumed:
                tg.send_message(
                    chat_id,
                    "That link code is invalid or expired. Open the app and request a new code.",
                    bot_kind=bot_kind,
                    parse_mode=None,
                )
                return {"ok": True}
            user_id, _role = consumed
            tg.upsert_user_chat(db, user_id, chat_id_str, bot_kind)
            tg.send_message(
                chat_id,
                "✅ Account linked. You can ask questions here or use HELP for commands.",
                bot_kind=bot_kind,
                parse_mode=None,
            )
            return {"ok": True}

        if text.upper() == "CONFIRM":
            tg.send_message(chat_id, "✅ Session confirmed! See you soon.", bot_kind=bot_kind, parse_mode=None)
            return {"ok": True}
        if text.upper() == "CANCEL":
            tg.send_message(
                chat_id,
                "📅 Cancellation noted. Your clinician will be in touch to reschedule.",
                bot_kind=bot_kind,
                parse_mode=None,
            )
            return {"ok": True}

        if text.lower() in ("help", "/help", "/start"):
            tg.send_message(chat_id, _help_text(bot_kind), bot_kind=bot_kind)
            return {"ok": True}

        user_id = tg.get_user_id_for_chat(db, chat_id_str, bot_kind)
        if not user_id:
            tg.send_message(
                chat_id,
                "Please link your account first. In the app, open Settings and send: LINK [your code].",
                bot_kind=bot_kind,
                parse_mode=None,
            )
            return {"ok": True}

        if bot_kind == "patient":
            reply = chat_patient(
                [{"role": "user", "content": text}],
                language="en",
                dashboard_context=None,
            )
        else:
            reply = chat_agent(
                [{"role": "user", "content": text}],
                provider="anthropic",
                openai_key=None,
                context="Conversation via Telegram clinic bot — no live dashboard snapshot.",
            )

        tg.send_message(chat_id, _truncate_reply(reply), bot_kind=bot_kind, parse_mode=None)
        return {"ok": True}
    except Exception:
        return {"ok": True}


@router.get("/link-code", response_model=TelegramLinkResponse)
def get_link_code(
    bot_kind: str = Query("clinician", pattern="^(patient|clinician)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TelegramLinkResponse:
    if bot_kind == "patient":
        if actor.role != "patient":
            raise HTTPException(status_code=403, detail="Patient bot link codes require a patient session.")
    else:
        require_minimum_role(actor, "clinician")

    code = tg.create_pending_link(db, actor.actor_id, actor.role, bot_kind)  # type: ignore[arg-type]
    s = get_settings()
    if bot_kind == "patient":
        handle = s.telegram_bot_username_patient or "DeepSynapsPatientBot"
    else:
        handle = s.telegram_bot_username_clinician or "DeepSynapsClinicBot"

    return TelegramLinkResponse(
        code=code,
        instructions=f"Open Telegram, find @{handle}, and send: LINK {code}",
    )


@router.post("/webhook")
@limiter.limit("60/minute")
async def telegram_webhook_legacy(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> dict:
    """Legacy single-webhook URL — treated as patient bot (or whichever token TELEGRAM_BOT_TOKEN maps to)."""
    return await _handle_telegram_update(request, x_telegram_bot_api_secret_token, "patient", db)


@router.post("/webhook/patient")
@limiter.limit("60/minute")
async def telegram_webhook_patient(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> dict:
    return await _handle_telegram_update(request, x_telegram_bot_api_secret_token, "patient", db)


@router.post("/webhook/clinician")
@limiter.limit("60/minute")
async def telegram_webhook_clinician(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> dict:
    return await _handle_telegram_update(request, x_telegram_bot_api_secret_token, "clinician", db)


@router.post("/send-test")
def send_test_message(
    body: dict,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict:
    """Send a test message to a chat_id. Admin only."""
    require_minimum_role(actor, "admin")
    chat_id = body.get("chat_id")
    bot_kind: tg.BotKind = body.get("bot_kind") or "patient"
    if bot_kind not in ("patient", "clinician"):
        bot_kind = "patient"
    if not chat_id:
        return {"ok": False, "error": "chat_id required"}
    ok = tg.send_message(chat_id, "🧠 DeepSynaps test message — your Telegram is connected!", bot_kind=bot_kind, parse_mode=None)
    return {"ok": ok}
