"""Semantic Scholar Academic Graph adapter: search and upsert papers."""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime

API_KEY = os.environ.get("SEMANTIC_SCHOLAR_API_KEY", "")
BASE = "https://api.semanticscholar.org/graph/v1/paper/search"
FIELDS = ",".join(
    [
        "paperId",
        "title",
        "abstract",
        "year",
        "venue",
        "authors",
        "externalIds",
        "citationCount",
        "publicationTypes",
        "openAccessPdf",
    ]
)


def _request_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"x-api-key": API_KEY} if API_KEY else {})
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.loads(response.read().decode())


def search(query: str, limit: int = 100, max_records: int = 200) -> list[dict]:
    out: list[dict] = []
    offset = 0
    page_size = max(1, min(limit, 100))
    while len(out) < max_records:
        url = (
            f"{BASE}?query={urllib.parse.quote(query)}&limit={page_size}&offset={offset}"
            f"&fields={urllib.parse.quote(FIELDS)}"
        )
        data = _request_json(url)
        items = data.get("data") or []
        out.extend(items)
        if not items or len(items) < page_size:
            break
        offset += page_size
        time.sleep(1.0 if API_KEY else 1.2)
    return out[:max_records]


def upsert_papers(conn, results: list[dict], indication_id: int | None = None) -> int:
    n = 0
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    for rec in results:
        external = rec.get("externalIds") or {}
        doi = (external.get("DOI") or "").lower().strip() or None
        pmid = str(external.get("PubMed") or "").strip() or None
        title = rec.get("title")
        abstract = rec.get("abstract")
        year = rec.get("year")
        journal = rec.get("venue")
        authors = [a.get("name") for a in (rec.get("authors") or []) if a.get("name")]
        pub_types = rec.get("publicationTypes") or []
        cited = rec.get("citationCount")
        oa_url = ((rec.get("openAccessPdf") or {}).get("url")) or None

        existing = conn.execute(
            "SELECT id, sources_json FROM papers WHERE (pmid IS NOT NULL AND pmid=?) "
            "OR (doi IS NOT NULL AND doi=?)",
            (pmid, doi),
        ).fetchone()
        if existing:
            srcs = set(json.loads(existing["sources_json"] or "[]"))
            srcs.add("semantic_scholar")
            conn.execute(
                "UPDATE papers SET pmid=COALESCE(pmid,?), doi=COALESCE(doi,?), "
                "title=COALESCE(title,?), abstract=COALESCE(abstract,?), year=COALESCE(year,?), "
                "journal=COALESCE(journal,?), authors_json=COALESCE(authors_json,?), pub_types_json=COALESCE(pub_types_json,?), "
                "cited_by_count=COALESCE(cited_by_count,?), oa_url=COALESCE(oa_url,?), is_oa=COALESCE(is_oa,?), "
                "sources_json=?, last_ingested=? WHERE id=?",
                (
                    pmid, doi, title, abstract, year, journal,
                    json.dumps(authors, ensure_ascii=False),
                    json.dumps(pub_types, ensure_ascii=False),
                    cited, oa_url, 1 if oa_url else None,
                    json.dumps(sorted(srcs)), now, existing["id"],
                ),
            )
            paper_row_id = existing["id"]
        else:
            cur = conn.execute(
                "INSERT INTO papers(pmid, doi, title, abstract, year, journal, authors_json, "
                "pub_types_json, cited_by_count, oa_url, is_oa, sources_json, last_ingested) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    pmid, doi, title, abstract, year, journal,
                    json.dumps(authors, ensure_ascii=False),
                    json.dumps(pub_types, ensure_ascii=False),
                    cited, oa_url, 1 if oa_url else None,
                    json.dumps(["semantic_scholar"]), now,
                ),
            )
            paper_row_id = cur.lastrowid
            n += 1
        if indication_id:
            conn.execute(
                "INSERT OR IGNORE INTO paper_indications(paper_id, indication_id) VALUES (?,?)",
                (paper_row_id, indication_id),
            )
    return n
