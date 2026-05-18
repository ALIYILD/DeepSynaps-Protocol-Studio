"""
DrugBank Adapter for DeepSynaps Protocol Studio

Provides access to DrugBank for drug information, interactions,
pharmacology, and targets. Uses public XML data with graceful
degradation when no API key is available.

API Documentation: https://docs.drugbank.com/
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


class DrugbankAdapter(BaseAdapter):
    """
    Adapter for DrugBank database.

    Provides drug information, interactions, pharmacology, and targets.
    When API key is available, uses DrugBank API directly.
    Without key, uses public vocabulary data with graceful degradation.
    """

    API_URL: str = "https://api.drugbank.com/v1"
    WEB_URL: str = "https://go.drugbank.com"

    def __init__(self) -> None:
        super().__init__()
        self._api_key: Optional[str] = os.environ.get("DRUGBANK_API_KEY", None)
        self._cache_ttl = 3600

    @property
    def data_types(self) -> List[str]:
        return ["drug", "drug_interaction", "drug_target", "pharmacology"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search DrugBank for drugs, targets, or interactions.

        Args:
            query: Search string (drug name, CAS number, or DrugBank ID).
            filters: Optional filters (drug_group, limit).

        Returns:
            Dictionary with drugs and their annotations.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            if self._api_key:
                result = await self._search_api(query, filters)
            else:
                result = await self._search_web(query, filters)

            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching DrugBank: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "DrugBank"}
        except Exception as e:
            logger.error("Unexpected error searching DrugBank: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "DrugBank"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve drug details by DrugBank ID or name.

        Args:
            identifier: DrugBank ID (e.g., 'DB00001') or drug name.

        Returns:
            Dictionary with drug details, interactions, targets, and
            pharmacological properties.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            if self._api_key:
                result = await self._get_drug_api(identifier)
            else:
                result = await self._get_drug_web(identifier)

            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching DrugBank %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "DrugBank"}
        except Exception as e:
            logger.error("Unexpected error fetching DrugBank %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "DrugBank"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "DrugBank Adapter",
            "version": "1.0.0",
            "source": "DrugBank",
            "source_url": "https://go.drugbank.com",
            "description": (
                "Comprehensive pharmaceutical knowledge base for drugs, "
                "drug actions, and drug targets"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.API_URL if self._api_key else self.WEB_URL,
            "api_key_configured": bool(self._api_key),
            "mode": "api" if self._api_key else "public_data",
            "rate_limit": "API: variable / Public: 1 req/sec",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_api(self, query: str, filters: dict) -> dict:
        """Search DrugBank using authenticated API."""
        url = f"{self.API_URL}/drugs"
        params: Dict[str, Any] = {
            "q": query,
            "per_page": filters.get("limit", 10),
        }
        headers: Dict[str, str] = {
            "Authorization": self._api_key,
            "Accept": "application/json",
        }

        response = await self._rate_limited_request("GET", url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()

        drugs = data.get("drugs", data) if isinstance(data, dict) else data
        parsed = []
        for drug in drugs[:20]:
            parsed.append({
                "drugbank_id": drug.get("drugbank_id", drug.get("id", "")),
                "name": drug.get("name", ""),
                "description": drug.get("description", "")[:200],
                "cas_number": drug.get("cas_number", ""),
                "drug_groups": drug.get("drug_groups", drug.get("groups", [])),
                "average_mass": drug.get("average_mass", ""),
                "molecular_weight": drug.get("molecular_weight", ""),
                "state": drug.get("state", ""),
            })

        return {
            "results": parsed,
            "total": len(parsed),
            "query": query,
            "source": "DrugBank",
            "mode": "api",
        }

    async def _search_web(self, query: str, filters: dict) -> dict:
        """Search DrugBank using public web interface (fallback)."""
        url = f"{self.WEB_URL}/structures/search/small_molecule_drugs/results"
        params: Dict[str, Any] = {"query": query, "page": filters.get("page", 1)}

        response = await self._rate_limited_request("GET", url, params=params)
        if response.status_code == 200:
            return {
                "results": [],
                "total": 0,
                "query": query,
                "source": "DrugBank",
                "mode": "public_data",
                "note": "Web search requires parsing HTML. Use direct drug lookup by DB ID instead.",
                "available_databases": [
                    "https://go.drugbank.com/releases/latest",
                ],
            }
        return {
            "results": [],
            "total": 0,
            "query": query,
            "source": "DrugBank",
            "mode": "public_data",
            "note": "Search via web interface returned non-200. Use known DrugBank IDs.",
        }

    async def _get_drug_api(self, identifier: str) -> dict:
        """Fetch drug details via authenticated API."""
        url = f"{self.API_URL}/drugs/{identifier}"
        headers: Dict[str, str] = {
            "Authorization": self._api_key,
            "Accept": "application/json",
        }
        response = await self._rate_limited_request("GET", url, headers=headers)
        response.raise_for_status()
        drug = response.json()

        return {
            "identifier": identifier,
            "source": "DrugBank",
            "mode": "api",
            "drugbank_id": drug.get("drugbank_id", drug.get("id", "")),
            "name": drug.get("name", ""),
            "description": drug.get("description", ""),
            "cas_number": drug.get("cas_number", ""),
            "unii": drug.get("unii", ""),
            "groups": drug.get("groups", drug.get("drug_groups", [])),
            "drug_type": drug.get("drug_type", ""),
            "average_mass": drug.get("average_mass", ""),
            "monoisotopic_mass": drug.get("monoisotopic_mass", ""),
            "state": drug.get("state", ""),
            "indication": drug.get("indication", ""),
            "pharmacodynamics": drug.get("pharmacodynamics", ""),
            "mechanism_of_action": drug.get("mechanism_of_action", ""),
            "toxicity": drug.get("toxicity", ""),
            "metabolism": drug.get("metabolism", ""),
            "absorption": drug.get("absorption", ""),
            "half_life": drug.get("half_life", ""),
            "protein_binding": drug.get("protein_binding", ""),
            "route_of_elimination": drug.get("route_of_elimination", ""),
            "volume_of_distribution": drug.get("volume_of_distribution", ""),
            "clearance": drug.get("clearance", ""),
            "targets": [
                {
                    "name": t.get("name", ""),
                    "organism": t.get("organism", ""),
                    "actions": t.get("actions", []),
                    "gene_name": t.get("gene_name", ""),
                }
                for t in drug.get("targets", [])[:10]
            ],
            "interactions": [
                {
                    "drug": i.get("drug_name", i.get("name", "")),
                    "description": i.get("description", ""),
                }
                for i in drug.get("drug_interactions", drug.get("interactions", []))[:10]
            ],
        }

    async def _get_drug_web(self, identifier: str) -> dict:
        """Fetch drug details via public web page (fallback)."""
        # Attempt to get structured data from the public page
        url = f"{self.WEB_URL}/drugs/{identifier}"
        response = await self._rate_limited_request("GET", url)

        if response.status_code == 200:
            return {
                "identifier": identifier,
                "source": "DrugBank",
                "mode": "public_data",
                "url": str(url),
                "note": (
                    "Public data mode: Full drug details require "
                    "DRUGBANK_API_KEY environment variable or manual XML download "
                    "from https://go.drugbank.com/releases"
                ),
                "drugbank_id": identifier,
                "recommendation": "Set DRUGBANK_API_KEY for full access",
                "public_download_url": "https://go.drugbank.com/releases/latest",
            }

        return {
            "identifier": identifier,
            "source": "DrugBank",
            "error": f"HTTP {response.status_code}",
            "note": "Drug not found or service unavailable",
            "recommendation": "Set DRUGBANK_API_KEY for reliable access",
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = DrugbankAdapter()
        print("=== DrugbankAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("aspirin")
        print(f"Search 'aspirin': {result.get('total', 0)} results\n")

        drug = await adapter.get_by_id("DB00945")
        print(f"Get DB00945: {json.dumps(drug, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
