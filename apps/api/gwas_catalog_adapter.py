"""
GWAS Catalog Adapter — EMBL-EBI GWAS Catalog REST API
Provides access to 500,000+ curated SNP-trait associations
from 50,000+ published genome-wide association studies.

API Docs: https://www.ebi.ac.uk/gwas/rest/docs/api
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
import httpx
import logging
import asyncio

logger = logging.getLogger(__name__)


class GwasCatalogAdapter:
    """
    Adapter for the EMBL-EBI GWAS Catalog REST API.
    Curated collection of published genome-wide association studies
    including SNP-trait associations with p-values and effect sizes.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.name = "gwas_catalog"
        self.display_name = "GWAS Catalog"
        self.source_url = "https://www.ebi.ac.uk/gwas/rest/api/"
        self.version = "2024-06"
        self.confidence_tier = "A"
        self.data_types = ["genetic_variant", "association", "trait", "study"]
        self.rate_limit_per_minute = 900  # ~15 req/s
        self.requires_auth = False
        self.auth_type = "none"
        self.api_key = api_key
        self._last_request_time = 0.0
        self._min_interval = 1.0 / 15.0  # 15 req/s throttle
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (GWAS-Catalog-Adapter)",
                "Accept": "application/json",
            },
        )

    async def _throttled_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Execute HTTP request with rate limiting."""
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        response = await self.client.request(method, url, **kwargs)
        self._last_request_time = asyncio.get_event_loop().time()
        return response

    async def validate_connection(self) -> bool:
        """Validate connectivity to GWAS Catalog API."""
        try:
            response = await self._throttled_request(
                "GET", self.source_url + "studies?size=1"
            )
            if response.status_code == 200:
                logger.info(f"{self.name}: connection validated")
                return True
            logger.warning(f"{self.name}: unexpected status {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"{self.name} connection failed: {e}")
            return False

    async def search(
        self, query: str, filters: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search GWAS Catalog by trait, gene, SNP (rsID), or study.

        Parameters:
            query: Search term (trait name, gene symbol, rsID, or study ID)
            filters: Optional dict with keys:
                - 'search_type': 'trait' | 'gene' | 'snp' | 'association' | 'study'
                - 'pvalue_max': float (p-value ceiling, e.g., 5e-8)
                - 'size': int (result page size, max 20)
                - 'page': int (page number)

        Returns:
            List of association/study records as dicts.
        """
        filters = filters or {}
        search_type = filters.get("search_type", "trait")
        size = min(int(filters.get("size", 20)), 20)
        page = int(filters.get("page", 0))

        results: List[Dict] = []

        try:
            if search_type == "trait":
                results = await self._search_by_trait(query, size, page, filters)
            elif search_type == "gene":
                results = await self._search_by_gene(query, size, page, filters)
            elif search_type == "snp":
                results = await self._search_by_snp(query, size, page, filters)
            elif search_type == "association":
                results = await self._search_associations(query, size, page, filters)
            elif search_type == "study":
                results = await self._search_studies(query, size, page, filters)
            else:
                # Default: try trait search then association search
                results = await self._search_by_trait(query, size, page, filters)
                if not results:
                    results = await self._search_associations(query, size, page, filters)

            logger.info(f"{self.name}: search '{query}' returned {len(results)} results")
            return results

        except httpx.HTTPError as e:
            logger.error(f"{self.name} HTTP error during search: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} search error: {e}")
            return []

    async def _search_by_trait(
        self, trait: str, size: int, page: int, filters: Dict
    ) -> List[Dict]:
        """Search associations by EFO trait term."""
        pvalue_max = filters.get("pvalue_max")
        url = f"{self.source_url}associations/search"
        params = {
            "trait": trait,
            "size": size,
            "page": page,
        }
        if pvalue_max:
            params["pvalue"] = f"< {pvalue_max}"

        response = await self._throttled_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()
        return self._parse_embedded(data, "associations")

    async def _search_by_gene(
        self, gene: str, size: int, page: int, filters: Dict
    ) -> List[Dict]:
        """Search associations by reported gene."""
        pvalue_max = filters.get("pvalue_max")
        url = f"{self.source_url}associations/search"
        params = {
            "gene": gene,
            "size": size,
            "page": page,
        }
        if pvalue_max:
            params["pvalue"] = f"< {pvalue_max}"

        response = await self._throttled_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()
        return self._parse_embedded(data, "associations")

    async def _search_by_snp(
        self, snp: str, size: int, page: int, _filters: Dict
    ) -> List[Dict]:
        """Search by SNP rsID."""
        # Normalize rsID
        if not snp.lower().startswith("rs"):
            snp = "rs" + snp
        url = f"{self.source_url}singleNucleotidePolymorphisms/{snp}"
        response = await self._throttled_request("GET", url)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        snp_data = response.json()

        # Get associations for this SNP
        associations_url = f"{self.source_url}singleNucleotidePolymorphisms/{snp}/associations"
        assoc_response = await self._throttled_request(
            "GET", associations_url, params={"size": size, "page": page}
        )
        assoc_response.raise_for_status()
        assoc_data = assoc_response.json()
        associations = self._parse_embedded(assoc_data, "associations")

        # Enrich with SNP data
        for assoc in associations:
            assoc["_snp_metadata"] = snp_data
        return associations

    async def _search_associations(
        self, query: str, size: int, page: int, filters: Dict
    ) -> List[Dict]:
        """Full-text search across associations."""
        pvalue_max = filters.get("pvalue_max")
        url = f"{self.source_url}associations/search"
        params = {"q": query, "size": size, "page": page}
        if pvalue_max:
            params["pvalue"] = f"< {pvalue_max}"

        response = await self._throttled_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()
        return self._parse_embedded(data, "associations")

    async def _search_studies(
        self, query: str, size: int, page: int, _filters: Dict
    ) -> List[Dict]:
        """Search studies by keyword."""
        url = f"{self.source_url}studies/search"
        params = {"q": query, "size": size, "page": page}

        response = await self._throttled_request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()
        return self._parse_embedded(data, "studies")

    @staticmethod
    def _parse_embedded(data: Dict, key: str) -> List[Dict]:
        """Extract _embedded HAL-style resources."""
        embedded = data.get("_embedded", {})
        items = embedded.get(key, [])
        if isinstance(items, dict):
            items = [items]
        return items if isinstance(items, list) else []

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "genetic_variant"
    ) -> Dict:
        """
        Transform GWAS Catalog association data to canonical GeneticVariant format.

        Parameters:
            raw_data: Raw association dict from GWAS Catalog API
            entity_type: Target canonical entity type

        Returns:
            Canonical-format dict.
        """
        # Extract locus / genomic context
        loci = raw_data.get("loci", [])
        chromosome = ""
        position = None
        gene_symbol = ""
        if loci:
            strongest_risk_alleles = loci[0].get("strongestRiskAlleles", [])
            if strongest_risk_alleles:
                gene_symbol = strongest_risk_alleles[0].get("riskAlleleName", "").split("-")[0]
            genomic_contexts = loci[0].get("authorReportedGenes", [])
            if genomic_contexts:
                gene_symbol = genomic_contexts[0].get("geneName", gene_symbol)

        # Extract SNP rsID
        snp_metadata = raw_data.get("_snp_metadata", {})
        variant_id = ""
        if snp_metadata:
            variant_id = snp_metadata.get("rsId", "")
        else:
            # Try to get from risk allele
            if loci:
                alleles = loci[0].get("strongestRiskAlleles", [])
                if alleles:
                    variant_id = alleles[0].get("riskAlleleName", "").split("-")[0]

        # Parse chromosome and position from genomic context if available
        snp_links = raw_data.get("_links", {})
        if "self" in snp_links:
            href = snp_links["self"].get("href", "")
            if "/singleNucleotidePolymorphisms/" in href:
                variant_id = href.split("/")[-1]

        # p-value and effect size
        pvalue = raw_data.get("pvalue", raw_data.get("pValue", None))
        effect_size = raw_data.get("orPerCopyNum", None)
        beta = raw_data.get("betaNum", None)

        # Traits
        traits = raw_data.get("efoTraits", [])
        trait_names = [t.get("trait", t.get("label", "")) for t in traits]

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": str(raw_data.get("accessionId", raw_data.get("id", ""))),
            "gene_symbol": gene_symbol,
            "variant_id": variant_id if variant_id.startswith("rs") else "",
            "chromosome": chromosome,
            "position": position,
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
            # GWAS-specific extensions
            "gwas_catalog": {
                "pvalue": pvalue,
                "effect_size": effect_size,
                "beta": beta,
                "beta_direction": raw_data.get("betaDirection", ""),
                "beta_unit": raw_data.get("betaUnit", ""),
                "traits": trait_names,
                "risk_allele_frequency": raw_data.get("riskFrequency", None),
                "study_accession": raw_data.get("accessionId", ""),
                "association_description": raw_data.get("description", ""),
            },
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for GWAS Catalog result."""
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.92,
            "research_only": False,
            "curation_level": "peer_reviewed_curated",
            "citation_required": True,
            "license": "EMBL-EBI Terms of Use",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Calculate confidence scores for a GWAS Catalog association.
        Weights p-value strength, replication, and curation status.
        """
        pvalue = result.get("pvalue", result.get("pValue", 1.0))
        if pvalue is None:
            pvalue = 1.0

        # p-value quality: smaller = better
        if pvalue <= 5e-8:
            pval_score = 1.0
        elif pvalue <= 1e-5:
            pval_score = 0.85
        elif pvalue <= 0.05:
            pval_score = 0.6
        else:
            pval_score = 0.3

        # Has replication
        replication = 0.8 if result.get("replicationSampleDescription") else 0.5

        # Effect size present
        has_effect = 0.85 if (result.get("orPerCopyNum") or result.get("betaNum")) else 0.6

        # Peer-reviewed curation
        curation = 0.95

        overall = round(
            (pval_score * 0.35 + replication * 0.25 + has_effect * 0.20 + curation * 0.20),
            3,
        )

        return {
            "data_quality": curation,
            "evidence_strength": pval_score,
            "sample_size": 0.75,
            "replication": replication,
            "consistency": 0.8,
            "temporal_relevance": 0.88,
            "population_match": 0.7,
            "overall": overall,
        }

    async def get_study_details(self, study_accession: str) -> Optional[Dict]:
        """Fetch full details for a specific study accession."""
        try:
            url = f"{self.source_url}studies/{study_accession}"
            response = await self._throttled_request("GET", url)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching study {study_accession}: {e}")
            return None

    async def get_traits(self, query: str, size: int = 10) -> List[Dict]:
        """Search EFO traits."""
        try:
            url = f"{self.source_url}efoTraits/search"
            response = await self._throttled_request(
                "GET", url, params={"q": query, "size": size}
            )
            response.raise_for_status()
            data = response.json()
            return self._parse_embedded(data, "efoTraits")
        except Exception as e:
            logger.error(f"Error searching traits: {e}")
            return []

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()
