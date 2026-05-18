"""
Ensembl Adapter — Ensembl REST API
Provides access to genome annotations, sequences, variants, and comparative
genomics for 200+ species.

API Docs: https://rest.ensembl.org/documentation/info
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
import httpx
import logging
import asyncio

logger = logging.getLogger(__name__)


class EnsemblAdapter:
    """
    Adapter for the Ensembl REST API.
    Comprehensive genome browser and annotation system providing
    gene, transcript, variant, and sequence data for vertebrates.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.name = "ensembl"
        self.display_name = "Ensembl"
        self.source_url = "https://rest.ensembl.org/"
        self.version = "e112"  # Ensembl release 112
        self.confidence_tier = "A"
        self.data_types = ["gene", "transcript", "protein", "genetic_variant", "sequence", "homology"]
        # Rate limit: 15 req/s without key, 55 req/s with key
        self.rate_limit_per_minute = 3300 if api_key else 900
        self.requires_auth = False
        self.auth_type = "api_key_optional"
        self.api_key = api_key
        self.default_species = "homo_sapiens"
        self._min_interval = 1.0 / 55.0 if api_key else 1.0 / 15.0
        self._last_request_time = 0.0
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (Ensembl-Adapter)",
                "Content-Type": "application/json",
            },
        )

    async def _throttled_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Execute HTTP request with rate limiting."""
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        if self.api_key and "headers" in kwargs:
            kwargs["headers"]["Authorization"] = f"Bearer {self.api_key}"
        response = await self.client.request(method, url, **kwargs)
        self._last_request_time = asyncio.get_event_loop().time()
        return response

    async def validate_connection(self) -> bool:
        """Validate connectivity to Ensembl REST API."""
        try:
            response = await self._throttled_request(
                "GET", self.source_url + "info/ping", headers={"Accept": "application/json"}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("ping") == 1:
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
        Search Ensembl by gene symbol, ENS ID, region, or variant.

        Parameters:
            query: Gene symbol (e.g., 'BRCA1'), ENS ID (e.g., 'ENSG00000139618'),
                   region (e.g., '1:1000000-1100000'), or variant ID
            filters: Optional dict with keys:
                - 'search_type': 'gene' | 'ens_id' | 'region' | 'variant'
                - 'species': str (default 'homo_sapiens')
                - 'expand': bool (include transcripts)

        Returns:
            List of gene/variant/feature records as dicts.
        """
        filters = filters or {}
        search_type = filters.get("search_type", "auto")
        species = filters.get("species", self.default_species)

        # Auto-detect search type
        if search_type == "auto":
            if query.startswith("ENS"):
                search_type = "ens_id"
            elif ":" in query:
                search_type = "region"
            elif query.startswith("rs") or query.startswith("COSV"):
                search_type = "variant"
            else:
                search_type = "gene"

        try:
            if search_type == "gene":
                return await self._search_by_gene(query, species, filters)
            elif search_type == "ens_id":
                return await self._search_by_ens_id(query, species, filters)
            elif search_type == "region":
                return await self._search_by_region(query, species, filters)
            elif search_type == "variant":
                return await self._search_variant(query, species, filters)
            else:
                return await self._search_by_gene(query, species, filters)

        except httpx.HTTPError as e:
            logger.error(f"{self.name} HTTP error during search: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} search error: {e}")
            return []

    async def _search_by_gene(
        self, symbol: str, species: str, filters: Dict
    ) -> List[Dict]:
        """Search gene by symbol using lookup endpoint."""
        expand = filters.get("expand", False)
        url = f"{self.source_url}lookup/symbol/{species}/{symbol}"
        headers = {"Accept": "application/json"}
        params = {"expand": "1"} if expand else {}

        response = await self._throttled_request("GET", url, headers=headers, params=params)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        data = response.json()
        data["_query_symbol"] = symbol
        data["_species"] = species
        return [data]

    async def _search_by_ens_id(
        self, ens_id: str, species: str, filters: Dict
    ) -> List[Dict]:
        """Lookup Ensembl ID."""
        expand = filters.get("expand", False)
        url = f"{self.source_url}lookup/id/{ens_id}"
        headers = {"Accept": "application/json"}
        params = {"expand": "1"} if expand else {}

        response = await self._throttled_request("GET", url, headers=headers, params=params)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        data = response.json()
        data["_query_ens_id"] = ens_id
        data["_species"] = species
        return [data]

    async def _search_by_region(
        self, region: str, species: str, filters: Dict
    ) -> List[Dict]:
        """Search features overlapping a genomic region."""
        feature_type = filters.get("feature_type", "gene")
        url = f"{self.source_url}overlap/region/{species}/{region}"
        headers = {"Accept": "application/json"}
        params = {"feature": feature_type}

        response = await self._throttled_request("GET", url, headers=headers, params=params)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list):
            for item in data:
                item["_query_region"] = region
                item["_species"] = species
            return data
        return [data] if isinstance(data, dict) else []

    async def _search_variant(
        self, variant_id: str, species: str, filters: Dict
    ) -> List[Dict]:
        """Fetch variant data by rsID or Ensembl variant ID."""
        url = f"{self.source_url}variation/{species}/{variant_id}"
        headers = {"Accept": "application/json"}

        response = await self._throttled_request("GET", url, headers=headers)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        data = response.json()
        data["_query_variant"] = variant_id
        data["_species"] = species
        return [data]

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "gene"
    ) -> Dict:
        """
        Transform Ensembl data to canonical format.

        Parameters:
            raw_data: Raw dict from Ensembl API
            entity_type: Target canonical entity type

        Returns:
            Canonical-format dict.
        """
        object_type = raw_data.get("object_type", entity_type)
        species = raw_data.get("_species", raw_data.get("species", self.default_species))

        # Gene-level info
        gene_symbol = raw_data.get("display_name", raw_data.get("name", ""))
        ens_id = raw_data.get("id", "")
        chromosome = raw_data.get("seq_region_name", "")
        start = raw_data.get("start")
        end = raw_data.get("end")
        strand = raw_data.get("strand")

        # Position as start coordinate
        position = start

        # Transcript list
        transcripts = raw_data.get("Transcript", [])
        transcript_ids = [t.get("id", "") for t in transcripts if isinstance(t, dict)]

        # Description
        description = raw_data.get("description", "")

        # Biotype
        biotype = raw_data.get("biotype", "")

        # Source
        source = raw_data.get("source", "ensembl")

        # Assembly
        assembly = raw_data.get("assembly_name", "")

        # Version
        version = raw_data.get("version", None)

        # Logic type
        logic_name = raw_data.get("logic_name", "")

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": ens_id,
            "gene_symbol": gene_symbol,
            "variant_id": "",
            "chromosome": str(chromosome),
            "position": position,
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
            # Ensembl-specific extensions
            "ensembl": {
                "ensembl_id": ens_id,
                "object_type": object_type,
                "species": species,
                "biotype": biotype,
                "description": description,
                "source": source,
                "assembly": assembly,
                "version": version,
                "strand": strand,
                "start": start,
                "end": end,
                "transcript_ids": transcript_ids,
                "transcript_count": len(transcript_ids),
                "logic_name": logic_name,
                "is_reference": raw_data.get("is_reference", True),
                "db_type": raw_data.get("db_type", ""),
            },
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for Ensembl result."""
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.96,
            "research_only": False,
            "curation_level": "reference_genome_annotated",
            "assembly": result.get("assembly_name", ""),
            "species": result.get("species", self.default_species),
            "license": "CC0 1.0 Universal (for data)",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Calculate confidence scores for an Ensembl annotation.
        Reference genome annotations have high confidence.
        """
        # Reference genome quality
        is_ref = result.get("is_reference", True)
        ref_score = 0.98 if is_ref else 0.7

        # Has transcripts
        transcripts = result.get("Transcript", [])
        tx_score = 0.95 if transcripts else 0.5

        # Has HGNC symbol
        has_hgnc = 0.95 if result.get("display_name") else 0.6

        # Biotype confidence
        trusted_biotypes = {
            "protein_coding", "lncRNA", "miRNA", "snRNA", "snoRNA",
            "rRNA", "tRNA", "pseudogene",
        }
        biotype = result.get("biotype", "")
        biotype_score = 0.95 if biotype in trusted_biotypes else 0.75

        overall = round(
            (ref_score * 0.35 + tx_score * 0.25 + has_hgnc * 0.20 + biotype_score * 0.20),
            3,
        )

        return {
            "data_quality": ref_score,
            "evidence_strength": biotype_score,
            "sample_size": 0.9,
            "replication": 0.88,
            "consistency": 0.92,
            "temporal_relevance": 0.94,
            "population_match": 0.8,
            "overall": overall,
        }

    async def get_sequence(
        self, ens_id: str, seq_type: str = "cdna", species: str = "homo_sapiens"
    ) -> Optional[str]:
        """Fetch sequence for an Ensembl ID."""
        try:
            url = f"{self.source_url}sequence/id/{ens_id}"
            headers = {"Accept": "text/plain"}
            params = {"type": seq_type}
            response = await self._throttled_request("GET", url, headers=headers, params=params)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.text
        except Exception as e:
            logger.error(f"Error fetching sequence for {ens_id}: {e}")
            return None

    async def get_variants_in_region(
        self, region: str, species: str = "homo_sapiens", consequence: Optional[str] = None
    ) -> List[Dict]:
        """Fetch variants overlapping a genomic region."""
        try:
            url = f"{self.source_url}overlap/region/{species}/{region}"
            headers = {"Accept": "application/json"}
            params = {"feature": "variation"}
            if consequence:
                params["consequence_type"] = consequence
            response = await self._throttled_request("GET", url, headers=headers, params=params)
            if response.status_code == 404:
                return []
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching variants in {region}: {e}")
            return []

    async def get_xrefs(
        self, ens_id: str, species: str = "homo_sapiens"
    ) -> List[Dict]:
        """Fetch external references (xrefs) for an Ensembl ID."""
        try:
            url = f"{self.source_url}xrefs/id/{ens_id}"
            headers = {"Accept": "application/json"}
            response = await self._throttled_request("GET", url, headers=headers)
            if response.status_code == 404:
                return []
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching xrefs for {ens_id}: {e}")
            return []

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()
