"""DeepTwin Evidence Integration tests.

Tests the RAG pipeline with GRADE scoring:
- GRADE scoring for each study design
- PICO query translation
- Citation verification
- Confidence gating
- RAG pipeline end-to-end
- Safety framing (never fabricates citations)
"""

from __future__ import annotations

import re
from typing import Any

import pytest

from app.services.deeptwin_evidence import (
    GRADE_ORDER,
    STUDY_DESIGN_BASE_SCORES,
    batch_grade_evidence,
    build_evidence_links,
    confidence_gating,
    grade_evidence,
    patient_to_pico_query,
    rag_pipeline,
    search_ranked_papers,
    verify_citation,
)


# ---------------------------------------------------------------------------
# GRADE scoring
# ---------------------------------------------------------------------------


class TestGradeEvidence:
    """Test suite for GRADE evidence scoring function."""

    def test_meta_analysis_base_score(self) -> None:
        """Meta-analysis starts at base score 4."""
        result = grade_evidence(
            study_design="meta_analysis",
            sample_size=500,
            has_randomization=True,
            has_blinding=True,
            consistency="high",
        )
        assert result["grade"] == "A"
        assert result["score"] == 4  # capped at max 4

    def test_rct_double_blind_upgrade(self) -> None:
        """RCT with double-blind gets upgrade."""
        result = grade_evidence(
            study_design="rct",
            sample_size=500,
            has_randomization=True,
            has_blinding=True,
            consistency="medium",
        )
        # base 4 + 1 (double blind) = 5, capped at 4
        assert result["score"] == 4
        assert result["grade"] == "A"
        assert "double_blind_rct" in result["upgrades"]

    def test_cohort_base_score(self) -> None:
        """Cohort study starts at base score 3."""
        result = grade_evidence(
            study_design="cohort",
            sample_size=200,
            has_randomization=False,
            has_blinding=False,
            consistency="medium",
        )
        assert result["grade"] == "C"
        # 3 - 1 (no randomization) = 2
        assert result["score"] == 2
        assert "no_randomization" in result["downgrades"]

    def test_case_control_base_score(self) -> None:
        """Case-control study starts at base score 2."""
        result = grade_evidence(
            study_design="case_control",
            sample_size=100,
            has_randomization=False,
            has_blinding=False,
            consistency="medium",
        )
        assert result["grade"] == "D"
        # 2 - 1 (no randomization) = 1
        assert result["score"] == 1

    def test_case_series_base_score(self) -> None:
        """Case series starts at base score 1 (minimum)."""
        result = grade_evidence(
            study_design="case_series",
            sample_size=10,
            has_randomization=False,
            has_blinding=False,
            consistency="low",
        )
        assert result["grade"] == "D"
        # 1 - 1 (small_n) - 1 (no_randomization) - 1 (inconsistent) = -2, clamped to 1
        assert result["score"] == 1
        assert "small_n" in result["downgrades"]
        assert "no_randomization" in result["downgrades"]

    def test_large_n_upgrade(self) -> None:
        """Sample size > 1000 triggers large_n upgrade."""
        result = grade_evidence(
            study_design="cohort",
            sample_size=2000,
            has_randomization=True,
            has_blinding=True,
            consistency="high",
        )
        assert "large_n" in result["upgrades"]

    def test_consistency_upgrade(self) -> None:
        """High consistency triggers consistent_results upgrade."""
        result = grade_evidence(
            study_design="cohort",
            sample_size=500,
            has_randomization=True,
            has_blinding=True,
            consistency="high",
        )
        assert "consistent_results" in result["upgrades"]

    def test_unknown_study_design_defaults_to_lowest(self) -> None:
        """Unknown study design defaults to base score 1."""
        result = grade_evidence(
            study_design="novel_design",
            sample_size=100,
            has_randomization=False,
            has_blinding=False,
            consistency="medium",
        )
        assert result["score"] == 1
        assert result["grade"] == "D"

    def test_score_never_below_1(self) -> None:
        """Score is clamped to minimum 1 regardless of downgrades."""
        result = grade_evidence(
            study_design="case_series",
            sample_size=5,
            has_randomization=False,
            has_blinding=False,
            consistency="low",
        )
        assert result["score"] >= 1
        assert result["grade"] in ("A", "B", "C", "D")

    def test_score_never_above_4(self) -> None:
        """Score is clamped to maximum 4 regardless of upgrades."""
        result = grade_evidence(
            study_design="rct",
            sample_size=5000,
            has_randomization=True,
            has_blinding=True,
            consistency="high",
        )
        # 4 + 1 (double blind) + 1 (large n) + 1 (consistent) = 7, clamped to 4
        assert result["score"] <= 4
        assert result["grade"] == "A"


