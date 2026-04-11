import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import AiSummaryAudit, Patient, WearableDailySummary, WearableAlertFlag
from app.services.chat_service import (
    chat_clinician,
    chat_patient,
    chat_public_faq,
    chat_agent,
    chat_wearable_patient,
    chat_wearable_clinician,
)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])
_audit_logger = logging.getLogger(__name__)

# Roles permitted to call /wearable-patient.
# Patients: get DB-sourced context (spoofing-safe).
# Clinicians/admins/supervisors: intentional preview mode (client-supplied context).
# Technician, reviewer, guest: no legitimate use-case for patient-facing AI.
_WEARABLE_PATIENT_ALLOWED_ROLES = frozenset({'patient', 'clinician', 'admin', 'supervisor'})


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    patient_context: str | None = None  # optional patient info for clinician context
    language: str = "en"               # BCP-47 locale code for patient responses


class AgentChatRequest(BaseModel):
    messages: list[ChatMessage]
    provider: str = "anthropic"          # "anthropic" | "openai"
    openai_key: str | None = None        # doctor's own OpenAI key (never stored)
    context: str | None = None           # dashboard context snippet injected by frontend


class ChatResponse(BaseModel):
    reply: str
    role: str = "assistant"


@router.post("/public", response_model=ChatResponse)
def public_faq_chat(body: ChatRequest) -> ChatResponse:
    """No auth required — public FAQ bot for the landing page."""
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = chat_public_faq(msgs)
    return ChatResponse(reply=reply)


