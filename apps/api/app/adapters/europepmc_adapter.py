#!/usr/bin/env python3
"""
Europe PMC Adapter — European PubMed Central
https://europepmc.org/RestfulWebService

Provides access to Europe PMC literature database including 40M+ abstracts,
6M+ full-text articles, and biomedical preprints.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest"
SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class EuropePMCArticle:
    """Represents an article from Europe PMC."""
    id: str
    title: str
    source: str
    pmid: str = ""
    pmcid: str = ""
    doi: str = ""
    abstract: str = ""
    authors: List[str] = field(default_factory=list)
    journal: str = ""
    publication_date: str = ""
    publication_year: int = 0
    volume: str = ""
    issue: str = ""
    pages: str = ""
    is_open_access: bool = False
    has_pdf: bool = False
    full_text_url: str = ""
    keywords: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "title": self.title, "source": self.source,
            "pmid": self.pmid, "pmcid": self.pmcid, "doi": self.doi,
            "abstract": self.abstract, "authors": self.authors,
            "journal": self.journal, "publication_date": self.publication_date,
            "publication_year": self.publication_year, "volume": self.volume,
            "issue": self.issue, "pages": self.pages,
            "is_open_access": self.is_open_access, "has_pdf": self.has_pdf,
            "full_text_url": self.full_text_url, "keywords": self.keywords,
        }


@dataclass
class EuropePMCCitation:
    """Represents a citation."""
    pmid: str
    title: str
    authors: str
    journal: str
    year: str


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


class EuropePMCAdapter:
    """Async adapter for Europe PMC REST API.

    Example:
        adapter = EuropePMCAdapter()
        articles = await adapter.search("diabetes treatment")
        article = await adapter.get_article_by_pmid("12345678")
        citations = await adapter.get_citations("12345678")
    """

    def __init__(self, timeout: float = DEFAULT_TIMEOUT, rate_limit_delay: float = RATE_LIMIT_DELAY) -> None:
        self.timeout = timeout; self.rate_limit_delay = rate_limit_delay
        self._client: Optional[httpx.AsyncClient] = None
        self._last_call_time: float = 0.0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> Dict[str, Any]:
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
            data = resp.json()
            _CACHE.set(data, *cache_key)
            return data
        except httpx.HTTPStatusError as e:
            raise EuropePMCAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise EuropePMCAPIError(f"Request failed: {e}") from e

    async def search(self, query: str, limit: int = 10) -> List[EuropePMCArticle]:
        """Search articles."""
        url = f"{SEARCH_URL}"
        params = {"query": query, "pageSize": min(limit, 1000), "format": "json", "resultType": "core"}
        data = await self._rate_limited_get(url, params)
        results = data.get("resultList", {}).get("result", [])
        return [self._parse_article(r) for r in results]

    async def get_article_by_pmid(self, pmid: str) -> Optional[EuropePMCArticle]:
        """Get article by PMID."""
        url = f"{SEARCH_URL}"
        params = {"query": f"EXT_ID:{pmid}", "format": "json", "resultType": "core"}
        data = await self._rate_limited_get(url, params)
        results = data.get("resultList", {}).get("result", [])
        return self._parse_article(results[0]) if results else None

    async def get_article_by_pmcid(self, pmcid: str) -> Optional[EuropePMCArticle]:
        """Get article by PMCID."""
        url = f"{SEARCH_URL}"
        params = {"query": f"PMCID:{pmcid}", "format": "json", "resultType": "core"}
        data = await self._rate_limited_get(url, params)
        results = data.get("resultList", {}).get("result", [])
        return self._parse_article(results[0]) if results else None

    async def get_article_by_doi(self, doi: str) -> Optional[EuropePMCArticle]:
        """Get article by DOI."""
        url = f"{SEARCH_URL}"
        params = {"query": f"DOI:{doi}", "format": "json", "resultType": "core"}
        data = await self._rate_limited_get(url, params)
        results = data.get("resultList", {}).get("result", [])
        return self._parse_article(results[0]) if results else None

    async def search_by_author(self, author: str, limit: int = 10) -> List[EuropePMCArticle]:
        """Search by author."""
        url = f"{SEARCH_URL}"
        params = {"query": f"AUTH:"{author}"", "pageSize": min(limit, 1000), "format": "json", "resultType": "core"}
        data = await self._rate_limited_get(url, params)
        results = data.get("resultList", {}).get("result", [])
        return [self._parse_article(r) for r in results]

    async def search_by_journal(self, journal: str, limit: int = 10) -> List[EuropePMCArticle]:
        """Search by journal."""
        url = f"{SEARCH_URL}"
        params = {"query": f"JOURNAL:"{journal}"", "pageSize": min(limit, 1000), "format": "json", "resultType": "core"}
        data = await self._rate_limited_get(url, params)
        results = data.get("resultList", {}).get("result", [])
        return [self._parse_article(r) for r in results]

    async def get_citations(self, pmid: str, limit: int = 10) -> List[EuropePMCCitation]:
        """Get citations for a PMID."""
        url = f"{BASE_URL}/references/{pmid}"
        params = {"pageSize": min(limit, 1000), "format": "json"}
        data = await self._rate_limited_get(url, params)
        return [
            EuropePMCCitation(
                pmid=r.get("id", ""), title=r.get("title", ""),
                authors=r.get("authorString", ""), journal=r.get("journalTitle", ""),
                year=r.get("pubYear", ""),
            )
            for r in data.get("referenceList", {}).get("reference", [])
        ]

    async def get_cited_by(self, pmid: str, limit: int = 10) -> List[EuropePMCCitation]:
        """Get articles citing a PMID."""
        url = f"{BASE_URL}/citations/{pmid}"
        params = {"pageSize": min(limit, 1000), "format": "json"}
        data = await self._rate_limited_get(url, params)
        return [
            EuropePMCCitation(
                pmid=r.get("id", ""), title=r.get("title", ""),
                authors=r.get("authorString", ""), journal=r.get("journalTitle", ""),
                year=r.get("pubYear", ""),
            )
            for r in data.get("citationList", {}).get("citation", [])
        ]

    async def search_open_access(self, query: str, limit: int = 10) -> List[EuropePMCArticle]:
        """Search open access articles."""
        url = f"{SEARCH_URL}"
        params = {"query": f"{query} OPEN_ACCESS:y", "pageSize": min(limit, 1000), "format": "json", "resultType": "core"}
        data = await self._rate_limited_get(url, params)
        results = data.get("resultList", {}).get("result", [])
        return [self._parse_article(r) for r in results]

    async def get_text_mining_annotations(self, pmcid: str) -> List[Dict[str, Any]]:
        """Get text mining annotations for a PMCID."""
        url = f"{BASE_URL}/annotations/{pmcid}"
        params = {"format": "json"}
        data = await self._rate_limited_get(url, params)
        return data.get("annotations", [])

    def _parse_article(self, data: Dict[str, Any]) -> EuropePMCArticle:
        return EuropePMCArticle(
            id=data.get("id", ""), title=data.get("title", ""),
            source=data.get("source", ""), pmid=data.get("pmid", ""),
            pmcid=data.get("pmcid", ""), doi=data.get("doi", ""),
            abstract=data.get("abstractText", ""),
            authors=[a.get("fullName", "") for a in data.get("authorList", {}).get("author", [])] if data.get("authorList") else [],
            journal=data.get("journalTitle", ""),
            publication_date=data.get("firstPublicationDate", ""),
            publication_year=int(data.get("pubYear", 0)) if data.get("pubYear") else 0,
            volume=data.get("journalVolume", ""), issue=data.get("journalIssue", ""),
            pages=data.get("pageInfo", ""),
            is_open_access=data.get("isOpenAccess", "N") == "Y",
            has_pdf=data.get("hasPDF", "N") == "Y",
            full_text_url=data.get("fullTextUrlList", {}).get("fullTextUrl", [{}])[0].get("url", "") if data.get("fullTextUrlList") else "",
            keywords=data.get("keywordList", {}).get("keyword", []) if data.get("keywordList") else [],
        )

    async def health_check(self) -> bool:
        try:
            url = f"{SEARCH_URL}"
            data = await self._rate_limited_get(url, {"query": "test", "pageSize": 1, "format": "json"})
            return "resultList" in data
        except EuropePMCAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "EuropePMCAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class EuropePMCAPIError(Exception):
    pass


async def _test_europepmc() -> None:
    adapter = EuropePMCAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    articles = await adapter.search("diabetes", limit=3)
    print(f"[TEST] search: found {len(articles)} results")
    assert isinstance(articles, list)
    await adapter.close()
    print("[TEST] All Europe PMC tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_europepmc())
