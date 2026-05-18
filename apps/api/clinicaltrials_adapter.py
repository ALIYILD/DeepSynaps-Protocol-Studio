"""
ClinicalTrials.gov Adapter - Clinical Trial Registry
=====================================================
Provides access to the ClinicalTrials.gov API v2 for searching and
retrieving registered clinical trial information.

* API Base: https://clinicaltrials.gov/api/v2/
* Documentation: https://clinicaltrials.gov/data-api/api
* Rate Limit: ~1 request / second (no key required)
* Records: 400,000+ registered clinical trials
* Confidence tier: A (registered trials)
"""

import logging
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------
from abc import ABC, abstractmethod


class BaseAdapter(ABC):
    """Abstract base class for all evidence/literature database adapters."""

    name: str = ""
    display_name: str = ""
    source_url: str = ""
    version: str = ""
    confidence_tier: str = "C"
    data_types: List[str] = []
    rate_limit_per_minute: int = 60
    requires_auth: bool = False
    auth_type: str = "none"

    @abstractmethod
    async def validate_connection(self) -> bool:
        ...

    @abstractmethod
    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        ...

    @abstractmethod
    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        ...

    @abstractmethod
    def get_provenance(self, result: Dict) -> Dict:
        ...

    @abstractmethod
    def get_confidence_score(self, result: Dict) -> Dict:
        ...

    async def close(self):
        pass


# ---------------------------------------------------------------------------
# ClinicalTrials.gov Adapter
# ---------------------------------------------------------------------------


