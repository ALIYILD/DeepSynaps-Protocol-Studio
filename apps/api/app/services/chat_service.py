import contextvars
import logging
import os
import re
from typing import Any

from anthropic import Anthropic
from app.settings import get_settings

_llm_log = logging.getLogger(__name__)


# ── Phase 8 — provider usage capture sidecar ─────────────────────────────────
# The shipped ``_llm_chat`` returns just the assistant text and discards the
# provider response object. The Phase-7 budget pre-check works against a
# rough chars/4 estimate; Phase-8 wants real provider numbers when the
# upstream returned a usage block. To preserve every existing call site
# (and every existing test that monkeypatches ``_llm_chat``) we keep
# ``_llm_chat`` as the canonical implementation and let it stash usage on
# a context-local sidecar. ``_llm_chat_with_usage`` then pops that sidecar
# off after the call and returns it alongside the text.
#
# When ``_llm_chat`` is monkeypatched (tests), the sidecar stays at ``None``
# and ``_llm_chat_with_usage`` returns ``(text, None)`` — which is exactly
# the "provider didn't report usage" branch the runner already handles.
_LAST_USAGE: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "_deepsynaps_last_llm_usage", default=None
)


def _capture_openrouter_usage(resp: Any, fallback_model: str) -> None:
    """Pull a usage dict off an OpenAI/OpenRouter chat-completions response.

    The OpenAI SDK exposes ``resp.usage`` with ``prompt_tokens`` /
    ``completion_tokens`` attributes (or as dict keys when the response
    was deserialised). We tolerate either shape and silently skip on
    anything else — usage capture is opportunistic, never load-bearing.
    """
    try:
        usage_obj = getattr(resp, "usage", None)
        if usage_obj is None and isinstance(resp, dict):
            usage_obj = resp.get("usage")
        if usage_obj is None:
            return
        prompt_tokens = (
            getattr(usage_obj, "prompt_tokens", None)
            if not isinstance(usage_obj, dict)
            else usage_obj.get("prompt_tokens")
        )
        completion_tokens = (
            getattr(usage_obj, "completion_tokens", None)
            if not isinstance(usage_obj, dict)
            else usage_obj.get("completion_tokens")
        )
        if prompt_tokens is None and completion_tokens is None:
            return
        model = (
            getattr(resp, "model", None)
            if not isinstance(resp, dict)
            else resp.get("model")
        ) or fallback_model
        _LAST_USAGE.set(
            {
                "input_tokens": int(prompt_tokens or 0),
                "output_tokens": int(completion_tokens or 0),
                "model": str(model or ""),
                "provider": "openrouter",
            }
        )
    except Exception:  # noqa: BLE001 — usage capture must never raise
        return


def _capture_anthropic_usage(resp: Any, fallback_model: str) -> None:
    """Pull a usage dict off an Anthropic Messages API response.

    The SDK exposes ``resp.usage`` with ``input_tokens`` / ``output_tokens``
    attributes. Same fail-safe rules as the OpenRouter helper.
    """
    try:
        usage_obj = getattr(resp, "usage", None)
        if usage_obj is None and isinstance(resp, dict):
            usage_obj = resp.get("usage")
        if usage_obj is None:
            return
        input_tokens = (
            getattr(usage_obj, "input_tokens", None)
            if not isinstance(usage_obj, dict)
            else usage_obj.get("input_tokens")
        )
        output_tokens = (
            getattr(usage_obj, "output_tokens", None)
            if not isinstance(usage_obj, dict)
            else usage_obj.get("output_tokens")
        )
        if input_tokens is None and output_tokens is None:
            return
        model = (
            getattr(resp, "model", None)
            if not isinstance(resp, dict)
            else resp.get("model")
        ) or fallback_model
        _LAST_USAGE.set(
            {
                "input_tokens": int(input_tokens or 0),
                "output_tokens": int(output_tokens or 0),
                "model": str(model or ""),
                "provider": "anthropic",
            }
        )
    except Exception:  # noqa: BLE001 — usage capture must never raise
        return


