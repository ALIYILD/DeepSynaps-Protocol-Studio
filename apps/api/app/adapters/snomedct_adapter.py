"""
SNOMED CT Adapter for DeepSynaps Protocol Studio

Provides access to SNOMED CT clinical terminology via
NIH Clinical Tables API and IHTSDO Snowstorm API.

Primary API: https://clinicaltables.nlm.nih.gov/api/snomed/v3/search
Fallback API: https://browser.ihtsdotools.org/snowstorm/snomed-ct/
"""

import asyncio
import json
import logging
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


class SnomedctAdapter(BaseAdapter):
    """
    Adapter for SNOMED CT (Systematized Nomenclature of Medicine - Clinical Terms).

    Provides access to clinical concepts, relationships, and
    hierarchical structures via NIH Clinical Tables and Snowstorm APIs.
    """

    NIH_URL: str = "https://clinicaltables.nlm.nih.gov/api/snomed/v3/search"
    SNOWSTORM_URL: str = "https://browser.ihtsdotools.org/snowstorm/snomed-ct"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 3600

    @property
    def data_types(self) -> List[str]:
        return ["clinical_terminology", "concept", "snomed_code", "diagnosis"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search SNOMED CT concepts by term.

        Args:
            query: Clinical term to search (e.g., 'myocardial infarction').
            filters: Optional filters (semantic_tag, limit).

        Returns:
            Dictionary with matching SNOMED CT concepts.
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
            logger.error("HTTP error searching SNOMED CT: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "SNOMED CT"}
        except Exception as e:
            logger.error("Unexpected error searching SNOMED CT: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "SNOMED CT"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve SNOMED CT concept by SCTID.

        Args:
            identifier: SNOMED CT concept ID (SCTID).

        Returns:
            Dictionary with concept details, descriptions,
            and relationships.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            # Clean identifier
            sctid = identifier.replace("SNOMEDCT:", "").strip()

            concept = await self._get_concept_nih(sctid)
            if not concept or concept.get("not_found"):
                concept = await self._get_concept_snowstorm(sctid)

            self._set_cache(cache_key, concept)
            return concept

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching SNOMED CT %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "SNOMED CT"}
        except Exception as e:
            logger.error("Unexpected error fetching SNOMED CT %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "SNOMED CT"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "SNOMED CT Adapter",
            "version": "1.0.0",
            "source": "SNOMED CT (IHTSDO)",
            "source_url": "https://www.snomed.org",
            "description": (
                "Comprehensive clinical terminology for electronic health "
                "records covering diseases, procedures, anatomy, and more"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_endpoints": {
                "nih_clinical_tables": self.NIH_URL,
                "snowstorm_browser": self.SNOWSTORM_URL,
            },
            "rate_limit": "NIH: no limit / Snowstorm: moderate",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_nih(self, query: str, limit: int) -> dict:
        """Search SNOMED CT via NIH Clinical Tables API."""
        params: Dict[str, Any] = {
            "terms": query,
            "maxList": limit,
            "offset": 0,
        }

        response = await self._rate_limited_request("GET", self.NIH_URL, params=params)
        response.raise_for_status()
        data = response.json()

        # NIH returns: [total, [sctids], [preferred_terms], [semantic_tags]]
        if isinstance(data, list) and len(data) >= 4:
            total = data[0]
            sctids = data[1] if len(data) > 1 else []
            terms = data[2] if len(data) > 2 else []
            semantic_tags = data[3] if len(data) > 3 else []

            results = []
            for sctid, term, tag in zip(sctids[:limit], terms[:limit], semantic_tags[:limit]):
                results.append({
                    "sctid": sctid,
                    "preferred_term": term,
                    "semantic_tag": tag,
                    "fully_specified_name": f"{term} ({tag})" if tag else term,
                })

            return {
                "results": results,
                "total": total,
                "query": query,
                "source": "SNOMED CT",
                "api": "NIH Clinical Tables",
            }

        return {
            "results": [],
            "total": 0,
            "query": query,
            "source": "SNOMED CT",
        }

    async def _get_concept_nih(self, sctid: str) -> dict:
        """Get concept details via NIH Clinical Tables API."""
        params: Dict[str, Any] = {
            "terms": sctid,
            "maxList": 1,
            "offset": 0,
        }

        response = await self._rate_limited_request("GET", self.NIH_URL, params=params)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list) and len(data) >= 4 and data[1]:
            sctids = data[1]
            terms = data[2] if len(data) > 2 else []
            tags = data[3] if len(data) > 3 else []

            return {
                "identifier": sctid,
                "source": "SNOMED CT",
                "sctid": sctids[0] if sctids else sctid,
                "preferred_term": terms[0] if terms else "",
                "semantic_tag": tags[0] if tags else "",
                "found": True,
            }

        return {"identifier": sctid, "source": "SNOMED CT", "not_found": True}

    async def _get_concept_snowstorm(self, sctid: str) -> dict:
        """Get concept details via Snowstorm browser API."""
        url = f"{self.SNOWSTORM_URL}/browser/MAIN/concepts/{sctid}"
        response = await self._rate_limited_request("GET", url)

        if response.status_code == 200:
            concept = response.json()
            return {
                "identifier": sctid,
                "source": "SNOMED CT",
                "sctid": concept.get("conceptId", sctid),
                "preferred_term": self._extract_fsn(concept),
                "active": concept.get("active", False),
                "definition_status": concept.get("definitionStatus", ""),
                "module_id": concept.get("moduleId", ""),
                "effective_time": concept.get("effectiveTime", ""),
                "descriptions": [
                    {
                        "term": d.get("term", ""),
                        "type": d.get("type", ""),
                        "lang": d.get("lang", ""),
                        "active": d.get("active", False),
                    }
                    for d in concept.get("descriptions", [])[:10]
                ],
                "relationships": [
                    {
                        "type": r.get("type", {}).get("fsn", {}).get("term", ""),
                        "target": r.get("target", {}).get("fsn", {}).get("term", ""),
                        "active": r.get("active", False),
                    }
                    for r in concept.get("relationships", [])[:10]
                ],
                "found": True,
            }

        return {"identifier": sctid, "source": "SNOMED CT", "found": False}

    @staticmethod
    def _extract_fsn(concept: dict) -> str:
        """Extract fully specified name from concept."""
        fsn = concept.get("fsn", {})
        if isinstance(fsn, dict):
            return fsn.get("term", "")
        return str(fsn)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = SnomedctAdapter()
        print("=== SnomedctAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("myocardial infarction")
        print(f"Search 'myocardial infarction': {result.get('total', 0)} results\n")

        concept = await adapter.get_by_id("22298006")
        print(f"Get 22298006: {json.dumps(concept, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
