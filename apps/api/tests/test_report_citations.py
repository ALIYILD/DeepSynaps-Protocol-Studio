"""Tests for app.services.report_citations — citation enrichment.

Critical clinical-safety rule: no fabrication.
  - Unresolvable references must be marked ``status="unverified"`` and
    raw_text preserved verbatim — never a fake DOI/PMID.
  - Only confirmed DB matches may carry ``status="verified"``.
"""
from __future__ import annotations

import pytest

from unittest.mock import MagicMock, patch

from app.persistence.models import LiteraturePaper
from app.services.report_citations import (
    _split_authors,
    citation_from_paper,
    citation_from_text,
    enrich_citations,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _make_paper(
    *,
    id: str = "paper-001",
    title: str = "Test paper title",
    authors: str = "Smith J; Jones A",
    year: int = 2021,
    journal: str = "Test Journal",
    doi: str | None = "10.1016/j.test.2021.01",
    pubmed_id: str | None = "12345678",
    url: str | None = None,
    evidence_grade: str | None = "B",
    study_type: str | None = None,
) -> MagicMock:
    """Build a MagicMock that passes isinstance(paper, LiteraturePaper)."""
    paper = MagicMock(spec=LiteraturePaper)
    paper.id = id
    paper.title = title
    paper.authors = authors
    paper.year = year
    paper.journal = journal
    paper.doi = doi
    paper.pubmed_id = pubmed_id
    paper.url = url
    paper.evidence_grade = evidence_grade
    paper.study_type = study_type
    return paper


# Backwards-compat alias used by tests that call _Paper(...)
_Paper = _make_paper


# ---------------------------------------------------------------------------
# _split_authors
# ---------------------------------------------------------------------------

def test_split_authors_semicolon():
    assert _split_authors("Smith J; Jones A") == ["Smith J", "Jones A"]


def test_split_authors_comma():
    assert _split_authors("Smith J, Jones A, Brown B") == ["Smith J", "Jones A", "Brown B"]


def test_split_authors_none():
    assert _split_authors(None) == []


def test_split_authors_empty():
    assert _split_authors("") == []


# ---------------------------------------------------------------------------
# citation_from_paper — verified citations
# ---------------------------------------------------------------------------

def test_citation_from_paper_status_verified():
    paper = _Paper()
    cit = citation_from_paper(paper, citation_id="C1")
    assert cit.status == "verified"


def test_citation_from_paper_fields_preserved():
    paper = _Paper(title="My study", year=2022, journal="Brain Research")
    cit = citation_from_paper(paper, citation_id="C2")
    assert cit.title == "My study"
    assert cit.year == 2022
    assert cit.journal == "Brain Research"
    assert cit.citation_id == "C2"


def test_citation_from_paper_grade_a_descriptor():
    paper = _Paper(evidence_grade="A")
    cit = citation_from_paper(paper, citation_id="C3")
    assert cit.evidence_level is not None
    assert "Systematic review" in cit.evidence_level or "Grade A" in cit.evidence_level


def test_citation_from_paper_grade_b_descriptor():
    paper = _Paper(evidence_grade="B")
    cit = citation_from_paper(paper, citation_id="C4")
    assert "Randomised" in (cit.evidence_level or "") or "Grade B" in (cit.evidence_level or "")


def test_citation_from_paper_authors_split():
    paper = _Paper(authors="Smith J; Jones A; Brown B")
    cit = citation_from_paper(paper, citation_id="C5")
    assert len(cit.authors) == 3


# ---------------------------------------------------------------------------
# citation_from_text — unverified path (no DB)
# ---------------------------------------------------------------------------

def test_citation_from_text_no_db_status_unverified():
    """Without a DB, even a valid DOI must be unverified."""
    cit = citation_from_text(
        "Smith J et al. Some study. 10.1016/j.neuron.2021.01.001",
        citation_id="C6",
    )
    assert cit.status == "unverified"


def test_citation_from_text_no_fabrication_raw_text_preserved():
    """Raw text is preserved exactly — never silently dropped or fabricated."""
    raw = "Smith J, 2022. A clinical study. PMID 12345678"
    cit = citation_from_text(raw, citation_id="C7")
    assert cit.raw_text == raw


def test_citation_from_text_doi_extracted():
    text = "See 10.1093/brain/awab001 for details."
    cit = citation_from_text(text, citation_id="C8")
    assert cit.doi == "10.1093/brain/awab001"


def test_citation_from_text_pmid_extracted():
    text = "PMID 34567890 reports this finding."
    cit = citation_from_text(text, citation_id="C9")
    assert cit.pmid == "34567890"


def test_citation_from_text_no_id_no_doi_no_pmid():
    """Pure free-text with no ID stays unverified and raw_text intact."""
    text = "Some author, Some title, Some Journal 2020"
    cit = citation_from_text(text, citation_id="C10")
    assert cit.status == "unverified"
    assert cit.doi is None
    assert cit.pmid is None
    assert text in (cit.raw_text or "")


# ---------------------------------------------------------------------------
# enrich_citations — mixed iterable
# ---------------------------------------------------------------------------

def test_enrich_citations_paper_gets_verified():
    paper = _Paper()
    refs = enrich_citations([paper], start_index=1)
    assert len(refs) == 1
    assert refs[0].status == "verified"
    assert refs[0].citation_id == "C1"


def test_enrich_citations_string_gets_unverified():
    refs = enrich_citations(["Free text reference 2021"], start_index=5)
    assert refs[0].status == "unverified"
    assert refs[0].citation_id == "C5"


def test_enrich_citations_deduplicates_papers():
    paper = _Paper(id="paper-dup")
    refs = enrich_citations([paper, paper], start_index=1)
    # Second identical paper should be skipped
    assert len(refs) == 1


def test_enrich_citations_mixed_list_preserves_order():
    paper = _Paper(id="p1", title="First")
    refs = enrich_citations([paper, "second text"], start_index=1)
    assert len(refs) == 2
    assert refs[0].citation_id == "C1"
    assert refs[1].citation_id == "C2"
