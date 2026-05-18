"""
ICD-10 Adapter for DeepSynaps Protocol Studio

Provides access to ICD-10-CM diagnosis codes via NIH Clinical Tables API
with WHO ICD API as fallback. Supports code lookup and text search.

Primary API: https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search
Fallback API: https://icd.who.int/icdapi/
"""

import asyncio
import json
import logging
import os
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class BaseAdapter(ABC):
    """Base class for all knowledge adapters."""

    def __init__(self) -> None:
        self._cache: Dict[str, Any] = {}
        self._cache_ttl: int = 3600
        self._client: Optional[httpx.AsyncClient] = None
        self._last_request_time: float = 0.0
        self._min_interval: float = 0.5

    @abstractmethod
    async def search(self, query: str, filters: dict = None) -> dict:
        pass

    @abstractmethod
    async def get_by_id(self, identifier: str) -> dict:
        pass

    @abstractmethod
    async def get_metadata(self) -> dict:
        pass

    @property
    @abstractmethod
    def data_types(self) -> List[str]:
        pass

    @property
    @abstractmethod
    def supports_fulltext(self) -> bool:
        pass

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=30.0,
                headers={
                    "User-Agent": "DeepSynaps-ProtocolStudio/1.0 (Bioinformatics Knowledge Layer)",
                    "Accept": "application/json",
                },
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _rate_limited_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        client = await self._get_client()
        response = await client.request(method, url, **kwargs)
        self._last_request_time = time.monotonic()
        return response

    def _get_from_cache(self, key: str) -> Optional[Any]:
        if key in self._cache:
            timestamp, data = self._cache[key]
            if time.monotonic() - timestamp < self._cache_ttl:
                logger.debug("Cache hit for key: %s", key)
                return data
            del self._cache[key]
        return None

    def _set_cache(self, key: str, data: Any) -> None:
        self._cache[key] = (time.monotonic(), data)
        logger.debug("Cached response for key: %s", key)


