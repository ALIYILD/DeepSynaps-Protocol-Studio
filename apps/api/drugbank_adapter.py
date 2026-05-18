"""
DrugBank Adapter — P0 Pharma Database

Academic free access (XML/CSV downloads), commercial license for API.
15,000+ drugs, 280,000+ drug-drug interactions.
Endpoints: /drugs, /drug-drug-interactions, /targets
Search: drug name, CAS, UNII
Rate limit: 3 req/s (academic API key)
Confidence tier: A (expert-curated)
Transform: drug -> Medication, interaction -> Intervention
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

# BaseAdapter import shim — allows standalone execution or Protocol Studio integration
try:
    from app.services.knowledge.base_adapter import (
        DatabaseAdapter,
        ProvenanceRecord,
        LicenseMetadata,
        ConfidenceTier,
        EvidenceLevel,
    )
except ImportError:  # pragma: no cover
    # Fallback when running outside Protocol Studio
    from abc import ABC, abstractmethod
    from dataclasses import dataclass, field
    from enum import Enum

    class ConfidenceTier(str, Enum):
        CRITICAL = "critical"
        HIGH = "high"
        MEDIUM = "medium"
        LOW = "low"
        UNKNOWN = "unknown"
        RESEARCH = "research"

    class EvidenceLevel(str, Enum):
        SYSTEMATIC_REVIEW = "SYSTEMATIC_REVIEW"
        RCT = "RCT"
        COHORT_STUDY = "COHORT_STUDY"
        CASE_CONTROL = "CASE_CONTROL"
        CASE_SERIES = "CASE_SERIES"
        EXPERT_OPINION = "EXPERT_OPINION"
        PRECLINICAL = "PRECLINICAL"
        ANECDOTAL = "ANECDOTAL"
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
            d = {
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
            return d

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


class DrugBankAdapter(DatabaseAdapter):
    """Adapter for DrugBank pharmaceutical knowledge base.

    DrugBank is a comprehensive, freely available, online database containing
    information about drugs and drug targets. As a comprehensive bioinformatics
    and cheminformatics resource, it combines detailed drug data with
    comprehensive drug target information.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        self.name = "drugbank"
        self.display_name = "DrugBank"
        self.source_url = "https://go.drugbank.com/"
        self.api_base = "https://docs.drugbank.com/v1/"
        self.version = "2024-01"
        self.confidence_tier = "A"
        self.data_types = ["medication", "drug_interaction", "target", "pathway"]
        self.rate_limit_per_minute = 180  # ~3 req/s
        self.requires_auth = True
        self.auth_type = "api_key"
        self.api_key: Optional[str] = (config or {}).get("api_key", None)
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

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def connect(self) -> bool:
        """Validate API key by hitting a lightweight endpoint."""
        try:
            if self.api_key:
                url = f"{self.api_base}drugs.json"
                response = await self.client.get(
                    url, headers={"Authorization": f"Bearer {self.api_key}"}, timeout=10.0
                )
                self._connected = response.status_code == 200
            else:
                # Without key we can still reach public pages
                response = await self.client.get(self.source_url, timeout=10.0)
                self._connected = response.status_code == 200
            return self._connected
        except Exception as e:
            logger.error(f"{self.name} connection failed: {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        await self.client.aclose()
        self._connected = False

    async def health_check(self) -> Dict[str, Any]:
        """Return health status of DrugBank adapter."""
        return {
            "source": self.name,
            "connected": self._connected,
            "version": self.version,
            "requires_auth": self.requires_auth,
            "api_key_configured": self.api_key is not None,
            "checked_at": datetime.utcnow().isoformat(),
        }

    async def validate_connection(self) -> bool:
        """Fast connectivity check."""
        return await self.connect()

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Execute a query and return raw DrugBank records."""
        filters = query if isinstance(query, dict) else {"q": query}
        return await self.search(filters.get("q", ""), filters=filters)

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """Search DrugBank by drug name, CAS, or UNII identifier.

        Args:
            query: Drug name, CAS number, or UNII code.
            filters: Optional dict with keys:
                - search_type: "name" | "cas" | "unii" | "all"
                - include_interactions: bool
                - include_targets: bool
                - limit: int (default 10)
        """
        filters = filters or {}
        search_type = filters.get("search_type", "name")
        limit = filters.get("limit", 10)

        try:
            if self.api_key:
                results = await self._api_search(query, search_type, limit, filters)
            else:
                results = await self._public_search(query, search_type, limit, filters)
            self._last_fetch_time = datetime.utcnow()
            return results
        except httpx.HTTPStatusError as e:
            logger.error(f"{self.name} HTTP error: {e.response.status_code} — {e}")
            return []
        except httpx.RequestError as e:
            logger.error(f"{self.name} request error: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} unexpected error during search: {e}")
            return []

    async def _api_search(
        self, query: str, search_type: str, limit: int, filters: Dict
    ) -> List[Dict]:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        results: List[Dict] = []

        if search_type in ("name", "all"):
            url = f"{self.api_base}drugs.json"
            params = {"q": query, "limit": limit}
            resp = await self.client.get(url, headers=headers, params=params, timeout=30.0)
            if resp.status_code == 200:
                drugs = resp.json() if isinstance(resp.json(), list) else resp.json().get("drugs", [])
                for d in drugs[:limit]:
                    d["_drugbank_search_type"] = "name"
                    results.append(d)

        if search_type in ("cas", "all") and len(results) < limit:
            url = f"{self.api_base}drugs.json"
            params = {"cas_number": query, "limit": limit - len(results)}
            resp = await self.client.get(url, headers=headers, params=params, timeout=30.0)
            if resp.status_code == 200:
                drugs = resp.json() if isinstance(resp.json(), list) else resp.json().get("drugs", [])
                for d in drugs[: limit - len(results)]:
                    d["_drugbank_search_type"] = "cas"
                    results.append(d)

        if filters.get("include_interactions", False) and results:
            drug_id = results[0].get("drugbank_id", "")
            if drug_id:
                ix_url = f"{self.api_base}drug-drug-interactions.json"
                ix_resp = await self.client.get(
                    ix_url, headers=headers, params={"drugbank_id": drug_id}, timeout=30.0
                )
                if ix_resp.status_code == 200:
                    results[0]["drug_interactions"] = (
                        ix_resp.json() if isinstance(ix_resp.json(), list) else ix_resp.json().get("interactions", [])
                    )

        return results

    async def _public_search(
        self, query: str, search_type: str, limit: int, filters: Dict
    ) -> List[Dict]:
        """Fallback search without API key — returns synthetic placeholder data."""
        logger.warning(f"{self.name}: No API key configured, returning placeholder data")
        return [
            {
                "drugbank_id": "DB99999",
                "name": query,
                "description": f"Placeholder result for '{query}'. Configure DrugBank API key for live data.",
                "cas_number": "",
                "unii": "",
                "_drugbank_search_type": search_type,
                "_placeholder": True,
            }
        ]

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw DrugBank records into canonical schema."""
        return [self.transform_to_canonical(r) for r in raw]

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter out invalid DrugBank records."""
        valid = []
        for r in records:
            if r.get("drugbank_id") or r.get("name"):
                valid.append(r)
            else:
                logger.debug(f"{self.name}: Dropped invalid record — missing id and name")
        return valid

    def transform_to_canonical(
        self, raw_data: Dict[str, Any], entity_type: str = "medication"
    ) -> Dict[str, Any]:
        """Convert a raw DrugBank record to the canonical cross-DB schema.

        Args:
            raw_data: Raw record from DrugBank API.
            entity_type: "medication" | "intervention" | "target"
        """
        canonical_id = raw_data.get("drugbank_id", "")
        name = raw_data.get("name", "")
        if not name and "title" in raw_data:
            name = raw_data["title"]

        aliases: List[str] = []
        if "synonyms" in raw_data and isinstance(raw_data["synonyms"], list):
            aliases = raw_data["synonyms"][:10]
        elif "synonyms" in raw_data and isinstance(raw_data["synonyms"], str):
            aliases = [raw_data["synonyms"]]

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": canonical_id,
            "canonical_id": canonical_id,
            "name": name,
            "aliases": aliases,
            "description": raw_data.get("description", ""),
            "cas_number": raw_data.get("cas_number", ""),
            "unii": raw_data.get("unii", "") or raw_data.get("uniis", ""),
            "smiles": raw_data.get("smiles", ""),
            "inchikey": raw_data.get("inchikey", ""),
            "molecular_formula": raw_data.get("formula", ""),
            "molecular_weight": raw_data.get("molecular_weight", None),
            "drug_groups": raw_data.get("groups", []),
            "drug_interactions": raw_data.get("drug_interactions", []),
            "targets": raw_data.get("targets", []),
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data).to_dict(),
            "raw_data": raw_data,
            "_placeholder": raw_data.get("_placeholder", False),
        }

    def get_provenance(self, result: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.name,
            source_version=self.version,
            source_record_id=result.get("drugbank_id", result.get("id", "")),
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC BY-NC 4.0" if not self.api_key else "DrugBank Commercial License",
            confidence_tier=ConfidenceTier.HIGH,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
            attribution_text="Data from DrugBank (c) Craig Knox et al., University of Alberta",
            research_only=False,
            retrieval_method="api" if self.api_key else "public_fallback",
            data_quality_score=0.92 if not result.get("_placeholder") else 0.3,
        )

    def get_confidence_score(self, result: Dict[str, Any]) -> Dict[str, float]:
        is_placeholder = result.get("_placeholder", False)
        return {
            "data_quality": 0.95 if not is_placeholder else 0.2,
            "evidence_strength": 0.95 if not is_placeholder else 0.1,
            "sample_size": 0.9 if not is_placeholder else 0.0,
            "replication": 0.9 if not is_placeholder else 0.0,
            "consistency": 0.92 if not is_placeholder else 0.1,
            "temporal_relevance": 0.88 if not is_placeholder else 0.2,
            "population_match": 0.85 if not is_placeholder else 0.0,
            "overall": 0.92 if not is_placeholder else 0.08,
        }

    def get_confidence(self, result: Dict[str, Any]) -> ConfidenceTier:
        if result.get("_placeholder"):
            return ConfidenceTier.UNKNOWN
        return ConfidenceTier.HIGH

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC BY-NC 4.0" if not self.api_key else "Commercial",
            license_url="https://go.drugbank.com/releases/latest",
            attribution_text="DrugBank (c) Craig Knox et al., University of Alberta",
            commercial_use_allowed=self.api_key is not None,
            allows_research=True,
            allows_commercial=self.api_key is not None,
            requires_attribution=True,
            restrictions=["Academic use only without commercial license"] if not self.api_key else [],
        )

    async def close(self) -> None:
        await self.client.aclose()

    def __repr__(self) -> str:
        return f"<DrugBankAdapter connected={self._connected} api_key={'set' if self.api_key else 'none'}>"
