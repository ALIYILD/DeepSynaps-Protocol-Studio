"""
ChEMBL Adapter — P0 Pharma Database

Fully open REST API, no authentication required.
2M+ bioactivity records, 1.9M+ compounds.
Endpoints: /molecule, /target, /activity, /assay
Search: SMILES, target, assay ID
Rate limit: ~15 req/s
Confidence tier: A (experimental data)
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


class ChEMBLAdapter(DatabaseAdapter):
    """Adapter for ChEMBL — large-scale bioactivity database from EMBL-EBI.

    ChEMBL is a manually curated database of bioactive molecules with drug-like
    properties. It brings together chemical, bioactivity and genomic data to aid
    the translation of genomic information into effective new drugs.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        self.name = "chembl"
        self.display_name = "ChEMBL"
        self.source_url = "https://www.ebi.ac.uk/chembl/"
        self.api_base = "https://www.ebi.ac.uk/chembl/api/data/"
        self.version = "ChEMBL_33"
        self.confidence_tier = "A"
        self.data_types = ["compound", "target", "activity", "assay", "mechanism"]
        self.rate_limit_per_minute = 900  # ~15 req/s
        self.requires_auth = False
        self.auth_type = "none"
        self.format = (config or {}).get("format", "json")
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0",
                "Accept": "application/json",
            },
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
        """Validate connectivity via status endpoint."""
        try:
            resp = await self.client.get(
                f"{self.api_base}status.json", timeout=10.0
            )
            self._connected = resp.status_code == 200
            if self._connected:
                data = resp.json()
                if "version" in data:
                    self.version = data["version"]
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
            "requires_auth": self.requires_auth,
            "checked_at": datetime.utcnow().isoformat(),
        }

    async def validate_connection(self) -> bool:
        return await self.connect()

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        filters = query if isinstance(query, dict) else {"q": query}
        return await self.search(filters.get("q", ""), filters=filters)

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """Search ChEMBL by molecule name, SMILES, target, or assay ID.

        Args:
            query: Search string — can be name, SMILES, ChEMBL ID, or keyword.
            filters: Optional dict with keys:
                - search_type: "molecule" | "target" | "activity" | "assay"
                - similarity: float (0-1) for SMILES similarity search
                - limit: int (default 10)
                - offset: int (default 0)
        """
        filters = filters or {}
        search_type = filters.get("search_type", "molecule")
        limit = filters.get("limit", 10)
        offset = filters.get("offset", 0)

        try:
            if search_type == "molecule":
                results = await self._search_molecule(query, limit, offset, filters)
            elif search_type == "target":
                results = await self._search_target(query, limit, offset)
            elif search_type == "activity":
                results = await self._search_activity(query, limit, offset)
            elif search_type == "assay":
                results = await self._search_assay(query, limit, offset)
            else:
                results = await self._search_molecule(query, limit, offset, filters)
            self._last_fetch_time = datetime.utcnow()
            return results
        except httpx.HTTPStatusError as e:
            logger.error(f"{self.name} HTTP error {e.response.status_code}: {e}")
            return []
        except httpx.RequestError as e:
            logger.error(f"{self.name} request error: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} unexpected error during search: {e}")
            return []

    async def _search_molecule(
        self, query: str, limit: int, offset: int, filters: Dict
    ) -> List[Dict]:
        """Search molecule endpoint — supports name, SMILES, similarity."""
        results: List[Dict] = []
        similarity = filters.get("similarity")

        # Try exact name search first
        search_url = f"{self.api_base}molecule.json"
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if similarity is not None and query:
            # SMILES similarity search
            params["smiles"] = query
            params["similarity"] = similarity
        elif query.startswith("CHEMBL"):
            # Direct ChEMBL ID lookup
            params["molecule_chembl_id"] = query
        else:
            # General name search
            params["q"] = query

        resp = await self.client.get(search_url, params=params, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            molecules = data.get("molecules", []) if isinstance(data, dict) else data
            for m in molecules[:limit]:
                m["_chembl_search_type"] = "molecule"
                results.append(m)

        return results

    async def _search_target(self, query: str, limit: int, offset: int) -> List[Dict]:
        """Search target endpoint by name or ChEMBL target ID."""
        results: List[Dict] = []
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if query.startswith("CHEMBL"):
            params["target_chembl_id"] = query
        else:
            params["q"] = query

        resp = await self.client.get(
            f"{self.api_base}target.json", params=params, timeout=30.0
        )
        if resp.status_code == 200:
            data = resp.json()
            targets = data.get("targets", []) if isinstance(data, dict) else data
            for t in targets[:limit]:
                t["_chembl_search_type"] = "target"
                results.append(t)
        return results

    async def _search_activity(self, query: str, limit: int, offset: int) -> List[Dict]:
        """Search activity endpoint by molecule or target ID."""
        results: List[Dict] = []
        params: Dict[str, Any] = {"limit": min(limit, 20), "offset": offset}

        if query.startswith("CHEMBL"):
            params["molecule_chembl_id"] = query
        else:
            params["q"] = query

        resp = await self.client.get(
            f"{self.api_base}activity.json", params=params, timeout=30.0
        )
        if resp.status_code == 200:
            data = resp.json()
            activities = data.get("activities", []) if isinstance(data, dict) else data
            for a in activities[:limit]:
                a["_chembl_search_type"] = "activity"
                results.append(a)
        return results

    async def _search_assay(self, query: str, limit: int, offset: int) -> List[Dict]:
        """Search assay endpoint."""
        results: List[Dict] = []
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if query.startswith("CHEMBL"):
            params["assay_chembl_id"] = query
        else:
            params["q"] = query

        resp = await self.client.get(
            f"{self.api_base}assay.json", params=params, timeout=30.0
        )
        if resp.status_code == 200:
            data = resp.json()
            assays = data.get("assays", []) if isinstance(data, dict) else data
            for a in assays[:limit]:
                a["_chembl_search_type"] = "assay"
                results.append(a)
        return results

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [self.transform_to_canonical(r) for r in raw]

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        valid = []
        for r in records:
            chembl_id = r.get("molecule_chembl_id", r.get("target_chembl_id", r.get("assay_chembl_id", "")))
            if chembl_id or r.get("pref_name") or r.get("name"):
                valid.append(r)
            else:
                logger.debug(f"{self.name}: Dropped invalid record — missing identifiers")
        return valid

    def transform_to_canonical(
        self, raw_data: Dict[str, Any], entity_type: str = "compound"
    ) -> Dict[str, Any]:
        """Convert a raw ChEMBL record to canonical schema.

        Args:
            raw_data: Raw ChEMBL API record.
            entity_type: "compound" | "target" | "activity" | "assay"
        """
        search_type = raw_data.get("_chembl_search_type", "molecule")
        if search_type == "target":
            entity_type = "target"
        elif search_type == "activity":
            entity_type = "activity"
        elif search_type == "assay":
            entity_type = "assay"

        source_id = (
            raw_data.get("molecule_chembl_id", "")
            or raw_data.get("target_chembl_id", "")
            or raw_data.get("assay_chembl_id", "")
            or raw_data.get("activity_id", "")
        )
        name = (
            raw_data.get("pref_name", "")
            or raw_data.get("name", "")
            or raw_data.get("title", "")
            or source_id
        )

        canonical: Dict[str, Any] = {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": source_id,
            "canonical_id": source_id,
            "name": name,
            "description": raw_data.get("description", ""),
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data).to_dict(),
            "raw_data": raw_data,
        }

        if entity_type == "compound":
            canonical.update({
                "smiles": raw_data.get("molecule_structures", {}).get("canonical_smiles", "")
                if isinstance(raw_data.get("molecule_structures"), dict) else "",
                "inchikey": raw_data.get("molecule_structures", {}).get("standard_inchi_key", "")
                if isinstance(raw_data.get("molecule_structures"), dict) else "",
                "molecular_formula": raw_data.get("molecule_properties", {}).get("full_molformula", "")
                if isinstance(raw_data.get("molecule_properties"), dict) else "",
                "molecular_weight": raw_data.get("molecule_properties", {}).get("mw_freebase", None)
                if isinstance(raw_data.get("molecule_properties"), dict) else None,
                "max_phase": raw_data.get("max_phase", 0),
                "therapeutic_flag": raw_data.get("therapeutic_flag", False),
                "dosed_ingredient": raw_data.get("dosed_ingredient", False),
                "first_approval": raw_data.get("first_approval", None),
            })

        elif entity_type == "target":
            canonical.update({
                "target_type": raw_data.get("target_type", ""),
                "organism": raw_data.get("organism", ""),
                "tax_id": raw_data.get("tax_id", None),
                "gene_names": raw_data.get("gene_names", ""),
                "binding_site": raw_data.get("binding_site", ""),
            })

        elif entity_type == "activity":
            canonical.update({
                "standard_type": raw_data.get("standard_type", ""),
                "standard_value": raw_data.get("standard_value", None),
                "standard_units": raw_data.get("standard_units", ""),
                "pchembl_value": raw_data.get("pchembl_value", None),
                "activity_comment": raw_data.get("activity_comment", ""),
            })

        return canonical

    def get_provenance(self, result: Dict[str, Any]) -> ProvenanceRecord:
        source_id = (
            result.get("molecule_chembl_id", "")
            or result.get("target_chembl_id", "")
            or result.get("assay_chembl_id", "")
            or str(result.get("activity_id", ""))
        )
        return ProvenanceRecord(
            source_database=self.name,
            source_version=self.version,
            source_record_id=source_id,
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC BY-SA 3.0",
            confidence_tier=ConfidenceTier.HIGH,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
            attribution_text="Data from ChEMBL, EMBL-EBI",
            research_only=False,
            retrieval_method="api",
            data_quality_score=0.90,
        )

    def get_confidence_score(self, result: Dict[str, Any]) -> Dict[str, float]:
        max_phase = result.get("max_phase", 0)
        temporal_score = 0.9 if result.get("first_approval") else 0.7
        return {
            "data_quality": 0.92,
            "evidence_strength": 0.88 if max_phase and max_phase >= 2 else 0.75,
            "sample_size": 0.85,
            "replication": 0.80,
            "consistency": 0.87,
            "temporal_relevance": temporal_score,
            "population_match": 0.75,
            "overall": 0.86,
        }

    def get_confidence(self, result: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.HIGH

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC BY-SA 3.0",
            license_url="https://www.ebi.ac.uk/about/terms-of-use",
            attribution_text="ChEMBL, European Bioinformatics Institute (EMBL-EBI)",
            commercial_use_allowed=True,
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            modification_allowed=True,
            redistribution_allowed=True,
        )

    async def close(self) -> None:
        await self.client.aclose()

    def __repr__(self) -> str:
        return f"<ChEMBLAdapter connected={self._connected} version={self.version}>"
