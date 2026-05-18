"""
dbSNP Adapter for DeepSynaps Protocol Studio

Provides access to NCBI's dbSNP database for genetic variant information,
including SNP lookup by rsID, gene-based queries, and allele frequency data.

API Documentation: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
Clinical Tables: https://clinicaltables.nlm.nih.gov/api/snps/v3/rif
"""

import asyncio
import json
import logging
import os
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


class BaseAdapter(ABC):
    """Base class for all knowledge adapters."""

    def __init__(self) -> None:
        self._cache: Dict[str, Any] = {}
        self._cache_ttl: int = 3600
        self._client: Optional[httpx.AsyncClient] = None
        self._last_request_time: float = 0.0
        self._min_interval: float = 0.34  # ~3 requests per second max

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
                        "(Bioinformatics Knowledge Layer; "
                        "contact@deepsynaps.org)"
                    ),
                    "Accept": "application/json",
                },
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _rate_limited_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Execute a rate-limited HTTP request with proper delays."""
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        client = await self._get_client()
        response = await client.request(method, url, **kwargs)
        self._last_request_time = time.monotonic()
        return response

    def _get_from_cache(self, key: str) -> Optional[Any]:
        """Retrieve cached response if TTL has not expired."""
        if key in self._cache:
            timestamp, data = self._cache[key]
            if time.monotonic() - timestamp < self._cache_ttl:
                logger.debug("Cache hit for key: %s", key)
                return data
            del self._cache[key]
        return None

    def _set_cache(self, key: str, data: Any) -> None:
        """Store response in cache with current timestamp."""
        self._cache[key] = (time.monotonic(), data)
        logger.debug("Cached response for key: %s", key)

    def _clear_expired_cache(self) -> None:
        """Remove expired cache entries."""
        now = time.monotonic()
        expired = [k for k, (ts, _) in self._cache.items() if now - ts >= self._cache_ttl]
        for k in expired:
            del self._cache[k]


class DbsnpAdapter(BaseAdapter):
    """
    Adapter for NCBI dbSNP database.

    Provides access to genetic variant data including SNPs, allele
    frequencies, and genomic annotations via NCBI E-utilities and
    the NIH Clinical Tables API.
    """

    EUTILS_BASE: str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    CLINICAL_TABLES_BASE: str = "https://clinicaltables.nlm.nih.gov/api/snps/v3"

    def __init__(self) -> None:
        super().__init__()
        self._api_key: Optional[str] = os.environ.get("NCBI_API_KEY", None)
        if self._api_key:
            self._min_interval = 0.1  # 10 requests/sec with API key
        else:
            self._min_interval = 0.34  # 3 requests/sec without key
        self._cache_ttl = 1800  # 30 minutes

    @property
    def data_types(self) -> List[str]:
        return ["genetic_variant", "snp", "genomic_position", "allele_frequency"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search dbSNP for genetic variants matching the query.

        Supports searching by rsID (e.g., 'rs1801133'), gene symbol
        (e.g., 'MTHFR'), or genomic region (e.g., '1:11856378').

        Args:
            query: Search string (rsID, gene symbol, or region).
            filters: Optional filters (e.g., species, consequence).

        Returns:
            Dictionary with results, total count, and metadata.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            if query.lower().startswith("rs"):
                results = await self._search_by_rsid(query, filters)
            elif ":" in query and query.split(":")[0].isdigit():
                results = await self._search_by_region(query, filters)
            else:
                results = await self._search_by_gene(query, filters)

            self._set_cache(cache_key, results)
            return results

        except httpx.HTTPError as e:
            logger.error("HTTP error searching dbSNP: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "dbSNP"}
        except Exception as e:
            logger.error("Unexpected error searching dbSNP: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "dbSNP"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve detailed variant information by rsID.

        Args:
            identifier: dbSNP rsID (e.g., 'rs1801133').

        Returns:
            Dictionary with variant details including alleles,
            position, clinical significance, and frequency data.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        if not identifier.lower().startswith("rs"):
            identifier = f"rs{identifier}"

        try:
            eutil_result = await self._fetch_eutils_summary(identifier)
            clinical_result = await self._fetch_clinical_data(identifier)

            result = {
                "identifier": identifier,
                "source": "dbSNP",
                "eutils_data": eutil_result,
                "clinical_annotations": clinical_result,
                "queried_at": datetime.utcnow().isoformat() + "Z",
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "dbSNP"}
        except Exception as e:
            logger.error("Unexpected error fetching %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "dbSNP"}

    async def get_metadata(self) -> dict:
        """
        Return adapter metadata and database information.

        Returns:
            Dictionary with adapter name, version, supported data types,
            and API endpoint information.
        """
        return {
            "adapter_name": "dbSNP Adapter",
            "version": "1.0.0",
            "source": "NCBI dbSNP",
            "source_url": "https://www.ncbi.nlm.nih.gov/snp",
            "description": (
                "Database of short genetic variants including SNPs, "
                "indels, and microsatellite markers"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_endpoints": {
                "eutils": self.EUTILS_BASE,
                "clinical_tables": self.CLINICAL_TABLES_BASE,
            },
            "rate_limit": "3 req/sec (no key) / 10 req/sec (with key)",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_by_rsid(self, rsid: str, filters: dict) -> dict:
        """Search dbSNP by rsID using E-utilities esearch."""
        params: Dict[str, Any] = {
            "db": "snp",
            "term": rsid,
            "retmode": "json",
            "retmax": filters.get("limit", 20),
            "retstart": filters.get("offset", 0),
        }
        if self._api_key:
            params["api_key"] = self._api_key

        url = f"{self.EUTILS_BASE}/esearch.fcgi"
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        id_list = data.get("esearchresult", {}).get("idlist", [])
        total = int(data.get("esearchresult", {}).get("count", 0))

        summaries = []
        if id_list:
            summaries = await self._fetch_summaries_batch(id_list)

        return {
            "results": summaries,
            "total": total,
            "query": rsid,
            "search_type": "rsid",
            "source": "dbSNP",
        }

    async def _search_by_region(self, region: str, filters: dict) -> dict:
        """Search dbSNP by genomic region (chromosome:start-end)."""
        params: Dict[str, Any] = {
            "db": "snp",
            "term": f"{region}[Chr]",
            "retmode": "json",
            "retmax": filters.get("limit", 20),
            "retstart": filters.get("offset", 0),
        }
        if self._api_key:
            params["api_key"] = self._api_key

        url = f"{self.EUTILS_BASE}/esearch.fcgi"
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        id_list = data.get("esearchresult", {}).get("idlist", [])
        total = int(data.get("esearchresult", {}).get("count", 0))

        summaries = []
        if id_list:
            summaries = await self._fetch_summaries_batch(id_list)

        return {
            "results": summaries,
            "total": total,
            "query": region,
            "search_type": "region",
            "source": "dbSNP",
        }

    async def _search_by_gene(self, gene: str, filters: dict) -> dict:
        """Search dbSNP by gene symbol using clinical tables API."""
        limit = filters.get("limit", 20)
        params: Dict[str, Any] = {
            "terms": gene,
            "maxList": limit,
            "offset": filters.get("offset", 0),
        }

        url = f"{self.CLINICAL_TABLES_BASE}/search"
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        results = []
        for item in data if isinstance(data, list) else []:
            if isinstance(item, dict):
                results.append({
                    "rsid": item.get("rsid", ""),
                    "gene": item.get("gene", ""),
                    "chromosome": item.get("chr", ""),
                    "position": item.get("pos", ""),
                    "alleles": item.get("alleles", ""),
                    "description": item.get("description", ""),
                })

        return {
            "results": results,
            "total": len(results),
            "query": gene,
            "search_type": "gene",
            "source": "dbSNP",
        }

    async def _fetch_eutils_summary(self, rsid: str) -> dict:
        """Fetch SNP summary via E-utilities efetch."""
        snp_id = rsid.lower().replace("rs", "")
        params: Dict[str, Any] = {
            "db": "snp",
            "id": snp_id,
            "rettype": "json",
        }
        if self._api_key:
            params["api_key"] = self._api_key

        url = f"{self.EUTILS_BASE}/efetch.fcgi"
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()

        try:
            return response.json()
        except json.JSONDecodeError:
            return {"raw_text": response.text[:2000]}

    async def _fetch_clinical_data(self, rsid: str) -> dict:
        """Fetch clinical annotations via Clinical Tables API."""
        url = f"{self.CLINICAL_TABLES_BASE}/rif"
        params = {"q": rsid, "limit": 10}
        response = await self._rate_limited_request("GET", url, params=params)

        if response.status_code == 200:
            try:
                return response.json()
            except json.JSONDecodeError:
                return {"raw": response.text[:1000]}
        return {"error": f"Status {response.status_code}", "available": False}

    async def _fetch_summaries_batch(self, id_list: List[str]) -> List[dict]:
        """Fetch summaries for a list of SNP IDs using esummary."""
        ids = ",".join(id_list[:50])  # Batch max 50
        params: Dict[str, Any] = {
            "db": "snp",
            "id": ids,
            "retmode": "json",
        }
        if self._api_key:
            params["api_key"] = self._api_key

        url = f"{self.EUTILS_BASE}/esummary.fcgi"
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()

        try:
            data = response.json()
            result = data.get("result", {})
            summaries = []
            uid_list = result.get("uids", [])
            for uid in uid_list:
                doc = result.get(str(uid), {})
                if doc:
                    summaries.append({
                        "uid": uid,
                        "snp_id": doc.get("snp_id", ""),
                        "allele_origin": doc.get("allele_origin", []),
                        "global_maf": doc.get("global_maf", ""),
                        "clinical_significance": doc.get("clinical_significance", []),
                        "genes": doc.get("genes", []),
                        "docsum": doc.get("docsum", ""),
                    })
            return summaries
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("Error parsing esummary response: %s", e)
            return [{"uid": uid, "error": "Parse error"} for uid in id_list]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = DbsnpAdapter()
        print("=== DBsnpAdapter Tests ===\n")

        # Test metadata
        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        # Test search by rsID
        result = await adapter.search("rs1801133")
        print(f"Search rs1801133: {len(result['results'])} results\n")

        # Test get_by_id
        variant = await adapter.get_by_id("rs1801133")
        print(f"Get rs1801133: {json.dumps(variant, indent=2)[:500]}...\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