# ---------------------------------------------------------------------------
# PICO query translation
# ---------------------------------------------------------------------------


class TestPicoQuery:
    """Test suite for PICO query translation."""

    def test_pico_with_full_patient(self) -> None:
        """PICO query built from complete patient data."""
        patient: dict[str, Any] = {
            "diagnosis": "Major Depressive Disorder",
            "age": 45,
            "sex": "female",
        }
        hypothesis: dict[str, Any] = {
            "intervention_type": "tDCS",
            "affected_domain": "cognitive function",
        }
        pico = patient_to_pico_query(patient, hypothesis)
        assert pico["P"] == "Major Depressive Disorder age 45 female"
        assert pico["I"] == "tDCS"
        assert pico["C"] == "standard care or sham"
        assert pico["O"] == "cognitive function"

    def test_pico_with_partial_patient(self) -> None:
        """PICO query built with partial patient data."""
        patient: dict[str, Any] = {"diagnosis": "ADHD", "sex": "male"}
        hypothesis: dict[str, Any] = {"intervention_type": "TMS"}
        pico = patient_to_pico_query(patient, hypothesis)
        assert pico["P"] == "ADHD male"
        assert pico["I"] == "TMS"
        assert pico["O"] == ""

    def test_pico_empty_patient(self) -> None:
        """PICO query with empty patient falls back to general population."""
        patient: dict[str, Any] = {}
        hypothesis: dict[str, Any] = {}
        pico = patient_to_pico_query(patient, hypothesis)
        assert pico["P"] == "general population"
        assert pico["I"] == ""
        assert pico["C"] == "standard care or sham"
        assert pico["O"] == ""

    def test_pico_with_none_age(self) -> None:
        """PICO query handles None age gracefully."""
        patient: dict[str, Any] = {"diagnosis": "PTSD", "age": None, "sex": "female"}
        hypothesis: dict[str, Any] = {"intervention_type": "tACS"}
        pico = patient_to_pico_query(patient, hypothesis)
        assert "PTSD" in pico["P"]
        assert "female" in pico["P"]
        assert "None" not in pico["P"]

    def test_pico_with_integer_age_zero(self) -> None:
        """PICO query handles age 0 (falsy but valid)."""
        patient: dict[str, Any] = {"diagnosis": "Autism", "age": 0, "sex": "male"}
        hypothesis: dict[str, Any] = {"intervention_type": "PBM"}
        pico = patient_to_pico_query(patient, hypothesis)
        assert "age 0" in pico["P"]


# ---------------------------------------------------------------------------
# Citation verification
# ---------------------------------------------------------------------------


class TestCitationVerification:
    """Test suite for DOI citation verification."""

    def test_valid_doi_format(self) -> None:
        """Valid DOI passes format check."""
        result = verify_citation("10.1234/example.doi")
        assert result["valid"] is True
        assert result["doi"] == "10.1234/example.doi"

    def test_invalid_doi_missing_prefix(self) -> None:
        """DOI without 10. prefix is rejected."""
        result = verify_citation("invalid.doi")
        assert result["valid"] is False
        assert "Invalid DOI format" in result["error"]

    def test_empty_doi(self) -> None:
        """Empty DOI is rejected."""
        result = verify_citation("")
        assert result["valid"] is False
        assert "Invalid DOI format" in result["error"]

    def test_none_doi(self) -> None:
        """None DOI is rejected (falsy)."""
        result = verify_citation(None)  # type: ignore[arg-type]
        assert result["valid"] is False

    def test_doi_with_path(self) -> None:
        """DOI with complex path passes format check."""
        result = verify_citation("10.1000/journal.article.2023.12345")
        assert result["valid"] is True


