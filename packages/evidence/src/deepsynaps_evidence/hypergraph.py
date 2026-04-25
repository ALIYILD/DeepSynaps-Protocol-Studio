"""Hypergraph edge enrichment — links validated citations to KG hyperedges.

When a ``ValidationResult`` passes, the validated citations can enrich
the EEG-MedRAG hypergraph by linking papers to entity-pair hyperedges.
This module implements that linkage as described in
``evidence_citation_validator.md`` section 7.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

_log = logging.getLogger(__name__)


def _import_models():
    from app.persistence.models import DsHgEdgeCitation, KgHyperedge
    return DsHgEdgeCitation, KgHyperedge


def enrich_edge(
    session: Session,
    *,
    edge_id: int,
    citation_id: str,
) -> str | None:
    """Link a single hyperedge to a claim citation.

    Returns the ``DsHgEdgeCitation.id`` on success, or ``None`` if
    the link already exists (idempotent).
    """
    DsHgEdgeCitation, KgHyperedge = _import_models()

    # Check the edge exists
    edge = session.get(KgHyperedge, edge_id)
    if edge is None:
        _log.warning("Hyperedge %d not found; skipping enrichment", edge_id)
        return None

    # Check for existing link (idempotent)
    existing = session.scalar(
        select(DsHgEdgeCitation).where(
            DsHgEdgeCitation.edge_id == edge_id,
            DsHgEdgeCitation.citation_id == citation_id,
        )
    )
    if existing is not None:
        return existing.id

    from app.repositories.citation_validator import create_edge_citation
    record = create_edge_citation(session, edge_id=edge_id, citation_id=citation_id)
    return record.id


def get_edge_citations(session: Session, edge_id: int) -> list[dict]:
    """Return all citation records linked to a hyperedge."""
    DsHgEdgeCitation, _ = _import_models()
    from app.persistence.models import DsClaimCitation, DsPaper

    records = list(
        session.scalars(
            select(DsHgEdgeCitation).where(DsHgEdgeCitation.edge_id == edge_id)
        ).all()
    )

    result = []
    for rec in records:
        citation = session.get(DsClaimCitation, rec.citation_id)
        paper = session.get(DsPaper, citation.paper_id) if citation and citation.paper_id else None
        result.append({
            "edge_citation_id": rec.id,
            "edge_id": rec.edge_id,
            "citation_id": rec.citation_id,
            "claim_hash": citation.claim_hash if citation else None,
            "paper_pmid": paper.pmid if paper else None,
            "paper_title": paper.title if paper else None,
            "enriched_at": rec.enriched_at.isoformat() if rec.enriched_at else None,
        })
    return result


def auto_enrich_from_validation(
    session: Session,
    citation_ids: list[str],
) -> int:
    """Link validated citations to matching KG hyperedges.

    For each ``DsClaimCitation`` whose ``paper_id`` appears in any
    ``KgHyperedge.paper_ids_json``, creates a ``DsHgEdgeCitation`` link.

    Returns the number of new links created.
    """
    import json
    DsHgEdgeCitation, KgHyperedge = _import_models()
    from app.persistence.models import DsClaimCitation

    if not citation_ids:
        return 0

    # Gather paper_ids from the citations
    citations = list(
        session.scalars(
            select(DsClaimCitation).where(DsClaimCitation.id.in_(citation_ids))
        ).all()
    )
    paper_ids = {c.paper_id for c in citations if c.paper_id}
    if not paper_ids:
        return 0

    # Build a map: paper_id -> citation_ids
    paper_to_citations: dict[str, list[str]] = {}
    for c in citations:
        if c.paper_id:
            paper_to_citations.setdefault(c.paper_id, []).append(c.id)

    # Scan hyperedges for matching paper IDs
    edges = list(session.scalars(select(KgHyperedge)).all())
    created = 0

    for edge in edges:
        if not edge.paper_ids_json:
            continue
        try:
            edge_paper_ids = set(json.loads(edge.paper_ids_json))
        except (json.JSONDecodeError, TypeError):
            continue

        matching = paper_ids & edge_paper_ids
        for pid in matching:
            for cid in paper_to_citations.get(pid, []):
                result = enrich_edge(session, edge_id=edge.edge_id, citation_id=cid)
                if result is not None:
                    created += 1

    return created
