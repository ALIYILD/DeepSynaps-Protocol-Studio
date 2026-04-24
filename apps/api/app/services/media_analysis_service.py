"""
AI analysis service for patient media uploads and clinician notes.
All outputs are DRAFT only — require clinician review before clinical use.
Default model: GLM-4.5-Flash (Anthropic fallback).
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_MODEL = "meta-llama/llama-3.3-70b-instruct:free"

_SYSTEM_PROMPT = (
    "You are a clinical documentation assistant for a neuromodulation clinic.\n"
    "You do NOT diagnose, prescribe, or make treatment decisions.\n"
    "Your role is to extract structured information from patient-reported content\n"
    "to support clinician review. ALL output is DRAFT ONLY and requires clinician\n"
    "approval before any clinical use. Never state diagnoses as facts.\n"
    "Always use hedging language: \"patient reports\", \"patient mentions\", \"possible\"."
)

# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------


@dataclass
class PatientUploadAnalysisResult:
    structured_summary: str
    symptoms_mentioned: list[dict]
    side_effects_mentioned: list[dict]
    functional_impact: dict
    adherence_mentions: dict
    red_flags: list[dict]
    follow_up_questions: list[str]
    chart_note_draft: str
    comparison_notes: str | None
    model_used: str
    prompt_hash: str


@dataclass
class ClinicianNoteDraftResult:
    session_note: str
    treatment_update_draft: str | None
    adverse_event_draft: str | None
    patient_friendly_summary: str | None
    task_suggestions: list[dict]
    model_used: str
    prompt_hash: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _require_anthropic_key(settings) -> str:
    """Require SOME LLM provider (GLM or Anthropic). Name kept for callers."""
    glm_key: str = getattr(settings, "glm_api_key", "") or ""
    anthropic_key: str = getattr(settings, "anthropic_api_key", "") or ""
    if not glm_key and not anthropic_key:
        raise RuntimeError("AI analysis not available: set GLM_API_KEY (free tier) or ANTHROPIC_API_KEY")
    return glm_key or anthropic_key


def _hash_prompt(prompt: str) -> str:
    return hashlib.sha256(prompt.encode()).hexdigest()


def _build_prior_analyses_summary(prior_analyses: list[dict]) -> str:
    """Summarise prior analyses into a compact string for the prompt."""
    if not prior_analyses:
        return "No prior analyses available."
    summaries: list[str] = []
    for idx, analysis in enumerate(prior_analyses, start=1):
        summary = analysis.get("structured_summary") or analysis.get("summary") or "(no summary)"
        date = analysis.get("created_at") or analysis.get("date") or "unknown date"
        summaries.append(f"  [{idx}] {date}: {summary[:300]}")
    return "Prior analyses:\n" + "\n".join(summaries)


def _safe_parse_json_response(raw_text: str) -> dict:
    """
    Attempt to parse a JSON object from the model's response.

    Claude sometimes wraps JSON in a markdown code block; strip that first.
    Returns a dict (possibly empty) — never raises.
    """
    text = raw_text.strip()
    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.splitlines()
        # Remove first line (```json or ```) and last ``` line
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        text = "\n".join(inner).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSON from analysis response; returning raw text.")
        return {}


# ---------------------------------------------------------------------------
# Patient upload analysis
# ---------------------------------------------------------------------------


async def analyze_patient_upload(
    transcript_text: str,
    patient_context: dict,
    prior_analyses: list[dict],
    settings,
) -> PatientUploadAnalysisResult:
    """
    Analyse a patient's transcribed upload and return structured clinical data.

    Parameters
    ----------
    transcript_text:
        Full transcription of what the patient said/wrote.
    patient_context:
        Dict with keys such as ``condition``, ``modality``, ``sessions_completed``,
        ``total_sessions``, ``recent_scores`` (dict of scale -> score).
    prior_analyses:
        List of previous analysis result dicts for comparison.
    settings:
        App settings object exposing ``anthropic_api_key``.

    Returns
    -------
    PatientUploadAnalysisResult

    Raises
    ------
    RuntimeError
        If Anthropic API key is not configured, or if the API call fails.
    """
    _require_anthropic_key(settings)

    # ---- build user prompt ------------------------------------------------
    condition = patient_context.get("condition", "unspecified")
    modality = patient_context.get("modality", "unspecified")
    sessions_completed = patient_context.get("sessions_completed", "?")
    total_sessions = patient_context.get("total_sessions", "?")
    recent_scores_raw = patient_context.get("recent_scores", {})
    recent_scores_str = (
        ", ".join(f"{k}: {v}" for k, v in recent_scores_raw.items())
        if recent_scores_raw
        else "none recorded"
    )
    prior_summary = _build_prior_analyses_summary(prior_analyses)

    user_prompt = f"""Patient context:
