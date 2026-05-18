"""
DailyMed Adapter — P0 Pharma Database

REST + SPL (Structured Product Labeling) API, fully open.
All FDA-approved labels — authoritative source for medication labeling.
Endpoints: /webservices/help/, /dailymed/webservices.svc
Search: drug name, SETID, SPL version
Rate limit: No explicit limit
Confidence tier: A (FDA source)
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


class DailyMedAdapter(DatabaseAdapter):
    """Adapter for DailyMed — FDA-approved medication labeling database.

    DailyMed provides trustworthy information about marketed drugs, including
    FDA-approved labels (package inserts). It contains labeling for prescription
    and non-prescription drugs for human and animal use, and for additional
    products such as medical gases, devices, and cosmetics.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        self.name = "dailymed"
        self.display_name = "DailyMed"
        self.source_url = "https://dailymed.nlm.nih.gov/dailymed/"
        self.api_base = "https://dailymed.nlm.nih.gov/dailymed/"
        self.version = "2024-01"
        self.confidence_tier = "A"
        self.data_types = ["medication_label", "spl", "setid", "fda_approval"]
        self.rate_limit_per_minute = 600  # conservative
        self.requires_auth = False
        self.auth_type = "none"
        self.client = httpx.AsyncClient(
            timeout=45.0,
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
        """Validate connectivity via DailyMed homepage / help page."""
        try:
            resp = await self.client.get(self.source_url, timeout=15.0)
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
            "requires_auth": self.requires_auth,
            "checked_at": datetime.utcnow().isoformat(),
        }

    async def validate_connection(self) -> bool:
        return await self.connect()

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        filters = query if isinstance(query, dict) else {"q": query}
        return await self.search(filters.get("q", ""), filters=filters)

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """Search DailyMed by drug name, SETID, or SPL version.

        Args:
            query: Drug name, SETID, or keyword.
            filters: Optional dict with keys:
                - search_type: "name" | "setid" | "application_number" | "ndc"
                - include_spl: bool (fetch full SPL XML)
                - include_history: bool
                - limit: int (default 10)
        """
        filters = filters or {}
        search_type = filters.get("search_type", "name")
        limit = filters.get("limit", 10)

        try:
            if search_type == "name":
                results = await self._search_by_name(query, limit, filters)
            elif search_type == "setid":
                results = await self._search_by_setid(query, filters)
            elif search_type == "application_number":
                results = await self._search_by_application(query, limit, filters)
            elif search_type == "ndc":
                results = await self._search_by_ndc(query, filters)
            else:
                results = await self._search_by_name(query, limit, filters)
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

    async def _search_by_name(
        self, query: str, limit: int, filters: Dict
    ) -> List[Dict]:
        """Search DailyMed by drug name using the web services endpoint."""
        results: List[Dict] = []
        # DailyMed web services endpoint for SPL search
        url = f"{self.api_base}webservices/spl/search.json"
        params: Dict[str, Any] = {"drug_name": query, "limit": min(limit, 25)}
        resp = await self.client.get(url, params=params, timeout=30.0)

        if resp.status_code == 200:
            data = resp.json()
            entries = data if isinstance(data, list) else data.get("data", [])
            for entry in entries[:limit]:
                entry["_dailymed_search_type"] = "name"
                if filters.get("include_spl", False):
                    spl = await self._fetch_spl(entry.get("setid", ""))
                    entry["spl"] = spl
                results.append(entry)
        elif resp.status_code == 404:
            logger.info(f"{self.name}: No results for '{query}'")
        else:
            logger.warning(f"{self.name}: Status {resp.status_code} for name search")
        return results

    async def _search_by_setid(self, setid: str, filters: Dict) -> List[Dict]:
        """Fetch label by SETID."""
        results: List[Dict] = []
        url = f"{self.api_base}webservices/spl/setid/{setid}.json"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            data["_dailymed_search_type"] = "setid"
            if filters.get("include_spl", False):
                data["spl"] = await self._fetch_spl(setid)
            results.append(data)
        return results

    async def _search_by_application(
        self, app_number: str, limit: int, filters: Dict
    ) -> List[Dict]:
        """Search by FDA application number."""
        results: List[Dict] = []
        url = f"{self.api_base}webservices/spl/application_number/{app_number}.json"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            entries = data if isinstance(data, list) else data.get("data", [])
            for entry in entries[:limit]:
                entry["_dailymed_search_type"] = "application_number"
                results.append(entry)
        return results

    async def _search_by_ndc(self, ndc: str, filters: Dict) -> List[Dict]:
        """Search by NDC (National Drug Code)."""
        results: List[Dict] = []
        url = f"{self.api_base}webservices/spl/ndc/{ndc}.json"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            data["_dailymed_search_type"] = "ndc"
            results.append(data)
        return results

    async def _fetch_spl(self, setid: str) -> Optional[str]:
        """Fetch SPL XML for a given SETID."""
        if not setid:
            return None
        url = f"{self.api_base}getFile.cfm?type= spl&setid={setid}"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            return resp.text
        return None

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [self.transform_to_canonical(r) for r in raw]

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        valid = []
        for r in records:
            if r.get("setid") or r.get("title") or r.get("drug_name"):
                valid.append(r)
            else:
                logger.debug(f"{self.name}: Dropped invalid record — missing identifiers")
        return valid

    def transform_to_canonical(
        self, raw_data: Dict[str, Any], entity_type: str = "medication_label"
    ) -> Dict[str, Any]:
        """Convert a raw DailyMed record to the canonical cross-DB schema."""
        setid = raw_data.get("setid", "")
        title = (
            raw_data.get("title", "")
            or raw_data.get("drug_name", "")
            or raw_data.get("product_name", "")
            or "DailyMed Label"
        )

        spl = raw_data.get("spl", "")
        effective_date = raw_data.get("effective_date", "") or raw_data.get("effectiveTime", "")

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": setid,
            "canonical_id": f"DAILYMED:{setid}" if setid else "",
            "name": title,
            "description": raw_data.get("description", f"FDA-approved medication label for {title}"),
            "setid": setid,
            "spl_version": raw_data.get("spl_version", "") or raw_data.get("version", ""),
            "effective_date": effective_date,
            "application_number": raw_data.get("application_number", ""),
            "ndc_codes": raw_data.get("ndc", []) if isinstance(raw_data.get("ndc"), list) else [raw_data.get("ndc", "")],
            "fda_approval_status": "approved",
            "spl_xml_length": len(spl) if isinstance(spl, str) else 0,
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data).to_dict(),
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict[str, Any]) -> ProvenanceRecord:
        setid = result.get("setid", "")
        return ProvenanceRecord(
            source_database=self.name,
            source_version=self.version,
            source_record_id=setid,
            ingestion_timestamp=datetime.utcnow(),
            license_type="Public Domain (US Government Work)",
            confidence_tier=ConfidenceTier.CRITICAL,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
            attribution_text="DailyMed, U.S. National Library of Medicine, NIH",
            research_only=False,
            retrieval_method="api",
            data_quality_score=0.97,
        )

    def get_confidence_score(self, result: Dict[str, Any]) -> Dict[str, float]:
        has_spl = bool(result.get("spl", ""))
        has_setid = bool(result.get("setid", ""))
        return {
            "data_quality": 0.98 if has_spl and has_setid else 0.85,
            "evidence_strength": 0.99,
            "sample_size": 0.95,
            "replication": 0.97,
            "consistency": 0.98,
            "temporal_relevance": 0.92,
            "population_match": 0.88,
            "overall": 0.96,
        }

    def get_confidence(self, result: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.CRITICAL

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain (US Government Work)",
            license_url="https://www.nlm.nih.gov/copyright.html",
            attribution_text="DailyMed, U.S. National Library of Medicine, NIH",
            commercial_use_allowed=True,
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            modification_allowed=True,
            redistribution_allowed=True,
            restrictions=[],
        )

    async def close(self) -> None:
        await self.client.aclose()

    def __repr__(self) -> str:
        return f"<DailyMedAdapter connected={self._connected}>"
