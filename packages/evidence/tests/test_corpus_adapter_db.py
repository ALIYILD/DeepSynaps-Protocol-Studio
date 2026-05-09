"""DB-backed tests for deepsynaps_evidence.corpus_adapter.

Uses the in-memory SQLite session from conftest.py with stand-in models.
Covers: find_by_pmid, is_retracted, bulk_verify_pmids, find_similar_text.
"""
from __future__ import annotations

import pytest

from deepsynaps_evidence import corpus_adapter
from deepsynaps_evidence.schemas import Citation


# ── find_by_pmid ─────────────────────────────────────────────────────────────


class TestFindByPmid:
    def test_happy_path_returns_citation(self, db_session, seed_papers):
        cit = corpus_adapter.find_by_pmid(db_session, "11111111")
        assert cit is not None
        assert isinstance(cit, Citation)
        assert cit.pmid == "11111111"
        assert cit.paper_id == "paper-001"
        assert cit.relevance_score == 1.0

    def test_miss_returns_none(self, db_session, seed_papers):
        cit = corpus_adapter.find_by_pmid(db_session, "99999999")
        assert cit is None

    def test_citation_fields_populated(self, db_session, seed_papers):
        cit = corpus_adapter.find_by_pmid(db_session, "11111111")
        assert cit is not None
        assert cit.title == "rTMS for Major Depressive Disorder: a systematic review"
        assert cit.year == 2022
        assert cit.journal == "Journal of Clinical Psychiatry"
        assert cit.evidence_grade == "A"
        assert cit.retracted is False

    def test_retracted_paper_still_returned(self, db_session, seed_papers):
        """find_by_pmid does NOT filter retractions — callers decide."""
        cit = corpus_adapter.find_by_pmid(db_session, "33333333")
        assert cit is not None
        assert cit.retracted is True

    def test_authors_short_truncated(self, db_session, seed_papers):
        cit = corpus_adapter.find_by_pmid(db_session, "11111111")
        assert cit is not None
        # paper-001 has 4 authors → truncated to 3 + et al.
        assert "et al." in cit.authors_short

    def test_authors_short_two_names(self, db_session, seed_papers):
        cit = corpus_adapter.find_by_pmid(db_session, "22222222")
        assert cit is not None
        assert cit.authors_short == "Garcia R, Chen W"


# ── is_retracted ─────────────────────────────────────────────────────────────


class TestIsRetracted:
    def test_non_retracted_paper_returns_false(self, db_session, seed_papers):
        assert corpus_adapter.is_retracted(db_session, "11111111") is False

    def test_retracted_paper_returns_true(self, db_session, seed_papers):
        assert corpus_adapter.is_retracted(db_session, "33333333") is True

    def test_unknown_pmid_returns_false(self, db_session, seed_papers):
        assert corpus_adapter.is_retracted(db_session, "00000000") is False


# ── bulk_verify_pmids ─────────────────────────────────────────────────────────


class TestBulkVerifyPmids:
    def test_all_present(self, db_session, seed_papers):
        result = corpus_adapter.bulk_verify_pmids(db_session, ["11111111", "22222222"])
        assert result == {"11111111": True, "22222222": True}

    def test_all_absent(self, db_session, seed_papers):
        result = corpus_adapter.bulk_verify_pmids(db_session, ["88888888", "77777777"])
        assert result == {"88888888": False, "77777777": False}

    def test_mixed_present_and_absent(self, db_session, seed_papers):
        result = corpus_adapter.bulk_verify_pmids(db_session, ["11111111", "99999999"])
        assert result["11111111"] is True
        assert result["99999999"] is False

    def test_empty_list_returns_empty_dict(self, db_session):
        result = corpus_adapter.bulk_verify_pmids(db_session, [])
        assert result == {}

    def test_retracted_paper_is_still_present(self, db_session, seed_papers):
        """bulk_verify_pmids checks existence, not retraction status."""
        result = corpus_adapter.bulk_verify_pmids(db_session, ["33333333"])
        assert result["33333333"] is True

    def test_preserves_input_order_keys(self, db_session, seed_papers):
        pmids = ["22222222", "11111111", "33333333"]
        result = corpus_adapter.bulk_verify_pmids(db_session, pmids)
        assert list(result.keys()) == pmids


# ── find_similar_text ─────────────────────────────────────────────────────────


class TestFindSimilarText:
    def test_keyword_match_returns_results(self, db_session, seed_papers):
        results = corpus_adapter.find_similar_text(db_session, "rTMS depression meta-analysis")
        assert len(results) > 0
        titles = [r.title for r in results]
        assert any("rTMS" in t for t in titles)

    def test_retracted_papers_excluded(self, db_session, seed_papers):
        # The retracted paper mentions "alpha wave entrainment"
        results = corpus_adapter.find_similar_text(db_session, "alpha wave entrainment retraction")
        for r in results:
            assert r.retracted is False, f"Retracted paper should be excluded: {r.title}"

    def test_empty_query_returns_empty(self, db_session, seed_papers):
        results = corpus_adapter.find_similar_text(db_session, "")
        assert results == []

    def test_whitespace_only_query_returns_empty(self, db_session, seed_papers):
        results = corpus_adapter.find_similar_text(db_session, "   ")
        assert results == []

    def test_short_words_ignored(self, db_session, seed_papers):
        """Words shorter than 3 chars are ignored — no match on single-letter words."""
        results = corpus_adapter.find_similar_text(db_session, "a b c")
        assert results == []

    def test_relevance_scores_non_negative(self, db_session, seed_papers):
        results = corpus_adapter.find_similar_text(db_session, "neurofeedback ADHD randomised")
        for r in results:
            assert r.relevance_score >= 0.0

    def test_top_k_respected(self, db_session, seed_papers):
        # Only 2 non-retracted papers in seed; top_k=1 should return at most 1
        results = corpus_adapter.find_similar_text(
            db_session, "study analysis", top_k=1
        )
        assert len(results) <= 1

    def test_no_match_returns_empty(self, db_session, seed_papers):
        results = corpus_adapter.find_similar_text(
            db_session, "xylophone quantum antigravity unicorn"
        )
        assert results == []

    def test_abstract_matched_as_well_as_title(self, db_session, seed_papers):
        """find_similar_text searches both title and abstract fields."""
        results = corpus_adapter.find_similar_text(db_session, "meta-analysis")
        # paper-001 mentions meta-analysis in its abstract
        assert len(results) > 0

    def test_returns_citation_objects(self, db_session, seed_papers):
        results = corpus_adapter.find_similar_text(db_session, "neurofeedback attention")
        for r in results:
            assert isinstance(r, Citation)


# ── find_similar (pgvector ANN) ───────────────────────────────────────────────


class TestFindSimilar:
    def test_sqlite_dialect_returns_empty(self, db_session, seed_papers):
        """On SQLite the pgvector ANN path gracefully returns []."""
        results = corpus_adapter.find_similar(db_session, [0.1] * 10, top_k=5)
        assert results == []
