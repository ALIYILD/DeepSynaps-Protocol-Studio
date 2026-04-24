"""RAG over the DeepSynaps Postgres literature database.

Queries the existing ``deepsynaps`` DB (tables: ``papers``,
``paper_conditions``, ``paper_modalities``, ``conditions``, ``modalities``)
for papers matching the flagged conditions + top modalities. If the DB is
unreachable or ``db_url`` is None, returns an empty list and logs a warning.

A tiny pure-Python fallback reads ``tests/fixtures/toy_papers.json`` so the
unit tests do not depend on a live Postgres instance.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

_TOY_PAPERS = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "toy_papers.json"
)

_QUERY = """
SELECT p.pmid,
       p.doi,
       p.title,
       p.authors,
       p.year,
       p.journal,
       p.abstract,
       COUNT(DISTINCT pc.condition_id) AS condition_hits,
       COUNT(DISTINCT pm.modality_id) AS modality_hits
FROM papers p
LEFT JOIN paper_conditions pc ON pc.paper_id = p.id
LEFT JOIN conditions       c  ON c.id       = pc.condition_id
LEFT JOIN paper_modalities pm ON pm.paper_id = p.id
LEFT JOIN modalities       m  ON m.id       = pm.modality_id
WHERE (%(conditions)s::text[] IS NULL OR c.slug = ANY(%(conditions)s))
   OR (%(modalities)s::text[] IS NULL OR m.slug = ANY(%(modalities)s))
GROUP BY p.pmid, p.doi, p.title, p.authors, p.year, p.journal, p.abstract
ORDER BY condition_hits + modality_hits DESC NULLS LAST, p.year DESC NULLS LAST
LIMIT %(top_k)s;
"""


def query_literature(
    conditions: list[str],
    modalities: list[str],
    *,
    top_k: int = 10,
    db_url: str | None = None,
    fallback_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    """Return up to ``top_k`` papers matching conditions / modalities.

    Parameters
    ----------
    conditions : list of str
        Lowercase condition slugs (e.g. ``["adhd", "anxiety"]``).
    modalities : list of str
        Lowercase modality slugs (e.g. ``["neurofeedback", "tdcs"]``).
    top_k : int
        Maximum number of rows to return.
    db_url : str or None
        Postgres DSN. If None, falls back to the env var ``DEEPSYNAPS_DB_URL``
        and ultimately to the toy JSON fixture.
    fallback_path : str, Path, or None
        Optional explicit path to a JSON fallback file. Used when no DB is
        available or the query fails.

    Returns
    -------
    list of dict
        Each dict has keys ``pmid``, ``doi``, ``title``, ``authors``,
        ``year``, ``journal``, ``abstract``, ``relevance_score``.
    """
    dsn = db_url or os.environ.get("DEEPSYNAPS_DB_URL")
    if dsn:
        try:
            return _query_postgres(dsn, conditions, modalities, top_k)
        except Exception as exc:
            log.warning("Postgres RAG query failed (%s); falling back to toy papers.", exc)

    return _load_fallback(conditions, modalities, top_k, fallback_path)


def _query_postgres(
    dsn: str, conditions: list[str], modalities: list[str], top_k: int
) -> list[dict[str, Any]]:
    try:
        import psycopg
    except Exception as exc:
        raise RuntimeError(f"psycopg unavailable: {exc}") from exc

    cond_arr = [c.lower() for c in conditions] or None
    mod_arr = [m.lower() for m in modalities] or None

    rows: list[dict[str, Any]] = []
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            _QUERY,
            {"conditions": cond_arr, "modalities": mod_arr, "top_k": int(top_k)},
        )
        for row in cur.fetchall():
            pmid, doi, title, authors, year, journal, abstract, chits, mhits = row
            rows.append(
                {
                    "pmid": pmid,
                    "doi": doi,
                    "title": title,
                    "authors": authors,
                    "year": int(year) if year else None,
                    "journal": journal,
                    "abstract": abstract,
                    "relevance_score": float((chits or 0) + (mhits or 0)),
                }
            )
    return rows


def _load_fallback(
    conditions: list[str],
    modalities: list[str],
    top_k: int,
    fallback_path: str | Path | None,
) -> list[dict[str, Any]]:
    path = Path(fallback_path) if fallback_path else _TOY_PAPERS
    if not path.exists():
        log.warning("RAG fallback JSON not found at %s; returning empty list.", path)
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Failed to parse %s (%s); returning empty list.", path, exc)
        return []
    if not isinstance(data, list):
        log.warning("Toy papers JSON is not a list; returning empty.")
        return []

    cond_set = {c.lower() for c in (conditions or [])}
    mod_set = {m.lower() for m in (modalities or [])}

    scored: list[tuple[float, dict[str, Any]]] = []
    for raw in data:
        paper = dict(raw)
        paper_conds = {c.lower() for c in (paper.get("conditions") or [])}
        paper_mods = {m.lower() for m in (paper.get("modalities") or [])}
        score = float(len(paper_conds & cond_set) + len(paper_mods & mod_set))
        if score == 0 and (cond_set or mod_set):
            continue
        paper.setdefault("relevance_score", score)
        scored.append((score, paper))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    out: list[dict[str, Any]] = []
    for _, paper in scored[:top_k]:
        out.append(
            {
                "pmid": paper.get("pmid"),
                "doi": paper.get("doi"),
                "title": paper.get("title"),
                "authors": paper.get("authors"),
                "year": paper.get("year"),
                "journal": paper.get("journal"),
                "abstract": paper.get("abstract"),
                "relevance_score": float(paper.get("relevance_score", 0.0)),
            }
        )
    return out
