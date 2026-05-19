#!/usr/bin/env python3
"""
TRIP Database Adapter — Translating Research Into Practice
https://www.tripdatabase.com/

Provides access to clinical search results from TRIP, aggregating evidence
from systematic reviews, guidelines, and clinical trials.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.tripdatabase.com/api"
SEARCH_URL = "https://www.tripdatabase.com/search"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class TRIPResult:
    """Represents a TRIP search result."""
    title: str
    url: str
    source: str
    result_type: str
    publication_date: str = ""
    authors: str = ""
    abstract: str = ""
    journal: str = ""
    doi: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title, "url": self.url, "source": self.source,
            "result_type": self.result_type, "publication_date": self.publication_date,
            "authors": self.authors, "abstract": self.abstract,
            "journal": self.journal, "doi": self.doi,
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


class TRIPDatabaseAdapter:
    """Async adapter for TRIP Database.

    Example:
        adapter = TRIPDatabaseAdapter()
        results = await adapter.search("diabetes treatment")
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
            raise TRIPAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise TRIPAPIError(f"Request failed: {e}") from e

    async def search(self, query: str, limit: int = 10, result_type: Optional[str] = None) -> List[TRIPResult]:
        """Search TRIP database."""
        url = f"{BASE_URL}/search"
        params: Dict[str, Any] = {"q": query, "limit": min(limit, 100)}
        if result_type:
            params["type"] = result_type
        data = await self._rate_limited_get(url, params)
        return [self._parse_result(r) for r in data.get("results", [])]

    async def search_systematic_reviews(self, query: str, limit: int = 10) -> List[TRIPResult]:
        """Search systematic reviews."""
        return await self.search(query, limit, result_type="systematic_review")

    async def search_guidelines(self, query: str, limit: int = 10) -> List[TRIPResult]:
        """Search guidelines."""
        return await self.search(query, limit, result_type="guideline")

    async def search_primary_research(self, query: str, limit: int = 10) -> List[TRIPResult]:
        """Search primary research."""
        return await self.search(query, limit, result_type="primary_research")

    async def search_by_condition(self, condition: str, limit: int = 10) -> List[TRIPResult]:
        """Search by medical condition."""
        url = f"{BASE_URL}/search"
        params = {"condition": condition, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_result(r) for r in data.get("results", [])]

    async def search_by_intervention(self, intervention: str, limit: int = 10) -> List[TRIPResult]:
        """Search by intervention/drug."""
        url = f"{BASE_URL}/search"
        params = {"intervention": intervention, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_result(r) for r in data.get("results", [])]

    async def search_by_condition(self, condition: str, limit: int = 10) -> List[TRIPResult]:
        """Search by medical condition."""
        url = f"{BASE_URL}/search"
        params = {"condition": condition, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_result(r) for r in data.get("results", [])]

    async def search_by_specialty(self, specialty: str, limit: int = 10) -> List[TRIPResult]:
        """Search by medical specialty."""
        url = f"{BASE_URL}/search"
        params = {"specialty": specialty, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_result(r) for r in data.get("results", [])]

    async def get_recent(self, limit: int = 10) -> List[TRIPResult]:
        """Get recent results."""
        url = f"{BASE_URL}/search"
        params = {"sort": "date", "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_result(r) for r in data.get("results", [])]

    async def get_specialties(self) -> List[str]:
        """Get list of available specialties."""
        url = f"{BASE_URL}/specialties"
        data = await self._rate_limited_get(url)
        return data.get("specialties", [])

    def _parse_result(self, data: Dict[str, Any]) -> TRIPResult:
        return TRIPResult(
            title=data.get("title", ""), url=data.get("url", ""),
            source=data.get("source", ""), result_type=data.get("type", ""),
            publication_date=data.get("date", ""),
            authors=data.get("authors", ""), abstract=data.get("abstract", ""),
            journal=data.get("journal", ""), doi=data.get("doi", ""),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/search"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except TRIPAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "TRIPDatabaseAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class TRIPAPIError(Exception):
    pass


async def _test_trip() -> None:
    adapter = TRIPDatabaseAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    results = await adapter.search("diabetes", limit=3)
    print(f"[TEST] search: found {len(results)} results")
    assert isinstance(results, list)
    await adapter.close()
    print("[TEST] All TRIP tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_trip())