# ── Clinical-context extraction for evidence RAG ─────────────────────────────
# Heuristic mapping of surface tokens the clinician might type into the chat
# to the canonical modality / condition slugs used in the evidence DB's
# modalities_json / conditions_json columns. Kept intentionally small and
# deterministic: a regex-based matcher runs in <1ms per message and is
# predictable enough for tests. New synonyms can be added inline.

# Modality surface forms → canonical slug stored in modalities_json.
# Order matters only for overlapping aliases (rtms before tms to avoid
# swallowing rtms mentions as plain tms).
_MODALITY_SYNONYMS: tuple[tuple[str, str], ...] = (
    (r"\brtms\b", "rtms"),
    (r"\btacs\b", "tacs"),
    (r"\btdcs\b", "tdcs"),
    (r"\btms\b",  "tms"),
    (r"\bdbs\b",  "dbs"),
    (r"\bscs\b",  "scs"),
    (r"\bvns\b",  "vns"),
    (r"\bpns\b",  "pns"),
    (r"\brns\b",  "rns"),
    (r"\bdcs\b",  "dcs"),
)

# Condition surface forms → canonical slug stored in conditions_json.
# Keys are regexes (word-boundary anchored); values are the DB slug.
_CONDITION_SYNONYMS: tuple[tuple[str, str], ...] = (
    (r"\bmdd\b",                            "mdd"),
    (r"\bmajor depressive\b",               "mdd"),
    (r"\bdepression\b",                     "mdd"),
    (r"\bparkinson[\'s]*\b",                "parkinsons"),
    (r"\bocd\b",                            "ocd"),
    (r"\bobsessive[- ]compulsive\b",        "ocd"),
    (r"\bchronic pain\b",                   "chronic_pain"),
    (r"\bstroke\b",                         "stroke"),
    (r"\balzheimer[\'s]*\b",                "alzheimers"),
    (r"\banxiety\b",                        "anxiety"),
    (r"\bptsd\b",                           "ptsd"),
    (r"\badhd\b",                           "adhd"),
    (r"\btbi\b",                            "tbi"),
    (r"\btraumatic brain injury\b",         "tbi"),
    (r"\bepilepsy\b",                       "epilepsy"),
)

# Triggers that flip prefer_rct on when scoring evidence results.
_RCT_CUES_RE = re.compile(
    r"\b(evidence|rct|randomi[sz]ed|meta[- ]analysis|systematic review)\b",
    re.IGNORECASE,
)


def _extract_clinical_context(message: str) -> tuple[str | None, str | None]:
    """Return (modality_slug, condition_slug) heuristically extracted from the
    user's message, or (None, None) when nothing confidently matches.

    First match wins for each axis; we don't try to be clever about multiple
    modalities in one message (picking the first keeps results focused).
    """
    text = message or ""
    if not text:
        return None, None

    modality: str | None = None
    for pattern, slug in _MODALITY_SYNONYMS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            modality = slug
            break

    condition: str | None = None
    for pattern, slug in _CONDITION_SYNONYMS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            condition = slug
            break

    return modality, condition


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
    return os.getenv("LLM_MODEL", "z-ai/glm-4.5-air:free")

def _anthropic_fallback_model() -> str:
    return os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")


