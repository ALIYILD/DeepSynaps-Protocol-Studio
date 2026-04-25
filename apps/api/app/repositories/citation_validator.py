"""CRUD repository for Evidence Citation Validator tables.

Module-level functions following the pattern established in
``repositories/audit.py`` and ``repositories/patients.py``.
"""
from __future__ import annotations

import json
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import (
    DsClaimCitation,
    DsGroundingAudit,
    DsHgEdgeCitation,
    DsPaper,
)


# ── DsPaper ──────────────────────────────────────────────────────────────────

def upsert_paper(
    session: Session,
    *,
    pmid: str | None = None,
    doi: str | None = None,
    title: str | None = None,
    abstract: str | None = None,
    year: int | None = None,
    journal: str | None = None,
    authors_json: str | None = None,
    pub_types_json: str | None = None,
    cited_by_count: int | None = None,
    is_oa: bool = False,
    oa_url: str | None = None,
    sources_json: str | None = None,
    evidence_type: str | None = None,
    evidence_level: str | None = None,
    grade: str | None = None,
    retracted: bool = False,
    openalex_id: str | None = None,
) -> DsPaper:
    """Insert or update a paper by natural key (pmid first, then doi)."""
    existing = None
    if pmid:
        existing = session.scalar(select(DsPaper).where(DsPaper.pmid == pmid))
    if existing is None and doi:
        existing = session.scalar(select(DsPaper).where(DsPaper.doi == doi))

    if existing is not None:
        # Update mutable fields
        for attr, val in [
            ("title", title), ("abstract", abstract), ("year", year),
            ("journal", journal), ("authors_json", authors_json),
            ("pub_types_json", pub_types_json), ("cited_by_count", cited_by_count),
            ("is_oa", is_oa), ("oa_url", oa_url), ("sources_json", sources_json),
            ("evidence_type", evidence_type), ("evidence_level", evidence_level),
            ("grade", grade), ("retracted", retracted), ("openalex_id", openalex_id),
        ]:
            if val is not None:
                setattr(existing, attr, val)
        session.commit()
        session.refresh(existing)
        return existing

    paper = DsPaper(
        id=str(uuid.uuid4()),
        pmid=pmid,
        doi=doi,
        openalex_id=openalex_id,
        title=title,
        abstract=abstract,
        year=year,
        journal=journal,
        authors_json=authors_json,
        pub_types_json=pub_types_json,
        cited_by_count=cited_by_count,
        is_oa=is_oa,
        oa_url=oa_url,
        sources_json=sources_json,
        evidence_type=evidence_type,
        evidence_level=evidence_level,
        grade=grade,
        retracted=retracted,
    )
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def get_paper_by_pmid(session: Session, pmid: str) -> DsPaper | None:
    return session.scalar(select(DsPaper).where(DsPaper.pmid == pmid))


def get_paper_by_doi(session: Session, doi: str) -> DsPaper | None:
    return session.scalar(select(DsPaper).where(DsPaper.doi == doi))


def get_paper(session: Session, paper_id: str) -> DsPaper | None:
    return session.get(DsPaper, paper_id)


def list_papers(
    session: Session,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[DsPaper]:
    return list(
        session.scalars(
            select(DsPaper).order_by(DsPaper.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )


def count_papers(session: Session) -> int:
    return session.query(DsPaper).count()


def count_papers_with_embeddings(session: Session) -> int:
    return session.query(DsPaper).filter(DsPaper.embedding_json.isnot(None)).count()


# ── DsClaimCitation ──────────────────────────────────────────────────────────

def create_claim_citation(
    session: Session,
    *,
    claim_text: str,
    claim_hash: str,
    paper_id: str | None = None,
    citation_type: str = "supports",
    relevance_score: float | None = None,
    evidence_grade: str | None = None,
    supporting_quote: str | None = None,
    confidence: float | None = None,
    validation_status: str = "pending",
    issues: list[dict] | None = None,
    actor_id: str | None = None,
    validator_version: str | None = None,
) -> DsClaimCitation:
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


def get_claim_citation(session: Session, citation_id: str) -> DsClaimCitation | None:
    return session.get(DsClaimCitation, citation_id)


def list_claim_citations(
    session: Session,
    *,
    claim_hash: Optional[str] = None,
    limit: int = 50,
) -> list[DsClaimCitation]:
    stmt = select(DsClaimCitation).order_by(DsClaimCitation.created_at.desc())
    if claim_hash:
        stmt = stmt.where(DsClaimCitation.claim_hash == claim_hash)
    return list(session.scalars(stmt.limit(limit)).all())


# ── DsGroundingAudit ─────────────────────────────────────────────────────────

def get_latest_audit_hash(session: Session) -> str | None:
    row = session.scalar(
        select(DsGroundingAudit.row_hash)
        .order_by(DsGroundingAudit.id.desc())
        .limit(1)
    )
    return row


def insert_audit_record(session: Session, record: DsGroundingAudit) -> DsGroundingAudit:
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def list_audit_events(
    session: Session,
    *,
    claim_hash: Optional[str] = None,
    limit: int = 100,
) -> list[DsGroundingAudit]:
    stmt = select(DsGroundingAudit).order_by(DsGroundingAudit.id.desc())
    if claim_hash:
        stmt = stmt.where(DsGroundingAudit.claim_hash == claim_hash)
    return list(session.scalars(stmt.limit(limit)).all())


def list_audit_events_ascending(
    session: Session,
    *,
    limit: int = 100,
) -> list[DsGroundingAudit]:
    """Return audit events in insertion order (for chain verification)."""
    stmt = select(DsGroundingAudit).order_by(DsGroundingAudit.id.asc()).limit(limit)
    return list(session.scalars(stmt).all())


# ── DsHgEdgeCitation ─────────────────────────────────────────────────────────

def create_edge_citation(
    session: Session,
    *,
    edge_id: int,
    citation_id: str,
) -> DsHgEdgeCitation:
    record = DsHgEdgeCitation(
        id=str(uuid.uuid4()),
        edge_id=edge_id,
        citation_id=citation_id,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_edge_citations(session: Session, edge_id: int) -> list[DsHgEdgeCitation]:
    return list(
        session.scalars(
            select(DsHgEdgeCitation)
            .where(DsHgEdgeCitation.edge_id == edge_id)
            .order_by(DsHgEdgeCitation.enriched_at.desc())
        ).all()
    )
