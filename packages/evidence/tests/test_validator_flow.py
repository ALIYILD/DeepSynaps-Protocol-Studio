"""Integration tests for deepsynaps_evidence.validator.validate_claims.

Uses the in-memory SQLite session from conftest.py. Mocks
``app.repositories.citation_validator.create_claim_citation`` so the
validator can run end-to-end without importing the full apps/api stack.
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from deepsynaps_evidence.schemas import Claim, ValidationRequest, ValidationResult
from deepsynaps_evidence.validator import validate_claims, ground_claim

# conftest.py provides db_session, seed_papers, and the module patches.


def _make_claim_citation_stub(db_session):
    """Return a factory that creates real DsClaimCitation rows (using stand-ins)."""
    from tests.conftest import DsClaimCitation  # stand-in model

    def _create(
        session,
        *,
        claim_text,
        claim_hash,
        paper_id=None,
        citation_type="supports",
        relevance_score=None,
        evidence_grade=None,
        supporting_quote=None,
        confidence=None,
        validation_status="pending",
        issues=None,
        actor_id=None,
        validator_version=None,
    ):
        import json
        record = DsClaimCitation(
            id=str(uuid.uuid4()),
            claim_text=claim_text,
            claim_hash=claim_hash,
            paper_id=paper_id,
            citation_type=citation_type,
            relevance_score=relevance_score,
            evidence_grade=evidence_grade,
            supporting_quote=supporting_quote,
            confidence=confidence,
            validation_status=validation_status,
            issues_json=json.dumps(issues) if issues else None,
            actor_id=actor_id,
            validator_version=validator_version,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        return record

    return _create


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def patch_create_claim_citation(db_session, monkeypatch):
    """Patch the create_claim_citation import inside validator.py."""
    stub = _make_claim_citation_stub(db_session)
    # The validator imports it lazily inside the function body:
    # from app.repositories.citation_validator import create_claim_citation
    # We patch at the module that validator will try to import from.
    import sys
    import types

    # Create a fake module for app.repositories.citation_validator
    fake_module = types.ModuleType("app.repositories.citation_validator")
    fake_module.create_claim_citation = stub
    monkeypatch.setitem(sys.modules, "app.repositories.citation_validator", fake_module)

    # Also ensure app and app.repositories exist in sys.modules
    if "app" not in sys.modules:
        monkeypatch.setitem(sys.modules, "app", types.ModuleType("app"))
    if "app.repositories" not in sys.modules:
        monkeypatch.setitem(sys.modules, "app.repositories", types.ModuleType("app.repositories"))

    return stub


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestValidateClaims:
    def test_clean_claim_passes(self, db_session, seed_papers, patch_create_claim_citation):
        """A plain, non-strong claim with no PMIDs should produce a passing result."""
        request = ValidationRequest(
            claims=[Claim(claim_text="rTMS may help patients with depression.")],
            max_citations_per_claim=5,
            min_relevance=0.0,
        )
        results = validate_claims(db_session, request)
        assert len(results) == 1
        result = results[0]
        assert isinstance(result, ValidationResult)
        assert result.claim_text == "rTMS may help patients with depression."
        # No block issues
        blocking = [i for i in result.issues if i.severity == "block"]
        assert blocking == [], f"Unexpected blocking issues: {blocking}"

    def test_fabricated_pmid_blocked(self, db_session, seed_papers, patch_create_claim_citation):
        """A claim with a PMID not in the corpus triggers fabrication_blocked."""
        claim = Claim(
            claim_text="rTMS cures depression.",
            asserted_pmids=["00000000"],  # not in seed
        )
        request = ValidationRequest(claims=[claim])
        results = validate_claims(db_session, request)
        assert len(results) == 1
        result = results[0]
        assert result.pmids_fabricated == 1
        fabrication_issues = [i for i in result.issues if i.issue_type == "fabricated_pmid"]
        assert len(fabrication_issues) == 1
        assert fabrication_issues[0].severity == "block"
        assert "00000000" in fabrication_issues[0].message

    def test_retracted_pmid_blocked(self, db_session, seed_papers, patch_create_claim_citation):
        """A claim referencing a retracted PMID triggers retracted_paper issue."""
        claim = Claim(
            claim_text="Alpha wave entrainment is effective.",
            asserted_pmids=["33333333"],  # retracted in seed
        )
        request = ValidationRequest(claims=[claim])
        results = validate_claims(db_session, request)
        assert len(results) == 1
        result = results[0]
        assert result.pmids_retracted == 1
        retraction_issues = [i for i in result.issues if i.issue_type == "retracted_paper"]
        assert len(retraction_issues) == 1
        assert retraction_issues[0].severity == "block"

    def test_verified_pmid_increments_counter(self, db_session, seed_papers, patch_create_claim_citation):
        """A claim referencing a real, non-retracted PMID increments pmids_verified."""
        claim = Claim(
            claim_text="rTMS for MDD has RCT evidence.",
            asserted_pmids=["11111111"],
        )
        request = ValidationRequest(claims=[claim])
        results = validate_claims(db_session, request)
        result = results[0]
        assert result.pmids_verified == 1
        assert result.pmids_fabricated == 0

    def test_strong_claim_without_grade_a_b_blocked(
        self, db_session, patch_create_claim_citation
    ):
        """Strong efficacy language without Grade A/B citation support is blocked."""
        # Empty DB — no papers → no Grade A/B citations
        claim = Claim(claim_text="This treatment has been proven to cure all cases.")
        request = ValidationRequest(claims=[claim], min_relevance=0.0)
        results = validate_claims(db_session, request)
        result = results[0]
        strong_issues = [i for i in result.issues if i.issue_type == "strong_claim_ungrounded"]
        assert len(strong_issues) >= 1
        assert strong_issues[0].severity == "block"

    def test_corpus_miss_warning(self, db_session, patch_create_claim_citation):
        """A claim that finds no corpus papers gets a corpus_miss warning."""
        claim = Claim(claim_text="xylophone quantum antigravity unicorn elephants")
        request = ValidationRequest(claims=[claim], min_relevance=0.0)
        results = validate_claims(db_session, request)
        result = results[0]
        corpus_miss_issues = [i for i in result.issues if i.issue_type == "corpus_miss"]
        assert len(corpus_miss_issues) == 1
        assert corpus_miss_issues[0].severity == "warning"

    def test_multiple_claims_each_validated(
        self, db_session, seed_papers, patch_create_claim_citation
    ):
        """Batch of claims → one result per claim."""
        request = ValidationRequest(
            claims=[
                Claim(claim_text="rTMS for MDD."),
                Claim(claim_text="neurofeedback attention deficit."),
            ]
        )
        results = validate_claims(db_session, request)
        assert len(results) == 2

    def test_result_has_audit_event_id(self, db_session, seed_papers, patch_create_claim_citation):
        """Each ValidationResult should carry an audit_event_id from the chain."""
        request = ValidationRequest(claims=[Claim(claim_text="rTMS depression treatment.")])
        results = validate_claims(db_session, request)
        assert results[0].audit_event_id is not None
        assert isinstance(results[0].audit_event_id, str)

    def test_ungrounded_persistence_when_no_citations(
        self, db_session, patch_create_claim_citation
    ):
        """When no citations found, still persists an 'ungrounded' record."""
        from tests.conftest import DsClaimCitation
        from sqlalchemy import select

        claim = Claim(claim_text="completely obscure claim with no matching papers xyz")
        request = ValidationRequest(claims=[claim], min_relevance=0.0)
        validate_claims(db_session, request)

        # An ungrounded DsClaimCitation should exist
        records = list(
            db_session.scalars(
                select(DsClaimCitation).where(DsClaimCitation.claim_hash == claim.claim_hash)
            ).all()
        )
        assert len(records) >= 1
        assert any(r.validation_status == "ungrounded" for r in records)


class TestGroundClaim:
    def test_returns_single_result(self, db_session, seed_papers, patch_create_claim_citation):
        result = ground_claim(db_session, "rTMS may benefit patients with MDD.")
        assert isinstance(result, ValidationResult)

    def test_empty_claim_returns_result_not_raises(
        self, db_session, patch_create_claim_citation
    ):
        result = ground_claim(db_session, "")
        assert isinstance(result, ValidationResult)
        empty_issues = [i for i in result.issues if i.issue_type == "empty_claim"]
        assert len(empty_issues) == 1

    def test_actor_id_propagated(self, db_session, seed_papers, patch_create_claim_citation):
        """actor_id flows through to the audit log."""
        from tests.conftest import DsGroundingAudit
        from sqlalchemy import select

        ground_claim(db_session, "rTMS for MDD.", actor_id="clinician:test-actor")

        rows = list(
            db_session.scalars(
                select(DsGroundingAudit).where(
                    DsGroundingAudit.decided_by == "clinician:test-actor"
                )
            ).all()
        )
        assert len(rows) > 0
