#!/usr/bin/env python3
"""
NICE Adapter — National Institute for Health and Care Excellence
https://www.nice.org.uk/guidance

Provides access to NICE clinical guidelines, technology appraisals,
interventional procedures, and medical technology guidance.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.nice.org.uk/api"
SEARCH_URL = "https://www.nice.org.uk/guidance"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class NICEGuidance:
    """Represents a NICE guidance document."""
    title: str
    guidance_type: str
    guidance_id: str
    url: str
    publication_date: str = ""
    last_updated: str = ""
    status: str = ""
    abstract: str = ""
    recommendations: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    conditions: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "guidance_type": self.guidance_type,
            "guidance_id": self.guidance_id,
            "url": self.url,
            "publication_date": self.publication_date,
            "last_updated": self.last_updated,
            "status": self.status,
            "abstract": self.abstract,
            "recommendations": self.recommendations,
            "keywords": self.keywords,
            "conditions": self.conditions,
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


class NICEAdapter:
    """Async adapter for NICE guidance API.

    Example:
        adapter = NICEAdapter()
        guidance = await adapter.search_guidance("diabetes")
        cg = await adapter.get_guidance("NG28")
    """

    def __init__(self, timeout: float = DEFAULT_TIMEOUT, rate_limit_delay: float = RATE_LIMIT_DELAY) -> None:
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
            raise NICEAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise NICEAPIError(f"Request failed: {e}") from e

    async def search_guidance(self, query: str, limit: int = 10) -> List[NICEGuidance]:
        """Search NICE guidance."""
        url = f"{BASE_URL}/search"
        params = {"q": query, "limit": min(limit, 100), "type": "guidance"}
        data = await self._rate_limited_get(url, params)
        return [self._parse_guidance(r) for r in data.get("results", [])]

    async def get_guidance(self, guidance_id: str) -> Optional[NICEGuidance]:
        """Get guidance by ID."""
        url = f"{BASE_URL}/guidance/{guidance_id}"
        data = await self._rate_limited_get(url)
        results = data.get("result")
        if results:
            return self._parse_guidance(results)
        return None

    async def search_by_condition(self, condition: str, limit: int = 10) -> List[NICEGuidance]:
        """Search guidance by medical condition."""
        url = f"{BASE_URL}/search"
        params = {"condition": condition, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_guidance(r) for r in data.get("results", [])]

    async def get_clinical_guidelines(self, limit: int = 10) -> List[NICEGuidance]:
        """Get clinical guidelines."""
        url = f"{BASE_URL}/search"
        params = {"type": "cg", "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_guidance(r) for r in data.get("results", [])]

    async def get_technology_appraisals(self, limit: int = 10) -> List[NICEGuidance]:
        """Get technology appraisals."""
        url = f"{BASE_URL}/search"
        params = {"type": "ta", "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_guidance(r) for r in data.get("results", [])]

    async def get_interventional_procedures(self, limit: int = 10) -> List[NICEGuidance]:
        """Get interventional procedures."""
        url = f"{BASE_URL}/search"
        params = {"type": "ipg", "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_guidance(r) for r in data.get("results", [])]

    async def get_medical_technologies(self, limit: int = 10) -> List[NICEGuidance]:
        """Get medical technology guidance."""
        url = f"{BASE_URL}/search"
        params = {"type": "mtg", "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_guidance(r) for r in data.get("results", [])]

    async def search_by_drug(self, drug_name: str, limit: int = 10) -> List[NICEGuidance]:
        """Search guidance mentioning a specific drug."""
        url = f"{BASE_URL}/search"
        params = {"q": drug_name, "type": "guidance", "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_guidance(r) for r in data.get("results", [])]

    async def get_recent_guidance(self, limit: int = 10) -> List[NICEGuidance]:
        """Get recently published guidance."""
        url = f"{BASE_URL}/search"
        params = {"sort": "date", "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_guidance(r) for r in data.get("results", [])]

    def _parse_guidance(self, data: Dict[str, Any]) -> NICEGuidance:
        return NICEGuidance(
            title=data.get("title", ""),
            guidance_type=data.get("type", ""),
            guidance_id=data.get("guidanceId", ""),
            url=data.get("url", ""),
            publication_date=data.get("publicationDate", ""),
            last_updated=data.get("lastUpdated", ""),
            status=data.get("status", ""),
            abstract=data.get("abstract", ""),
            recommendations=data.get("recommendations", []),
            keywords=data.get("keywords", []),
            conditions=data.get("conditions", []),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/search"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except NICEAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "NICEAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class NICEAPIError(Exception):
    pass


async def _test_nice() -> None:
    adapter = NICEAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    results = await adapter.search_guidance("diabetes", limit=3)
    print(f"[TEST] search_guidance: found {len(results)} results")
    assert isinstance(results, list)
    await adapter.close()
    print("[TEST] All NICE tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_nice())
