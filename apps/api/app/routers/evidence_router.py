"""Evidence router.

Reads from the standalone SQLite evidence database produced by
`services/evidence-pipeline/`. Read-only — this router never writes to
evidence.db. The one write path is `promote-to-library`, which creates a
LiteraturePaper row in the app's primary DB from an evidence paper.

Endpoints
---------
GET  /api/v1/evidence/health                     — counts + DB path
GET  /api/v1/evidence/indications                — list curated indications
GET  /api/v1/evidence/papers                     — search papers (FTS + filters, ranked)
GET  /api/v1/evidence/papers/{paper_id}          — paper detail
GET  /api/v1/evidence/trials                     — ClinicalTrials.gov studies
GET  /api/v1/evidence/trials/{nct_id}            — trial detail (preserves intervention JSON)
GET  /api/v1/evidence/devices                    — FDA device records (PMA/510k/HDE)
POST /api/v1/evidence/papers/{paper_id}/promote-to-library — save as doctor's library entry

Config
------
Set `EVIDENCE_DB_PATH` (defaults to
  `<repo>/services/evidence-pipeline/evidence.db` in local dev;
  `/app/evidence.db` in container). If the DB is missing, every endpoint
returns 503 with a clear message — never a 500 stack trace at a doctor.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.persistence.models import LiteraturePaper


router = APIRouter(prefix="/api/v1/evidence", tags=["Evidence"])


# ── DB handle ─────────────────────────────────────────────────────────────────

def _default_db_path() -> str:
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override:
        return override
    here = Path(__file__).resolve()
    repo_guess = here.parents[4] / "services" / "evidence-pipeline" / "evidence.db"
    if repo_guess.exists():
        return str(repo_guess)
    return "/app/evidence.db"


def _evidence_conn() -> sqlite3.Connection:
    path = _default_db_path()
    if not os.path.exists(path):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Evidence database not found. Run "
                "`python3 services/evidence-pipeline/ingest.py --all` to generate it, "
                "or set EVIDENCE_DB_PATH."
            ),
        )
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = 1")  # defense-in-depth: refuse writes
    return conn


# ── Schemas ───────────────────────────────────────────────────────────────────

class IndicationOut(BaseModel):
    slug: str
    label: str
    modality: str
    condition: str
    evidence_grade: Optional[str] = None
    regulatory: Optional[str] = None


class PaperOut(BaseModel):
    id: int
    pmid: Optional[str] = None
    doi: Optional[str] = None
    openalex_id: Optional[str] = None
    title: Optional[str] = None
    year: Optional[int] = None
    journal: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    pub_types: list[str] = Field(default_factory=list)
    cited_by_count: Optional[int] = None
    is_oa: bool = False
    oa_url: Optional[str] = None
    sources: list[str] = Field(default_factory=list)
    abstract: Optional[str] = None


class TrialOut(BaseModel):
    nct_id: str
    title: Optional[str]
    phase: Optional[str]
    status: Optional[str]
    enrollment: Optional[int]
    sponsor: Optional[str]
    conditions: list[str] = Field(default_factory=list)
    interventions: list[dict] = Field(default_factory=list)
    outcomes: list[dict] = Field(default_factory=list)
    brief_summary: Optional[str] = None
    start_date: Optional[str] = None
    last_update: Optional[str] = None


class DeviceOut(BaseModel):
    kind: str
    number: str
    applicant: Optional[str] = None
    trade_name: Optional[str] = None
    product_code: Optional[str] = None
    decision_date: Optional[str] = None


class HealthOut(BaseModel):
    ok: bool
    db_path: str
    counts: dict[str, int]


class PromoteOut(BaseModel):
    library_id: str
    title: str


# ── Evidence score (mirrors services/evidence-pipeline/query.py) ──────────────

_PUB_TYPE_TIER = {
    "Meta-Analysis": 5, "Systematic Review": 5, "Practice Guideline": 5, "Guideline": 5,
    "Randomized Controlled Trial": 4, "Controlled Clinical Trial": 4,
    "Clinical Trial": 3,
    "Review": 2,
    "Case Reports": 1,
}


def _score(row: sqlite3.Row) -> float:
    pub_types = json.loads(row["pub_types_json"] or "[]")
    tier = max((_PUB_TYPE_TIER.get(pt, 0) for pt in pub_types), default=0)
    cites = row["cited_by_count"] or 0
    year = row["year"] or 0
    oa_bonus = 2 if row["is_oa"] else 0
    return tier * 10 + math.log1p(cites) + (year - 2000) * 0.1 + oa_bonus


def _paper_row_to_out(row: sqlite3.Row, include_abstract: bool = False) -> PaperOut:
    out = PaperOut(
        id=row["id"],
        pmid=row["pmid"],
        doi=row["doi"],
        openalex_id=row["openalex_id"] if "openalex_id" in row.keys() else None,
        title=row["title"],
        year=row["year"],
        journal=row["journal"],
        authors=json.loads(row["authors_json"] or "[]"),
        pub_types=json.loads(row["pub_types_json"] or "[]"),
        cited_by_count=row["cited_by_count"],
        is_oa=bool(row["is_oa"]) if row["is_oa"] is not None else False,
        oa_url=row["oa_url"],
        sources=json.loads(row["sources_json"] or "[]") if "sources_json" in row.keys() else [],
    )
    if include_abstract and "abstract" in row.keys():
        out.abstract = row["abstract"]
    return out


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthOut)
def evidence_health(_: AuthenticatedActor = Depends(get_authenticated_actor)) -> HealthOut:
    conn = _evidence_conn()
    try:
        counts = {
            t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            for t in ("papers", "trials", "devices", "adverse_events", "indications")
        }
    finally:
        conn.close()
    return HealthOut(ok=True, db_path=_default_db_path(), counts=counts)


@router.get("/indications", response_model=list[IndicationOut])
def list_indications(_: AuthenticatedActor = Depends(get_authenticated_actor)) -> list[IndicationOut]:
    conn = _evidence_conn()
    try:
        rows = conn.execute(
            "SELECT slug, label, modality, condition, evidence_grade, regulatory "
            "FROM indications ORDER BY modality, slug"
        ).fetchall()
    finally:
        conn.close()
    return [IndicationOut(**dict(r)) for r in rows]


@router.get("/papers", response_model=list[PaperOut])
def search_papers(
    q: Optional[str] = Query(None, description="FTS5 query over title/abstract."),
    indication: Optional[str] = Query(None, description="Indication slug."),
    grade: Optional[str] = Query(None, regex="^[A-E]$", description="A-E evidence grade filter."),
    oa_only: bool = Query(False, description="Only papers with accessible open-access URLs."),
    limit: int = Query(20, ge=1, le=100),
    _: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[PaperOut]:
    conn = _evidence_conn()
    try:
        where: list[str] = []
        params: list = []
        join = ""
        if indication:
            join = (
                "JOIN paper_indications pi ON pi.paper_id = p.id "
                "JOIN indications i ON i.id = pi.indication_id "
            )
            where.append("i.slug = ?")
            params.append(indication)
            if grade:
                where.append("i.evidence_grade = ?")
                params.append(grade)
        if oa_only:
            where.append("p.is_oa = 1")
        if q:
            join += "JOIN papers_fts f ON f.rowid = p.id "
            where.append("papers_fts MATCH ?")
            params.append(q)

        sql = (
            "SELECT p.id, p.pmid, p.doi, p.openalex_id, p.title, p.year, p.journal, "
            "p.cited_by_count, p.is_oa, p.oa_url, p.pub_types_json, p.authors_json, p.sources_json "
            "FROM papers p " + join
            + (" WHERE " + " AND ".join(where) if where else "")
            + " LIMIT ?"
        )
        params.append(limit * 4)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    ranked = sorted(rows, key=_score, reverse=True)[:limit]
    return [_paper_row_to_out(r) for r in ranked]


@router.get("/papers/{paper_id}", response_model=PaperOut)
def get_paper(
    paper_id: int = PathParam(..., ge=1),
    _: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PaperOut:
    conn = _evidence_conn()
    try:
        row = conn.execute(
            "SELECT id, pmid, doi, openalex_id, title, abstract, year, journal, "
            "cited_by_count, is_oa, oa_url, pub_types_json, authors_json, sources_json "
            "FROM papers WHERE id = ?",
            (paper_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="paper not found")
    return _paper_row_to_out(row, include_abstract=True)


@router.get("/trials", response_model=list[TrialOut])
def search_trials(
    indication: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    trial_status: Optional[str] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    _: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[TrialOut]:
    conn = _evidence_conn()
    try:
        where: list[str] = []
        params: list = []
        join = ""
        if indication:
            join = (
                "JOIN trial_indications ti ON ti.trial_id = t.id "
                "JOIN indications i ON i.id = ti.indication_id "
            )
            where.append("i.slug = ?")
            params.append(indication)
        if trial_status:
            where.append("t.status = ?")
            params.append(trial_status)
        if q:
            join += "JOIN trials_fts tf ON tf.rowid = t.id "
            where.append("trials_fts MATCH ?")
            params.append(q)

        sql = (
            "SELECT t.nct_id, t.title, t.phase, t.status, t.enrollment, t.sponsor, "
            "t.conditions_json, t.interventions_json, t.outcomes_json, "
            "t.brief_summary, t.start_date, t.last_update "
            "FROM trials t " + join
            + (" WHERE " + " AND ".join(where) if where else "")
            + " ORDER BY t.last_update DESC LIMIT ?"
        )
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    out: list[TrialOut] = []
    for r in rows:
        out.append(TrialOut(
            nct_id=r["nct_id"], title=r["title"], phase=r["phase"], status=r["status"],
            enrollment=r["enrollment"], sponsor=r["sponsor"],
            conditions=json.loads(r["conditions_json"] or "[]"),
            interventions=json.loads(r["interventions_json"] or "[]"),
            outcomes=json.loads(r["outcomes_json"] or "[]"),
            brief_summary=r["brief_summary"], start_date=r["start_date"], last_update=r["last_update"],
        ))
    return out


@router.get("/trials/{nct_id}", response_model=TrialOut)
def get_trial(nct_id: str, _: AuthenticatedActor = Depends(get_authenticated_actor)) -> TrialOut:
    conn = _evidence_conn()
    try:
        r = conn.execute(
            "SELECT nct_id, title, phase, status, enrollment, sponsor, conditions_json, "
            "interventions_json, outcomes_json, brief_summary, start_date, last_update "
            "FROM trials WHERE nct_id = ?",
            (nct_id,),
        ).fetchone()
    finally:
        conn.close()
    if not r:
        raise HTTPException(status_code=404, detail="trial not found")
    return TrialOut(
        nct_id=r["nct_id"], title=r["title"], phase=r["phase"], status=r["status"],
        enrollment=r["enrollment"], sponsor=r["sponsor"],
        conditions=json.loads(r["conditions_json"] or "[]"),
        interventions=json.loads(r["interventions_json"] or "[]"),
        outcomes=json.loads(r["outcomes_json"] or "[]"),
        brief_summary=r["brief_summary"], start_date=r["start_date"], last_update=r["last_update"],
    )


@router.get("/devices", response_model=list[DeviceOut])
def search_devices(
    indication: Optional[str] = Query(None),
    applicant: Optional[str] = Query(None),
    kind: Optional[str] = Query(None, regex="^(pma|510k|hde|denovo)$"),
    limit: int = Query(30, ge=1, le=200),
    _: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[DeviceOut]:
    conn = _evidence_conn()
    try:
        where: list[str] = []
        params: list = []
        join = ""
        if indication:
            join = (
                "JOIN device_indications di ON di.device_id = d.id "
                "JOIN indications i ON i.id = di.indication_id "
            )
            where.append("i.slug = ?")
            params.append(indication)
        if applicant:
            where.append("d.applicant LIKE ?")
            params.append(f"%{applicant}%")
        if kind:
            where.append("d.kind = ?")
            params.append(kind)

        sql = (
            "SELECT d.kind, d.number, d.applicant, d.trade_name, d.product_code, d.decision_date "
            "FROM devices d " + join
            + (" WHERE " + " AND ".join(where) if where else "")
            + " ORDER BY d.decision_date DESC LIMIT ?"
        )
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    return [DeviceOut(**dict(r)) for r in rows]


@router.post(
    "/papers/{paper_id}/promote-to-library",
    response_model=PromoteOut,
    status_code=status.HTTP_201_CREATED,
)
def promote_to_library(
    paper_id: int,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PromoteOut:
    """Copy one evidence paper into the doctor's Literature Library.

    This is the bridge between the pre-ingested public evidence DB and the
    Studio's user-scoped library. The library row is independent — deleting
    or re-ingesting the evidence DB does not affect it.
    """
    conn = _evidence_conn()
    try:
        row = conn.execute(
            "SELECT p.id, p.pmid, p.doi, p.title, p.abstract, p.year, p.journal, "
            "p.authors_json, p.pub_types_json, p.oa_url, "
            "(SELECT i.modality FROM indications i JOIN paper_indications pi ON pi.indication_id=i.id "
            " WHERE pi.paper_id=p.id LIMIT 1) AS modality, "
            "(SELECT i.condition FROM indications i JOIN paper_indications pi ON pi.indication_id=i.id "
            " WHERE pi.paper_id=p.id LIMIT 1) AS condition, "
            "(SELECT i.evidence_grade FROM indications i JOIN paper_indications pi ON pi.indication_id=i.id "
            " WHERE pi.paper_id=p.id LIMIT 1) AS evidence_grade "
            "FROM papers p WHERE p.id = ?",
            (paper_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="paper not found")

    pub_types = json.loads(row["pub_types_json"] or "[]")
    study_type = None
    for pt in pub_types:
        if pt in {"Randomized Controlled Trial", "Meta-Analysis", "Systematic Review",
                  "Practice Guideline", "Review", "Case Reports", "Clinical Trial"}:
            study_type = pt
            break

    authors_list = json.loads(row["authors_json"] or "[]")
    authors_str = ", ".join(authors_list) if authors_list else None

    lib = LiteraturePaper(
        id=str(uuid.uuid4()),
        added_by=actor.actor_id if hasattr(actor, "actor_id") else str(actor),
        title=row["title"] or "(untitled)",
        authors=authors_str,
        journal=row["journal"],
        year=row["year"],
        doi=row["doi"],
        pubmed_id=row["pmid"],
        abstract=row["abstract"],
        modality=row["modality"],
        condition=row["condition"],
        evidence_grade=row["evidence_grade"],
        study_type=study_type,
        tags_json=json.dumps(["promoted-from-evidence"]),
        url=row["oa_url"],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(lib)
    db.commit()
    db.refresh(lib)
    return PromoteOut(library_id=lib.id, title=lib.title)
