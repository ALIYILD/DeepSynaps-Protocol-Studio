"""
DGIdb Adapter for DeepSynaps Protocol Studio

Provides access to the Drug-Gene Interaction Database (DGIdb)
for drug-gene interactions, drug targets, and therapeutic annotations.

API Documentation: https://dgidb.org/api/v2/
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


class DgidbAdapter(BaseAdapter):
    """
    Adapter for Drug-Gene Interaction Database (DGIdb).

    Provides access to drug-gene interactions, drug targets,
    and therapeutic annotations from multiple curated sources.
    """

    BASE_URL: str = "https://dgidb.org/api/v2"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 1800

    @property
    def data_types(self) -> List[str]:
        return ["drug_gene_interaction", "drug_target", "gene", "drug"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search DGIdb for drug-gene interactions.

        Supports searching by gene name (e.g., 'EGFR'),
        drug name (e.g., 'imatinib'), or category.

        Args:
            query: Search string (gene or drug name).
            filters: Optional filters (interaction_types, sources).

        Returns:
            Dictionary with interactions, matched terms, and metadata.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            interaction_types = filters.get("interaction_types", [])
            sources = filters.get("source_trust_levels", [])

            url = f"{self.BASE_URL}/interactions"
            params: Dict[str, Any] = {"limit": filters.get("limit", 20)}

            # Build filters
            filter_parts = [query]
            if interaction_types:
                filter_parts.extend(interaction_types)
            if sources:
                filter_parts.extend(sources)

            payload: Dict[str, Any] = {
                "filters": {
                    "drugName": query if not filters.get("search_type") == "gene" else None,
                    "geneName": query if filters.get("search_type") == "gene" else query,
                },
                "limit": filters.get("limit", 20),
                "skip": filters.get("offset", 0),
            }

            response = await self._rate_limited_request("GET", url, params=params)
            response.raise_for_status()
            data = response.json()

            interactions = data.get("interactions", [])
            parsed = []
            for ia in interactions[:20]:
                parsed.append({
                    "interaction_id": ia.get("id", ""),
                    "interaction_claim_id": ia.get("interactionClaimId", ""),
                    "drug_name": ia.get("drugName", ""),
                    "drug_concept_id": ia.get("drugConceptId", ""),
                    "drug_approved": ia.get("drugApproved", False),
                    "gene_name": ia.get("geneName", ""),
                    "gene_concept_id": ia.get("geneConceptId", ""),
                    "interaction_types": ia.get("interactionTypes", []),
                    "interaction_direction": ia.get("interactionDirection", ""),
                    "interaction_score": ia.get("score", None),
                    "sources": [
                        {
                            "source": s.get("source", ""),
                            "source_url": s.get("sourceUrl", ""),
                            "pmids": s.get("pmids", []),
                        }
                        for s in ia.get("sources", [])
                    ],
                })

            result = {
                "interactions": parsed,
                "total": data.get("total", len(parsed)),
                "query": query,
                "source": "DGIdb",
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching DGIdb: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "DGIdb"}
        except Exception as e:
            logger.error("Unexpected error searching DGIdb: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "DGIdb"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve drug or gene details by name or concept ID.

        Args:
            identifier: Gene name, drug name, or concept ID.

        Returns:
            Dictionary with detailed information including interactions,
            categories, and source references.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            if identifier.startswith("chembl:") or identifier.startswith("rxcui:"):
                result = await self._get_drug(identifier)
            else:
                result = await self._get_gene(identifier)

            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching DGIdb %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "DGIdb"}
        except Exception as e:
            logger.error("Unexpected error fetching DGIdb %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "DGIdb"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        sources_info = []
        try:
            url = f"{self.BASE_URL}/sources"
            response = await self._rate_limited_request("GET", url)
            if response.status_code == 200:
                data = response.json()
                sources_info = [
                    {
                        "source": s.get("sourceDbName", ""),
                        "full_name": s.get("fullName", ""),
                        "version": s.get("version", ""),
                    }
                    for s in data.get("sources", [])[:10]
                ]
        except Exception:
            pass

        return {
            "adapter_name": "DGIdb Adapter",
            "version": "1.0.0",
            "source": "Drug-Gene Interaction Database (DGIdb)",
            "source_url": "https://dgidb.org",
            "description": (
                "Aggregated drug-gene interactions and druggable genome "
                "annotations from multiple curated sources"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "sources": sources_info,
            "rate_limit": "2 requests/second",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _get_gene(self, gene_name: str) -> dict:
        """Fetch gene details and interactions."""
        url = f"{self.BASE_URL}/genes/{gene_name}"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        data = response.json()

        gene = data.get("gene", {})
        aliases = data.get("aliases", [])
        interactions = data.get("interactions", [])

        return {
            "identifier": gene_name,
            "source": "DGIdb",
            "record_type": "gene",
            "gene_name": gene.get("name", gene_name),
            "concept_id": gene.get("conceptId", ""),
            "long_name": gene.get("longName", ""),
            "description": gene.get("description", ""),
            "aliases": aliases[:20],
            "categories": [
                {
                    "name": c.get("name", ""),
                    "source": c.get("source", ""),
                }
                for c in gene.get("geneCategories", [])[:10]
            ],
            "interaction_count": len(interactions),
            "interactions": [
                {
                    "drug_name": ia.get("drugName", ""),
                    "drug_approved": ia.get("drugApproved", False),
                    "interaction_types": ia.get("interactionTypes", []),
                    "sources": [s.get("source", "") for s in ia.get("sources", [])],
                    "pmids": [
                        pmid
                        for s in ia.get("sources", [])
                        for pmid in s.get("pmids", [])
                    ],
                }
                for ia in interactions[:20]
            ],
        }

    async def _get_drug(self, concept_id: str) -> dict:
        """Fetch drug details and interactions."""
        url = f"{self.BASE_URL}/drugs/{concept_id}"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        data = response.json()

        drug = data.get("drug", {})
        aliases = data.get("aliases", [])
        interactions = data.get("interactions", [])

        return {
            "identifier": concept_id,
            "source": "DGIdb",
            "record_type": "drug",
            "drug_name": drug.get("name", concept_id),
            "concept_id": drug.get("conceptId", ""),
            "approved": drug.get("approved", False),
            "immunotherapy": drug.get("immunotherapy", False),
            "anti_neoplastic": drug.get("antiNeoplastic", False),
            "aliases": aliases[:20],
            "interaction_count": len(interactions),
            "interactions": [
                {
                    "gene_name": ia.get("geneName", ""),
                    "interaction_types": ia.get("interactionTypes", []),
                    "sources": [s.get("source", "") for s in ia.get("sources", [])],
                }
                for ia in interactions[:20]
            ],
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = DgidbAdapter()
        print("=== DgidbAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)[:500]}...\n")

        result = await adapter.search("imatinib")
        print(f"Search 'imatinib': {result.get('total', 0)} results\n")

        gene = await adapter.get_by_id("EGFR")
        print(f"Get EGFR: {json.dumps(gene, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
