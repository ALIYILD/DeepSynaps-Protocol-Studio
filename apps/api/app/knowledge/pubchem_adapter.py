"""
PubChem Adapter — P0 Pharma Database

PUG REST API, fully open, no authentication required.
110M+ chemical structures.
Endpoints: /compound/name/{name}, /compound/cid/{cid}, /compound/fastformula
Search: name, SMILES, InChIKey, CID
Rate limit: 5 req/s (no key), higher with key
Confidence tier: A (NCBI curated)
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


class PubChemAdapter(DatabaseAdapter):
    """Adapter for PubChem — world's largest free chemical information database.

    PubChem is an open chemistry database at the National Institutes of Health (NIH),
    managed by NCBI. It contains information on chemical structures, identifiers,
    chemical and physical properties, biological activities, safety and toxicity
    information, patents, literature citations and more.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        self.name = "pubchem"
        self.display_name = "PubChem"
        self.source_url = "https://pubchem.ncbi.nlm.nih.gov/"
        self.api_base = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/"
        self.version = "2024-01"
        self.confidence_tier = "A"
        self.data_types = ["compound", "substance", "bioassay", "pathway", "protein"]
        self.rate_limit_per_minute = 300  # ~5 req/s
        self.requires_auth = False
        self.auth_type = "none"
        self.pchem_key: Optional[str] = (config or {}).get("pchem_key", None)
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
        """Validate connectivity via a lightweight PUG REST call."""
        try:
            resp = await self.client.get(
                f"{self.api_base}compound/name/aspirin/cids/JSON", timeout=10.0
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
            "requires_auth": self.requires_auth,
            "checked_at": datetime.utcnow().isoformat(),
        }

    async def validate_connection(self) -> bool:
        return await self.connect()

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        filters = query if isinstance(query, dict) else {"q": query}
        return await self.search(filters.get("q", ""), filters=filters)

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """Search PubChem by name, SMILES, InChIKey, or CID.

        Args:
            query: Search string — compound name, SMILES, InChIKey, or CID.
            filters: Optional dict with keys:
                - search_type: "name" | "smiles" | "inchikey" | "cid" | "formula"
                - include_properties: bool (fetch calculated properties)
                - include_synonyms: bool
                - include_classification: bool
                - limit: int (default 10)
        """
        filters = filters or {}
        search_type = filters.get("search_type", "name")
        limit = filters.get("limit", 10)

        try:
            results = await self._execute_search(query, search_type, limit, filters)
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

    async def _execute_search(
        self, query: str, search_type: str, limit: int, filters: Dict
    ) -> List[Dict]:
        """Route to the appropriate PUG REST endpoint."""
        results: List[Dict] = []

        if search_type == "name":
            results = await self._search_by_name(query, limit, filters)
        elif search_type == "cid":
            results = await self._search_by_cid(query, filters)
        elif search_type == "smiles":
            results = await self._search_by_smiles(query, limit, filters)
        elif search_type == "inchikey":
            results = await self._search_by_inchikey(query, filters)
        elif search_type == "formula":
            results = await self._search_by_formula(query, limit, filters)
        else:
            results = await self._search_by_name(query, limit, filters)

        return results

    async def _search_by_name(
        self, query: str, limit: int, filters: Dict
    ) -> List[Dict]:
        """Search PubChem by compound name using PUG REST."""
        results: List[Dict] = []
        encoded = query.replace(" ", "%20")
        url = f"{self.api_base}compound/name/{encoded}/cids/JSON"

        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            cid_list = data.get("IdentifierList", {}).get("CID", [])[:limit]
            for cid in cid_list:
                record = await self._fetch_compound_by_cid(str(cid), filters)
                if record:
                    record["_pubchem_search_type"] = "name"
                    record["_pubchem_query"] = query
                    results.append(record)
        elif resp.status_code == 404:
            logger.info(f"{self.name}: No results for name query '{query}'")
        else:
            logger.warning(f"{self.name}: Unexpected status {resp.status_code} for name search")
        return results

    async def _search_by_cid(self, cid: str, filters: Dict) -> List[Dict]:
        """Fetch compound record by CID."""
        record = await self._fetch_compound_by_cid(cid, filters)
        if record:
            record["_pubchem_search_type"] = "cid"
            return [record]
        return []

    async def _search_by_smiles(
        self, smiles: str, limit: int, filters: Dict
    ) -> List[Dict]:
        """Search by SMILES (exact structure match via PUG REST)."""
        results: List[Dict] = []
        encoded = smiles.replace("#", "%23").replace("=", "%3D")
        url = f"{self.api_base}compound/smiles/{encoded}/cids/JSON"

        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            cid_list = data.get("IdentifierList", {}).get("CID", [])[:limit]
            for cid in cid_list:
                record = await self._fetch_compound_by_cid(str(cid), filters)
                if record:
                    record["_pubchem_search_type"] = "smiles"
                    results.append(record)
        return results

    async def _search_by_inchikey(self, inchikey: str, filters: Dict) -> List[Dict]:
        """Search by InChIKey (exact match)."""
        results: List[Dict] = []
        url = f"{self.api_base}compound/inchikey/{inchikey}/cids/JSON"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            cid_list = data.get("IdentifierList", {}).get("CID", [])[:1]
            for cid in cid_list:
                record = await self._fetch_compound_by_cid(str(cid), filters)
                if record:
                    record["_pubchem_search_type"] = "inchikey"
                    return [record]
        return results

    async def _search_by_formula(
        self, formula: str, limit: int, filters: Dict
    ) -> List[Dict]:
        """Search by molecular formula (fastformula endpoint)."""
        results: List[Dict] = []
        url = f"{self.api_base}compound/fastformula/{formula}/cids/JSON"
        resp = await self.client.get(url, timeout=30.0)
        if resp.status_code == 200:
            data = resp.json()
            cid_list = data.get("IdentifierList", {}).get("CID", [])[:limit]
            for cid in cid_list:
                record = await self._fetch_compound_by_cid(str(cid), filters)
                if record:
                    record["_pubchem_search_type"] = "formula"
                    results.append(record)
        return results

    async def _fetch_compound_by_cid(self, cid: str, filters: Dict) -> Optional[Dict]:
        """Fetch full compound record by CID with optional property data."""
        record: Dict[str, Any] = {"cid": int(cid) if cid.isdigit() else 0, "_fetched_at": datetime.utcnow().isoformat()}

        # Fetch compound record
        record_url = f"{self.api_base}compound/cid/{cid}/record/JSON"
        resp = await self.client.get(record_url, timeout=30.0)
        if resp.status_code == 200:
            record["record"] = resp.json()

        # Fetch properties if requested
        if filters.get("include_properties", True):
            props_url = f"{self.api_base}compound/cid/{cid}/property/IUPACName,MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES,InChI,InChIKey,ExactMass,XLogP,TPSA/JSON"
            props_resp = await self.client.get(props_url, timeout=30.0)
            if props_resp.status_code == 200:
                props_data = props_resp.json()
                properties = props_data.get("PropertyTable", {}).get("Properties", [{}])[0]
                record["properties"] = properties

        # Fetch synonyms if requested
        if filters.get("include_synonyms", True):
            syn_url = f"{self.api_base}compound/cid/{cid}/synonyms/JSON"
            syn_resp = await self.client.get(syn_url, timeout=30.0)
            if syn_resp.status_code == 200:
                syn_data = syn_resp.json()
                record["synonyms"] = syn_data.get("InformationList", {}).get("Information", [{}])[0].get("Synonym", [])

        return record

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [self.transform_to_canonical(r) for r in raw]

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        valid = []
        for r in records:
            cid = r.get("cid", 0)
            if isinstance(cid, int) and cid > 0:
                valid.append(r)
            else:
                logger.debug(f"{self.name}: Dropped invalid record — missing CID")
        return valid

    def transform_to_canonical(
        self, raw_data: Dict[str, Any], entity_type: str = "compound"
    ) -> Dict[str, Any]:
        """Convert a raw PubChem record to the canonical cross-DB schema."""
        cid = raw_data.get("cid", 0)
        props = raw_data.get("properties", {})
        synonyms = raw_data.get("synonyms", [])[:10]
        record_json = raw_data.get("record", {})

        # Extract IUPAC name from record if available
        iupac_name = props.get("IUPACName", "")
        if not iupac_name and isinstance(record_json, dict):
            sections = record_json.get("PC_Compounds", [{}])[0] if "PC_Compounds" in record_json else {}
            if isinstance(sections, dict):
                props_list = sections.get("props", [])
                for p in props_list:
                    urn = p.get("urn", {})
                    if urn.get("label") == "IUPAC" and urn.get("name") == "Preferred":
                        iupac_name = p.get("value", {}).get("sval", "")
                        break

        name = iupac_name or (synonyms[0] if synonyms else f"CID:{cid}")

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": str(cid),
            "canonical_id": f"PUBCHEM_CID:{cid}",
            "name": name,
            "aliases": synonyms,
            "description": f"PubChem compound record CID {cid}",
            "cid": cid,
            "smiles": props.get("CanonicalSMILES", ""),
            "isomeric_smiles": props.get("IsomericSMILES", ""),
            "inchi": props.get("InChI", ""),
            "inchikey": props.get("InChIKey", ""),
            "molecular_formula": props.get("MolecularFormula", ""),
            "molecular_weight": props.get("MolecularWeight", None),
            "exact_mass": props.get("ExactMass", None),
            "xlogp": props.get("XLogP", None),
            "tpsa": props.get("TPSA", None),
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data).to_dict(),
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict[str, Any]) -> ProvenanceRecord:
        cid = result.get("cid", 0)
        return ProvenanceRecord(
            source_database=self.name,
            source_version=self.version,
            source_record_id=str(cid),
            ingestion_timestamp=datetime.utcnow(),
            license_type="Public Domain / CC0",
            confidence_tier=ConfidenceTier.CRITICAL,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
            attribution_text="PubChem, National Center for Biotechnology Information (NCBI)",
            research_only=False,
            retrieval_method="api",
            data_quality_score=0.94,
        )

    def get_confidence_score(self, result: Dict[str, Any]) -> Dict[str, float]:
        has_props = bool(result.get("properties", {}).get("MolecularFormula"))
        has_record = bool(result.get("record"))
        return {
            "data_quality": 0.96 if has_props and has_record else 0.70,
            "evidence_strength": 0.95,
            "sample_size": 0.92,
            "replication": 0.90,
            "consistency": 0.94,
            "temporal_relevance": 0.93,
            "population_match": 0.80,
            "overall": 0.93,
        }

    def get_confidence(self, result: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.CRITICAL

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain / CC0",
            license_url="https://www.ncbi.nlm.nih.gov/home/about/policies/",
            attribution_text="PubChem, National Library of Medicine, NIH",
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
        return f"<PubChemAdapter connected={self._connected}>"
