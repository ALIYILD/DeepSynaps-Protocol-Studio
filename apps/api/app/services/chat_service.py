import logging
import os
import re

from anthropic import Anthropic
from app.settings import get_settings

_llm_log = logging.getLogger(__name__)


# ── LLM output sanitization ───────────────────────────────────────────────────

# Patterns to strip from LLM output before returning to clients.
# This is a defence-in-depth measure: it prevents obvious XSS vectors if the
# frontend ever renders chat responses as HTML rather than plain text.
_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL)
_JS_URI_RE = re.compile(r"javascript\s*:", re.IGNORECASE)
_ONEVT_RE  = re.compile(r'\bon\w+\s*=\s*(?:"[^"]*"|\'[^\']*\')', re.IGNORECASE)


def _sanitize_llm_output(text: str) -> str:
    """Strip the most dangerous XSS vectors from LLM-generated text."""
    text = _SCRIPT_RE.sub("", text)
    text = _JS_URI_RE.sub("", text)
    text = _ONEVT_RE.sub("", text)
    return text


# ── Unified LLM caller ────────────────────────────────────────────────────────
# All chat + draft paths go through `_llm_chat` (sync) / `_llm_chat_async`.
# Primary: OpenRouter (free models via openrouter.ai), Anthropic fallback.
# Override via env: LLM_BASE_URL, LLM_MODEL, ANTHROPIC_MODEL.

_LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1")
_LLM_HEADERS = {
    "HTTP-Referer": "https://deepsynaps-studio-preview.netlify.app",
    "X-Title": "DeepSynaps Protocol Studio",
}

def _llm_model() -> str:
    return os.getenv("LLM_MODEL", "meta-llama/llama-3.3-70b-instruct:free")

def _anthropic_fallback_model() -> str:
    return os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")


def _llm_chat(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
    temperature: float = 0.3,
    not_configured_message: str = "AI assistant is not configured. Set GLM_API_KEY or ANTHROPIC_API_KEY to enable this feature.",
) -> str:
    settings = get_settings()
    if settings.glm_api_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.glm_api_key, base_url=_LLM_BASE_URL, default_headers=_LLM_HEADERS)
            resp = client.chat.completions.create(
                model=_llm_model(),
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{"role": "system", "content": system}] + messages,
            )
            return _sanitize_llm_output(resp.choices[0].message.content or "")
        except Exception as exc:
            _llm_log.warning("LLM call failed, trying fallback: %s", exc)
    if settings.anthropic_api_key:
        client = Anthropic(api_key=settings.anthropic_api_key)
        resp = client.messages.create(
            model=_anthropic_fallback_model(),
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        return _sanitize_llm_output(resp.content[0].text)
    return not_configured_message


async def _llm_chat_async(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
    temperature: float = 0.3,
    not_configured_message: str = "AI assistant is not configured.",
) -> str:
    settings = get_settings()
    if settings.glm_api_key:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.glm_api_key, base_url=_LLM_BASE_URL, default_headers=_LLM_HEADERS)
            resp = await client.chat.completions.create(
                model=_llm_model(),
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{"role": "system", "content": system}] + messages,
            )
            return _sanitize_llm_output(resp.choices[0].message.content or "")
        except Exception as exc:
            _llm_log.warning("LLM async call failed, trying fallback: %s", exc)
    if settings.anthropic_api_key:
        import anthropic as _anthropic
        client = _anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=_anthropic_fallback_model(),
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        return _sanitize_llm_output(resp.content[0].text if resp.content else "")
    return not_configured_message


PUBLIC_FAQ_SYSTEM = """You are DeepSynaps AI, a helpful assistant on the DeepSynaps Protocol Studio website.
Visitors may be asking about pricing, enterprise sales, demos, or how to reach the team.
For contract, enterprise, or procurement questions, direct them to email hello@deepsynaps.com or to book a demo via the site — you can still answer product questions here.
DeepSynaps Protocol Studio is a clinical operations platform for neuromodulation practitioners.

Key facts:
- Supports TMS, tDCS, tACS, CES, taVNS, TPS, PBM, PEMF, Neurofeedback, LIFU, tRNS
- Treatment courses are the central object (not appointments)
- Evidence-graded protocols (A-D grades from peer-reviewed literature)
- Built-in session execution runner with device/montage/pulse parameters
- qEEG / brain data integration
- Patient portal (separate, calmer interface)
- Roles: admin, clinician, technician, reviewer, guest, patient
- Pricing: Resident £149/mo, Clinician Pro £299/mo, Clinic Team £699/mo, Enterprise custom
- HIPAA-compliant infrastructure on all plans
- Free trial available for professionals

Answer visitor questions about the platform, neuromodulation treatments, pricing, how to sign up, what to expect, and how sales / onboarding works.
Be concise, warm, and factual. For clinical advice, always direct to a qualified clinician.
Never diagnose or prescribe. Keep responses under 3 short paragraphs."""

