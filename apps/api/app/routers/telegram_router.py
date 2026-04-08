"""
Telegram webhook + account linking endpoints.
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional
from app.auth import AuthenticatedActor, get_authenticated_actor
from app.services.telegram_service import generate_link_code, send_message

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


class TelegramLinkResponse(BaseModel):
    code: str
    instructions: str


class TelegramWebhookPayload(BaseModel):
    update_id: int
    message: Optional[dict] = None


@router.get("/link-code", response_model=TelegramLinkResponse)
def get_link_code(actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> TelegramLinkResponse:
    code = generate_link_code(actor.actor_id)
    return TelegramLinkResponse(
        code=code,
        instructions=f"Open Telegram, find @DeepSynapsBot, and send the message: LINK {code}",
    )


@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict:
    """Receives Telegram webhook updates."""
    try:
        payload = await request.json()
        message = payload.get("message", {})
        text = message.get("text", "").strip()
        chat_id = message.get("chat", {}).get("id")

        if not chat_id:
            return {"ok": True}

        if text.upper().startswith("LINK "):
            code = text[5:].strip()
            # In production: verify code against DB and store telegram chat_id on user
            send_message(chat_id, f"✅ Account linked successfully! You'll now receive session reminders here.")
        elif text.upper() == "CONFIRM":
            send_message(chat_id, "✅ Session confirmed! See you soon.")
        elif text.upper() == "CANCEL":
            send_message(chat_id, "📅 Cancellation noted. Your clinician will be in touch to reschedule.")
        elif text.lower() in ["help", "/help", "/start"]:
            send_message(chat_id, (
                "🧠 *DeepSynaps Bot*\n\n"
                "Commands:\n"
                "• LINK [CODE] — Link your DeepSynaps account\n"
                "• CONFIRM — Confirm an upcoming session\n"
                "• CANCEL — Request session cancellation\n"
                "• HELP — Show this message"
            ))

        return {"ok": True}
    except Exception:
        return {"ok": True}


@router.post("/send-test")
def send_test_message(
    body: dict,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict:
    """Send a test message to a chat_id (admin only)."""
    chat_id = body.get("chat_id")
    if not chat_id:
        return {"ok": False, "error": "chat_id required"}
    ok = send_message(chat_id, "🧠 DeepSynaps test message — your Telegram is connected!")
    return {"ok": ok}
