import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_patient_owner
from app.repositories.patients import resolve_patient_clinic_id


def _gate_chat_patient(actor: AuthenticatedActor, patient_id: str | None, db: Session) -> None:
    """Cross-clinic gate for chat endpoints that pull patient PHI into the LLM prompt."""
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import AiSummaryAudit, Patient, WearableDailySummary, WearableAlertFlag, SalesInquiry
from app.services.chat_service import (
    chat_clinician,
    chat_patient,
    chat_public_faq,
    chat_agent,
    chat_agent_with_evidence,
    chat_wearable_patient,
    chat_wearable_clinician,
    _llm_model,
)
from app.services import telegram_service as tg
from app.settings import get_settings

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
    # When `patient_id` is provided and `patient_context` is empty, the clinician
    # chat endpoint auto-populates patient_context with a clinician-authored
    # assessment snapshot so the LLM always sees current severity. Never used
    # to fetch content for a patient-facing endpoint.
    patient_id: str | None = None
    dashboard_context: str | None = None  # optional patient-portal dashboard snapshot for /patient
    language: str = "en"               # BCP-47 locale code for patient responses


class PublicChatRequest(BaseModel):
    """Strictly-narrow request model for the unauthenticated /public route.

    Pre-fix the public route accepted the full ChatRequest, including
    `patient_id`, `patient_context`, and `dashboard_context`. The handler
    ignored those fields, but the next refactor that wires them through
    would silently turn /public into a PHI sink that any internet caller
    could query. Define an explicit narrow shape here so the type system
    refuses to leak that on a future edit.
    """
    model_config = {"extra": "forbid"}

    messages: list[ChatMessage]


class AgentChatRequest(BaseModel):
    messages: list[ChatMessage]
    provider: str = "glm-free"            # "glm-free" | "anthropic" | "openai"
    openai_key: str | None = None        # doctor's own OpenAI key (never stored)
    context: str | None = None           # dashboard context snippet injected by frontend


class CitedPaper(BaseModel):
    id: int
    pmid: str | None = None
    title: str | None = None
    url: str | None = None


class ChatResponse(BaseModel):
    reply: str
    role: str = "assistant"
    # Populated by /agent when the user's message hit the evidence RAG path;
    # empty list on every other endpoint. Top 5 papers cited inline as [1]…[5]
    # so the frontend can render a "Papers cited" panel beside the reply.
    cited_papers: list[CitedPaper] = []


class SalesInquiryRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    message: str
    source: str | None = "landing"


class SalesInquiryResponse(BaseModel):
    ok: bool = True
    inquiry_id: str
    forwarded_to_telegram: bool = False


@router.post("/public", response_model=ChatResponse)
@limiter.limit("10/minute")
def public_faq_chat(request: Request, body: PublicChatRequest) -> ChatResponse:
    """No auth required — public FAQ bot for the landing page.

    Body shape is the narrow ``PublicChatRequest``: ``messages`` only, no
    ``patient_id``/``patient_context``/``dashboard_context``. Extra fields
    are rejected (``extra="forbid"``) so an unauthenticated caller cannot
    smuggle PHI selectors through the public surface.
    """
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = chat_public_faq(msgs)
    return ChatResponse(reply=reply)


@router.post("/sales", response_model=SalesInquiryResponse)
@limiter.limit("10/minute")
def sales_inquiry(
    request: Request,
    body: SalesInquiryRequest,
    db: Session = Depends(get_db_session),
) -> SalesInquiryResponse:
    """Public sales/contact intake (landing page message icon).

    Stores the inquiry in DB. Optionally forwards to Telegram (clinician bot) if
    TELEGRAM_SALES_CHAT_ID is configured.
    """
    msg = (body.message or "").strip()
    if len(msg) < 5:
        raise ApiServiceError(code="invalid_request", message="Message is too short.", status_code=422)
    if len(msg) > 8000:
        raise ApiServiceError(code="invalid_request", message="Message is too long.", status_code=422)

    row = SalesInquiry(
        name=(body.name or "").strip() or None,
        email=(body.email or "").strip().lower() or None,
        message=msg,
        source=(body.source or "").strip() or "landing",
    )
    db.add(row)
    db.commit()

    forwarded = False
    try:
        s = get_settings()
        if s.telegram_sales_chat_id:
            text = (
                "🧠 New sales inquiry\n\n"
                f"Name: {row.name or '—'}\n"
                f"Email: {row.email or '—'}\n"
                f"Source: {row.source or '—'}\n\n"
                f"Message:\n{row.message}"
            )
            forwarded = tg.send_message(s.telegram_sales_chat_id, text, bot_kind="clinician", parse_mode=None)
    except Exception:
        forwarded = False

    return SalesInquiryResponse(inquiry_id=row.id, forwarded_to_telegram=forwarded)


