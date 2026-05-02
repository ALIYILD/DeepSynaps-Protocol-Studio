"""Crossref REST API adapter: search scholarly metadata and upsert papers."""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime

MAILTO = os.environ.get("CROSSREF_MAILTO") or os.environ.get("UNPAYWALL_EMAIL") or "research@example.com"
BASE = "https://api.crossref.org/works"


def search(query: str, rows: int = 100, max_records: int = 200) -> list[dict]:
    out: list[dict] = []
    offset = 0
    page_size = max(1, min(rows, 100))
    while len(out) < max_records:
        url = (
            f"{BASE}?query={urllib.parse.quote(query)}"
            f"&rows={page_size}&offset={offset}&mailto={urllib.parse.quote(MAILTO)}"
        )
        with urllib.request.urlopen(url, timeout=40) as response:
            data = json.loads(response.read().decode())
        items = (data.get("message") or {}).get("items") or []
        out.extend(items)
        if not items or len(items) < page_size:
            break
        offset += page_size
        time.sleep(0.12)
    return out[:max_records]


def _first_year(rec: dict) -> int | None:
    for key in ("published-print", "published-online", "created", "issued"):
        parts = ((rec.get(key) or {}).get("date-parts") or [])
        if parts and parts[0] and isinstance(parts[0][0], int):
            return parts[0][0]
    return None


def _abstract(value: str | None) -> str | None:
    if not value:
        return None
    text = value.replace("<jats:p>", " ").replace("</jats:p>", " ")
    return " ".join(text.split()) or None


def upsert_papers(conn, results: list[dict], indication_id: int | None = None) -> int:
    n = 0
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    for rec in results:
        doi = (rec.get("DOI") or "").lower().strip() or None
        title = ((rec.get("title") or [None])[0] if isinstance(rec.get("title"), list) else rec.get("title"))
        journal = ((rec.get("container-title") or [None])[0] if isinstance(rec.get("container-title"), list) else rec.get("container-title"))
        year = _first_year(rec)
        authors = []
        for author in rec.get("author") or []:
            given = author.get("given") or ""
            family = author.get("family") or ""
            full = " ".join(part for part in (given, family) if part).strip()
            if full:
                authors.append(full)
        pub_types = [rec.get("type")] if rec.get("type") else []
        cited = rec.get("is-referenced-by-count")
        abstract = _abstract(rec.get("abstract"))

        existing = conn.execute(
            "SELECT id, sources_json FROM papers WHERE (doi IS NOT NULL AND doi=?)",
            (doi,),
        ).fetchone() if doi else None
        if existing:
            srcs = set(json.loads(existing["sources_json"] or "[]"))
            srcs.add("crossref")
            conn.execute(
                "UPDATE papers SET doi=COALESCE(doi,?), title=COALESCE(title,?), "
                "abstract=COALESCE(abstract,?), year=COALESCE(year,?), journal=COALESCE(journal,?), "
                "authors_json=COALESCE(authors_json,?), pub_types_json=COALESCE(pub_types_json,?), "
                "cited_by_count=COALESCE(cited_by_count,?), sources_json=?, last_ingested=? WHERE id=?",
                (
                    doi, title, abstract, year, journal,
                    json.dumps(authors, ensure_ascii=False),
                    json.dumps(pub_types, ensure_ascii=False),
                    cited,
                    json.dumps(sorted(srcs)), now, existing["id"],
                ),
            )
            paper_id = existing["id"]
        else:
            cur = conn.execute(
                "INSERT INTO papers(doi, title, abstract, year, journal, authors_json, pub_types_json, "
                "cited_by_count, sources_json, last_ingested) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    doi, title, abstract, year, journal,
                    json.dumps(authors, ensure_ascii=False),
                    json.dumps(pub_types, ensure_ascii=False),
                    cited, json.dumps(["crossref"]), now,
                ),
            )
            paper_id = cur.lastrowid
            n += 1
        if indication_id:
            conn.execute(
                "INSERT OR IGNORE INTO paper_indications(paper_id, indication_id) VALUES (?,?)",
                (paper_id, indication_id),
            )
    return n
