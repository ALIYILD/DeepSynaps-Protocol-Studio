"""Build a structured ``ReportPayload`` from raw inputs.

This is the API-side bridge that turns observed findings + interpretations
+ citations into the schema the renderer (and downstream UIs) consume.

Decision-support language is enforced here: every interpretation is
labelled with an evidence strength (no fabrication), and every
suggested action is presented as something to *consider*, not to *do*.

We import read-only helpers from ``deepsynaps_evidence`` (Scoring stream
owns that package tonight — we never modify it).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable, Optional

from deepsynaps_render_engine import (
    REPORT_GENERATOR_VERSION_DEFAULT,
    REPORT_PAYLOAD_SCHEMA_ID,
    CitationRef,
    EvidenceStrength,
    InterpretationItem,
    ReportPayload,
    ReportSection,
    SuggestedAction,
)

_logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Evidence-strength inference
# ---------------------------------------------------------------------------


def _grade_to_strength(grade: Optional[str]) -> EvidenceStrength:
    if not grade:
        return "Evidence pending"
    g = grade.upper().strip()
    if g.startswith("A"):
        return "Strong"
    if g.startswith("B"):
        return "Moderate"
    if g.startswith("C"):
        return "Limited"
    if g.startswith("D") or g.startswith("E"):
        return "Limited"
    return "Evidence pending"


def infer_strength(
    *,
    supporting: Iterable[CitationRef],
    conflicting: Iterable[CitationRef] = (),
) -> EvidenceStrength:
    """Infer an evidence-strength badge from the supporting & conflicting refs.

    Rules (keep simple — clinicians can audit):
    1. If we have ANY conflicting citations, return ``"Conflicting"``.
    2. Otherwise look at the highest-grade supporting citation:
       * Grade A → ``"Strong"``
       * Grade B → ``"Moderate"``
       * Grade C/D/E → ``"Limited"``
    3. No grades available → ``"Evidence pending"``.

    We deliberately do NOT call into ``packages/evidence``'s
    confidence calculator here because that requires the full pgvector
    relevance score we don't have at render time. The grade-based path
    is the honest fallback.
    """
    conflicting = list(conflicting)
    if conflicting:
        return "Conflicting"

    grades = []
    for c in supporting:
        if c.evidence_level:
            # evidence_level may be the descriptor "Grade A · …" or a raw letter
            for letter in ("A", "B", "C", "D", "E"):
                if letter in c.evidence_level.upper().split():
                    grades.append(letter)
                    break
            else:
                if c.evidence_level.upper().startswith("GRADE"):
                    parts = c.evidence_level.upper().split()
                    if len(parts) > 1:
                        grades.append(parts[1].rstrip(".·,"))
    if not grades:
        return "Evidence pending"
    # "Best" grade wins.
    order = ["A", "B", "C", "D", "E"]
    best = min(grades, key=lambda g: order.index(g) if g in order else 99)
    return _grade_to_strength(best)


# ---------------------------------------------------------------------------
# Builder helpers
# ---------------------------------------------------------------------------


def make_section(
    *,
    section_id: str,
    title: str,
    observed: list[str] | None = None,
    interpretations: list[dict | InterpretationItem] | None = None,
    suggested_actions: list[dict | SuggestedAction] | None = None,
    confidence: Optional[str] = None,
    cautions: list[str] | None = None,
    limitations: list[str] | None = None,
    evidence_refs: list[str] | None = None,
    counter_evidence_refs: list[str] | None = None,
) -> ReportSection:
    """Construct a section, accepting either dicts or schema objects.

    Decision-support guard: any ``SuggestedAction`` that arrives without
    an explicit ``requires_clinician_review`` flag defaults to ``True``.
    """
    raw_interps = interpretations or []
    interp_objs: list[InterpretationItem] = []
    for it in raw_interps:
        if isinstance(it, InterpretationItem):
            interp_objs.append(it)
        else:
            interp_objs.append(InterpretationItem(**it))

    raw_actions = suggested_actions or []
    action_objs: list[SuggestedAction] = []
    for a in raw_actions:
        if isinstance(a, SuggestedAction):
            action_objs.append(a)
        else:
            action_objs.append(SuggestedAction(**a))

    return ReportSection(
        section_id=section_id,
        title=title,
        observed=observed or [],
        interpretations=interp_objs,
        suggested_actions=action_objs,
        confidence=confidence,  # type: ignore[arg-type]
        cautions=cautions or [],
        limitations=limitations or [],
        evidence_refs=evidence_refs or [],
        counter_evidence_refs=counter_evidence_refs or [],
    )


def build_report_payload(
    *,
    title: str,
    summary: str = "",
    patient_id: Optional[str] = None,
    report_id: Optional[str] = None,
    audience: str = "both",
    sections: list[ReportSection] | None = None,
    citations: list[CitationRef] | None = None,
    global_cautions: list[str] | None = None,
    global_limitations: list[str] | None = None,
    generator_version: str = REPORT_GENERATOR_VERSION_DEFAULT,
) -> ReportPayload:
    """Construct a fully-populated ``ReportPayload``.

    The ``schema_id`` is stamped from the render-engine constant so
    consumers can detect contract drift.
    """
    if audience not in ("clinician", "patient", "both"):
        audience = "both"
    return ReportPayload(
        schema_id=REPORT_PAYLOAD_SCHEMA_ID,
        generator_version=generator_version,
        generated_at=datetime.now(timezone.utc).isoformat(),
        report_id=report_id,
        patient_id=patient_id,
        title=title,
        audience=audience,  # type: ignore[arg-type]
        summary=summary,
        sections=sections or [],
        citations=citations or [],
        global_cautions=global_cautions or [],
        global_limitations=global_limitations or [],
    )


# ---------------------------------------------------------------------------
# Sample / preview payload
# ---------------------------------------------------------------------------


def sample_payload_for_preview() -> ReportPayload:
    """A small but realistic payload used for the preview endpoint.

    Useful for the web view to render the new layout even before any
    real per-patient pipeline output is available.
    """
    citations = [
        CitationRef(
            citation_id="C1",
            title="Repetitive transcranial magnetic stimulation in major depression",
            authors=["Lefaucheur JP", "Aleman A", "Baeken C"],
            year=2020,
            journal="Clinical Neurophysiology",
            doi="10.1016/j.clinph.2019.11.002",
            pmid="31901449",
            evidence_level="Grade A · Systematic review / meta-analysis",
            retrieved_at=datetime.now(timezone.utc).isoformat(),
            status="verified",
        ),
        CitationRef(
            citation_id="C2",
            title="Personalised TMS targeting using resting-state fMRI",
            authors=["Cash R", "Cocchi L", "Lv J"],
            year=2021,
            journal="JAMA Psychiatry",
            doi="10.1001/jamapsychiatry.2020.3794",
            evidence_level="Grade B · Randomised controlled trial",
            retrieved_at=datetime.now(timezone.utc).isoformat(),
            status="verified",
        ),
    ]

    sections = [
        make_section(
            section_id="qeeg",
            title="qEEG findings",
            observed=[
                "Frontal alpha asymmetry index: -0.12 (left-dominant)",
                "Theta/beta ratio at Fz: 2.4 (within normal limits)",
            ],
            interpretations=[
                {
                    "text": (
                        "Left-dominant frontal alpha asymmetry is consistent with "
                        "the depression phenotype literature."
                    ),
                    "evidence_strength": "Strong",
                    "evidence_refs": ["C1"],
                },
            ],
            suggested_actions=[
                {
                    "text": "rTMS targeting left DLPFC at 10 Hz, 20 sessions",
                    "rationale": (
                        "Aligns with NICE/CANMAT guidance for moderate-to-severe MDD; "
                        "individual response should be reassessed at session 10."
                    ),
                    "requires_clinician_review": True,
                },
            ],
            confidence="medium",
            cautions=[
                "Asymmetry is sensitive to scalp EMG — confirm with a clean re-record before treatment.",
            ],
            limitations=[
                "Single-session recording; longitudinal trend not yet available.",
            ],
            evidence_refs=["C1"],
        ),
        make_section(
            section_id="risk",
            title="Risk stratification",
            observed=[
                "PHQ-9: 18 (moderately severe)",
                "C-SSRS: passive ideation, no plan",
            ],
            interpretations=[
                {
                    "text": "Moderate suicide-risk band given current ideation and history.",
                    "evidence_strength": "Moderate",
                    "evidence_refs": [],
                },
            ],
            suggested_actions=[
                {
                    "text": "Weekly safety check-ins for the duration of the active course.",
                    "rationale": "Risk band warrants closer monitoring than the standard schedule.",
                    "requires_clinician_review": True,
                },
            ],
            confidence="medium",
            cautions=[
                "Risk score is a decision-support signal only — clinical judgement supersedes.",
            ],
            limitations=[
                "Self-report instruments are subject to recall and social-desirability bias.",
            ],
        ),
    ]

    return build_report_payload(
        title="Treatment plan preview — Major depression (TMS course)",
        summary=(
            "Preview of the treatment plan based on qEEG and assessment inputs. "
            "Use the toggle above to switch between clinician and patient views."
        ),
        patient_id=None,
        audience="both",
        sections=sections,
        citations=citations,
        global_cautions=[
            "Confirm patient's seizure-threshold-lowering medications before session 1.",
        ],
        global_limitations=[
            "Sample preview payload — no patient-specific data attached.",
        ],
    )


__all__ = [
    "build_report_payload",
    "make_section",
    "infer_strength",
    "sample_payload_for_preview",
]
