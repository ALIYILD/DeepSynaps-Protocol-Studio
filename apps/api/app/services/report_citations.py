"""Citation enrichment for report payloads.

Turns either a stored ``LiteraturePaper`` row OR a free-text reference
into a ``CitationRef`` for the structured report payload.

**Never fabricates.** When the input cannot be resolved against the
local library, the resulting ``CitationRef`` is marked
``status="unverified"`` and ``raw_text`` carries the original string —
clinicians are never shown a fake DOI/PMID.

This module is the bridge between the API's persistence layer
(``LiteraturePaper``) and the render-engine's transport schema
(``CitationRef``). Anything that needs to surface a citation in a
report should go through here.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Iterable, Optional

from deepsynaps_render_engine import CitationRef
from sqlalchemy.orm import Session

from app.persistence.models import LiteraturePaper

_logger = logging.getLogger(__name__)

# A loose DOI / PMID detector. We never *call* a network — we only
# detect well-formed identifiers locally. If the corpus lookup misses
# we mark the citation unverified.
_DOI_RE = re.compile(r'\b10\.\d{4,9}/[^\s,;]+', re.IGNORECASE)
_PMID_RE = re.compile(r'\b(?:pmid:?\s*)?(\d{6,9})\b', re.IGNORECASE)


# Map study_type / evidence_grade strings → human-friendly labels for
# the citation block. We do NOT invent grades — if both are missing,
# we leave evidence_level None.
_GRADE_DESCRIPTOR: dict[str, str] = {
    "A": "Grade A · Systematic review / meta-analysis",
    "B": "Grade B · Randomised controlled trial",
    "C": "Grade C · Cohort / observational",
    "D": "Grade D · Case series / expert opinion",
    "E": "Grade E · Pre-clinical / theoretical",
}


def _split_authors(blob: Optional[str]) -> list[str]:
    if not blob:
        return []
    # LiteraturePaper.authors is a free-text string in this schema.
    parts = re.split(r"[;,]\s*", blob)
    return [p.strip() for p in parts if p.strip()]


def citation_from_paper(
    paper: LiteraturePaper,
    *,
    citation_id: str,
    retrieved_at: Optional[str] = None,
) -> CitationRef:
    """Build a verified ``CitationRef`` from a stored ``LiteraturePaper`` row."""
    when = retrieved_at or datetime.now(timezone.utc).isoformat()
    grade = (paper.evidence_grade or "").upper().strip() or None
    evidence_label: Optional[str] = None
    if grade and grade in _GRADE_DESCRIPTOR:
        evidence_label = _GRADE_DESCRIPTOR[grade]
    elif paper.study_type:
        evidence_label = paper.study_type
    return CitationRef(
        citation_id=citation_id,
        title=paper.title or "",
        authors=_split_authors(paper.authors),
        year=paper.year,
        journal=paper.journal,
        doi=paper.doi or None,
        pmid=paper.pubmed_id or None,
        url=paper.url or None,
        evidence_level=evidence_label,
        retrieved_at=when,
        status="verified",
    )


def _lookup_paper(
    db: Session,
    *,
    doi: Optional[str] = None,
    pmid: Optional[str] = None,
) -> Optional[LiteraturePaper]:
    if doi:
        row = db.query(LiteraturePaper).filter_by(doi=doi).first()
        if row:
            return row
    if pmid:
        row = db.query(LiteraturePaper).filter_by(pubmed_id=pmid).first()
        if row:
            return row
    return None


def citation_from_text(
    raw: str,
    *,
    citation_id: str,
    db: Optional[Session] = None,
    retrieved_at: Optional[str] = None,
) -> CitationRef:
    """Build a ``CitationRef`` from a free-text reference string.

    If the string contains a recognisable DOI or PMID **and** a DB
    session is supplied, we try to resolve it against
    ``LiteraturePaper``. If we can't resolve it, we mark the citation
    ``status="unverified"`` and keep the raw text intact.
    """
    raw_clean = (raw or "").strip()
    doi_match = _DOI_RE.search(raw_clean)
    pmid_match = _PMID_RE.search(raw_clean)
    doi = doi_match.group(0) if doi_match else None
    pmid = pmid_match.group(1) if pmid_match else None
    when = retrieved_at or datetime.now(timezone.utc).isoformat()

    if db is not None and (doi or pmid):
        try:
            row = _lookup_paper(db, doi=doi, pmid=pmid)
        except Exception as exc:  # pragma: no cover - defensive log
            _logger.warning("citation_from_text lookup failed: %s", exc)
            row = None
        if row is not None:
            cit = citation_from_paper(row, citation_id=citation_id, retrieved_at=when)
            if not cit.title:
                cit.title = raw_clean
            return cit

    return CitationRef(
        citation_id=citation_id,
        title=raw_clean[:240],
        doi=doi,
        pmid=pmid,
        raw_text=raw_clean,
        retrieved_at=when,
        status="unverified",
    )


def enrich_citations(
    references: Iterable[str | LiteraturePaper],
    *,
    db: Optional[Session] = None,
    start_index: int = 1,
) -> list[CitationRef]:
    """Convert a mixed iterable of references into ``CitationRef`` objects.

    String references that include a DOI/PMID are looked up in
    ``LiteraturePaper`` (if a session is given). Anything that cannot
    be resolved is returned with ``status="unverified"`` and the raw
    text preserved — *never* fabricated.
    """
    out: list[CitationRef] = []
    seen_papers: set[str] = set()
    for i, item in enumerate(references):
        cid = f"C{start_index + i}"
        if isinstance(item, LiteraturePaper):
            if item.id in seen_papers:
                continue
            seen_papers.add(item.id)
            out.append(citation_from_paper(item, citation_id=cid))
        elif isinstance(item, str):
            out.append(citation_from_text(item, citation_id=cid, db=db))
        # Silently ignore other types — caller error, not data error.
    return out


__all__ = [
    "citation_from_paper",
    "citation_from_text",
    "enrich_citations",
]
