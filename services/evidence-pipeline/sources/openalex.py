"""OpenAlex adapter: search and upsert papers, supplementing PubMed data with
citation counts and OpenAlex IDs. No API key required (polite pool via mailto)."""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime

MAILTO = os.environ.get("UNPAYWALL_EMAIL", "research@example.com")


def search(query: str, per_page: int = 200, max_records: int = 400) -> list[dict]:
    """Paginated search. Returns list of OpenAlex work records (abbreviated)."""
    out = []
    cursor = "*"
    url_base = (
        "https://api.openalex.org/works?search=" + urllib.parse.quote(query)
        + f"&per-page={per_page}&mailto={urllib.parse.quote(MAILTO)}"
    )
    while len(out) < max_records:
        url = url_base + f"&cursor={urllib.parse.quote(cursor)}"
        with urllib.request.urlopen(url, timeout=40) as r:
            data = json.loads(r.read().decode())
        results = data.get("results", [])
        out.extend(results)
        meta = data.get("meta", {})
        cursor = meta.get("next_cursor")
        if not cursor or not results:
            break
        time.sleep(0.2)
    return out[:max_records]


def _abstract_from_inverted(inv: dict | None) -> str | None:
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


def upsert_papers(conn, results: list[dict], indication_id: int | None = None) -> int:
    n = 0
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    for rec in results:
        oa_id = rec.get("id")  # e.g. https://openalex.org/W123...
        title = rec.get("title")
        year = rec.get("publication_year")
        doi = (rec.get("doi") or "").replace("https://doi.org/", "").lower() or None
        abstract = _abstract_from_inverted(rec.get("abstract_inverted_index"))
        journal = None
        host = rec.get("host_venue") or rec.get("primary_location", {}).get("source") or {}
        if isinstance(host, dict):
            journal = host.get("display_name")
        authors = [a.get("author", {}).get("display_name") for a in (rec.get("authorships") or []) if a.get("author")]
        pub_types = []
        t = rec.get("type")
        if t:
            pub_types.append(t)
        cited = rec.get("cited_by_count")
        pmid = None
        ids = rec.get("ids") or {}
        pmid_val = ids.get("pmid")
        if isinstance(pmid_val, str):
            pmid = pmid_val.rsplit("/", 1)[-1]

        # Match on pmid, doi, or openalex_id
        existing = conn.execute(
            "SELECT id, sources_json FROM papers WHERE openalex_id=? "
            "OR (pmid IS NOT NULL AND pmid=?) OR (doi IS NOT NULL AND doi=?)",
            (oa_id, pmid, doi),
        ).fetchone()
        if existing:
            srcs = set(json.loads(existing["sources_json"] or "[]"))
            srcs.add("openalex")
            conn.execute(
                "UPDATE papers SET openalex_id=COALESCE(openalex_id,?), "
                "pmid=COALESCE(pmid,?), doi=COALESCE(doi,?), "
                "title=COALESCE(title,?), abstract=COALESCE(abstract,?), "
                "year=COALESCE(year,?), journal=COALESCE(journal,?), "
                "cited_by_count=COALESCE(?,cited_by_count), "
                "sources_json=?, last_ingested=? WHERE id=?",
                (
                    oa_id, pmid, doi, title, abstract, year, journal, cited,
                    json.dumps(sorted(srcs)), now, existing["id"],
                ),
            )
            paper_id = existing["id"]
        else:
            cur = conn.execute(
                "INSERT INTO papers(openalex_id, pmid, doi, title, abstract, year, journal, "
                "authors_json, pub_types_json, cited_by_count, sources_json, last_ingested) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    oa_id, pmid, doi, title, abstract, year, journal,
                    json.dumps(authors, ensure_ascii=False),
                    json.dumps(pub_types, ensure_ascii=False),
                    cited, json.dumps(["openalex"]), now,
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