def _llm_chat(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
    temperature: float = 0.3,
    not_configured_message: str = "AI assistant is not configured. Set GLM_API_KEY or ANTHROPIC_API_KEY to enable this feature.",
) -> str:
    """Sync LLM call. Returns just the assistant text.

    On a successful provider response we *also* stash a usage dict on the
    :data:`_LAST_USAGE` context-local so :func:`_llm_chat_with_usage` can
    return real numbers without changing this function's signature
    (10+ callers depend on the str return contract).
    """
    settings = get_settings()
    if settings.glm_api_key:
        try:
            from openai import OpenAI
            import openai as _openai_mod
            from app.services.resilience import retry_call
            client = OpenAI(api_key=settings.glm_api_key, base_url=_LLM_BASE_URL, default_headers=_LLM_HEADERS)
            resp = retry_call(
                lambda: client.chat.completions.create(
                    model=_llm_model(),
                    max_tokens=max_tokens,
                    temperature=temperature,
                    messages=[{"role": "system", "content": system}] + messages,
                ),
                retries=2,
                base_delay=1.0,
                retryable=(
                    _openai_mod.APIConnectionError,
                    _openai_mod.RateLimitError,
                    _openai_mod.APITimeoutError,
                ),
                label="openai_chat",
            )
            _capture_openrouter_usage(resp, fallback_model=_llm_model())
            return _sanitize_llm_output(resp.choices[0].message.content or "")
        except Exception as exc:
            # Log enough provider context to debug a silent fallback. The
            # warning level is deliberate so this lands in the audit feed
            # whenever the primary OpenAI/OpenRouter path errors.
            _llm_log.warning(
                "LLM primary path failed (provider=openai/openrouter model=%s exc=%s: %s); falling back to anthropic",
                _llm_model(),
                exc.__class__.__name__,
                exc,
            )
    if settings.anthropic_api_key:
        client = Anthropic(api_key=settings.anthropic_api_key)
        resp = client.messages.create(
            model=_anthropic_fallback_model(),
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        _capture_anthropic_usage(resp, fallback_model=_anthropic_fallback_model())
        return _sanitize_llm_output(resp.content[0].text)
    return not_configured_message


def _llm_chat_with_usage(
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
    temperature: float = 0.3,
    not_configured_message: str = "AI assistant is not configured. Set GLM_API_KEY or ANTHROPIC_API_KEY to enable this feature.",
) -> tuple[str, dict[str, Any] | None]:
    """Strict superset of :func:`_llm_chat` — returns ``(text, usage)``.

    ``usage`` is a dict ``{"input_tokens": int, "output_tokens": int,
    "model": str, "provider": str}`` when the upstream returned a usage
    block we recognise (OpenAI / OpenRouter ``prompt_tokens`` /
    ``completion_tokens``, or Anthropic ``input_tokens`` /
    ``output_tokens``). Returns ``None`` when:

    * the provider didn't return a usage block,
    * the response shape didn't match either pattern,
    * ``_llm_chat`` was monkeypatched (tests), so no real provider call
      happened and the sidecar was never populated.

    Never raises — usage parsing failures fall back to ``None`` so the
    caller can apply its own char/4 estimate.
    """
    # Reset the sidecar so a stale capture from a prior call in this
    # context can't leak into this one. The real provider paths in
    # ``_llm_chat`` will re-populate it on success.
    _LAST_USAGE.set(None)
    text = _llm_chat(
        system=system,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        not_configured_message=not_configured_message,
    )
    usage = _LAST_USAGE.get()
    return text, usage


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
            import openai as _openai_mod
            from app.services.resilience import retry_call_async
            client = AsyncOpenAI(api_key=settings.glm_api_key, base_url=_LLM_BASE_URL, default_headers=_LLM_HEADERS)
            resp = await retry_call_async(
                lambda: client.chat.completions.create(
                    model=_llm_model(),
                    max_tokens=max_tokens,
                    temperature=temperature,
                    messages=[{"role": "system", "content": system}] + messages,
                ),
                retries=2,
                base_delay=1.0,
                retryable=(
                    _openai_mod.APIConnectionError,
                    _openai_mod.RateLimitError,
                    _openai_mod.APITimeoutError,
                ),
                label="openai_chat_async",
            )
            return _sanitize_llm_output(resp.choices[0].message.content or "")
        except Exception as exc:
            # Mirror the sync path so async failures land in the audit feed
            # with provider/model/exception class — previously logged a bare
            # message that was hard to triage.
            _llm_log.warning(
                "LLM async primary path failed (provider=openai/openrouter model=%s exc=%s: %s); falling back to anthropic",
                _llm_model(),
                exc.__class__.__name__,
                exc,
            )
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


def _agent_llm_dispatch(
    system: str,
    messages: list[dict],
    provider: str,
    openai_key: str | None,
) -> str:
    """Shared LLM dispatch for the practice-management agent. Extracted so
    chat_agent and chat_agent_with_evidence can share the provider routing."""
    settings = get_settings()

    if provider == "openai":
        key = openai_key or settings.openai_api_key
        if not key:
            return "OpenAI key not configured. Add your key in Agent Settings or contact your admin."
        try:
            from openai import OpenAI
            import openai as _openai_mod
            from app.services.resilience import retry_call
            client_oa = OpenAI(api_key=key)
            msgs_oa = [{"role": "system", "content": system}] + messages
            resp = retry_call(
                lambda: client_oa.chat.completions.create(
                    model="gpt-4o-mini",
                    max_tokens=1024,
                    messages=msgs_oa,
                ),
                retries=2,
                base_delay=1.0,
                retryable=(
                    _openai_mod.APIConnectionError,
                    _openai_mod.RateLimitError,
                    _openai_mod.APITimeoutError,
                ),
                label="agent_openai_chat",
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

    Backward-compatible wrapper that returns only the reply string. Callers
    that also want the evidence papers used to augment the answer should use
    `chat_agent_with_evidence` instead.
    """
    system = AGENT_SYSTEM

    # Add dashboard context as a user message, not system prompt, to prevent
    # prompt injection via clinician-supplied context overriding system instructions.
    if context:
        messages = [
            {"role": "user", "content": f"[Dashboard context for this session]\n{context}"},
            {"role": "assistant", "content": "Understood. I have the dashboard context."},
        ] + messages

    return _agent_llm_dispatch(system, messages, provider, openai_key)


def chat_agent_with_evidence(
    messages: list[dict],
    provider: str = "auto",
    openai_key: str | None = None,
    context: str | None = None,
) -> tuple[str, list[dict]]:
    """Same as chat_agent but also performs evidence-paper retrieval on the
    user's latest message and augments the system prompt with real citations.

    Returns (reply, cited_papers). cited_papers is a list of dicts shaped for
    the frontend "Papers cited" panel: {id, pmid, title, url}. Always a list —
    empty when the evidence DB is missing, the message had no clinical cues,
    or the search returned zero rows. Failures inside the RAG path are
    swallowed so chat keeps working.
    """
    system = AGENT_SYSTEM
    cited_papers: list[dict] = []

    # Pull the most recent user message as the retrieval query. Falls back to
    # the whole concatenated transcript if somehow no user role is present.
    latest_user = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            latest_user = (m.get("content") or "").strip()
            break
    if not latest_user:
        latest_user = " ".join((m.get("content") or "") for m in messages).strip()

    try:
        modality, condition = _extract_clinical_context(latest_user)
        # Only hit the DB when we have at least some clinical signal — a
        # modality, a condition, or an explicit evidence-cue. Saves an IO
        # roundtrip on plain practice-management questions.
        prefer_rct = bool(_RCT_CUES_RE.search(latest_user))
        if modality or condition or prefer_rct:
            # Local import to keep chat_service importable when the evidence
            # pipeline package layout changes.
            from app.services.evidence_rag import (
                search_evidence,
                format_evidence_context,
            )
            papers = search_evidence(
                query=latest_user,
                modality=modality,
                condition=condition,
                top_k=5,
                prefer_rct=prefer_rct,
            )
            if papers:
                ctx = format_evidence_context(papers)
                system = (
                    AGENT_SYSTEM
                    + "\n\nYou have access to the following real papers from our "
                    "evidence database. Cite them inline as [1], [2]... when "
                    "relevant.\n\n<papers>\n"
                    + ctx
                    + "\n</papers>\n\nAlways prefer these papers over general "
                    "knowledge when they apply to the user's question."
                )
                # Shape for the API response. Only the fields the frontend
                # needs for the "Papers cited" panel.
                for i, p in enumerate(papers[:5], start=1):
                    cited_papers.append({
                        "id": i,
                        "pmid": p.get("pmid"),
                        "title": p.get("title"),
                        "url": p.get("url"),
                    })
    except Exception as exc:  # noqa: BLE001 — RAG must never 500 the chat
        _llm_log.warning("chat_agent evidence RAG failed, continuing without: %s", exc)
        cited_papers = []

    # Add dashboard context as a user message, not system prompt, to prevent
    # prompt injection via clinician-supplied context overriding system instructions.
    if context:
        messages = [
            {"role": "user", "content": f"[Dashboard context for this session]\n{context}"},
            {"role": "assistant", "content": "Understood. I have the dashboard context."},
        ] + messages

    reply = _agent_llm_dispatch(system, messages, provider, openai_key)
    return reply, cited_papers


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
