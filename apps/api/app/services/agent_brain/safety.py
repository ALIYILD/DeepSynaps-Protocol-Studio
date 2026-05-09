"""Safety helpers for the Clinical Agent Brain.

Centralizes:
- Standard fallback strings used by every provider when data is insufficient.
- PHI-shaped key detection for AgentMemoryProvider write-rejection.
- Helpers that build a safe ProviderResponse for common edge cases.

These constants are the canonical wording for clinician-review prompts and
hypothesis-generating disclaimers. Pages that surface agent-brain output should
display these strings verbatim where appropriate rather than paraphrasing.
"""
from __future__ import annotations

import re

from app.services.agent_brain.schemas import (
    ProviderConfidence,
    ProviderResponse,
    ProviderStatus,
)

# ── Canonical fallback messages ───────────────────────────────────────────────

INSUFFICIENT_EVIDENCE_FALLBACK = (
    "No sufficient local evidence was found. This section requires clinician "
    "review before use."
)

DEEPTWIN_FALLBACK = (
    "This is a hypothesis-generating simulation, not a diagnosis or treatment "
    "decision."
)

QEEG_MRI_VIDEO_AUDIO_FALLBACK = (
    "This AI output is decision-support only and must not be used as a "
    "standalone diagnostic conclusion."
)

NOT_CONFIGURED_FALLBACK = (
    "This provider is not configured in the current environment. Returning a "
    "safe placeholder. Clinician review is required before using any output "
    "from this surface."
)

UNAVAILABLE_FALLBACK = (
    "This provider is temporarily unavailable. No fabricated content will be "
    "returned."
)

# Phrases that an agent-brain response must NEVER contain. Used by the safety
# test to scan response strings.
FORBIDDEN_AUTONOMOUS_PHRASES = [
    "patient has been diagnosed",
    "we diagnose",
    "i diagnose",
    "prescribe ",  # trailing space — distinguishes "prescribe X" from "prescribed by"
    "treatment is guaranteed",
    "guaranteed cure",
    "this confirms the diagnosis",
]

# ── PHI detection (defensive, not exhaustive) ─────────────────────────────────

# Heuristic key names that indicate a PHI-shaped payload. AgentMemoryProvider
# rejects any payload whose top-level keys match these.
PHI_KEY_PATTERN = re.compile(
    r"^(patient_id|mrn|medical_record_number|dob|date_of_birth|ssn|"
    r"social_security|email|phone|phone_number|address|first_name|last_name|"
    r"full_name|insurance_id|nhs_number|chart_id|encounter_id|"
    r"patient|patients|person)$",
    re.IGNORECASE,
)


def looks_like_phi(payload: object) -> bool:
    """Best-effort heuristic. True if any key in the payload (recursively at the
    top two levels) matches the PHI key pattern. Not a substitute for proper
    de-identification — this is a defense-in-depth guard for the agent memory
    write path so that obviously unsafe writes are rejected at the door.
    """
    if isinstance(payload, dict):
        for k, v in payload.items():
            if isinstance(k, str) and PHI_KEY_PATTERN.match(k):
                return True
            if isinstance(v, dict):
                for k2 in v.keys():
                    if isinstance(k2, str) and PHI_KEY_PATTERN.match(k2):
                        return True
    return False


# ── Safe ProviderResponse helpers ─────────────────────────────────────────────

def safe_fallback(
    *,
    provider: str,
    query: str,
    status: ProviderStatus,
    answer: str | None = None,
    safety_flags: list[str] | None = None,
    missing_requirements: list[str] | None = None,
    confidence: ProviderConfidence = "unknown",
) -> ProviderResponse:
    """Build a ProviderResponse for an unavailable / not-configured / insufficient
    state. Always sets `requires_clinician_review=True` and
    `patient_facing_allowed=False`.
    """
    if answer is None:
        if status == "not_configured":
            answer = NOT_CONFIGURED_FALLBACK
        elif status == "unavailable":
            answer = UNAVAILABLE_FALLBACK
        else:
            answer = INSUFFICIENT_EVIDENCE_FALLBACK

    return ProviderResponse(
        provider=provider,
        status=status,
        query=query,
        answer=answer,
        safety_flags=list(safety_flags or []) + [
            "requires_clinician_review",
            "no_autonomous_diagnosis",
        ],
        missing_requirements=list(missing_requirements or []),
        requires_clinician_review=True,
        patient_facing_allowed=False,
        confidence=confidence,
    )


def denied_response(provider: str, query: str, reason: str) -> ProviderResponse:
    return ProviderResponse(
        provider=provider,
        status="denied",
        query=query,
        answer=f"Access denied: {reason}.",
        safety_flags=["access_denied"],
        requires_clinician_review=True,
        patient_facing_allowed=False,
        confidence="unknown",
    )
