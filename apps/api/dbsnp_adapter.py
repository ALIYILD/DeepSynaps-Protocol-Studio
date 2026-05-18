"""
dbSNP Adapter — NCBI E-utilities for dbSNP
Provides access to 600M+ submitted SNPs and 150M+ RefSNP clusters
via NCBI's E-utilities (esearch, esummary, efetch).

API Docs: https://www.ncbi.nlm.nih.gov/home/develop/api/
E-utilities Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
import httpx
import logging
import asyncio
import json

logger = logging.getLogger(__name__)


class DbsnpAdapter:
    """
    Adapter for NCBI dbSNP via E-utilities.
    The central repository for both common and rare single nucleotide
    variations and short genetic variants.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.name = "dbsnp"
        self.display_name = "dbSNP"
        self.source_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
        self.version = "2024-06"
        self.confidence_tier = "A"
        self.data_types = ["genetic_variant", "snp", "indel", "structural_variant"]
        self.api_key = api_key
        # Rate limit: 3 req/s without key, 10 req/s with key
        self.rate_limit_per_minute = 600 if api_key else 180
        self.requires_auth = False
        self.auth_type = "api_key_optional"
        self._min_interval = 0.1 if api_key else 0.34  # seconds between requests
        self._last_request_time = 0.0
        self.client = httpx.AsyncClient(
            timeout=45.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (dbSNP-Adapter)",
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

    def _build_params(self, extra: Dict) -> Dict:
        """Add API key to parameters if available."""
        params = {"db": "snp", "retmode": "json"}
        if self.api_key:
            params["api_key"] = self.api_key
        params.update(extra)
        return params

    async def validate_connection(self) -> bool:
        """Validate connectivity to NCBI E-utilities."""
        try:
            response = await self._throttled_request(
                "GET",
                self.source_url + "esearch.fcgi",
                params=self._build_params({"term": "rs6025[SNP]", "retmax": 1}),
                timeout=15.0,
            )
            if response.status_code == 200:
                data = response.json()
                if "esearchresult" in data:
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
        Search dbSNP by rsID, gene symbol, or chromosome position.

        Parameters:
            query: rsID (e.g., 'rs6025'), gene symbol (e.g., 'BRCA1'),
                   or chrom:pos (e.g., 'chr1:1234567')
            filters: Optional dict with keys:
                - 'search_type': 'rsid' | 'gene' | 'region' | 'clinical'
                - 'retmax': int (max results, default 20)
                - 'variant_class': str (e.g., 'snv', 'del', 'ins')
                - 'organism': str (default 'human')

        Returns:
            List of variant record dicts.
        """
        filters = filters or {}
        search_type = filters.get("search_type", "auto")
        retmax = min(int(filters.get("retmax", 20)), 500)

        # Auto-detect search type
        if search_type == "auto":
            if query.lower().startswith("rs") and query[2:].isdigit():
                search_type = "rsid"
            elif ":" in query and query.replace(":", "").replace("-", "").isdigit():
                search_type = "region"
            elif query.startswith("NC_") or query.startswith("chr"):
                search_type = "region"
            else:
                search_type = "gene"

        try:
            if search_type == "rsid":
                return await self._search_by_rsid(query, filters)
            elif search_type == "gene":
                return await self._search_by_gene(query, retmax, filters)
            elif search_type == "region":
                return await self._search_by_region(query, retmax, filters)
            elif search_type == "clinical":
                return await self._search_clinical(query, retmax, filters)
            else:
                return await self._search_general(query, retmax, filters)

        except httpx.HTTPError as e:
            logger.error(f"{self.name} HTTP error during search: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} search error: {e}")
            return []

    async def _search_by_rsid(self, rsid: str, _filters: Dict) -> List[Dict]:
        """Fetch a specific RefSNP cluster by rsID."""
        # Normalize rsID
        rsid = rsid.lower().strip()
        if not rsid.startswith("rs"):
            rsid = "rs" + rsid

        # Use esummary for structured data
        params = self._build_params({"id": rsid.replace("rs", "")})
        response = await self._throttled_request(
            "GET", self.source_url + "esummary.fcgi", params=params
        )
        response.raise_for_status()
        data = response.json()

        result = data.get("result", {})
        uid = result.get("uids", [])
        if not uid:
            return []

        snp_data = result.get(uid[0], {})
        if not snp_data or snp_data.get("error"):
            return []

        snp_data["_query_rsid"] = rsid
        return [snp_data]

    async def _search_by_gene(
        self, gene: str, retmax: int, _filters: Dict
    ) -> List[Dict]:
        """Search SNPs by gene symbol."""
        term = f"{gene}[GENE] AND human[ORGN]"
        # Step 1: esearch to get IDs
        search_params = self._build_params({"term": term, "retmax": retmax})
        search_response = await self._throttled_request(
            "GET", self.source_url + "esearch.fcgi", params=search_params
        )
        search_response.raise_for_status()
        search_data = search_response.json()

        id_list = search_data.get("esearchresult", {}).get("idlist", [])
        if not id_list:
            return []

        # Step 2: esummary to get details
        ids = ",".join(id_list[:retmax])
        summary_params = self._build_params({"id": ids})
        summary_response = await self._throttled_request(
            "GET", self.source_url + "esummary.fcgi", params=summary_params
        )
        summary_response.raise_for_status()
        summary_data = summary_response.json()

        results = []
        result_section = summary_data.get("result", {})
        for uid in result_section.get("uids", []):
            item = result_section.get(uid, {})
            if item and not item.get("error"):
                item["_query_gene"] = gene
                results.append(item)

        return results

    async def _search_by_region(
        self, region: str, retmax: int, _filters: Dict
    ) -> List[Dict]:
        """Search SNPs by genomic region (e.g., chr1:1000000-1100000)."""
        # Normalize region format
        region = region.replace("chr", "").replace(",", "")
        if "-" not in region and ":" in region:
            # Single position: chr1:1000000 -> chr1:999500-1000500
            chrom, pos = region.split(":")
            pos_int = int(pos)
            region = f"{chrom}:{max(1, pos_int - 500)}-{pos_int + 500}"

        term = f"{region}[CHR]"
        search_params = self._build_params({"term": term, "retmax": retmax})
        search_response = await self._throttled_request(
            "GET", self.source_url + "esearch.fcgi", params=search_params
        )
        search_response.raise_for_status()
        search_data = search_response.json()

        id_list = search_data.get("esearchresult", {}).get("idlist", [])
        if not id_list:
            return []

        ids = ",".join(id_list[:retmax])
        summary_params = self._build_params({"id": ids})
        summary_response = await self._throttled_request(
            "GET", self.source_url + "esummary.fcgi", params=summary_params
        )
        summary_response.raise_for_status()
        summary_data = summary_response.json()

        results = []
        result_section = summary_data.get("result", {})
        for uid in result_section.get("uids", []):
            item = result_section.get(uid, {})
            if item and not item.get("error"):
                item["_query_region"] = region
                results.append(item)

        return results

    async def _search_clinical(
        self, query: str, retmax: int, _filters: Dict
    ) -> List[Dict]:
        """Search for clinically significant variants."""
        term = f"{query} AND clinical_significant[PROP]"
        search_params = self._build_params({"term": term, "retmax": retmax})
        search_response = await self._throttled_request(
            "GET", self.source_url + "esearch.fcgi", params=search_params
        )
        search_response.raise_for_status()
        search_data = search_response.json()

        id_list = search_data.get("esearchresult", {}).get("idlist", [])
        if not id_list:
            return []

        ids = ",".join(id_list[:retmax])
        summary_params = self._build_params({"id": ids})
        summary_response = await self._throttled_request(
            "GET", self.source_url + "esummary.fcgi", params=summary_params
        )
        summary_response.raise_for_status()
        summary_data = summary_response.json()

        results = []
        result_section = summary_data.get("result", {})
        for uid in result_section.get("uids", []):
            item = result_section.get(uid, {})
            if item and not item.get("error"):
                item["_clinical_search"] = True
                results.append(item)

        return results

    async def _search_general(
        self, query: str, retmax: int, _filters: Dict
    ) -> List[Dict]:
        """General text search across dbSNP."""
        term = f"{query} AND human[ORGN]"
        search_params = self._build_params({"term": term, "retmax": retmax})
        search_response = await self._throttled_request(
            "GET", self.source_url + "esearch.fcgi", params=search_params
        )
        search_response.raise_for_status()
        search_data = search_response.json()

        id_list = search_data.get("esearchresult", {}).get("idlist", [])
        if not id_list:
            return []

        ids = ",".join(id_list[:retmax])
        summary_params = self._build_params({"id": ids})
        summary_response = await self._throttled_request(
            "GET", self.source_url + "esummary.fcgi", params=summary_params
        )
        summary_response.raise_for_status()
        summary_data = summary_response.json()

        results = []
        result_section = summary_data.get("result", {})
        for uid in result_section.get("uids", []):
            item = result_section.get(uid, {})
            if item and not item.get("error"):
                results.append(item)

        return results

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "genetic_variant"
    ) -> Dict:
        """
        Transform dbSNP summary data to canonical GeneticVariant format.

        Parameters:
            raw_data: Raw dict from dbSNP esummary
            entity_type: Target canonical entity type

        Returns:
            Canonical-format dict.
        """
        snp_id = raw_data.get("snp_id", "")
        rs_id = f"rs{snp_id}" if snp_id else raw_data.get("_query_rsid", "")

        # Chromosome and position
        chrom = raw_data.get("chr", raw_data.get("chromosome", ""))
        pos = raw_data.get("chrpos", raw_data.get("position", None))
        if pos:
            try:
                pos = int(pos)
            except (ValueError, TypeError):
                pos = None

        # Gene info
        genes = raw_data.get("genes", [])
        gene_symbol = ""
        if genes and isinstance(genes, list) and len(genes) > 0:
            gene_symbol = genes[0].get("name", "") if isinstance(genes[0], dict) else str(genes[0])

        # Alleles
        alleles = raw_data.get("alleles", [])
        ref_allele = ""
        alt_alleles = []
        if alleles and isinstance(alleles, list):
            for allele in alleles:
                if isinstance(allele, dict):
                    allele_letter = allele.get("allele", "")
                    freq = allele.get("freq", None)
                    if allele.get("is_ref") or allele.get("is_reference"):
                        ref_allele = allele_letter
                    else:
                        alt_alleles.append({"allele": allele_letter, "freq": freq})

        # Clinical significance
        clinical = raw_data.get("clinical_significance", [])
        clinical_sig = clinical[0] if isinstance(clinical, list) and clinical else ""

        # Variant type
        snp_class = raw_data.get("snp_class", "")
        variant_type = self._map_snp_class(snp_class)

        # Origin
        origin = raw_data.get("origin", "")
        organism = raw_data.get("organism", "Homo sapiens")

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": rs_id,
            "gene_symbol": gene_symbol,
            "variant_id": rs_id,
            "chromosome": str(chrom),
            "position": pos,
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
            # dbSNP-specific extensions
            "dbsnp": {
                "snp_id": snp_id,
                "rs_id": rs_id,
                "snp_class": snp_class,
                "variant_type": variant_type,
                "ref_allele": ref_allele,
                "alt_alleles": alt_alleles,
                "clinical_significance": clinical_sig,
                "build_id": raw_data.get("build_id", ""),
                "docsum": raw_data.get("docsum", ""),
                "genotype": raw_data.get("genotype", []),
                "tax_id": raw_data.get("tax_id", ""),
                "organism": organism,
                "origin": origin,
                "gene_names": [g.get("name", "") for g in genes] if isinstance(genes, list) else [],
                "acc": raw_data.get("acc", ""),
                "weight": raw_data.get("weight", None),
            },
        }

    @staticmethod
    def _map_snp_class(snp_class: str) -> str:
        """Map dbSNP SNP class to standardized variant type."""
        mapping = {
            "snp": "SNV",
            "indel": "indel",
            "del": "deletion",
            "ins": "insertion",
            "mnv": "MNV",
            "div": "divergence",
            "microsat": "microsatellite",
            "named": "named_variant",
            "mixed": "mixed",
            "mult": "multiple_nucleotide_variant",
        }
        return mapping.get(snp_class.lower(), snp_class)

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for dbSNP result."""
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.95,
            "research_only": False,
            "curation_level": "ncbi_reference",
            "build_id": result.get("build_id", ""),
            "license": "Public Domain (US Government Work)",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Calculate confidence scores for a dbSNP entry.
        NCBI reference database has high baseline confidence.
        """
        # Weight: higher for validated SNPs
        weight = result.get("weight", 1)
        try:
            weight = int(weight) if weight else 1
        except (ValueError, TypeError):
            weight = 1
        weight_score = min(1.0, weight / 100.0 + 0.5)

        # Has clinical annotation = higher evidence
        clinical = result.get("clinical_significance", [])
        has_clinical = 0.9 if (clinical and clinical != ["not specified"]) else 0.6

        # Has gene mapping
        genes = result.get("genes", [])
        has_gene = 0.9 if genes else 0.5

        # Reference database quality
        ref_quality = 0.97

        overall = round(
            (ref_quality * 0.40 + weight_score * 0.20 + has_clinical * 0.20 + has_gene * 0.20),
            3,
        )

        return {
            "data_quality": ref_quality,
            "evidence_strength": has_clinical,
            "sample_size": weight_score,
            "replication": 0.85,
            "consistency": 0.9,
            "temporal_relevance": 0.92,
            "population_match": 0.75,
            "overall": overall,
        }

    async def get_snp_genotypes(self, rsid: str) -> List[Dict]:
        """Fetch genotype data for a specific SNP."""
        try:
            rsid_clean = rsid.lower().replace("rs", "")
            params = self._build_params({
                "id": rsid_clean,
                "rettype": "json",
            })
            response = await self._throttled_request(
                "GET", self.source_url + "efetch.fcgi", params=params
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
            # efetch returns XML by default; try to parse JSON if available
            try:
                data = response.json()
                return data if isinstance(data, list) else [data]
            except Exception:
                return [{"raw_xml": response.text[:1000]}]
        except Exception as e:
            logger.error(f"Error fetching genotypes for {rsid}: {e}")
            return []

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()
