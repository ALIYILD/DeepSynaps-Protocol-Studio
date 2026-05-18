"""
SNOMED CT Adapter — P0 Terminology Database

Academic/research free via UMLS or NHS.
350,000+ clinical concepts.
Endpoints: Snowstorm API /browser/{edition}/concepts
Search: term, concept ID, ECL expressions
Rate limit: Varies by endpoint
Confidence tier: A (international standard)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

try:
    from app.services.knowledge.base_adapter import (
        DatabaseAdapter,
        ProvenanceRecord,
        LicenseMetadata,
        ConfidenceTier,
        EvidenceLevel,
    )
except ImportError:  # pragma: no cover
    from abc import ABC, abstractmethod
    from dataclasses import dataclass, field
    from enum import Enum

    class ConfidenceTier(str, Enum):
        CRITICAL = "critical"; HIGH = "high"; MEDIUM = "medium"
        LOW = "low"; UNKNOWN = "unknown"; RESEARCH = "research"

    class EvidenceLevel(str, Enum):
        SYSTEMATIC_REVIEW = "SYSTEMATIC_REVIEW"; RCT = "RCT"
        COHORT_STUDY = "COHORT_STUDY"; CASE_CONTROL = "CASE_CONTROL"
        CASE_SERIES = "CASE_SERIES"; EXPERT_OPINION = "EXPERT_OPINION"
        PRECLINICAL = "PRECLINICAL"; ANECDOTAL = "ANECDOTAL"
        PILOT_EXPERT = "PILOT_EXPERT"

    @dataclass
    class ProvenanceRecord:
        source_database: str = ""
        source_version: str = ""
        source_record_id: str = ""
        ingestion_timestamp: datetime = field(default_factory=datetime.utcnow)
        license_type: str = "UNKNOWN"
        confidence_tier: ConfidenceTier = ConfidenceTier.UNKNOWN
        evidence_level: EvidenceLevel = EvidenceLevel.ANECDOTAL
        citation_doi: Optional[str] = None
        attribution_text: Optional[str] = None
        research_only: bool = False
        retrieval_method: str = "direct"
        data_quality_score: float = 0.0

        def to_dict(self) -> Dict[str, Any]:
            return {
                "source_database": self.source_database,
                "source_version": self.source_version,
                "source_record_id": self.source_record_id,
                "ingestion_timestamp": self.ingestion_timestamp.isoformat(),
                "license_type": self.license_type,
                "confidence_tier": self.confidence_tier.value,
                "evidence_level": self.evidence_level.value,
                "citation_doi": self.citation_doi,
                "attribution_text": self.attribution_text,
                "research_only": self.research_only,
                "retrieval_method": self.retrieval_method,
                "data_quality_score": self.data_quality_score,
            }

    @dataclass
    class LicenseMetadata:
        license_type: str = "UNKNOWN"
        license_url: Optional[str] = None
        attribution_text: str = ""
        commercial_use_allowed: bool = False
        allows_research: bool = True
        allows_commercial: bool = False
        requires_attribution: bool = True
        requires_share_alike: bool = False
        share_alike: bool = False
        modification_allowed: bool = False
        redistribution_allowed: bool = False
        restrictions: List[str] = field(default_factory=list)

    class DatabaseAdapter(ABC):
        @abstractmethod
        def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord: ...
        @abstractmethod
        def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier: ...
        @abstractmethod
        def get_license(self) -> LicenseMetadata: ...


class SNOMEDCTAdapter(DatabaseAdapter):
    """Adapter for SNOMED CT — the most comprehensive clinical terminology.

    SNOMED CT (Systematized Nomenclature of Medicine — Clinical Terms) is a
    systematically organized computer-processable collection of medical terms
    covering most areas of clinical information such as diseases, findings,
    etiologies, and procedures.

    This adapter supports multiple backend endpoints:
    - Snowstorm (public IHTSDO browser API)
    - NHS Ontology Server (for UK users)
    - UMLS (for US academic users with UTS account)
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        config = config or {}
        self.name = "snomedct"
        self.display_name = "SNOMED CT"
        self.source_url = "https://browser.ihtsdotools.org/"
        self.api_base = config.get("api_base", "https://browser.ihtsdotools.org/snowstorm/snomed-ct/")
        self.version = "SNOMED CT International Edition 2024-01"
        self.edition = config.get("edition", "SNOMEDCT-US")
        self.branch = config.get("branch", "MAIN/2024-01-01")
        self.confidence_tier = "A"
        self.data_types = ["clinical_concept", "finding", "procedure", "disorder", "substance", "body_structure"]
        self.rate_limit_per_minute = 300  # varies
        self.requires_auth = config.get("requires_auth", False)
        self.auth_type = config.get("auth_type", "none")  # "none" | "basic" | "uts"
        self.umls_api_key: Optional[str] = config.get("umls_api_key", None)
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={"User-Agent": "DeepSynaps-Protocol-Studio/1.0"},
        )
        self._connected = False
        self._last_fetch_time: Optional[datetime] = None
        self._cache: Dict[str, Any] = {}

    @property
    def source_name(self) -> str:
        return self.display_name

    @property
    def source_version(self) -> str:
        return self.version

    async def connect(self) -> bool:
        """Validate connectivity via Snowstorm branches endpoint."""
        try:
            resp = await self.client.get(
                f"{self.api_base}branches", timeout=15.0
            )
            self._connected = resp.status_code == 200
            return self._connected
        except Exception as e:
            logger.error(f"{self.name} connection failed: {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        await self.client.aclose()
        self._connected = False

    async def health_check(self) -> Dict[str, Any]:
        return {
            "source": self.name,
            "connected": self._connected,
            "version": self.version,
            "edition": self.edition,
            "branch": self.branch,
            "requires_auth": self.requires_auth,
            "checked_at": datetime.utcnow().isoformat(),
        }

    async def validate_connection(self) -> bool:
        return await self.connect()

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        filters = query if isinstance(query, dict) else {"q": query}
        return await self.search(filters.get("q", ""), filters=filters)

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """Search SNOMED CT by term, concept ID, or ECL expression.

        Args:
            query: Search string — clinical term, SCTID, or ECL expression.
            filters: Optional dict with keys:
                - search_type: "term" | "concept_id" | "ecl"
                - semantic_tag: str — filter by category (disorder, finding, etc.)
                - active_only: bool (default True)
                - include_descriptions: bool
                - include_parents: bool
                - include_children: bool
                - limit: int (default 10)
                - offset: int (default 0)
        """
        filters = filters or {}
        search_type = filters.get("search_type", "term")
        limit = filters.get("limit", 10)
        offset = filters.get("offset", 0)

        try:
            if search_type == "term":
                results = await self._search_by_term(query, limit, offset, filters)
            elif search_type == "concept_id":
                results = await self._search_by_concept_id(query, filters)
            elif search_type == "ecl":
                results = await self._search_by_ecl(query, limit, offset, filters)
            else:
                results = await self._search_by_term(query, limit, offset, filters)
            self._last_fetch_time = datetime.utcnow()
            return results
        except httpx.HTTPStatusError as e:
            logger.error(f"{self.name} HTTP {e.response.status_code}: {e}")
            return []
        except httpx.RequestError as e:
            logger.error(f"{self.name} request error: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} unexpected error: {e}")
            return []

    async def _search_by_term(
        self, query: str, limit: int, offset: int, filters: Dict
    ) -> List[Dict]:
        """Search SNOMED CT concepts by term using the browser descriptions endpoint."""
        results: List[Dict] = []
        params: Dict[str, Any] = {
            "term": query,
            "limit": limit,
            "offset": offset,
            "active": str(filters.get("active_only", True)).lower(),
            "language": "en",
        }
        semantic_tag = filters.get("semantic_tag")
        if semantic_tag:
            params["semanticTags"] = semantic_tag

        url = f"{self.api_base}{self.edition}/concepts"
        resp = await self.client.get(url, params=params, timeout=30.0)

        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", []) if isinstance(data, dict) else data
            for item in items[:limit]:
                item["_snomed_search_type"] = "term"
                if filters.get("include_descriptions", False):
                    desc = await self._fetch_descriptions(item.get("conceptId", ""))
                    item["descriptions"] = desc
                if filters.get("include_parents", False):
                    parents = await self._fetch_parents(item.get("conceptId", ""))
                    item["parents"] = parents
                if filters.get("include_children", False):
                    children = await self._fetch_children(item.get("conceptId", ""))
                    item["children"] = children
                results.append(item)
        elif resp.status_code == 404:
            logger.info(f"{self.name}: No results for term '{query}'")
        else:
            logger.warning(f"{self.name}: Status {resp.status_code} for term search")
        return results

    async def _search_by_concept_id(
        self, concept_id: str, filters: Dict
    ) -> List[Dict]:
        """Fetch a specific concept by its SCTID."""
        results: List[Dict] = []
        url = f"{self.api_base}{self.edition}/concepts/{concept_id}"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            concept = resp.json()
            concept["_snomed_search_type"] = "concept_id"
            if filters.get("include_descriptions", False):
                concept["descriptions"] = await self._fetch_descriptions(concept_id)
            if filters.get("include_parents", False):
                concept["parents"] = await self._fetch_parents(concept_id)
            results.append(concept)
        return results

    async def _search_by_ecl(
        self, ecl: str, limit: int, offset: int, filters: Dict
    ) -> List[Dict]:
        """Search using ECL (Expression Constraint Language) expression.

        ECL examples:
        - < 404684003 |Clinical finding|  — descendants of Clinical finding
        - * : 116680003 = 156009 |Neck|  — find all concepts with "Neck" as finding site
        """
        results: List[Dict] = []
        params: Dict[str, Any] = {
            "ecl": ecl,
            "limit": min(limit, 50),
            "offset": offset,
        }
        url = f"{self.api_base}{self.edition}/concepts"
        resp = await self.client.get(url, params=params, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", []) if isinstance(data, dict) else data
            for item in items[:limit]:
                item["_snomed_search_type"] = "ecl"
                item["_ecl_expression"] = ecl
                results.append(item)
        return results

    async def _fetch_descriptions(self, concept_id: str) -> List[Dict]:
        """Fetch all descriptions for a concept."""
        if not concept_id:
            return []
        url = f"{self.api_base}{self.edition}/concepts/{concept_id}/descriptions"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("items", []) if isinstance(data, dict) else data
        return []

    async def _fetch_parents(self, concept_id: str) -> List[Dict]:
        """Fetch parent concepts."""
        if not concept_id:
            return []
        url = f"{self.api_base}{self.edition}/concepts/{concept_id}/parents"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            return data if isinstance(data, list) else data.get("items", [])
        return []

    async def _fetch_children(self, concept_id: str) -> List[Dict]:
        """Fetch child concepts."""
        if not concept_id:
            return []
        url = f"{self.api_base}{self.edition}/concepts/{concept_id}/children"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            return data if isinstance(data, list) else data.get("items", [])
        return []

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [self.transform_to_canonical(r) for r in raw]

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        valid = []
        for r in records:
            if r.get("conceptId") or r.get("concept_id"):
                valid.append(r)
            else:
                logger.debug(f"{self.name}: Dropped invalid record — missing conceptId")
        return valid

    def transform_to_canonical(
        self, raw_data: Dict[str, Any], entity_type: str = "clinical_concept"
    ) -> Dict[str, Any]:
        """Convert a raw SNOMED CT concept to the canonical cross-DB schema."""
        concept_id = raw_data.get("conceptId") or raw_data.get("concept_id", "")
        active = raw_data.get("active", True)

        # Determine semantic tag from FSN
        fsn = raw_data.get("fsn", {}).get("term", "") if isinstance(raw_data.get("fsn"), dict) else raw_data.get("fsn", "")
        semantic_tag = ""
        if fsn and "(" in fsn and fsn.endswith(")"):
            semantic_tag = fsn[fsn.rfind("(") + 1 : -1]

        # Determine preferred term
        pt = raw_data.get("pt", {})
        preferred_term = pt.get("term", "") if isinstance(pt, dict) else ""
        if not preferred_term:
            preferred_term = raw_data.get("preferredTerm", "")
        if not preferred_term:
            preferred_term = raw_data.get("defaultTerm", "")

        # Extract definition status
        definition_status = raw_data.get("definitionStatus", "")
        if isinstance(definition_status, dict):
            definition_status = definition_status.get("conceptId", "")

        # Collect descriptions
        descriptions = raw_data.get("descriptions", [])
        synonyms = []
        if isinstance(descriptions, list):
            synonyms = [d.get("term", "") for d in descriptions if d.get("term")]
        elif isinstance(descriptions, dict):
            items = descriptions.get("items", [])
            synonyms = [d.get("term", "") for d in items if d.get("term")]

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": concept_id,
            "canonical_id": f"SCTID:{concept_id}",
            "name": preferred_term or fsn or f"SNOMED CT Concept {concept_id}",
            "aliases": synonyms,
            "fully_specified_name": fsn,
            "semantic_tag": semantic_tag,
            "concept_id": concept_id,
            "active": active,
            "definition_status": definition_status,
            "effective_time": raw_data.get("effectiveTime", ""),
            "module_id": raw_data.get("moduleId", ""),
            "parents": [p.get("conceptId", "") for p in raw_data.get("parents", []) if isinstance(p, dict)],
            "children": [c.get("conceptId", "") for c in raw_data.get("children", []) if isinstance(c, dict)],
            "descriptions_count": len(synonyms),
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data).to_dict(),
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict[str, Any]) -> ProvenanceRecord:
        concept_id = result.get("conceptId") or result.get("concept_id", "")
        return ProvenanceRecord(
            source_database=self.name,
            source_version=self.version,
            source_record_id=concept_id,
            ingestion_timestamp=datetime.utcnow(),
            license_type="SNOMED CT Affiliate License",
            confidence_tier=ConfidenceTier.CRITICAL,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
            attribution_text="SNOMED CT (c) International Health Terminology Standards Development Organisation",
            research_only=False,
            retrieval_method="api",
            data_quality_score=0.98,
        )

    def get_confidence_score(self, result: Dict[str, Any]) -> Dict[str, float]:
        is_active = result.get("active", True)
        has_fsn = bool(result.get("fsn"))
        return {
            "data_quality": 0.98 if is_active and has_fsn else 0.75,
            "evidence_strength": 0.99,
            "sample_size": 0.97,
            "replication": 0.98,
            "consistency": 0.98,
            "temporal_relevance": 0.95,
            "population_match": 0.92,
            "overall": 0.97,
        }

    def get_confidence(self, result: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.CRITICAL

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="SNOMED CT Affiliate License / NHS England License",
            license_url="https://www.snomed.org/licensing",
            attribution_text="SNOMED CT (c) IHTSDO, used under affiliate license",
            commercial_use_allowed=True,
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            modification_allowed=False,
            redistribution_allowed=True,
            restrictions=[
                "SNOMED CT Affiliate License required for production use",
                "UMLS license required for US academic use",
            ],
        )

    async def close(self) -> None:
        await self.client.aclose()

    def __repr__(self) -> str:
        return f"<SNOMEDCTAdapter connected={self._connected} edition={self.edition}>"
