"""
Gene Ontology Adapter for DeepSynaps Protocol Studio

Provides access to Gene Ontology (GO) for biological process,
molecular function, and cellular component annotations.

API Documentation: http://api.geneontology.org/api/
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
                    "User-Agent": (
                        "DeepSynaps-ProtocolStudio/1.0 "
                        "(Bioinformatics Knowledge Layer)"
                    ),
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


class GoAdapter(BaseAdapter):
    """
    Adapter for Gene Ontology (GO) API.

    Provides access to GO terms, gene annotations, and ontology
    structure for biological processes, molecular functions,
    and cellular components.
    """

    BASE_URL: str = "https://api.geneontology.org/api"
    BIOONTOLOGY_URL: str = "http://data.bioontology.org/ontologies/GO"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 3600

    @property
    def data_types(self) -> List[str]:
        return ["gene_ontology", "go_term", "gene_function", "biological_process"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search Gene Ontology for terms matching the query.

        Args:
            query: Search string (e.g., 'apoptosis', 'kinase activity').
            filters: Optional filters (aspect: BP/MF/CC, limit).

        Returns:
            Dictionary with GO terms, definitions, and relationships.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            results = await self._search_go_terms(query, filters)
            self._set_cache(cache_key, results)
            return results

        except httpx.HTTPError as e:
            logger.error("HTTP error searching GO: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "Gene Ontology"}
        except Exception as e:
            logger.error("Unexpected error searching GO: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "Gene Ontology"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve GO term details by GO ID.

        Args:
            identifier: GO ID (e.g., 'GO:0006915').

        Returns:
            Dictionary with term details, definition, synonyms,
            parents, children, and annotated genes.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        if not identifier.upper().startswith("GO:"):
            identifier = f"GO:{identifier}"
        identifier = identifier.upper()

        try:
            term = await self._fetch_term(identifier)
            parents = await self._fetch_ancestors(identifier)
            children = await self._fetch_descendants(identifier)
            genes = await self._fetch_annotated_genes(identifier)

            result = {
                "identifier": identifier,
                "source": "Gene Ontology",
                "label": term.get("label", ""),
                "definition": term.get("definition", ""),
                "comment": term.get("comment", ""),
                "subsets": term.get("subsets", []),
                "synonyms": term.get("synonyms", []),
                "taxon_constraints": term.get("taxonConstraints", []),
                "xrefs": term.get("xrefs", []),
                "ontology": {
                    "parents": parents[:10],
                    "children": children[:10],
                    "parent_count": len(parents),
                    "child_count": len(children),
                },
                "annotated_genes": genes[:20],
                "gene_count": len(genes),
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching GO %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "Gene Ontology"}
        except Exception as e:
            logger.error("Unexpected error fetching GO %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "Gene Ontology"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "Gene Ontology Adapter",
            "version": "1.0.0",
            "source": "Gene Ontology Consortium",
            "source_url": "http://geneontology.org",
            "description": (
                "Structured vocabulary for annotation of gene products "
                "covering biological processes, molecular functions, "
                "and cellular components"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "rate_limit": "2 req/sec recommended",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_go_terms(self, query: str, filters: dict) -> dict:
        """Search for GO terms via bioentity search."""
        limit = filters.get("limit", 20)
        aspect = filters.get("aspect", "")

        url = f"{self.BASE_URL}/bioentity/function"
        params: Dict[str, Any] = {
            "q": query,
            "rows": limit,
            "start": filters.get("offset", 0),
        }
        if aspect:
            params["aspect"] = aspect

        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        docs = data.get("docs", [])
        results = []
        for doc in docs[:limit]:
            results.append({
                "go_id": doc.get("id", ""),
                "label": doc.get("annotation_class_label", doc.get("label", "")),
                "definition": doc.get("description", doc.get("definition", "")),
                "aspect": doc.get("aspect", ""),
                "taxon": doc.get("taxon", ""),
                "evidence": doc.get("evidence_type", ""),
            })

        return {
            "results": results,
            "total": data.get("numFound", len(results)),
            "query": query,
            "source": "Gene Ontology",
        }

    async def _fetch_term(self, go_id: str) -> dict:
        """Fetch term details by GO ID."""
        url = f"{self.BASE_URL}/ontology/term/{go_id}"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, dict) else {}

    async def _fetch_ancestors(self, go_id: str) -> List[dict]:
        """Fetch ancestor (parent) terms."""
        url = f"{self.BASE_URL}/ontology/term/{go_id}/graph"
        response = await self._rate_limited_request("GET", url)
        if response.status_code != 200:
            return []
        data = response.json()
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])

        parent_ids = {e["sub"] for e in edges if e.get("obj") == go_id}
        parents = [n for n in nodes if n.get("id") in parent_ids]
        return [
            {"go_id": p.get("id", ""), "label": p.get("lbl", "")}
            for p in parents
        ]

    async def _fetch_descendants(self, go_id: str) -> List[dict]:
        """Fetch descendant (child) terms."""
        url = f"{self.BASE_URL}/ontology/term/{go_id}/graph"
        response = await self._rate_limited_request("GET", url)
        if response.status_code != 200:
            return []
        data = response.json()
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])

        child_ids = {e["obj"] for e in edges if e.get("sub") == go_id}
        children = [n for n in nodes if n.get("id") in child_ids]
        return [
            {"go_id": c.get("id", ""), "label": c.get("lbl", "")}
            for c in children
        ]

    async def _fetch_annotated_genes(self, go_id: str) -> List[dict]:
        """Fetch genes annotated with a GO term."""
        url = f"{self.BASE_URL}/bioentity/function/{go_id}"
        params: Dict[str, Any] = {"rows": 20}
        response = await self._rate_limited_request("GET", url, params=params)
        if response.status_code != 200:
            return []
        data = response.json()
        associations = data.get("associations", [])
        genes = []
        for assoc in associations[:20]:
            subject = assoc.get("subject", {})
            genes.append({
                "gene_id": subject.get("id", ""),
                "gene_label": subject.get("label", ""),
                "taxon": subject.get("taxon", {}).get("id", ""),
                "evidence": assoc.get("evidence", {}).get("type", ""),
                "reference": assoc.get("evidence", {}).get("has_supporting_reference", []),
                "aspect": assoc.get("aspect", ""),
            })
        return genes


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = GoAdapter()
        print("=== GoAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("apoptosis")
        print(f"Search 'apoptosis': {result.get('total', 0)} results\n")

        term = await adapter.get_by_id("GO:0006915")
        print(f"Get GO:0006915: {json.dumps(term, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
