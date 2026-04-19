"""Library Hub router — aggregates condition, device, package, and evidence
state behind a single page-scoped API for the Studio's Library page.

Design principles
-----------------
1. Separation of trust levels. Every item carries `source_trust` and
   `review_status` fields so the UI can show curated vs unreviewed clearly.
   - `source_trust`: 'curated' (registry CSV / evidence.db ingested) |
                      'external_raw' (live broker fetch, not reviewed)
   - `review_status`: 'approved' | 'pending' | 'draft'

2. No frontend scraping. External evidence search is brokered here. The
   frontend never calls PubMed / OpenAlex / FDA directly.

3. AI outputs are drafts, never truth. `ai_summarize_evidence` returns a
   draft payload that cites source paper IDs from the curated DB. It does
   NOT write to any curated table. Promotion to the reviewed library is a
   separate, explicit clinician action via `/api/v1/literature` POST.

4. Evidence-backed eligibility. "Neuromod eligible" is computed from the
   presence of at least one reviewed protocol with evidence grade A or B.
   No marketing flags.
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.logging_setup import get_logger
from app.persistence.models import LiteraturePaper
from app.services.chat_service import chat_clinician
from app.services.registries import (
    get_condition,
    get_condition_package,
    get_protocols_for_condition,
    list_condition_package_slugs,
    list_conditions,
    list_devices,
)

router = APIRouter(prefix="/api/v1/library", tags=["Library"])
_logger = get_logger("library_router")


# ── Trust & review constants ────────────────────────────────────────────────

_HIGH_EVIDENCE_GRADES = {"A", "B", "EV-A", "EV-B"}
_REVIEWED_STATUSES = {"reviewed", "approved", "published", "active"}


def _is_reviewed(status: Optional[str]) -> bool:
    if not status:
        return False
    return status.strip().lower() in _REVIEWED_STATUSES


def _grade_rank(grade: Optional[str]) -> int:
    if not grade:
        return 0
    g = grade.strip().upper().replace("EV-", "")
    return {"A": 4, "B": 3, "C": 2, "D": 1, "E": 0}.get(g, 0)


def _top_grade(grades: list[Optional[str]]) -> Optional[str]:
    best_rank = 0
    best = None
    for g in grades:
        r = _grade_rank(g)
        if r > best_rank:
            best_rank = r
            best = (g or "").strip().upper().replace("EV-", "")
    return best


def _actor_id(actor: AuthenticatedActor) -> str:
    return getattr(actor, "actor_id", None) or getattr(actor, "email", None) or str(actor)


def _audit(event: str, actor: AuthenticatedActor, **extra) -> None:
    payload = {"actor_id": _actor_id(actor), "event": event, **extra}
    _logger.info(f"library.{event}", extra=payload)


# ── Evidence DB helpers (READ-ONLY) ─────────────────────────────────────────

def _evidence_db_path() -> Optional[str]:
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override and os.path.exists(override):
        return override
    here = Path(__file__).resolve()
    guess = here.parents[4] / "services" / "evidence-pipeline" / "evidence.db"
    if guess.exists():
        return str(guess)
    fallback = "/app/evidence.db"
    if os.path.exists(fallback):
        return fallback
    return None


def _evidence_conn_or_none() -> Optional[sqlite3.Connection]:
    path = _evidence_db_path()
    if not path:
        return None
    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only = 1")
        return conn
    except sqlite3.Error:
        return None


def _papers_for_condition(conn: sqlite3.Connection, condition_label: str) -> int:
    """Count ingested papers whose indication matches the condition name.

    Matching is case-insensitive substring because registry Condition_Name
    labels and evidence indication labels are not harmonised yet.
    """
    try:
        row = conn.execute(
            "SELECT count(DISTINCT p.id) FROM papers p "
            "JOIN paper_indications pi ON pi.paper_id = p.id "
            "JOIN indications i ON i.id = pi.indication_id "
            "WHERE lower(i.condition) LIKE ?",
            (f"%{condition_label.lower()}%",),
        ).fetchone()
        return int(row[0]) if row else 0
    except sqlite3.Error:
        return 0


# ── Schemas ─────────────────────────────────────────────────────────────────


class ConditionSummaryOut(BaseModel):
    """Condition card payload for the Library page."""

    id: str
    name: str
    category: Optional[str] = None
    icd_10: Optional[str] = None
    review_status: str = "unknown"
    highest_evidence_level: Optional[str] = None
    # Counts
    reviewed_protocol_count: int = 0
    total_protocol_count: int = 0
    curated_evidence_paper_count: int = 0
    compatible_device_count: int = 0
    assessment_count: int = 0
    # Eligibility (explainable)
    neuromod_eligible: bool = False
    eligibility_reasons: list[str] = Field(default_factory=list)
    eligibility_blockers: list[str] = Field(default_factory=list)
    # Provenance
    source_trust: str = "curated"
    last_reviewed_at: Optional[str] = None
    package_slug: Optional[str] = None
    has_condition_package: bool = False


class LibraryOverviewOut(BaseModel):
    condition_count: int
    reviewed_condition_count: int
    neuromod_eligible_count: int
    device_count: int
    reviewed_device_count: int
    condition_package_count: int
    curated_paper_count: int
    curated_trial_count: int
    evidence_db_available: bool
    generated_at: str
    conditions: list[ConditionSummaryOut]


class ExternalEvidenceItem(BaseModel):
    id: str
    title: str
    year: Optional[int] = None
    journal: Optional[str] = None
    authors: Optional[str] = None
    pub_types: list[str] = Field(default_factory=list)
    url: Optional[str] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    source_trust: str
    review_status: str
    provenance_note: Optional[str] = None


class ExternalSearchRequest(BaseModel):
    q: str = Field(..., min_length=2, max_length=200)
    condition_id: Optional[str] = None
    limit: int = Field(default=15, ge=1, le=50)


class ExternalSearchResponse(BaseModel):
    query: str
    provenance: str
    source_trust: str
    review_status: str
    last_checked_at: str
    items: list[ExternalEvidenceItem]
    notice: str


class AiSummarizeRequest(BaseModel):
    paper_ids: list[int] = Field(..., min_length=1, max_length=25)
    focus: Optional[str] = Field(default=None, max_length=200)


class AiSummarizeDraft(BaseModel):
    status: str = "draft"
    review_status: str = "draft"
    source_trust: str = "ai_generated"
    generated_by: str = "ai"
    generated_at: str
    model_hint: str
    focus: Optional[str] = None
    source_paper_ids: list[int]
    source_citations: list[dict]
    draft_text: str
    reviewer_notice: str


# ── Shared computation ──────────────────────────────────────────────────────


def _summarize_condition(
    cond: dict,
    db: Session,
    ev_conn: Optional[sqlite3.Connection],
    package_slugs: set[str],
) -> ConditionSummaryOut:
    cid = cond.get("id", "")
    name = cond.get("name", "")
    protocols = get_protocols_for_condition(cid)
    reviewed_protocols = [p for p in protocols if _is_reviewed(p.get("review_status"))]
    protocol_grades = [p.get("evidence_grade") for p in reviewed_protocols]
    top = _top_grade(protocol_grades) or cond.get("highest_evidence_level")

    # Paper counts from curated evidence DB (if present)
    papers = _papers_for_condition(ev_conn, name) if ev_conn else 0
    # Literature library — per-clinic curated supplements
    try:
        lit_count = (
            db.query(LiteraturePaper)
            .filter(LiteraturePaper.condition.ilike(f"%{name}%"))
            .count()
        )
    except Exception:
        lit_count = 0

    # Device compatibility: devices whose modality appears in the condition's
    # Relevant_Modalities list. The CSV column is a delimited free-text list
    # (commas, semicolons, slashes, " and ", " or "). We tokenize before
    # comparing to avoid false positives from plain substring matching
    # (e.g. "TMS" matching inside "tDCS/rTMS").
    import re as _re
    rel_raw = (cond.get("relevant_modalities") or "")
    rel_tokens = {t.strip().lower() for t in _re.split(r"[,/;]|\band\b|\bor\b", rel_raw) if t.strip()}
    compat_devices = 0
    if rel_tokens:
        for d in list_devices():
            mod = (d.get("modality") or "").strip().lower()
            if not mod:
                continue
            # Exact or normalised-token match
            if mod in rel_tokens or mod.replace("-", "").replace(" ", "") in {
                t.replace("-", "").replace(" ", "") for t in rel_tokens
            }:
                compat_devices += 1

    # Assessments — derived from package when present
    slug_guess = name.lower().replace(" ", "-")
    has_pkg = slug_guess in package_slugs or cid.lower() in package_slugs
    pkg_slug = slug_guess if slug_guess in package_slugs else (cid.lower() if cid.lower() in package_slugs else None)

    assessment_count = 0
    if pkg_slug:
        pkg = get_condition_package(pkg_slug)
        if pkg:
            # Package shape varies; count best-effort
            for key in ("assessments", "required_assessments", "recommended_assessments"):
                arr = pkg.get(key)
                if isinstance(arr, list):
                    assessment_count = max(assessment_count, len(arr))
            mhr = pkg.get("medical_history_requirements")
            if isinstance(mhr, dict) and isinstance(mhr.get("required_fields"), list):
                assessment_count = max(assessment_count, len(mhr["required_fields"]))

    # Eligibility (explainable)
    reasons: list[str] = []
    blockers: list[str] = []
    has_reviewed_proto = bool(reviewed_protocols)
    has_high_evidence = _grade_rank(top) >= 3  # A or B
    cond_reviewed = _is_reviewed(cond.get("review_status"))

    if has_reviewed_proto:
        reasons.append(f"{len(reviewed_protocols)} reviewed protocol(s)")
    else:
        blockers.append("No reviewed protocol on file")
    if has_high_evidence:
        reasons.append(f"Top evidence grade {top}")
    else:
        blockers.append("Highest evidence grade below B")
    if papers >= 1:
        reasons.append(f"{papers} curated paper(s) indexed")
    if cond_reviewed:
        reasons.append("Condition record reviewed")

    eligible = has_reviewed_proto and has_high_evidence

    return ConditionSummaryOut(
        id=cid,
        name=name,
        category=cond.get("category") or None,
        icd_10=cond.get("icd_10") or cond.get("icd10") or None,
        review_status=(cond.get("review_status") or "unknown").lower() or "unknown",
        highest_evidence_level=top,
        reviewed_protocol_count=len(reviewed_protocols),
        total_protocol_count=len(protocols),
        curated_evidence_paper_count=papers + lit_count,
        compatible_device_count=compat_devices,
        assessment_count=assessment_count,
        neuromod_eligible=eligible,
        eligibility_reasons=reasons,
        eligibility_blockers=blockers,
        source_trust="curated",
        last_reviewed_at=None,
        package_slug=pkg_slug,
        has_condition_package=has_pkg,
    )


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/overview", response_model=LibraryOverviewOut)
def library_overview(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> LibraryOverviewOut:
    """Aggregated overview for the Library page.

    Returns one payload the frontend can render directly — no N+1 calls.
    Counts are computed off curated registry + evidence DB. External
    (unreviewed) sources are not included here; use /external-search.
    """
    require_minimum_role(actor, "clinician")

    conds = list_conditions()
    devices = list_devices()
    package_slugs = set(list_condition_package_slugs())
    ev_conn = _evidence_conn_or_none()
    try:
        curated_papers = 0
        curated_trials = 0
        if ev_conn:
            try:
                curated_papers = int(ev_conn.execute("SELECT count(*) FROM papers").fetchone()[0])
                curated_trials = int(ev_conn.execute("SELECT count(*) FROM trials").fetchone()[0])
            except sqlite3.Error:
                pass

        summaries = [_summarize_condition(c, db, ev_conn, package_slugs) for c in conds]
    finally:
        if ev_conn:
            ev_conn.close()

    reviewed_conds = sum(1 for c in conds if _is_reviewed(c.get("review_status")))
    reviewed_devs = sum(1 for d in devices if _is_reviewed(d.get("review_status")))
    eligible = sum(1 for s in summaries if s.neuromod_eligible)

    _audit("overview", actor, conditions=len(conds), devices=len(devices))

    return LibraryOverviewOut(
        condition_count=len(conds),
        reviewed_condition_count=reviewed_conds,
        neuromod_eligible_count=eligible,
        device_count=len(devices),
        reviewed_device_count=reviewed_devs,
        condition_package_count=len(package_slugs),
        curated_paper_count=curated_papers,
        curated_trial_count=curated_trials,
        evidence_db_available=ev_conn is not None,
        generated_at=datetime.now(timezone.utc).isoformat(),
        conditions=summaries,
    )


@router.get("/conditions/{condition_id}/summary", response_model=ConditionSummaryOut)
def condition_summary(
    condition_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConditionSummaryOut:
    require_minimum_role(actor, "clinician")
    cond = get_condition(condition_id)
    if cond is None:
        raise HTTPException(status_code=404, detail=f"Condition '{condition_id}' not found.")
    ev_conn = _evidence_conn_or_none()
    try:
        result = _summarize_condition(cond, db, ev_conn, set(list_condition_package_slugs()))
    finally:
        if ev_conn:
            ev_conn.close()
    return result


@router.post("/external-search", response_model=ExternalSearchResponse)
def external_search(
    body: ExternalSearchRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ExternalSearchResponse:
    """Backend-brokered external evidence search.

    Returns items tagged `source_trust=external_raw`, `review_status=pending`.
    This prevents the frontend from scraping external sources directly and
    ensures every result carries provenance metadata.

    Current implementation queries the ingested evidence pipeline DB
    (`services/evidence-pipeline/evidence.db`) which aggregates PubMed /
    OpenAlex / CT.gov. The ingest process itself is the trust boundary.
    Items returned here are NOT curated until a clinician explicitly
    promotes them via /api/v1/evidence/papers/{id}/promote-to-library.
    """
    require_minimum_role(actor, "clinician")
    ev_conn = _evidence_conn_or_none()
    if ev_conn is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "External evidence index not available. The evidence pipeline has "
                "not been ingested yet. Ask an admin to run the evidence refresh."
            ),
        )

    q = body.q.strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    items: list[ExternalEvidenceItem] = []
    try:
        where = ["papers_fts MATCH ?"]
        params: list = [q]
        join = "JOIN papers_fts f ON f.rowid = p.id "
        if body.condition_id:
            cond = get_condition(body.condition_id)
            if cond:
                join += (
                    "JOIN paper_indications pi ON pi.paper_id = p.id "
                    "JOIN indications i ON i.id = pi.indication_id "
                )
                where.append("lower(i.condition) LIKE ?")
                params.append(f"%{cond['name'].lower()}%")
        sql = (
            "SELECT p.id, p.title, p.year, p.journal, p.authors_json, p.pub_types_json, "
            "p.oa_url, p.pmid, p.doi "
            "FROM papers p " + join + "WHERE " + " AND ".join(where) + " LIMIT ?"
        )
        params.append(body.limit)
        rows = ev_conn.execute(sql, params).fetchall()
    except sqlite3.Error as e:
        _logger.warning(f"external-search FTS error: {e}")
        rows = []
    finally:
        ev_conn.close()

    import json as _json
    for r in rows:
        try:
            authors = _json.loads(r["authors_json"] or "[]")
            author_str = ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else "")
        except Exception:
            author_str = None
        try:
            pub_types = _json.loads(r["pub_types_json"] or "[]")
        except Exception:
            pub_types = []
        items.append(
            ExternalEvidenceItem(
                id=str(r["id"]),
                title=r["title"] or "(untitled)",
                year=r["year"],
                journal=r["journal"],
                authors=author_str,
                pub_types=pub_types,
                url=r["oa_url"],
                pmid=r["pmid"],
                doi=r["doi"],
                source_trust="external_raw",
                review_status="pending",
                provenance_note="Indexed from public PubMed/OpenAlex ingest. Not curated.",
            )
        )

    _audit("external_search", actor, q=q, condition_id=body.condition_id, result_count=len(items))

    return ExternalSearchResponse(
        query=q,
        provenance="evidence-pipeline (PubMed / OpenAlex / CT.gov ingest)",
        source_trust="external_raw",
        review_status="pending",
        last_checked_at=now_iso,
        items=items,
        notice=(
            "These results are from an external ingest and are NOT curated clinical evidence. "
            "Review each item and explicitly promote to your library before using clinically."
        ),
    )


@router.post("/ai/summarize-evidence", response_model=AiSummarizeDraft)
def ai_summarize_evidence(
    body: AiSummarizeRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AiSummarizeDraft:
    """AI-assisted evidence summary — always a DRAFT.

    Takes a list of paper IDs from the curated evidence DB, fetches their
    titles + abstracts, and asks the clinician chat model to produce a
    structured summary. The response is flagged draft/ai_generated and
    cites each source paper ID. This endpoint NEVER writes to any
    curated table.
    """
    require_minimum_role(actor, "clinician")
    ev_conn = _evidence_conn_or_none()
    if ev_conn is None:
        raise HTTPException(status_code=503, detail="Evidence DB not available.")

    citations: list[dict] = []
    try:
        placeholders = ",".join(["?"] * len(body.paper_ids))
        rows = ev_conn.execute(
            f"SELECT id, pmid, doi, title, year, journal, abstract FROM papers "
            f"WHERE id IN ({placeholders})",
            body.paper_ids,
        ).fetchall()
    finally:
        ev_conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="None of the supplied paper_ids were found.")

    corpus_lines: list[str] = []
    for r in rows:
        citations.append(
            {
                "paper_id": r["id"],
                "pmid": r["pmid"],
                "doi": r["doi"],
                "title": r["title"],
                "year": r["year"],
                "journal": r["journal"],
            }
        )
        abstract = (r["abstract"] or "").strip()
        corpus_lines.append(
            f"[#{r['id']}] {r['title']} ({r['year'] or 'n.d.'}, {r['journal'] or '—'})\n"
            f"{abstract[:1500]}"
        )
    corpus = "\n\n".join(corpus_lines)
    focus_line = f"\nFocus the summary on: {body.focus.strip()}" if body.focus else ""
    prompt = (
        "You are assisting a clinician. Summarise the following research papers. "
        "Use bullet points. Cite each claim by the paper ID shown in square brackets "
        "(e.g. [#12]). Do NOT invent facts beyond the abstracts. If abstracts are "
        "insufficient, say so. Output max 250 words." + focus_line + "\n\n" + corpus
    )
    try:
        text = chat_clinician([{"role": "user", "content": prompt}])
    except Exception as e:
        _logger.warning(f"ai_summarize chat failure: {e}")
        text = "(AI summary unavailable — chat service returned an error. Review abstracts manually.)"

    now_iso = datetime.now(timezone.utc).isoformat()
    _audit("ai_summarize", actor, paper_count=len(rows))

    return AiSummarizeDraft(
        generated_at=now_iso,
        model_hint="claude-sonnet-4.x (clinician)",
        focus=body.focus,
        source_paper_ids=[c["paper_id"] for c in citations],
        source_citations=citations,
        draft_text=text,
        reviewer_notice=(
            "This summary was generated by an AI assistant. It is a DRAFT and must be "
            "reviewed by a clinician before being relied upon for patient care or "
            "added to curated library notes."
        ),
    )
