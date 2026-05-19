#!/usr/bin/env python3
"""
UNII Adapter — FDA Substance Registration System (SRS)
https://fdasis.nlm.nih.gov/srs/

Provides access to the FDA Unique Ingredient Identifier (UNII) system for
standardized substance identification across regulatory and research contexts.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://precision.fda.gov/uniisearch/api/v1"
SEARCH_URL = "https://fdasis.nlm.nih.gov/srs/services/resolver"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class UNIISubstance:
    """Represents a UNII-registered substance."""
    unii: str
    display_name: str
    preferred_term: str
    synonyms: List[str] = field(default_factory=list)
    registry_number: str = ""
    smiles: str = ""
    inchi: str = ""
    inchikey: str = ""
    substance_type: str = ""
    source: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "unii": self.unii,
            "display_name": self.display_name,
            "preferred_term": self.preferred_term,
            "synonyms": self.synonyms,
            "registry_number": self.registry_number,
            "smiles": self.smiles,
            "inchi": self.inchi,
            "inchikey": self.inchikey,
            "substance_type": self.substance_type,
            "source": self.source,
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
        if entry is None:
            return None
        ts, value = entry
        if time.time() - ts > self._ttl:
            del self._store[key]
            return None
        return value

    def set(self, value: Any, *parts: str) -> None:
        key = self._key(*parts)
        self._store[key] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()

_CACHE = _Cache()


class UNIIAdapter:
    """Async adapter for the FDA UNII/SRS API.

    Provides methods to search substances by name, UNII code, CAS registry number,
    and retrieve chemical identifiers (SMILES, InChI).

    Example:
        adapter = UNIIAdapter()
        subs = await adapter.search_by_name("aspirin")
        sub = await adapter.get_by_unii("R16CO5Y76E")
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
            raise UNIIAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise UNIIAPIError(f"Request failed: {e}") from e

    async def search_by_name(
        self, name: str, limit: int = 10
    ) -> List[UNIISubstance]:
        """Search substances by name (partial match).

        Args:
            name: Substance name.
            limit: Max results.

        Returns:
            List of matching substances.
        """
        url = f"{BASE_URL}/search"
        params = {"name": name, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_substance(r) for r in data.get("results", [])]

    async def get_by_unii(self, unii: str) -> Optional[UNIISubstance]:
        """Retrieve substance by UNII code.

        Args:
            unii: UNII code (e.g., "R16CO5Y76E").

        Returns:
            Substance or None.
        """
        url = f"{BASE_URL}/substances/{unii}"
        data = await self._rate_limited_get(url)
        results = data.get("results", [])
        if results:
            return self._parse_substance(results[0])
        return None

    async def search_by_registry_number(
        self, registry_number: str
    ) -> List[UNIISubstance]:
        """Search by CAS Registry Number.

        Args:
            registry_number: CAS RN (e.g., "50-78-2").

        Returns:
            List of matching substances.
        """
        url = f"{BASE_URL}/search"
        params = {"registry_number": registry_number}
        data = await self._rate_limited_get(url, params)
        return [self._parse_substance(r) for r in data.get("results", [])]

    async def search_by_inchikey(
        self, inchikey: str
    ) -> List[UNIISubstance]:
        """Search by InChIKey.

        Args:
            inchikey: InChIKey string.

        Returns:
            List of matching substances.
        """
        url = f"{BASE_URL}/search"
        params = {"inchikey": inchikey}
        data = await self._rate_limited_get(url, params)
        return [self._parse_substance(r) for r in data.get("results", [])]

    async def search_by_smiles(
        self, smiles: str
    ) -> List[UNIISubstance]:
        """Search by SMILES string.

        Args:
            smiles: SMILES notation.

        Returns:
            List of matching substances.
        """
        url = f"{BASE_URL}/search"
        params = {"smiles": smiles}
        data = await self._rate_limited_get(url, params)
        return [self._parse_substance(r) for r in data.get("results", [])]

    async def search_by_substance_type(
        self, substance_type: str, limit: int = 10
    ) -> List[UNIISubstance]:
        """Search by substance type classification.

        Args:
            substance_type: Type string.
            limit: Max results.

        Returns:
            List of matching substances.
        """
        url = f"{BASE_URL}/search"
        params = {"substance_type": substance_type, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)
        return [self._parse_substance(r) for r in data.get("results", [])]

    async def get_all_substances(
        self, page: int = 1, per_page: int = 100
    ) -> Tuple[List[UNIISubstance], int]:
        """Get paginated list of all substances.

        Args:
            page: Page number.
            per_page: Results per page.

        Returns:
            Tuple of (results, total).
        """
        url = f"{BASE_URL}/substances"
        params = {"page": page, "limit": min(per_page, 100)}
        data = await self._rate_limited_get(url, params)
        results = [self._parse_substance(r) for r in data.get("results", [])]
        total = data.get("total", len(results))
        return results, total

    async def resolve_name(self, name: str) -> Optional[UNIISubstance]:
        """Resolve a substance name to its UNII record.

        Args:
            name: Substance name.

        Returns:
            Best matching substance or None.
        """
        url = f"{SEARCH_URL}"
        params = {"name": name}
        data = await self._rate_limited_get(url, params)
        results = data.get("results", [])
        if results:
            return self._parse_substance(results[0])
        return None

    def _parse_substance(self, data: Dict[str, Any]) -> UNIISubstance:
        return UNIISubstance(
            unii=data.get("unii", ""),
            display_name=data.get("display_name", ""),
            preferred_term=data.get("preferred_term", ""),
            synonyms=data.get("synonyms", []),
            registry_number=data.get("registry_number", ""),
            smiles=data.get("smiles", ""),
            inchi=data.get("inchi", ""),
            inchikey=data.get("inchikey", ""),
            substance_type=data.get("substance_type", ""),
            source=data.get("source", ""),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/search"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except UNIIAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "UNIIAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class UNIIAPIError(Exception):
    pass


async def _test_unii() -> None:
    adapter = UNIIAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    results = await adapter.search_by_name("aspirin", limit=3)
    print(f"[TEST] search_by_name: found {len(results)} results")
    assert isinstance(results, list)
    if results:
        by_unii = await adapter.get_by_unii(results[0].unii)
        print(f"[TEST] get_by_unii: {'PASS' if by_unii else 'FAIL'}")
    await adapter.close()
    print("[TEST] All UNII tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_unii())
