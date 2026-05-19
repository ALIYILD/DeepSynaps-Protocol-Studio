#!/usr/bin/env python3
"""
Epistemonikos Adapter — Evidence Aggregation Platform
https://www.epistemonikos.org/

Provides access to systematic reviews, evidence summaries, and structured
abstracts from the Epistemonikos database of health evidence.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.epistemonikos.org/api"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class EpistemonikosArticle:
    """Represents an article from Epistemonikos."""
    id: str
    title: str
    article_type: str
    url: str
    abstract: str = ""
    authors: List[str] = field(default_factory=list)
    journal: str = ""
    publication_date: str = ""
    doi: str = ""
    pmid: str = ""
    language: str = ""
    mesh_terms: List[str] = field(default_factory=list)
    countries: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "title": self.title, "article_type": self.article_type,
            "url": self.url, "abstract": self.abstract, "authors": self.authors,
            "journal": self.journal, "publication_date": self.publication_date,
            "doi": self.doi, "pmid": self.pmid, "language": self.language,
            "mesh_terms": self.mesh_terms, "countries": self.countries,
        }


@dataclass
class EpistemonikosReview:
    """Represents a systematic review from Epistemonikos."""
    id: str
    title: str
    url: str
    abstract: str = ""
    authors: List[str] = field(default_factory=list)
    publication_date: str = ""
    doi: str = ""
    pmid: str = ""
    included_studies: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "title": self.title, "url": self.url,
            "abstract": self.abstract, "authors": self.authors,
            "publication_date": self.publication_date, "doi": self.doi,
            "pmid": self.pmid, "included_studies": self.included_studies,
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


class EpistemonikosAdapter:
    """Async adapter for Epistemonikos API.

    Example:
        adapter = EpistemonikosAdapter()
        articles = await adapter.search("diabetes therapy")
        reviews = await adapter.search_reviews("hypertension")
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
            raise EpistemonikosAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise EpistemonikosAPIError(f"Request failed: {e}") from e

    async def search(self, query: str, limit: int = 10) -> List[EpistemonikosArticle]:
        """Search Epistemonikos."""
        url = f"{BASE_URL}/search"
        params = {"q": query, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def search_reviews(self, query: str, limit: int = 10) -> List[EpistemonikosReview]:
        """Search systematic reviews."""
        url = f"{BASE_URL}/search"
        params = {"q": query, "type": "systematic_review", "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_review(r) for r in data.get("results", [])]

    async def search_by_pico(
        self, population: Optional[str] = None,
        intervention: Optional[str] = None,
        comparison: Optional[str] = None,
        outcome: Optional[str] = None,
        limit: int = 10
    ) -> List[EpistemonikosReview]:
        """Search by PICO framework."""
        url = f"{BASE_URL}/search"
        params: Dict[str, Any] = {"limit": min(limit, 100)}
        if population:
            params["population"] = population
        if intervention:
            params["intervention"] = intervention
        if comparison:
            params["comparison"] = comparison
        if outcome:
            params["outcome"] = outcome
        data = await self._rate_limited_get(url, params)
        return [self._parse_review(r) for r in data.get("results", [])]

    async def get_article(self, article_id: str) -> Optional[EpistemonikosArticle]:
        """Get article by ID."""
        url = f"{BASE_URL}/articles/{article_id}"
        data = await self._rate_limited_get(url)
        results = data.get("result")
        if results:
            return self._parse_article(results)
        return None

    async def get_review(self, review_id: str) -> Optional[EpistemonikosReview]:
        """Get systematic review by ID."""
        url = f"{BASE_URL}/reviews/{review_id}"
        data = await self._rate_limited_get(url)
        results = data.get("result")
        if results:
            return self._parse_review(results)
        return None

    async def search_by_mesh(self, mesh_term: str, limit: int = 10) -> List[EpistemonikosArticle]:
        """Search by MeSH term."""
        url = f"{BASE_URL}/search"
        params = {"mesh": mesh_term, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def get_related_articles(self, article_id: str, limit: int = 10) -> List[EpistemonikosArticle]:
        """Get articles related to given article."""
        url = f"{BASE_URL}/articles/{article_id}/related"
        params = {"limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def get_recent_articles(self, limit: int = 10) -> List[EpistemonikosArticle]:
        """Get recently added articles."""
        url = f"{BASE_URL}/recent"
        params = {"limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    def _parse_article(self, data: Dict[str, Any]) -> EpistemonikosArticle:
        return EpistemonikosArticle(
            id=data.get("id", ""), title=data.get("title", ""),
            article_type=data.get("type", ""), url=data.get("url", ""),
            abstract=data.get("abstract", ""), authors=data.get("authors", []),
            journal=data.get("journal", ""),
            publication_date=data.get("publication_date", ""),
            doi=data.get("doi", ""), pmid=data.get("pmid", ""),
            language=data.get("language", ""), mesh_terms=data.get("mesh", []),
            countries=data.get("countries", []),
        )

    def _parse_review(self, data: Dict[str, Any]) -> EpistemonikosReview:
        return EpistemonikosReview(
            id=data.get("id", ""), title=data.get("title", ""),
            url=data.get("url", ""), abstract=data.get("abstract", ""),
            authors=data.get("authors", []),
            publication_date=data.get("publication_date", ""),
            doi=data.get("doi", ""), pmid=data.get("pmid", ""),
            included_studies=data.get("included_studies", 0),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/search"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except EpistemonikosAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "EpistemonikosAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class EpistemonikosAPIError(Exception):
    pass


async def _test_epistemonikos() -> None:
    adapter = EpistemonikosAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    results = await adapter.search("diabetes", limit=3)
    print(f"[TEST] search: found {len(results)} results")
    assert isinstance(results, list)
    await adapter.close()
    print("[TEST] All Epistemonikos tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_epistemonikos())
