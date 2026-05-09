"""Repository-level tests for app.repositories.citation_validator.

Pins CRUD behaviour for DsPaper, DsClaimCitation, DsGroundingAudit,
and DsHgEdgeCitation tables against in-memory SQLite.
All tests rely on the isolated_database autouse fixture from conftest.py.
"""
from __future__ import annotations

import uuid


def _db():
    from app.database import SessionLocal
    return SessionLocal()


# ── DsPaper ───────────────────────────────────────────────────────────────────


def test_upsert_paper_creates_new_row():
    from app.repositories.citation_validator import upsert_paper, get_paper_by_pmid

    db = _db()
    try:
        paper = upsert_paper(
            db,
            pmid="12345678",
            doi="10.1000/xyz001",
            title="TMS for Depression: A Meta-Analysis",
            abstract="We reviewed the evidence...",
            year=2022,
            journal="Journal of Neuropsychiatry",
            is_oa=True,
            retracted=False,
            evidence_type="rct",
            grade="A",
        )
        assert paper.pmid == "12345678"
        assert paper.title == "TMS for Depression: A Meta-Analysis"

        fetched = get_paper_by_pmid(db, "12345678")
        assert fetched is not None
        assert fetched.id == paper.id
    finally:
        db.close()


def test_upsert_paper_updates_existing_by_pmid():
    from app.repositories.citation_validator import upsert_paper, get_paper_by_pmid

    db = _db()
    try:
        upsert_paper(db, pmid="99991111", title="Original Title")
        updated = upsert_paper(db, pmid="99991111", title="Updated Title", year=2023)

        fetched = get_paper_by_pmid(db, "99991111")
        assert fetched.title == "Updated Title"
        assert fetched.year == 2023
    finally:
        db.close()


def test_upsert_paper_fallback_to_doi():
    from app.repositories.citation_validator import upsert_paper, get_paper_by_doi

    db = _db()
    try:
        paper = upsert_paper(db, doi="10.9999/doi-only", title="DOI Only Paper")
        fetched = get_paper_by_doi(db, "10.9999/doi-only")
        assert fetched is not None
        assert fetched.id == paper.id
    finally:
        db.close()


def test_list_papers_and_count():
    from app.repositories.citation_validator import upsert_paper, list_papers, count_papers

    db = _db()
    try:
        before_count = count_papers(db)
        upsert_paper(db, pmid="AAA001", title="Paper A")
        upsert_paper(db, pmid="AAA002", title="Paper B")

        rows = list_papers(db, limit=10, offset=0)
        assert len(rows) >= 2
        assert count_papers(db) == before_count + 2
    finally:
        db.close()


# ── DsClaimCitation ──────────────────────────────────────────────────────────


def test_create_and_get_claim_citation():
    from app.repositories.citation_validator import (
        upsert_paper,
        create_claim_citation,
        get_claim_citation,
    )

    db = _db()
    try:
        paper = upsert_paper(db, pmid="CIT001", title="Cited Paper")
        claim = create_claim_citation(
            db,
            claim_text="TMS improves mood in MDD patients.",
            claim_hash="hash-claim-001",
            paper_id=paper.id,
            citation_type="supports",
            relevance_score=0.92,
            evidence_grade="A",
            validation_status="validated",
        )
        assert claim.claim_hash == "hash-claim-001"
        assert claim.paper_id == paper.id

        fetched = get_claim_citation(db, claim.id)
        assert fetched is not None
        assert fetched.validation_status == "validated"
    finally:
        db.close()


def test_list_claim_citations_by_hash():
    from app.repositories.citation_validator import create_claim_citation, list_claim_citations

    db = _db()
    try:
        target_hash = "specific-hash-abc"
        create_claim_citation(db, claim_text="Claim A", claim_hash=target_hash)
        create_claim_citation(db, claim_text="Claim B", claim_hash=target_hash)
        create_claim_citation(db, claim_text="Claim C", claim_hash="other-hash")

        results = list_claim_citations(db, claim_hash=target_hash)
        assert len(results) == 2
        assert all(r.claim_hash == target_hash for r in results)
    finally:
        db.close()


# ── DsGroundingAudit ─────────────────────────────────────────────────────────


def _make_audit_record(row_hash: str, claim_hash: str = "test-claim"):
    from app.persistence.models import DsGroundingAudit
    return DsGroundingAudit(
        event_id=str(uuid.uuid4()),
        event_type="validate",
        claim_hash=claim_hash,
        decision="accepted",
        decided_by="actor-clinician-demo",
        row_hash=row_hash,
    )


def test_insert_and_get_latest_audit_hash():
    from app.repositories.citation_validator import (
        insert_audit_record,
        get_latest_audit_hash,
    )

    db = _db()
    try:
        insert_audit_record(db, _make_audit_record("audit-hash-001"))

        latest = get_latest_audit_hash(db)
        assert latest == "audit-hash-001"
    finally:
        db.close()


def test_list_audit_events_ascending():
    from app.repositories.citation_validator import (
        insert_audit_record,
        list_audit_events_ascending,
    )

    db = _db()
    try:
        for i in range(3):
            insert_audit_record(db, _make_audit_record(f"hash-asc-{i:03d}"))

        rows = list_audit_events_ascending(db, limit=10)
        # IDs must be ascending (integer auto-increment)
        ids = [r.id for r in rows]
        assert ids == sorted(ids)
    finally:
        db.close()


# ── DsHgEdgeCitation ─────────────────────────────────────────────────────────


def _seed_hyperedge(db, edge_id: int = 1) -> int:
    """Insert a KgHyperedge row so FK constraint on DsHgEdgeCitation is satisfied."""
    from app.persistence.models import KgHyperedge
    if db.query(KgHyperedge).filter_by(edge_id=edge_id).first() is None:
        db.add(KgHyperedge(edge_id=edge_id, relation="supports"))
        db.commit()
    return edge_id


def test_create_and_get_edge_citations():
    from app.repositories.citation_validator import (
        create_claim_citation,
        create_edge_citation,
        get_edge_citations,
    )

    db = _db()
    try:
        edge_id = _seed_hyperedge(db, edge_id=100)
        cit_a = create_claim_citation(db, claim_text="Edge A", claim_hash="edge-hash-a-v2")
        cit_b = create_claim_citation(db, claim_text="Edge B", claim_hash="edge-hash-b-v2")

        create_edge_citation(db, edge_id=edge_id, citation_id=cit_a.id)
        create_edge_citation(db, edge_id=edge_id, citation_id=cit_b.id)

        edges = get_edge_citations(db, edge_id)
        cit_ids = {e.citation_id for e in edges}
        assert cit_a.id in cit_ids
        assert cit_b.id in cit_ids
    finally:
        db.close()
