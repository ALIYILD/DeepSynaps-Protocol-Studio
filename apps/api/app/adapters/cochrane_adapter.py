#!/usr/bin/env python3
"""
Cochrane Library Adapter — Systematic Review Evidence
https://www.cochranelibrary.com/

Provides access to Cochrane systematic reviews, protocols, and clinical trials
via the Cochrane Library search API.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.cochranelibrary.com/en/search"
API_URL = "https://www.cochranelibrary.com/cochrane-search"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class CochraneReview:
    """Represents a Cochrane systematic review."""
    doi: str
    title: str
    authors: List[str] = field(default_factory=list)
    abstract: str = ""
    publication_date: str = ""
    review_type: str = ""
    url: str = ""
    pmid: str = ""
    pmcid: str = ""
    status: str = ""
    conclusion: str = ""
    search_date: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "doi": self.doi,
            "title": self.title,
            "authors": self.authors,
            "abstract": self.abstract,
            "publication_date": self.publication_date,
            "review_type": self.review_type,
            "url": self.url,
            "pmid": self.pmid,
            "pmcid": self.pmcid,
            "status": self.status,
            "conclusion": self.conclusion,
            "search_date": self.search_date,
        }


@dataclass
class CochraneTrial:
    """Represents a clinical trial from Cochrane."""
    trial_id: str
    title: str
    registration_number: str = ""
    url: str = ""
    status: str = ""


class _Cache:
    def __init__(self, ttl: int = CACHE_TTL_SECONDS) -> None:
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._ttl = ttl

    def _key(self, *parts: str) -> str:
        return hashlib.sha256("|".join(parts).encode()).hexdigest()

    def get(self, *parts: str) -> Optional[Any]:
        key = self._key(*parts)
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.time() - ts > self._ttl:
            del self._store[key]
            return None
        return value

    def set(self, value: Any, *parts: str) -> None:
        self._store[self._key(*parts)] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()

_CACHE = _Cache()


class CochraneAdapter:
    """Async adapter for the Cochrane Library.

    Provides access to systematic reviews, protocols, and clinical trials.

    Example:
        adapter = CochraneAdapter()
        reviews = await adapter.search_reviews("diabetes treatment")
        review = await adapter.get_review_by_doi("10.1002/14651858.CD007890.pub2")
    """

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        rate_limit_delay: float = RATE_LIMIT_DELAY,
    ) -> None:
        self.timeout = timeout
        self.rate_limit_delay = rate_limit_delay
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
            raise CochraneAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise CochraneAPIError(f"Request failed: {e}") from e

    async def search_reviews(
        self, query: str, limit: int = 10
    ) -> List[CochraneReview]:
        """Search Cochrane systematic reviews.

        Args:
            query: Search query.
            limit: Max results.

        Returns:
            List of reviews.
        """
        url = f"{API_URL}/reviews"
        params = {"q": query, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_review(r) for r in data.get("results", [])]

    async def get_review_by_doi(self, doi: str) -> Optional[CochraneReview]:
        """Get review by DOI.

        Args:
            doi: DOI string.

        Returns:
            Review or None.
        """
        url = f"{API_URL}/reviews"
        params = {"doi": doi}
        data = await self._rate_limited_get(url, params)
        results = data.get("results", [])
        if results:
            return self._parse_review(results[0])
        return None

    async def search_protocols(
        self, query: str, limit: int = 10
    ) -> List[CochraneReview]:
        """Search Cochrane protocols.

        Args:
            query: Search query.
            limit: Max results.

        Returns:
            List of protocols.
        """
        url = f"{API_URL}/protocols"
        params = {"q": query, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_review(r) for r in data.get("results", [])]

    async def search_trials(
        self, query: str, limit: int = 10
    ) -> List[CochraneTrial]:
        """Search clinical trials.

        Args:
            query: Search query.
            limit: Max results.

        Returns:
            List of trials.
        """
        url = f"{API_URL}/trials"
        params = {"q": query, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [
            CochraneTrial(
                trial_id=r.get("id", ""),
                title=r.get("title", ""),
                registration_number=r.get("registration_number", ""),
                url=r.get("url", ""),
                status=r.get("status", ""),
            )
            for r in data.get("results", [])
        ]

    async def search_by_topic(
        self, topic: str, limit: int = 10
    ) -> List[CochraneReview]:
        """Search reviews by medical topic.

        Args:
            topic: Topic string.
            limit: Max results.

        Returns:
            List of reviews.
        """
        url = f"{API_URL}/reviews"
        params = {"topic": topic, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_review(r) for r in data.get("results", [])]

    async def get_recent_reviews(
        self, days: int = 30, limit: int = 10
    ) -> List[CochraneReview]:
        """Get recently published reviews.

        Args:
            days: Days back.
            limit: Max results.

        Returns:
            List of recent reviews.
        """
        url = f"{API_URL}/reviews"
        params = {"days": days, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_review(r) for r in data.get("results", [])]

    async def search_by_author(
        self, author: str, limit: int = 10
    ) -> List[CochraneReview]:
        """Search reviews by author name.

        Args:
            author: Author name.
            limit: Max results.

        Returns:
            List of reviews.
        """
        url = f"{API_URL}/reviews"
        params = {"author": author, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_review(r) for r in data.get("results", [])]

    async def get_review_summary(
        self, doi: str
    ) -> Optional[Dict[str, Any]]:
        """Get summary of a review.

        Args:
            doi: DOI string.

        Returns:
            Summary dict or None.
        """
        review = await self.get_review_by_doi(doi)
        if not review:
            return None
        return {
            "title": review.title,
            "conclusion": review.conclusion,
            "authors": review.authors,
            "published": review.publication_date,
            "url": review.url,
        }

    def _parse_review(self, data: Dict[str, Any]) -> CochraneReview:
        return CochraneReview(
            doi=data.get("doi", ""),
            title=data.get("title", ""),
            authors=data.get("authors", []),
            abstract=data.get("abstract", ""),
            publication_date=data.get("publication_date", ""),
            review_type=data.get("review_type", ""),
            url=data.get("url", ""),
            pmid=data.get("pmid", ""),
            pmcid=data.get("pmcid", ""),
            status=data.get("status", ""),
            conclusion=data.get("conclusion", ""),
            search_date=data.get("search_date", ""),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{API_URL}/reviews"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except CochraneAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "CochraneAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class CochraneAPIError(Exception):
    pass


async def _test_cochrane() -> None:
    adapter = CochraneAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    reviews = await adapter.search_reviews("diabetes", limit=3)
    print(f"[TEST] search_reviews: found {len(reviews)} results")
    assert isinstance(reviews, list)
    await adapter.close()
    print("[TEST] All Cochrane tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_cochrane())
