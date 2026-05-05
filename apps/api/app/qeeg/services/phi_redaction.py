from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RedactionResult:
    redacted_text: str
    replacements: dict[str, str]


_DATE_PATTERNS: tuple[re.Pattern[str], ...] = (
    # ISO + common clinical formats
    re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"),
    re.compile(r"\b(\d{2})[./-](\d{2})[./-](\d{4})\b"),
)

_TC_KIMLIK = re.compile(r"\b\d{11}\b")
_EMAIL = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(r"\b(?:\+?90\s*)?(?:0\s*)?(?:\(?\d{3}\)?\s*)\d{3}[\s-]?\d{2}[\s-]?\d{2}\b")

# Turkish national names are hard to deterministically strip without a lexicon.
# Phase 0 policy: redact obvious structured identifiers (emails, phones, IDs,
# dates) and leave free-text names for the upstream "openmed" pipeline in later
# phases. This file exists so the QEEG-105 report/LLM path has a single
# middleware entrypoint + unit tests; it will be expanded by the AI Narrative
# agent with human review.


def redact_phi(text: str) -> RedactionResult:
    """Best-effort PHI redaction for LLM-bound text.

    Safety principle: prefer false positives (over-redact) over false negatives.
    """
    if not text:
        return RedactionResult(redacted_text="", replacements={})

    replacements: dict[str, str] = {}
    out = text

    def _sub(pattern: re.Pattern[str], token: str) -> None:
        nonlocal out
        for m in list(pattern.finditer(out)):
            raw = m.group(0)
            if raw and raw not in replacements:
                replacements[raw] = token
        out = pattern.sub(token, out)

    _sub(_EMAIL, "[REDACTED:EMAIL]")
    _sub(_PHONE, "[REDACTED:PHONE]")
    _sub(_TC_KIMLIK, "[REDACTED:ID]")
    for p in _DATE_PATTERNS:
        _sub(p, "[REDACTED:DATE]")

    return RedactionResult(redacted_text=out, replacements=replacements)

