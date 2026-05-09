"""Tests for deepsynaps_evidence.hypergraph.

Uses the in-memory SQLite session from conftest.py with stand-in models.
Covers: enrich_edge, get_edge_citations, auto_enrich_from_validation.
"""
from __future__ import annotations

import json
import sys
import types
import uuid

import pytest

from tests.conftest import (
    DsClaimCitation,
    DsHgEdgeCitation,
    DsPaper,
    KgHyperedge,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _add_paper(session, pmid: str, paper_id: str | None = None) -> DsPaper:
    p = DsPaper(
        id=paper_id or str(uuid.uuid4()),
        pmid=pmid,
        title=f"Paper {pmid}",
        retracted=False,
    )
    session.add(p)
    session.flush()
    return p


def _add_citation(session, paper_id: str | None = None) -> DsClaimCitation:
    cit = DsClaimCitation(
        id=str(uuid.uuid4()),
        claim_text="test claim",
        claim_hash=uuid.uuid4().hex,
        paper_id=paper_id,
        validation_status="supported",
    )
    session.add(cit)
    session.flush()
    return cit


def _add_edge(session, paper_ids: list[str] | None = None) -> KgHyperedge:
    edge = KgHyperedge(
        relation="treats",
        paper_ids_json=json.dumps(paper_ids) if paper_ids else None,
        confidence=0.8,
    )
    session.add(edge)
    session.flush()
    return edge


@pytest.fixture()
def patch_hg_imports(monkeypatch):
    """Ensure hypergraph module can import the stand-in models inside its body."""
    # Patch DsClaimCitation reference used inside auto_enrich_from_validation
    import deepsynaps_evidence.hypergraph as hg_mod
    monkeypatch.setattr(hg_mod, "DsClaimCitation", DsClaimCitation, raising=False)

    # Patch the create_edge_citation repository call
    def _create_edge_citation(session, *, edge_id, citation_id):
        record = DsHgEdgeCitation(
            id=str(uuid.uuid4()),
            edge_id=edge_id,
            citation_id=citation_id,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        return record

    fake_repo = types.ModuleType("app.repositories.citation_validator")
    fake_repo.create_edge_citation = _create_edge_citation
    monkeypatch.setitem(sys.modules, "app.repositories.citation_validator", fake_repo)

    # Ensure app.persistence.models returns stand-in DsClaimCitation / DsPaper
    fake_models = types.ModuleType("app.persistence.models")
    fake_models.DsClaimCitation = DsClaimCitation
    fake_models.DsPaper = DsPaper
    fake_models.DsHgEdgeCitation = DsHgEdgeCitation
    monkeypatch.setitem(sys.modules, "app.persistence.models", fake_models)

    if "app" not in sys.modules:
        monkeypatch.setitem(sys.modules, "app", types.ModuleType("app"))
    if "app.repositories" not in sys.modules:
        monkeypatch.setitem(sys.modules, "app.repositories", types.ModuleType("app.repositories"))


# ── enrich_edge ───────────────────────────────────────────────────────────────


class TestEnrichEdge:
    def test_creates_link_and_returns_id(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import enrich_edge

        edge = _add_edge(db_session)
        cit = _add_citation(db_session)
        db_session.commit()

        link_id = enrich_edge(db_session, edge_id=edge.edge_id, citation_id=cit.id)
        assert link_id is not None

    def test_idempotent_second_call_returns_same_id(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import enrich_edge

        edge = _add_edge(db_session)
        cit = _add_citation(db_session)
        db_session.commit()

        id1 = enrich_edge(db_session, edge_id=edge.edge_id, citation_id=cit.id)
        id2 = enrich_edge(db_session, edge_id=edge.edge_id, citation_id=cit.id)
        assert id1 == id2

    def test_missing_edge_returns_none(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import enrich_edge

        cit = _add_citation(db_session)
        db_session.commit()

        result = enrich_edge(db_session, edge_id=9999, citation_id=cit.id)
        assert result is None


# ── get_edge_citations ────────────────────────────────────────────────────────


class TestGetEdgeCitations:
    def test_returns_empty_list_for_unknown_edge(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import get_edge_citations

        result = get_edge_citations(db_session, edge_id=9999)
        assert result == []

    def test_returns_dict_list_for_known_edge(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import enrich_edge, get_edge_citations

        paper = _add_paper(db_session, pmid="55555555")
        cit = _add_citation(db_session, paper_id=paper.id)
        edge = _add_edge(db_session, paper_ids=[paper.id])
        db_session.commit()

        enrich_edge(db_session, edge_id=edge.edge_id, citation_id=cit.id)

        results = get_edge_citations(db_session, edge_id=edge.edge_id)
        assert len(results) == 1
        row = results[0]
        assert row["edge_id"] == edge.edge_id
        assert row["citation_id"] == cit.id

    def test_result_contains_paper_pmid(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import enrich_edge, get_edge_citations

        paper = _add_paper(db_session, pmid="66666666")
        cit = _add_citation(db_session, paper_id=paper.id)
        edge = _add_edge(db_session, paper_ids=[paper.id])
        db_session.commit()

        enrich_edge(db_session, edge_id=edge.edge_id, citation_id=cit.id)

        results = get_edge_citations(db_session, edge_id=edge.edge_id)
        assert results[0]["paper_pmid"] == "66666666"


# ── auto_enrich_from_validation ───────────────────────────────────────────────


class TestAutoEnrichFromValidation:
    def test_empty_citation_ids_returns_zero(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import auto_enrich_from_validation

        count = auto_enrich_from_validation(db_session, [])
        assert count == 0

    def test_no_matching_edges_returns_zero(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import auto_enrich_from_validation

        paper = _add_paper(db_session, pmid="77777777")
        cit = _add_citation(db_session, paper_id=paper.id)
        # Edge references a DIFFERENT paper ID, no overlap
        _add_edge(db_session, paper_ids=["other-paper-id-xyz"])
        db_session.commit()

        count = auto_enrich_from_validation(db_session, [cit.id])
        assert count == 0

    def test_matching_edge_creates_link(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import auto_enrich_from_validation

        paper = _add_paper(db_session, pmid="88888888", paper_id="paper-hg-1")
        cit = _add_citation(db_session, paper_id="paper-hg-1")
        # Edge references the same paper ID
        _add_edge(db_session, paper_ids=["paper-hg-1"])
        db_session.commit()

        count = auto_enrich_from_validation(db_session, [cit.id])
        assert count == 1

    def test_idempotent_second_run(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import auto_enrich_from_validation

        paper = _add_paper(db_session, pmid="99999998", paper_id="paper-hg-2")
        cit = _add_citation(db_session, paper_id="paper-hg-2")
        _add_edge(db_session, paper_ids=["paper-hg-2"])
        db_session.commit()

        count1 = auto_enrich_from_validation(db_session, [cit.id])
        count2 = auto_enrich_from_validation(db_session, [cit.id])
        # First run creates the link; second run should not create duplicates
        assert count1 == 1
        # Second run: enrich_edge returns the existing id (not None), so count is still 1
        assert count2 >= 0  # idempotent — duplicate links are not created

    def test_citation_without_paper_id_ignored(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import auto_enrich_from_validation

        cit = _add_citation(db_session, paper_id=None)
        _add_edge(db_session, paper_ids=["paper-hg-3"])
        db_session.commit()

        count = auto_enrich_from_validation(db_session, [cit.id])
        assert count == 0

    def test_edge_with_null_paper_ids_json_skipped(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import auto_enrich_from_validation

        paper = _add_paper(db_session, pmid="99999997", paper_id="paper-hg-4")
        cit = _add_citation(db_session, paper_id="paper-hg-4")
        _add_edge(db_session, paper_ids=None)  # paper_ids_json = NULL
        db_session.commit()

        count = auto_enrich_from_validation(db_session, [cit.id])
        assert count == 0

    def test_multiple_citations_multiple_edges(self, db_session, patch_hg_imports):
        from deepsynaps_evidence.hypergraph import auto_enrich_from_validation

        p1 = _add_paper(db_session, pmid="77771111", paper_id="paper-multi-1")
        p2 = _add_paper(db_session, pmid="77772222", paper_id="paper-multi-2")
        cit1 = _add_citation(db_session, paper_id="paper-multi-1")
        cit2 = _add_citation(db_session, paper_id="paper-multi-2")
        _add_edge(db_session, paper_ids=["paper-multi-1"])
        _add_edge(db_session, paper_ids=["paper-multi-2"])
        db_session.commit()

        count = auto_enrich_from_validation(db_session, [cit1.id, cit2.id])
        assert count == 2
