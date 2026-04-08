from anthropic import Anthropic
from app.settings import get_settings

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
