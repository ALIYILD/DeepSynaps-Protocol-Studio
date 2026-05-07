"""Clinical report generation: hybrid LLM + rule-based fallback.

Consumes RiskScoreResult, BiomarkerResult, EmotionResult, TranscriptResult and
produces a structured ClinicalVoiceReport. Never calls models again — all
upstream inference is already done by scoring.py / biomarkers.py / emotion.py.

All heavy imports (anthropic) are lazy — inside _call_llm — so this module can
be imported in CPU-only test environments without that package installed.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Literal, Optional

from biomarkers import BiomarkerResult
from emotion import EmotionResult
from scoring import RiskScoreResult
from transcription import TranscriptResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ClinicalFinding:
    domain: Literal["speech_quality", "emotional_affect", "vocal_biomarkers", "risk_indicators"]
    observation: str
    clinical_significance: str
    evidence_level: Literal["low", "moderate", "high"]
    source_signals: list[str]


@dataclass
class ClinicalVoiceReport:
    summary: str
    findings: list[ClinicalFinding]
    recommendations: list[str]
    risk_tier: Literal["low", "moderate", "high", "critical"]
    raw_scores: dict
    raw_flags: list[str]
    data_quality_notes: list[str]


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------


def _get_system_prompt() -> str:
    return (
        "You are a clinical neuropsychology assistant supporting decision-making "
        "for voice-based mental health screening tools. Your role is to interpret "
        "acoustic and emotional voice-analysis data and produce structured clinical "
        "summaries for review by a qualified clinician. "
        "You do not diagnose. You do not prescribe. All outputs are decision "
        "support only and must be correlated with clinical interview, validated "
        "self-report instruments, and clinician judgment before any care decision "
        "is made. "
        "Frame all observations as 'patterns consistent with', 'may warrant further "
        "assessment', or 'consider correlation with'. Never use definitive diagnostic "
        "language. Maintain a neutral, professional tone appropriate for clinical "
        "documentation review."
    )


# ---------------------------------------------------------------------------
# Facts builder
# ---------------------------------------------------------------------------


def _build_facts_dict(
    risk: RiskScoreResult,
    biomarkers: Optional[BiomarkerResult],
    emotion: Optional[EmotionResult],
    transcript: Optional[TranscriptResult],
) -> dict:
    facts: dict = {
        "risk_tier": risk.risk_tier,
        "depression_risk": risk.depression_risk,
        "anxiety_risk": risk.anxiety_risk,
        "stress_level": risk.stress_level,
        "cognitive_load": risk.cognitive_load,
        "risk_flags": risk.flags,
        "risk_model": risk.model_name,
        "risk_fallback_used": risk.fallback_used,
    }

    if biomarkers is not None:
        facts["biomarkers"] = {
            "duration_sec": biomarkers.duration_sec,
            "f0_mean_hz": biomarkers.f0_mean_hz,
            "f0_std_hz": biomarkers.f0_std_hz,
            "f0_range_hz": biomarkers.f0_range_hz,
            "hnr_db": biomarkers.hnr_db,
            "jitter_local": biomarkers.jitter_local,
            "shimmer_local": biomarkers.shimmer_local,
            "speech_rate_syllables_per_sec": biomarkers.speech_rate_syllables_per_sec,
            "pause_ratio": biomarkers.pause_ratio,
            "voice_breaks_count": biomarkers.voice_breaks_count,
            "flags": {
                "elevated_jitter": biomarkers.flags.elevated_jitter,
                "reduced_hnr": biomarkers.flags.reduced_hnr,
                "flat_f0_range": biomarkers.flags.flat_f0_range,
                "high_pause_ratio": biomarkers.flags.high_pause_ratio,
            },
            "extraction_warnings": biomarkers.extraction_warnings,
        }
    else:
        facts["biomarkers"] = None

    if emotion is not None:
        mean_valence = 0.0
        mean_arousal = 0.0
        if emotion.timeline:
            mean_valence = sum(pt.valence for pt in emotion.timeline) / len(emotion.timeline)
            mean_arousal = sum(pt.arousal for pt in emotion.timeline) / len(emotion.timeline)
        facts["emotion"] = {
            "overall_emotion": emotion.overall_emotion,
            "overall_confidence": emotion.overall_confidence,
            "mean_valence": mean_valence,
            "mean_arousal": mean_arousal,
            "fallback_used": emotion.fallback_used,
        }
    else:
        facts["emotion"] = None

    if transcript is not None:
        facts["transcript"] = {
            "language": transcript.language,
            "duration_sec": transcript.duration_sec,
            "text_length_chars": len(transcript.text),
            "segment_count": len(transcript.segments),
        }
    else:
        facts["transcript"] = None

    return facts


# ---------------------------------------------------------------------------
# LLM adapter — monkeypatchable seam
# ---------------------------------------------------------------------------


def _call_llm(system_prompt: str, facts: dict) -> str:
    """Call the LLM and return raw text output.

    Lazy-imports anthropic inside this function. Re-raises on any exception
    so the caller (generate_clinical_report) can catch and fall back to
    rule-based generation.

    No shared voice-engine LLM client exists at the time of writing (the
    qeeg-pipeline has an async one in a separate package). Replace this thin
    adapter when a shared client is introduced.
    """
    import anthropic  # lazy import

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key)

    user_message = (
        "Analyse the following voice analysis data and return a JSON object with "
        "exactly these keys:\n"
        "  summary       — string, 2-4 sentences, decision-support framing\n"
        "  findings      — list of objects, each with keys: domain (one of "
        "speech_quality, emotional_affect, vocal_biomarkers, risk_indicators), "
        "observation (string), clinical_significance (string), evidence_level "
        "(one of low, moderate, high), source_signals (list of strings)\n"
        "  recommendations — list of 2-5 conservative strings\n\n"
        "Return valid JSON only. No prose outside the JSON object.\n\n"
        f"Data:\n{json.dumps(facts, indent=2)}"
    )

    message = client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        timeout=30,
    )

    return message.content[0].text


# ---------------------------------------------------------------------------
# LLM output parser
# ---------------------------------------------------------------------------


def _parse_llm_output(text: str) -> tuple[str, list[ClinicalFinding], list[str]]:
    """Parse LLM JSON output into (summary, findings, recommendations).

    Strips markdown code fences if present. Raises ValueError on malformed output.
    """
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        # drop first and last fence lines
        inner = lines[1:] if lines[0].startswith("```") else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        stripped = "\n".join(inner)

    try:
        data = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM output is not valid JSON: {exc}") from exc

    summary = data.get("summary", "")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("LLM output missing non-empty 'summary'")

    raw_findings = data.get("findings", [])
    if not isinstance(raw_findings, list) or not raw_findings:
        raise ValueError("LLM output missing non-empty 'findings' list")

    _valid_domains = {"speech_quality", "emotional_affect", "vocal_biomarkers", "risk_indicators"}
    _valid_evidence = {"low", "moderate", "high"}

    findings: list[ClinicalFinding] = []
    for item in raw_findings:
        domain = item.get("domain", "risk_indicators")
        if domain not in _valid_domains:
            domain = "risk_indicators"
        evidence_level = item.get("evidence_level", "moderate")
        if evidence_level not in _valid_evidence:
            evidence_level = "moderate"
        findings.append(
            ClinicalFinding(
                domain=domain,
                observation=str(item.get("observation", "")),
                clinical_significance=str(item.get("clinical_significance", "")),
                evidence_level=evidence_level,
                source_signals=list(item.get("source_signals", [])),
            )
        )

    recommendations = data.get("recommendations", [])
    if not isinstance(recommendations, list):
        recommendations = []
    recommendations = [str(r) for r in recommendations if r]

    return summary, findings, recommendations


# ---------------------------------------------------------------------------
# Rule-based fallback
# ---------------------------------------------------------------------------


def _build_rule_based_report(
    risk: RiskScoreResult,
    biomarkers: Optional[BiomarkerResult],
    emotion: Optional[EmotionResult],
) -> tuple[str, list[ClinicalFinding], list[str]]:
    """Deterministic rule-based report. No LLM involved."""

    # --- Summary ---
    score_map = {
        "depression_risk": risk.depression_risk,
        "anxiety_risk": risk.anxiety_risk,
        "stress_level": risk.stress_level,
        "cognitive_load": risk.cognitive_load,
    }
    top_names = [
        k.replace("_", " ")
        for k, v in sorted(score_map.items(), key=lambda x: x[1], reverse=True)
        if v >= 0.30
    ][:2]
    top_str = " and ".join(top_names) if top_names else "measured parameters"

    tier = risk.risk_tier
    if tier == "low":
        summary = (
            "Voice-derived risk indicators are within typical bounds. "
            "Continue routine monitoring."
        )
    elif tier == "moderate":
        summary = (
            f"Voice analysis shows moderate signals across {top_str}. "
            "This is decision support only — clinical correlation recommended."
        )
    elif tier == "high":
        summary = (
            f"Voice analysis shows elevated patterns in {top_str}. "
            "Patterns may warrant further assessment by a qualified clinician."
        )
    else:  # critical
        summary = (
            f"Voice analysis shows substantially elevated patterns in {top_str}. "
            "Suggest closer monitoring and follow-up evaluation with a qualified clinician."
        )

    # --- Findings ---
    findings: list[ClinicalFinding] = []

    # speech_quality finding from biomarker numeric fields
    if biomarkers is not None:
        speech_signals: list[str] = []
        obs_parts: list[str] = []

        if biomarkers.hnr_db is not None:
            speech_signals.append("hnr_db")
            if biomarkers.flags.reduced_hnr:
                obs_parts.append("reduced harmonics-to-noise ratio")

        if biomarkers.pause_ratio is not None:
            speech_signals.append("pause_ratio")
            if biomarkers.flags.high_pause_ratio:
                obs_parts.append("elevated pause ratio")

        if biomarkers.speech_rate_syllables_per_sec is not None:
            speech_signals.append("speech_rate_syllables_per_sec")
            if biomarkers.speech_rate_syllables_per_sec < 2.0:
                obs_parts.append("low speech rate")

        if speech_signals:
            evidence = "moderate" if obs_parts else "low"
            observation = (
                "Patterns consistent with " + ", ".join(obs_parts)
                if obs_parts
                else "Speech quality parameters within measurable range."
            )
            findings.append(
                ClinicalFinding(
                    domain="speech_quality",
                    observation=observation,
                    clinical_significance=(
                        "Speech quality parameters may warrant correlation with "
                        "self-report instruments."
                    ),
                    evidence_level=evidence,
                    source_signals=speech_signals,
                )
            )

    # emotional_affect finding
    if emotion is not None:
        mean_valence = 0.0
        mean_arousal = 0.0
        if emotion.timeline:
            mean_valence = sum(pt.valence for pt in emotion.timeline) / len(emotion.timeline)
            mean_arousal = sum(pt.arousal for pt in emotion.timeline) / len(emotion.timeline)

        affect_signals = ["overall_emotion", "mean_valence", "mean_arousal"]
        affect_obs = (
            f"Overall emotional pattern classified as '{emotion.overall_emotion}' "
            f"(confidence {emotion.overall_confidence:.2f}), mean valence "
            f"{mean_valence:.2f}, mean arousal {mean_arousal:.2f}."
        )
        evidence = "moderate" if emotion.overall_confidence >= 0.5 else "low"
        findings.append(
            ClinicalFinding(
                domain="emotional_affect",
                observation=affect_obs,
                clinical_significance=(
                    "Affect pattern may warrant clinical correlation. "
                    "Decision support only."
                ),
                evidence_level=evidence,
                source_signals=affect_signals,
            )
        )

    # vocal_biomarkers finding from BiomarkerFlags
    if biomarkers is not None:
        active_flags = [
            name
            for name, val in {
                "elevated_jitter": biomarkers.flags.elevated_jitter,
                "reduced_hnr": biomarkers.flags.reduced_hnr,
                "flat_f0_range": biomarkers.flags.flat_f0_range,
                "high_pause_ratio": biomarkers.flags.high_pause_ratio,
            }.items()
            if val
        ]
        if active_flags:
            findings.append(
                ClinicalFinding(
                    domain="vocal_biomarkers",
                    observation=(
                        "Vocal biomarker flags indicate: "
                        + ", ".join(f.replace("_", " ") for f in active_flags)
                        + "."
                    ),
                    clinical_significance=(
                        "Acoustic biomarker deviations may warrant further assessment."
                    ),
                    evidence_level="moderate",
                    source_signals=active_flags,
                )
            )

    # risk_indicators finding from flags
    if risk.flags:
        findings.append(
            ClinicalFinding(
                domain="risk_indicators",
                observation=(
                    "Risk scoring flagged: "
                    + "; ".join(risk.flags[:5])
                    + ("." if not risk.flags[0].endswith(".") else "")
                ),
                clinical_significance=(
                    f"Risk tier assessed as '{tier}'. "
                    "Patterns consistent with signals that may warrant further evaluation."
                ),
                evidence_level="moderate",
                source_signals=risk.flags[:5],
            )
        )

    # Ensure at least one finding exists
    if not findings:
        findings.append(
            ClinicalFinding(
                domain="risk_indicators",
                observation=f"Voice analysis completed. Risk tier: {tier}.",
                clinical_significance="Insufficient signals to generate detailed findings.",
                evidence_level="low",
                source_signals=[],
            )
        )

    # --- Recommendations ---
    recommendations: list[str] = []
    recommendations.append("Correlate with patient self-report (PHQ-9, GAD-7).")
    recommendations.append("Repeat assessment in 2-4 weeks.")
    if tier in {"moderate", "high", "critical"}:
        recommendations.append("Monitor for symptom progression.")
    if tier in {"high", "critical"}:
        recommendations.append("Consider referral if patterns persist.")
    if tier == "critical":
        recommendations.append("Suggest closer monitoring and follow-up evaluation.")

    return summary, findings, recommendations


# ---------------------------------------------------------------------------
# Data quality notes
# ---------------------------------------------------------------------------


def _build_data_quality_notes(
    risk: RiskScoreResult,
    biomarkers: Optional[BiomarkerResult],
    emotion: Optional[EmotionResult],
    transcript: Optional[TranscriptResult],
) -> list[str]:
    notes: list[str] = []

    if biomarkers is not None:
        for warning in biomarkers.extraction_warnings:
            notes.append(warning)

    sparse_flag = "Limited acoustic evidence; score confidence reduced"
    if sparse_flag in risk.flags:
        notes.append(sparse_flag)

    if emotion is None:
        notes.append("Emotion analysis was not run; affect-based findings unavailable.")

    if transcript is None:
        notes.append("Transcript not available; speech-content analysis skipped.")

    if biomarkers is None:
        notes.append("Biomarker extraction not run; acoustic findings unavailable.")

    return notes


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def generate_clinical_report(
    risk: RiskScoreResult,
    biomarkers: Optional[BiomarkerResult] = None,
    emotion: Optional[EmotionResult] = None,
    transcript: Optional[TranscriptResult] = None,
) -> ClinicalVoiceReport:
    """Generate a structured clinical voice report.

    risk is required; biomarkers, emotion, and transcript are optional.
    Never calls models again — all upstream inference must already be done.
    Never crashes if optional inputs are None.

    Attempts LLM generation first; falls back transparently to deterministic
    rule-based generation on any LLM or parse failure.
    """
    raw_scores = {
        "depression_risk": risk.depression_risk,
        "anxiety_risk": risk.anxiety_risk,
        "stress_level": risk.stress_level,
        "cognitive_load": risk.cognitive_load,
    }
    raw_flags = list(risk.flags)
    risk_tier = risk.risk_tier
    data_quality_notes = _build_data_quality_notes(risk, biomarkers, emotion, transcript)

    summary: str = ""
    findings: list[ClinicalFinding] = []
    recommendations: list[str] = []

    try:
        facts = _build_facts_dict(risk, biomarkers, emotion, transcript)
        system_prompt = _get_system_prompt()
        llm_text = _call_llm(system_prompt, facts)
        summary, findings, recommendations = _parse_llm_output(llm_text)
        logger.info("generate_clinical_report: LLM path succeeded")
    except Exception as exc:
        logger.warning(
            "generate_clinical_report: LLM path failed (%s); using rule-based fallback",
            exc,
        )
        summary, findings, recommendations = _build_rule_based_report(risk, biomarkers, emotion)

    return ClinicalVoiceReport(
        summary=summary,
        findings=findings,
        recommendations=recommendations,
        risk_tier=risk_tier,
        raw_scores=raw_scores,
        raw_flags=raw_flags,
        data_quality_notes=data_quality_notes,
    )
