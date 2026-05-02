"""CORE API adapter: search OA research metadata and upsert papers."""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime

API_KEY = os.environ.get("CORE_API_KEY", "")
BASE = "https://api.core.ac.uk/v3/search/works"


def _request_json(url: str) -> dict:
    headers = {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.loads(response.read().decode())


def search(query: str, limit: int = 50, max_records: int = 200) -> list[dict]:
    out: list[dict] = []
    offset = 0
    page_size = max(1, min(limit, 100))
    while len(out) < max_records:
        url = (
            f"{BASE}?q={urllib.parse.quote(query)}"
            f"&limit={page_size}&offset={offset}"
        )
        data = _request_json(url)
        items = data.get("results") or []
        out.extend(items)
        if not items or len(items) < page_size:
            break
        offset += page_size
        time.sleep(2.1 if not API_KEY else 0.25)
    return out[:max_records]


def upsert_papers(conn, results: list[dict], indication_id: int | None = None) -> int:
    n = 0
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    for rec in results:
        identifiers = rec.get("identifiers") or []
        doi = None
        for identifier in identifiers:
            if isinstance(identifier, str) and identifier.lower().startswith("doi:"):
                doi = identifier.split(":", 1)[1].lower().strip()
                break
        title = rec.get("title")
        abstract = rec.get("abstract") or rec.get("description")
        year = rec.get("yearPublished")
        journal = (rec.get("publisher") or rec.get("journals") or [None])[0] if isinstance(rec.get("journals"), list) else rec.get("publisher")
        authors = [a.get("name") for a in (rec.get("authors") or []) if isinstance(a, dict) and a.get("name")]
        cited = rec.get("citationCount")
        download_url = rec.get("downloadUrl") or rec.get("fullTextIdentifier")
        pub_types = [rec.get("documentType")] if rec.get("documentType") else []

        existing = conn.execute(
            "SELECT id, sources_json FROM papers WHERE (doi IS NOT NULL AND doi=?)",
            (doi,),
        ).fetchone() if doi else None
        if existing:
            srcs = set(json.loads(existing["sources_json"] or "[]"))
            srcs.add("core")
            conn.execute(
                "UPDATE papers SET doi=COALESCE(doi,?), title=COALESCE(title,?), abstract=COALESCE(abstract,?), "
                "year=COALESCE(year,?), journal=COALESCE(journal,?), authors_json=COALESCE(authors_json,?), "
                "pub_types_json=COALESCE(pub_types_json,?), cited_by_count=COALESCE(cited_by_count,?), "
                "oa_url=COALESCE(oa_url,?), is_oa=COALESCE(is_oa,?), sources_json=?, last_ingested=? WHERE id=?",
                (
                    doi, title, abstract, year, journal,
                    json.dumps(authors, ensure_ascii=False),
                    json.dumps(pub_types, ensure_ascii=False),
                    cited, download_url, 1 if download_url else None,
                    json.dumps(sorted(srcs)), now, existing["id"],
                ),
            )
            paper_id = existing["id"]
        else:
            cur = conn.execute(
                "INSERT INTO papers(doi, title, abstract, year, journal, authors_json, pub_types_json, "
                "cited_by_count, oa_url, is_oa, sources_json, last_ingested) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    doi, title, abstract, year, journal,
                    json.dumps(authors, ensure_ascii=False),
                    json.dumps(pub_types, ensure_ascii=False),
                    cited, download_url, 1 if download_url else None,
                    json.dumps(["core"]), now,
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
