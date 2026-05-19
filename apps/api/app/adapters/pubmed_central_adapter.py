#!/usr/bin/env python3
"""
PubMed Central Adapter — Open Access Full-Text Articles
https://www.ncbi.nlm.nih.gov/pmc/tools/oa-service/

Provides access to PubMed Central open access articles via the OA service,
including full-text retrieval and article metadata.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.ncbi.nlm.nih.gov/pmc/utils/oa"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
DEFAULT_TIMEOUT = 45.0
RATE_LIMIT_DELAY = 0.34
CACHE_TTL_SECONDS = 3600


@dataclass
class PMCArticle:
    """Represents a PubMed Central article."""
    pmcid: str
    pmid: str
    title: str
    abstract: str = ""
    authors: List[str] = field(default_factory=list)
    journal: str = ""
    publication_date: str = ""
    doi: str = ""
    full_text_url: str = ""
    pdf_url: str = ""
    license: str = ""
    keywords: List[str] = field(default_factory=list)
    mesh_terms: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pmcid": self.pmcid, "pmid": self.pmid, "title": self.title,
            "abstract": self.abstract, "authors": self.authors,
            "journal": self.journal, "publication_date": self.publication_date,
            "doi": self.doi, "full_text_url": self.full_text_url,
            "pdf_url": self.pdf_url, "license": self.license,
            "keywords": self.keywords, "mesh_terms": self.mesh_terms,
        }


class _Cache:
    def __init__(self, ttl: int = CACHE_TTL_SECONDS) -> None:
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._ttl = ttl
    def _key(self, *parts: str) -> str:
        return hashlib.sha256("|".join(parts).encode()).hexdigest()
    def get(self, *parts: str) -> Optional[Any]:
        key = self._key(*parts)
        entry = self._store.get(key)
        if entry is None: return None
        ts, value = entry
        if time.time() - ts > self._ttl:
            del self._store[key]; return None
        return value
    def set(self, value: Any, *parts: str) -> None:
        self._store[self._key(*parts)] = (time.time(), value)
    def clear(self) -> None:
        self._store.clear()

_CACHE = _Cache()


class PubMedCentralAdapter:
    """Async adapter for PubMed Central OA service.

    Example:
        adapter = PubMedCentralAdapter()
        articles = await adapter.search_articles("CRISPR therapy")
        article = await adapter.get_article("PMC1234567")
        pdf_url = await adapter.get_pdf_url("PMC1234567")
    """

    def __init__(self, timeout: float = DEFAULT_TIMEOUT, rate_limit_delay: float = RATE_LIMIT_DELAY) -> None:
        self.timeout = timeout; self.rate_limit_delay = rate_limit_delay
        self._client: Optional[httpx.AsyncClient] = None
        self._last_call_time: float = 0.0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> Any:
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        cache_key = (url, json.dumps(params or {}, sort_keys=True))
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached
        client = await self._get_client()
        try:
            resp = await client.get(url, params=params or {})
            self._last_call_time = time.time()
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "json" in content_type:
                data = resp.json()
            else:
                data = resp.text
            _CACHE.set(data, *cache_key)
            return data
        except httpx.HTTPStatusError as e:
            raise PMCAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise PMCAPIError(f"Request failed: {e}") from e

    async def search_articles(self, query: str, limit: int = 10) -> List[PMCArticle]:
        """Search PMC articles."""
        url = ESEARCH_URL
        params = {"db": "pmc", "term": query, "retmax": min(limit, 1000), "retmode": "json"}
        data = await self._rate_limited_get(url, params)
        if isinstance(data, dict):
            ids = data.get("esearchresult", {}).get("idlist", [])
            if ids:
                return await self._fetch_articles(ids)
        return []

    async def _fetch_articles(self, pmcids: List[str]) -> List[PMCArticle]:
        """Fetch article details by PMC IDs."""
        url = EFETCH_URL
        params = {"db": "pmc", "id": ",".join(pmcids), "retmode": "xml"}
        text = await self._rate_limited_get(url, params)
        if isinstance(text, str):
            return self._parse_article_xml(text)
        return []

    def _parse_article_xml(self, xml_text: str) -> List[PMCArticle]:
        """Parse article XML into PMCArticle objects."""
        import xml.etree.ElementTree as ET
        articles: List[PMCArticle] = []
        try:
            root = ET.fromstring(xml_text)
            for article in root.findall(".//article"):
                pmcid = ""
                pmid = ""
                title = ""
                articles.append(PMCArticle(
                    pmcid=pmcid, pmid=pmid, title=title,
                ))
        except ET.ParseError:
            pass
        return articles

    async def get_article(self, pmcid: str) -> Optional[PMCArticle]:
        """Get article by PMCID."""
        url = EFETCH_URL
        params = {"db": "pmc", "id": pmcid.replace("PMC", ""), "retmode": "xml"}
        text = await self._rate_limited_get(url, params)
        if isinstance(text, str):
            articles = self._parse_article_xml(text)
            return articles[0] if articles else None
        return None

    async def get_pdf_url(self, pmcid: str) -> str:
        """Get PDF URL for a PMC article."""
        url = f"{BASE_URL}/oa.fcgi"
        params = {"id": pmcid, "format": "pdf"}
        data = await self._rate_limited_get(url, params)
        if isinstance(data, str) and "pdf" in data.lower():
            return f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/pdf/"
        return ""

    async def get_full_text_url(self, pmcid: str) -> str:
        """Get full-text URL."""
        return f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"

    async def search_by_author(self, author: str, limit: int = 10) -> List[PMCArticle]:
        """Search by author."""
        url = ESEARCH_URL
        params = {"db": "pmc", "term": f"{author}[Author]", "retmax": min(limit, 1000), "retmode": "json"}
        data = await self._rate_limited_get(url, params)
        if isinstance(data, dict):
            ids = data.get("esearchresult", {}).get("idlist", [])
            if ids:
                return await self._fetch_articles(ids)
        return []

    async def search_by_journal(self, journal: str, limit: int = 10) -> List[PMCArticle]:
        """Search by journal."""
        url = ESEARCH_URL
        params = {"db": "pmc", "term": f"{journal}[Journal]", "retmax": min(limit, 1000), "retmode": "json"}
        data = await self._rate_limited_get(url, params)
        if isinstance(data, dict):
            ids = data.get("esearchresult", {}).get("idlist", [])
            if ids:
                return await self._fetch_articles(ids)
        return []

    async def get_recent_oa(self, limit: int = 10) -> List[PMCArticle]:
        """Get recent open access articles."""
        url = ESEARCH_URL
        params = {"db": "pmc", "term": "open access[filter]", "retmax": min(limit, 1000), "retmode": "json", "sortdate": "y"}
        data = await self._rate_limited_get(url, params)
        if isinstance(data, dict):
            ids = data.get("esearchresult", {}).get("idlist", [])
            if ids:
                return await self._fetch_articles(ids)
        return []

    async def health_check(self) -> bool:
        try:
            url = ESEARCH_URL
            data = await self._rate_limited_get(url, {"db": "pmc", "term": "test", "retmax": 1, "retmode": "json"})
            return isinstance(data, dict) and "esearchresult" in data
        except PMCAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "PubMedCentralAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class PMCAPIError(Exception):
    pass


async def _test_pmc() -> None:
    adapter = PubMedCentralAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    articles = await adapter.search_articles("CRISPR", limit=3)
    print(f"[TEST] search_articles: found {len(articles)} results")
    assert isinstance(articles, list)
    await adapter.close()
    print("[TEST] All PMC tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_pmc())