# ---------------------------------------------------------------------------
# Confidence gating
# ---------------------------------------------------------------------------


class TestConfidenceGating:
    """Test suite for confidence gating function."""

    def test_all_pass_above_threshold(self) -> None:
        """All evidence above minimum grade passes."""
        results = [
            {"evidence_grade": "A"},
            {"evidence_grade": "B"},
            {"evidence_grade": "C"},
        ]
        gated = confidence_gating(results, min_grade="C")
        assert len(gated["passed"]) == 3
        assert len(gated["rejected"]) == 0
        assert gated["pass_rate"] == 1.0

    def test_some_rejected_below_threshold(self) -> None:
        """Evidence below minimum grade is rejected."""
        results = [
            {"evidence_grade": "A"},
            {"evidence_grade": "D"},
            {"evidence_grade": "C"},
        ]
        gated = confidence_gating(results, min_grade="C")
        assert len(gated["passed"]) == 2
        assert len(gated["rejected"]) == 1
        assert gated["rejected"][0]["rejection_reason"] == "Grade D below minimum C"

    def test_all_rejected(self) -> None:
        """All evidence below threshold results in 0% pass rate."""
        results = [
            {"evidence_grade": "D"},
            {"evidence_grade": "D"},
        ]
        gated = confidence_gating(results, min_grade="C")
        assert len(gated["passed"]) == 0
        assert len(gated["rejected"]) == 2
        assert gated["pass_rate"] == 0.0

    def test_pending_grade_is_rejected(self) -> None:
        """Pending grade (score 0) is rejected at any threshold >= C."""
        results = [{"evidence_grade": "pending"}]
        gated = confidence_gating(results, min_grade="C")
        assert len(gated["passed"]) == 0
        assert gated["rejected"][0]["rejection_reason"] == "Grade pending below minimum C"

    def test_pending_passes_at_lowest_threshold(self) -> None:
        """Pending grade passes when min_grade is effectively disabled."""
        results = [{"evidence_grade": "pending"}]
        gated = confidence_gating(results, min_grade="pending")
        assert len(gated["passed"]) == 1

    def test_empty_results(self) -> None:
        """Empty evidence list returns 0% pass rate."""
        gated = confidence_gating([], min_grade="C")
        assert gated["passed"] == []
        assert gated["rejected"] == []
        assert gated["total"] == 0
        assert gated["pass_rate"] == 0.0

    def test_grade_a_passes_at_b_threshold(self) -> None:
        """Grade A evidence passes at B threshold."""
        results = [{"evidence_grade": "A"}]
        gated = confidence_gating(results, min_grade="B")
        assert len(gated["passed"]) == 1

    def test_rejection_reason_format(self) -> None:
        """Rejection reason follows expected format."""
        results = [{"evidence_grade": "D", "title": "Test paper"}]
        gated = confidence_gating(results, min_grade="A")
        assert "Grade D below minimum A" in gated["rejected"][0]["rejection_reason"]
        assert gated["rejected"][0]["title"] == "Test paper"


# ---------------------------------------------------------------------------
# Search ranked papers
# ---------------------------------------------------------------------------


class TestSearchRankedPapers:
    """Test suite for evidence search stub."""

    def test_returns_stub_result(self) -> None:
        """Search returns structured stub result."""
        pico = {"P": "MDD", "I": "tDCS", "C": "sham", "O": "depression"}
        results = search_ranked_papers(pico)
        assert len(results) == 1
        assert results[0]["status"] == "stub"
        assert results[0]["evidence_grade"] == "pending"

    def test_query_string_formed_correctly(self) -> None:
        """PICO query string is assembled correctly."""
        pico = {"P": "MDD age 45 female", "I": "tDCS", "C": "standard care", "O": "mood"}
        results = search_ranked_papers(pico)
        query = results[0]["query"]
        assert "MDD" in query
        assert "tDCS" in query

    def test_empty_pico_falls_back(self) -> None:
        """Empty PICO values produce a fallback query."""
        pico = {"P": "", "I": "", "C": "", "O": ""}
        results = search_ranked_papers(pico)
        assert results[0]["query"]  # should not be empty


# ---------------------------------------------------------------------------
# RAG pipeline end-to-end
# ---------------------------------------------------------------------------


