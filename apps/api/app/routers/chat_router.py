from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.auth import AuthenticatedActor, get_authenticated_actor
from app.services.chat_service import chat_clinician, chat_patient

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    patient_context: str | None = None  # optional patient info for clinician context


class ChatResponse(BaseModel):
    reply: str
    role: str = "assistant"


@router.post("/clinician", response_model=ChatResponse)
def clinician_chat(
    body: ChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ChatResponse:
    from app.auth import require_minimum_role
    require_minimum_role(actor, "clinician")
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = chat_clinician(msgs, body.patient_context)
    return ChatResponse(reply=reply)


@router.post("/patient", response_model=ChatResponse)
def patient_chat(
    body: ChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ChatResponse:
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = chat_patient(msgs)
    return ChatResponse(reply=reply)
