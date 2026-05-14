"""DeepTwin Evidence Integration -- RAG pipeline with GRADE scoring.

Decision-support only. All citations must be verifiable.
Never fabricate citations.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional


# ---------------------------------------------------------------------------
# GRADE evidence quality scoring
# ---------------------------------------------------------------------------

STUDY_DESIGN_BASE_SCORES: dict[str, int] = {
    "meta_analysis": 4,
    "rct": 4,
    "cohort": 3,
    "case_control": 2,
    "case_series": 1,
    "expert_opinion": 1,
    "unknown": 1,
}

GRADE_SCORE_TO_LETTER: dict[int, str] = {4: "A", 3: "B", 2: "C", 1: "D"}


def grade_evidence(
    study_design: str,
    sample_size: int,
    has_randomization: bool,
    has_blinding: bool,
    consistency: str,
) -> dict[str, Any]:
    """Apply GRADE scoring to evidence.

    Returns: {"grade": "A|B|C|D", "score": 1-4, "upgrades": [...], "downgrades": [...]}
    """
    score = STUDY_DESIGN_BASE_SCORES.get(study_design, 1)
    upgrades: list[str] = []
    downgrades: list[str] = []

    # Upgrades
    if has_randomization and has_blinding:
        score += 1
        upgrades.append("double_blind_rct")
    if sample_size > 1000:
        score += 1
        upgrades.append("large_n")
    if consistency == "high":
        score += 1
        upgrades.append("consistent_results")

    # Downgrades
    if sample_size < 50:
        score -= 1
        downgrades.append("small_n")
    if not has_randomization:
        score -= 1
        downgrades.append("no_randomization")
    if consistency == "low":
        score -= 1
        downgrades.append("inconsistent_results")

    score = max(1, min(4, score))
    grade = GRADE_SCORE_TO_LETTER[score]

    return {"grade": grade, "score": score, "upgrades": upgrades, "downgrades": downgrades}


# ---------------------------------------------------------------------------
# PICO query translation
# ---------------------------------------------------------------------------

def patient_to_pico_query(
    patient: dict[str, Any], hypothesis: dict[str, Any]
) -> dict[str, str]:
    """Translate patient + hypothesis into structured PICO query.

    P = Population (patient demographics, diagnosis)
    I = Intervention (treatment, neuromodulation)
    C = Comparison (control, alternative)
    O = Outcome (biomarker, clinical measure)
    """
    pico: dict[str, str] = {
        "P": _build_population(patient),
        "I": hypothesis.get("intervention_type", ""),
        "C": "standard care or sham",
        "O": hypothesis.get("affected_domain", ""),
    }
    return pico


def _build_population(patient: dict[str, Any]) -> str:
    parts: list[str] = []
    if patient.get("diagnosis"):
        parts.append(str(patient["diagnosis"]))
    age = patient.get("age")
    if age is not None:
        parts.append(f"age {age}")
    sex = patient.get("sex")
    if sex:
        parts.append(str(sex))
    return " ".join(parts) if parts else "general population"


# ---------------------------------------------------------------------------
# Evidence search (stub for external PubMed/Cochrane integration)
# ---------------------------------------------------------------------------

def search_ranked_papers(
    pico: dict[str, str], max_results: int = 10
) -> list[dict[str, Any]]:
    """Search evidence database for papers matching PICO query.

    Returns ranked list with GRADE scores. This is a stub that would
    connect to PubMed/Cochrane APIs in production.

    Decision-support only. Requires clinician review.
    """
    query_str = f"{pico['P']} {pico['I']} {pico['C']} {pico['O']}".strip()
    if not query_str:
        query_str = "general population neuromodulation"

    return [
        {
            "query": query_str,
            "note": (
                "Evidence lookup requires external PubMed/Cochrane integration. "
                "This stub provides the PICO query structure for manual evidence search."
            ),
            "evidence_grade": "pending",
            "status": "stub",
            "recommendation": "Manually search PubMed with: " + query_str,
        }
    ]


# ---------------------------------------------------------------------------
# Citation verification
# ---------------------------------------------------------------------------

def verify_citation(doi: str) -> dict[str, Any]:
    """Verify a citation exists via DOI resolution.

    Returns resolution status and metadata.
    """
    if not doi or not re.match(r"^10\.", doi):
        return {"valid": False, "error": "Invalid DOI format"}

    # Stub: would call CrossRef API
    return {"valid": True, "doi": doi, "status": "stub_verification"}


# ---------------------------------------------------------------------------
# Confidence gating
# ---------------------------------------------------------------------------

GRADE_ORDER: dict[str, int] = {"A": 4, "B": 3, "C": 2, "D": 1, "pending": 0}


def confidence_gating(
    evidence_results: list[dict[str, Any]],
    min_grade: str = "C",
) -> dict[str, Any]:
    """Gate evidence results by minimum confidence threshold.

    Rejects claims below threshold. Returns gated results with rejection reason.
    """
    min_score = GRADE_ORDER.get(min_grade, 2)

    passed: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for r in evidence_results:
        grade = r.get("evidence_grade", "pending")
        score = GRADE_ORDER.get(grade, 0)
        if score >= min_score:
            passed.append(r)
        else:
            rejected.append(
                {**r, "rejection_reason": f"Grade {grade} below minimum {min_grade}"}
            )

    total = len(evidence_results)
    return {
        "passed": passed,
        "rejected": rejected,
        "total": total,
        "pass_rate": len(passed) / total if total else 0.0,
    }


# ---------------------------------------------------------------------------
# Safety framing helper
# ---------------------------------------------------------------------------

def _apply_safety_framing(synthesis: dict[str, Any]) -> dict[str, Any]:
    """Add safety framing to evidence synthesis.

    Imports soften_language from decision_support to ensure consistent
    cautious phrasing across all DeepTwin outputs.
    """
    from app.services.deeptwin_decision_support import soften_language

    synthesis["safety_note"] = soften_language(
        "Evidence is decision support only. Requires clinician review. "
        "Not all evidence applies to this patient."
    )
    synthesis["citation_policy"] = (
        "No fabricated citations. All evidence references must be verifiable "
        "through external databases (PubMed, Cochrane, CrossRef)."
    )
    return synthesis


# ---------------------------------------------------------------------------
# Full RAG pipeline
# ---------------------------------------------------------------------------

def rag_pipeline(
    patient: dict[str, Any],
    hypothesis: dict[str, Any],
    knowledge_base: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Run full RAG pipeline: PICO --> search --> GRADE --> confidence gate.

    Returns evidence-backed synthesis with safety framing.
    Never fabricates citations.
    """
    # Step 1: Build PICO query
    pico = patient_to_pico_query(patient, hypothesis)

    # Step 2: Search evidence
    raw_results = search_ranked_papers(pico)

    # Step 3: Grade each result
    graded: list[dict[str, Any]] = []
    for r in raw_results:
        if r.get("evidence_grade") == "pending":
            # Apply GRADE if study design available
            grade_result = grade_evidence(
                study_design=r.get("study_design", "unknown"),
                sample_size=r.get("sample_size", 0),
                has_randomization=r.get("randomized", False),
                has_blinding=r.get("blinded", False),
                consistency=r.get("consistency", "unknown"),
            )
            r["grade_result"] = grade_result
        graded.append(r)

    # Step 4: Confidence gate
    gated = confidence_gating(graded)

    # Step 5: Build synthesis
    synthesis: dict[str, Any] = {
        "pico": pico,
        "evidence": gated["passed"],
        "rejected": gated["rejected"],
        "pass_rate": gated["pass_rate"],
        "provenance": {
            "pipeline": "rag_v1",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "knowledge_base_size": len(knowledge_base) if knowledge_base else 0,
        },
    }

    # Step 6: Apply safety framing
    synthesis = _apply_safety_framing(synthesis)

    return synthesis


