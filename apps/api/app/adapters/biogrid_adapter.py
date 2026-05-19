"""
BioGRID Adapter for DeepSynaps Protocol Studio

Provides access to BioGRID for protein-protein interactions,
genetic interactions, and molecular interaction data.

API Documentation: https://webservice.thebiogrid.org/
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


class BiogridAdapter(BaseAdapter):
    """
    Adapter for BioGRID (Biological General Repository for Interaction Datasets).

    Provides access to protein-protein and genetic interaction data
    from multiple organisms and experimental systems.
    """

    BASE_URL: str = "https://webservice.thebiogrid.org"

    def __init__(self) -> None:
        super().__init__()
        self._api_key: Optional[str] = os.environ.get("BIOGRID_API_KEY", None)
        self._cache_ttl = 1800

    @property
    def data_types(self) -> List[str]:
        return ["protein_interaction", "genetic_interaction", "gene", "protein"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search BioGRID for interactions by gene or protein name.

        Args:
            query: Gene symbol, UniProt ID, or Entrez gene ID.
            filters: Optional filters (tax_id, interaction_type, evidence).

        Returns:
            Dictionary with interaction data and metadata.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            params: Dict[str, Any] = {
                "searchNames": "true",
                "geneList": query,
                "taxId": filters.get("tax_id", 9606),
                "start": filters.get("offset", 0),
                "max": filters.get("limit", 50),
                "format": "json",
            }

            if self._api_key:
                params["accesskey"] = self._api_key

            if filters.get("interaction_type"):
                params["interactionType"] = filters["interaction_type"]
            if filters.get("evidence"):
                params["includeEvidence"] = "true"

            url = f"{self.BASE_URL}/interactions"
            response = await self._rate_limited_request("GET", url, params=params)
            response.raise_for_status()
            data = response.json()

            interactions = []
            for key, interaction in list(data.items())[:50]:
                if isinstance(interaction, dict):
                    interactions.append({
                        "biogrid_id": interaction.get("BIOGRID_INTERACTION_ID", key),
                        "gene_a": {
                            "id": interaction.get("ENTREZ_GENE_A", ""),
                            "symbol": interaction.get("OFFICIAL_SYMBOL_A", ""),
                            "systematic_name": interaction.get("SYSTEMATIC_NAME_A", ""),
                        },
                        "gene_b": {
                            "id": interaction.get("ENTREZ_GENE_B", ""),
                            "symbol": interaction.get("OFFICIAL_SYMBOL_B", ""),
                            "systematic_name": interaction.get("SYSTEMATIC_NAME_B", ""),
                        },
                        "interaction_type": interaction.get("EXPERIMENTAL_SYSTEM", ""),
                        "interaction_type_desc": interaction.get("EXPERIMENTAL_SYSTEM_TYPE", ""),
                        "pubmed_id": interaction.get("PUBMED_ID", ""),
                        "throughput": interaction.get("THROUGHPUT", ""),
                        "score": interaction.get("SCORE", ""),
                        "modification": interaction.get("MODIFICATION", ""),
                        "qualifications": interaction.get("QUALIFICATIONS", ""),
                        "tags": interaction.get("TAGS", ""),
                        "source_database": interaction.get("SOURCE_DATABASE", ""),
                        "organism_a": interaction.get("ORGANISM_A", 0),
                        "organism_b": interaction.get("ORGANISM_B", 0),
                    })

            result = {
                "interactions": interactions,
                "total": len(interactions),
                "query": query,
                "source": "BioGRID",
                "note": "API key recommended for higher rate limits" if not self._api_key else None,
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching BioGRID: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "BioGRID"}
        except Exception as e:
            logger.error("Unexpected error searching BioGRID: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "BioGRID"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve interaction details by BioGRID interaction ID.

        Args:
            identifier: BioGRID interaction ID.

        Returns:
            Dictionary with interaction details.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            params: Dict[str, Any] = {
                "biogridIdList": identifier,
                "format": "json",
            }
            if self._api_key:
                params["accesskey"] = self._api_key

            url = f"{self.BASE_URL}/interactions"
            response = await self._rate_limited_request("GET", url, params=params)
            response.raise_for_status()
            data = response.json()

            interaction = list(data.values())[0] if data else {}
            result = {
                "identifier": identifier,
                "source": "BioGRID",
                "interaction": interaction if interaction else None,
                "found": bool(interaction),
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching BioGRID %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "BioGRID"}
        except Exception as e:
            logger.error("Unexpected error fetching BioGRID %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "BioGRID"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "BioGRID Adapter",
            "version": "1.0.0",
            "source": "BioGRID",
            "source_url": "https://thebiogrid.org",
            "description": (
                "Curated protein-protein and genetic interaction data "
                "from multiple organisms and experimental systems"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "api_key_configured": bool(self._api_key),
            "rate_limit": "API key recommended",
            "cache_ttl_seconds": self._cache_ttl,
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = BiogridAdapter()
        print("=== BiogridAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("BRCA1")
        print(f"Search 'BRCA1': {result.get('total', 0)} interactions\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