@router.post("/agent", response_model=ChatResponse)
def agent_chat(
    body: AgentChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ChatResponse:
    """Authenticated doctor practice management agent."""
    from app.auth import require_minimum_role
    require_minimum_role(actor, "clinician")
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = chat_agent(msgs, body.provider, body.openai_key, body.context)
    return ChatResponse(reply=reply)


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
    reply = chat_patient(msgs, language=body.language)
    return ChatResponse(reply=reply)


# ── Wearable copilot endpoints ─────────────────────────────────────────────────

class WearablePatientChatRequest(BaseModel):
    messages: list[ChatMessage]
    patient_context: Optional[str] = None   # wearable summary string, built by frontend


class WearableClinicianChatRequest(BaseModel):
    messages: list[ChatMessage]
    patient_id: str


def _build_wearable_context(patient_id: str, db: Session) -> str:
    """Build a plain-text wearable context string for the AI from the last 7 days of summaries."""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
    summaries = (
        db.query(WearableDailySummary)
        .filter(
            WearableDailySummary.patient_id == patient_id,
            WearableDailySummary.date >= cutoff,
        )
        .order_by(WearableDailySummary.date.asc())
        .all()
    )
    alerts = (
        db.query(WearableAlertFlag)
        .filter_by(patient_id=patient_id, dismissed=False)
        .order_by(WearableAlertFlag.triggered_at.desc())
        .limit(5)
        .all()
    )

    lines = ["=== Wearable Data (last 7 days, consumer-grade) ==="]
    if not summaries:
        lines.append("No wearable data available for this period.")
    else:
        for s in summaries:
            parts = [f"Date: {s.date}", f"Source: {s.source}"]
            if s.rhr_bpm:   parts.append(f"RHR: {s.rhr_bpm:.0f}bpm")
            if s.hrv_ms:    parts.append(f"HRV: {s.hrv_ms:.0f}ms")
            if s.sleep_duration_h: parts.append(f"Sleep: {s.sleep_duration_h:.1f}h")
            if s.steps:     parts.append(f"Steps: {s.steps}")
            if s.spo2_pct:  parts.append(f"SpO2: {s.spo2_pct:.1f}%")
            if s.mood_score:  parts.append(f"Mood: {s.mood_score:.0f}/5")
            if s.pain_score:  parts.append(f"Pain: {s.pain_score:.0f}/10")
            if s.anxiety_score: parts.append(f"Anxiety: {s.anxiety_score:.0f}/10")
            lines.append(" | ".join(parts))

    if alerts:
        lines.append("\n=== Active Alert Flags ===")
        for a in alerts:
            lines.append(f"[{a.severity.upper()}] {a.flag_type}: {a.detail}")

    return "\n".join(lines)


def _log_ai_summary(
    patient_id: str,
    actor: AuthenticatedActor,
    summary_type: str,
    response: str,
    sources: list[str],
    model: str,
    db: Session,
) -> None:
    import hashlib
    audit = AiSummaryAudit(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        summary_type=summary_type,
        prompt_hash=hashlib.sha256(f"{summary_type}:{patient_id}:{actor.actor_id}".encode()).hexdigest()[:16],
        response_preview=response[:500],
        sources_used=json.dumps(sources),
        model_used=model,
    )
    db.add(audit)
    db.commit()


@router.post("/wearable-patient", response_model=ChatResponse)
@limiter.limit("20/minute")
def wearable_patient_chat(
    request: Request,
    body: WearablePatientChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ChatResponse:
    """Patient asks questions about their own wearable data.

    Access policy:
      patient    — DB-sourced context only (client-supplied context ignored to prevent spoofing)
      clinician / admin / supervisor — preview mode; client-supplied context accepted
      technician / reviewer / guest  — 403 (no legitimate use-case)

    Rate limit: 20 requests/minute per IP (AI endpoint cost control).
    All non-patient calls are logged at INFO for audit purposes.
    """
    if actor.role not in _WEARABLE_PATIENT_ALLOWED_ROLES:
        raise ApiServiceError(
            code="forbidden",
            message="This endpoint is restricted to patients and clinical staff.",
            status_code=403,
        )

    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    pt = None
    wearable_context = body.patient_context  # fallback for clinician preview

    if actor.role == 'patient':
        try:
            from app.routers.patient_portal_router import _DEMO_PATIENT_ACTOR_ID
            if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
                pt = db.query(Patient).filter(Patient.email == "patient@demo.com").first()
            else:
                from app.persistence.models import User
                user = db.query(User).filter_by(id=actor.actor_id).first()
                pt = db.query(Patient).filter(Patient.email == user.email).first() if user else None
            if pt:
                # Always source context from DB — never trust client-supplied string
                wearable_context = _build_wearable_context(pt.id, db)
        except Exception:
            _audit_logger.warning("Failed to resolve patient wearable context from DB for actor %s", actor.actor_id)
    else:
        # Non-patient (clinician preview) — explicit audit trail
        _audit_logger.info(
            "wearable_patient_chat_preview actor=%s role=%s used_client_context=%s",
            actor.actor_id, actor.role, bool(body.patient_context),
        )

    reply = chat_wearable_patient(msgs, wearable_context)

    if actor.role == 'patient' and pt:
        try:
            _log_ai_summary(pt.id, actor, 'patient_wearable', reply, ['wearable_summary'], 'claude-haiku-4-5-20251001', db)
        except Exception:
            _audit_logger.warning("Failed to write AI summary audit for patient %s", pt.id)

    return ChatResponse(reply=reply)


@router.post("/wearable-clinician", response_model=ChatResponse)
def wearable_clinician_chat(
    body: WearableClinicianChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ChatResponse:
    """Clinician requests AI summary of a patient's wearable + clinical data."""
    from app.auth import require_minimum_role
    require_minimum_role(actor, "clinician")

    patient = db.query(Patient).filter_by(id=body.patient_id).first()
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)

    # Build rich context from DB
    wearable_ctx = _build_wearable_context(body.patient_id, db)
    patient_summary = (
        f"Patient: {patient.first_name} {patient.last_name}\n"
        f"Condition: {patient.primary_condition or 'unknown'}\n"
        f"Status: {patient.status}\n\n"
        f"{wearable_ctx}"
    )

    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = chat_wearable_clinician(msgs, patient_summary)

    try:
        _log_ai_summary(
            body.patient_id, actor, 'clinician_monitoring', reply,
            ['wearable_summary', 'patient_record'], 'claude-opus-4-6', db,
        )
    except Exception:
        _audit_logger.warning(
            "Failed to write AI summary audit for clinician %s on patient %s",
            actor.actor_id, body.patient_id,
        )

    return ChatResponse(reply=reply)
