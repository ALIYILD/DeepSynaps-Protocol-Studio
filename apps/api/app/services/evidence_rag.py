"""Evidence-paper retrieval helper for the clinician chat agent.

Provides a lightweight RAG layer over the 87k-paper SQLite evidence DB produced
by `services/evidence-pipeline/`. The DB is read-only from this service; we
open every connection with PRAGMA query_only=1 as defence-in-depth.

Exports
-------
- `search_evidence(query, modality, condition, top_k, year_min, prefer_rct)`
    returns a ranked list of paper dicts ready to be formatted as LLM context.
- `format_evidence_context(papers)`
    turns the list into numbered markdown blocks the LLM can cite inline.

Ranking mirrors `evidence_router._score`:
    pub_type_tier*10 + log1p(cites) + (year-2000)*0.1 + is_oa*2
When `pub_types_json` is null/empty we derive a tier from `study_design`
(meta_analysis/systematic_review=5, rct=4, clinical_trial=3, review=2,
case_series=1) so the richer 87k-bulk rows still rank sensibly.

If EVIDENCE_DB_PATH is missing or unreachable, every public helper returns an
empty list (not an exception): chat_agent must still work without evidence.
"""
from __future__ import annotations

import json
import logging
import math
import os
import sqlite3
from pathlib import Path

_log = logging.getLogger(__name__)


# ── DB handle ────────────────────────────────────────────────────────────────

def _default_db_path() -> str:
    """Mirror of evidence_router._default_db_path so this helper resolves to
    the same DB in local dev, Docker (/app/evidence.db), and Fly (/data)."""
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override:
        return override
    here = Path(__file__).resolve()
    # apps/api/app/services/evidence_rag.py → up 4 == repo root
    repo_guess = here.parents[4] / "services" / "evidence-pipeline" / "evidence.db"
    if repo_guess.exists():
        return str(repo_guess)
    return "/app/evidence.db"


def _open_readonly() -> sqlite3.Connection | None:
    """Open the evidence DB read-only. Returns None if the DB is missing.

    Uses the `file:…?mode=ro` URI so SQLite enforces read-only at the OS
    layer, and also sets PRAGMA query_only=1 as belt-and-braces.
    """
    path = _default_db_path()
    if not os.path.exists(path):
        return None
    try:
        # mode=ro prevents accidental write-lock creation; immutable=0 so the
        # DB can still be updated by the ingest pipeline while we read.
        uri = f"file:{path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=1.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only = 1")
        return conn
    except sqlite3.Error as exc:
        _log.warning("evidence_rag: failed to open DB at %s: %s", path, exc)
        return None


# ── Ranking ──────────────────────────────────────────────────────────────────

_PUB_TYPE_TIER = {
    "Meta-Analysis": 5, "Systematic Review": 5, "Practice Guideline": 5, "Guideline": 5,
    "Randomized Controlled Trial": 4, "Controlled Clinical Trial": 4,
    "Clinical Trial": 3,
    "Review": 2,
    "Case Reports": 1,
}

_STUDY_DESIGN_TIER = {
    "meta_analysis": 5,
    "systematic_review": 5,
    "rct": 4,
    "clinical_trial": 3,
    "review": 2,
    "case_series": 1,
}

_RCT_TOP_DESIGNS = ("meta_analysis", "systematic_review", "rct")


def _row_tier(row: sqlite3.Row) -> int:
    """pub_types_json tier first, then fall back to study_design."""
    try:
        pub_types = json.loads(row["pub_types_json"] or "[]")
    except (TypeError, ValueError, json.JSONDecodeError):
        pub_types = []
    tier = max((_PUB_TYPE_TIER.get(pt, 0) for pt in pub_types), default=0)
    if tier == 0:
        design = (row["study_design"] or "").strip().lower()
        tier = _STUDY_DESIGN_TIER.get(design, 0)
    return tier


def _row_score(row: sqlite3.Row) -> float:
    tier = _row_tier(row)
    cites = row["cited_by_count"] or 0
    year = row["year"] or 0
    oa_bonus = 2 if row["is_oa"] else 0
    return tier * 10 + math.log1p(cites) + (year - 2000) * 0.1 + oa_bonus


