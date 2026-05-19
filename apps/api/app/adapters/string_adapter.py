"""
STRING Adapter for DeepSynaps Protocol Studio

Provides access to STRING database for protein-protein interactions,
functional associations, and network enrichment analysis.

API Documentation: https://string-db.org/cgi/help.pl
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


class StringAdapter(BaseAdapter):
    """
    Adapter for STRING (Search Tool for the Retrieval of Interacting Genes/Proteins).

    Provides access to protein-protein interaction networks,
    functional associations, and enrichment analysis.
    """

    BASE_URL: str = "https://string-db.org/api"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 1800

    @property
    def data_types(self) -> List[str]:
        return ["protein_interaction", "protein", "network", "functional_association"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search STRING for protein interactions by gene/protein name.

        Args:
            query: Gene or protein name (e.g., 'TP53').
            filters: Optional filters (species_id, network_flavor, limit).

        Returns:
            Dictionary with interaction partners and scores.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        species_id = filters.get("species_id", 9606)
        network_flavor = filters.get("network_flavor", "confidence")
        required_score = filters.get("required_score", 400)
        limit = filters.get("limit", 50)

        try:
            # Get network neighbors
            url = f"{self.BASE_URL}/json/network"
            params: Dict[str, Any] = {
                "identifiers": query,
                "species": species_id,
                "network_flavor": network_flavor,
                "required_score": required_score,
                "caller_identity": "deepsynaps_protocol_studio",
                "limit": limit,
            }

            response = await self._rate_limited_request("GET", url, params=params)
            response.raise_for_status()
            data = response.json()

            nodes = []
            edges = []
            node_ids = set()

            for item in data[:100]:
                n1 = item.get("node1", "")
                n2 = item.get("node2", "")
                node_ids.add(n1)
                node_ids.add(n2)
                edges.append({
                    "source": n1,
                    "target": n2,
                    "score": item.get("score", 0),
                    "nscore": item.get("nscore", 0),
                    "fscore": item.get("fscore", 0),
                    "pscore": item.get("pscore", 0),
                    "ascore": item.get("ascore", 0),
                    "escore": item.get("escore", 0),
                    "dscore": item.get("dscore", 0),
                    "tscore": item.get("tscore", 0),
                })

            # Get node details
            if node_ids:
                node_url = f"{self.BASE_URL}/json/resolve"
                node_params: Dict[str, Any] = {
                    "identifiers": "\r".join(list(node_ids)[:100]),
                    "species": species_id,
                }
                node_response = await self._rate_limited_request("GET", node_url, params=node_params)
                if node_response.status_code == 200:
                    node_data = node_response.json()
                    for node in node_data:
                        nodes.append({
                            "string_id": node.get("stringId", ""),
                            "preferred_name": node.get("preferredName", ""),
                            "annotation": node.get("annotation", ""),
                            "protein_size": node.get("proteinSize", 0),
                        })

            # Get enrichment
            enrichment = await self._get_enrichment(query, species_id)

            result = {
                "nodes": nodes,
                "edges": edges,
                "node_count": len(nodes),
                "edge_count": len(edges),
                "enrichment": enrichment,
                "query": query,
                "species_id": species_id,
                "source": "STRING",
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching STRING: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "STRING"}
        except Exception as e:
            logger.error("Unexpected error searching STRING: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "STRING"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve protein details by STRING ID.

        Args:
            identifier: STRING protein ID (e.g., '9606.ENSP00000269305').

        Returns:
            Dictionary with protein details and interactions.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            url = f"{self.BASE_URL}/json/resolve"
            params: Dict[str, Any] = {
                "identifiers": identifier,
                "species": 9606,
            }
            response = await self._rate_limited_request("GET", url, params=params)
            response.raise_for_status()
            data = response.json()

            protein = data[0] if data else {}
            result = {
                "identifier": identifier,
                "source": "STRING",
                "string_id": protein.get("stringId", ""),
                "preferred_name": protein.get("preferredName", ""),
                "annotation": protein.get("annotation", ""),
                "protein_size": protein.get("proteinSize", 0),
                "query_items": protein.get("queryItem", []),
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching STRING %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "STRING"}
        except Exception as e:
            logger.error("Unexpected error fetching STRING %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "STRING"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "STRING Adapter",
            "version": "1.0.0",
            "source": "STRING",
            "source_url": "https://string-db.org",
            "description": (
                "Database of known and predicted protein-protein interactions "
                "including functional associations"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "rate_limit": "No rate limit documented",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _get_enrichment(self, identifiers: str, species_id: int = 9606) -> List[dict]:
        """Get functional enrichment for a set of proteins."""
        url = f"{self.BASE_URL}/json/enrichment"
        params: Dict[str, Any] = {
            "identifiers": identifiers,
            "species": species_id,
            "caller_identity": "deepsynaps_protocol_studio",
        }
        response = await self._rate_limited_request("GET", url, params=params)
        if response.status_code == 200:
            data = response.json()
            enrichment = []
            for item in data[:20]:
                enrichment.append({
                    "category": item.get("category", ""),
                    "term": item.get("term", ""),
                    "description": item.get("description", ""),
                    "fdr": item.get("fdr", 0),
                    "pvalue": item.get("p_value", 0),
                    "number_of_genes": item.get("number_of_genes", 0),
                    "input_genes": item.get("inputGenes", []),
                })
            return enrichment
        return []


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = StringAdapter()
        print("=== StringAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("TP53")
        print(f"Search 'TP53': {result.get('node_count', 0)} nodes, {result.get('edge_count', 0)} edges\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
