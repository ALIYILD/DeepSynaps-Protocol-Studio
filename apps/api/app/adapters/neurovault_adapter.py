#!/usr/bin/env python3
"""
NeuroVault Adapter — Statistical Brain Maps Repository
https://neurovault.org/api/

Provides access to statistical brain maps, atlases, and collections
from the NeuroVault repository of neuroimaging data.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://neurovault.org/api"
DEFAULT_TIMEOUT = 45.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class NeuroVaultCollection:
    """Represents a NeuroVault collection."""
    id: int
    name: str
    url: str
    description: str = ""
    owner: str = ""
    doi: str = ""
    journal_name: str = ""
    paper_url: str = ""
    authors: str = ""
    number_of_images: int = 0
    add_date: str = ""
    modify_date: str = ""
    is_private: bool = False
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "name": self.name, "url": self.url,
            "description": self.description, "owner": self.owner,
            "doi": self.doi, "journal_name": self.journal_name,
            "paper_url": self.paper_url, "authors": self.authors,
            "number_of_images": self.number_of_images,
            "add_date": self.add_date, "modify_date": self.modify_date,
            "is_private": self.is_private, "tags": self.tags,
        }


@dataclass
class NeuroVaultImage:
    """Represents a NeuroVault statistical map image."""
    id: int
    name: str
    url: str
    collection_id: int = 0
    collection_name: str = ""
    file_size: int = 0
    description: str = ""
    map_type: str = ""
    analysis_level: str = ""
    modality: str = ""
    target_template: str = ""
    target_mask: str = ""
    number_of_subjects: int = 0
    figure_number: str = ""
    thumbnail: str = ""
    download_url: str = ""
    not_mni: bool = False
    brain_coverage: str = ""
    contrast_definition: str = ""
    statistic: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "name": self.name, "url": self.url,
            "collection_id": self.collection_id, "collection_name": self.collection_name,
            "file_size": self.file_size, "description": self.description,
            "map_type": self.map_type, "analysis_level": self.analysis_level,
            "modality": self.modality, "target_template": self.target_template,
            "target_mask": self.target_mask, "number_of_subjects": self.number_of_subjects,
            "figure_number": self.figure_number, "thumbnail": self.thumbnail,
            "download_url": self.download_url, "not_mni": self.not_mni,
            "brain_coverage": self.brain_coverage,
            "contrast_definition": self.contrast_definition, "statistic": self.statistic,
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


class NeuroVaultAdapter:
    """Async adapter for NeuroVault API.

    Example:
        adapter = NeuroVaultAdapter()
        collections = await adapter.get_collections()
        images = await adapter.get_collection_images(1)
        image = await adapter.get_image(123)
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
            raise NeuroVaultAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise NeuroVaultAPIError(f"Request failed: {e}") from e

    async def get_collections(self, limit: int = 10) -> List[NeuroVaultCollection]:
        """Get collections."""
        url = f"{BASE_URL}/collections"
        params: Dict[str, Any] = {"limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_collection(r) for r in data.get("results", [])]

    async def get_collection(self, collection_id: int) -> Optional[NeuroVaultCollection]:
        """Get collection by ID."""
        url = f"{BASE_URL}/collections/{collection_id}"
        data = await self._rate_limited_get(url)
        return self._parse_collection(data) if "id" in data else None

    async def get_collection_images(self, collection_id: int, limit: int = 10) -> List[NeuroVaultImage]:
        """Get images in a collection."""
        url = f"{BASE_URL}/collections/{collection_id}/images"
        params: Dict[str, Any] = {"limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_image(r) for r in data.get("results", [])]

    async def get_image(self, image_id: int) -> Optional[NeuroVaultImage]:
        """Get image by ID."""
        url = f"{BASE_URL}/images/{image_id}"
        data = await self._rate_limited_get(url)
        return self._parse_image(data) if "id" in data else None

    async def get_images(self, limit: int = 10) -> List[NeuroVaultImage]:
        """Get all images."""
        url = f"{BASE_URL}/images"
        params: Dict[str, Any] = {"limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_image(r) for r in data.get("results", [])]

    async def search_collections(self, query: str, limit: int = 10) -> List[NeuroVaultCollection]:
        """Search collections."""
        url = f"{BASE_URL}/collections"
        params: Dict[str, Any] = {"q": query, "limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_collection(r) for r in data.get("results", [])]

    async def search_images(self, query: str, limit: int = 10) -> List[NeuroVaultImage]:
        """Search images."""
        url = f"{BASE_URL}/images"
        params: Dict[str, Any] = {"q": query, "limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_image(r) for r in data.get("results", [])]

    async def search_by_tag(self, tag: str, limit: int = 10) -> List[NeuroVaultCollection]:
        """Search by tag."""
        url = f"{BASE_URL}/collections"
        params: Dict[str, Any] = {"tag": tag, "limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_collection(r) for r in data.get("results", [])]

    async def get_atlases(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get atlases."""
        url = f"{BASE_URL}/atlases"
        params: Dict[str, Any] = {"limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return data.get("results", [])

    async def get_nidm_results(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get NIDM results."""
        url = f"{BASE_URL}/nidm_results"
        params: Dict[str, Any] = {"limit": min(limit, 1000)}
        data = await self._rate_limited_get(url, params)
        return data.get("results", [])

    def _parse_collection(self, data: Dict[str, Any]) -> NeuroVaultCollection:
        return NeuroVaultCollection(
            id=data.get("id", 0), name=data.get("name", ""),
            url=data.get("url", ""), description=data.get("description", ""),
            owner=data.get("owner", ""), doi=data.get("DOI", ""),
            journal_name=data.get("journal_name", ""),
            paper_url=data.get("paper_url", ""), authors=data.get("authors", ""),
            number_of_images=data.get("number_of_images", 0),
            add_date=data.get("add_date", ""), modify_date=data.get("modify_date", ""),
            is_private=data.get("is_private", False), tags=data.get("tags", []),
        )

    def _parse_image(self, data: Dict[str, Any]) -> NeuroVaultImage:
        return NeuroVaultImage(
            id=data.get("id", 0), name=data.get("name", ""),
            url=data.get("url", ""), collection_id=data.get("collection_id", 0),
            collection_name=data.get("collection_name", ""),
            file_size=data.get("file_size", 0), description=data.get("description", ""),
            map_type=data.get("map_type", ""),
            analysis_level=data.get("analysis_level", ""),
            modality=data.get("modality", ""),
            target_template=data.get("target_template_image", ""),
            target_mask=data.get("target_mask_image", ""),
            number_of_subjects=data.get("number_of_subjects", 0),
            figure_number=data.get("figure_number", ""),
            thumbnail=data.get("thumbnail", ""), download_url=data.get("file", ""),
            not_mni=data.get("not_mni", False),
            brain_coverage=data.get("brain_coverage", ""),
            contrast_definition=data.get("contrast_definition", ""),
            statistic=data.get("statistic", ""),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/collections"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except NeuroVaultAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "NeuroVaultAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class NeuroVaultAPIError(Exception):
    pass


async def _test_neurovault() -> None:
    adapter = NeuroVaultAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    collections = await adapter.get_collections(3)
    print(f"[TEST] get_collections: found {len(collections)} results")
    assert isinstance(collections, list)
    await adapter.close()
    print("[TEST] All NeuroVault tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_neurovault())