# ── Paper URL + snippet helpers ──────────────────────────────────────────────

def _paper_url(row: sqlite3.Row) -> str | None:
    oa = row["oa_url"] if "oa_url" in row.keys() else None
    if oa:
        return oa
    epmc = row["europe_pmc_url"] if "europe_pmc_url" in row.keys() else None
    if epmc:
        return epmc
    pmid = row["pmid"] if "pmid" in row.keys() else None
    if pmid:
        return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    doi = row["doi"] if "doi" in row.keys() else None
    if doi:
        return f"https://doi.org/{doi}"
    return None


def _abstract_snippet(abstract: str | None, limit: int = 400) -> str:
    text = (abstract or "").strip()
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


# ── Public API ───────────────────────────────────────────────────────────────

def search_evidence(
    query: str,
    modality: str | None = None,
    condition: str | None = None,
    top_k: int = 5,
    year_min: int | None = None,
    prefer_rct: bool = False,
) -> list[dict]:
    """Search the evidence DB and return `top_k` ranked papers.

    Parameters
    ----------
    query : str
        Natural-language query. When non-empty, uses FTS on title+abstract
        via `papers_fts`. When empty, falls back to straight SQL filtering.
    modality : str | None
        Canonical modality token (e.g. 'tms', 'tdcs'). Matched as a substring
        in the `modalities_json` column (stored as a JSON array).
    condition : str | None
        Canonical condition token (e.g. 'mdd', 'parkinsons'). Matched the
        same way against `conditions_json`.
    top_k : int
        Max rows to return after ranking. Defaults to 5.
    year_min : int | None
        If set, drops papers with year < year_min.
    prefer_rct : bool
        When True, pushes meta_analysis/systematic_review/rct rows to the
        top via an ORDER BY on derived priority before our evidence score.

    Returns
    -------
    list[dict]
        One dict per paper with the shape expected by format_evidence_context
        and the chat_router response. Empty list if the DB is missing or no
        rows match — never raises to the caller.
    """
    if top_k <= 0:
        return []

    conn = _open_readonly()
    if conn is None:
        return []

    q = (query or "").strip()
    modality = (modality or "").strip().lower() or None
    condition = (condition or "").strip().lower() or None

    # We fetch ~4× top_k candidates then re-rank in Python because the
    # composite score depends on json-encoded columns. 4× gives the ranker
    # enough signal without thrashing IO.
    fetch_limit = max(top_k * 4, 20)

    where_clauses: list[str] = []
    params: list = []

    if modality:
        where_clauses.append('p.modalities_json LIKE ?')
        params.append(f'%"{modality}"%')
    if condition:
        where_clauses.append('p.conditions_json LIKE ?')
        params.append(f'%"{condition}"%')
    if year_min is not None:
        where_clauses.append('p.year >= ?')
        params.append(int(year_min))

    select_cols = (
        "p.id, p.pmid, p.doi, p.title, p.abstract, p.year, p.journal, "
        "p.cited_by_count, p.is_oa, p.oa_url, p.pub_types_json, "
        "p.modalities_json, p.conditions_json, p.study_design, "
        "p.sample_size, p.effect_direction, p.europe_pmc_url"
    )

    # ORDER BY priority: prefer_rct pushes high-evidence designs to the top
    # before any score-based rerank. Uses CASE because SQLite has no enum.
    order_clause = ""
    if prefer_rct:
        order_clause = (
            " ORDER BY CASE LOWER(COALESCE(p.study_design, '')) "
            "WHEN 'meta_analysis' THEN 1 "
            "WHEN 'systematic_review' THEN 1 "
            "WHEN 'rct' THEN 2 "
            "WHEN 'clinical_trial' THEN 3 "
            "ELSE 9 END, p.year DESC"
        )
    else:
        order_clause = " ORDER BY p.year DESC"

    try:
        if q:
            # FTS path: join papers_fts.rowid == papers.id.
            sql = (
                f"SELECT {select_cols} "
                "FROM papers_fts f "
                "JOIN papers p ON p.id = f.rowid "
                "WHERE papers_fts MATCH ? "
            )
            fts_params: list = [q]
            if where_clauses:
                sql += " AND " + " AND ".join(where_clauses) + " "
                fts_params.extend(params)
            sql += order_clause + " LIMIT ?"
            fts_params.append(fetch_limit)
            try:
                rows = conn.execute(sql, fts_params).fetchall()
            except sqlite3.OperationalError as exc:
                # FTS5 MATCH syntax errors on punctuation/quotes — degrade
                # gracefully to the non-FTS path instead of 500ing the chat.
                _log.info("evidence_rag: FTS failed (%s) — falling back to filter-only", exc)
                rows = []
                q = ""  # force fallback below
        if not q:
            sql = f"SELECT {select_cols} FROM papers p"
            if where_clauses:
                sql += " WHERE " + " AND ".join(where_clauses)
            sql += order_clause + " LIMIT ?"
            rows = conn.execute(sql, [*params, fetch_limit]).fetchall()
    except sqlite3.Error as exc:
        _log.warning("evidence_rag: query failed: %s", exc)
        conn.close()
        return []

    # Rank in Python. When prefer_rct is set, keep the SQL ordering as a
    # tiebreaker bucket but still sort within buckets by the composite score.
    def _sort_key(r: sqlite3.Row) -> tuple:
        if prefer_rct:
            design = (r["study_design"] or "").strip().lower()
            bucket = 0 if design in _RCT_TOP_DESIGNS else 1
            return (bucket, -_row_score(r))
        return (-_row_score(r),)

    ranked = sorted(rows, key=_sort_key)[:top_k]

    out: list[dict] = []
    for r in ranked:
        out.append({
            "paper_id": r["id"],
            "pmid": r["pmid"],
            "doi": r["doi"],
            "title": r["title"],
            "year": r["year"],
            "journal": r["journal"],
            "abstract_snippet": _abstract_snippet(r["abstract"]),
            "study_design": r["study_design"],
            "effect_direction": r["effect_direction"],
            "cited_by_count": r["cited_by_count"],
            "sample_size": r["sample_size"],
            "url": _paper_url(r),
        })

    conn.close()
    return out