class TestRagPipeline:
    """Test suite for the full RAG pipeline."""

    def test_full_pipeline_returns_synthesis(self) -> None:
        """RAG pipeline returns complete synthesis with all keys."""
        patient: dict[str, Any] = {
            "diagnosis": "Major Depressive Disorder",
            "age": 45,
            "sex": "female",
        }
        hypothesis: dict[str, Any] = {
            "intervention_type": "tDCS",
            "affected_domain": "depression severity",
        }
        result = rag_pipeline(patient, hypothesis)
        assert "pico" in result
        assert "evidence" in result
        assert "rejected" in result
        assert "pass_rate" in result
        assert "safety_note" in result
        assert "citation_policy" in result
        assert "provenance" in result

    def test_pico_in_synthesis(self) -> None:
        """PICO query is included in synthesis output."""
        patient: dict[str, Any] = {"diagnosis": "ADHD", "age": 12, "sex": "male"}
        hypothesis: dict[str, Any] = {
            "intervention_type": "TMS",
            "affected_domain": "attention",
        }
        result = rag_pipeline(patient, hypothesis)
        assert result["pico"]["P"] == "ADHD age 12 male"
        assert result["pico"]["I"] == "TMS"
        assert result["pico"]["C"] == "standard care or sham"
        assert result["pico"]["O"] == "attention"

    def test_safety_note_present(self) -> None:
        """Safety framing is applied to synthesis."""
        patient: dict[str, Any] = {"diagnosis": "PTSD"}
        hypothesis: dict[str, Any] = {"intervention_type": "tACS"}
        result = rag_pipeline(patient, hypothesis)
        assert result["safety_note"]
        assert "clinician" in result["safety_note"].lower()

    def test_citation_policy_present(self) -> None:
        """Citation policy is included in synthesis."""
        patient: dict[str, Any] = {"diagnosis": "Anxiety"}
        hypothesis: dict[str, Any] = {"intervention_type": "PBM"}
        result = rag_pipeline(patient, hypothesis)
        assert "fabricated" in result["citation_policy"].lower() or "verifiable" in result["citation_policy"].lower()

    def test_provenance_metadata(self) -> None:
        """Provenance block includes pipeline version and timestamp."""
        patient: dict[str, Any] = {"diagnosis": "Insomnia"}
        hypothesis: dict[str, Any] = {"intervention_type": "CES"}
        result = rag_pipeline(patient, hypothesis)
        assert result["provenance"]["pipeline"] == "rag_v1"
        assert "timestamp" in result["provenance"]
        # Timestamp should be ISO format
        ts = result["provenance"]["timestamp"]
        assert re.match(r"\d{4}-\d{2}-\d{2}T", ts) is not None

    def test_knowledge_base_size_tracked(self) -> None:
        """Knowledge base size is tracked in provenance."""
        patient: dict[str, Any] = {"diagnosis": "Fibromyalgia"}
        hypothesis: dict[str, Any] = {"intervention_type": "tDCS"}
        kb: list[dict[str, Any]] = [{"title": "Study 1"}, {"title": "Study 2"}]
        result = rag_pipeline(patient, hypothesis, knowledge_base=kb)
        assert result["provenance"]["knowledge_base_size"] == 2

    def test_knowledge_base_none_defaults_to_zero(self) -> None:
        """None knowledge base defaults to size 0."""
        patient: dict[str, Any] = {"diagnosis": "Chronic Pain"}
        hypothesis: dict[str, Any] = {"intervention_type": "tDCS"}
        result = rag_pipeline(patient, hypothesis, knowledge_base=None)
        assert result["provenance"]["knowledge_base_size"] == 0

    def test_pass_rate_between_zero_and_one(self) -> None:
        """Pass rate is always a valid proportion."""
        patient: dict[str, Any] = {"diagnosis": "OCD"}
        hypothesis: dict[str, Any] = {"intervention_type": "TMS"}
        result = rag_pipeline(patient, hypothesis)
        assert 0.0 <= result["pass_rate"] <= 1.0

    def test_empty_patient_and_hypothesis(self) -> None:
        """Pipeline handles empty inputs gracefully."""
        result = rag_pipeline({}, {})
        assert result["pico"]["P"] == "general population"
        assert "evidence" in result
        assert "safety_note" in result


