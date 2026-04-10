from anthropic import Anthropic
from app.settings import get_settings

PUBLIC_FAQ_SYSTEM = """You are DeepSynaps AI, a helpful assistant on the DeepSynaps Protocol Studio website.
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

Answer visitor questions about the platform, neuromodulation treatments, pricing, how to sign up, what to expect.
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
    settings = get_settings()
    if not settings.anthropic_api_key:
        return "AI assistant is not configured. Set ANTHROPIC_API_KEY to enable this feature."

    client = Anthropic(api_key=settings.anthropic_api_key)

    system = CLINICIAN_SYSTEM
    if patient_context:
        system += f"\n\nCurrent patient context:\n{patient_context}"

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=system,
        messages=messages,
    )
    return response.content[0].text


def chat_patient(messages: list[dict]) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return "Health assistant is not configured. Please contact your clinician directly."

    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=PATIENT_SYSTEM,
        messages=messages,
    )
    return response.content[0].text


def chat_public_faq(messages: list[dict]) -> str:
    """Public FAQ chatbot — no auth required. Uses system Anthropic key."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return "Our AI assistant is temporarily unavailable. Please contact us directly at hello@deepsynaps.com or use the sign-up form above."

    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        system=PUBLIC_FAQ_SYSTEM,
        messages=messages,
    )
    return response.content[0].text


def chat_agent(
    messages: list[dict],
    provider: str = "anthropic",
    openai_key: str | None = None,
    context: str | None = None,
) -> str:
    """
    Doctor practice management agent.
    provider: "anthropic" uses system key; "openai" uses doctor's own key.
    """
    settings = get_settings()
    system = AGENT_SYSTEM
    if context:
        system += f"\n\nCurrent dashboard context provided by the clinician:\n{context}"

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
            return "OpenAI package not installed on this server. Use Anthropic provider instead."
        except Exception as e:
            return f"OpenAI error: {str(e)}"

    # Default: Anthropic
    if not settings.anthropic_api_key:
        return "AI agent is not configured. Set ANTHROPIC_API_KEY to enable this feature."
    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system,
        messages=messages,
    )
    return response.content[0].text


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
    settings = get_settings()
    if not settings.anthropic_api_key:
        return "Health assistant is not available. Please contact your clinician directly."

    client = Anthropic(api_key=settings.anthropic_api_key)
    system = WEARABLE_PATIENT_SYSTEM
    if wearable_context:
        system += f"\n\nPatient's recent health data:\n{wearable_context}"

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=768,
        system=system,
        messages=messages,
    )
    return response.content[0].text


def chat_wearable_clinician(messages: list[dict], patient_context: str | None = None) -> str:
    """Clinician-facing AI that summarizes wearable + treatment data for a patient."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return "AI assistant is not configured. Set ANTHROPIC_API_KEY to enable this feature."

    client = Anthropic(api_key=settings.anthropic_api_key)
    system = WEARABLE_CLINICIAN_SYSTEM
    if patient_context:
        system += f"\n\nPatient context and data:\n{patient_context}"

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1536,
        system=system,
        messages=messages,
    )
    return response.content[0].text
