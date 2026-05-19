#!/usr/bin/env python3
"""
NDC Directory Adapter — FDA National Drug Code Directory
https://www.accessdata.fda.gov/cdr/ndc/

Provides access to the FDA NDC Directory containing product identifier
information for human drugs in finished packaged form.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.accessdata.fda.gov/rest/ndc"
DEFAULT_TIMEOUT = 30.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 3600


@dataclass
class NDCProduct:
    """Represents an NDC drug product."""
    product_ndc: str
    generic_name: str
    labeler_name: str
    brand_name: str
    active_ingredients: List[Dict[str, str]] = field(default_factory=list)
    finished: bool = False
    dosage_form: str = ""
    route: str = ""
    marketing_category: str = ""
    product_type: str = ""
    marketing_start_date: str = ""
    listing_expiration_date: str = ""
    packaging: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "product_ndc": self.product_ndc,
            "generic_name": self.generic_name,
            "labeler_name": self.labeler_name,
            "brand_name": self.brand_name,
            "active_ingredients": self.active_ingredients,
            "finished": self.finished,
            "dosage_form": self.dosage_form,
            "route": self.route,
            "marketing_category": self.marketing_category,
            "product_type": self.product_type,
            "marketing_start_date": self.marketing_start_date,
            "listing_expiration_date": self.listing_expiration_date,
            "packaging": self.packaging,
        }


@dataclass
class NDCPackage:
    """Represents an NDC package."""
    package_ndc: str
    description: str


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


class NDCDirectoryAdapter:
    """Async adapter for the FDA NDC Directory API.

    Provides methods to search drug products by NDC, generic name, brand name,
    and labeler name.

    Example:
        adapter = NDCDirectoryAdapter()
        products = await adapter.search_by_generic_name("ibuprofen")
        product = await adapter.get_product_by_ndc("0573-0160")
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
            raise NDCDirectoryAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise NDCDirectoryAPIError(f"Request failed: {e}") from e

    async def get_product_by_ndc(self, product_ndc: str) -> Optional[NDCProduct]:
        """Retrieve a product by its NDC code.

        Args:
            product_ndc: Product NDC (e.g., "0573-0160").

        Returns:
            NDCProduct or None.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"product_ndc": product_ndc})
        results = data.get("results", [])
        if results:
            return self._parse_product(results[0])
        return None

    async def search_by_generic_name(
        self, generic_name: str, limit: int = 10
    ) -> List[NDCProduct]:
        """Search products by generic name.

        Args:
            generic_name: Generic drug name.
            limit: Max results.

        Returns:
            List of matching NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"generic_name": generic_name, "limit": limit})
        return [self._parse_product(r) for r in data.get("results", [])]

    async def search_by_brand_name(
        self, brand_name: str, limit: int = 10
    ) -> List[NDCProduct]:
        """Search products by brand name.

        Args:
            brand_name: Brand name.
            limit: Max results.

        Returns:
            List of matching NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"brand_name": brand_name, "limit": limit})
        return [self._parse_product(r) for r in data.get("results", [])]

    async def search_by_labeler_name(
        self, labeler_name: str, limit: int = 10
    ) -> List[NDCProduct]:
        """Search products by labeler (manufacturer) name.

        Args:
            labeler_name: Labeler name.
            limit: Max results.

        Returns:
            List of matching NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"labeler_name": labeler_name, "limit": limit})
        return [self._parse_product(r) for r in data.get("results", [])]

    async def search_by_ingredient(
        self, ingredient: str, limit: int = 10
    ) -> List[NDCProduct]:
        """Search products by active ingredient.

        Args:
            ingredient: Active ingredient name.
            limit: Max results.

        Returns:
            List of matching NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"active_ingredient": ingredient, "limit": limit})
        return [self._parse_product(r) for r in data.get("results", [])]

    async def search_by_package_ndc(
        self, package_ndc: str
    ) -> List[NDCProduct]:
        """Search products by package NDC.

        Args:
            package_ndc: Package NDC code.

        Returns:
            List of matching NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"package_ndc": package_ndc})
        return [self._parse_product(r) for r in data.get("results", [])]

    async def search_by_product_type(
        self, product_type: str, limit: int = 10
    ) -> List[NDCProduct]:
        """Search products by product type.

        Args:
            product_type: Product type (e.g., "HUMAN PRESCRIPTION DRUG").
            limit: Max results.

        Returns:
            List of matching NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"product_type": product_type, "limit": limit})
        return [self._parse_product(r) for r in data.get("results", [])]

    async def search_by_dosage_form(
        self, dosage_form: str, limit: int = 10
    ) -> List[NDCProduct]:
        """Search products by dosage form.

        Args:
            dosage_form: Dosage form (e.g., "TABLET").
            limit: Max results.

        Returns:
            List of matching NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"dosage_form": dosage_form, "limit": limit})
        return [self._parse_product(r) for r in data.get("results", [])]

    async def get_finished_products(
        self, limit: int = 100
    ) -> List[NDCProduct]:
        """Get all finished drug products.

        Args:
            limit: Max results.

        Returns:
            List of finished NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"finished": "true", "limit": limit})
        return [self._parse_product(r) for r in data.get("results", [])]

    async def search_by_route(
        self, route: str, limit: int = 10
    ) -> List[NDCProduct]:
        """Search products by route of administration.

        Args:
            route: Route (e.g., "ORAL").
            limit: Max results.

        Returns:
            List of matching NDCProduct.
        """
        url = f"{BASE_URL}/ndc.json"
        data = await self._rate_limited_get(url, {"route": route, "limit": limit})
        return [self._parse_product(r) for r in data.get("results", [])]

    def _parse_product(self, data: Dict[str, Any]) -> NDCProduct:
        return NDCProduct(
            product_ndc=data.get("product_ndc", ""),
            generic_name=data.get("generic_name", ""),
            labeler_name=data.get("labeler_name", ""),
            brand_name=data.get("brand_name", ""),
            active_ingredients=data.get("active_ingredients", []),
            finished=data.get("finished", False),
            dosage_form=data.get("dosage_form", ""),
            route=data.get("route", ""),
            marketing_category=data.get("marketing_category", ""),
            product_type=data.get("product_type", ""),
            marketing_start_date=data.get("marketing_start_date", ""),
            listing_expiration_date=data.get("listing_expiration_date", ""),
            packaging=data.get("packaging", []),
        )

    async def health_check(self) -> bool:
        try:
            url = f"{BASE_URL}/ndc.json"
            data = await self._rate_limited_get(url, {"limit": 1})
            return "results" in data
        except NDCDirectoryAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "NDCDirectoryAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class NDCDirectoryAPIError(Exception):
    pass


async def _test_ndc() -> None:
    adapter = NDCDirectoryAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    results = await adapter.search_by_generic_name("ibuprofen", limit=3)
    print(f"[TEST] search_by_generic_name: found {len(results)} results")
    assert isinstance(results, list)
    await adapter.close()
    print("[TEST] All NDC tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_ndc())