# ---------------------------------------------------------------------------
# Safety invariants
# ---------------------------------------------------------------------------


class TestSafetyInvariants:
    """Safety-critical invariants that must never be violated."""

    def test_never_fabricates_citations(self) -> None:
        """RAG pipeline never returns fabricated citations.

        Evidence results should only contain stub/pending status, never
        fake paper titles, authors, or DOIs.
        """
        patient: dict[str, Any] = {"diagnosis": "Depression"}
        hypothesis: dict[str, Any] = {"intervention_type": "tDCS"}
        result = rag_pipeline(patient, hypothesis)
        for ev in result["evidence"]:
            assert "status" in ev
            assert ev["status"] in ("stub", "pending")
            # No fabricated title/author/journal
            assert "author" not in ev or not ev["author"]
            assert "journal" not in ev or not ev["journal"]

    def test_evidence_is_stub_only(self) -> None:
        """Search results are always stub status until external API is connected."""
        pico = {"P": "MDD", "I": "tDCS", "C": "sham", "O": "mood"}
        results = search_ranked_papers(pico)
        for r in results:
            assert r["status"] == "stub"
            assert r["evidence_grade"] == "pending"

    def test_safety_note_always_present(self) -> None:
        """Every synthesis includes a safety note."""
        result = rag_pipeline({}, {})
        assert result["safety_note"]
        assert "decision support" in result["safety_note"].lower() or "clinician" in result["safety_note"].lower()


# ---------------------------------------------------------------------------
# Batch GRADE processing
# ---------------------------------------------------------------------------


class TestBatchGradeEvidence:
    """Test suite for batch GRADE processing."""

    def test_batch_processes_all_items(self) -> None:
        """Batch processing handles all items."""
        items = [
            {"study_design": "rct", "sample_size": 200, "randomized": True, "blinded": True, "consistency": "high"},
            {"study_design": "cohort", "sample_size": 500, "randomized": False, "blinded": False, "consistency": "medium"},
        ]
        result = batch_grade_evidence(items)
        assert len(result) == 2
        assert "grade_result" in result[0]
        assert "grade_result" in result[1]

    def batch_preserves_original_fields(self) -> None:
        """Batch processing preserves original item fields."""
        items = [{"study_design": "rct", "sample_size": 100, "title": "Test Study"}]
        result = batch_grade_evidence(items)
        assert result[0]["title"] == "Test Study"


# ---------------------------------------------------------------------------
# Evidence links builder
# ---------------------------------------------------------------------------


class TestEvidenceLinks:
    """Test suite for evidence link builder."""

    def test_builds_intervention_link(self) -> None:
        """Evidence links include intervention query."""
        pico = {"P": "MDD", "I": "tDCS", "C": "sham", "O": "mood"}
        links = build_evidence_links(pico)
        assert len(links) >= 1
        assert links[0]["domain"] == "intervention"
        assert "tDCS" in links[0]["query"]

    def test_builds_population_outcome_link(self) -> None:
        """Evidence links include population-outcome query."""
        pico = {"P": "MDD", "I": "tDCS", "C": "sham", "O": "mood"}
        links = build_evidence_links(pico)
        assert any(link["domain"] == "population_outcome" for link in links)

    def test_empty_pico_returns_empty_links(self) -> None:
        """Empty PICO produces no links."""
        pico = {"P": "", "I": "", "C": "", "O": ""}
        links = build_evidence_links(pico)
        assert links == []


# ---------------------------------------------------------------------------
# Constant definitions
# ---------------------------------------------------------------------------


def test_study_design_base_scores_defined() -> None:
    """All expected study designs have base scores."""
    expected = {"meta_analysis", "rct", "cohort", "case_control", "case_series", "expert_opinion", "unknown"}
    assert set(STUDY_DESIGN_BASE_SCORES.keys()) == expected


def test_grade_order_values() -> None:
    """GRADE_ORDER maps correctly A=4 down to pending=0."""
    assert GRADE_ORDER["A"] == 4
    assert GRADE_ORDER["B"] == 3
    assert GRADE_ORDER["C"] == 2
    assert GRADE_ORDER["D"] == 1
    assert GRADE_ORDER["pending"] == 0
