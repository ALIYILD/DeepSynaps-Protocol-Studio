"""Live Literature Watch router.

Implements §5 (on-demand refresh), §6 (UI surfaces B/C/D), §7 (review/promotion
rules) and §9 (cost model) of `docs/SPEC-live-literature-watch.md`.

The data lives in the standalone evidence pipeline SQLite DB
(`services/evidence-pipeline/evidence.db`) — same DB the existing
`evidence_router.py` reads from. Two tables:

  * literature_watch — papers surfaced by PubMed cron + on-demand sources
  * refresh_jobs     — one row per refresh attempt; powers the budget gate

Endpoints (all under /api/v1) — auth follows the same Bearer/JWT scheme used
across the rest of the API (see app/auth.py). Roles required:

  POST /protocols/{protocol_id}/refresh-literature
  GET  /protocols/{protocol_id}/refresh-literature/jobs
  GET  /literature-watch/pending
  POST /literature-watch/{pmid}/review
  GET  /literature-watch/spend

The actual PubMed call runs in a background asyncio task — no separate daemon
required. Consensus + Apify adapters are intentionally NOT wired here; the
router records the job as `failed` with `error='adapter missing'` to make the
"phase 2" surface explicit.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status

from app.limiter import limiter
from pydantic import BaseModel, Field

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role


logger = logging.getLogger("literature_watch")

# Concurrency cap on background refresh tasks. Pre-fix the route fired
# unbounded ``asyncio.create_task`` calls — N parallel tasks across
# protocols (multiplied by the per-IP rate limit) would exhaust HTTP
# connections to PubMed / OpenAlex / EuropePMC and blow the per-source
# politeness budget. 4 in-flight is a generous cap for the realistic
# clinical-research workload while keeping the worker pool predictable.
_REFRESH_MAX_CONCURRENCY = int(os.environ.get("LIT_WATCH_MAX_CONCURRENCY", "4"))
_REFRESH_SEMAPHORE: asyncio.Semaphore | None = None


def _refresh_semaphore() -> asyncio.Semaphore:
    """Lazy-construct the semaphore so it binds to the running loop.

    Built lazily because ``asyncio.Semaphore()`` at import time can
    bind to a different event loop than FastAPI uses, depending on
    the ASGI runner. Constructing on first use ensures it lives on
    the correct loop.
    """
    global _REFRESH_SEMAPHORE
    if _REFRESH_SEMAPHORE is None:
        _REFRESH_SEMAPHORE = asyncio.Semaphore(_REFRESH_MAX_CONCURRENCY)
    return _REFRESH_SEMAPHORE


async def _bounded_run_refresh_job(job_id: int, protocol_id: str, src: str) -> None:
    """Wrap ``_run_refresh_job`` so concurrent dispatches block on
    ``_REFRESH_SEMAPHORE``. Pre-fix every dispatch ran in parallel."""
    sem = _refresh_semaphore()
    async with sem:
        await _run_refresh_job(job_id, protocol_id, src)

router = APIRouter(prefix="/api/v1", tags=["Literature Watch"])


# ── Cost model (spec §9) ────────────────────────────────────────────────────
SOURCE_COST_USD: dict[str, float] = {
    "pubmed": 0.0,
    "consensus": 0.01,
    "apify": 0.25,
    "apify_scholar": 0.25,
}

# Effective monthly budget cap (spec §5.5). $150 is the platform cap; we
# stop at $100 to leave a $50 safety buffer.
MONTHLY_BUDGET_CAP_USD: float = 100.0

# Promotions log — append-only JSONL. The spec §7 promotion path (rewrite of
# protocols-data.js) is left to a follow-up PR; for now we just record the
# intent so a human or the existing scripts/promote_literature.py can apply it.
_PROMOTIONS_LOG = (
    Path(__file__).resolve().parents[3]
    / "services"
    / "evidence-pipeline"
    / ".pending-promotions.jsonl"
)


# ── DB plumbing ─────────────────────────────────────────────────────────────
def _evidence_db_path() -> str:
    """Return the path to evidence.db — mirrors evidence_router._default_db_path."""
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override:
        return override
    here = Path(__file__).resolve()
    repo_guess = here.parents[4] / "services" / "evidence-pipeline" / "evidence.db"
    if repo_guess.exists():
        return str(repo_guess)
    return "/app/evidence.db"


def _open_writable() -> sqlite3.Connection:
    """Writable connection. Caller is responsible for closing.

    Note: unlike `evidence_router._evidence_conn` we do NOT set query_only=1
    because this router writes to literature_watch + refresh_jobs.
    """
    path = _evidence_db_path()
    if not os.path.exists(path):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Evidence database not found. Run "
                "`bash services/evidence-pipeline/migrations/run-migrations.sh` "
                "or set EVIDENCE_DB_PATH."
            ),
        )
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _month_floor_iso() -> str:
    """First-of-month UTC, ISO-8601. Used to bound the monthly spend query."""
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat(
        timespec="seconds"
    )


def _spend_summary(conn: sqlite3.Connection) -> dict[str, Any]:
    """Compute month-to-date spend across all `done` and `failed` jobs.

    PubMed jobs have cost 0 so they're excluded from the per-source breakdown
    even though they still contribute to job counts.
    """
    floor = _month_floor_iso()
    rows = conn.execute(
        """
        SELECT source, COALESCE(SUM(cost_usd), 0) AS spend, COUNT(*) AS n
          FROM refresh_jobs
         WHERE started_at >= ?
           AND status IN ('succeeded', 'done', 'failed')
         GROUP BY source
        """,
        (floor,),
    ).fetchall()
    total = 0.0
    by_source: dict[str, float] = {}
    job_count = 0
    for r in rows:
        total += float(r["spend"] or 0.0)
        if r["spend"]:
            by_source[r["source"] or "unknown"] = round(float(r["spend"]), 4)
        job_count += int(r["n"] or 0)
    return {
        "month": datetime.now(timezone.utc).strftime("%Y-%m"),
        "total_usd": round(total, 4),
        "by_source": by_source,
        "budget_cap_usd": MONTHLY_BUDGET_CAP_USD,
        "budget_remaining": round(MONTHLY_BUDGET_CAP_USD - total, 4),
        "jobs_count": job_count,
    }


# ── Schemas ─────────────────────────────────────────────────────────────────
class RefreshRequest(BaseModel):
    source: str = Field(default="pubmed", max_length=32, description="pubmed | consensus | apify")
    # `requested_by` is logged into the `refresh_jobs.requested_by`
    # column. Cap at 64 to match every other actor-id column in the
    # codebase and refuse mega-string DoS at the schema layer.
    requested_by: Optional[str] = Field(default=None, max_length=64)


class RefreshResponse(BaseModel):
    job_id: int
    status: str
    source: str
    protocol_id: str


class JobOut(BaseModel):
    id: int
    protocol_id: Optional[str]
    requested_by: Optional[str]
    source: Optional[str]
    started_at: Optional[str]
    finished_at: Optional[str]
    new_papers_count: int
    cost_usd: float
    status: str
    error: Optional[str] = None


class JobListResponse(BaseModel):
    items: list[JobOut]


class PendingItemOut(BaseModel):
    id: int
    pmid: Optional[str]
    doi: Optional[str]
    title: Optional[str]
    authors: list[str] = Field(default_factory=list)
    year: Optional[int]
    journal: Optional[str]
    citation_count: int = 0
    source: Optional[str]
    first_seen_at: Optional[str]
    protocol_ids: list[str] = Field(default_factory=list)


class PendingListResponse(BaseModel):
    items: list[PendingItemOut]
    total: int
    limit: int
    offset: int


class ReviewRequest(BaseModel):
    verdict: str = Field(..., max_length=32)  # 'relevant' | 'not-relevant' | 'promoted'
    protocol_id: str = Field(..., max_length=64)


class ReviewResponse(BaseModel):
    pmid: str
    protocol_id: str
    verdict: str
    reviewed_at: str
    promotion_logged: bool = False


class SpendResponse(BaseModel):
    month: str
    total_usd: float
    by_source: dict[str, float]
    budget_cap_usd: float
    budget_remaining: float
    jobs_count: int


# ── Worker (in-process, asyncio) ────────────────────────────────────────────
async def _run_refresh_job(
    job_id: int, protocol_id: str, source: str, query_hint: Optional[str] = None
) -> None:
    """Background task: pick up a queued refresh, execute it, write results.

    Only PubMed is implemented — Consensus + Apify adapters are stubs that
    will mark the job failed with `adapter missing` per spec §5.4.
    """
    started = _now_iso()
    conn = sqlite3.connect(_evidence_db_path(), timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(
            "UPDATE refresh_jobs SET status='running', started_at=? WHERE id=?",
            (started, job_id),
        )
        conn.commit()

        if source != "pubmed":
            conn.execute(
                "UPDATE refresh_jobs SET status='failed', finished_at=?, "
                "cost_usd=0 WHERE id=?",
                (_now_iso(), job_id),
            )
            conn.commit()
            logger.warning(
                "refresh job %s skipped (adapter missing for source=%s)",
                job_id,
                source,
            )
            return

        # Build a query string. We re-use literature_watch_cron's helpers when
        # available, but fall back to a minimal query so a missing/broken
        # protocols-data.js does not poison the API.
        new_papers = 0
        try:
            from importlib import import_module
            import sys

            ev_dir = Path(__file__).resolve().parents[4] / "services" / "evidence-pipeline"
            if str(ev_dir) not in sys.path:
                sys.path.insert(0, str(ev_dir))
            cron = import_module("literature_watch_cron")  # type: ignore
            pubmed_client_mod = import_module("pubmed_client")  # type: ignore
            log = logging.getLogger("literature_watch.adhoc")
            try:
                lib = cron.load_protocol_library(log)
            except Exception as e:  # noqa: BLE001
                logger.warning("protocol library load failed: %s", e)
                lib = None
            query: Optional[str] = None
            if lib:
                conditions_by_id = {c["id"]: c for c in (lib.get("conditions") or [])}
                devices_by_id = {d["id"]: d for d in (lib.get("devices") or [])}
                proto = next(
                    (p for p in (lib.get("protocols") or []) if p.get("id") == protocol_id),
                    None,
                )
                if proto:
                    query = cron.build_query(proto, conditions_by_id, devices_by_id)
            if not query:
                query = query_hint or protocol_id

            client = pubmed_client_mod.PubMedClient()
            results = await asyncio.to_thread(
                client.search, query, days_back=30, max_results=25
            )
            seen = {
                r[0]
                for r in conn.execute(
                    "SELECT pmid FROM literature_watch WHERE protocol_id=? AND pmid IS NOT NULL",
                    (protocol_id,),
                ).fetchall()
            }
            for rec in results:
                pmid = rec.get("pmid")
                if not pmid or pmid in seen:
                    continue
                try:
                    conn.execute(
                        """
                        INSERT INTO literature_watch
                            (protocol_id, pmid, doi, title, authors, year, journal,
                             citation_count, source, first_seen_at, verdict)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pubmed', ?, 'pending')
                        """,
                        (
                            protocol_id,
                            pmid,
                            rec.get("doi"),
                            rec.get("title"),
                            json.dumps(rec.get("authors") or [], ensure_ascii=False),
                            rec.get("year"),
                            rec.get("journal"),
                            _now_iso(),
                        ),
                    )
                    new_papers += 1
                    seen.add(pmid)
                except sqlite3.IntegrityError:
                    pass
            conn.commit()
        except Exception as e:  # noqa: BLE001
            logger.exception("refresh job %s failed: %s", job_id, e)
            conn.execute(
                "UPDATE refresh_jobs SET status='failed', finished_at=? WHERE id=?",
                (_now_iso(), job_id),
            )
            conn.commit()
            return

        conn.execute(
            "UPDATE refresh_jobs SET status='succeeded', finished_at=?, "
            "new_papers_count=?, cost_usd=0 WHERE id=?",
            (_now_iso(), new_papers, job_id),
        )
        conn.commit()
        logger.info(
            "refresh job %s done: protocol=%s new_papers=%d",
            job_id,
            protocol_id,
            new_papers,
        )
    finally:
        conn.close()


# ── Endpoints ───────────────────────────────────────────────────────────────
@router.post(
    "/protocols/{protocol_id}/refresh-literature",
    response_model=RefreshResponse,
    status_code=202,
)
@limiter.limit("5/minute")
async def refresh_literature(
    request: Request,
    protocol_id: str,
    body: RefreshRequest = Body(default_factory=RefreshRequest),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> RefreshResponse:
    """Enqueue an on-demand literature refresh and kick off a background task.

    Budget gate: §5.5 — total monthly cost ≥ $100 ⇒ 402.
    PubMed is free so it bypasses the cost check entirely, BUT the
    rate limit + concurrency cap above are the load-bearing guards
    against an authed clinician spamming free-source refreshes
    (each one fans out into PubMed / OpenAlex queries and rebuilds
    pending-paper review state).
    """
    require_minimum_role(actor, "clinician")
    src = (body.source or "pubmed").lower()
    if src not in SOURCE_COST_USD:
        raise HTTPException(status_code=422, detail=f"unknown source: {src}")
    est_cost = SOURCE_COST_USD[src]

    conn = _open_writable()
    try:
        spend = _spend_summary(conn)
        if est_cost > 0 and spend["total_usd"] >= MONTHLY_BUDGET_CAP_USD:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "budget_exceeded",
                    "spend_this_month": spend["total_usd"],
                    "budget_cap_usd": MONTHLY_BUDGET_CAP_USD,
                },
            )
        # Block stacking another job for the same protocol while one is live.
        running = conn.execute(
            "SELECT id FROM refresh_jobs WHERE protocol_id=? AND status IN ('queued','running') LIMIT 1",
            (protocol_id,),
        ).fetchone()
        if running:
            raise HTTPException(
                status_code=409,
                detail={"error": "job_in_flight", "job_id": running["id"]},
            )

        cur = conn.execute(
            """
            INSERT INTO refresh_jobs
                (protocol_id, requested_by, source, started_at, status)
            VALUES (?, ?, ?, ?, 'queued')
            """,
            (protocol_id, body.requested_by or actor.actor_id, src, _now_iso()),
        )
        job_id = cur.lastrowid or 0
        conn.commit()
    finally:
        conn.close()

    # Fire-and-forget. Wrapped in `_bounded_run_refresh_job` so the
    # `_REFRESH_SEMAPHORE` caps concurrent in-flight tasks at
    # `_REFRESH_MAX_CONCURRENCY` (default 4). Pre-fix every call
    # spawned an unbounded `asyncio.create_task`, exhausting HTTP
    # connection pools to PubMed / OpenAlex / EuropePMC.
    asyncio.create_task(_bounded_run_refresh_job(job_id, protocol_id, src))

    return RefreshResponse(
        job_id=job_id, status="queued", source=src, protocol_id=protocol_id
    )


@router.get(
    "/protocols/{protocol_id}/refresh-literature/jobs",
    response_model=JobListResponse,
)
async def list_refresh_jobs(
    protocol_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> JobListResponse:
    require_minimum_role(actor, "clinician")
    conn = _open_writable()
    try:
        rows = conn.execute(
            """
            SELECT id, protocol_id, requested_by, source, started_at,
                   finished_at, new_papers_count, cost_usd, status
              FROM refresh_jobs
             WHERE protocol_id = ?
             ORDER BY id DESC
             LIMIT 10
            """,
            (protocol_id,),
        ).fetchall()
    finally:
        conn.close()

    items = [
        JobOut(
            id=int(r["id"]),
            protocol_id=r["protocol_id"],
            requested_by=r["requested_by"],
            source=r["source"],
            started_at=r["started_at"],
            finished_at=r["finished_at"],
            new_papers_count=int(r["new_papers_count"] or 0),
            cost_usd=float(r["cost_usd"] or 0.0),
            status=r["status"] or "queued",
        )
        for r in rows
    ]
    return JobListResponse(items=items)


@router.get("/literature-watch/pending", response_model=PendingListResponse)
async def list_pending(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PendingListResponse:
    require_minimum_role(actor, "clinician")
    conn = _open_writable()
    try:
        # Window is "all pending rows, deduped by PMID, sorted by first_seen_at DESC".
        # We fetch everything pending (capped) then dedupe in Python because
        # SQLite GROUP BY ordering with collected protocol_ids is awkward.
        rows = conn.execute(
            """
            SELECT id, pmid, doi, title, authors, year, journal,
                   citation_count, source, first_seen_at, protocol_id
              FROM literature_watch
             WHERE verdict = 'pending'
               AND (pmid IS NOT NULL OR doi IS NOT NULL)
             ORDER BY first_seen_at DESC, id DESC
            """,
        ).fetchall()
    finally:
        conn.close()

    bucket: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for r in rows:
        key = r["pmid"] or f"doi:{r['doi']}"
        if key in bucket:
            pid = r["protocol_id"]
            if pid and pid not in bucket[key]["protocol_ids"]:
                bucket[key]["protocol_ids"].append(pid)
            continue
        try:
            authors = json.loads(r["authors"] or "[]")
        except (TypeError, ValueError):
            authors = []
        bucket[key] = {
            "id": int(r["id"]),
            "pmid": r["pmid"],
            "doi": r["doi"],
            "title": r["title"],
            "authors": authors if isinstance(authors, list) else [],
            "year": r["year"],
            "journal": r["journal"],
            "citation_count": int(r["citation_count"] or 0),
            "source": r["source"],
            "first_seen_at": r["first_seen_at"],
            "protocol_ids": [r["protocol_id"]] if r["protocol_id"] else [],
        }
        order.append(key)

    total = len(order)
    page_keys = order[offset : offset + limit]
    items = [PendingItemOut(**bucket[k]) for k in page_keys]
    return PendingListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/literature-watch/{pmid}/review",
    response_model=ReviewResponse,
)
async def review_paper(
    pmid: str,
    body: ReviewRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ReviewResponse:
    require_minimum_role(actor, "clinician")
    verdict = (body.verdict or "").strip().lower()
    if verdict not in {"relevant", "not-relevant", "promoted", "pending"}:
        raise HTTPException(status_code=422, detail=f"unknown verdict: {verdict}")

    conn = _open_writable()
    try:
        row = conn.execute(
            "SELECT id, protocol_id FROM literature_watch WHERE pmid=? AND protocol_id=?",
            (pmid, body.protocol_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="literature_watch row not found")
        ts = _now_iso()
        conn.execute(
            "UPDATE literature_watch SET verdict=?, reviewer_id=?, reviewed_at=? "
            "WHERE id=?",
            (verdict, actor.actor_id, ts, int(row["id"])),
        )
        conn.commit()
    finally:
        conn.close()

    promotion_logged = False
    if verdict == "promoted":
        # Append to the on-disk pending-promotions log. The follow-up PR
        # (scripts/promote_literature.py) will fold these into protocols-data.js.
        try:
            _PROMOTIONS_LOG.parent.mkdir(parents=True, exist_ok=True)
            entry = {
                "pmid": pmid,
                "protocol_id": body.protocol_id,
                "reviewer_id": actor.actor_id,
                "logged_at": ts,
            }
            with _PROMOTIONS_LOG.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
            promotion_logged = True
        except Exception as e:  # noqa: BLE001
            logger.warning("could not append to promotions log: %s", e)

    return ReviewResponse(
        pmid=pmid,
        protocol_id=body.protocol_id,
        verdict=verdict,
        reviewed_at=ts,
        promotion_logged=promotion_logged,
    )


@router.get("/literature-watch/spend", response_model=SpendResponse)
async def get_spend(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SpendResponse:
    require_minimum_role(actor, "clinician")
    conn = _open_writable()
    try:
        s = _spend_summary(conn)
    finally:
        conn.close()
    return SpendResponse(**s)
