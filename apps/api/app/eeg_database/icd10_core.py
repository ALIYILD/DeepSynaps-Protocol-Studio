"""Bundled ICD-10 — curated subset for autocomplete (expand via WHO CSV later)."""

from __future__ import annotations

ICD10_CORE: list[dict[str, str]] = [
    {"code": "F90.0", "label": "Attention-deficit hyperactivity disorder, predominantly inattentive"},
    {"code": "F90.1", "label": "ADHD, predominantly hyperactive"},
    {"code": "F90.2", "label": "ADHD, combined"},
    {"code": "F84.0", "label": "Autistic disorder"},
    {"code": "G40.901", "label": "Epilepsy, unspecified"},
    {"code": "G43.909", "label": "Migraine, unspecified"},
    {"code": "F32.9", "label": "Major depressive disorder, single episode, unspecified"},
    {"code": "F41.1", "label": "Generalized anxiety disorder"},
    {"code": "F43.10", "label": "Post-traumatic stress disorder, unspecified"},
    {"code": "F07.81", "label": "Postconcussional syndrome"},
    {"code": "R41.0", "label": "Disorientation, unspecified"},
    {"code": "R56.9", "label": "Unspecified convulsions"},
]


def suggest_icd10(query: str, limit: int = 20) -> list[dict[str, str]]:
    q = (query or "").strip().lower()
    if not q:
        return ICD10_CORE[:limit]
    out: list[dict[str, str]] = []
    for row in ICD10_CORE:
        if q in row["code"].lower() or q in row["label"].lower():
            out.append(row)
        if len(out) >= limit:
            break
    return out
