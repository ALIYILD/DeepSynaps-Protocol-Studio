"""Literature Library router.

Endpoints
---------
GET    /api/v1/literature                       — list papers (filterable)
POST   /api/v1/literature                       — add paper to library
GET    /api/v1/literature/{id}                  — get paper detail
POST   /api/v1/literature/tag-protocol          — tag paper to protocol
GET    /api/v1/literature/reading-list          — user's reading list
POST   /api/v1/literature/reading-list/{id}     — add to reading list
DELETE /api/v1/literature/reading-list/{id}     — remove from reading list
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import LiteraturePaper, LiteratureProtocolTag, LiteratureReadingList

router = APIRouter(prefix="/api/v1/literature", tags=["Literature Library"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class PaperCreate(BaseModel):
    title: str
    authors: Optional[str] = None
    journal: Optional[str] = None
    year: Optional[int] = None
    doi: Optional[str] = None
    pubmed_id: Optional[str] = None
    abstract: Optional[str] = None
    modality: Optional[str] = None
    condition: Optional[str] = None
    evidence_grade: Optional[str] = None   # A, B, C, D, E
    study_type: Optional[str] = None       # RCT, meta-analysis, cohort, case-series, case-report
    tags: list[str] = []
    url: Optional[str] = None


class PaperOut(BaseModel):
    id: str
    added_by: str
    title: str
    authors: Optional[str]
    journal: Optional[str]
    year: Optional[int]
    doi: Optional[str]
    pubmed_id: Optional[str]
    abstract: Optional[str]
    modality: Optional[str]
    condition: Optional[str]
    evidence_grade: Optional[str]
    study_type: Optional[str]
    tags: list[str]
    url: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: LiteraturePaper) -> "PaperOut":
        tags: list[str] = []
        try:
            tags = json.loads(r.tags_json or "[]")
        except Exception:
            pass
        def _dt(v) -> str:
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            added_by=r.added_by,
            title=r.title,
            authors=r.authors,
            journal=r.journal,
            year=r.year,
            doi=r.doi,
            pubmed_id=r.pubmed_id,
            abstract=r.abstract,
            modality=r.modality,
            condition=r.condition,
            evidence_grade=r.evidence_grade,
            study_type=r.study_type,
            tags=tags,
            url=r.url,
            created_at=_dt(r.created_at),
            updated_at=_dt(r.updated_at),
        )


class PaperListResponse(BaseModel):
    items: list[PaperOut]
    total: int


class TagProtocolRequest(BaseModel):
    paper_id: str
    protocol_id: str


class TagProtocolResponse(BaseModel):
    id: str
    paper_id: str
    protocol_id: str
    tagged_by: str
    created_at: str


class ReadingListEntry(BaseModel):
    id: str
    user_id: str
    paper_id: str
    paper: Optional[PaperOut]
    notes: Optional[str]
    read_at: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: LiteratureReadingList, paper: Optional[LiteraturePaper] = None) -> "ReadingListEntry":
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            user_id=r.user_id,
            paper_id=r.paper_id,
            paper=PaperOut.from_record(paper) if paper else None,
            notes=r.notes,
            read_at=_dt(r.read_at),
            created_at=_dt(r.created_at),
        )


class ReadingListResponse(BaseModel):
    items: list[ReadingListEntry]
    total: int


class ReadingListAddRequest(BaseModel):
    notes: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_paper_or_404(db: Session, paper_id: str) -> LiteraturePaper:
    paper = db.query(LiteraturePaper).filter_by(id=paper_id).first()
    if paper is None:
        raise ApiServiceError(code="not_found", message="Paper not found.", status_code=404)
    return paper


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/reading-list", response_model=ReadingListResponse)
def get_reading_list(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReadingListResponse:
    require_minimum_role(actor, "clinician")
    entries = (
        db.query(LiteratureReadingList)
        .filter(LiteratureReadingList.user_id == actor.actor_id)
        .order_by(LiteratureReadingList.created_at.desc())
        .all()
    )
    items: list[ReadingListEntry] = []
    for entry in entries:
        paper = db.query(LiteraturePaper).filter_by(id=entry.paper_id).first()
        items.append(ReadingListEntry.from_record(entry, paper))
    return ReadingListResponse(items=items, total=len(items))


@router.post("/reading-list/{paper_id}", response_model=ReadingListEntry, status_code=201)
def add_to_reading_list(
    paper_id: str,
    body: ReadingListAddRequest = ReadingListAddRequest(),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReadingListEntry:
    require_minimum_role(actor, "clinician")
    paper = _get_paper_or_404(db, paper_id)
    # Idempotent: don't add duplicate entries
    existing = (
        db.query(LiteratureReadingList)
        .filter_by(user_id=actor.actor_id, paper_id=paper_id)
        .first()
    )
    if existing:
        return ReadingListEntry.from_record(existing, paper)
    entry = LiteratureReadingList(
        user_id=actor.actor_id,
        paper_id=paper_id,
        notes=body.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return ReadingListEntry.from_record(entry, paper)


@router.delete("/reading-list/{paper_id}", status_code=204)
def remove_from_reading_list(
    paper_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    entry = (
        db.query(LiteratureReadingList)
        .filter_by(user_id=actor.actor_id, paper_id=paper_id)
        .first()
    )
    if entry is None:
        raise ApiServiceError(code="not_found", message="Reading list entry not found.", status_code=404)
    db.delete(entry)
    db.commit()


@router.get("", response_model=PaperListResponse)
def list_papers(
    modality: Optional[str] = Query(default=None),
    condition: Optional[str] = Query(default=None),
    year_min: Optional[int] = Query(default=None),
    year_max: Optional[int] = Query(default=None),
    evidence_grade: Optional[str] = Query(default=None),
    study_type: Optional[str] = Query(default=None),
    q_text: Optional[str] = Query(default=None, description="Free-text search on title/abstract"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PaperListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(LiteraturePaper)
    if modality:
        q = q.filter(LiteraturePaper.modality.ilike(f"%{modality}%"))
    if condition:
        q = q.filter(LiteraturePaper.condition.ilike(f"%{condition}%"))
    if year_min is not None:
        q = q.filter(LiteraturePaper.year >= year_min)
    if year_max is not None:
        q = q.filter(LiteraturePaper.year <= year_max)
    if evidence_grade:
        q = q.filter(LiteraturePaper.evidence_grade == evidence_grade.upper())
    if study_type:
        q = q.filter(LiteraturePaper.study_type.ilike(f"%{study_type}%"))
    if q_text:
        search_term = f"%{q_text}%"
        q = q.filter(
            LiteraturePaper.title.ilike(search_term) |
            LiteraturePaper.abstract.ilike(search_term)
        )
    records = q.order_by(LiteraturePaper.year.desc(), LiteraturePaper.created_at.desc()).all()
    items = [PaperOut.from_record(r) for r in records]
    return PaperListResponse(items=items, total=len(items))


@router.post("", response_model=PaperOut, status_code=201)
def add_paper(
    body: PaperCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PaperOut:
    require_minimum_role(actor, "clinician")
    paper = LiteraturePaper(
        added_by=actor.actor_id,
        title=body.title.strip(),
        authors=body.authors,
        journal=body.journal,
        year=body.year,
        doi=body.doi,
        pubmed_id=body.pubmed_id,
        abstract=body.abstract,
        modality=body.modality,
        condition=body.condition,
        evidence_grade=body.evidence_grade.upper() if body.evidence_grade else None,
        study_type=body.study_type,
        tags_json=json.dumps(body.tags),
        url=body.url,
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    return PaperOut.from_record(paper)


@router.get("/{paper_id}", response_model=PaperOut)
def get_paper(
    paper_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PaperOut:
    require_minimum_role(actor, "clinician")
    paper = _get_paper_or_404(db, paper_id)
    return PaperOut.from_record(paper)


@router.post("/tag-protocol", response_model=TagProtocolResponse, status_code=201)
def tag_paper_to_protocol(
    body: TagProtocolRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TagProtocolResponse:
    require_minimum_role(actor, "clinician")
    _get_paper_or_404(db, body.paper_id)  # verify paper exists
    # Idempotent
    existing = (
        db.query(LiteratureProtocolTag)
        .filter_by(paper_id=body.paper_id, protocol_id=body.protocol_id)
        .first()
    )
    if existing:
        return TagProtocolResponse(
            id=existing.id,
            paper_id=existing.paper_id,
            protocol_id=existing.protocol_id,
            tagged_by=existing.tagged_by,
            created_at=existing.created_at.isoformat(),
        )
    tag = LiteratureProtocolTag(
        paper_id=body.paper_id,
        protocol_id=body.protocol_id,
        tagged_by=actor.actor_id,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return TagProtocolResponse(
        id=tag.id,
        paper_id=tag.paper_id,
        protocol_id=tag.protocol_id,
        tagged_by=tag.tagged_by,
        created_at=tag.created_at.isoformat(),
    )