def format_evidence_context(papers: list[dict]) -> str:
    """Format papers as numbered markdown blocks the LLM can cite inline.

    The output is designed to be cheap in tokens while exposing enough
    metadata (design, N, effect direction, citations) that the LLM can
    prioritise high-evidence rows on its own.
    """
    if not papers:
        return ""

    blocks: list[str] = []
    for i, p in enumerate(papers, start=1):
        year = p.get("year") or "n.d."
        title = (p.get("title") or "Untitled").strip()
        journal = (p.get("journal") or "").strip()
        design = (p.get("study_design") or "").strip()
        effect = (p.get("effect_direction") or "").strip()
        cites = p.get("cited_by_count")
        n = p.get("sample_size")
        pmid = p.get("pmid")
        url = p.get("url")
        abstract = (p.get("abstract_snippet") or "").strip()

        # Header line: "[1] (2024) Title. Journal. Design: RCT. N=42. Effect: positive."
        parts = [f"[{i}] ({year}) \"{title}\"."]
        if journal:
            parts.append(f"{journal}.")
        if design:
            parts.append(f"Design: {design}.")
        if n is not None:
            parts.append(f"N={n}.")
        if effect:
            parts.append(f"Effect: {effect}.")
        header = " ".join(parts)

        # Second line: citations + link
        meta_bits: list[str] = []
        if cites is not None:
            meta_bits.append(f"Citations: {cites}.")
        if pmid and url:
            meta_bits.append(f"[PMID {pmid}]({url})")
        elif url:
            meta_bits.append(f"[link]({url})")
        meta_line = "    " + " ".join(meta_bits) if meta_bits else ""

        abstract_line = f"    Abstract: {abstract}" if abstract else ""

        block = header
        if meta_line:
            block += "\n" + meta_line
        if abstract_line:
            block += "\n" + abstract_line
        blocks.append(block)

    return "\n\n".join(blocks)
