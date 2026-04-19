"""pubmed_client.py — thin wrapper over PubMed E-utilities.

Used by the Live Literature Watch cron worker (see docs/SPEC-live-literature-watch.md).
Intentionally independent of `sources/pubmed.py` — that file is the legacy ingest
adapter that writes into the `papers` table. This client writes nothing to the DB;
it just returns normalised dicts so the cron worker can decide what to insert into
`literature_watch`.

Env:
    PUBMED_API_KEY  — optional. Bumps rate limit 3/s -> 10/s.
    PUBMED_EMAIL    — NCBI asks for a contact email on every request. Best practice
                      but not strictly enforced; we include it when present.
    NCBI_API_KEY    — fallback, since the rest of the codebase uses this name.
"""

from __future__ import annotations

import json
import os
import time
import xml.etree.ElementTree as ET
from typing import Any

import requests

BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
DEFAULT_TIMEOUT = 30
MAX_RETRIES = 4
RETRY_STATUSES = {429, 500, 502, 503, 504}


class PubMedClient:
    """Stateless-ish PubMed E-utilities client with sleep-based rate limiting."""

    def __init__(
        self,
        api_key: str | None = None,
        contact_email: str | None = None,
        tool_name: str = "deepsynaps-literature-watch",
    ) -> None:
        self.api_key = (
            api_key
            or os.environ.get("PUBMED_API_KEY")
            or os.environ.get("NCBI_API_KEY")
            or None
        ) or None
        self.contact_email = contact_email or os.environ.get("PUBMED_EMAIL") or None
        self.tool_name = tool_name
        # NCBI policy: 3 req/s without key, 10 req/s with key. Stay under.
        self._min_interval = 0.11 if self.api_key else 0.34
        self._last_call_ts = 0.0
        self._sleep_count = 0  # rate-limit sleeps, exposed for logging

    # ------------------------------------------------------------------ internal
    def _rate_limit_sleep(self) -> None:
        now = time.monotonic()
        delta = now - self._last_call_ts
        if delta < self._min_interval:
            time.sleep(self._min_interval - delta)
            self._sleep_count += 1
        self._last_call_ts = time.monotonic()

    def _base_params(self) -> dict[str, str]:
        params: dict[str, str] = {"tool": self.tool_name}
        if self.api_key:
            params["api_key"] = self.api_key
        if self.contact_email:
            params["email"] = self.contact_email
        return params

    def _get(self, endpoint: str, params: dict[str, Any]) -> requests.Response:
        """GET with rate-limit sleep + exponential backoff on 429/5xx."""
        url = f"{BASE}/{endpoint}"
        merged = {**self._base_params(), **params}
        backoff = 1.0
        last_exc: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            self._rate_limit_sleep()
            try:
                resp = requests.get(url, params=merged, timeout=DEFAULT_TIMEOUT)
            except requests.RequestException as e:
                last_exc = e
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(backoff)
                backoff *= 2
                continue
            if resp.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
                time.sleep(backoff)
                backoff *= 2
                continue
            resp.raise_for_status()
            return resp
        # Defensive: should not reach here.
        raise RuntimeError(f"unreachable pubmed retry path ({last_exc!r})")

    # ------------------------------------------------------------------ esearch
    def esearch(self, query: str, days_back: int = 30, max_results: int = 50) -> list[str]:
        """Return PMIDs matching query, restricted to the last `days_back` days.

        Uses the `reldate` + `datetype=pdat` pair rather than building a date range
        string — both NCBI-documented.
        """
        params = {
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": str(max_results),
            "sort": "date",
        }
        if days_back and days_back > 0:
            params["reldate"] = str(days_back)
            params["datetype"] = "pdat"
        r = self._get("esearch.fcgi", params)
        data = r.json()
        return data.get("esearchresult", {}).get("idlist", []) or []

    # ------------------------------------------------------------------ efetch
    def efetch(self, pmids: list[str]) -> list[dict[str, Any]]:
        """Full metadata records for the given PMIDs. Empty list if pmids is empty."""
        if not pmids:
            return []
        params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
        }
        r = self._get("efetch.fcgi", params)
        return self._parse_pubmed_xml(r.content)

    # ------------------------------------------------------------------ esummary
    def esummary(self, pmids: list[str]) -> dict[str, dict[str, Any]]:
        """Lighter-weight summary (title/authors/journal/year only). Keyed by PMID."""
        if not pmids:
            return {}
        params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "json",
        }
        r = self._get("esummary.fcgi", params)
        data = r.json().get("result", {})
        uids = data.get("uids", [])
        return {uid: data.get(uid, {}) for uid in uids}

    # ------------------------------------------------------------------ public
    def search(
        self,
        query: str,
        days_back: int = 30,
        max_results: int = 50,
    ) -> list[dict[str, Any]]:
        """esearch + efetch in one call. Returns normalised dicts."""
        pmids = self.esearch(query, days_back=days_back, max_results=max_results)
        if not pmids:
            return []
        return self.efetch(pmids)

    # ------------------------------------------------------------------ parsing
    @staticmethod
    def _text(node, path, default=None):
        if node is None:
            return default
        el = node.find(path)
        return el.text if el is not None and el.text else default

    @classmethod
    def _parse_pubmed_xml(cls, xml_bytes: bytes) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        root = ET.fromstring(xml_bytes)
        for art in root.findall(".//PubmedArticle"):
            medline = art.find("MedlineCitation")
            pmid = cls._text(medline, "PMID")
            article = medline.find("Article") if medline is not None else None
            title = cls._text(article, "ArticleTitle")
            abstract = " ".join(
                (el.text or "")
                for el in (article.findall(".//AbstractText") if article is not None else [])
            ).strip() or None
            journal = cls._text(article, "Journal/Title")
            year: int | None = None
            if article is not None:
                y = article.find(".//PubDate/Year")
                if y is not None and y.text and y.text.isdigit():
                    year = int(y.text)
                else:
                    md = article.find(".//PubDate/MedlineDate")
                    if md is not None and md.text:
                        # "2026 Apr" or "2026-2027"
                        tok = md.text.strip().split()[0].split("-")[0]
                        if tok.isdigit():
                            year = int(tok)
            authors: list[str] = []
            if article is not None:
                for a in article.findall(".//Author"):
                    last = cls._text(a, "LastName", "")
                    init = cls._text(a, "Initials", "")
                    coll = cls._text(a, "CollectiveName")
                    if coll:
                        authors.append(coll)
                    elif last:
                        authors.append(f"{last} {init}".strip())
            doi: str | None = None
            for aid in art.findall(".//ArticleId"):
                if aid.attrib.get("IdType") == "doi" and aid.text:
                    doi = aid.text.lower().strip()
                    break
            out.append(
                {
                    "pmid": pmid,
                    "doi": doi,
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "journal": journal,
                    "abstract": abstract,
                }
            )
        return out


# ---------------------------------------------------------------------- CLI test
if __name__ == "__main__":
    import sys

    q = sys.argv[1] if len(sys.argv) > 1 else "rTMS DLPFC depression"
    client = PubMedClient()
    print(
        f"[pubmed_client] api_key={'set' if client.api_key else 'unset'} "
        f"email={client.contact_email or 'unset'} min_interval={client._min_interval:.2f}s"
    )
    results = client.search(q, days_back=30, max_results=5)
    print(f"[pubmed_client] query={q!r} -> {len(results)} result(s) "
          f"(rate-limit sleeps: {client._sleep_count})")
    if results:
        first = results[0]
        preview = {
            "pmid": first.get("pmid"),
            "doi": first.get("doi"),
            "year": first.get("year"),
            "journal": first.get("journal"),
            "title": (first.get("title") or "")[:140],
            "authors": (first.get("authors") or [])[:3],
        }
        print(json.dumps(preview, indent=2, ensure_ascii=False))
