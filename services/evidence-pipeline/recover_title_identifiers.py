from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db as _db


CROSSREF_SEARCH_URL = "https://api.crossref.org/works"
OPENALEX_SEARCH_URL = "https://api.openalex.org/works"
MAILTO = "dr.aliyildirim123@gmail.com"
USER_AGENT = f"DeepSynaps-Protocol-Studio/1.0 (mailto:{MAILTO})"


def normalize_title(text: str | None) -> str:
    if not text:
        return ""
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def token_set(text: str | None) -> set[str]:
    return {tok for tok in normalize_title(text).split() if len(tok) > 2}


def title_similarity(a: str | None, b: str | None) -> float:
    na = normalize_title(a)
    nb = normalize_title(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    ta = token_set(a)
    tb = token_set(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def acceptable_match(local_title: str, local_year: int | None, candidate_title: str, candidate_year: int | None) -> bool:
    sim = title_similarity(local_title, candidate_title)
    if sim >= 0.97:
        return True
    if sim >= 0.86 and local_year and candidate_year and abs(local_year - candidate_year) <= 1:
        return True
    return False


def _http_json(url: str) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            return json.loads(response.read().decode())
    except Exception:
        return None


def _openalex_abstract(inv: dict | None) -> str | None:
    if not inv:
        return None
    total = 0
    for positions in inv.values():
        if positions:
            total = max(total, max(positions) + 1)
    words = [""] * total
    for token, positions in inv.items():
        for p in positions:
            if 0 <= p < total:
                words[p] = token
    return " ".join(w for w in words if w) or None


def search_crossref(title: str, rows: int = 5) -> list[dict]:
    url = (
        f"{CROSSREF_SEARCH_URL}?query.title={urllib.parse.quote(title)}"
        f"&rows={rows}&mailto={urllib.parse.quote(MAILTO)}"
    )
    data = _http_json(url) or {}
    return (data.get("message") or {}).get("items") or []


def search_openalex(title: str, per_page: int = 5) -> list[dict]:
    url = (
        f"{OPENALEX_SEARCH_URL}?search={urllib.parse.quote(title)}"
        f"&per-page={per_page}&mailto={urllib.parse.quote(MAILTO)}"
    )
    data = _http_json(url) or {}
    return data.get("results") or []


def _crossref_year(rec: dict) -> int | None:
    for key in ("published-print", "published-online", "created", "issued"):
        parts = ((rec.get(key) or {}).get("date-parts") or [])
        if parts and parts[0] and isinstance(parts[0][0], int):
            return parts[0][0]
    return None


def _crossref_abstract(text: str | None) -> str | None:
    if not text:
        return None
    return " ".join(text.replace("<jats:p>", " ").replace("</jats:p>", " ").split()) or None


def _best_candidate(title: str, year: int | None, candidates: list[dict], source: str) -> dict | None:
    for rec in candidates:
        if source == "crossref":
            candidate_title = ((rec.get("title") or [None])[0] if isinstance(rec.get("title"), list) else rec.get("title")) or ""
            candidate_year = _crossref_year(rec)
        else:
            candidate_title = rec.get("title") or ""
            candidate_year = rec.get("publication_year")
        if acceptable_match(title, year, candidate_title, candidate_year):
            return rec
    return None


def select_candidates(conn, limit: int, min_title_len: int, routed_only: bool) -> list[dict]:
    sql = """
        SELECT p.id, p.title, p.year
          FROM papers p
         WHERE (p.abstract IS NULL OR trim(p.abstract) = '')
           AND p.abstract_source IS NULL
           AND (p.pmid IS NULL OR trim(p.pmid) = '')
           AND (p.doi IS NULL OR trim(p.doi) = '')
           AND p.title IS NOT NULL
           AND length(trim(p.title)) >= ?
    """
    params: list[object] = [min_title_len]
    if routed_only:
        sql += " AND EXISTS (SELECT 1 FROM paper_indications pi WHERE pi.paper_id = p.id)"
    sql += " ORDER BY COALESCE(p.cited_by_count, 0) DESC, p.year DESC, p.id ASC LIMIT ?"
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def recover(conn, limit: int, min_title_len: int, routed_only: bool, dry: bool) -> dict:
    candidates = select_candidates(conn, limit, min_title_len, routed_only)
    summary = {
        "targeted": len(candidates),
        "crossref_matches": 0,
        "openalex_matches": 0,
        "abstracts_filled": 0,
        "identifier_only": 0,
        "collisions": 0,
        "not_found": 0,
    }
    for row in candidates:
        title = row["title"]
        year = row["year"]
        match = None
        source = None

        crossref = _best_candidate(title, year, search_crossref(title), "crossref")
        if crossref:
            match = {
                "doi": (crossref.get("DOI") or "").lower().strip() or None,
                "openalex_id": None,
                "pmid": None,
                "abstract": _crossref_abstract(crossref.get("abstract")),
            }
            source = "crossref:title_match"
            summary["crossref_matches"] += 1
        else:
            openalex = _best_candidate(title, year, search_openalex(title), "openalex")
            if openalex:
                ids = openalex.get("ids") or {}
                pmid = ids.get("pmid")
                if isinstance(pmid, str):
                    pmid = pmid.rsplit("/", 1)[-1]
                match = {
                    "doi": (openalex.get("doi") or "").replace("https://doi.org/", "").lower() or None,
                    "openalex_id": openalex.get("id"),
                    "pmid": pmid,
                    "abstract": _openalex_abstract(openalex.get("abstract_inverted_index")),
                }
                source = "openalex:title_match"
                summary["openalex_matches"] += 1

        if not match:
            summary["not_found"] += 1
            time.sleep(0.1)
            continue

        if dry:
            print(f"id={row['id']} source={source} title={title[:90]}")
        else:
            try:
                conn.execute(
                    "UPDATE papers SET "
                    "doi = COALESCE(doi, ?), "
                    "openalex_id = COALESCE(openalex_id, ?), "
                    "pmid = COALESCE(pmid, ?), "
                    "abstract = COALESCE(abstract, ?), "
                    "abstract_source = CASE WHEN abstract IS NULL AND ? IS NOT NULL THEN ? ELSE abstract_source END, "
                    "last_ingested = datetime('now') "
                    "WHERE id = ?",
                    (
                        match["doi"],
                        match["openalex_id"],
                        match["pmid"],
                        match["abstract"],
                        match["abstract"],
                        source,
                        row["id"],
                    ),
                )
            except sqlite3.IntegrityError:
                summary["collisions"] += 1
                time.sleep(0.12)
                continue
        if match["abstract"]:
            summary["abstracts_filled"] += 1
        else:
            summary["identifier_only"] += 1
        time.sleep(0.12)
    return summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None)
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--min-title-len", type=int, default=40)
    ap.add_argument("--routed-only", action="store_true")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    conn = _db.connect(args.db)
    print(json.dumps(recover(conn, args.limit, args.min_title_len, args.routed_only, args.dry), indent=2))


if __name__ == "__main__":
    main()
