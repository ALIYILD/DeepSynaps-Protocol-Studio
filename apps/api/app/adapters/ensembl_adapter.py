"""
Ensembl Adapter for DeepSynaps Protocol Studio

Provides access to Ensembl (EMBL-EBI) REST API for gene lookup,
transcript sequences, protein data, genomic features, and variant annotations.

API Documentation: https://rest.ensembl.org/documentation/info
Rate Limit: 15 requests per second
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
        self._min_interval: float = 0.067  # 15 req/sec

    @abstractmethod
    async def search(self, query: str, filters: dict = None) -> dict:
        """Search the external database."""
        pass

    @abstractmethod
    async def get_by_id(self, identifier: str) -> dict:
        """Get a specific record by ID."""
        pass

    @abstractmethod
    async def get_metadata(self) -> dict:
        """Get adapter metadata."""
        pass

    @property
    @abstractmethod
    def data_types(self) -> List[str]:
        """Return list of supported data types."""
        pass

    @property
    @abstractmethod
    def supports_fulltext(self) -> bool:
        """Whether full-text search is supported."""
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


class EnsemblAdapter(BaseAdapter):
    """
    Adapter for Ensembl REST API (EMBL-EBI).

    Provides gene, transcript, protein, and variant lookups with
    support for sequences, homologues, and genomic features.
    """

    BASE_URL: str = "https://rest.ensembl.org"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 1800

    @property
    def data_types(self) -> List[str]:
        return ["gene", "transcript", "protein", "genomic_feature", "variant"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search Ensembl for genes, transcripts, or variants.

        Supports gene symbol (e.g., 'BRCA1'), Ensembl ID
        (e.g., 'ENSG00000139618'), or genomic region.

        Args:
            query: Gene symbol, Ensembl ID, or region.
            filters: Optional filters (species, feature type).

        Returns:
            Dictionary with genes, transcripts, and variants.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        species = filters.get("species", "homo_sapiens")
        try:
            if query.upper().startswith("ENS"):
                results = await self._lookup_ensembl_id(query, species)
            elif ":" in query:
                results = await self._search_region(query, species, filters)
            else:
                results = await self._search_symbol(query, species, filters)

            self._set_cache(cache_key, results)
            return results

        except httpx.HTTPError as e:
            logger.error("HTTP error searching Ensembl: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "Ensembl"}
        except Exception as e:
            logger.error("Unexpected error searching Ensembl: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "Ensembl"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve detailed gene/transcript/variant by Ensembl ID.

        Args:
            identifier: Ensembl ID (e.g., 'ENSG00000139618').

        Returns:
            Dictionary with full record including sequences,
            homologues, and cross-references.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            lookup = await self._fetch_lookup(identifier)
            result = {
                "identifier": identifier,
                "source": "Ensembl",
                "record_type": lookup.get("object_type", "unknown"),
                **lookup,
            }

            if result["record_type"] == "Gene":
                result["transcripts"] = await self._fetch_transcripts(identifier)
                result["homologues"] = await self._fetch_homologues(identifier)
            elif result["record_type"] == "Transcript":
                result["sequence"] = await self._fetch_sequence(identifier)
                result["translation"] = await self._fetch_translation(identifier)
            elif result["record_type"] == "Translation":
                result["sequence"] = await self._fetch_sequence(identifier, "protein")

            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching %s from Ensembl: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "Ensembl"}
        except Exception as e:
            logger.error("Unexpected error fetching %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "Ensembl"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        try:
            url = f"{self.BASE_URL}/info/rest"
            response = await self._rate_limited_request("GET", url)
            rest_info = response.json() if response.status_code == 200 else {}
        except Exception:
            rest_info = {}

        return {
            "adapter_name": "Ensembl Adapter",
            "version": "1.0.0",
            "source": "Ensembl (EMBL-EBI)",
            "source_url": "https://www.ensembl.org",
            "description": (
                "Genome browser and database for vertebrate genomes "
                "including genes, transcripts, and proteins"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "rest_api_release": rest_info.get("release", "unknown"),
            "rate_limit": "15 requests/second",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_symbol(self, symbol: str, species: str, filters: dict) -> dict:
        """Search for genes by symbol."""
        limit = filters.get("limit", 10)
        url = f"{self.BASE_URL}/lookup/symbol/{species}/{symbol}"
        params: Dict[str, Any] = {"expand": "1"}
        if filters.get("include_transcripts"):
            params["expand"] = "1"

        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, dict) and "error" not in data:
            gene_list = [data]
        elif isinstance(data, list):
            gene_list = data[:limit]
        else:
            gene_list = []

        results = []
        for gene in gene_list:
            results.append({
                "ensembl_id": gene.get("id", ""),
                "symbol": gene.get("display_name", symbol),
                "name": gene.get("description", ""),
                "biotype": gene.get("biotype", ""),
                "species": gene.get("species", species),
                "chromosome": gene.get("seq_region_name", ""),
                "start": gene.get("start", 0),
                "end": gene.get("end", 0),
                "strand": gene.get("strand", 0),
                "assembly": gene.get("assembly_name", ""),
                "transcripts": [
                    {
                        "id": tx.get("id", ""),
                        "biotype": tx.get("biotype", ""),
                        "start": tx.get("start", 0),
                        "end": tx.get("end", 0),
                    }
                    for tx in gene.get("Transcript", [])[:5]
                ],
            })

        return {
            "results": results,
            "total": len(results),
            "query": symbol,
            "species": species,
            "source": "Ensembl",
        }

    async def _search_region(self, region: str, species: str, filters: dict) -> dict:
        """Search for features in a genomic region."""
        feature_type = filters.get("feature_type", "gene")
        limit = filters.get("limit", 10)
        url = f"{self.BASE_URL}/overlap/region/{species}/{region}"
        params: Dict[str, Any] = {"feature": feature_type}

        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        results = []
        for feat in data[:limit]:
            results.append({
                "ensembl_id": feat.get("id", ""),
                "feature_type": feat.get("feature_type", feature_type),
                "biotype": feat.get("biotype", ""),
                "chromosome": feat.get("seq_region_name", ""),
                "start": feat.get("start", 0),
                "end": feat.get("end", 0),
                "strand": feat.get("strand", 0),
                "external_name": feat.get("external_name", ""),
                "description": feat.get("description", ""),
            })

        return {
            "results": results,
            "total": len(data),
            "query": region,
            "species": species,
            "source": "Ensembl",
        }

    async def _lookup_ensembl_id(self, ensembl_id: str, species: str) -> dict:
        """Lookup by Ensembl ID."""
        return await self.get_by_id(ensembl_id)

    async def _fetch_lookup(self, identifier: str) -> dict:
        """Fetch lookup info for an Ensembl ID."""
        url = f"{self.BASE_URL}/lookup/id/{identifier}"
        params: Dict[str, Any] = {"expand": "1"}
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        return response.json()

    async def _fetch_transcripts(self, gene_id: str) -> List[dict]:
        """Fetch transcripts for a gene."""
        url = f"{self.BASE_URL}/overlap/id/{gene_id}"
        params: Dict[str, Any] = {"feature": "transcript"}
        response = await self._rate_limited_request("GET", url, params=params)
        if response.status_code == 200:
            data = response.json()
            return [
                {
                    "id": tx.get("id", ""),
                    "biotype": tx.get("biotype", ""),
                    "start": tx.get("start", 0),
                    "end": tx.get("end", 0),
                    "strand": tx.get("strand", 0),
                    "source": tx.get("source", ""),
                }
                for tx in data[:20]
            ]
        return []

    async def _fetch_homologues(self, gene_id: str, target_species: str = None) -> List[dict]:
        """Fetch homologues for a gene."""
        url = f"{self.BASE_URL}/homology/id/{gene_id}"
        params: Dict[str, Any] = {"type": "ortholog", "format": "json"}
        if target_species:
            params["target_species"] = target_species
        response = await self._rate_limited_request("GET", url, params=params)
        if response.status_code == 200:
            data = response.json()
            homologies = data.get("data", [])
            result = []
            for h in homologies[:10]:
                for homology in h.get("homologies", []):
                    result.append({
                        "target_species": homology.get("target", {}).get("species", ""),
                        "target_id": homology.get("target", {}).get("id", ""),
                        "target_symbol": homology.get("target", {}).get("seq_region_name", ""),
                        "method": homology.get("method_link_type", ""),
                        "dn": homology.get("dn", ""),
                        "ds": homology.get("ds", ""),
                        "type": homology.get("type", ""),
                    })
            return result
        return []

    async def _fetch_sequence(self, identifier: str, seq_type: str = "cdna") -> dict:
        """Fetch sequence for a transcript or protein."""
        url = f"{self.BASE_URL}/sequence/id/{identifier}"
        params: Dict[str, Any] = {"type": seq_type}
        response = await self._rate_limited_request("GET", url, params=params)
        if response.status_code == 200:
            data = response.json()
            return {
                "id": data.get("id", ""),
                "seq_type": data.get("molecule", seq_type),
                "sequence_length": len(data.get("seq", "")),
                "sequence_preview": data.get("seq", "")[:100] + "..." if len(data.get("seq", "")) > 100 else data.get("seq", ""),
            }
        return {"error": f"Failed to fetch sequence for {identifier}"}

    async def _fetch_translation(self, transcript_id: str) -> dict:
        """Fetch translation info for a transcript."""
        url = f"{self.BASE_URL}/lookup/id/{transcript_id}"
        params: Dict[str, Any] = {"expand": "1"}
        response = await self._rate_limited_request("GET", url, params=params)
        if response.status_code == 200:
            data = response.json()
            translation = data.get("Translation", {})
            if translation:
                return {
                    "protein_id": translation.get("id", ""),
                    "start": translation.get("start", 0),
                    "end": translation.get("end", 0),
                    "length_aa": (translation.get("end", 0) - translation.get("start", 0) + 1) // 3,
                }
        return {}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = EnsemblAdapter()
        print("=== EnsemblAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("BRCA1")
        print(f"Search BRCA1: {result.get('total', 0)} results\n")

        result2 = await adapter.get_by_id("ENSG00000139618")
        print(f"Get ENSG00000139618: {json.dumps(result2, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
