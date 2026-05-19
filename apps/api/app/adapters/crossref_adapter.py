#!/usr/bin/env python3
"""
Crossref Adapter — Scholarly Publication Metadata
https://api.crossref.org/

Provides access to Crossref REST API for scholarly work metadata,
including journal articles, books, and conference proceedings.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://api.crossref.org"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class CrossrefWork:
    """Represents a scholarly work from Crossref."""
    doi: str
    title: str
    work_type: str
    authors: List[Dict[str, str]] = field(default_factory=list)
    journal: str = ""
    publication_date: str = ""
    volume: str = ""
    issue: str = ""
    pages: str = ""
    publisher: str = ""
    abstract: str = ""
    url: str = ""
    references_count: int = 0
    cited_by_count: int = 0
    is_referenced_by: List[str] = field(default_factory=list)
    subject: List[str] = field(default_factory=list)
    license_url: str = ""
    language: str = ""
    isbn: str = ""
    issn: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "doi": self.doi, "title": self.title, "work_type": self.work_type,
            "authors": self.authors, "journal": self.journal,
            "publication_date": self.publication_date, "volume": self.volume,
            "issue": self.issue, "pages": self.pages, "publisher": self.publisher,
            "abstract": self.abstract, "url": self.url,
            "references_count": self.references_count, "cited_by_count": self.cited_by_count,
            "is_referenced_by": self.is_referenced_by, "subject": self.subject,
            "license_url": self.license_url, "language": self.language,
            "isbn": self.isbn, "issn": self.issn,
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


class CrossrefAdapter:
    """Async adapter for Crossref REST API.

    Example:
        adapter = CrossrefAdapter(mailto="you@example.com")
        works = await adapter.search_works("CRISPR")
        work = await adapter.get_work_by_doi("10.1038/s41586-021-04207-5")
    """

    def __init__(self, mailto: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT, rate_limit_delay: float = RATE_LIMIT_DELAY) -> None:
        self.mailto = mailto
        self.timeout = timeout; self.rate_limit_delay = rate_limit_delay
        self._client: Optional[httpx.AsyncClient] = None
        self._last_call_time: float = 0.0

    def _headers(self) -> Dict[str, str]:
        h = {"User-Agent": "DeepSynps-Protocol-Studio/1.0"}
        if self.mailto:
            h["User-Agent"] += f" (mailto:{self.mailto})"
        return h

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
            resp = await client.get(url, params=params or {}, headers=self._headers())
            self._last_call_time = time.time()
            resp.raise_for_status()
            data = resp.json()
            _CACHE.set(data, *cache_key)
            return data
        except httpx.HTTPStatusError as e:
            raise CrossrefAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise CrossrefAPIError(f"Request failed: {e}") from e

    async def search_works(self, query: str, limit: int = 10, offset: int = 0, sort: str = "relevance") -> Tuple[List[CrossrefWork], int]:
        """Search works."""
        url = f"{BASE_URL}/works"
        params: Dict[str, Any] = {"query": query, "rows": min(limit, 1000), "offset": offset, "sort": sort, "order": "desc"}
        if self.mailto:
            params["mailto"] = self.mailto
        data = await self._rate_limited_get(url, params)
        items = data.get("message", {}).get("items", [])
        total = data.get("message", {}).get("total-results", 0)
        return [self._parse_work(r) for r in items], total

    async def get_work_by_doi(self, doi: str) -> Optional[CrossrefWork]:
        """Get work by DOI."""
        url = f"{BASE_URL}/works/{doi}"
        params = {"mailto": self.mailto} if self.mailto else {}
        data = await self._rate_limited_get(url, params)
        item = data.get("message")
        return self._parse_work(item) if item else None

    async def search_by_author(self, author: str, limit: int = 10) -> Tuple[List[CrossrefWork], int]:
        """Search by author."""
        url = f"{BASE_URL}/works"
        params: Dict[str, Any] = {"query.author": author, "rows": min(limit, 1000), "mailto": self.mailto}
        data = await self._rate_limited_get(url, params)
        items = data.get("message", {}).get("items", [])
        total = data.get("message", {}).get("total-results", 0)
        return [self._parse_work(r) for r in items], total

    async def search_by_title(self, title: str, limit: int = 10) -> Tuple[List[CrossrefWork], int]:
        """Search by title."""
        url = f"{BASE_URL}/works"
        params: Dict[str, Any] = {"query.title": title, "rows": min(limit, 1000), "mailto": self.mailto}
        data = await self._rate_limited_get(url, params)
        items = data.get("message", {}).get("items", [])
        total = data.get("message", {}).get("total-results", 0)
        return [self._parse_work(r) for r in items], total

    async def search_by_journal(self, issn: str, limit: int = 10) -> Tuple[List[CrossrefWork], int]:
        """Search works by journal ISSN."""
        url = f"{BASE_URL}/journals/{issn}/works"
        params: Dict[str, Any] = {"rows": min(limit, 1000), "mailto": self.mailto}
        data = await self._rate_limited_get(url, params)
        items = data.get("message", {}).get("items", [])
        total = data.get("message", {}).get("total-results", 0)
        return [self._parse_work(r) for r in items], total

    async def get_journal(self, issn: str) -> Optional[Dict[str, Any]]:
        """Get journal metadata."""
        url = f"{BASE_URL}/journals/{issn}"
        params = {"mailto": self.mailto} if self.mailto else {}
        data = await self._rate_limited_get(url, params)
        return data.get("message")

    async def search_journals(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search journals."""
        url = f"{BASE_URL}/journals"
        params: Dict[str, Any] = {"query": query, "rows": min(limit, 1000), "mailto": self.mailto}
        data = await self._rate_limited_get(url, params)
        return data.get("message", {}).get("items", [])

    async def get_citation_count(self, doi: str) -> int:
        """Get citation count for a DOI."""
        work = await self.get_work_by_doi(doi)
        return work.cited_by_count if work else 0

    async def get_citations(self, doi: str, limit: int = 10) -> List[str]:
        """Get citing DOIs."""
        url = f"{BASE_URL}/works/{doi}"
        params = {"mailto": self.mailto} if self.mailto else {}
        data = await self._rate_limited_get(url, params)
        relations = data.get("message", {}).get("relation", {}).get("is-referenced-by", [])
        return [r.get("id", "") for r in relations[:limit]]

    async def get_types(self) -> List[Dict[str, Any]]:
        """Get work types."""
        url = f"{BASE_URL}/types"
        data = await self._rate_limited_get(url)
        return data.get("message", {}).get("items", [])

    def _parse_work(self, data: Dict[str, Any]) -> CrossrefWork:
        title = ""
        if data.get("title"):
            title = data["title"][0] if isinstance(data["title"], list) else data["title"]
        return CrossrefWork(
            doi=data.get("DOI", ""), title=title, work_type=data.get("type", ""),
            authors=[{k: str(v) for k, v in a.items() if isinstance(v, (str, int))} for a in data.get("author", []) if isinstance(a, dict)],
            journal=data.get("container-title", [""])[0] if isinstance(data.get("container-title"), list) else data.get("container-title", ""),
            publication_date=str(data.get("published-print", {}).get("date-parts", [[""]])[0] if data.get("published-print") else ""),
            volume=data.get("volume", ""), issue=data.get("issue", ""), pages=data.get("page", ""),
            publisher=data.get("publisher", ""),
            abstract=data.get("abstract", ""), url=data.get("URL", ""),
            references_count=data.get("references-count", 0), cited_by_count=data.get("is-referenced-by-count", 0),
            subject=data.get("subject", []), license_url=data.get("license", [{"URL": ""}])[0].get("URL", "") if data.get("license") else "",
            language=data.get("language", ""), isbn=data.get("ISBN", [""])[0] if data.get("ISBN") else "",
            issn=data.get("ISSN", [""])[0] if data.get("ISSN") else "",
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/works"
            data = await self._rate_limited_get(url, {"rows": 1})
            return "message" in data
        except CrossrefAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "CrossrefAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class CrossrefAPIError(Exception):
    pass


async def _test_crossref() -> None:
    adapter = CrossrefAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    works, total = await adapter.search_works("diabetes", limit=3)
    print(f"[TEST] search_works: found {len(works)} of {total}")
    assert isinstance(works, list)
    await adapter.close()
    print("[TEST] All Crossref tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_crossref())