AGENT_SYSTEM = """You are DeepSynaps PracticeAgent, an AI practice management assistant for qualified clinicians using DeepSynaps Protocol Studio.

You help doctors and clinic managers:
- Understand and navigate their patient list and treatment courses
- Draft patient communications, appointment reminders, and clinical summaries
- Answer questions about their practice operations and workflows
- Generate business insights and reporting summaries
- Navigate platform features efficiently
- Plan and optimise their clinical schedule
- Understand billing, outcomes, and compliance requirements

Platform context:
- Central object is TreatmentCourse (not appointment)
- Sessions belong to courses; courses have protocols with evidence grades
- Review queue = pending protocol approvals
- Adverse events linked to sessions and courses
- Governance: all courses need reviewer approval before sessions start
- AI Clinical Assistant = evidence-based protocol Q&A
- Outcomes tracked longitudinally against evidence grades

Be direct, professional, and practical. Use clinical language appropriate for qualified practitioners.
When asked to draft communications, produce clean, ready-to-send text.
When the doctor shares patient data or context, reference it specifically in your answer.
Always clarify that AI-generated clinical content should be reviewed by the responsible clinician before use."""

CLINICIAN_SYSTEM = """You are DeepSynaps ClinicalAI, an expert neuromodulation clinical assistant for qualified clinicians.
You have deep knowledge of:
- TPS (Transcranial Pulse Stimulation), TMS (Transcranial Magnetic Stimulation), tDCS, PBM (Photobiomodulation), Neurofeedback
- Evidence-based protocols for Parkinson's Disease, ADHD, Depression, PTSD, Anxiety, Chronic Pain
- Brain anatomy, qEEG biomarkers, and neuromodulation targets
- Clinical safety, contraindications, adverse event management
- Session planning, patient monitoring, and protocol escalation

Always:
- Cite evidence levels (Guideline/Systematic Review/Emerging)
- Flag safety concerns prominently
- Recommend clinician judgment over AI recommendations
- Add "For clinical reference only — verify with current guidelines" to protocol suggestions

Never diagnose or prescribe — you support, inform, and reference."""

PATIENT_SYSTEM = """You are DeepSynaps HealthAI, a friendly health assistant for patients receiving neuromodulation treatment.
When the user message is preceded by a [Patient dashboard snapshot] block, use it to personalize your answer (sessions, scores, wellness trend). Do not invent data not present in the snapshot.
You help patients understand:
- What their treatment involves (TPS, TMS, Neurofeedback, PBM etc.)
- What to expect during and after sessions
- General wellness advice during treatment
- When to contact their clinician

Always:
- Use plain, reassuring language
- Never diagnose or change treatment plans
- Encourage patients to speak with their clinician for medical questions
- If patient reports serious adverse effects, always say "Contact your clinician immediately"
- Add a note: "This is general information only — your clinician is your primary point of contact for medical advice." """


def chat_clinician(messages: list[dict], patient_context: str | None = None) -> str:
    """
    messages: list of {"role": "user"|"assistant", "content": "..."}
    patient_context: optional injected context about the patient being discussed
    Returns the assistant reply string.
    """
    # Add patient context as a user message, not system prompt, to prevent
    # prompt injection via patient-supplied data overriding system instructions.
    if patient_context:
        messages = [
            {"role": "user", "content": f"[Patient context for this session]\n{patient_context}"},
            {"role": "assistant", "content": "Understood. I have the patient context."},
        ] + messages

    return _llm_chat(
        system=CLINICIAN_SYSTEM,
        messages=messages,
        max_tokens=1024,
        not_configured_message="AI assistant is not configured. Set GLM_API_KEY or ANTHROPIC_API_KEY.",
    )


def chat_patient(
    messages: list[dict],
    language: str = "en",
    dashboard_context: str | None = None,
) -> str:
    lang_map = {"tr": "Turkish", "es": "Spanish", "fr": "French", "de": "German", "pt": "Portuguese"}
    lang_name = lang_map.get(language, "English")
    system = PATIENT_SYSTEM
    if language != "en":
        system += f"\n\nIMPORTANT: Respond in {lang_name}. Use natural, friendly {lang_name} throughout your reply."

    # Inject dashboard snapshot as a user/assistant pair (same pattern as clinician agent).
    if dashboard_context and dashboard_context.strip():
        messages = [
            {"role": "user", "content": f"[Patient dashboard snapshot — use for personalization only]\n{dashboard_context.strip()}"},
            {"role": "assistant", "content": "Understood. I will use this snapshot to tailor my replies."},
        ] + messages

    return _llm_chat(
        system=system,
        messages=messages,
        max_tokens=512,
        not_configured_message="Health assistant is not configured. Please contact your clinician directly.",
    )


def chat_public_faq(messages: list[dict]) -> str:
    """Public FAQ chatbot — no auth required. Uses system GLM/Anthropic key."""
    return _llm_chat(
        system=PUBLIC_FAQ_SYSTEM,
        messages=messages,
        max_tokens=400,
        not_configured_message="Our AI assistant is temporarily unavailable. Please contact us directly at hello@deepsynaps.com or use the sign-up form above.",
    )


