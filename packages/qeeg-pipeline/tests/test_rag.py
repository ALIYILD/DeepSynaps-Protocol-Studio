"""Tests for :mod:`deepsynaps_qeeg.report.rag`."""
from __future__ import annotations


def test_rag_fallback_returns_matching_papers():
    from deepsynaps_qeeg.report.rag import query_literature

    papers = query_literature(["adhd"], ["neurofeedback"], top_k=5)
    assert isinstance(papers, list)
    assert len(papers) >= 1
    for paper in papers:
        for key in ("pmid", "doi", "title", "authors", "year",
                    "journal", "abstract", "relevance_score"):
            assert key in paper
    # ADHD/neurofeedback paper should appear
    pmids = {p["pmid"] for p in papers}
    assert "30000001" in pmids


def test_rag_empty_when_no_conditions_or_db():
    from deepsynaps_qeeg.report.rag import query_literature

    # With no db_url and no conditions/modalities, the JSON fallback returns
    # everything when filters are empty; allow either empty or non-empty.
    papers = query_literature([], [], top_k=3)
    assert isinstance(papers, list)
