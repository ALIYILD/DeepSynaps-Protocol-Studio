#!/usr/bin/env python3
"""
Orange Book Adapter — FDA Approved Drug Products with Therapeutic Equivalence
https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files

Provides access to FDA Orange Book data including approved prescription and
over-the-counter drug products, therapeutic equivalence codes, patents, and
exclusivity information.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://www.accessdata.fda.gov/spl/orangebook/"
DOWNLOAD_URL = "https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files"
DEFAULT_TIMEOUT = 45.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 7200


@dataclass
class OrangeBookProduct:
    """Represents a single drug product in the Orange Book."""
    appl_no: str
    product_no: str
    trade_name: str
    active_ingredient: str
    dosage_form: str
    route: str
    strength: str
    appl_type: str  # NDA or ANDA
    applicant: str
    applicant_full_name: str
    te_code: str = ""  # Therapeutic Equivalence Code
    reference_drug: bool = False
    reference_standard: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "appl_no": self.appl_no,
            "product_no": self.product_no,
            "trade_name": self.trade_name,
            "active_ingredient": self.active_ingredient,
            "dosage_form": self.dosage_form,
            "route": self.route,
            "strength": self.strength,
            "appl_type": self.appl_type,
            "applicant": self.applicant,
            "applicant_full_name": self.applicant_full_name,
            "te_code": self.te_code,
            "reference_drug": self.reference_drug,
            "reference_standard": self.reference_standard,
        }


@dataclass
class OrangeBookPatent:
    """Patent information for a drug product."""
    appl_no: str
    product_no: str
    patent_no: str
    patent_expire_date: str
    drug_substance_flag: bool
    drug_product_flag: bool
    patent_use_code: str
    delist_flag: bool


@dataclass
class OrangeBookExclusivity:
    """Exclusivity information for a drug product."""
    appl_no: str
    product_no: str
    exclusivity_code: str
    exclusivity_date: str


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


class OrangeBookAdapter:
    """Async adapter for FDA Orange Book data.

    The Orange Book identifies drug products approved by the FDA and provides
    therapeutic equivalence evaluations for multisource prescription products.

    Example:
        adapter = OrangeBookAdapter()
        products = await adapter.search_by_ingredient("ibuprofen")
        patents = await adapter.get_patents(appl_no="020402")
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
            raise OrangeBookAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise OrangeBookAPIError(f"Request failed: {e}") from e

    async def search_by_ingredient(
        self, ingredient: str, exact: bool = False
    ) -> List[OrangeBookProduct]:
        """Search drug products by active ingredient.

        Args:
            ingredient: Active ingredient name (e.g., "ibuprofen").
            exact: If True, require exact match.

        Returns:
            List of matching OrangeBookProduct entries.
        """
        url = f"{BASE_URL}ob_download_json"
        data = await self._rate_limited_get(url)
        products: List[OrangeBookProduct] = []
        results = data.get("results", [])

        if isinstance(results, list):
            for r in results:
                if not isinstance(r, dict):
                    continue
                ai = r.get("active_ingredient", "")
                if exact:
                    if ingredient.lower() != ai.lower():
                        continue
                else:
                    if ingredient.lower() not in ai.lower():
                        continue
                products.append(self._parse_product(r))
        return products

    async def search_by_trade_name(
        self, trade_name: str, exact: bool = False
    ) -> List[OrangeBookProduct]:
        """Search drug products by trade (brand) name.

        Args:
            trade_name: Brand name (e.g., "Advil").
            exact: If True, require exact match.

        Returns:
            List of matching OrangeBookProduct entries.
        """
        url = f"{BASE_URL}ob_download_json"
        data = await self._rate_limited_get(url)
        products: List[OrangeBookProduct] = []
        results = data.get("results", [])

        if isinstance(results, list):
            for r in results:
                if not isinstance(r, dict):
                    continue
                tn = r.get("trade_name", "")
                if exact:
                    if trade_name.lower() != tn.lower():
                        continue
                else:
                    if trade_name.lower() not in tn.lower():
                        continue
                products.append(self._parse_product(r))
        return products

    async def search_by_applicant(self, applicant: str) -> List[OrangeBookProduct]:
        """Search drug products by applicant (company) name.

        Args:
            applicant: Applicant abbreviation or full name.

        Returns:
            List of matching OrangeBookProduct entries.
        """
        url = f"{BASE_URL}ob_download_json"
        data = await self._rate_limited_get(url)
        products: List[OrangeBookProduct] = []
        results = data.get("results", [])

        if isinstance(results, list):
            for r in results:
                if not isinstance(r, dict):
                    continue
                app = r.get("applicant_full_name", "")
                if applicant.lower() in app.lower():
                    products.append(self._parse_product(r))
        return products

    async def search_by_appl_no(self, appl_no: str) -> List[OrangeBookProduct]:
        """Search drug products by application number.

        Args:
            appl_no: Application number (e.g., "020402").

        Returns:
            List of matching OrangeBookProduct entries.
        """
        url = f"{BASE_URL}ob_download_json"
        data = await self._rate_limited_get(url)
        products: List[OrangeBookProduct] = []
        results = data.get("results", [])

        if isinstance(results, list):
            for r in results:
                if not isinstance(r, dict):
                    continue
                if r.get("appl_no", "") == appl_no:
                    products.append(self._parse_product(r))
        return products

    async def get_patents(self, appl_no: str) -> List[OrangeBookPatent]:
        """Retrieve patent information for a given application number.

        Args:
            appl_no: The application number.

        Returns:
            List of OrangeBookPatent entries.
        """
        url = f"{BASE_URL}ob_download_json"
        data = await self._rate_limited_get(url)
        patents: List[OrangeBookPatent] = []
        patent_list = data.get("patents", [])

        if isinstance(patent_list, list):
            for p in patent_list:
                if not isinstance(p, dict):
                    continue
                if p.get("appl_no") == appl_no:
                    patents.append(
                        OrangeBookPatent(
                            appl_no=p.get("appl_no", ""),
                            product_no=p.get("product_no", ""),
                            patent_no=p.get("patent_no", ""),
                            patent_expire_date=p.get("patent_expire_date_text", ""),
                            drug_substance_flag=p.get("drug_substance_flag", "N") == "Y",
                            drug_product_flag=p.get("drug_product_flag", "N") == "Y",
                            patent_use_code=p.get("patent_use_code", ""),
                            delist_flag=p.get("delist_flag", "N") == "Y",
                        )
                    )
        return patents

    async def get_exclusivity(self, appl_no: str) -> List[OrangeBookExclusivity]:
        """Retrieve exclusivity information for a given application number.

        Args:
            appl_no: The application number.

        Returns:
            List of OrangeBookExclusivity entries.
        """
        url = f"{BASE_URL}ob_download_json"
        data = await self._rate_limited_get(url)
        exclusivities: List[OrangeBookExclusivity] = []
        excl_list = data.get("exclusivity", [])

        if isinstance(excl_list, list):
            for e in excl_list:
                if not isinstance(e, dict):
                    continue
                if e.get("appl_no") == appl_no:
                    exclusivities.append(
                        OrangeBookExclusivity(
                            appl_no=e.get("appl_no", ""),
                            product_no=e.get("product_no", ""),
                            exclusivity_code=e.get("exclusivity_code", ""),
                            exclusivity_date=e.get("exclusivity_date", ""),
                        )
                    )
        return exclusivities

    async def get_reference_standards(self) -> List[OrangeBookProduct]:
        """Get all reference standard drug products.

        Returns:
            List of OrangeBookProduct entries marked as reference standards.
        """
        url = f"{BASE_URL}ob_download_json"
        data = await self._rate_limited_get(url)
        products: List[OrangeBookProduct] = []
        results = data.get("results", [])

        if isinstance(results, list):
            for r in results:
                if not isinstance(r, dict):
                    continue
                if r.get("reference_standard", "N") == "Y":
                    products.append(self._parse_product(r))
        return products

    async def get_products_by_te_code(self, te_code: str) -> List[OrangeBookProduct]:
        """Get all products with a specific therapeutic equivalence code.

        Args:
            te_code: TE code (e.g., "AB", "BX").

        Returns:
            List of matching OrangeBookProduct entries.
        """
        url = f"{BASE_URL}ob_download_json"
        data = await self._rate_limited_get(url)
        products: List[OrangeBookProduct] = []
        results = data.get("results", [])

        if isinstance(results, list):
            for r in results:
                if not isinstance(r, dict):
                    continue
                if r.get("te_code", "").upper() == te_code.upper():
                    products.append(self._parse_product(r))
        return products

    def _parse_product(self, data: Dict[str, Any]) -> OrangeBookProduct:
        return OrangeBookProduct(
            appl_no=data.get("appl_no", ""),
            product_no=data.get("product_no", ""),
            trade_name=data.get("trade_name", ""),
            active_ingredient=data.get("active_ingredient", ""),
            dosage_form=data.get("dosage_form", ""),
            route=data.get("route", ""),
            strength=data.get("strength", ""),
            appl_type=data.get("appl_type", ""),
            applicant=data.get("applicant", ""),
            applicant_full_name=data.get("applicant_full_name", ""),
            te_code=data.get("te_code", ""),
            reference_drug=data.get("reference_drug", "N") == "Y",
            reference_standard=data.get("reference_standard", "N") == "Y",
        )

    async def health_check(self) -> bool:
        """Check if Orange Book data is accessible."""
        try:
            url = f"{BASE_URL}ob_download_json"
            data = await self._rate_limited_get(url)
            return "results" in data or "patents" in data
        except OrangeBookAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "OrangeBookAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class OrangeBookAPIError(Exception):
    """Raised when the Orange Book API returns an error or request fails."""


async def _test_orange_book() -> None:
    adapter = OrangeBookAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")

    results = await adapter.search_by_ingredient("ibuprofen", limit=3)
    print(f"[TEST] search_by_ingredient: found {len(results)} results")
    assert isinstance(results, list)

    if results:
        patents = await adapter.get_patents(results[0].appl_no)
        print(f"[TEST] get_patents: found {len(patents)} patents")

    await adapter.close()
    print("[TEST] All OrangeBook tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_orange_book())