# ---------------------------------------------------------------------------
# Batch GRADE processing for lists of evidence items
# ---------------------------------------------------------------------------

def batch_grade_evidence(
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Apply GRADE scoring to a batch of evidence items.

    Each item must have keys: study_design, sample_size, randomized, blinded, consistency.
    Returns items with 'grade_result' injected.
    """
    out: list[dict[str, Any]] = []
    for item in items:
        graded = dict(item)
        graded["grade_result"] = grade_evidence(
            study_design=graded.get("study_design", "unknown"),
            sample_size=graded.get("sample_size", 0),
            has_randomization=graded.get("randomized", False),
            has_blinding=graded.get("blinded", False),
            consistency=graded.get("consistency", "unknown"),
        )
        out.append(graded)
    return out


# ---------------------------------------------------------------------------
# Evidence link builder (for frontend deep-links into evidence page)
# ---------------------------------------------------------------------------

def build_evidence_links(
    pico: dict[str, str],
) -> list[dict[str, Any]]:
    """Build structured evidence search links from a PICO query.

    Returns a list of dicts the frontend can render as deep-link buttons
    that open the Evidence page with pre-filled queries.
    """
    links: list[dict[str, Any]] = []
    if pico.get("I"):
        links.append(
            {
                "label": f"Search: {pico['I']}",
                "query": f"{pico['I']} {pico.get('O', 'outcome')}",
                "domain": "intervention",
            }
        )
    if pico.get("P") and pico.get("O"):
        links.append(
            {
                "label": f"Search: {pico['P']} + {pico['O']}",
                "query": f"{pico['P']} {pico['O']}",
                "domain": "population_outcome",
            }
        )
    return links
