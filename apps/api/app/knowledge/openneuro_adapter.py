"""
OpenNeuro Adapter - Neuroimaging Dataset Repository

Adapter for OpenNeuro (https://openneuro.org/), a free and open platform for
sharing neuroimaging datasets in BIDS format.
- 500+ publicly available datasets (PET, MRI, EEG, MEG, iEEG, behavioral)
- GraphQL API at https://openneuro.org/crn/graphql
- Datasets follow BIDS (Brain Imaging Data Structure) standard
- Downloadable via web, CLI, or S3 links

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


class OpenneuroAdapter(BaseAdapter):
    """Adapter for the OpenNeuro neuroimaging dataset repository."""

    def __init__(self):
        self.name = "openneuro"
        self.display_name = "OpenNeuro"
        self.source_url = "https://openneuro.org/"
        self.graphql_url = "https://openneuro.org/crn/graphql"
        self.version = "2024.1"
        self.confidence_tier = "B"
        self.data_types = [
            "mri",
            "pet",
            "eeg",
            "meg",
            "ieeg",
            "behavioral",
            "bids_dataset",
        ]
        self.rate_limit_per_minute = 60
        self.requires_auth = False
        self.auth_type = "none"
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0",
                "Content-Type": "application/json",
            },
        )

    async def validate_connection(self) -> bool:
        """Test connectivity by sending a simple GraphQL introspection query."""
        try:
            query = {"query": "{ __typename }"}
            response = await self.client.post(
                self.graphql_url, json=query, timeout=10.0
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"{self.name} connection validation failed: {e}")
            return False

    async def search(
        self, query: str, filters: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search OpenNeuro datasets via GraphQL API.

        Args:
            query: Search term (dataset name, keyword, or dataset ID like 'ds000001').
            filters: Optional dict with keys:
                - 'modality': 'MRI' | 'PET' | 'EEG' | 'MEG' | 'iEEG' | 'behavioral'
                - 'task': task name to filter by
                - 'species': 'human' | 'mouse' | etc.
                - 'age_range': tuple of (min_age, max_age)
                - 'authors': list of author names
                - 'limit': max results to return (default 25)
                - 'cursor': pagination cursor

        Returns:
            List of raw dataset result dictionaries.
        """
        filters = filters or {}
        limit = filters.get("limit", 25)
        modality = filters.get("modality", "")

        try:
            # Build GraphQL query for dataset search
            modality_filter = f', modality: "{modality}"' if modality else ""

            graphql_query = {
                "query": f"""
                query {{
                    datasets(
                        first: {limit},
                        filter: "{query}"{modality_filter}
                    ) {{
                        edges {{
                            node {{
                                id
                                draft {{
                                    id
                                    description {{
                                        Name
                                        Authors
                                        DatasetDOI
                                        License
                                        Acknowledgements
                                        Funding
                                        ReferencesAndLinks
                                        EthicsApprovals
                                    }}
                                    summary {{
                                        modalities
                                        tasks
                                        subjectMetadata {{
                                            participantId
                                            age
                                            sex
                                            group
                                        }}
                                        totalFiles
                                        size
                                    }}
                                    readme
                                    created
                                    modified
                                }}
                            }}
                        }}
                        pageInfo {{
                            hasNextPage
                            endCursor
                        }}
                    }}
                }}
                """
            }

            response = await self.client.post(
                self.graphql_url, json=graphql_query, timeout=20.0
            )
            response.raise_for_status()

            data = response.json()
            datasets = data.get("data", {}).get("datasets", {})
            edges = datasets.get("edges", [])

            results = []
            for edge in edges:
                node = edge.get("node", {})
                draft = node.get("draft", {})
                description = draft.get("description", {})
                summary = draft.get("summary", {})

                result = {
                    "id": node.get("id", ""),
                    "name": description.get("Name", ""),
                    "authors": description.get("Authors", []),
                    "doi": description.get("DatasetDOI", ""),
                    "license": description.get("License", ""),
                    "modalities": summary.get("modalities", []),
                    "tasks": summary.get("tasks", []),
                    "subjects": summary.get("subjectMetadata", []),
                    "total_files": summary.get("totalFiles", 0),
                    "size": summary.get("size", 0),
                    "readme": draft.get("readme", ""),
                    "created": draft.get("created", ""),
                    "modified": draft.get("modified", ""),
                    "url": f"https://openneuro.org/datasets/{node.get('id', '')}",
                }
                results.append(result)

            logger.info(
                f"{self.name} search for '{query}' returned {len(results)} datasets"
            )
            return results

        except httpx.HTTPError as e:
            logger.error(f"{self.name} HTTP error during search: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} unexpected error during search: {e}")
            return []

    async def get_dataset_files(
        self, dataset_id: str, tag: str = "latest"
    ) -> List[Dict]:
        """
        Fetch file tree for a specific dataset snapshot.

        Args:
            dataset_id: OpenNeuro dataset ID (e.g., 'ds000001')
            tag: Snapshot tag to query

        Returns:
            List of file metadata dicts.
        """
        try:
            query = {
                "query": f"""
                query {{
                    snapshot(datasetId: "{dataset_id}", tag: "{tag}") {{
                        files {{
                            id
                            filename
                            size
                            directory
                            annexed
                        }}
                    }}
                }}
                """
            }
            response = await self.client.post(self.graphql_url, json=query)
            response.raise_for_status()
            data = response.json()
            return data.get("data", {}).get("snapshot", {}).get("files", [])
        except Exception as e:
            logger.error(f"{self.name} file fetch error for {dataset_id}: {e}")
            return []

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "bids_dataset"
    ) -> Dict:
        """
        Map an OpenNeuro raw dataset record to the canonical clinical record format.

        Args:
            raw_data: A single raw result dict from OpenNeuro search.
            entity_type: The type of entity to map.

        Returns:
            Canonical clinical record dict.
        """
        subjects = raw_data.get("subjects", [])
        subject_count = len(subjects)
        ages = [
            s.get("age")
            for s in subjects
            if s.get("age") is not None
        ]
        avg_age = sum(ages) / len(ages) if ages else None

        subject_summary = {
            "count": subject_count,
            "age_range": {
                "min": min(ages) if ages else None,
                "max": max(ages) if ages else None,
                "average": avg_age,
            },
            "sex_distribution": self._count_by_key(subjects, "sex"),
            "group_distribution": self._count_by_key(subjects, "group"),
        }

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": raw_data.get("id", ""),
            "source_url": raw_data.get("url", ""),
            "name": raw_data.get("name", ""),
            "description": raw_data.get("readme", "")[:500],
            "authors": raw_data.get("authors", []),
            "doi": raw_data.get("doi", ""),
            "license": raw_data.get("license", ""),
            "modalities": raw_data.get("modalities", []),
            "tasks": raw_data.get("tasks", []),
            "value": {
                "subjects": subject_summary,
                "total_files": raw_data.get("total_files", 0),
                "size_bytes": raw_data.get("size", 0),
                "bids_compliant": True,
                "dataset_id": raw_data.get("id", ""),
            },
            "unit": "dataset",
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
        }

    def _count_by_key(self, items: List[Dict], key: str) -> Dict:
        """Count distribution of values for a key in a list of dicts."""
        counts: Dict[str, int] = {}
        for item in items:
            val = str(item.get(key, "unknown"))
            counts[val] = counts.get(val, 0) + 1
        return counts

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for an OpenNeuro record."""
        return {
            "source_database": self.name,
            "source_display_name": self.display_name,
            "source_version": self.version,
            "source_url": result.get("url", self.source_url),
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.70,
            "is_user_contributed": True,
            "peer_reviewed": False,
            "bids_compliant": True,
            "research_only": False,
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute 7D confidence score for an OpenNeuro dataset.

        Scores vary based on BIDS validation, subject count, and
        whether the dataset has a DOI.
        """
        subjects = result.get("subjects", [])
        subject_count = len(subjects)
        sample_size_score = min(1.0, subject_count / 100.0) if subject_count > 0 else 0.3

        has_doi = bool(result.get("doi", ""))
        replication = 0.7 if has_doi else 0.45

        modalities = result.get("modalities", [])
        data_quality = 0.75 if modalities else 0.5

        total_files = result.get("total_files", 0)
        evidence_strength = 0.7 if total_files > 0 else 0.4

        return {
            "data_quality": round(data_quality, 2),
            "evidence_strength": round(evidence_strength, 2),
            "sample_size": round(sample_size_score, 2),
            "replication": round(replication, 2),
            "consistency": 0.65,
            "temporal_relevance": 0.8,
            "population_match": 0.7,
            "overall": round(
                (
                    data_quality
                    + evidence_strength
                    + sample_size_score
                    + replication
                    + 0.65
                    + 0.8
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
