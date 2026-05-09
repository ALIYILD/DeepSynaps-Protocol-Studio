"""Tests for the pure helper paths in deepsynaps_evidence.corpus_adapter.

The DB-touching functions (find_by_pmid, is_retracted, find_similar*,
log_grounding_event) are covered by integration tests in apps/api/tests/.
This file pins the pure helpers and the trivial early-returns so a refactor
can't silently break them.
"""

from __future__ import annotations

from types import SimpleNamespace

from deepsynaps_evidence import corpus_adapter
from deepsynaps_evidence.schemas import Citation


def _fake_paper(
    *,
    id: str = "ds-1",
    pmid: str = "12345",
    doi: str | None = "10.1/x",
    title: str = "rTMS for MDD",
    year: int = 2023,
    journal: str = "JCP",
    grade: str | None = "A",
    retracted: bool = False,
    authors_json: str | None = '["Smith J", "Jones K"]',
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        pmid=pmid,
        doi=doi,
        title=title,
        year=year,
        journal=journal,
        grade=grade,
        retracted=retracted,
        authors_json=authors_json,
    )


# ───────────────────────────── _paper_to_citation ──────────────────────────


class TestPaperToCitation:
    def test_happy_path(self) -> None:
        paper = _fake_paper()
        cit = corpus_adapter._paper_to_citation(paper, relevance_score=0.42)
        assert isinstance(cit, Citation)
        assert cit.paper_id == "ds-1"
        assert cit.pmid == "12345"
        assert cit.doi == "10.1/x"
        assert cit.title == "rTMS for MDD"
        assert cit.year == 2023
        assert cit.journal == "JCP"
        assert cit.evidence_grade == "A"
        assert cit.retracted is False
        assert cit.relevance_score == 0.42

    def test_authors_short_two_names(self) -> None:
        paper = _fake_paper(authors_json='["A", "B"]')
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.authors_short == "A, B"

    def test_authors_short_truncates_to_three_with_et_al(self) -> None:
        paper = _fake_paper(authors_json='["A", "B", "C", "D", "E"]')
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.authors_short == "A, B, C, et al."

    def test_authors_short_three_names_no_et_al(self) -> None:
        paper = _fake_paper(authors_json='["A", "B", "C"]')
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.authors_short == "A, B, C"

    def test_authors_short_handles_invalid_json(self) -> None:
        paper = _fake_paper(authors_json="not-json")
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.authors_short == ""

    def test_authors_short_handles_none_authors(self) -> None:
        paper = _fake_paper(authors_json=None)
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.authors_short == ""

    def test_authors_short_handles_non_list_json(self) -> None:
        # JSON parses but isn't a list — should not crash, just empty.
        paper = _fake_paper(authors_json='{"first": "A"}')
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.authors_short == ""

    def test_default_relevance_score(self) -> None:
        paper = _fake_paper()
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.relevance_score == 0.0

    def test_retracted_passthrough(self) -> None:
        paper = _fake_paper(retracted=True)
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.retracted is True

    def test_missing_title_becomes_empty_string(self) -> None:
        paper = _fake_paper(title=None)  # type: ignore[arg-type]
        cit = corpus_adapter._paper_to_citation(paper)
        assert cit.title == ""


# ───────────────────────────── bulk_verify_pmids early return ──────────────


class TestBulkVerifyPmidsEmpty:
    def test_empty_list_returns_empty_dict(self) -> None:
        # No DB access on the empty path, so the test doesn't need a session.
        result = corpus_adapter.bulk_verify_pmids(session=None, pmids=[])  # type: ignore[arg-type]
        assert result == {}
