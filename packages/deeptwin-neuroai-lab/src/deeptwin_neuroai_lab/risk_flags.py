"""Unsafe-language guards for research outputs (no autonomous clinical claims)."""

from __future__ import annotations

import re
from typing import Pattern

# Phrases that must not appear in simulation or advisory text surfaces.
UNSAFE_CLAIM_PATTERNS: list[Pattern[str]] = [
    re.compile(r"\brecommended treatment\b", re.I),
    re.compile(r"\bdiagnosis\b", re.I),
    re.compile(r"\bwill improve\b", re.I),
    re.compile(r"\bcaused\b", re.I),
    re.compile(r"\bincrease dose\b", re.I),
    re.compile(r"\bchange protocol\b", re.I),
    re.compile(r"\bsafe to use\b", re.I),
    re.compile(r"\bcausal proof\b", re.I),
    re.compile(r"\bautonomous protocol\b", re.I),
]


class UnsafeLanguageError(ValueError):
    """Raised when text contains disallowed clinical-prescriptive language."""


def scan_for_unsafe_clinical_claims(text: str) -> list[str]:
    hits: list[str] = []
    for pat in UNSAFE_CLAIM_PATTERNS:
        if pat.search(text):
            hits.append(pat.pattern)
    return hits


def assert_safe_language(text: str) -> None:
    hits = scan_for_unsafe_clinical_claims(text)
    if hits:
        raise UnsafeLanguageError(f"Unsafe language detected: {hits}")


def validate_simulation_copy(text: str) -> tuple[bool, list[str]]:
    """Return (ok, patterns_matched)."""
    hits = scan_for_unsafe_clinical_claims(text)
    return (len(hits) == 0, hits)
