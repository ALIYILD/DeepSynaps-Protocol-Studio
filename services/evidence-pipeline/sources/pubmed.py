"""PubMed E-utilities adapter: esearch → efetch → upsert into papers."""
from __future__ import annotations

import json
import os
import sqlite3
import time
import urllib.parse
import urllib.request
import defusedxml.ElementTree as ET
from datetime import datetime
from typing import Iterable

API_KEY = os.environ.get("NCBI_API_KEY", "")
BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
SLEEP = 0.11 if API_KEY else 0.4  # ceiling: 10 req/s with key, 3 without


def _auth(url: str) -> str:
    return url + (f"&api_key={API_KEY}" if API_KEY else "")


def esearch(query: str, retmax: int = 200) -> list[str]:
    """Return up to retmax PMIDs for query, sorted by relevance."""
    url = _auth(
        f"{BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax={retmax}"
        f"&sort=relevance&term={urllib.parse.quote(query)}"
    )
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.loads(r.read().decode())
    time.sleep(SLEEP)
    return data.get("esearchresult", {}).get("idlist", [])


def efetch(pmids: Iterable[str]) -> list[dict]:
    """Fetch full records for PMIDs in batches of 200."""
    pmids = list(pmids)
    out = []
    for i in range(0, len(pmids), 200):
        batch = pmids[i : i + 200]
        url = _auth(f"{BASE}/efetch.fcgi?db=pubmed&retmode=xml&id={','.join(batch)}")
        with urllib.request.urlopen(url, timeout=60) as r:
            xml = r.read()
        time.sleep(SLEEP)
        out.extend(_parse_pubmed_xml(xml))
    return out


def _text(node, path, default=None):
    if node is None:
        return default
    el = node.find(path)
    return el.text if el is not None and el.text else default


def _parse_pubmed_xml(xml_bytes: bytes) -> list[dict]:
    records = []
    root = ET.fromstring(xml_bytes)
    for art in root.findall(".//PubmedArticle"):
        medline = art.find("MedlineCitation")
        pmid = _text(medline, "PMID")
        article = medline.find("Article") if medline is not None else None
        title = _text(article, "ArticleTitle")
        abstract = " ".join(
            (el.text or "") for el in (article.findall(".//AbstractText") if article is not None else [])
        ).strip() or None
        journal = _text(article, "Journal/Title")
        year = None
        y = article.find(".//PubDate/Year") if article is not None else None
        if y is not None and y.text and y.text.isdigit():
            year = int(y.text)
        authors = []
        if article is not None:
            for a in article.findall(".//Author"):
                last = _text(a, "LastName", "")
                init = _text(a, "Initials", "")
                coll = _text(a, "CollectiveName")
                if coll:
                    authors.append(coll)
                elif last:
                    authors.append(f"{last} {init}".strip())
        pub_types = [
            (pt.text or "") for pt in (article.findall(".//PublicationType") if article is not None else [])
        ]
        doi = None
        for aid in art.findall(".//ArticleId"):
            if aid.attrib.get("IdType") == "doi" and aid.text:
                doi = aid.text.lower().strip()
                break
        records.append(
            {
                "pmid": pmid,
                "doi": doi,
                "title": title,
                "abstract": abstract,
                "year": year,
                "journal": journal,
                "authors_json": json.dumps(authors, ensure_ascii=False),
                "pub_types_json": json.dumps(pub_types, ensure_ascii=False),
            }
        )
    return records


def upsert_papers(conn, records: list[dict], indication_id: int | None = None) -> int:
    """Insert or merge records into papers. Adds 'pubmed' to sources_json. Links to indication."""
    n = 0
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    for rec in records:
        if not rec.get("pmid"):
            continue
        # Prefer DOI match over PMID match: a different paper already holding the
        # same DOI is a hard collision (papers.doi is UNIQUE), and a stale PMID
        # row without DOI cannot be promoted to that DOI without violating
        # uniqueness. So look up by DOI first, then fall back to PMID.
        existing = None
        rec_doi = rec.get("doi")
        if rec_doi:
            existing = conn.execute(
                "SELECT id, sources_json FROM papers WHERE doi=?",
                (rec_doi,),
            ).fetchone()
        if existing is None:
            existing = conn.execute(
                "SELECT id, sources_json FROM papers WHERE pmid=?",
                (rec["pmid"],),
            ).fetchone()
        if existing:
            srcs = set(json.loads(existing["sources_json"] or "[]"))
            srcs.add("pubmed")
            try:
                conn.execute(
                    "UPDATE papers SET pmid=COALESCE(pmid,?), doi=COALESCE(doi,?), "
                    "title=COALESCE(?,title), abstract=COALESCE(?,abstract), "
                    "year=COALESCE(?,year), journal=COALESCE(?,journal), "
                    "authors_json=COALESCE(?,authors_json), pub_types_json=COALESCE(?,pub_types_json), "
                    "sources_json=?, last_ingested=? WHERE id=?",
                    (
                        rec["pmid"], rec_doi,
                        rec["title"], rec["abstract"], rec["year"], rec["journal"],
                        rec["authors_json"], rec["pub_types_json"],
                        json.dumps(sorted(srcs)), now, existing["id"],
                    ),
                )
            except sqlite3.IntegrityError:
                # Promoting the existing row would step on another row's UNIQUE
                # key (most often: this row matched on PMID but rec_doi is
                # already held by a different row from a prior indication).
                # Skip the metadata merge; we still link to indication below.
                pass
            paper_id = existing["id"]
        else:
            try:
                cur = conn.execute(
                    "INSERT INTO papers(pmid, doi, title, abstract, year, journal, authors_json, pub_types_json, sources_json, last_ingested) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (
                        rec["pmid"], rec_doi, rec["title"], rec["abstract"],
                        rec["year"], rec["journal"], rec["authors_json"], rec["pub_types_json"],
                        json.dumps(["pubmed"]), now,
                    ),
                )
                paper_id = cur.lastrowid
                n += 1
            except sqlite3.IntegrityError:
                # Race between SELECT and INSERT (another upsert just took the
                # PMID/DOI). Re-fetch and link below.
                fallback = conn.execute(
                    "SELECT id FROM papers WHERE pmid=? OR (? IS NOT NULL AND doi=?)",
                    (rec["pmid"], rec_doi, rec_doi),
                ).fetchone()
                if fallback is None:
                    continue
                paper_id = fallback["id"]
        if indication_id:
            conn.execute(
                "INSERT OR IGNORE INTO paper_indications(paper_id, indication_id) VALUES (?,?)",
                (paper_id, indication_id),
            )
    return n
