"""qEEG literature retrieval (RAG) service.

Thin facade that returns a ranked list of relevant literature references for a
given set of flagged conditions + neuromodulation modalities. The qEEG AI
interpreter calls this module to ground its narrative in published evidence.

Resolution order
----------------
1. If the sibling ``deepsynaps_qeeg`` package exposes a
   ``report.rag.query_literature`` function, delegate to it. This is the
   authoritative implementation when the MNE extra is installed.
2. Else, if a SQLAlchemy ``Session`` is provided, query the evidence DB
   directly. Tries a few plausible table naming schemes (the ~87k paper DB
   uses ``papers`` + ``paper_indications``; the qEEG scaffold spec assumes
   ``paper_conditions`` / ``paper_modalities`` / ``conditions`` / ``modalities``).
3. Else return ``[]`` and log a warning. Never raises.

Every returned dict matches CONTRACT §5 shape exactly:

``{"pmid", "doi", "title", "authors", "year", "journal", "abstract", "relevance_score"}``
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
from pathlib import Path
from typing import Any, Optional

_log = logging.getLogger(__name__)


# ── Public API ──────────────────────────────────────────────────────────────


async def query_literature(
    conditions: list[str],
    modalities: list[str],
    *,
    top_k: int = 10,
    db_session: Optional[Any] = None,
) -> list[dict]:
    """Return top-N literature references for the given conditions + modalities.

    Parameters
    ----------
    conditions
        Lowercase condition slugs (e.g. ``["adhd", "anxiety"]``).
    modalities
        Lowercase modality slugs (e.g. ``["tdcs", "neurofeedback"]``).
    top_k
        Maximum number of references to return. Defaults to 10.
    db_session
        Optional SQLAlchemy Session against the Studio DB. Used only for the
        relational fallback path. Not required when the sibling package is
        available.

    Returns
    -------
    list[dict]
        Each item shaped per CONTRACT §5. An empty list is returned on any
        error path — this function never raises.
    """
    clean_conditions = [str(c).strip().lower() for c in (conditions or []) if c]
    clean_modalities = [str(m).strip().lower() for m in (modalities or []) if m]

    if not clean_conditions and not clean_modalities:
        _log.info("qeeg_rag.query_literature called with empty conditions + modalities")
        return []

    # ── Path 1: delegate to sibling deepsynaps_qeeg package ──────────────
    try:
        from deepsynaps_qeeg.report.rag import (  # type: ignore[import-not-found]
            query_literature as _sibling_query,
        )
    except Exception:
        _sibling_query = None  # type: ignore[assignment]

    if _sibling_query is not None:
        try:
            result = _sibling_query(
                conditions=clean_conditions,
                modalities=clean_modalities,
                top_k=top_k,
            )
            # Sibling may be sync or async. Handle both.
            if hasattr(result, "__await__"):
                result = await result  # type: ignore[assignment]
            return _normalise_refs(result or [], top_k=top_k)
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning("deepsynaps_qeeg.report.rag.query_literature failed: %s", exc)
            # fall through to DB path

    # ── Path 2: query the evidence DB (sqlite) directly ──────────────────
    refs = _query_evidence_sqlite(clean_conditions, clean_modalities, top_k=top_k)
    if refs:
        return refs

    # ── Path 3: try SQLAlchemy session (relational fallback) ─────────────
    if db_session is not None:
        try:
            refs = _query_via_sqlalchemy(
                db_session, clean_conditions, clean_modalities, top_k=top_k
            )
            if refs:
                return refs
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning("qeeg_rag SQLAlchemy fallback failed: %s", exc)

    _log.warning(
        "qeeg_rag.query_literature: no backend available (conditions=%s, modalities=%s)",
        clean_conditions,
        clean_modalities,
    )
    return []


# ── Helpers ─────────────────────────────────────────────────────────────────


def _normalise_refs(raw: list[Any], *, top_k: int) -> list[dict]:
    """Coerce arbitrary shapes into the canonical CONTRACT §5 dict."""
    out: list[dict] = []
    for item in raw[: max(top_k, 0)]:
        if not isinstance(item, dict):
            continue
        authors = item.get("authors") or []
        if isinstance(authors, str):
            try:
                parsed = json.loads(authors)
                authors = parsed if isinstance(parsed, list) else [authors]
            except (ValueError, TypeError):
                authors = [a.strip() for a in authors.split(",") if a.strip()]
        out.append({
            "pmid": item.get("pmid") or None,
            "doi": item.get("doi") or None,
            "title": item.get("title") or "",
            "authors": list(authors) if authors else [],
            "year": _coerce_int(item.get("year")),
            "journal": item.get("journal") or None,
            "abstract": item.get("abstract") or "",
            "relevance_score": float(item.get("relevance_score") or 0.0),
        })
    return out


def _coerce_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


# ── SQLite evidence DB path ─────────────────────────────────────────────────


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


def _query_evidence_sqlite(
    conditions: list[str],
    modalities: list[str],
    *,
    top_k: int,
) -> list[dict]:
    """Query the on-disk evidence.db (87k-paper corpus) if available."""
    path = _evidence_db_path()
    if not path:
        return []

    conn: Optional[sqlite3.Connection] = None
    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA query_only = 1")
        except sqlite3.DatabaseError:
            pass

        tables = {
            r["name"] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }

        if "papers" not in tables:
            return []

        # Prefer relational condition/modality linkage if present.
        has_paper_conditions = "paper_conditions" in tables and "conditions" in tables
        has_paper_modalities = "paper_modalities" in tables and "modalities" in tables
        has_paper_indications = "paper_indications" in tables and "indications" in tables

        terms = [t for t in (conditions + modalities) if t]
        if not terms:
            return []

        if has_paper_conditions or has_paper_modalities:
            return _query_paper_condition_schema(
                conn,
                conditions,
                modalities,
                top_k=top_k,
                has_paper_conditions=has_paper_conditions,
                has_paper_modalities=has_paper_modalities,
            )

        if has_paper_indications:
            return _query_paper_indication_schema(
                conn, conditions, modalities, top_k=top_k
            )

        # Last resort — LIKE search on title + abstract.
        return _query_like_fallback(conn, terms, top_k=top_k)

    except Exception as exc:  # pragma: no cover - defensive
        _log.warning("qeeg_rag sqlite evidence path failed: %s", exc)
        return []
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _paper_row_to_ref(row: sqlite3.Row, score: float) -> dict:
    cols = row.keys()

    def _col(name: str) -> Any:
        return row[name] if name in cols else None

    authors_raw = _col("authors_json") or _col("authors") or "[]"
    try:
        authors = json.loads(authors_raw) if isinstance(authors_raw, str) else []
    except (ValueError, TypeError):
        authors = []

    return {
        "pmid": (str(_col("pmid")) if _col("pmid") else None),
        "doi": _col("doi") or None,
        "title": _col("title") or "",
        "authors": authors if isinstance(authors, list) else [],
        "year": _coerce_int(_col("year")),
        "journal": _col("journal") or None,
        "abstract": _col("abstract") or "",
        "relevance_score": float(score),
    }


def _query_paper_condition_schema(
    conn: sqlite3.Connection,
    conditions: list[str],
    modalities: list[str],
    *,
    top_k: int,
    has_paper_conditions: bool,
    has_paper_modalities: bool,
) -> list[dict]:
    scored: dict[str, tuple[float, sqlite3.Row]] = {}

    if has_paper_conditions and conditions:
        placeholders = ",".join("?" * len(conditions))
        q = (
            "SELECT p.id, p.pmid, p.doi, p.title, p.year, p.journal, p.abstract, "
            "p.authors_json, COUNT(*) as hits "
            "FROM papers p "
            "JOIN paper_conditions pc ON pc.paper_id = p.id "
            "JOIN conditions c ON c.id = pc.condition_id "
            f"WHERE LOWER(c.slug) IN ({placeholders}) "
            "GROUP BY p.id "
            "LIMIT ?"
        )
        rows = conn.execute(q, (*conditions, top_k * 4)).fetchall()
        for r in rows:
            scored[str(r["id"])] = (2.0 * float(r["hits"]), r)

    if has_paper_modalities and modalities:
        placeholders = ",".join("?" * len(modalities))
        q = (
            "SELECT p.id, p.pmid, p.doi, p.title, p.year, p.journal, p.abstract, "
            "p.authors_json, COUNT(*) as hits "
            "FROM papers p "
            "JOIN paper_modalities pm ON pm.paper_id = p.id "
            "JOIN modalities m ON m.id = pm.modality_id "
            f"WHERE LOWER(m.slug) IN ({placeholders}) "
            "GROUP BY p.id "
            "LIMIT ?"
        )
        rows = conn.execute(q, (*modalities, top_k * 4)).fetchall()
        for r in rows:
            pid = str(r["id"])
            prev = scored.get(pid, (0.0, r))
            scored[pid] = (prev[0] + 1.0 * float(r["hits"]), r)

    ranked = sorted(scored.values(), key=lambda t: t[0], reverse=True)[:top_k]
    return [_paper_row_to_ref(row, score) for score, row in ranked]


def _query_paper_indication_schema(
    conn: sqlite3.Connection,
    conditions: list[str],
    modalities: list[str],
    *,
    top_k: int,
) -> list[dict]:
    terms = [*conditions, *modalities]
    if not terms:
        return []
    placeholders = ",".join("?" * len(terms))
    q = (
        "SELECT p.id, p.pmid, p.doi, p.title, p.year, p.journal, p.abstract, "
        "p.authors_json, COUNT(*) as hits "
        "FROM papers p "
        "JOIN paper_indications pi ON pi.paper_id = p.id "
        "JOIN indications i ON i.id = pi.indication_id "
        f"WHERE LOWER(i.slug) IN ({placeholders}) "
        f"OR LOWER(i.condition) IN ({placeholders}) "
        f"OR LOWER(i.modality) IN ({placeholders}) "
        "GROUP BY p.id ORDER BY hits DESC LIMIT ?"
    )
    try:
        rows = conn.execute(q, (*terms, *terms, *terms, top_k)).fetchall()
    except sqlite3.DatabaseError:
        return []
    return [_paper_row_to_ref(r, float(r["hits"])) for r in rows]


def _query_like_fallback(
    conn: sqlite3.Connection,
    terms: list[str],
    *,
    top_k: int,
) -> list[dict]:
    clauses = []
    params: list[str] = []
    for term in terms:
        pat = f"%{term}%"
        clauses.append("(LOWER(title) LIKE ? OR LOWER(abstract) LIKE ?)")
        params.extend([pat, pat])
    where = " OR ".join(clauses)
    q = (
        "SELECT pmid, doi, title, year, journal, abstract, authors_json "
        f"FROM papers WHERE {where} LIMIT ?"
    )
    try:
        rows = conn.execute(q, (*params, top_k)).fetchall()
    except sqlite3.DatabaseError:
        return []
    return [_paper_row_to_ref(r, 0.5) for r in rows]


# ── SQLAlchemy fallback (Studio DB) ─────────────────────────────────────────


def _query_via_sqlalchemy(
    db_session: Any,
    conditions: list[str],
    modalities: list[str],
    *,
    top_k: int,
) -> list[dict]:
    """Fall back to the Studio DB's ``literature_papers`` table via SQLAlchemy."""
    from sqlalchemy import or_

    from app.persistence.models import LiteraturePaper

    filters = []
    for term in conditions:
        filters.append(LiteraturePaper.condition.ilike(f"%{term}%"))
    for term in modalities:
        filters.append(LiteraturePaper.modality.ilike(f"%{term}%"))
    if not filters:
        return []

    rows = (
        db_session.query(LiteraturePaper)
        .filter(or_(*filters))
        .limit(top_k)
        .all()
    )

    out: list[dict] = []
    for p in rows:
        authors_raw = p.authors or ""
        if authors_raw.strip().startswith("["):
            try:
                authors = json.loads(authors_raw)
                if not isinstance(authors, list):
                    authors = [str(authors)]
            except (ValueError, TypeError):
                authors = [a.strip() for a in authors_raw.split(",") if a.strip()]
        else:
            authors = [a.strip() for a in authors_raw.split(",") if a.strip()]
        out.append({
            "pmid": p.pubmed_id or None,
            "doi": p.doi or None,
            "title": p.title or "",
            "authors": authors,
            "year": p.year,
            "journal": p.journal or None,
            "abstract": p.abstract or "",
            "relevance_score": 1.0,
        })
    return out
