"""
MyVariant.info Adapter - Variant Annotation Aggregator
URL: https://myvariant.info/v1/
Source: UCSF/Scripps Research Institute, fully open REST API
Data: Aggregates 20+ variant databases (ClinVar, dbSNP, CADD, DANN, etc.)
Endpoints: /variant/{id}, /query, /metadata
Confidence Tier: A (multi-source aggregation with evidence scoring)
"""

from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
import httpx
import logging
import time

logger = logging.getLogger(__name__)


class BaseAdapter:
    """Abstract base class for all atlas/database adapters."""

    async def validate_connection(self) -> bool:
        raise NotImplementedError

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        raise NotImplementedError

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "brain_region") -> Dict:
        raise NotImplementedError

    def get_provenance(self, result: Dict) -> Dict:
        raise NotImplementedError

    def get_confidence_score(self, result: Dict) -> Dict:
        raise NotImplementedError

    async def close(self):
        raise NotImplementedError


class MyVariantAdapter(BaseAdapter):
    """
    Adapter for MyVariant.info - Variant Annotation Aggregator.

    MyVariant.info aggregates variant annotation data from 20+ databases
    including ClinVar, dbSNP, CADD, dbNSFP, ExAC, and more.
    Supports variant queries by HGVS ID, dbSNP rsid, VCF, genomic regions,
    gene names, and free text.

    Rate limit: ~1 request per second (recommended)
    """

    def __init__(self):
        self.name = "myvariant_info"
        self.display_name = "MyVariant.info"
        self.source_url = "https://myvariant.info/v1/"
        self.version = "1.0"
        self.confidence_tier = "A"
        self.data_types = ["variant_annotation", "clinical_variant", "functional_variant"]
        self.rate_limit_per_minute = 60
        self.requires_auth = False
        self.auth_type = "none"
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={"User-Agent": "DeepSynaps-Protocol-Studio/1.0"},
            follow_redirects=True,
        )
        self._last_request_time = 0.0
        self._min_interval = 1.0  # Minimum seconds between requests

    async def _rate_limited_request(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        """Execute an HTTP request with rate limiting."""
        import asyncio
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        try:
            response = await self.client.get(url, params=params, timeout=30.0)
            self._last_request_time = time.time()
            return response
        except httpx.TimeoutException:
            logger.error(f"MyVariant request timed out: {url}")
            raise
        except httpx.HTTPError as e:
            logger.error(f"MyVariant HTTP error for {url}: {e}")
            raise

    async def validate_connection(self) -> bool:
        """Validate connection to MyVariant.info API."""
        try:
            response = await self._rate_limited_request(self.source_url + "metadata")
            if response.status_code == 200:
                data = response.json()
                if "stats" in data:
                    stats = data["stats"]
                    total_variants = stats.get("total", 0)
                    logger.info(
                        f"MyVariant.info connected. Total variants indexed: {total_variants:,}"
                    )
                    self.version = data.get("app_revision", "1.0")
                    return True
                return True
            logger.warning(f"MyVariant.info returned status {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"MyVariant.info connection validation failed: {e}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search MyVariant.info for variant annotations.

        Args:
            query: Variant ID in HGVS format (e.g., 'chr1:g.218631822G>A'),
                   dbSNP rsid (e.g., 'rs429358'), gene name, or genomic region.
            filters: Optional dict with keys:
                - fields: Comma-separated fields to return (default: 'all')
                - size: Number of results to return (default 10, max 1000)
                - from_: Offset for pagination (default 0)
                - assembly: Genome assembly 'hg19' or 'hg38' (default 'hg19')
                - fetch_all: Whether to fetch all results (default False)
                - scopes: Type of query (e.g., 'dbsnp.rsid', 'clinvar.hgvs')

        Returns:
            List of dicts with variant annotation data.
        """
        filters = filters or {}
        fields = filters.get("fields", "all")
        size = min(filters.get("size", 10), 1000)
        from_offset = filters.get("from_", 0)
        assembly = filters.get("assembly", "hg19")
        scopes = filters.get("scopes", None)

        results = []

        try:
            # Try exact variant lookup first (HGVS or rsid)
            if self._looks_like_variant_id(query):
                variant_url = self.source_url + f"variant/{query}"
                variant_params = {"assembly": assembly}
                if fields != "all":
                    variant_params["fields"] = fields

                response = await self._rate_limited_request(variant_url, variant_params)
                if response.status_code == 200:
                    data = response.json()
                    if "notfound" not in data:
                        data["_query"] = query
                        data["_query_type"] = "variant_lookup"
                        data["_assembly"] = assembly
                        results.append(data)
                        logger.info(f"MyVariant.info exact lookup found: {query}")
                        return results

            # Fallback to query endpoint for broader search
            query_url = self.source_url + "query"
            query_params = {
                "q": query,
                "size": size,
                "from": from_offset,
                "assembly": assembly,
            }
            if fields != "all":
                query_params["fields"] = fields
            if scopes:
                query_params["scopes"] = scopes

            response = await self._rate_limited_request(query_url, query_params)
            if response.status_code == 200:
                data = response.json()
                hits = data.get("hits", [])
                total = data.get("total", 0)

                for hit in hits:
                    hit["_query"] = query
                    hit["_query_type"] = "query_search"
                    hit["_assembly"] = assembly
                    hit["_total_hits"] = total
                    results.append(hit)

                logger.info(f"MyVariant.info query '{query}' returned {len(hits)}/{total} results")
            else:
                logger.warning(f"MyVariant.info query returned {response.status_code}")

        except httpx.HTTPError as e:
            logger.error(f"MyVariant.info HTTP error during search: {e}")
        except Exception as e:
            logger.error(f"MyVariant.info search error: {e}")

        return results

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "variant_annotation") -> Dict:
        """
        Transform MyVariant.info raw data to BiomarkerReading canonical format.

        Args:
            raw_data: Raw data dict from search()
            entity_type: Type of entity (default 'variant_annotation')

        Returns:
            Canonical-format dict compatible with BiomarkerReading schema.
        """
        query = raw_data.get("_query", "")
        query_type = raw_data.get("_query_type", "query_search")
        assembly = raw_data.get("_assembly", "hg19")

        # Extract variant identifiers
        dbsnp = raw_data.get("dbsnp", {})
        clinvar = raw_data.get("clinvar", {})
        cadd = raw_data.get("cadd", {})

        # Build HGVS ID
        hgvs_id = raw_data.get("_id", "")
        if not hgvs_id and clinvar:
            hgvs_id = clinvar.get("hgvs", {}).get("genomic", "") if isinstance(clinvar.get("hgvs"), dict) else clinvar.get("hgvs", "")

        # dbSNP rsid
        rsid = ""
        if isinstance(dbsnp, dict):
            rsid = dbsnp.get("rsid", "")
            if not rsid and "alt" in dbsnp and isinstance(dbsnp["alt"], dict):
                rsid = dbsnp["alt"].get("rsid", "")

        # Genomic coordinates
        vcf = raw_data.get("vcf", {})
        chrom = vcf.get("chrom", "") if isinstance(vcf, dict) else ""
        pos = vcf.get("pos", 0) if isinstance(vcf, dict) else 0
        ref = vcf.get("ref", "") if isinstance(vcf, dict) else ""
        alt = vcf.get("alt", "") if isinstance(vcf, dict) else ""

        # Get genomic coordinates from chrom field directly
        if not chrom:
            chrom = raw_data.get("chrom", "")
        if not pos:
            pos = raw_data.get("hg19", {}).get("start", 0) if isinstance(raw_data.get("hg19"), dict) else 0

        # Gene annotations
        gene_info = {}
        if isinstance(cadd, dict):
            gene_info = cadd.get("gene", {})
        snpeff = raw_data.get("snpeff", {})
        if not gene_info and snpeff:
            ann = snpeff.get("ann", [])
            if isinstance(ann, list) and ann:
                gene_info = {"gene_name": ann[0].get("genename", "")}

        # Clinical significance
        clinical_significance = ""
        if isinstance(clinvar, dict):
            rcv = clinvar.get("rcv", [])
            if isinstance(rcv, list) and rcv:
                clinical_significance = rcv[0].get("clinical_significance", "")
            if not clinical_significance:
                clinical_significance = clinvar.get("clinical_significance", "")

        # Functional scores
        functional_scores = {}
        if isinstance(cadd, dict):
            functional_scores["cadd_phred"] = cadd.get("phred", 0)
            functional_scores["cadd_raw"] = cadd.get("rawscore", 0)

        dbnsfp = raw_data.get("dbnsfp", {})
        if isinstance(dbnsfp, dict):
            sift = dbnsfp.get("sift", {})
            polyphen = dbnsfp.get("polyphen2", {})
            if isinstance(sift, dict):
                functional_scores["sift_score"] = sift.get("score", 0)
                functional_scores["sift_pred"] = sift.get("pred", "")
            if isinstance(polyphen, dict):
                hdiv = polyphen.get("hdiv", {})
                if isinstance(hdiv, dict):
                    functional_scores["polyphen2_hdiv_score"] = hdiv.get("score", 0)
                    functional_scores["polyphen2_hdiv_pred"] = hdiv.get("pred", "")

        # Allele frequencies
        allele_freqs = {}
        if isinstance(dbsnp, dict):
            allele_freqs["dbsnp"] = dbsnp.get("alleles", [])
        gnomad = raw_data.get("gnomad_genome", {})
        if isinstance(gnomad, dict):
            allele_freqs["gnomad_genome"] = gnomad.get("af", {})
        exac = raw_data.get("exac", {})
        if isinstance(exac, dict):
            allele_freqs["exac"] = exac.get("af", {})

        # Consequence
        consequence = ""
        if isinstance(snpeff, dict):
            ann = snpeff.get("ann", [])
            if isinstance(ann, list) and ann:
                consequence = ann[0].get("effect", "")

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": hgvs_id or rsid or query,
            "region_name": query,
            "coordinates": {
                "chromosome": chrom,
                "position": pos,
                "reference": ref,
                "alternate": alt,
                "assembly": assembly,
            },
            "network": {
                "query": query,
                "query_type": query_type,
                "variant_id": hgvs_id,
                "rsid": rsid,
                "gene": gene_info.get("gene_name", gene_info.get("genename", "")),
                "clinical_significance": clinical_significance,
                "consequence": consequence,
                "functional_scores": functional_scores,
                "allele_frequencies": allele_freqs,
                "num_databases": self._count_source_databases(raw_data),
                "sources_available": self._list_sources(raw_data),
            },
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for MyVariant.info data."""
        sources = self._list_sources(result)
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.93,
            "research_only": False,
            "citation": (
                "Xin J, et al. (2016) High-performance web services for querying "
                "gene and variant annotation. Genome Biology, 17(1):1-7."
            ),
            "aggregated_sources": sources,
            "num_aggregated_databases": len(sources),
            "update_frequency": "monthly",
            "license": "CC BY-NC 4.0 (varies by source database)",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Calculate confidence score for MyVariant.info annotation data.

        Scores consider: number of source databases, presence of clinical
        evidence, functional prediction scores, and allele frequency data.
        """
        num_sources = self._count_source_databases(result)
        sources = self._list_sources(result)

        # Quality improves with more source databases
        data_quality = min(0.95, 0.5 + num_sources * 0.05)

        # Clinical evidence boosts confidence
        has_clinvar = "clinvar" in result
        has_clinical = has_clinvar and result.get("clinvar", {}).get("clinical_significance", "")
        evidence_strength = 0.9 if has_clinical else (0.75 if has_clinvar else 0.6)

        # Functional predictions
        cadd = result.get("cadd", {})
        has_cadd = bool(cadd) if not isinstance(cadd, dict) else bool(cadd.get("phred", 0))
        dbnsfp = result.get("dbnsfp", {})
        has_dbnsfp = bool(dbnsfp)
        sample_size = min(0.95, 0.5 + (0.15 if has_cadd else 0) + (0.15 if has_dbnsfp else 0) + num_sources * 0.05)

        # Replication across databases
        replication = min(0.95, 0.4 + num_sources * 0.08)

        return {
            "data_quality": round(data_quality, 3),
            "evidence_strength": round(evidence_strength, 3),
            "sample_size": round(sample_size, 3),
            "replication": round(replication, 3),
            "consistency": 0.87,
            "temporal_relevance": 0.9,
            "population_match": 0.82,
            "overall": round((data_quality + evidence_strength + sample_size + replication + 0.87 + 0.9 + 0.82) / 7, 3),
            "num_source_databases": num_sources,
            "sources": sources,
        }

    def _looks_like_variant_id(self, query: str) -> bool:
        """Check if a query string looks like a variant identifier."""
        if not query:
            return False
        query = query.strip()
        # HGVS format (e.g., chr1:g.218631822G>A or NC_000001.11:g.218631822G>A)
        if ":g." in query or ":c." in query or ":p." in query or ":m." in query:
            return True
        # dbSNP rsid
        if query.lower().startswith("rs") and query[2:].isdigit():
            return True
        # CAID (ClinGen Allele Registry)
        if query.startswith("CA") and query[2:].isdigit():
            return True
        return False

    def _count_source_databases(self, result: Dict) -> int:
        """Count how many source databases contributed annotations."""
        known_sources = [
            "cadd", "clinvar", "cosmic", "dbnsfp", "dbsnp", "docm",
            "evs", "exac", "gnomad_exome", "gnomad_genome",
            "grasp", "mutdb", "snpeff", "wellderly", "emv",
            "snpedia", "gwassnp", "gwascatalog",
        ]
        return sum(1 for src in known_sources if src in result and result[src])

    def _list_sources(self, result: Dict) -> List[str]:
        """List the source databases that contributed annotations."""
        known_sources = [
            "cadd", "clinvar", "cosmic", "dbnsfp", "dbsnp", "docm",
            "evs", "exac", "gnomad_exome", "gnomad_genome",
            "grasp", "mutdb", "snpeff", "wellderly", "emv",
            "snpedia", "gwassnp", "gwascatalog",
        ]
        return [src for src in known_sources if src in result and result[src]]

    async def get_batch_variants(self, variant_ids: List[str], fields: Optional[str] = None, assembly: str = "hg19") -> List[Dict]:
        """
        Fetch annotations for multiple variants in a single request.

        Args:
            variant_ids: List of variant IDs (HGVS or rsid)
            fields: Comma-separated fields to return
            assembly: Genome assembly

        Returns:
            List of annotation dicts
        """
        if not variant_ids:
            return []

        url = self.source_url + "variant"
        params = {
            "ids": ",".join(variant_ids),
            "assembly": assembly,
        }
        if fields:
            params["fields"] = fields

        try:
            response = await self._rate_limited_request(url, params)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    for item in data:
                        item["_query_type"] = "batch_lookup"
                        item["_assembly"] = assembly
                    return data
                elif isinstance(data, dict):
                    data["_query_type"] = "batch_lookup"
                    data["_assembly"] = assembly
                    return [data]
        except Exception as e:
            logger.error(f"Batch variant lookup failed: {e}")

        return []

    async def close(self):
        """Close the HTTP client and release resources."""
        await self.client.aclose()
        logger.info("MyVariant.info adapter closed")
