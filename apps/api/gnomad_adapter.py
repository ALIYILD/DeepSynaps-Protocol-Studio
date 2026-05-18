"""
gnomAD Adapter — Broad Institute gnomAD GraphQL API
Provides access to 807,000+ exomes and 76,000+ genomes for
population-scale variant frequency data.

API Docs: https://gnomad.broadinstitute.org/api/
GraphQL playground available at the URL above.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
import httpx
import logging
import asyncio
import json

logger = logging.getLogger(__name__)


class GnomadAdapter:
    """
    Adapter for the gnomAD (Genome Aggregation Database) GraphQL API.
    Population-scale allele frequency data from exome and genome sequencing
    of hundreds of thousands of individuals.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.name = "gnomad"
        self.display_name = "gnomAD"
        self.source_url = "https://gnomad.broadinstitute.org/api/"
        self.version = "4.1"
        self.confidence_tier = "A"
        self.data_types = ["genetic_variant", "allele_frequency", "population_genomics", "gene_constraint"]
        self.rate_limit_per_minute = 600  # Reasonable use policy
        self.requires_auth = False
        self.auth_type = "none"
        self.api_key = api_key
        self._min_interval = 1.0 / 10.0  # 10 req/s max
        self._last_request_time = 0.0
        self.reference_genome = "GRCh38"
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (gnomAD-Adapter)",
                "Content-Type": "application/json",
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

    async def _graphql_query(self, query: str, variables: Optional[Dict] = None) -> Dict:
        """Execute a GraphQL query against gnomAD API."""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        response = await self._throttled_request(
            "POST", self.source_url, json=payload
        )
        response.raise_for_status()
        data = response.json()

        if "errors" in data:
            errors = data["errors"]
            error_msg = "; ".join(e.get("message", str(e)) for e in errors)
            raise ValueError(f"GraphQL errors: {error_msg}")

        return data.get("data", {})

    async def validate_connection(self) -> bool:
        """Validate connectivity to gnomAD GraphQL API."""
        try:
            query = """
            {
                meta {
                    gnomad_version
                }
            }
            """
            data = await self._graphql_query(query)
            if data and "meta" in data:
                logger.info(f"{self.name}: connection validated (version {data['meta'].get('gnomad_version', '?')})")
                return True
            logger.warning(f"{self.name}: unexpected response structure")
            return False
        except Exception as e:
            logger.error(f"{self.name} connection failed: {e}")
            return False

    async def search(
        self, query: str, filters: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search gnomAD by gene symbol, variant ID, or chrom-pos-ref-alt.

        Parameters:
            query: Gene symbol (e.g., 'BRCA1'), variant ID (e.g., '1-55039959-G-A'),
                   rsID (e.g., 'rs80356821'), or chrom:pos
            filters: Optional dict with keys:
                - 'search_type': 'gene' | 'variant' | 'region' | 'rsid'
                - 'dataset': str (default 'gnomad_r4')
                - 'include_exome': bool (default True)
                - 'include_genome': bool (default True)

        Returns:
            List of variant/gene records as dicts.
        """
        filters = filters or {}
        search_type = filters.get("search_type", "auto")
        dataset = filters.get("dataset", "gnomad_r4")

        # Auto-detect search type
        if search_type == "auto":
            if query.startswith("rs"):
                search_type = "rsid"
            elif "-" in query and query.replace("-", "").replace(":", "").isdigit():
                search_type = "variant"
            elif ":" in query:
                search_type = "region"
            else:
                search_type = "gene"

        try:
            if search_type == "gene":
                return await self._search_by_gene(query, dataset, filters)
            elif search_type == "variant":
                return await self._search_variant(query, dataset, filters)
            elif search_type == "region":
                return await self._search_region(query, dataset, filters)
            elif search_type == "rsid":
                return await self._search_by_rsid(query, dataset, filters)
            else:
                return await self._search_by_gene(query, dataset, filters)

        except httpx.HTTPError as e:
            logger.error(f"{self.name} HTTP error during search: {e}")
            return []
        except ValueError as e:
            logger.error(f"{self.name} GraphQL error: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} search error: {e}")
            return []

    async def _search_by_gene(
        self, gene: str, dataset: str, filters: Dict
    ) -> List[Dict]:
        """Search variants by gene symbol."""
        include_exome = filters.get("include_exome", True)
        include_genome = filters.get("include_genome", True)

        query = """
        query GeneVariants($geneSymbol: String!, $datasetId: DatasetId!) {
            gene(gene_symbol: $geneSymbol, reference_genome: GRCh38) {
                gene_id
                gene_version
                symbol
                chrom
                start
                stop
                strand
                variants(dataset: $datasetId) {
                    variant_id
                    chrom
                    pos
                    ref
                    alt
                    rsids
                    consequence
                    gene_symbol
                    transcript_id
                    hgvsc
                    hgvsp
                    exome {
                        ac
                        an
                        af
                        ac_hemi
                        ac_hom
                    }
                    genome {
                        ac
                        an
                        af
                        ac_hemi
                        ac_hom
                    }
                    joint {
                        ac
                        an
                        af
                        homozygote_count
                    }
                    populations {
                        id
                        ac
                        an
                        af
                    }
                    flags
                    loftee_prediction
                }
            }
        }
        """
        variables = {
            "geneSymbol": gene.upper(),
            "datasetId": dataset,
        }
        data = await self._graphql_query(query, variables)
        gene_data = data.get("gene")
        if not gene_data:
            return []

        variants = gene_data.get("variants", [])
        for v in variants:
            v["_query_gene"] = gene
            v["_gene_metadata"] = {
                "gene_id": gene_data.get("gene_id"),
                "symbol": gene_data.get("symbol"),
                "chrom": gene_data.get("chrom"),
                "start": gene_data.get("start"),
                "stop": gene_data.get("stop"),
            }

        if not include_exome:
            variants = [v for v in variants if v.get("genome")]
        if not include_genome:
            variants = [v for v in variants if v.get("exome")]

        return variants

    async def _search_variant(
        self, variant_id: str, dataset: str, filters: Dict
    ) -> List[Dict]:
        """Fetch a specific variant by chrom-pos-ref-alt ID."""
        query = """
        query VariantQuery($variantId: String!, $datasetId: DatasetId!) {
            variant(variantId: $variantId, dataset: $datasetId) {
                variant_id
                chrom
                pos
                ref
                alt
                rsids
                consequence
                gene_symbol
                transcript_id
                hgvsc
                hgvsp
                exome {
                    ac
                    an
                    af
                    ac_hemi
                    ac_hom
                }
                genome {
                    ac
                    an
                    af
                    ac_hemi
                    ac_hom
                }
                joint {
                    ac
                    an
                    af
                    homozygote_count
                }
                populations {
                    id
                    ac
                    an
                    af
                }
                flags
                loftee_prediction
            }
        }
        """
        variables = {
            "variantId": variant_id,
            "datasetId": dataset,
        }
        data = await self._graphql_query(query, variables)
        variant_data = data.get("variant")
        if not variant_data:
            return []

        variant_data["_query_variant"] = variant_id
        return [variant_data]

    async def _search_region(
        self, region: str, dataset: str, filters: Dict
    ) -> List[Dict]:
        """Search variants in a genomic region."""
        # Parse region: chrom:start-stop
        region = region.replace("chr", "")
        if ":" not in region:
            logger.warning(f"Invalid region format: {region}")
            return []

        chrom, coords = region.split(":")
        if "-" in coords:
            start, stop = coords.split("-")
        else:
            # Single position with padding
            pos = int(coords.replace(",", ""))
            start = str(max(1, pos - 500))
            stop = str(pos + 500)

        query = """
        query RegionVariants($chrom: String!, $start: Int!, $stop: Int!, $datasetId: DatasetId!) {
            region(chrom: $chrom, start: $start, stop: $stop, reference_genome: GRCh38) {
                variants(dataset: $datasetId) {
                    variant_id
                    chrom
                    pos
                    ref
                    alt
                    rsids
                    consequence
                    gene_symbol
                    exome {
                        ac
                        an
                        af
                    }
                    genome {
                        ac
                        an
                        af
                    }
                    joint {
                        ac
                        an
                        af
                        homozygote_count
                    }
                    populations {
                        id
                        ac
                        an
                        af
                    }
                    flags
                }
            }
        }
        """
        variables = {
            "chrom": chrom,
            "start": int(start.replace(",", "")),
            "stop": int(stop.replace(",", "")),
            "datasetId": dataset,
        }
        data = await self._graphql_query(query, variables)
        region_data = data.get("region")
        if not region_data:
            return []

        variants = region_data.get("variants", [])
        for v in variants:
            v["_query_region"] = region
        return variants

    async def _search_by_rsid(
        self, rsid: str, dataset: str, filters: Dict
    ) -> List[Dict]:
        """Search variants by rsID."""
        rsid = rsid.lower()
        if not rsid.startswith("rs"):
            rsid = "rs" + rsid

        query = """
        query RsidSearch($rsid: String!, $datasetId: DatasetId!) {
            variants_in_rsid(rsid: $rsid, dataset: $datasetId) {
                variant_id
                chrom
                pos
                ref
                alt
                rsids
                consequence
                gene_symbol
                exome {
                    ac
                    an
                    af
                }
                genome {
                    ac
                    an
                    af
                }
                joint {
                    ac
                    an
                    af
                    homozygote_count
                }
                flags
            }
        }
        """
        variables = {
            "rsid": rsid,
            "datasetId": dataset,
        }
        try:
            data = await self._graphql_query(query, variables)
            variants = data.get("variants_in_rsid", [])
            for v in variants:
                v["_query_rsid"] = rsid
            return variants
        except ValueError:
            # Fallback: try variant search with rsid
            logger.info(f"rsid query not available, returning empty for {rsid}")
            return []

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "genetic_variant"
    ) -> Dict:
        """
        Transform gnomAD variant data to canonical GeneticVariant format.

        Parameters:
            raw_data: Raw variant dict from gnomAD GraphQL API
            entity_type: Target canonical entity type

        Returns:
            Canonical-format dict.
        """
        # Basic variant info
        variant_id = raw_data.get("variant_id", "")
        chrom = raw_data.get("chrom", "")
        pos = raw_data.get("pos")
        ref = raw_data.get("ref", "")
        alt = raw_data.get("alt", "")

        # rsIDs
        rsids = raw_data.get("rsids", [])
        rs_id = rsids[0] if rsids else ""

        # Gene
        gene_symbol = raw_data.get("gene_symbol", "")

        # Consequence
        consequence = raw_data.get("consequence", "")

        # HGVS
        hgvsc = raw_data.get("hgvsc", "")
        hgvsp = raw_data.get("hgvsp", "")

        # Allele frequencies
        exome = raw_data.get("exome", {}) or {}
        genome = raw_data.get("genome", {}) or {}
        joint = raw_data.get("joint", {}) or {}

        exome_af = exome.get("af")
        genome_af = genome.get("af")
        joint_af = joint.get("af")
        joint_ac = joint.get("ac")
        joint_an = joint.get("an")

        # Populations
        populations = raw_data.get("populations", [])
        pop_freqs = {}
        for pop in populations:
            pop_id = pop.get("id", "")
            pop_af = pop.get("af")
            if pop_id and pop_af is not None:
                pop_freqs[pop_id] = pop_af

        # Flags
        flags = raw_data.get("flags", [])

        # LoF prediction
        loftee = raw_data.get("loftee_prediction", "")

        # Gene metadata
        gene_meta = raw_data.get("_gene_metadata", {})

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": variant_id,
            "gene_symbol": gene_symbol,
            "variant_id": rs_id,
            "chromosome": str(chrom),
            "position": pos,
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
            # gnomAD-specific extensions
            "gnomad": {
                "variant_id": variant_id,
                "reference_genome": self.reference_genome,
                "rsids": rsids,
                "ref": ref,
                "alt": alt,
                "consequence": consequence,
                "hgvsc": hgvsc,
                "hgvsp": hgvsp,
                "allele_frequency": {
                    "exome": exome_af,
                    "genome": genome_af,
                    "joint": joint_af,
                    "exome_an": exome.get("an"),
                    "genome_an": genome.get("an"),
                    "joint_an": joint_an,
                    "joint_ac": joint_ac,
                    "exome_ac": exome.get("ac"),
                    "genome_ac": genome.get("ac"),
                    "exome_hom": exome.get("ac_hom"),
                    "genome_hom": genome.get("ac_hom"),
                    "joint_homozygote_count": joint.get("homozygote_count"),
                },
                "population_frequencies": pop_freqs,
                "flags": flags,
                "loftee_prediction": loftee,
                "gene_id": gene_meta.get("gene_id", ""),
                "transcript_id": raw_data.get("transcript_id", ""),
                "dataset": "gnomad_r4",
            },
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for gnomAD result."""
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.94,
            "research_only": False,
            "curation_level": "computational_population",
            "sample_size_note": "807k+ exomes, 76k+ genomes",
            "license": "ODC-BY 1.0 (gnomAD v4)",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Calculate confidence scores for a gnomAD variant entry.
        Based on allele count, sample size, and data quality flags.
        """
        joint = result.get("joint", {}) or {}
        exome = result.get("exome", {}) or {}
        genome = result.get("genome", {}) or {}

        joint_an = joint.get("an", 0) or 0
        exome_an = exome.get("an", 0) or 0
        genome_an = genome.get("an", 0) or 0
        total_an = joint_an or (exome_an + genome_an)

        # Sample size score: larger = more confident
        if total_an >= 1_000_000:
            sample_score = 1.0
        elif total_an >= 500_000:
            sample_score = 0.95
        elif total_an >= 100_000:
            sample_score = 0.85
        elif total_an >= 10_000:
            sample_score = 0.7
        else:
            sample_score = 0.5

        # AC > 0 means observed
        joint_ac = joint.get("ac", 0) or 0
        observed = 0.9 if joint_ac > 0 else 0.4

        # No flags = higher confidence
        flags = result.get("flags", [])
        flag_score = 1.0 if not flags else 0.7

        # Population diversity
        pops = result.get("populations", [])
        pop_score = min(1.0, len(pops) / 8.0) if pops else 0.5

        # Reference genome quality
        ref_quality = 0.96

        overall = round(
            (ref_quality * 0.25 + sample_score * 0.30 + observed * 0.15 +
             flag_score * 0.15 + pop_score * 0.15),
            3,
        )

        return {
            "data_quality": ref_quality,
            "evidence_strength": 0.85,
            "sample_size": sample_score,
            "replication": 0.8,
            "consistency": flag_score,
            "temporal_relevance": 0.9,
            "population_match": pop_score,
            "overall": overall,
        }

    async def get_gene_constraint(
        self, gene_symbol: str
    ) -> Optional[Dict]:
        """Fetch gene constraint metrics (pLI, LOEUF) for a gene."""
        try:
            query = """
            query GeneConstraint($geneSymbol: String!) {
                gene(gene_symbol: $geneSymbol, reference_genome: GRCh38) {
                    gene_id
                    symbol
                    gnomad_constraint {
                        exp_lof
                        obs_lof
                        oe_lof
                        mu_syn
                        exp_mis
                        obs_mis
                        oe_mis
                        z_mis
                        pLI
                        oe_lof_lower
                        oe_lof_upper
                    }
                }
            }
            """
            variables = {"geneSymbol": gene_symbol.upper()}
            data = await self._graphql_query(query, variables)
            gene_data = data.get("gene")
            if not gene_data:
                return None
            return gene_data.get("gnomad_constraint")
        except Exception as e:
            logger.error(f"Error fetching gene constraint for {gene_symbol}: {e}")
            return None

    async def get_transcript_info(
        self, transcript_id: str
    ) -> Optional[Dict]:
        """Fetch detailed transcript information."""
        try:
            query = """
            query TranscriptInfo($transcriptId: String!) {
                transcript(transcript_id: $transcriptId, reference_genome: GRCh38) {
                    transcript_id
                    chrom
                    start
                    stop
                    strand
                    gene {
                        gene_id
                        symbol
                    }
                    exons {
                        feature_type
                        start
                        stop
                    }
                }
            }
            """
            variables = {"transcriptId": transcript_id}
            data = await self._graphql_query(query, variables)
            return data.get("transcript")
        except Exception as e:
            logger.error(f"Error fetching transcript {transcript_id}: {e}")
            return None

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()
