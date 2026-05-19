"""
GWAS Catalog Adapter for DeepSynaps Protocol Studio

Provides access to the EBI GWAS Catalog for genome-wide association studies,
including trait associations, study metadata, and SNP-trait relationships.

API Documentation: https://www.ebi.ac.uk/gwas/rest/api/
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

    def _clear_expired_cache(self) -> None:
        now = time.monotonic()
        expired = [k for k, (ts, _) in self._cache.items() if now - ts >= self._cache_ttl]
        for k in expired:
            del self._cache[k]


class GwasCatalogAdapter(BaseAdapter):
    """
    Adapter for EBI GWAS Catalog.

    Provides access to published genome-wide association studies including
    SNP-trait associations, study metadata, and ancestry information.
    """

    BASE_URL: str = "https://www.ebi.ac.uk/gwas/rest/api"

    def __init__(self) -> None:
        super().__init__()
        self._cache_ttl = 3600

    @property
    def data_types(self) -> List[str]:
        return ["genetic_association", "gwas", "trait", "snp_trait_association"]

    @property
    def supports_fulltext(self) -> bool:
        return True

    async def search(self, query: str, filters: dict = None) -> dict:
        """
        Search GWAS Catalog for associations, studies, or traits.

        Supports searching by trait name (e.g., 'Alzheimer disease'),
        SNP rsID (e.g., 'rs429358'), or study author/PMID.

        Args:
            query: Search string (trait, rsID, or study identifier).
            filters: Optional filters (e.g., pvalue, odds_ratio, limit).

        Returns:
            Dictionary with associations, studies, traits, and pagination info.
        """
        filters = filters or {}
        cache_key = f"search:{query}:{json.dumps(filters, sort_keys=True)}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            associations = await self._search_associations(query, filters)
            studies = await self._search_studies(query, filters)
            traits = await self._search_traits(query, filters)

            total_results = (
                len(associations.get("results", []))
                + len(studies.get("results", []))
                + len(traits.get("results", []))
            )

            result = {
                "associations": associations,
                "studies": studies,
                "traits": traits,
                "total": total_results,
                "query": query,
                "source": "GWAS Catalog",
            }
            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error searching GWAS Catalog: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "GWAS Catalog"}
        except Exception as e:
            logger.error("Unexpected error searching GWAS Catalog: %s", e)
            return {"results": [], "total": 0, "error": str(e), "source": "GWAS Catalog"}

    async def get_by_id(self, identifier: str) -> dict:
        """
        Retrieve GWAS study or association by accession ID or rsID.

        Args:
            identifier: GWAS study accession (e.g., 'GCST000001') or rsID.

        Returns:
            Dictionary with study/association details including traits,
            SNPs, p-values, and ancestry information.
        """
        cache_key = f"id:{identifier}"
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached

        try:
            if identifier.upper().startswith("GCST"):
                result = await self._get_study(identifier.upper())
            elif identifier.lower().startswith("rs"):
                result = await self._get_association_by_snp(identifier.lower())
            else:
                result = await self._get_association_by_accession(identifier)

            self._set_cache(cache_key, result)
            return result

        except httpx.HTTPError as e:
            logger.error("HTTP error fetching %s from GWAS Catalog: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "GWAS Catalog"}
        except Exception as e:
            logger.error("Unexpected error fetching %s: %s", identifier, e)
            return {"identifier": identifier, "error": str(e), "source": "GWAS Catalog"}

    async def get_metadata(self) -> dict:
        """Return adapter metadata and database information."""
        return {
            "adapter_name": "GWAS Catalog Adapter",
            "version": "1.0.0",
            "source": "EBI GWAS Catalog",
            "source_url": "https://www.ebi.ac.uk/gwas",
            "description": (
                "Database of published genome-wide association studies "
                "with SNP-trait associations"
            ),
            "data_types": self.data_types,
            "supports_fulltext": self.supports_fulltext,
            "api_base_url": self.BASE_URL,
            "rate_limit": "2 req/sec recommended",
            "cache_ttl_seconds": self._cache_ttl,
        }

    async def _search_associations(
        self, query: str, filters: dict
    ) -> dict:
        """Search for SNP-trait associations."""
        limit = filters.get("limit", 10)
        pval_filter = filters.get("pvalue_max", 1e-5)

        params: Dict[str, Any] = {
            "size": limit,
            "page": filters.get("page", 0),
        }
        if query.lower().startswith("rs"):
            params["rsId"] = query
        else:
            params["trait"] = query
        if pval_filter:
            params["pvalueFilter"] = pval_filter

        url = f"{self.BASE_URL}/associations"
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        associations = data.get("_embedded", {}).get("associations", [])
        parsed = []
        for assoc in associations[:limit]:
            parsed.append({
                "association_id": assoc.get("associationId", ""),
                "pvalue": assoc.get("pvalue", ""),
                "pvalue_description": assoc.get("pvalueDescription", ""),
                "risk_allele": assoc.get("riskAllele", ""),
                "risk_frequency": assoc.get("riskFrequency", ""),
                "odds_ratio": assoc.get("orPerCopyNum", ""),
                "beta": assoc.get("betaNum", ""),
                "beta_unit": assoc.get("betaUnit", ""),
                "ci_text": assoc.get("range", ""),
                "description": assoc.get("description", ""),
                "pubmed_id": self._extract_pubmed(assoc),
                "traits": self._extract_traits(assoc),
                "genomic_context": self._extract_genomic_context(assoc),
            })

        return {
            "results": parsed,
            "total": data.get("page", {}).get("totalElements", len(parsed)),
            "query": query,
        }

    async def _search_studies(self, query: str, filters: dict) -> dict:
        """Search for GWAS studies."""
        limit = filters.get("limit", 10)
        params: Dict[str, Any] = {"size": limit, "page": filters.get("page", 0)}
        if query.lower().startswith("rs"):
            return {"results": [], "total": 0, "query": query}
        params["query"] = query

        url = f"{self.BASE_URL}/studies"
        response = await self._rate_limited_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()

        studies = data.get("_embedded", {}).get("studies", [])
        parsed = []
        for study in studies[:limit]:
            parsed.append({
                "accession": study.get("accessionId", ""),
                "title": study.get("title", ""),
                "authors": self._extract_authors(study),
                "pubmed_id": self._extract_pubmed(study),
                "publication_date": study.get("publicationDate", ""),
                "trait": self._extract_traits(study),
                "initial_sample": study.get("initialSampleSize", ""),
                "replication_sample": study.get("replicationSampleSize", ""),
                "ancestry": study.get("ancestry", []),
            })

        return {
            "results": parsed,
            "total": data.get("page", {}).get("totalElements", len(parsed)),
            "query": query,
        }

    async def _search_traits(self, query: str, filters: dict) -> dict:
        """Search for traits/diseases in the catalog."""
        limit = filters.get("limit", 10)
        params: Dict[str, Any] = {"size": limit, "page": filters.get("page", 0)}
        if query.lower().startswith("rs"):
            return {"results": [], "total": 0, "query": query}
        params["query"] = query

        url = f"{self.BASE_URL}/efoTraits"
        response = await self._rate_limited_request("GET", url, params=params)
        if response.status_code == 404:
            return {"results": [], "total": 0, "query": query}
        response.raise_for_status()
        data = response.json()

        traits = data.get("_embedded", {}).get("efoTraits", [])
        parsed = []
        for trait in traits[:limit]:
            parsed.append({
                "trait": trait.get("trait", ""),
                "uri": trait.get("uri", ""),
                "short_form": trait.get("shortForm", ""),
            })

        return {
            "results": parsed,
            "total": data.get("page", {}).get("totalElements", len(parsed)),
            "query": query,
        }

    async def _get_study(self, accession: str) -> dict:
        """Fetch study details by accession ID."""
        url = f"{self.BASE_URL}/studies/{accession}"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        study = response.json()

        associations_url = f"{url}/associations"
        assoc_resp = await self._rate_limited_request("GET", associations_url)
        associations = []
        if assoc_resp.status_code == 200:
            assoc_data = assoc_resp.json()
            associations = assoc_data.get("_embedded", {}).get("associations", [])

        return {
            "identifier": accession,
            "source": "GWAS Catalog",
            "record_type": "study",
            "title": study.get("title", ""),
            "authors": self._extract_authors(study),
            "pubmed_id": self._extract_pubmed(study),
            "publication_date": study.get("publicationDate", ""),
            "trait": self._extract_traits(study),
            "initial_sample": study.get("initialSampleSize", ""),
            "replication_sample": study.get("replicationSampleSize", ""),
            "ancestry": study.get("ancestry", []),
            "association_count": len(associations),
            "associations": [
                {
                    "pvalue": a.get("pvalue", ""),
                    "risk_allele": a.get("riskAllele", ""),
                    "odds_ratio": a.get("orPerCopyNum", ""),
                }
                for a in associations[:10]
            ],
        }

    async def _get_association_by_snp(self, rsid: str) -> dict:
        """Fetch associations by SNP rsID."""
        url = f"{self.BASE_URL}/singleNucleotidePolymorphisms/{rsid}"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        snp_data = response.json()

        return {
            "identifier": rsid,
            "source": "GWAS Catalog",
            "record_type": "snp",
            "chromosome": snp_data.get("chromosomeName", ""),
            "chromosome_position": snp_data.get("chromosomePosition", ""),
            "functional_class": snp_data.get("functionalClass", ""),
            "mapped_genes": snp_data.get("mappedGenes", []),
            "locations": [
                {
                    "chromosome": loc.get("chromosomeName", ""),
                    "position": loc.get("chromosomePosition", ""),
                    "region": loc.get("region", {}).get("name", ""),
                }
                for loc in snp_data.get("locations", [])
            ],
        }

    async def _get_association_by_accession(self, accession: str) -> dict:
        """Fetch association by accession ID."""
        url = f"{self.BASE_URL}/associations/{accession}"
        response = await self._rate_limited_request("GET", url)
        response.raise_for_status()
        assoc = response.json()

        return {
            "identifier": accession,
            "source": "GWAS Catalog",
            "record_type": "association",
            "pvalue": assoc.get("pvalue", ""),
            "risk_allele": assoc.get("riskAllele", ""),
            "risk_frequency": assoc.get("riskFrequency", ""),
            "odds_ratio": assoc.get("orPerCopyNum", ""),
            "beta": assoc.get("betaNum", ""),
            "ci_text": assoc.get("range", ""),
            "description": assoc.get("description", ""),
            "pubmed_id": self._extract_pubmed(assoc),
            "traits": self._extract_traits(assoc),
        }

    @staticmethod
    def _extract_pubmed(item: dict) -> str:
        """Extract PubMed ID from nested _embedded structure."""
        embedded = item.get("_embedded", {})
        publication = embedded.get("publication", {})
        if publication:
            return publication.get("pubmedId", "")
        return ""

    @staticmethod
    def _extract_traits(item: dict) -> List[str]:
        """Extract trait names from nested structure."""
        embedded = item.get("_embedded", {})
        traits = embedded.get("efoTraits", [])
        return [t.get("trait", "") for t in traits]

    @staticmethod
    def _extract_genomic_context(assoc: dict) -> List[dict]:
        """Extract genomic context from association."""
        embedded = assoc.get("_embedded", {})
        snps = embedded.get("singleNucleotidePolymorphisms", [])
        contexts = []
        for snp in snps:
            contexts.append({
                "rsid": snp.get("rsId", ""),
                "chromosome": snp.get("chromosomeName", ""),
                "position": snp.get("chromosomePosition", ""),
            })
        return contexts

    @staticmethod
    def _extract_authors(study: dict) -> List[str]:
        """Extract author names from study."""
        embedded = study.get("_embedded", {})
        publication = embedded.get("publication", {})
        if publication:
            authors = publication.get("authors", [])
            if isinstance(authors, list):
                return authors
            return [a.strip() for a in str(authors).split(",")]
        return []


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def run_tests() -> None:
        adapter = GwasCatalogAdapter()
        print("=== GwasCatalogAdapter Tests ===\n")

        meta = await adapter.get_metadata()
        print(f"Metadata: {json.dumps(meta, indent=2)}\n")

        result = await adapter.search("Alzheimer disease")
        print(f"Search 'Alzheimer disease': {result.get('total', 0)} results\n")

        result2 = await adapter.search("rs429358")
        print(f"Search rs429358: {len(result2.get('associations', {}).get('results', []))} associations\n")

        await adapter.close()
        print("All tests completed.")

    asyncio.run(run_tests())
