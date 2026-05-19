#!/usr/bin/env python3
"""
DailyMed Adapter — NIH DailyMed SPL/Label API
https://dailymed.nlm.nih.gov/api/

Provides access to FDA-approved medication labels, SPL (Structured Product Labeling)
data, including active ingredients, dosage, warnings, and adverse reactions.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BASE_URL = "https://dailymed.nlm.nih.gov/dailyservices/services/v2"
SPL_URL = "https://dailymed.nlm.nih.gov/dailyservices/services/v1"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0  # seconds between API calls
CACHE_TTL_SECONDS = 3600  # 1 hour


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class DailyMedLabel:
    """Represents a structured medication label from DailyMed."""
    set_id: str
    title: str
    version: int
    effective_date: str
    active_ingredients: List[str] = field(default_factory=list)
    inactive_ingredients: List[str] = field(default_factory=list)
    dosage_form: str = ""
    route_of_administration: str = ""
    warnings: str = ""
    adverse_reactions: str = ""
    drug_interactions: str = ""
    pregnancy_info: str = ""
    storage_conditions: str = ""
    manufacturer: str = ""
    spl_version: str = ""
    raw_xml: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "set_id": self.set_id,
            "title": self.title,
            "version": self.version,
            "effective_date": self.effective_date,
            "active_ingredients": self.active_ingredients,
            "inactive_ingredients": self.inactive_ingredients,
            "dosage_form": self.dosage_form,
            "route_of_administration": self.route_of_administration,
            "warnings": self.warnings,
            "adverse_reactions": self.adverse_reactions,
            "drug_interactions": self.drug_interactions,
            "pregnancy_info": self.pregnancy_info,
            "storage_conditions": self.storage_conditions,
            "manufacturer": self.manufacturer,
            "spl_version": self.spl_version,
        }


@dataclass
class DailyMedSearchResult:
    """Represents a search result from DailyMed."""
    set_id: str
    title: str
    spl_version: str
    published_date: str
    ndc_codes: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# In-memory cache with TTL
# ---------------------------------------------------------------------------
class _Cache:
    """Simple TTL cache for DailyMed responses."""

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


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------
class DailyMedAdapter:
    """Async adapter for the NIH DailyMed API.

    Provides methods to search medication labels, retrieve full SPL documents,
    and extract structured drug information including ingredients, warnings,
    and adverse reactions.

    Example:
        adapter = DailyMedAdapter()
        results = await adapter.search_by_drug_name("aspirin")
        label = await adapter.get_label(results[0].set_id)
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
        """Execute a rate-limited GET request with caching."""
        # Rate limiting
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)

        # Check cache
        cache_key = (url, json.dumps(params or {}, sort_keys=True))
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        client = await self._get_client()
        try:
            resp = await client.get(url, params=params or {})
            self._last_call_time = time.time()
            resp.raise_for_status()
            data = resp.json()
            _CACHE.set(data, *cache_key)
            return data
        except httpx.HTTPStatusError as e:
            raise DailyMedAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise DailyMedAPIError(f"Request failed: {e}") from e

    async def search_by_drug_name(
        self, drug_name: str, limit: int = 10
    ) -> List[DailyMedSearchResult]:
        """Search for medication labels by drug name.

        Args:
            drug_name: The generic or brand name of the drug.
            limit: Maximum number of results to return.

        Returns:
            List of search results containing set_id and title.
        """
        url = f"{BASE_URL}/spls.json"
        params = {"drug_name": drug_name, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)

        results: List[DailyMedSearchResult] = []
        for item in data.get("data", []):
            results.append(
                DailyMedSearchResult(
                    set_id=item.get("setid", ""),
                    title=item.get("title", ""),
                    spl_version=item.get("spl_version", ""),
                    published_date=item.get("published_date", ""),
                    ndc_codes=item.get("ndc", []),
                )
            )
        return results

    async def search_by_set_id(self, set_id: str) -> Optional[DailyMedLabel]:
        """Retrieve a full medication label by its SET_ID.

        Args:
            set_id: The DailyMed SET_ID identifier.

        Returns:
            Parsed DailyMedLabel or None if not found.
        """
        url = f"{BASE_URL}/spl/{set_id}.json"
        data = await self._rate_limited_get(url)
        return self._parse_label(data, set_id)

    async def get_label(self, set_id: str) -> Optional[DailyMedLabel]:
        """Alias for search_by_set_id."""
        return await self.search_by_set_id(set_id)

    async def search_by_ingredient(
        self, ingredient: str, limit: int = 10
    ) -> List[DailyMedSearchResult]:
        """Search labels by active ingredient name.

        Args:
            ingredient: Name of the active ingredient.
            limit: Maximum results.

        Returns:
            Matching labels containing the ingredient.
        """
        url = f"{BASE_URL}/spls.json"
        params = {"active_ingredient": ingredient, "limit": min(limit, 100)}
        data = await self._rate_limited_get(url, params)

        results: List[DailyMedSearchResult] = []
        for item in data.get("data", []):
            results.append(
                DailyMedSearchResult(
                    set_id=item.get("setid", ""),
                    title=item.get("title", ""),
                    spl_version=item.get("spl_version", ""),
                    published_date=item.get("published_date", ""),
                    ndc_codes=item.get("ndc", []),
                )
            )
        return results

    async def search_by_ndc(self, ndc: str) -> List[DailyMedSearchResult]:
        """Search for labels by NDC (National Drug Code).

        Args:
            ndc: The NDC code (with or without hyphens).

        Returns:
            Matching labels.
        """
        url = f"{BASE_URL}/spls.json"
        params = {"ndc": ndc.replace("-", "")}
        data = await self._rate_limited_get(url, params)

        results: List[DailyMedSearchResult] = []
        for item in data.get("data", []):
            results.append(
                DailyMedSearchResult(
                    set_id=item.get("setid", ""),
                    title=item.get("title", ""),
                    spl_version=item.get("spl_version", ""),
                    published_date=item.get("published_date", ""),
                    ndc_codes=item.get("ndc", []),
                )
            )
        return results

    async def get_spl_media(
        self, set_id: str, spl_version: str = "current"
    ) -> Dict[str, Any]:
        """Retrieve SPL media resources (images, PDFs) for a label.

        Args:
            set_id: The SET_ID.
            spl_version: SPL version identifier.

        Returns:
            Dictionary containing media resource URLs.
        """
        url = f"{SPL_URL}/spl/{set_id}/{spl_version}/media.json"
        return await self._rate_limited_get(url)

    async def get_all_spls(
        self, page: int = 1, per_page: int = 100
    ) -> Tuple[List[DailyMedSearchResult], int]:
        """Retrieve paginated list of all SPLs.

        Args:
            page: Page number (1-indexed).
            per_page: Results per page (max 100).

        Returns:
            Tuple of (results, total_count).
        """
        url = f"{BASE_URL}/spls.json"
        params = {"page": page, "limit": min(per_page, 100)}
        data = await self._rate_limited_get(url, params)

        results: List[DailyMedSearchResult] = []
        for item in data.get("data", []):
            results.append(
                DailyMedSearchResult(
                    set_id=item.get("setid", ""),
                    title=item.get("title", ""),
                    spl_version=item.get("spl_version", ""),
                    published_date=item.get("published_date", ""),
                    ndc_codes=item.get("ndc", []),
                )
            )
        total = data.get("metadata", {}).get("total_results", len(results))
        return results, total

    def _parse_label(self, data: Dict[str, Any], set_id: str) -> Optional[DailyMedLabel]:
        """Parse raw API response into DailyMedLabel dataclass."""
        if not data or "data" not in data:
            return None
        spl = data["data"]
        return DailyMedLabel(
            set_id=set_id,
            title=spl.get("title", ""),
            version=spl.get("version", 0),
            effective_date=spl.get("effective_date", ""),
            active_ingredients=[
                i.get("name", "") for i in spl.get("active_ingredients", [])
            ],
            inactive_ingredients=[
                i.get("name", "") for i in spl.get("inactive_ingredients", [])
            ],
            dosage_form=spl.get("dosage_form", ""),
            route_of_administration=spl.get("route_of_administration", ""),
            warnings=spl.get("warnings", ""),
            adverse_reactions=spl.get("adverse_reactions", ""),
            drug_interactions=spl.get("drug_interactions", ""),
            pregnancy_info=spl.get("pregnancy", ""),
            storage_conditions=spl.get("storage_conditions", ""),
            manufacturer=spl.get("manufacturer_name", ""),
            spl_version=spl.get("spl_version", ""),
        )

    async def health_check(self) -> bool:
        """Check if the DailyMed API is reachable.

        Returns:
            True if API responds with 200.
        """
        try:
            url = f"{BASE_URL}/spls.json"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "data" in data
        except DailyMedAPIError:
            return False

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "DailyMedAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class DailyMedAPIError(Exception):
    """Raised when the DailyMed API returns an error or request fails."""


# ---------------------------------------------------------------------------
# Unit tests (self-contained)
# ---------------------------------------------------------------------------
async def _test_dailymed() -> None:
    """Run basic unit tests for DailyMedAdapter."""
    adapter = DailyMedAdapter()

    # Test health check
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL (API may be down)'}")

    # Test search by drug name
    results = await adapter.search_by_drug_name("aspirin", limit=3)
    print(f"[TEST] search_by_drug_name: found {len(results)} results")
    assert isinstance(results, list), "search should return a list"

    if results:
        label = await adapter.get_label(results[0].set_id)
        print(f"[TEST] get_label: {'PASS' if label else 'FAIL'}")
        if label:
            assert label.set_id == results[0].set_id, "set_id mismatch"
            print(f"  - Title: {label.title[:60]}...")

    # Test search by ingredient
    ing_results = await adapter.search_by_ingredient("acetaminophen", limit=2)
    print(f"[TEST] search_by_ingredient: found {len(ing_results)} results")

    await adapter.close()
    print("[TEST] All DailyMed tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_dailymed())
