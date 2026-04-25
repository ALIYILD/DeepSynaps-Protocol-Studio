"""Unit tests for deepsynaps_evidence.scoring."""
from __future__ import annotations

from deepsynaps_evidence.scoring import (
    CONFIDENCE_LANGUAGE,
    GRADE_WEIGHT,
    assign_confidence,
    assign_grade,
    evidence_level_to_score,
    score_citation,
)


# ── assign_grade ─────────────────────────────────────────────────────────────

def test_grade_a_systematic_review():
    assert assign_grade(["systematic review"]) == "A"


def test_grade_a_meta_analysis():
    assert assign_grade(["Meta-Analysis"]) == "A"


def test_grade_b_rct():
    assert assign_grade(["Randomized Controlled Trial"]) == "B"


def test_grade_b_promoted_to_a_high_citation():
    """Highly cited RCT (>=200) promotes to Grade A."""
    assert assign_grade(["Randomized Controlled Trial"], cited_by_count=250) == "A"


def test_grade_b_not_promoted_low_citation():
    assert assign_grade(["Randomized Controlled Trial"], cited_by_count=50) == "B"


def test_grade_c_cohort():
    assert assign_grade(["Cohort Study"]) == "C"


def test_grade_c_case_control():
    assert assign_grade(["case-control"]) == "C"


def test_grade_d_case_report():
    assert assign_grade(["Case Report"]) == "D"


def test_grade_d_empty():
    """Empty pub_types defaults to D."""
    assert assign_grade([]) == "D"


def test_grade_d_none():
    assert assign_grade(None) == "D"


def test_grade_from_json_string():
    """JSON string input for pub_types."""
    assert assign_grade('["systematic review"]') == "A"


def test_grade_mixed_types():
    """Highest-grade keyword wins."""
    assert assign_grade(["case report", "systematic review"]) == "A"


# ── assign_confidence ────────────────────────────────────────────────────────

def test_confidence_high():
    assert assign_confidence(3.5, 2) == "HIGH"


def test_confidence_high_requires_two_sources():
    """Single source with high score is MEDIUM, not HIGH."""
    assert assign_confidence(4.0, 1) == "MEDIUM"


def test_confidence_medium():
    assert assign_confidence(3.0, 1) == "MEDIUM"


def test_confidence_low():
    assert assign_confidence(2.5, 1) == "LOW"


def test_confidence_insufficient_low_score():
    assert assign_confidence(1.5, 3) == "INSUFFICIENT"


def test_confidence_insufficient_no_sources():
    assert assign_confidence(5.0, 0) == "INSUFFICIENT"


def test_confidence_boundary_medium_low():
    """Score exactly at 3.0 boundary."""
    assert assign_confidence(3.0, 1) == "MEDIUM"


def test_confidence_boundary_low_insufficient():
    """Score exactly at 2.0 boundary."""
    assert assign_confidence(2.0, 1) == "LOW"


# ── score_citation ───────────────────────────────────────────────────────────

def test_score_citation_grade_a():
    assert score_citation(0.8, "A") == 0.8 * 1.0


def test_score_citation_grade_d():
    assert score_citation(0.8, "D") == 0.8 * 0.25


def test_score_citation_clamped():
    """Score cannot exceed 1.0."""
    assert score_citation(1.5, "A") == 1.0


def test_score_citation_zero():
    assert score_citation(0.0, "A") == 0.0


# ── evidence_level_to_score ──────────────────────────────────────────────────

def test_level_highest():
    assert evidence_level_to_score("HIGHEST") == 5


def test_level_low():
    assert evidence_level_to_score("LOW") == 2


def test_level_none():
    assert evidence_level_to_score(None) == 1


def test_level_unknown():
    assert evidence_level_to_score("UNKNOWN") == 1


# ── Constants ────────────────────────────────────────────────────────────────

def test_grade_weights_complete():
    assert set(GRADE_WEIGHT.keys()) == {"A", "B", "C", "D"}


def test_confidence_language_complete():
    assert set(CONFIDENCE_LANGUAGE.keys()) == {"HIGH", "MEDIUM", "LOW", "INSUFFICIENT"}