class ClinicalTrialsAdapter(BaseAdapter):
    """
    Adapter for ClinicalTrials.gov REST API v2.

    Endpoints:
      - GET /studies          – search trials (paginated)
      - GET /studies/{nctId}  – single trial details
      - GET /stats            – registry statistics
      - GET /metadata         – field metadata / enums

    The API is fully open; no API key is required.
    """

    API_BASE = "https://clinicaltrials.gov/api/v2"

    def __init__(self):
        self.name = "clinicaltrials_gov"
        self.display_name = "ClinicalTrials.gov"
        self.source_url = "https://clinicaltrials.gov/"
        self.version = "v2-2025"
        self.confidence_tier = "A"          # registered trials
        self.data_types = [
            "clinical_trial",
            "interventional_study",
            "observational_study",
            "expanded_access",
        ]
        self.rate_limit_per_minute = 60     # ~1 req/s
        self.requires_auth = False
        self.auth_type = "none"

        self._semaphore = asyncio.Semaphore(1)  # conservative: 1 req at a time
        self._last_request_time: Optional[datetime] = None

        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)",
                "Accept": "application/json",
            },
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        """Execute a GET request respecting the 1 req/s rate limit."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 1.0:
                    await asyncio.sleep(1.0 - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.get(url, params=params)
            return response

    @staticmethod
    def _phases_to_list(phases_data: Any) -> List[str]:
        """Normalise phase information into a list of strings."""
        if isinstance(phases_data, list):
            return [str(p) for p in phases_data]
        elif isinstance(phases_data, str):
            return [phases_data]
        return []

    @staticmethod
    def _extract_sponsor(study: Dict) -> str:
        """Extract the lead sponsor name from a study record."""
        try:
            sponsor = (
                study.get("protocolSection", {})
                .get("sponsorCollaboratorsModule", {})
                .get("leadSponsor", {})
                .get("name", "")
            )
            return sponsor
        except Exception:
            return ""

    @staticmethod
    def _extract_interventions(study: Dict) -> List[str]:
        """Extract intervention names from a study record."""
        interventions = []
        arms_groups = (
            study.get("protocolSection", {})
            .get("armsInterventionsModule", {})
            .get("interventions", [])
        )
        for iv in arms_groups:
            name = iv.get("name", "")
            if name:
                interventions.append(name)
        return interventions

    @staticmethod
    def _extract_conditions(study: Dict) -> List[str]:
        """Extract condition names from a study record."""
        conds = (
            study.get("protocolSection", {})
            .get("conditionsModule", {})
            .get("conditions", [])
        )
        return [str(c) for c in conds]

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Check connectivity by fetching API metadata."""
        try:
            response = await self._rate_limited_get(f"{self.API_BASE}/version")
            if response.status_code == 200:
                data = response.json()
                logger.info(f"ClinicalTrials.gov API version: {data.get('version', 'unknown')}")
                return True
            # Fallback – try /studies with a trivial query
            response2 = await self._rate_limited_get(
                f"{self.API_BASE}/studies", params={"pageSize": "1", "filter.overallStatus": "COMPLETED"}
            )
            return response2.status_code == 200
        except Exception as exc:
            logger.error(f"ClinicalTrials.gov connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search ClinicalTrials.gov for registered trials.

        Parameters
        ----------
        query: Search term (condition, intervention, keyword, etc.).
        filters: Optional dictionary with keys:
            - max_results (int):       page size, default 20, max 100
            - condition (str):         filter by condition
            - intervention (str):      filter by intervention
            - location (str):          filter by location / country
            - status (str):            e.g. 'COMPLETED', 'RECRUITING'
            - phase (str/List[str]):   e.g. 'PHASE2', 'PHASE3'
            - study_type (str):        'INTERVENTIONAL', 'OBSERVATIONAL'
            - funder_type (str):       'NIH', 'INDUSTRY', 'ACADEMIC'
            - has_results (bool):      only trials with posted results
            - child_predicate (bool):  include child studies
            - sort (str):              'LastUpdatePostDate:desc' etc.

        Returns
        -------
        List of raw study dictionaries.
        """
        filters = filters or {}
        page_size = min(filters.get("max_results", 20), 100)

        params: Dict[str, Any] = {
            "pageSize": page_size,
            "query.cond": query,
        }

        # Additional filter mappings
        if filters.get("condition"):
            params["filter.cond"] = filters["condition"]
        if filters.get("intervention"):
            params["query.intr"] = filters["intervention"]
        if filters.get("location"):
            params["query.locn"] = filters["location"]
        if filters.get("status"):
            params["filter.overallStatus"] = filters["status"]
        if filters.get("phase"):
            phases = filters["phase"]
            if isinstance(phases, list):
                phases = "|".join(phases)
            params["filter.phase"] = phases
        if filters.get("study_type"):
            params["filter.studyType"] = filters["study_type"]
        if filters.get("funder_type"):
            params["filter.funder"] = filters["funder_type"]
        if filters.get("has_results") is True:
            params["filter.results"] = "true"
        if filters.get("sort"):
            params["sort"] = filters["sort"]
        else:
            params["sort"] = "LastUpdatePostDate:desc"

        logger.info(f"ClinicalTrials.gov search: query='{query}', filters={filters}")

        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/studies", params=params
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(f"ClinicalTrials.gov HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"ClinicalTrials.gov search failed: {exc}")
            return []

        studies = data.get("studies", [])
        for s in studies:
            s["_query"] = query
            s["_fetch_source"] = "clinicaltrials_api_v2"

        logger.info(f"ClinicalTrials.gov returned {len(studies)} studies")
        return studies

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw ClinicalTrials.gov study record into the canonical
        EvidenceEntry schema.
        """
        protocol = raw_data.get("protocolSection", {})
        results = raw_data.get("resultsSection", {})
        identification = protocol.get("identificationModule", {})
        status_module = protocol.get("statusModule", {})
        description_module = protocol.get("descriptionModule", {})
        design_module = protocol.get("designModule", {})
        sponsor_module = protocol.get("sponsorCollaboratorsModule", {})
        contacts = protocol.get("contactsLocationsModule", {})

        nct_id = identification.get("nctId", "")
        brief_title = identification.get("briefTitle", "")
        official_title = identification.get("officialTitle", "")
        title = brief_title or official_title

        phases = self._phases_to_list(design_module.get("phases", []))
        conditions = self._extract_conditions(raw_data)
        interventions = self._extract_interventions(raw_data)
        sponsor = self._extract_sponsor(raw_data)
        enrollment = design_module.get("enrollmentInfo", {}).get("count", 0)

        overall_status = status_module.get("overallStatus", "")
        start_date = status_module.get("startDateStruct", {}).get("date", "")
        completion_date = status_module.get("completionDateStruct", {}).get("date", "")
        last_update = status_module.get("lastUpdatePostDateStruct", {}).get("date", "")

        has_results = bool(results)
        study_type = design_module.get("studyType", "")

        locations = []
        for loc in contacts.get("locations", [])[:10]:
            loc_str = f"{loc.get('city', '')}, {loc.get('state', '')}, {loc.get('country', '')}"
            locations.append(loc_str.strip(", "))

        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": nct_id,
            "title": title,
            "abstract": description_module.get("briefSummary", ""),
            "official_title": official_title,
            "authors": [sponsor] if sponsor else [],
            "sponsor": sponsor,
            "phase": phases,
            "conditions": conditions,
            "interventions": interventions,
            "study_type": study_type,
            "enrollment_count": enrollment,
            "locations": locations,
            "overall_status": overall_status,
            "start_date": start_date,
            "completion_date": completion_date,
            "has_results": has_results,
            "publication_date": start_date,
            "last_update": last_update,
            "evidence_grade": "A",
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": f"https://clinicaltrials.gov/study/{nct_id}" if nct_id else "",
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.92,
            "research_only": False,
            "curation_status": "registry_entry",
            "last_updated": (
                result.get("protocolSection", {})
                .get("statusModule", {})
                .get("lastUpdatePostDateStruct", {})
                .get("date", "")
            ),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score based on trial characteristics.
        """
        protocol = result.get("protocolSection", {})
        design = protocol.get("designModule", {})
        status = protocol.get("statusModule", {})

        phases = self._phases_to_list(design.get("phases", []))
        has_results = bool(result.get("resultsSection"))
        is_randomized = design.get("designInfo", {}).get("allocation", "").upper() == "RANDOMIZED"
        enrollment = design.get("enrollmentInfo", {}).get("count", 0)
        overall_status = status.get("overallStatus", "").upper()

        # Evidence strength based on phase
        if "PHASE3" in phases:
            evidence_strength = 0.95
        elif "PHASE2" in phases:
            evidence_strength = 0.85
        elif "PHASE4" in phases:
            evidence_strength = 0.90
        elif "PHASE1" in phases:
            evidence_strength = 0.60
        else:
            evidence_strength = 0.70

        # Data quality
        data_quality = 0.92
        if has_results:
            data_quality = 0.95
        if is_randomized:
            data_quality += 0.02

        # Sample size score
        if enrollment >= 1000:
            sample_size = 0.95
        elif enrollment >= 300:
            sample_size = 0.85
        elif enrollment >= 100:
            sample_size = 0.75
        elif enrollment > 0:
            sample_size = 0.60
        else:
            sample_size = 0.40

        # Replication: completed trials with results are more replicable
        replication = 0.85 if (overall_status == "COMPLETED" and has_results) else 0.60

        # Consistency and temporal relevance
        consistency = 0.80
        temporal_relevance = 0.85 if overall_status == "COMPLETED" else 0.70
        population_match = 0.70

        overall = round(
            (evidence_strength * 0.25
             + data_quality * 0.25
             + sample_size * 0.20
             + replication * 0.10
             + consistency * 0.07
             + temporal_relevance * 0.08
             + population_match * 0.05),
            3,
        )

        return {
            "data_quality": round(data_quality, 3),
            "evidence_strength": round(evidence_strength, 3),
            "sample_size": round(sample_size, 3),
            "replication": round(replication, 3),
            "consistency": round(consistency, 3),
            "temporal_relevance": round(temporal_relevance, 3),
            "population_match": round(population_match, 3),
            "overall": overall,
        }

    # ------------------------------------------------------------------
    # Extended helpers
    # ------------------------------------------------------------------

    async def fetch_study(self, nct_id: str) -> Optional[Dict]:
        """
        Retrieve a single study by NCT ID.

        Parameters
        ----------
        nct_id: Clinical trial identifier (e.g. 'NCT04292899')

        Returns
        -------
        Full study record dictionary or None.
        """
        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/studies/{nct_id}"
            )
            if resp.status_code == 200:
                data = resp.json()
                data["_fetch_source"] = "clinicaltrials_study_detail"
                return data
            elif resp.status_code == 404:
                logger.info(f"ClinicalTrials.gov study not found: {nct_id}")
                return None
            else:
                logger.warning(f"ClinicalTrials.gov HTTP {resp.status_code} for {nct_id}")
                return None
        except Exception as exc:
            logger.error(f"ClinicalTrials.gov fetch_study failed for {nct_id}: {exc}")
            return None

    async def get_statistics(self) -> Dict:
        """Retrieve registry-level statistics from the API."""
        try:
            resp = await self._rate_limited_get(f"{self.API_BASE}/stats")
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.error(f"ClinicalTrials.gov stats fetch failed: {exc}")
            return {}

    async def close(self):
        await self.client.aclose()
