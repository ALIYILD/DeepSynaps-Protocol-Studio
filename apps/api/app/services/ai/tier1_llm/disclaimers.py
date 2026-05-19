"""Canonical disclaimer for Tier 1 clinical reasoning responses.

Every response surfaced to a clinician must carry this string. The router
asserts its presence on every outbound envelope.
"""
from __future__ import annotations

CLINICAL_DISCLAIMER = (
    "AI-generated content. Not a clinical decision. "
    "Reviewing clinician is responsible for all care decisions."
)
