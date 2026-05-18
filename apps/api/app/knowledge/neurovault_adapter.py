"""
NeuroVault Adapter - Neuroimaging Statistical Maps Repository

Adapter for NeuroVault (https://neurovault.org/), a user-driven repository for
sharing unthresholded statistical brain maps, parcellations, and atlases.
- 200,000+ statistical maps from fMRI, PET, VBM, and other modalities
- Open REST API with no authentication required
- Supports search by cognitive paradigm, map type, and collection

Every adapter MUST:
1. Import: from app.knowledge.base_adapter import BaseAdapter
2. Class name: {Database}Adapter
3. __init__: Set all metadata fields
4. validate_connection(): Test API with simple query
5. search(): Search external DB, return raw results
6. transform_to_canonical(): Map to CanonicalClinicalRecord
7. get_provenance(): Return source, version, retrieval time, confidence tier
8. get_confidence_score(): Return 7D dict
9. close(): Clean up connections
"""

from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
import httpx
import logging

try:
    from app.knowledge.base_adapter import BaseAdapter
except ImportError:
    BaseAdapter = object

logger = logging.getLogger(__name__)


class NeurovaultAdapter(BaseAdapter):
    """Adapter for the NeuroVault neuroimaging statistical maps repository."""

    def __init__(self):
        self.name = "neurovault"
        self.display_name = "NeuroVault"
        self.source_url = "https://neurovault.org/api/"
        self.version = "2024.1"
        self.confidence_tier = "B"
        self.data_types = ["neuroimaging", "statistical_map", "atlas", "parcellation"]
        self.rate_limit_per_minute = 100
        self.requires_auth = False
        self.auth_type = "none"
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={"User-Agent": "DeepSynaps-Protocol-Studio/1.0"},
        )
        self._last_request_time = None

    async def validate_connection(self) -> bool:
        """Test connectivity by fetching the atlases endpoint."""
        try:
            response = await self.client.get(
                self.source_url + "atlases/", timeout=10.0
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"{self.name} connection validation failed: {e}")
            return False

    async def search(
        self, query: str, filters: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search NeuroVault for images, collections, or atlases.

        Args:
            query: Search term (cognitive paradigm, contrast name, etc.)
            filters: Optional dict with keys:
                - 'search_type': 'images' | 'collections' | 'atlases'
                - 'modality': 'fMRI-BOLD' | 'VBM' | 'PET' | etc.
                - 'map_type': 'Z' | 'T' | 'F' | 'beta' | 'V' | 'P' | 'IP' | 'M' | 'other'
                - 'collection_id': filter images by collection
                - 'limit': max results to return (default 50)

        Returns:
            List of raw result dictionaries from NeuroVault API.
        """
        filters = filters or {}
        search_type = filters.get("search_type", "images")
        limit = filters.get("limit", 50)

        try:
            results: List[Dict] = []

            if search_type == "images":
                params = {"limit": limit}
                if filters.get("modality"):
                    params["modality"] = filters["modality"]
                if filters.get("map_type"):
                    params["map_type"] = filters["map_type"]
                if filters.get("collection_id"):
                    params["collection"] = filters["collection_id"]

                response = await self.client.get(
                    self.source_url + "images/", params=params, timeout=20.0
                )
                response.raise_for_status()
                data = response.json()
                raw_results = data.get("results", data) if isinstance(data, dict) else data
                results = self._filter_by_query(raw_results, query, ["name", "cognitive_contrast_cogpo", "cognitive_paradigm_cogatlas"])

            elif search_type == "collections":
                response = await self.client.get(
                    self.source_url + "collections/", timeout=20.0
                )
                response.raise_for_status()
                data = response.json()
                raw_results = data.get("results", data) if isinstance(data, dict) else data
                results = self._filter_by_query(raw_results, query, ["name", "description"])

            elif search_type == "atlases":
                response = await self.client.get(
                    self.source_url + "atlases/", timeout=20.0
                )
                response.raise_for_status()
                data = response.json()
                raw_results = data.get("results", data) if isinstance(data, dict) else data
                results = self._filter_by_query(raw_results, query, ["name", "description"])

            logger.info(
                f"{self.name} search for '{query}' returned {len(results)} "
                f"{search_type} results"
            )
            return results[:limit]

        except httpx.HTTPError as e:
            logger.error(f"{self.name} HTTP error during search: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} unexpected error during search: {e}")
            return []

    def _filter_by_query(
        self, items: List[Dict], query: str, fields: List[str]
    ) -> List[Dict]:
        """Filter API results by query string across specified fields."""
        if not query or query.strip() == "*":
            return items
        query_lower = query.lower()
        filtered = []
        for item in items:
            for field in fields:
                value = item.get(field, "")
                if value and query_lower in str(value).lower():
                    filtered.append(item)
                    break
        return filtered

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "statistical_map"
    ) -> Dict:
        """
        Map a NeuroVault raw record to the canonical clinical record format.

        Args:
            raw_data: A single raw result dict from NeuroVault API.
            entity_type: The type of entity to map.

        Returns:
            Canonical clinical record dict.
        """
        map_type = raw_data.get("map_type", "")
        modality = raw_data.get("modality", "")
        analysis_level = raw_data.get("analysis_level", "")
        number_of_subjects = raw_data.get("number_of_subjects", 0)

        spatial_info = {
            "mni_space": raw_data.get("not_mni", False) is False,
            "voxel_size": None,
            "image_width": raw_data.get("image_width"),
            "image_height": raw_data.get("image_height"),
        }

        cognitive_info = {
            "paradigm": raw_data.get("cognitive_paradigm_cogatlas", ""),
            "contrast": raw_data.get("cognitive_contrast_cogpo", ""),
        }

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": str(raw_data.get("id", "")),
            "source_url": raw_data.get("url", "") or raw_data.get("file", ""),
            "name": raw_data.get("name", ""),
            "description": raw_data.get("description", ""),
            "modality": modality,
            "map_type": map_type,
            "analysis_level": analysis_level,
            "value": {
                "map_type": map_type,
                "modality": modality,
                "number_of_subjects": number_of_subjects,
                "spatial_info": spatial_info,
                "cognitive_info": cognitive_info,
                "collection_id": raw_data.get("collection_id"),
            },
            "unit": "statistical_map",
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for a NeuroVault record."""
        return {
            "source_database": self.name,
            "source_display_name": self.display_name,
            "source_version": self.version,
            "source_url": result.get("url", self.source_url),
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.65,
            "is_user_contributed": True,
            "peer_reviewed": False,
            "research_only": False,
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute 7D confidence score for a NeuroVault record.

        User-uploaded data quality varies. Scores are adjusted based on
        map type specificity, subject count, and MNI space conformity.
        """
        subjects = result.get("number_of_subjects", 0) or 0

        sample_size_score = min(1.0, subjects / 200.0) if subjects > 0 else 0.3

        not_mni = result.get("not_mni", False)
        data_quality = 0.7 if not not_mni else 0.4

        map_type = result.get("map_type", "")
        evidence_strength = 0.75 if map_type in ("Z", "T") else 0.55

        analysis_level = result.get("analysis_level", "")
        consistency = 0.8 if analysis_level == "G" else 0.6

        collection_id = result.get("collection_id")
        replication = 0.7 if collection_id else 0.4

        return {
            "data_quality": round(data_quality, 2),
            "evidence_strength": round(evidence_strength, 2),
            "sample_size": round(sample_size_score, 2),
            "replication": round(replication, 2),
            "consistency": round(consistency, 2),
            "temporal_relevance": 0.75,
            "population_match": 0.7,
            "overall": round(
                (
                    data_quality
                    + evidence_strength
                    + sample_size_score
                    + replication
                    + consistency
                    + 0.75
                    + 0.7
                )
                / 7.0,
                2,
            ),
        }

    async def close(self):
        """Close the HTTP client and clean up resources."""
        await self.client.aclose()
        logger.info(f"{self.name} adapter closed")
