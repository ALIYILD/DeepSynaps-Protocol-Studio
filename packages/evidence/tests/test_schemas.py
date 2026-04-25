"""Unit tests for deepsynaps_evidence.schemas."""
from __future__ import annotations

from deepsynaps_evidence.schemas import (
    Claim,
    Citation,
    ValidationIssue,
    ValidationRequest,
    ValidationResult,
)


def test_claim_hash_deterministic():
    """Same claim text produces the same hash."""
    c1 = Claim(claim_text="tDCS reduces depressive symptoms")
    c2 = Claim(claim_text="tDCS reduces depressive symptoms")
    assert c1.claim_hash == c2.claim_hash
    assert len(c1.claim_hash) == 64  # SHA-256 hex digest


def test_claim_hash_normalises_whitespace():
    """Whitespace variations produce the same hash."""
    c1 = Claim(claim_text="tDCS  reduces   depressive symptoms")
    c2 = Claim(claim_text="tDCS reduces depressive symptoms")
    assert c1.claim_hash == c2.claim_hash


def test_claim_hash_case_insensitive():
    """Case variations produce the same hash."""
    c1 = Claim(claim_text="TDCS REDUCES DEPRESSIVE SYMPTOMS")
    c2 = Claim(claim_text="tdcs reduces depressive symptoms")
    assert c1.claim_hash == c2.claim_hash


def test_claim_hash_different_text():
    """Different text produces different hashes."""
    c1 = Claim(claim_text="tDCS reduces depressive symptoms")
    c2 = Claim(claim_text="Neurofeedback improves attention")
    assert c1.claim_hash != c2.claim_hash


def test_citation_defaults():
    """Citation has sensible defaults."""
    c = Citation(paper_id="abc-123", title="Test paper")
    assert c.citation_type == "supports"
    assert c.relevance_score == 0.0
    assert c.retracted is False


def test_validation_result_passed_no_issues():
    """Result with no issues passes."""
    r = ValidationResult(claim_hash="abc123")
    assert r.passed is True


def test_validation_result_passed_with_warning():
    """Result with only warnings still passes."""
    r = ValidationResult(
        claim_hash="abc123",
        issues=[ValidationIssue(issue_type="corpus_miss", severity="warning", message="no match")],
    )
    assert r.passed is True


def test_validation_result_blocked():
    """Result with a block-severity issue fails."""
    r = ValidationResult(
        claim_hash="abc123",
        issues=[
            ValidationIssue(issue_type="fabricated_pmid", severity="block", message="fake"),
        ],
    )
    assert r.passed is False


def test_validation_request_min_length():
    """ValidationRequest requires at least one claim."""
    import pytest
    with pytest.raises(Exception):
        ValidationRequest(claims=[])


def test_claim_asserted_pmids():
    """Claim can carry asserted PMIDs."""
    c = Claim(claim_text="test", asserted_pmids=["12345678", "87654321"])
    assert len(c.asserted_pmids) == 2