- Condition: {condition}
- Modality: {modality}
- Course progress: {sessions_completed} of {total_sessions} sessions completed
- Recent assessment scores: {recent_scores_str}

Patient transcript:
\"\"\"
{transcript_text}
\"\"\"

{prior_summary}

Please analyse the transcript above and return a JSON object with EXACTLY these keys:
{{
  "structured_summary": "<2-3 sentence plain-language summary of what the patient reports>",
  "symptoms_mentioned": [
    {{"symptom": "...", "severity_reported": "...", "duration": "...", "verbatim_quote": "..."}}
  ],
  "side_effects_mentioned": [
    {{"effect": "...", "severity": "...", "verbatim_quote": "..."}}
  ],
  "functional_impact": {{
    "sleep": "...",
    "mood": "...",
    "cognition": "...",
    "work": "...",
    "social": "..."
  }},
  "adherence_mentions": {{
    "sessions_attended": "...",
    "noted_missed": "...",
    "reasons": "..."
  }},
  "red_flags": [
    {{"type": "...", "severity": "...", "verbatim_quote": "...", "reason": "..."}}
  ],
  "follow_up_questions": ["...", "..."],
  "chart_note_draft": "<SOAP-format note clearly marked DRAFT at the top>",
  "comparison_to_prior": "<string comparing to prior analyses, or null if no prior>"
}}

