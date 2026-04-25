"""GRADE-informed evidence scoring and confidence labelling.

Implements the scoring rules from ``evidence_citation_validator.md``
sections 6.3 and 6.4. All functions are pure — no DB or network I/O.
"""
from __future__ import annotations

import json
from typing import Literal

# ── Constants ────────────────────────────────────────────────────────────────

EvidenceGrade = Literal["A", "B", "C", "D"]
ConfidenceLabel = Literal["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]

GRADE_WEIGHT: dict[str, float] = {"A": 1.0, "B": 0.75, "C": 0.5, "D": 0.25}

EVIDENCE_LEVEL_SCORE: dict[str, int] = {
    "HIGHEST": 5,
    "HIGH": 4,
    "MEDIUM": 3,
    "LOW": 2,
    "VERY_LOW": 1,
}

CONFIDENCE_LANGUAGE: dict[str, str] = {
    "HIGH": "Evidence-based:",
    "MEDIUM": "Supported by emerging evidence:",
    "LOW": "Consensus-informed (limited evidence):",
    "INSUFFICIENT": "Requires clinical review \u2014 evidence insufficient:",
}

# Study design keywords used for grade inference from pub_types_json.
_GRADE_A_KEYWORDS = frozenset({
    "systematic review", "meta-analysis", "meta analysis",
    "cochrane review", "umbrella review",
})
_GRADE_B_KEYWORDS = frozenset({
    "randomized controlled trial", "rct", "controlled clinical trial",
    "clinical trial", "pragmatic trial",
})
_GRADE_C_KEYWORDS = frozenset({
    "cohort study", "observational study", "case-control",
    "cross-sectional", "case series", "prospective study",
    "retrospective study", "longitudinal study",
})


# ── Public functions ─────────────────────────────────────────────────────────

def assign_grade(
    pub_types: list[str] | str | None = None,
    cited_by_count: int | None = None,
) -> EvidenceGrade:
    """Assign a GRADE-inspired evidence grade (A/B/C/D) from study metadata.

    Parameters
    ----------
    pub_types : list[str] or JSON string or None
        Publication type descriptors (e.g. ``["Randomized Controlled Trial"]``).
    cited_by_count : int or None
        Citation count from bibliometric databases.

    Returns
    -------
    EvidenceGrade
        ``"A"`` for systematic reviews / meta-analyses and large RCTs,
        ``"B"`` for RCTs and controlled trials,
        ``"C"`` for observational / cohort studies,
        ``"D"`` for case reports, editorials, and other lower evidence.
    """
    if pub_types is None:
        pub_types = []
    if isinstance(pub_types, str):
        try:
            pub_types = json.loads(pub_types)
        except (json.JSONDecodeError, TypeError):
            pub_types = [pub_types]

    lowered = {t.lower().strip() for t in pub_types if isinstance(t, str)}

    if lowered & _GRADE_A_KEYWORDS:
        return "A"
    if lowered & _GRADE_B_KEYWORDS:
        # Promote to A if highly cited (landmark trial)
        if cited_by_count is not None and cited_by_count >= 200:
            return "A"
        return "B"
    if lowered & _GRADE_C_KEYWORDS:
        return "C"
    # Default to D for case reports, editorials, expert opinion, etc.
    return "D"


def assign_confidence(
    mean_score: float,
    source_count: int,
) -> ConfidenceLabel:
    """Map mean evidence score to a confidence label.

    Implements section 6.4 of the spec:
    - HIGH:         mean >= 3.5 and >= 2 sources
    - MEDIUM:       mean >= 3.0
    - LOW:          mean >= 2.0
    - INSUFFICIENT: mean < 2.0 or no sources

    Parameters
    ----------
    mean_score : float
        Mean of ``EVIDENCE_LEVEL_SCORE`` values across matched papers.
    source_count : int
        Number of supporting sources.

    Returns
    -------
    ConfidenceLabel
    """
    if source_count == 0 or mean_score < 2.0:
        return "INSUFFICIENT"
    if mean_score >= 3.5 and source_count >= 2:
        return "HIGH"
    if mean_score >= 3.0:
        return "MEDIUM"
    return "LOW"


def score_citation(
    relevance_score: float,
    grade: EvidenceGrade,
) -> float:
    """Compute a composite citation quality score.

    Combines pgvector cosine relevance with GRADE weight:
    ``composite = relevance_score * GRADE_WEIGHT[grade]``

    Parameters
    ----------
    relevance_score : float
        Cosine similarity from corpus search (0.0-1.0).
    grade : EvidenceGrade
        GRADE letter (A/B/C/D).

    Returns
    -------
    float
        Composite score in [0.0, 1.0].
    """
    weight = GRADE_WEIGHT.get(grade, 0.25)
    return min(1.0, max(0.0, relevance_score * weight))


def evidence_level_to_score(level: str | None) -> int:
    """Convert an evidence level string to its numeric score.

    Returns 1 (VERY_LOW) for unrecognised or None values.
    """
    if level is None:
        return 1
    return EVIDENCE_LEVEL_SCORE.get(level.upper().strip(), 1)
