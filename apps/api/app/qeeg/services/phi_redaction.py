from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class RedactionResult:
    redacted_text: str
    replacements: dict[str, str]
    categories_detected: list[str]
    replacement_count: int
    residual_risk: str


_DATE_PATTERNS: tuple[re.Pattern[str], ...] = (
    # ISO + common clinical formats
    re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"),
    re.compile(r"\b(\d{2})[./-](\d{2})[./-](\d{4})\b"),
)

_TC_KIMLIK = re.compile(r"\b\d{11}\b")
_EMAIL = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}\b")
# Phone numbers: require at least one separator between groups to avoid
# misclassifying plain 10-digit identifiers (e.g. TR VKN) as phones.
_PHONE = re.compile(
    r"\b(?:\+\d{1,3}\s*)?(?:\(?\d{3}\)?[\s-]+)\d{3}[\s-]?\d{2}[\s-]?\d{2}\b"
)

# Additional structured identifiers that are common in clinical notes.
_IPV4: Final[re.Pattern[str]] = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
# Turkish VKN is 10 digits; we scope it by keyword to avoid over-redacting arbitrary numbers.
_VKN_WITH_LABEL: Final[re.Pattern[str]] = re.compile(
    r"(?i)\b(?:vkn|vergi\s*(?:no|numarası|numarasi))\s*[:#]?\s*\d{10}\b"
)
# MRN / protocol / file numbers: match label + 6-12 digits.
_MRN_WITH_LABEL: Final[re.Pattern[str]] = re.compile(
    r"(?i)\b(?:mrn|patient\s*id|hasta\s*no|protocol\s*no|protokol\s*no)\s*[:#]?\s*\d{6,12}\b"
)


def _residual_risk_from_categories(categories: set[str]) -> str:
    # Phase 0 policy: free-text names/addresses can still be present.
    if not categories:
        return "low"
    if categories.issubset({"date"}):
        return "medium"
    return "high"

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
        return RedactionResult(
            redacted_text="",
            replacements={},
            categories_detected=[],
            replacement_count=0,
            residual_risk="low",
        )

    replacements: dict[str, str] = {}
    out = text
    categories: set[str] = set()

    def _sub(pattern: re.Pattern[str], token: str, category: str) -> None:
        nonlocal out
        for m in list(pattern.finditer(out)):
            raw = m.group(0)
            if raw and raw not in replacements:
                replacements[raw] = token
                categories.add(category)
        out = pattern.sub(token, out)

    _sub(_EMAIL, "[REDACTED:EMAIL]", "email")
    # Redact labelled structured identifiers before phones to reduce false
    # positives (e.g. tax IDs).
    _sub(_VKN_WITH_LABEL, "VKN: [REDACTED:TAX_ID]", "tax_id")
    _sub(_MRN_WITH_LABEL, "MRN: [REDACTED:MRN]", "mrn")
    _sub(_TC_KIMLIK, "[REDACTED:ID]", "national_id")
    _sub(_IPV4, "[REDACTED:IP]", "ip_address")
    _sub(_PHONE, "[REDACTED:PHONE]", "phone")
    for p in _DATE_PATTERNS:
        _sub(p, "[REDACTED:DATE]", "date")

    return RedactionResult(
        redacted_text=out,
        replacements=replacements,
        categories_detected=sorted(categories),
        replacement_count=len(replacements),
        residual_risk=_residual_risk_from_categories(categories),
    )

