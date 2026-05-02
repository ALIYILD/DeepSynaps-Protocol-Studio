"""Bridge Nutrition Analyzer to the shared evidence SQLite corpus (~87k papers).

FTS5 queries are read-only and match the ``papers_fts`` index used by
``/api/v1/evidence/papers`` — a single evidence database, not a separate
nutrition store.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Optional

# ── Ranking (aligned with evidence_router._score) ─────────────────────────────

_PUB_TYPE_TIER = {
    "Meta-Analysis": 6,
    "Systematic Review": 6,
    "Randomized Controlled Trial": 4,
    "Controlled Clinical Trial": 4,
    "Clinical Trial": 3,
    "Review": 2,
    "Case Reports": 1,
}

_PAPER_SELECT_COLS = (
    "p.id, p.pmid, p.doi, p.openalex_id, p.title, p.year, p.journal, "
    "p.cited_by_count, p.is_oa, p.oa_url, p.pub_types_json, p.authors_json, p.sources_json, "
    "p.abstract, p.source, p.pmcid, p.modalities_json, p.conditions_json, "
    "p.study_design, p.sample_size, p.primary_outcome_measure, p.effect_direction, "
    "p.europe_pmc_url, p.enrichment_status"
)


def _default_db_path() -> str:
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override:
        return override
    # apps/api/app/services/ -> workspace root is parents[4]
    here = Path(__file__).resolve()
    repo_guess = here.parents[4] / "services" / "evidence-pipeline" / "evidence.db"
    if repo_guess.exists():
        return str(repo_guess)
    return "/app/evidence.db"


def _evidence_db_available() -> bool:
    return os.path.exists(_default_db_path())


def _score(row: sqlite3.Row) -> float:
    pub_types = json.loads(row["pub_types_json"] or "[]")
    tier = max((_PUB_TYPE_TIER.get(pt, 0) for pt in pub_types), default=0)
    cites = row["cited_by_count"] or 0
    year = row["year"] or 0
    oa_bonus = 2 if row["is_oa"] else 0
    return tier * 10 + math.log1p(cites) + (year - 2000) * 0.1 + oa_bonus


def _row_to_evidence_dict(row: sqlite3.Row) -> dict[str, Any]:
    keys = row.keys()
    authors = json.loads(row["authors_json"] or "[]")
    try:
        modalities = json.loads(row["modalities_json"] or "[]") if "modalities_json" in keys else []
    except (TypeError, ValueError):
        modalities = []
    try:
        conditions = json.loads(row["conditions_json"] or "[]") if "conditions_json" in keys else []
    except (TypeError, ValueError):
        conditions = []
    abstract = row["abstract"] if "abstract" in keys else None
    snippet = ""
    if abstract and len(str(abstract).strip()) > 40:
        s = str(abstract).replace("\n", " ").strip()
        snippet = (s[:219] + "…") if len(s) > 220 else s
    else:
        snippet = str(row["title"] or "")[:220]
    return {
        "id": int(row["id"]),
        "pmid": row["pmid"],
        "doi": row["doi"],
        "title": row["title"],
        "year": row["year"],
        "journal": row["journal"],
        "authors": authors,
        "cited_by_count": row["cited_by_count"],
        "is_oa": bool(row["is_oa"]) if row["is_oa"] is not None else False,
        "oa_url": row["oa_url"],
        "europe_pmc_url": row["europe_pmc_url"] if "europe_pmc_url" in keys else None,
        "modalities": modalities,
        "conditions": conditions,
        "study_design": row["study_design"] if "study_design" in keys else None,
        "snippet": snippet,
    }


def _fts_search(q: str, *, limit: int = 8) -> list[sqlite3.Row]:
    if not q or not _evidence_db_available():
        return []
    conn = sqlite3.connect(_default_db_path(), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = 1")
    try:
        sql = (
            "SELECT " + _PAPER_SELECT_COLS + " "
            "FROM papers p JOIN papers_fts f ON f.rowid = p.id "
            "WHERE papers_fts MATCH ? LIMIT ?"
        )
        rows = conn.execute(sql, (q, limit * 4)).fetchall()
    finally:
        conn.close()
    ranked = sorted(rows, key=_score, reverse=True)[:limit]
    return ranked


def corpus_paper_count() -> int:
    if not _evidence_db_available():
        return 0
    conn = sqlite3.connect(_default_db_path(), timeout=5)
    try:
        conn.execute("PRAGMA query_only = 1")
        n = conn.execute("SELECT count(*) FROM papers").fetchone()[0]
        return int(n)
    except Exception:
        return 0
    finally:
        conn.close()


@dataclass(frozen=True)
class EvidencePackResult:
    items: list[dict[str, Any]]
    total_papers: int
    queries_used: list[str]


_NUTRITION_QUERY_TOPICS: tuple[tuple[str, str], ...] = (
    ("diet quality nutrient", "diet quality patterns"),
    ("micronutrient deficiency biomarker", "micronutrients and labs"),
    ("vitamin D supplementation safety", "vitamin D"),
    ("omega-3 EPA DHA cardiovascular", "omega-3"),
    ("herb drug interaction supplement", "supplement interactions"),
)


def collect_nutrition_evidence_items(
    *,
    supplement_names: list[str],
    recommendation_titles: list[str],
    max_topics: int = 5,
    per_topic_limit: int = 2,
) -> EvidencePackResult:
    total = corpus_paper_count()
    queries: list[str] = []
    seen: set[int] = set()
    out: list[dict[str, Any]] = []

    for fts_q, label in _NUTRITION_QUERY_TOPICS[:max_topics]:
        queries.append(fts_q)
        for row in _fts_search(fts_q, limit=per_topic_limit):
            pid = int(row["id"])
            if pid in seen:
                continue
            seen.add(pid)
            d = _row_to_evidence_dict(row)
            d["source_type"] = "literature_corpus"
            d["strength"] = "fts_ranked"
            d["evidence_topic"] = label
            d["query_used"] = fts_q
            out.append(d)
        if len(out) >= 14:
            break

    for name in supplement_names[:3]:
        n = (name or "").strip()
        if len(n) < 3:
            continue
        simple = n.replace("(", " ").replace(")", " ")[:60]
        fts_q = f"{simple} supplement OR dietary"
        queries.append(fts_q)
        for row in _fts_search(fts_q, limit=2):
            pid = int(row["id"])
            if pid in seen:
                continue
            seen.add(pid)
            d = _row_to_evidence_dict(row)
            d["source_type"] = "literature_corpus"
            d["strength"] = "fts_ranked"
            d["evidence_topic"] = f"supplement:{simple[:40]}"
            d["query_used"] = fts_q
            out.append(d)

    for title in recommendation_titles[:2]:
        t = (title or "").lower()
        fts_q: Optional[str] = None
        if "sodium" in t or "salt" in t:
            fts_q = "dietary sodium hypertension guideline"
        elif "fiber" in t:
            fts_q = "dietary fiber cardiovascular metabolic"
        elif "vitamin d" in t:
            fts_q = "vitamin D supplementation guideline adults"
        if fts_q:
            queries.append(fts_q)
            for row in _fts_search(fts_q, limit=2):
                pid = int(row["id"])
                if pid in seen:
                    continue
                seen.add(pid)
                d = _row_to_evidence_dict(row)
                d["source_type"] = "literature_corpus"
                d["strength"] = "fts_ranked"
                d["evidence_topic"] = "recommendation_context"
                d["query_used"] = fts_q
                out.append(d)

    return EvidencePackResult(items=out[:18], total_papers=total, queries_used=queries)