@router.post("/agent", response_model=ChatResponse)
@limiter.limit("30/minute")
def agent_chat(
    request: Request,
    body: AgentChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ChatResponse:
    """Authenticated doctor practice management agent.

    Runs the doctor-facing agent through the evidence-RAG pipeline so the LLM
    can cite real papers from our 87k-paper evidence DB. `cited_papers` in
    the response is the top-5 papers that were injected into the system
    prompt (empty list when no clinical cues were detected in the message or
    the evidence DB is unavailable).
    """
    from app.auth import require_minimum_role
    require_minimum_role(actor, "clinician")
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply, papers = chat_agent_with_evidence(
        msgs, body.provider, body.openai_key, body.context
    )
    cited = [CitedPaper(**p) for p in papers]
    return ChatResponse(reply=reply, cited_papers=cited)


@router.post("/clinician", response_model=ChatResponse)
@limiter.limit("30/minute")
def clinician_chat(
    request: Request,
    body: ChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ChatResponse:
    from app.auth import require_minimum_role
    require_minimum_role(actor, "clinician")
    _gate_chat_patient(actor, body.patient_id, db)
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    # Auto-inject clinician-authored assessment context so the LLM sees current
    # severity without the caller having to stringify it manually. If
    # patient_context is already supplied (caller provided custom text), we
    # keep it — explicit caller intent wins.
    patient_context = body.patient_context
    if not patient_context and body.patient_id:
        try:
            from app.services.assessment_summary import extract_ai_assessment_context
            patient_context = extract_ai_assessment_context(
                db, body.patient_id, clinician_id=actor.actor_id
            )
        except Exception:
            patient_context = None  # chat continues without snapshot
        # Append latest qEEG analysis summary if available
        try:
            from app.persistence.models import QEEGAnalysis
            latest_qeeg = (
                db.query(QEEGAnalysis)
                .filter(QEEGAnalysis.patient_id == body.patient_id, QEEGAnalysis.analysis_status == "completed")
                .order_by(QEEGAnalysis.analyzed_at.desc())
                .first()
            )
            if latest_qeeg and latest_qeeg.band_powers_json:
                bp = latest_qeeg.band_powers_json
                ratios = bp.get("derived_ratios", {})
                qeeg_lines = ["\n=== Latest qEEG Analysis ==="]
                qeeg_lines.append(f"Analyzed: {latest_qeeg.analyzed_at}")
                qeeg_lines.append(f"Channels: {latest_qeeg.channels_used}, Sample rate: {latest_qeeg.sample_rate_hz} Hz")
                if ratios.get("theta_beta_ratio") is not None:
                    qeeg_lines.append(f"Theta/Beta ratio: {ratios['theta_beta_ratio']:.2f}")
                if ratios.get("frontal_alpha_asymmetry") is not None:
                    qeeg_lines.append(f"Frontal alpha asymmetry: {ratios['frontal_alpha_asymmetry']:.3f}")
                if ratios.get("alpha_peak_frequency_hz") is not None:
                    qeeg_lines.append(f"Alpha peak frequency: {ratios['alpha_peak_frequency_hz']:.1f} Hz")
                if ratios.get("delta_alpha_ratio") is not None:
                    qeeg_lines.append(f"Delta/Alpha ratio: {ratios['delta_alpha_ratio']:.2f}")
                summary = bp.get("global_summary", {})
                if summary:
                    dom = summary.get("dominant_band", "N/A")
                    qeeg_lines.append(f"Dominant band: {dom}")
                patient_context = (patient_context or "") + "\n".join(qeeg_lines)
        except Exception:
            pass  # qEEG context is optional enrichment
        # Append risk stratification profile if available
        try:
            from app.persistence.models import RiskStratificationResult
            risk_rows = (
                db.query(RiskStratificationResult)
                .filter(RiskStratificationResult.patient_id == body.patient_id)
                .all()
            )
            if risk_rows:
                _level_labels = {"red": "HIGH RISK", "amber": "MODERATE", "green": "LOW", "grey": "NO DATA"}
                risk_lines = ["\n=== Risk Stratification (Traffic Lights) ==="]
                for r in risk_rows:
                    effective = r.override_level or r.level
                    risk_lines.append(f"  {r.category.replace('_', ' ').title()}: {_level_labels.get(effective, effective)} ({r.confidence})")
                    if effective in ("red", "amber") and r.rationale:
                        risk_lines.append(f"    Rationale: {r.rationale[:200]}")
                patient_context = (patient_context or "") + "\n".join(risk_lines)
        except Exception:
            pass  # risk context is optional enrichment
    reply = chat_clinician(msgs, patient_context)
    return ChatResponse(reply=reply)


@router.post("/patient", response_model=ChatResponse)
@limiter.limit("30/minute")
def patient_chat(
    request: Request,
    body: ChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ChatResponse:
    from app.auth import require_minimum_role
    require_minimum_role(actor, "patient")
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]
    reply = chat_patient(
        msgs,
        language=body.language,
        dashboard_context=body.dashboard_context,
    )
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
            if s.rhr_bpm:
                parts.append(f"RHR: {s.rhr_bpm:.0f}bpm")
            if s.hrv_ms:
                parts.append(f"HRV: {s.hrv_ms:.0f}ms")
            if s.sleep_duration_h:
                parts.append(f"Sleep: {s.sleep_duration_h:.1f}h")
            if s.steps:
                parts.append(f"Steps: {s.steps}")
            if s.spo2_pct:
                parts.append(f"SpO2: {s.spo2_pct:.1f}%")
            if s.mood_score:
                parts.append(f"Mood: {s.mood_score:.0f}/5")
            if s.pain_score:
                parts.append(f"Pain: {s.pain_score:.0f}/10")
            if s.anxiety_score:
                parts.append(f"Anxiety: {s.anxiety_score:.0f}/10")
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
                # Pre-fix the demo bypass resolved the demo Patient row in
                # any environment, including production. Gate to the same
                # env allowlist as ``patient_portal_router._require_patient``
                # so a leaked / forged demo actor token cannot read the
                # demo patient's wearable PHI in prod.
                from app.settings import get_settings
                _app_env = (getattr(get_settings(), "app_env", None) or "production").lower()
                if _app_env not in {"development", "test"}:
                    raise ApiServiceError(
                        code="demo_disabled",
                        message="Demo patient bypass is not available in this environment.",
                        status_code=403,
                    )
                pt = db.query(Patient).filter(
                    Patient.email.in_(["patient@deepsynaps.com", "patient@demo.com"])
                ).first()
            else:
                from app.persistence.models import User
                user = db.query(User).filter_by(id=actor.actor_id).first()
                pt = db.query(Patient).filter(Patient.email == user.email).first() if user else None
            if pt:
                # Always source context from DB — never trust client-supplied string
                wearable_context = _build_wearable_context(pt.id, db)
        except ApiServiceError:
            # Don't swallow the prod demo-block.
            raise
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
            _log_ai_summary(pt.id, actor, 'patient_wearable', reply, ['wearable_summary'], _llm_model(), db)
        except Exception:
            _audit_logger.warning("Failed to write AI summary audit for patient %s", pt.id)

    return ChatResponse(reply=reply)


@router.post("/wearable-clinician", response_model=ChatResponse)
@limiter.limit("20/minute")
def wearable_clinician_chat(
    request: Request,
    body: WearableClinicianChatRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ChatResponse:
    """Clinician requests AI summary of a patient's wearable + clinical data."""
    from app.auth import require_minimum_role
    require_minimum_role(actor, "clinician")
    _gate_chat_patient(actor, body.patient_id, db)

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
            ['wearable_summary', 'patient_record'], _llm_model(), db,
        )
    except Exception:
        _audit_logger.warning(
            "Failed to write AI summary audit for clinician %s on patient %s",
            actor.actor_id, body.patient_id,
        )

    return ChatResponse(reply=reply)
