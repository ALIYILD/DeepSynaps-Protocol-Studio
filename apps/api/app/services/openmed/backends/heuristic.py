"""In-process fallback backend.

Always available. No network, no model weights. Uses curated regex
patterns for medical entities and PII so the adapter has correct
behaviour even when the OpenMed HTTP service is offline.

Coverage is intentionally narrow: when `OPENMED_BASE_URL` is set this
backend is skipped in favour of the real model.
"""
from __future__ import annotations

import re
from typing import Iterable

from ..schemas import (
    AnalyzeResponse,
    ClinicalTextInput,
    DeidentifyResponse,
    EntityLabel,
    ExtractedClinicalEntity,
    HealthResponse,
    PIIEntity,
    PIIExtractResponse,
    PIILabel,
    TextSpan,
)


_MED_PATTERNS: dict[EntityLabel, list[str]] = {
    "medication": [
        r"\b(sertraline|fluoxetine|escitalopram|paroxetine|citalopram|venlafaxine|duloxetine|"
        r"bupropion|mirtazapine|trazodone|amitriptyline|nortriptyline|lithium|lamotrigine|"
        r"valproate|valproic acid|carbamazepine|topiramate|gabapentin|pregabalin|"
        r"clonazepam|lorazepam|diazepam|alprazolam|temazepam|zolpidem|"
        r"olanzapine|risperidone|quetiapine|aripiprazole|haloperidol|clozapine|"
        r"methylphenidate|atomoxetine|amphetamine|lisdexamfetamine|"
        r"propranolol|prazosin|hydroxyzine|buspirone|naltrexone|disulfiram)\b",
    ],
    "diagnosis": [
        r"\b(major depressive disorder|MDD|generalized anxiety disorder|GAD|"
        r"panic disorder|PTSD|post[- ]traumatic stress|OCD|obsessive[- ]compulsive|"
        r"bipolar (?:I|II|disorder)|schizophrenia|schizoaffective|"
        r"ADHD|attention deficit|autism|ASD|"
        r"insomnia|narcolepsy|sleep apnea|"
        r"alcohol use disorder|AUD|substance use disorder|SUD|"
        r"migraine|epilepsy|seizure disorder|stroke|TBI|traumatic brain injury|"
        r"hypertension|HTN|diabetes|T2DM|hyperlipidemia)\b",
    ],
    "symptom": [
        r"\b(insomnia|fatigue|anhedonia|hopeless(?:ness)?|suicidal ideation|self[- ]harm|"
        r"panic attacks?|flashbacks?|nightmares?|hypervigilance|avoidance|"
        r"rumination|intrusive thoughts?|dissociation|depersonalization|derealization|"
        r"low mood|irritability|agitation|psychomotor (?:retardation|agitation)|"
        r"poor concentration|memory loss|brain fog|"
        r"headache|dizziness|tinnitus|nausea|tremor)\b",
    ],
    "procedure": [
        r"\b(rTMS|TMS|tDCS|tACS|ECT|psychotherapy|CBT|DBT|EMDR|exposure therapy|"
        r"qEEG|EEG|MRI|fMRI|PET scan|sleep study|polysomnography)\b",
    ],
    "lab": [
        r"\b(TSH|T3|T4|CBC|CMP|HbA1c|vitamin D|B12|folate|cortisol|"
        r"PHQ[- ]?9|GAD[- ]?7|MoCA|MMSE|HAM[- ]?D|HAM[- ]?A|YBOCS)\b",
    ],
}

_PII_PATTERNS: list[tuple[PIILabel, str]] = [
    ("email", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    ("phone", r"\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}\b"),
    ("mrn", r"\bMRN[:#]?\s*[A-Z0-9-]{4,}\b"),
    ("ssn", r"\b\d{3}-\d{2}-\d{4}\b"),
    ("ip_address", r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    ("url", r"https?://[^\s<>]+"),
    (
        "date",
        r"\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b"
        r"|\b(?:19|20)\d{2}[/-](?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\b"
        r"|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+(?:19|20)\d{2}\b",
    ),
    (
        "person_name",
        r"\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b",
    ),
    ("address", r"\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way)\b"),
    ("id_number", r"\b(?:NHS|nhs)\s*(?:number|#)?\s*\d{3}[\s-]?\d{3}[\s-]?\d{4}\b"),
]


def _scan(patterns: Iterable[tuple[str, str]], text: str) -> list[tuple[str, str, int, int]]:
    """Return (label, match_text, start, end) tuples, longest match wins on overlap."""
    raw: list[tuple[str, str, int, int]] = []
    for label, pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            raw.append((label, m.group(0), m.start(), m.end()))
    raw.sort(key=lambda t: (t[2], -(t[3] - t[2])))
    out: list[tuple[str, str, int, int]] = []
    last_end = -1
    for tup in raw:
        if tup[2] >= last_end:
            out.append(tup)
            last_end = tup[3]
    return out


def _extract_entities(text: str) -> list[ExtractedClinicalEntity]:
    pairs: list[tuple[str, str]] = []
    for label, pats in _MED_PATTERNS.items():
        for pat in pats:
            pairs.append((label, pat))
    return [
        ExtractedClinicalEntity(
            label=label,  # type: ignore[arg-type]
            text=match,
            span=TextSpan(start=start, end=end),
            normalised=match.lower().strip(),
            confidence=0.55,
            source="heuristic",
        )
        for label, match, start, end in _scan(pairs, text)
    ]


def _extract_pii(text: str) -> list[PIIEntity]:
    return [
        PIIEntity(
            label=label,  # type: ignore[arg-type]
            text=match,
            span=TextSpan(start=start, end=end),
            confidence=0.6,
        )
        for label, match, start, end in _scan(_PII_PATTERNS, text)
    ]


def _short_summary(text: str, entities: list[ExtractedClinicalEntity]) -> str:
    counts: dict[str, int] = {}
    for e in entities:
        counts[e.label] = counts.get(e.label, 0) + 1
    if not counts:
        return f"{len(text)} chars analysed; no entities recovered by heuristic backend."
    parts = ", ".join(f"{n} {label}{'s' if n != 1 else ''}" for label, n in sorted(counts.items()))
    return f"Heuristic extraction over {len(text)} chars: {parts}."


def analyze(payload: ClinicalTextInput) -> AnalyzeResponse:
    entities = _extract_entities(payload.text)
    pii = _extract_pii(payload.text)
    return AnalyzeResponse(
        backend="heuristic",
        entities=entities,
        pii=pii,
        summary=_short_summary(payload.text, entities),
        char_count=payload.length,
    )


def extract_pii(payload: ClinicalTextInput) -> PIIExtractResponse:
    return PIIExtractResponse(backend="heuristic", pii=_extract_pii(payload.text))


def deidentify(payload: ClinicalTextInput) -> DeidentifyResponse:
    pii = _extract_pii(payload.text)
    redacted = list(payload.text)
    for ent in sorted(pii, key=lambda e: e.span.start, reverse=True):
        token = f"[{ent.label.upper()}]"
        redacted[ent.span.start : ent.span.end] = list(token)
    return DeidentifyResponse(
        backend="heuristic",
        redacted_text="".join(redacted),
        replacements=pii,
    )


def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        backend="heuristic",
        note="Heuristic regex backend; OPENMED_BASE_URL not configured.",
    )