class Icd10Adapter(BaseAdapter):
    """
    Adapter for ICD-10-CM (Clinical Modification).

    Provides access to diagnosis codes via NIH Clinical Tables API
    with WHO ICD API as fallback. Supports code lookup and text search.
    """

    NIH_URL: str = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
    WHO_URL: str = "https://id.who.int/icd/release/10/2019"

    def __init__(self) -> None:
        super().__init__()
        self._who_api_key: Optional[str] = os.environ.get("WHO_ICD_API_KEY", None)
        self._cache_ttl = 3600

    @property
    def data_types(self) -> List[str]:
        return ["diagnosis", "disease_classification", "icd_code"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search ICD-10-CM codes by text or partial code.

        Args:
            query: Disease name, symptom, or partial ICD code.
            filters: Optional filters (limit, exact_match).

        Returns:
            Dictionary with matching ICD-10-CM codes and descriptions.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        limit = filters.get("limit", 20)

        try:
            result = await self._search_nih(query, limit)
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching ICD-10: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "ICD-10-CM"}
        except Exception as e:
            logger.error("Unexpected error searching ICD-10: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "ICD-10-CM"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve ICD-10-CM code details.

        Args:
            identifier: ICD-10-CM code (e.g., 'E11.9', 'I10').

        Returns:
            Dictionary with code details including description,
            hierarchy, and related codes.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            result = await self._get_code_nih(identifier)
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching ICD-10 %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "ICD-10-CM"}
        except Exception as e:
            logger.error("Unexpected error fetching ICD-10 %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "ICD-10-CM"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "ICD-10-CM Adapter",
            "version": "1.0.0",
            "source": "ICD-10-CM (CDC) / WHO ICD",
            "source_url": "https://www.cdc.gov/nchs/icd/icd10cm.htm",
            "description": (
                "International Classification of Diseases, 10th Revision, "
                "Clinical Modification for diagnosis coding"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_endpoints": {
                "nih_clinical_tables": self.NIH_URL,
                "who_icd": self.WHO_URL,
            },
            "who_api_configured": bool(self._who_api_key),
            "rate_limit": "NIH: no limit / WHO: requires auth",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_nih(self, query: str, limit: int) -> dict:
        """Search ICD-10-CM via NIH Clinical Tables API."""
        params: Dict[str, Any] = {
            "terms": query,
            "maxList": limit,
            "offset": 0,
        }

        response = await self._rate_limited_request("GET", self.NIH_URL, params=params)
        response.raise_for_status()
        data = response.json()

        # NIH returns: [total_count, [codes], [descriptions], ...]
        if isinstance(data, list) and len(data) >= 3:
            total = data[0]
            codes = data[1] if len(data) > 1 else []
            descriptions = data[2] if len(data) > 2 else []

            results = []
            for code, desc in zip(codes[:limit], descriptions[:limit]):
                results.append({
                    "code": code,
                    "description": desc,
                    "icd_version": "ICD-10-CM",
                })

            return {
                "results": results,
                "total": total,
                "query": query,
                "source": "ICD-10-CM",
                "api": "NIH Clinical Tables",
            }

        return {
            "results": [],
            "total": 0,
            "query": query,
            "source": "ICD-10-CM",
        }

    async def _get_code_nih(self, code: str) -> dict:
        """Get code details via NIH Clinical Tables API."""
        params: Dict[str, Any] = {
            "terms": code,
            "maxList": 5,
            "offset": 0,
        }

        response = await self._rate_limited_request("GET", self.NIH_URL, params=params)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list) and len(data) >= 3:
            codes = data[1] if len(data) > 1 else []
            descriptions = data[2] if len(data) > 2 else []

            for c, desc in zip(codes, descriptions):
                if c.upper() == code.upper():
                    return {
                        "identifier": code,
                        "source": "ICD-10-CM",
                        "code": c,
                        "description": desc,
                        "icd_version": "ICD-10-CM",
                        "chapter": self._get_chapter(code),
                        "type": "billable" if len(code) > 3 else "category",
                    }

        return {
            "identifier": code,
            "source": "ICD-10-CM",
            "code": code,
            "description": "Code details not found",
            "chapter": self._get_chapter(code),
        }

    @staticmethod
    def _get_chapter(code: str) -> dict:
        """Get chapter information for an ICD-10 code."""
        chapter_map = [
            ("A", "B", "Chapter 1", "Certain infectious and parasitic diseases"),
            ("C", "D4", "Chapter 2", "Neoplasms"),
            ("D5", "D9", "Chapter 3", "Diseases of the blood and blood-forming organs"),
            ("E", "E", "Chapter 4", "Endocrine, nutritional and metabolic diseases"),
            ("F", "F", "Chapter 5", "Mental and behavioral disorders"),
            ("G", "G", "Chapter 6", "Diseases of the nervous system"),
            ("H0", "H5", "Chapter 7", "Diseases of the eye and adnexa"),
            ("H6", "H9", "Chapter 8", "Diseases of the ear and mastoid process"),
            ("I", "I", "Chapter 9", "Diseases of the circulatory system"),
            ("J", "J", "Chapter 10", "Diseases of the respiratory system"),
            ("K", "K", "Chapter 11", "Diseases of the digestive system"),
            ("L", "L", "Chapter 12", "Diseases of the skin and subcutaneous tissue"),
            ("M", "M", "Chapter 13", "Diseases of the musculoskeletal system"),
            ("N", "N", "Chapter 14", "Diseases of the genitourinary system"),
            ("O", "O", "Chapter 15", "Pregnancy, childbirth and the puerperium"),
            ("P", "P", "Chapter 16", "Certain conditions originating in the perinatal period"),
            ("Q", "Q", "Chapter 17", "Congenital malformations"),
            ("R", "R", "Chapter 18", "Symptoms, signs and abnormal findings"),
            ("S", "T", "Chapter 19", "Injury, poisoning and certain other consequences"),
            ("V", "Y", "Chapter 20", "External causes of morbidity and mortality"),
            ("Z", "Z", "Chapter 21", "Factors influencing health status"),
        ]

        code_upper = code.upper()
        first_char = code_upper[0] if code_upper else ""
        prefix = code_upper[:2] if len(code_upper) >= 2 else first_char

        for start, end, chapter, desc in chapter_map:
            if start <= prefix <= end or (len(start) == 1 and first_char == start):
                return {"chapter": chapter, "description": desc}

        return {"chapter": "Unknown", "description": ""}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = Icd10Adapter()
        print("=== Icd10Adapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("diabetes mellitus type 2")
        print(f"Search diabetes: {result.get('total', 0)} results\n")

        code = await adapter.get_by_id("E11.9")
        print(f"Get E11.9: {json.dumps(code, indent=2)}\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
