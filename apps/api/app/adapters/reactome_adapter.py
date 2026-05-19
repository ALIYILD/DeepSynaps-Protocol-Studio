"""
Reactome Adapter for DeepSynaps Protocol Studio

Provides access to Reactome pathway database for biological pathways,
reactions, protein complexes, and pathway enrichment analysis.

API Documentation: https://reactome.org/ContentService/
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


class ReactomeAdapter(BaseAdapter):
    """
    Adapter for Reactome Pathway Database.

    Provides access to curated biological pathways, reactions,
    protein complexes, and pathway enrichment analysis.
    """

    CONTENT_URL: str = "https://reactome.org/ContentService"
    ANALYSIS_URL: str = "https://reactome.org/AnalysisService"
    DATA_URL: str = "https://reactome.org/download"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 1800

    @property
    def data_types(self) -> List[str]:
        return ["pathway", "reaction", "protein", "complex", "disease_pathway"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search Reactome for pathways, reactions, or proteins.

        Args:
            query: Search string (e.g., 'apoptosis', 'TP53', 'R-HSA-109581').
            filters: Optional filters (species, types, cluster).

        Returns:
            Dictionary with pathways, reactions, and entities.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        species = filters.get("species", "9606")
        types = filters.get("types", "ALL")
        cluster = filters.get("cluster", "true")

        try:
            url = f"{self.CONTENT_URL}/search/query"
            params: Dict[str, Any] = {
                "query": query,
                "species": species,
                "types": types,
                "cluster": cluster,
                "pageSize": filters.get("limit", 20),
                "page": filters.get("page", 1),
            }

            response = await self._rate_limited_request("GET", url, params=params)
            response.raise_for_status()
            data = response.json()

            results = data.get("results", [])
            clusters = data.get("clusters", {})

            parsed = []
            for entry in results[:20]:
                parsed.append({
                    "st_id": entry.get("stId", ""),
                    "db_id": entry.get("dbId", 0),
                    "name": entry.get("name", ""),
                    "type": entry.get("type", ""),
                    "species": entry.get("speciesName", ""),
                    "compartment": entry.get("compartmentName", []),
                    "is_disease": entry.get("isDisease", False),
                    "release_date": entry.get("releaseDate", ""),
                    "release_status": entry.get("releaseStatus", ""),
                })

            result = {
                "results": parsed,
                "total": data.get("resultsFound", len(parsed)),
                "clusters": list(clusters.keys()),
                "query": query,
                "source": "Reactome",
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching Reactome: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "Reactome"}
        except Exception as e:
            logger.error("Unexpected error searching Reactome: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "Reactome"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve Reactome pathway or reaction by stable ID.

        Args:
            identifier: Reactome stable ID (e.g., 'R-HSA-109581').

        Returns:
            Dictionary with pathway/reaction details including participants,
            diagrams, and relationships.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            entry = await self._fetch_entry(identifier)
            participants = await self._fetch_participants(identifier)
            pathways = await self._fetch_pathways_for(identifier)
            hierarchy = await self._fetch_hierarchy(identifier)

            result = {
                "identifier": identifier,
                "source": "Reactome",
                **entry,
                "participants": participants,
                "related_pathways": pathways,
                "hierarchy": hierarchy,
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching Reactome %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "Reactome"}
        except Exception as e:
            logger.error("Unexpected error fetching Reactome %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "Reactome"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "Reactome Adapter",
            "version": "1.0.0",
            "source": "Reactome",
            "source_url": "https://reactome.org",
            "description": (
                "Curated database of biological pathways and reactions "
                "including molecular details of signaling and metabolic pathways"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_endpoints": {
                "content": self.CONTENT_URL,
                "analysis": self.ANALYSIS_URL,
                "download": self.DATA_URL,
            },
            "rate_limit": "2 requests/second",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _fetch_entry(self, identifier: str) -> dict:
        """Fetch entry details from Reactome."""
        url = f"{self.CONTENT_URL}/data/query/{identifier}"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        data = response.json()

        return {
            "stable_id": data.get("stId", ""),
            "display_name": data.get("displayName", ""),
            "schema_class": data.get("schemaClass", ""),
            "species": [
                s.get("displayName", "") for s in data.get("species", [])
            ],
            "summation": [
                s.get("text", "") for s in data.get("summation", [])
            ],
            "inferred_from": [
                i.get("displayName", "") for i in data.get("inferredFrom", [])
            ],
            "disease": [
                d.get("displayName", "") for d in data.get("disease", [])
            ],
            "compartment": [
                c.get("displayName", "") for c in data.get("compartment", [])
            ],
            "cross_references": [
                {
                    "database": ref.get("databaseName", ""),
                    "identifier": ref.get("identifier", ""),
                }
                for ref in data.get("crossReference", [])[:10]
            ],
            "release_status": data.get("releaseStatus", ""),
            "is_in_disease": data.get("isInDisease", False),
            "is_inferred": data.get("isInferred", False),
        }

    async def _fetch_participants(self, identifier: str) -> List[dict]:
        """Fetch participants for a pathway or reaction."""
        url = f"{self.CONTENT_URL}/data/participants/{identifier}"
        response = await self._rate_limited_request("GET", url)
        if response.status_code != 200:
            return []

        data = response.json()
        participants = []
        for ref in data.get("refEntities", [])[:20]:
            participants.append({
                "st_id": ref.get("stId", ""),
                "display_name": ref.get("displayName", ""),
                "schema_class": ref.get("schemaClass", ""),
                "identifier": ref.get("identifier", ""),
                "database": ref.get("databaseName", ""),
            })
        return participants

    async def _fetch_pathways_for(self, identifier: str) -> List[dict]:
        """Fetch pathways containing this entity."""
        url = f"{self.CONTENT_URL}/data/pathways/low/entity/{identifier}"
        response = await self._rate_limited_request("GET", url)
        if response.status_code != 200:
            return []

        data = response.json()
        pathways = []
        for pw in data[:10]:
            pathways.append({
                "st_id": pw.get("stId", ""),
                "display_name": pw.get("displayName", ""),
                "schema_class": pw.get("schemaClass", ""),
                "species": pw.get("speciesName", ""),
                "is_disease": pw.get("isInDisease", False),
            })
        return pathways

    async def _fetch_hierarchy(self, identifier: str) -> List[dict]:
        """Fetch hierarchical pathway structure."""
        url = f"{self.CONTENT_URL}/data/eventHierarchy/{identifier}"
        response = await self._rate_limited_request("GET", url)
        if response.status_code != 200:
            return []

        data = response.json()
        hierarchy = []
        for event in data[:10]:
            hierarchy.append({
                "st_id": event.get("stId", ""),
                "display_name": event.get("displayName", ""),
                "schema_class": event.get("schemaClass", ""),
                "has_diagram": event.get("hasDiagram", False),
                "has_children": len(event.get("children", [])) > 0,
            })
        return hierarchy


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = ReactomeAdapter()
        print("=== ReactomeAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("apoptosis")
        print(f"Search 'apoptosis': {result.get('total', 0)} results\n")

        entry = await adapter.get_by_id("R-HSA-109581")
        print(f"Get R-HSA-109581: {json.dumps(entry, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
