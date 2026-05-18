"""
STRING Adapter - Protein-Protein Interaction Database
URL: https://string-db.org/api/
Source: STRING Consortium, fully open REST API
Data: 67M+ protein-protein interactions across 12,000+ species
Endpoints: /json/network, /json/interaction_partners, /json/enrichment
Confidence Tier: A (experimental + computational evidence)
"""

from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
import httpx
import logging
import asyncio
import time
from pathlib import Path

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


class StringAdapter(BaseAdapter):
    """
    Adapter for the STRING Protein-Protein Interaction Database.

    STRING provides 67M+ protein-protein interactions combining experimental data,
    computational predictions, and text mining across 12,000+ species.

    Key endpoints:
      - network: retrieve full interaction network for a set of proteins
      - interaction_partners: get interaction partners for a protein
      - enrichment: perform GO/KEGG enrichment analysis
      - version: get current database version

    Rate limit: ~1 request per second (recommended), batch queries supported
    """

    def __init__(self, cache_dir: Optional[str] = None):
        self.name = "string"
        self.display_name = "STRING Protein-Protein Interactions"
        self.source_url = "https://string-db.org/api/"
        self.version = "12.0"
        self.confidence_tier = "A"
        self.data_types = ["protein_interaction", "network", "functional_enrichment"]
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
        self._cache_dir = Path(cache_dir) if cache_dir else Path.home() / ".cache" / "deepsynaps" / "string"
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    async def _rate_limited_request(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        """Execute an HTTP request with rate limiting."""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        try:
            response = await self.client.get(url, params=params, timeout=30.0)
            self._last_request_time = time.time()
            return response
        except httpx.TimeoutException:
            logger.error(f"STRING request timed out: {url}")
            raise
        except httpx.HTTPError as e:
            logger.error(f"STRING HTTP error for {url}: {e}")
            raise

    async def validate_connection(self) -> bool:
        """Validate connection to STRING API by checking version endpoint."""
        try:
            response = await self._rate_limited_request(self.source_url + "json/version")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and "string_version" in data:
                    self.version = data.get("string_version", "12.0")
                    logger.info(f"STRING API connected. Version: {self.version}")
                    return True
                return True
            logger.warning(f"STRING API returned status {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"STRING connection validation failed: {e}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search STRING for protein interactions.

        Args:
            query: Protein name, gene symbol, or UniProt ID (e.g., 'TP53', 'BRCA1')
            filters: Optional dict with keys:
                - species: Taxon ID (default 9606 for human)
                - limit: Max number of interaction partners (default 10)
                - required_score: Minimum interaction score 0-1000 (default 400)
                - network_flavor: 'confidence' or 'evidence' (default 'confidence')
                - caller_identity: Identifier for the calling application

        Returns:
            List of dicts containing interaction data and protein details.
        """
        filters = filters or {}
        species = filters.get("species", 9606)  # Human default
        limit = filters.get("limit", 10)
        required_score = filters.get("required_score", 400)
        network_flavor = filters.get("network_flavor", "confidence")
        caller_identity = filters.get("caller_identity", "DeepSynaps-Protocol-Studio")

        results = []

        try:
            # Step 1: Get interaction partners for the query protein
            partners_url = self.source_url + "json/interaction_partners"
            params = {
                "identifiers": query,
                "species": species,
                "limit": limit,
                "required_score": required_score,
                "caller_identity": caller_identity,
            }

            response = await self._rate_limited_request(partners_url, params)
            if response.status_code != 200:
                logger.warning(f"STRING interaction_partners returned {response.status_code}")
                return results

            partners_data = response.json()
            if not isinstance(partners_data, list):
                logger.warning(f"STRING unexpected response format: {type(partners_data)}")
                return results

            # Step 2: Build network information
            network_url = self.source_url + "json/network"
            network_params = {
                "identifiers": query,
                "species": species,
                "required_score": required_score,
                "network_flavor": network_flavor,
                "caller_identity": caller_identity,
            }

            network_response = await self._rate_limited_request(network_url, network_params)
            network_data = {}
            if network_response.status_code == 200:
                network_data = network_response.json()

            # Step 3: Enrichment data (optional)
            enrichment_url = self.source_url + "json/enrichment"
            enrichment_params = {
                "identifiers": query,
                "species": species,
                "caller_identity": caller_identity,
            }

            enrichment_response = await self._rate_limited_request(enrichment_url, enrichment_params)
            enrichment_data = []
            if enrichment_response.status_code == 200:
                enrichment_data = enrichment_response.json()
                if not isinstance(enrichment_data, list):
                    enrichment_data = []

            # Combine results
            combined = {
                "query_protein": query,
                "species": species,
                "species_name": self._get_species_name(species),
                "interaction_partners": partners_data,
                "network": network_data,
                "enrichment": enrichment_data,
                "search_metadata": {
                    "required_score": required_score,
                    "limit": limit,
                    "network_flavor": network_flavor,
                    "total_interactions": len(partners_data),
                    "total_enrichment_terms": len(enrichment_data),
                },
            }
            results.append(combined)

            logger.info(
                f"STRING search '{query}' found {len(partners_data)} interactions, "
                f"{len(enrichment_data)} enrichment terms"
            )

        except httpx.HTTPError as e:
            logger.error(f"STRING HTTP error during search: {e}")
        except Exception as e:
            logger.error(f"STRING search error: {e}")

        return results

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "protein_interaction") -> Dict:
        """
        Transform STRING raw data to BiomarkerReading (network) canonical format.

        Args:
            raw_data: Raw data dict from search()
            entity_type: Type of entity (default 'protein_interaction')

        Returns:
            Canonical-format dict compatible with BiomarkerReading schema.
        """
        query_protein = raw_data.get("query_protein", "")
        species = raw_data.get("species", 9606)
        partners = raw_data.get("interaction_partners", [])
        network = raw_data.get("network", {})
        enrichment = raw_data.get("enrichment", [])
        metadata = raw_data.get("search_metadata", {})

        # Extract network nodes and edges
        nodes = []
        edges = []

        if isinstance(network, dict):
            for node in network.get("nodes", []):
                nodes.append({
                    "id": node.get("stringId", node.get("name", "")),
                    "name": node.get("name", ""),
                    "string_id": node.get("stringId", ""),
                    "taxon": node.get("taxid", species),
                })
            for edge in network.get("edges", []):
                edges.append({
                    "source": edge.get("from", ""),
                    "target": edge.get("to", ""),
                    "score": edge.get("score", 0),
                })

        # Build interaction summaries
        interactions = []
        for partner in partners:
            if isinstance(partner, dict):
                interactions.append({
                    "protein_a": partner.get("preferredName_A", ""),
                    "protein_b": partner.get("preferredName_B", ""),
                    "string_id_a": partner.get("stringId_A", ""),
                    "string_id_b": partner.get("stringId_B", ""),
                    "combined_score": partner.get("score", 0),
                    "nscore": partner.get("nscore", 0),      # Neighborhood
                    "fscore": partner.get("fscore", 0),      # Fusion
                    "pscore": partner.get("pscore", 0),      # Co-occurrence
                    "ascore": partner.get("ascore", 0),      # Co-expression
                    "escore": partner.get("escore", 0),      # Experimental
                    "dscore": partner.get("dscore", 0),      # Database
                    "tscore": partner.get("tscore", 0),      # Textmining
                })

        # Top enrichment terms
        top_enrichment = []
        for term in enrichment[:10]:
            if isinstance(term, dict):
                top_enrichment.append({
                    "term": term.get("term", ""),
                    "category": term.get("category", ""),
                    "description": term.get("description", ""),
                    "fdr": term.get("fdr", 1.0),
                })

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": query_protein,
            "region_name": query_protein,
            "coordinates": {},
            "network": {
                "query_protein": query_protein,
                "species": species,
                "species_name": self._get_species_name(species),
                "total_interactions": metadata.get("total_interactions", len(partners)),
                "required_score_threshold": metadata.get("required_score", 400),
                "network_flavor": metadata.get("network_flavor", "confidence"),
                "nodes": nodes,
                "edges": edges,
                "interactions": interactions,
                "top_enrichment_terms": top_enrichment,
                "evidence_channels": {
                    "neighborhood": True,
                    "gene_fusion": True,
                    "phylogenetic_cooccurrence": True,
                    "coexpression": True,
                    "experimental": True,
                    "database": True,
                    "textmining": True,
                },
            },
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for STRING data."""
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.92,
            "research_only": False,
            "citation": (
                "Szklarczyk D, et al. STRING v12: protein-protein "
                "interaction networks with enhanced coverage, supporting "
                "functional discovery in genome-wide experimental datasets. "
                "Nucleic Acids Res. 2023;51(D1):D638-D646."
            ),
            "evidence_types": [
                "experimental", "database", "textmining", "coexpression",
                "neighborhood", "fusion", "cooccurrence",
            ],
            "update_frequency": "quarterly",
            "license": "Creative Commons BY 4.0 / Academic Free License",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Calculate confidence score for STRING interaction data.

        Scores consider: multi-channel evidence, experimental validation,
        database curation quality, and text mining reliability.
        """
        partners = result.get("interaction_partners", []) if isinstance(result, dict) else []
        if not isinstance(partners, list):
            partners = []

        avg_score = 0.0
        if partners:
            scores = [
                p.get("score", 0) for p in partners
                if isinstance(p, dict)
            ]
            if scores:
                avg_score = sum(scores) / len(scores) / 1000.0  # Normalize to 0-1

        has_experimental = any(
            isinstance(p, dict) and p.get("escore", 0) > 0
            for p in partners
        )
        has_database = any(
            isinstance(p, dict) and p.get("dscore", 0) > 0
            for p in partners
        )

        evidence_strength = 0.85 if has_experimental else (0.7 if has_database else 0.5)
        replication = 0.9 if (has_experimental and has_database) else 0.7

        return {
            "data_quality": 0.92,
            "evidence_strength": evidence_strength,
            "sample_size": min(0.95, 0.7 + avg_score * 0.3),
            "replication": replication,
            "consistency": 0.88,
            "temporal_relevance": 0.92,
            "population_match": 0.85,
            "overall": round((0.92 + evidence_strength + min(0.95, 0.7 + avg_score * 0.3) + replication + 0.88 + 0.92 + 0.85) / 7, 3),
        }

    @staticmethod
    def _get_species_name(taxon_id: int) -> str:
        """Map common NCBI taxon IDs to species names."""
        mapping = {
            9606: "Homo sapiens",
            10090: "Mus musculus",
            10116: "Rattus norvegicus",
            7227: "Drosophila melanogaster",
            6239: "Caenorhabditis elegans",
            4932: "Saccharomyces cerevisiae",
            7955: "Danio rerio",
            3702: "Arabidopsis thaliana",
        }
        return mapping.get(taxon_id, f"taxon:{taxon_id}")

    async def close(self):
        """Close the HTTP client and release resources."""
        await self.client.aclose()
        logger.info("STRING adapter closed")

    # Convenience methods for common operations

    async def get_network_image(self, identifiers: List[str], species: int = 9606, required_score: int = 400) -> Optional[bytes]:
        """
        Retrieve a PNG network image for a set of protein identifiers.

        Args:
            identifiers: List of protein/gene identifiers
            species: NCBI taxon ID
            required_score: Minimum interaction score

        Returns:
            PNG image bytes or None on failure
        """
        url = self.source_url + "image/network"
        params = {
            "identifiers": "\r".join(identifiers),
            "species": species,
            "required_score": required_score,
            "network_flavor": "confidence",
        }
        try:
            response = await self._rate_limited_request(url, params)
            if response.status_code == 200:
                return response.content
        except Exception as e:
            logger.error(f"Failed to retrieve network image: {e}")
        return None

    async def get_protein_info(self, protein_id: str, species: int = 9606) -> Optional[Dict]:
        """
        Get detailed protein annotation from STRING.

        Args:
            protein_id: STRING protein identifier or gene name
            species: NCBI taxon ID

        Returns:
            Dict with protein details or None
        """
        url = self.source_url + "json/get_string_ids"
        params = {
            "identifiers": protein_id,
            "species": species,
        }
        try:
            response = await self._rate_limited_request(url, params)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and data:
                    return data[0]
        except Exception as e:
            logger.error(f"Failed to get protein info for {protein_id}: {e}")
        return None
