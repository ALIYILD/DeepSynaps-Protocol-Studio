"""Corpus adapter — pgvector ANN search and text-search fallback.

This module is the PubMed Entrez swap point described in
``evidence_citation_validator.md`` section 5.5. The primary retrieval
path is pgvector cosine similarity; the secondary path is SQL LIKE
full-text search for environments without pgvector (SQLite dev/test).

All functions take a sync SQLAlchemy ``Session``.
"""
from __future__ import annotations

import json
import logging

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from deepsynaps_evidence.schemas import Citation

_log = logging.getLogger(__name__)


def _import_models():
    from app.persistence.models import DsPaper
    return DsPaper


def _paper_to_citation(paper, relevance_score: float = 0.0) -> Citation:
    """Convert a DsPaper ORM row to a Citation schema."""
    authors_short = ""
    if paper.authors_json:
        try:
            authors = json.loads(paper.authors_json)
            if isinstance(authors, list):
                authors_short = ", ".join(authors[:3])
                if len(authors) > 3:
                    authors_short += ", et al."
        except (json.JSONDecodeError, TypeError):
            pass

    return Citation(
        paper_id=paper.id,
        pmid=paper.pmid,
        doi=paper.doi,
        title=paper.title or "",
        authors_short=authors_short,
        year=paper.year,
        journal=paper.journal,
        evidence_grade=paper.grade,
        relevance_score=relevance_score,
        retracted=paper.retracted,
    )


# ── Exact lookups ────────────────────────────────────────────────────────────

def find_by_pmid(session: Session, pmid: str) -> Citation | None:
    """Exact PMID lookup. Returns None if absent (fabrication signal)."""
    DsPaper = _import_models()
    paper = session.scalar(select(DsPaper).where(DsPaper.pmid == pmid))
    if paper is None:
        return None
    return _paper_to_citation(paper, relevance_score=1.0)


def is_retracted(session: Session, pmid: str) -> bool:
    """Check retraction status by PMID. Returns False if PMID not found."""
    DsPaper = _import_models()
    paper = session.scalar(select(DsPaper).where(DsPaper.pmid == pmid))
    if paper is None:
        return False
    return bool(paper.retracted)


def bulk_verify_pmids(session: Session, pmids: list[str]) -> dict[str, bool]:
    """Verify which PMIDs exist in the corpus.

    Returns ``{pmid: True/False}`` — False means fabricated.
    """
    if not pmids:
        return {}
    DsPaper = _import_models()
    existing = set(
        session.scalars(
            select(DsPaper.pmid).where(DsPaper.pmid.in_(pmids))
        ).all()
    )
    return {pmid: (pmid in existing) for pmid in pmids}


# ── pgvector ANN search ─────────────────────────────────────────────────────

def find_similar(
    session: Session,
    query_embedding: list[float],
    *,
    top_k: int = 20,
    min_score: float = 0.15,
    evidence_levels: list[str] | None = None,
    max_age_years: int | None = None,
) -> list[Citation]:
    """ANN search over ds_papers using pgvector cosine similarity.

    Returns up to ``top_k`` non-retracted papers sorted by relevance DESC.
    On SQLite / when pgvector is unavailable, returns ``[]``.
    """
    DsPaper = _import_models()

    # Check dialect — pgvector only works on Postgres
    bind = session.get_bind()
    if bind.dialect.name != "postgresql":
        return []

    try:
        from app.services.pgvector_bridge import cosine_similar
    except ImportError:
        _log.debug("pgvector_bridge not available")
        return []

    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context — run sync
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                results = pool.submit(
                    asyncio.run,
                    cosine_similar("ds_papers", "embedding", query_embedding, k=top_k * 2, db_session=session)
                ).result()
        else:
            results = asyncio.run(
                cosine_similar("ds_papers", "embedding", query_embedding, k=top_k * 2, db_session=session)
            )
    except Exception as exc:
        _log.warning("pgvector ANN search failed: %s", exc)
        return []

    if not results:
        return []

    # Fetch full paper rows for the matching IDs
    paper_ids = [r["id"] for r in results]
    sim_map = {r["id"]: r["similarity"] for r in results}

    papers = list(
        session.scalars(
            select(DsPaper).where(
                DsPaper.id.in_(paper_ids),
                DsPaper.retracted == False,  # noqa: E712
            )
        ).all()
    )

    # Post-filter
    citations = []
    for paper in papers:
        sim = sim_map.get(paper.id, 0.0)
        if sim < min_score:
            continue
        if evidence_levels and paper.evidence_level not in evidence_levels:
            continue
        if max_age_years and paper.year:
            from datetime import datetime, timezone
            current_year = datetime.now(timezone.utc).year
            if current_year - paper.year > max_age_years:
                continue
        citations.append(_paper_to_citation(paper, relevance_score=sim))

    citations.sort(key=lambda c: c.relevance_score, reverse=True)
    return citations[:top_k]


# ── Text search fallback ────────────────────────────────────────────────────

def find_similar_text(
    session: Session,
    query_text: str,
    *,
    top_k: int = 20,
) -> list[Citation]:
    """SQL LIKE-based text search fallback for SQLite environments.

    Searches ``ds_papers.title`` and ``ds_papers.abstract`` using
    keyword matching. Returns non-retracted papers only.
    """
    DsPaper = _import_models()

    if not query_text or not query_text.strip():
        return []

    # Extract keywords (3+ chars, deduplicated)
    words = list({
        w.lower()
        for w in query_text.split()
        if len(w) >= 3
    })
    if not words:
        return []

    # Build OR condition — paper must match at least one keyword
    # in either title or abstract
    conditions = []
    for word in words[:10]:  # cap at 10 keywords to bound query complexity
        pattern = f"%{word}%"
        conditions.append(DsPaper.title.ilike(pattern))
        conditions.append(DsPaper.abstract.ilike(pattern))

    stmt = (
        select(DsPaper)
        .where(
            or_(*conditions),
            DsPaper.retracted == False,  # noqa: E712
        )
        .limit(top_k * 3)  # over-fetch for scoring
    )

    papers = list(session.scalars(stmt).all())

    # Score by keyword overlap
    scored: list[tuple[float, object]] = []
    for paper in papers:
        text_blob = (
            (paper.title or "").lower() + " " + (paper.abstract or "").lower()
        )
        hits = sum(1 for w in words if w in text_blob)
        score = hits / len(words) if words else 0.0
        scored.append((score, paper))

    scored.sort(key=lambda t: t[0], reverse=True)
    return [
        _paper_to_citation(paper, relevance_score=score)
        for score, paper in scored[:top_k]
    ]


# ── Upsert helper ───────────────────────────────────────────────────────────

def upsert_paper(session: Session, **fields) -> str:
    """Insert or update a paper by natural key. Returns paper_id."""
    from app.repositories.citation_validator import upsert_paper as _repo_upsert
    paper = _repo_upsert(session, **fields)
    return paper.id
