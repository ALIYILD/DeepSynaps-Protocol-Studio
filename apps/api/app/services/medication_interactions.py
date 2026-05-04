"""Shared medication–medication and medication–therapy modality interaction checks.

Used by medications_router and treatment_sessions_analyzer (same rules, single source).
"""
from __future__ import annotations

from typing import Any

# ── Known interaction rules (V1 in-memory; replace with external API in V2) ────

INTERACTION_RULES: list[dict[str, Any]] = [
    {
        "drugs": ["sertraline", "tramadol"],
        "severity": "severe",
        "description": "Risk of serotonin syndrome. Avoid concurrent use.",
        "recommendation": "Use an alternative analgesic.",
    },
    {
        "drugs": ["warfarin", "aspirin"],
        "severity": "moderate",
        "description": "Increased bleeding risk due to additive anticoagulation.",
        "recommendation": "Monitor INR closely. Consider dose adjustment.",
    },
    {
        "drugs": ["ssri", "maoi"],
        "severity": "severe",
        "description": "Risk of serotonin syndrome; potentially life-threatening.",
        "recommendation": "Contraindicated. Allow washout period.",
    },
    {
        "drugs": ["lithium", "ibuprofen"],
        "severity": "moderate",
        "description": "NSAIDs may increase lithium levels.",
        "recommendation": "Monitor lithium levels. Consider paracetamol instead.",
    },
    {
        "drugs": ["tms", "tricyclics"],
        "severity": "mild",
        "description": "Tricyclic antidepressants may lower seizure threshold during TMS.",
        "recommendation": "Use lower TMS intensity; screen for seizure risk.",
    },
    {
        "drugs": ["tdcs", "stimulants"],
        "severity": "mild",
        "description": "Stimulants may potentiate tDCS excitability effects.",
        "recommendation": "Monitor for side-effects; consider dosage timing.",
    },
]

_SEVERITY_ORDER = {"none": 0, "mild": 1, "moderate": 2, "severe": 3}


def run_interaction_check(med_names: list[str]) -> tuple[list[dict[str, Any]], str]:
    """Return (interaction dicts with drugs/severity/description/recommendation), worst_severity."""
    lower_names = [m.lower() for m in med_names if m and str(m).strip()]
    found: list[dict[str, Any]] = []
    worst = "none"

    for rule in INTERACTION_RULES:
        matched = all(
            any(drug in name for name in lower_names)
            for drug in rule["drugs"]
        )
        if matched:
            sev = str(rule["severity"])
            found.append(
                {
                    "drugs": list(rule["drugs"]),
                    "severity": sev,
                    "description": rule["description"],
                    "recommendation": rule["recommendation"],
                }
            )
            if _SEVERITY_ORDER.get(sev, 0) > _SEVERITY_ORDER.get(worst, 0):
                worst = sev

    return found, worst


def normalize_therapy_tokens(
    modality_slug: str | None,
    protocol_label: str | None,
    session_modalities: list[str],
) -> list[str]:
    """Produce lowercase tokens for modality-aware rules (tms, tdcs, etc.)."""
    raw = " ".join(
        [
            modality_slug or "",
            protocol_label or "",
            " ".join(session_modalities or []),
        ]
    ).lower()
    tokens: list[str] = []
    if "tms" in raw or "rtms" in raw or "magnetic" in raw:
        tokens.append("tms")
    if "tdcs" in raw:
        tokens.append("tdcs")
    if "tricyclic" in raw or "amitriptyline" in raw or "nortriptyline" in raw:
        tokens.append("tricyclics")
    if (
        "stimulant" in raw
        or "methylphenidate" in raw
        or "amphetamine" in raw
        or "adderall" in raw
    ):
        tokens.append("stimulants")
    # Dedupe preserve order
    seen = set()
    out = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out
