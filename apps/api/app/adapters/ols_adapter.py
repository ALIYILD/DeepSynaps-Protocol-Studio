"""
Ontology Lookup Service (OLS) Adapter for DeepSynaps Protocol Studio

Provides access to EBI Ontology Lookup Service for searching
across multiple biomedical ontologies.

API Documentation: https://www.ebi.ac.uk/ols4/swagger-ui/index.html
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
        self._min_interval: float = 0.34

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


class OlsAdapter(BaseAdapter):
    """
    Adapter for EBI Ontology Lookup Service (OLS4).

    Provides access to search across multiple biomedical ontologies
    including GO, HPO, MONDO, CHEBI, and many more.
    """

    BASE_URL: str = "https://www.ebi.ac.uk/ols4/api"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 1800

    @property
    def data_types(self) -> List[str]:
        return ["ontology", "ontology_term", "concept", "semantic_type"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search OLS across ontologies.

        Args:
            query: Search term (e.g., 'inflammatory response').
            filters: Optional filters (ontology, type, rows).

        Returns:
            Dictionary with ontology terms and metadata.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        ontology = filters.get("ontology", "")
        rows = filters.get("limit", 20)

        try:
            url = f"{self.BASE_URL}/search"
            params: Dict[str, Any] = {
                "q": query,
                "rows": rows,
                "start": filters.get("offset", 0),
                "exact": "false",
            }
            if ontology:
                params["ontology"] = ontology

            response = await self._rate_limited_request("GET", url, params=params)
            response.raise_for_status()
            data = response.json()

            docs = data.get("response", {}).get("docs", [])
            results = []
            for doc in docs[:rows]:
                results.append({
                    "iri": doc.get("iri", ""),
                    "obo_id": doc.get("obo_id", ""),
                    "label": doc.get("label", ""),
                    "ontology_prefix": doc.get("ontology_prefix", ""),
                    "ontology_name": doc.get("ontology_name", ""),
                    "short_form": doc.get("short_form", ""),
                    "type": doc.get("type", ""),
                    "description": doc.get("description", [""])[0] if doc.get("description") else "",
                    "is_defining_ontology": doc.get("is_defining_ontology", False),
                    "synonyms": doc.get("synonym", []),
                })

            result = {
                "results": results,
                "total": data.get("response", {}).get("numFound", len(results)),
                "query": query,
                "source": "OLS",
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching OLS: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "OLS"}
        except Exception as e:
            logger.error("Unexpected error searching OLS: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "OLS"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve ontology term by IRI or OBO ID.

        Args:
            identifier: OBO ID (e.g., 'GO:0006915') or full IRI.

        Returns:
            Dictionary with term details, annotations, and hierarchy.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            # Extract ontology prefix from ID
            if ":" in identifier and not identifier.startswith("http"):
                parts = identifier.split(":", 1)
                ontology = parts[0].lower()
                term_id = identifier.replace(":", "_")
            elif identifier.startswith("http"):
                ontology = ""
                term_id = identifier
            else:
                ontology = ""
                term_id = identifier

            term = await self._fetch_term(ontology, term_id)
            if not term.get("found") and ontology:
                # Try with different ontology
                term = await self._fetch_term("", identifier)

            self._set_cache(cache_key, term)
            return term

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching OLS %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "OLS"}
        except Exception as e:
            logger.error("Unexpected error fetching OLS %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "OLS"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        ontologies = []
        try:
            url = f"{self.BASE_URL}/ontologies"
            response = await self._rate_limited_request("GET", url)
            if response.status_code == 200:
                data = response.json()
                onto_list = data.get("_embedded", {}).get("ontologies", [])
                ontologies = [
                    {
                        "id": o.get("ontologyId", ""),
                        "title": o.get("config", {}).get("title", ""),
                        "description": o.get("config", {}).get("description", "")[:100],
                        "version": o.get("config", {}).get("version", ""),
                        "number_of_terms": o.get("numberOfTerms", 0),
                    }
                    for o in onto_list[:20]
                ]
        except Exception as e:
            logger.warning("Could not fetch ontology list: %s", e)

        return {
            "adapter_name": "OLS Adapter",
            "version": "1.0.0",
            "source": "EBI Ontology Lookup Service (OLS4)",
            "source_url": "https://www.ebi.ac.uk/ols4",
            "description": (
                "Unified access to multiple biomedical ontologies "
                "including GO, HPO, MONDO, CHEBI, and more"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "available_ontologies": ontologies,
            "ontology_count": len(ontologies),
            "rate_limit": "3 requests/second",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _fetch_term(self, ontology: str, term_id: str) -> dict:
        """Fetch term details from OLS."""
        if ontology:
            url = f"{self.BASE_URL}/ontologies/{ontology}/terms"
            if term_id.startswith("http"):
                from urllib.parse import quote
                url = f"{url}/{quote(term_id, safe='')}?lang=en"
            else:
                iri = f"http://purl.obolibrary.org/obo/{term_id}"
                from urllib.parse import quote
                url = f"{url}/{quote(iri, safe='')}?lang=en"
        else:
            if term_id.startswith("http"):
                from urllib.parse import quote
                url = f"{self.BASE_URL}/terms/{quote(term_id, safe='')}"
            else:
                url = f"{self.BASE_URL}/terms/{term_id}"

        response = await self._rate_limited_request("GET", url)

        if response.status_code != 200:
            return {"identifier": term_id, "found": False, "source": "OLS"}

        data = response.json()

        # Handle both single term and _embedded responses
        if "_embedded" in data:
            terms = data.get("_embedded", {}).get("terms", [])
            term_data = terms[0] if terms else {}
        else:
            term_data = data

        return {
            "identifier": term_id,
            "source": "OLS",
            "found": True,
            "iri": term_data.get("iri", ""),
            "obo_id": term_data.get("obo_id", ""),
            "label": term_data.get("label", ""),
            "description": term_data.get("description", [""])[0] if term_data.get("description") else "",
            "ontology_name": term_data.get("ontology_name", ontology),
            "ontology_prefix": term_data.get("ontology_prefix", ""),
            "short_form": term_data.get("short_form", ""),
            "obo_definition_citation": term_data.get("obo_definition_citation", []),
            "obo_xref": term_data.get("obo_xref", []),
            "obo_synonym": term_data.get("obo_synonym", []),
            "is_root": term_data.get("is_root", False),
            "is_obsolete": term_data.get("is_obsolete", False),
            "has_children": term_data.get("has_children", False),
            "annotation": term_data.get("annotation", {}),
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = OlsAdapter()
        print("=== OlsAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)[:500]}...\n")

        result = await adapter.search("inflammatory response")
        print(f"Search 'inflammatory response': {result.get('total', 0)} results\n")

        term = await adapter.get_by_id("GO:0006915")
        print(f"Get GO:0006915: {json.dumps(term, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