def chat_agent(
    messages: list[dict],
    provider: str = "auto",
    openai_key: str | None = None,
    context: str | None = None,
) -> str:
    """
    Doctor practice management agent.
    provider: "auto"/"glm-free" (default) → GLM with Anthropic fallback;
              "openai" uses doctor's own key;
              "anthropic" forces Anthropic directly.
    """
    settings = get_settings()
    system = AGENT_SYSTEM

    # Add dashboard context as a user message, not system prompt, to prevent
    # prompt injection via clinician-supplied context overriding system instructions.
    if context:
        messages = [
            {"role": "user", "content": f"[Dashboard context for this session]\n{context}"},
            {"role": "assistant", "content": "Understood. I have the dashboard context."},
        ] + messages

    if provider == "openai":
        key = openai_key or settings.openai_api_key
        if not key:
            return "OpenAI key not configured. Add your key in Agent Settings or contact your admin."
        try:
            from openai import OpenAI
            client_oa = OpenAI(api_key=key)
            msgs_oa = [{"role": "system", "content": system}] + messages
            resp = client_oa.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=1024,
                messages=msgs_oa,
            )
            return resp.choices[0].message.content
        except ImportError:
            return "OpenAI package not installed on this server. Use the default provider instead."
        except Exception as e:
            return f"OpenAI error: {str(e)}"

    if provider == "anthropic" and settings.anthropic_api_key:
        client = Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=_anthropic_fallback_model(),
            max_tokens=1024,
            system=system,
            messages=messages,
        )
        return _sanitize_llm_output(response.content[0].text)

    # Default: GLM-first with Anthropic fallback.
    return _llm_chat(
        system=system,
        messages=messages,
        max_tokens=1024,
        not_configured_message="AI agent is not configured. Set GLM_API_KEY or ANTHROPIC_API_KEY.",
    )


# ── Wearable copilot system prompts ──────────────────────────────────────────

WEARABLE_PATIENT_SYSTEM = """You are DeepSynaps HealthAI, a friendly health data assistant for patients.

You have access to the patient's wearable health data (heart rate, HRV, sleep, steps, mood check-ins).
This data comes from consumer wearable devices and is informational trend data only — not clinical-grade.

Your role:
- Help patients understand their own health trends in plain, reassuring language
- Explain what metrics mean (HRV, resting HR, sleep consistency) without medical jargon
- Highlight positive patterns and changes over time
- Acknowledge when data is limited, missing, or uncertain
- Always cite the time period and source of any data you reference

Rules you must never break:
- Never diagnose, medically interpret symptoms, or suggest treatment changes
- Never claim consumer wearable data is clinically accurate
- If a patient reports urgent symptoms (chest pain, severe dizziness, fainting): say 'Please contact your clinician or emergency services immediately'
- Always end with: 'For medical questions, your clinician is your first point of contact.'"""


WEARABLE_CLINICIAN_SYSTEM = """You are DeepSynaps ClinicalAI, synthesizing wearable and clinical data for clinicians.

You have access to consumer-grade wearable trends, treatment course data, and patient self-reports.
Your role is to surface patterns and correlations — not to make clinical decisions.

Your role:
- Summarize wearable trends (HR, HRV, sleep, activity, self-reports) over the specified period
- Highlight correlations with treatment sessions and assessment scores where the data supports this
- Flag missing data, sync gaps, and low-confidence readings explicitly
- Use clinical language appropriate for a qualified clinician
- Distinguish clearly between consumer-grade wearable data and validated clinical assessments

Rules:
- Never recommend autonomous treatment changes — frame as 'may warrant consideration'
- Always note data source and quality (e.g., 'Fitbit consumer device')
- Flag concerning trends for human clinician review, not autonomous AI action
- Acknowledge uncertainty when sample sizes are small or data quality is low
- End with: 'This summary is for clinical reference only — apply clinical judgment before acting on any finding.'"""


def chat_wearable_patient(messages: list[dict], wearable_context: str | None = None) -> str:
    """Patient-facing AI that answers questions about their own wearable data."""
    # Add wearable context as a user message, not system prompt.
    if wearable_context:
        messages = [
            {"role": "user", "content": f"[Patient health data for this session]\n{wearable_context}"},
            {"role": "assistant", "content": "Understood. I have the patient health data."},
        ] + messages

    return _llm_chat(
        system=WEARABLE_PATIENT_SYSTEM,
        messages=messages,
        max_tokens=768,
        not_configured_message="Health assistant is not available. Please contact your clinician directly.",
    )


def chat_wearable_clinician(messages: list[dict], patient_context: str | None = None) -> str:
    """Clinician-facing AI that summarizes wearable + treatment data for a patient."""
    # Add patient context as a user message, not system prompt.
    if patient_context:
        messages = [
            {"role": "user", "content": f"[Patient context and data for this session]\n{patient_context}"},
            {"role": "assistant", "content": "Understood. I have the patient context and data."},
        ] + messages

    return _llm_chat(
        system=WEARABLE_CLINICIAN_SYSTEM,
        messages=messages,
        max_tokens=1536,
        not_configured_message="AI assistant is not configured. Set GLM_API_KEY or ANTHROPIC_API_KEY.",
    )