Use hedging language throughout (\"patient reports\", \"patient mentions\", \"possible\").
All text values are DRAFT ONLY. Return only the JSON object, no extra commentary."""

    full_prompt = _SYSTEM_PROMPT + "\n\n" + user_prompt
    prompt_hash = _hash_prompt(full_prompt)

    # ---- call LLM ----------------------------------------------------------
    from app.services.chat_service import _llm_chat_async
    try:
        logger.info(
            "Calling LLM for patient upload analysis (prompt_hash=%s)", prompt_hash[:12]
        )
        raw_text = await _llm_chat_async(
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=2048,
            not_configured_message="",
        )
    except Exception as exc:
        logger.error("LLM API error during patient upload analysis: %s", exc)
        raise RuntimeError(f"AI analysis failed: {exc}") from exc

    parsed = _safe_parse_json_response(raw_text)

    # ---- assemble result with safe fallbacks ------------------------------
    if not parsed:
        logger.warning(
            "JSON parse failed for patient upload analysis; returning minimal result. "
            "prompt_hash=%s",
            prompt_hash[:12],
        )
        return PatientUploadAnalysisResult(
            structured_summary=raw_text,
            symptoms_mentioned=[],
            side_effects_mentioned=[],
            functional_impact={},
            adherence_mentions={},
            red_flags=[],
            follow_up_questions=[],
            chart_note_draft="",
            comparison_notes=None,
            model_used=_MODEL,
            prompt_hash=prompt_hash,
        )

    return PatientUploadAnalysisResult(
        structured_summary=parsed.get("structured_summary", ""),
        symptoms_mentioned=parsed.get("symptoms_mentioned", []),
        side_effects_mentioned=parsed.get("side_effects_mentioned", []),
        functional_impact=parsed.get("functional_impact", {}),
        adherence_mentions=parsed.get("adherence_mentions", {}),
        red_flags=parsed.get("red_flags", []),
        follow_up_questions=parsed.get("follow_up_questions", []),
        chart_note_draft=parsed.get("chart_note_draft", ""),
        comparison_notes=parsed.get("comparison_to_prior") or None,
        model_used=_MODEL,
        prompt_hash=prompt_hash,
    )


# ---------------------------------------------------------------------------
# Clinician note drafting
# ---------------------------------------------------------------------------


async def generate_clinician_note_draft(
    transcript_text: str,
    note_type: str,
    patient_context: dict,
    settings,
) -> ClinicianNoteDraftResult:
    """
    Generate a structured clinician note draft from session transcript or dictation.

    Parameters
    ----------
    transcript_text:
        Clinician dictation, session notes text, or patient interview transcript.
    note_type:
        One of ``"session_note"``, ``"treatment_update"``, ``"adverse_event"``.
        Determines which optional sections are requested.
    patient_context:
        Dict with keys such as ``condition``, ``modality``, ``patient_name``,
        ``sessions_completed``, ``total_sessions``.
    settings:
        App settings object exposing ``anthropic_api_key``.

    Returns
    -------
    ClinicianNoteDraftResult

    Raises
    ------
    RuntimeError
        If Anthropic API key is not configured, or if the API call fails.
    """
    _require_anthropic_key(settings)

    # ---- build user prompt ------------------------------------------------
    condition = patient_context.get("condition", "unspecified")
    modality = patient_context.get("modality", "unspecified")
    patient_name = patient_context.get("patient_name", "the patient")
    sessions_completed = patient_context.get("sessions_completed", "?")
    total_sessions = patient_context.get("total_sessions", "?")

    adverse_event_instruction = (
        "\n- \"adverse_event_draft\": <structured adverse event report draft, REQUIRED for this note type>"
        if note_type == "adverse_event"
        else "\n- \"adverse_event_draft\": null  (not required for this note type)"
    )

    user_prompt = f"""Patient context:
- Patient: {patient_name}
- Condition: {condition}
- Modality: {modality}
- Course progress: {sessions_completed} of {total_sessions} sessions completed
- Note type requested: {note_type}

Clinician input / transcript:
\"\"\"
{transcript_text}
\"\"\"

Please produce a structured clinical documentation draft and return a JSON object with EXACTLY these keys:
{{
  "session_note": "<SOAP-format session note, clearly marked DRAFT at the top>",
  "treatment_update_draft": "<treatment plan update summary, or null if not applicable>",{adverse_event_instruction}
  "patient_friendly_summary": "<plain-language summary suitable for the patient portal>",
  "task_suggestions": [
    {{"task": "...", "priority": "high|medium|low", "due_by": "..."}}
  ]
}}

All text is DRAFT ONLY — mark clearly. Use clinical language appropriate for a qualified practitioner.
Return only the JSON object, no extra commentary."""

    full_prompt = _SYSTEM_PROMPT + "\n\n" + user_prompt
    prompt_hash = _hash_prompt(full_prompt)

    # ---- call LLM ----------------------------------------------------------
    from app.services.chat_service import _llm_chat_async
    try:
        logger.info(
            "Calling LLM for clinician note draft: note_type=%s prompt_hash=%s",
            note_type,
            prompt_hash[:12],
        )
        raw_text = await _llm_chat_async(
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=1500,
            not_configured_message="",
        )
    except Exception as exc:
        logger.error("LLM API error during clinician note draft: %s", exc)
        raise RuntimeError(f"AI note drafting failed: {exc}") from exc

    parsed = _safe_parse_json_response(raw_text)

    # ---- assemble result with safe fallbacks ------------------------------
    if not parsed:
        logger.warning(
            "JSON parse failed for clinician note draft; returning minimal result. "
            "prompt_hash=%s",
            prompt_hash[:12],
        )
        return ClinicianNoteDraftResult(
            session_note=raw_text,
            treatment_update_draft=None,
            adverse_event_draft=None,
            patient_friendly_summary=None,
            task_suggestions=[],
            model_used=_MODEL,
            prompt_hash=prompt_hash,
        )

    return ClinicianNoteDraftResult(
        session_note=parsed.get("session_note", ""),
        treatment_update_draft=parsed.get("treatment_update_draft") or None,
        adverse_event_draft=parsed.get("adverse_event_draft") or None,
        patient_friendly_summary=parsed.get("patient_friendly_summary") or None,
        task_suggestions=parsed.get("task_suggestions", []),
        model_used=_MODEL,
        prompt_hash=prompt_hash,
    )
