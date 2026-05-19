#!/usr/bin/env python3
"""
ConnectivityMap Adapter
https://connectivity.brain-map.org/

Allen Institute Brain Connectivity Atlas.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://connectivity.brain-map.org"
DEFAULT_TIMEOUT = 45.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
ConnectivityMapItem:
    """Represents an item."""
    id: str
    title: str
    description: str = ""
    url: str = ""
    source: str = ""
    date: str = ""
    authors: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "title": self.title, "description": self.description,
            "url": self.url, "source": self.source, "date": self.date,
            "authors": self.authors, "tags": self.tags, "extra": self.extra,
        }


@dataclass
ConnectivityMapDataset:
    """Represents a dataset."""
    id: str
    name: str
    description: str = ""
    url: str = ""
    modality: str = ""
    subjects: int = 0
    sessions: int = 0
    tasks: List[str] = field(default_factory=list)
    date: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "name": self.name, "description": self.description,
            "url": self.url, "modality": self.modality, "subjects": self.subjects,
            "sessions": self.sessions, "tasks": self.tasks, "date": self.date,
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


class ConnectivityMapAdapter:
    """Async adapter for ConnectivityMap.

    Example:
        adapter = ConnectivityMapAdapter()
        datasets = await adapter.search("cognitive")
        ds = await adapter.get_dataset("ds000001")
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
            raise ConnectivityMapAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise ConnectivityMapAPIError(f"Request failed: {e}") from e

    async def search(self, query: str, limit: int = 10) -> List[ConnectivityMapDataset]:
        """Search datasets."""
        url = f"{BASE_URL}/datasets"
        params: Dict[str, Any] = {"q": query, "limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_dataset(r) for r in data.get("results", [])]

    async def get_dataset(self, dataset_id: str) -> Optional[ConnectivityMapDataset]:
        """Get dataset by ID."""
        url = f"{BASE_URL}/datasets/{dataset_id}"
        data = await self._rate_limited_get(url)
        return self._parse_dataset(data) if "id" in data or "name" in data else None

    async def get_datasets(self, limit: int = 10) -> List[ConnectivityMapDataset]:
        """List all datasets."""
        url = f"{BASE_URL}/datasets"
        params: Dict[str, Any] = {"limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_dataset(r) for r in data.get("results", [])]

    async def search_by_modality(self, modality: str, limit: int = 10) -> List[ConnectivityMapDataset]:
        """Search by modality."""
        url = f"{BASE_URL}/datasets"
        params: Dict[str, Any] = {"modality": modality, "limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_dataset(r) for r in data.get("results", [])]

    async def search_by_task(self, task: str, limit: int = 10) -> List[ConnectivityMapDataset]:
        """Search by task."""
        url = f"{BASE_URL}/datasets"
        params: Dict[str, Any] = {"task": task, "limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_dataset(r) for r in data.get("results", [])]

    async def get_recent(self, limit: int = 10) -> List[ConnectivityMapDataset]:
        """Get recent datasets."""
        url = f"{BASE_URL}/datasets"
        params: Dict[str, Any] = {"sort": "date", "limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_dataset(r) for r in data.get("results", [])]

    async def get_items(self, limit: int = 10) -> List[ConnectivityMapItem]:
        """Get items."""
        url = f"{BASE_URL}/items"
        params: Dict[str, Any] = {"limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_item(r) for r in data.get("results", [])]

    async def search_items(self, query: str, limit: int = 10) -> List[ConnectivityMapItem]:
        """Search items."""
        url = f"{BASE_URL}/items"
        params: Dict[str, Any] = {"q": query, "limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_item(r) for r in data.get("results", [])]

    async def get_item(self, item_id: str) -> Optional[ConnectivityMapItem]:
        """Get item by ID."""
        url = f"{BASE_URL}/items/{item_id}"
        data = await self._rate_limited_get(url)
        return self._parse_item(data) if "id" in data else None

    def _parse_dataset(self, data: Dict[str, Any]) -> ConnectivityMapDataset:
        return ConnectivityMapDataset(
            id=str(data.get("id", "")),
            name=data.get("name", data.get("title", "")),
            description=data.get("description", ""),
            url=data.get("url", ""),
            modality=data.get("modality", ""),
            subjects=data.get("subjects", data.get("num_subjects", 0)),
            sessions=data.get("sessions", data.get("num_sessions", 0)),
            tasks=data.get("tasks", data.get("task", [])),
            date=data.get("date", data.get("publish_date", "")),
        )

    def _parse_item(self, data: Dict[str, Any]) -> ConnectivityMapItem:
        return ConnectivityMapItem(
            id=str(data.get("id", "")),
            title=data.get("title", data.get("name", "")),
            description=data.get("description", ""),
            url=data.get("url", ""),
            source=data.get("source", ""),
            date=data.get("date", data.get("publish_date", "")),
            authors=data.get("authors", []),
            tags=data.get("tags", []),
            extra={k: v for k, v in data.items() if k not in ("id", "title", "name", "description", "url", "source", "date", "authors", "tags")},
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/datasets"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except ConnectivityMapAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "ConnectivityMapAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class ConnectivityMapAPIError(Exception):
    pass


async def _test_connectivity_map() -> None:
    adapter = ConnectivityMapAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    results = await adapter.search("brain", limit=3)
    print(f"[TEST] search: found {len(results)} results")
    assert isinstance(results, list)
    await adapter.close()
    print("[TEST] All ConnectivityMap tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_connectivity_map())
