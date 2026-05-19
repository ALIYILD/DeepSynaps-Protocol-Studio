#!/usr/bin/env python3
"""
ACP Journal Club Adapter — American College of Physicians
https://www.acpjournals.org/

Provides access to ACP Journal Club summaries of important articles
from the biomedical literature with clinical commentary.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.acpjournals.org/api"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class ACPJournalClubArticle:
    """Represents an ACP Journal Club article summary."""
    title: str
    original_article_title: str
    original_article_authors: List[str] = field(default_factory=list)
    original_article_journal: str = ""
    commentary: str = ""
    clinical_question: str = ""
    bottom_line: str = ""
    methods: str = ""
    results: str = ""
    commentary_author: str = ""
    publication_date: str = ""
    doi: str = ""
    url: str = ""
    pmid: str = ""
    topic: str = ""
    specialty: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title, "original_article_title": self.original_article_title,
            "original_article_authors": self.original_article_authors,
            "original_article_journal": self.original_article_journal,
            "commentary": self.commentary, "clinical_question": self.clinical_question,
            "bottom_line": self.bottom_line, "methods": self.methods,
            "results": self.results, "commentary_author": self.commentary_author,
            "publication_date": self.publication_date, "doi": self.doi,
            "url": self.url, "pmid": self.pmid, "topic": self.topic,
            "specialty": self.specialty,
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


class ACPJournalClubAdapter:
    """Async adapter for ACP Journal Club.

    Example:
        adapter = ACPJournalClubAdapter()
        articles = await adapter.search("diabetes treatment")
        article = await adapter.get_article("10.7326/ACPJC-2021-174-6-007")
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
            raise ACPAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise ACPAPIError(f"Request failed: {e}") from e

    async def search(self, query: str, limit: int = 10) -> List[ACPJournalClubArticle]:
        """Search ACP Journal Club articles."""
        url = f"{BASE_URL}/search"
        params = {"q": query, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def get_article(self, doi: str) -> Optional[ACPSournalClubArticle]:
        """Get article by DOI."""
        url = f"{BASE_URL}/articles"
        params = {"doi": doi}
        data = await self._rate_limited_get(url, params)
        results = data.get("results", [])
        return self._parse_article(results[0]) if results else None

    async def search_by_topic(self, topic: str, limit: int = 10) -> List[ACPJournalClubArticle]:
        """Search by medical topic."""
        url = f"{BASE_URL}/search"
        params = {"topic": topic, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def search_by_specialty(self, specialty: str, limit: int = 10) -> List[ACPJournalClubArticle]:
        """Search by medical specialty."""
        url = f"{BASE_URL}/search"
        params = {"specialty": specialty, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def get_recent(self, limit: int = 10) -> List[ACPJournalClubArticle]:
        """Get recent articles."""
        url = f"{BASE_URL}/recent"
        params = {"limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def get_by_date_range(self, start: str, end: str, limit: int = 10) -> List[ACPJournalClubArticle]:
        """Get articles in date range."""
        url = f"{BASE_URL}/search"
        params = {"start": start, "end": end, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def search_by_original_pmid(self, pmid: str) -> List[ACPJournalClubArticle]:
        """Search by original article PMID."""
        url = f"{BASE_URL}/search"
        params = {"original_pmid": pmid}
        data = await self._rate_limited_get(url, params)
        return [self._parse_article(r) for r in data.get("results", [])]

    async def get_topics(self) -> List[str]:
        """Get list of topics."""
        url = f"{BASE_URL}/topics"
        data = await self._rate_limited_get(url)
        return data.get("topics", [])

    async def get_specialties(self) -> List[str]:
        """Get list of specialties."""
        url = f"{BASE_URL}/specialties"
        data = await self._rate_limited_get(url)
        return data.get("specialties", [])

    def _parse_article(self, data: Dict[str, Any]) -> ACPJournalClubArticle:
        return ACPJournalClubArticle(
            title=data.get("title", ""), original_article_title=data.get("original_article_title", ""),
            original_article_authors=data.get("original_article_authors", []),
            original_article_journal=data.get("original_article_journal", ""),
            commentary=data.get("commentary", ""), clinical_question=data.get("clinical_question", ""),
            bottom_line=data.get("bottom_line", ""), methods=data.get("methods", ""),
            results=data.get("results", ""), commentary_author=data.get("commentary_author", ""),
            publication_date=data.get("publication_date", ""), doi=data.get("doi", ""),
            url=data.get("url", ""), pmid=data.get("pmid", ""),
            topic=data.get("topic", ""), specialty=data.get("specialty", ""),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/search"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except ACPAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "ACPJournalClubAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class ACPAPIError(Exception):
    pass


async def _test_acp() -> None:
    adapter = ACPJournalClubAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    results = await adapter.search("diabetes", limit=3)
    print(f"[TEST] search: found {len(results)} results")
    assert isinstance(results, list)
    await adapter.close()
    print("[TEST] All ACP Journal Club tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_acp())
