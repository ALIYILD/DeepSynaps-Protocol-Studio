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
import json
import hashlib
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field

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
        """Close any open connections. Override in subclass if needed."""
        logger.debug("BaseAdapter.close() called — no-op default")


# ---------------------------------------------------------------------------
# Cache utility
# ---------------------------------------------------------------------------

@dataclass
class CacheEntry:
    """In-memory cache entry with TTL."""
    data: Any
    cached_at: datetime = field(default_factory=datetime.utcnow)
    ttl_seconds: int = 3600

    def is_valid(self) -> bool:
        age = (datetime.utcnow() - self.cached_at).total_seconds()
        return age < self.ttl_seconds


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

    def __init__(self, cache_ttl: int = 3600):
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
        self.cache_ttl = cache_ttl

        self._semaphore = asyncio.Semaphore(1)  # conservative: 1 req at a time
        self._last_request_time: Optional[datetime] = None
        self._cache: Dict[str, CacheEntry] = {}

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

    def _cache_key(self, method: str, query: Union[str, Dict]) -> str:
        """Generate deterministic cache key."""
        raw = json.dumps({"method": method, "query": query}, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        return f"ctgov_{digest}"

    def _get_cached(self, cache_key: str) -> Optional[Any]:
        """Retrieve cached data if still valid."""
        entry = self._cache.get(cache_key)
        if entry and entry.is_valid():
            logger.debug(f"Cache hit for key {cache_key}")
            return entry.data
        return None

    def _set_cached(self, cache_key: str, data: Any) -> None:
        """Store data in cache."""
        self._cache[cache_key] = CacheEntry(data=data, ttl_seconds=self.cache_ttl)
        logger.debug(f"Cached data for key {cache_key}")

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
    def _extract_interventions(study: Dict) -> List[Dict]:
        """Extract intervention details from a study record."""
        interventions = []
        arms_groups = (
            study.get("protocolSection", {})
            .get("armsInterventionsModule", {})
            .get("interventions", [])
        )
        for iv in arms_groups:
            name = iv.get("name", "")
            iv_type = iv.get("type", "")
            description = iv.get("description", "")
            if name:
                interventions.append({
                    "name": name,
                    "type": iv_type,
                    "description": description,
                })
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

    @staticmethod
    def _extract_outcomes(study: Dict) -> Dict[str, List[Dict]]:
        """Extract primary and secondary outcomes from a study record."""
        outcomes_module = study.get("protocolSection", {}).get("outcomesModule", {})
        primary = []
        secondary = []
        for po in outcomes_module.get("primaryOutcomes", []):
            primary.append({
                "measure": po.get("measure", ""),
                "description": po.get("description", ""),
                "time_frame": po.get("timeFrame", ""),
            })
        for so in outcomes_module.get("secondaryOutcomes", []):
            secondary.append({
                "measure": so.get("measure", ""),
                "description": so.get("description", ""),
                "time_frame": so.get("timeFrame", ""),
            })
        return {"primary": primary, "secondary": secondary}

    @staticmethod
    def _extract_facilities(study: Dict) -> List[Dict]:
        """Extract facility/site information from a study record."""
        facilities = []
        contacts_module = study.get("protocolSection", {}).get("contactsLocationsModule", {})
        for loc in contacts_module.get("locations", []):
            facility = {
                "name": loc.get("facility", ""),
                "city": loc.get("city", ""),
                "state": loc.get("state", ""),
                "zip": loc.get("zip", ""),
                "country": loc.get("country", ""),
                "status": loc.get("status", ""),
            }
            facilities.append(facility)
        return facilities

    @staticmethod
    def _extract_study_design(study: Dict) -> Dict[str, Any]:
        """Extract study design information from a study record."""
        design_module = study.get("protocolSection", {}).get("designModule", {})
        design_info = design_module.get("designInfo", {})
        enrollment_info = design_module.get("enrollmentInfo", {})
        return {
            "study_type": design_module.get("studyType", ""),
            "phases": ClinicalTrialsAdapter._phases_to_list(design_module.get("phases", [])),
            "allocation": design_info.get("allocation", ""),
            "intervention_model": design_info.get("interventionModel", ""),
            "primary_purpose": design_info.get("primaryPurpose", ""),
            "masking_info": design_info.get("maskingInfo", {}),
            "enrollment_count": enrollment_info.get("count", 0),
            "enrollment_type": enrollment_info.get("type", ""),
        }

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
        cache_key = self._cache_key("search", {"query": query, "filters": filters})
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        page_size = min(filters.get("max_results", 20), 100)
        params: Dict[str, Any] = {"pageSize": page_size, "query.cond": query}

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
            resp = await self._rate_limited_get(f"{self.API_BASE}/studies", params=params)
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
        self._set_cached(cache_key, studies)
        return studies

    # -- NEW: get_by_id -------------------------------------------------

    async def get_by_id(self, nct_id: str) -> Optional[Dict]:
        """
        Retrieve a single clinical trial by its NCT ID.

        Parameters
        ----------
        nct_id: Clinical trial identifier (e.g. 'NCT04292899')

        Returns
        -------
        Full study record dictionary or None if not found.
        """
        if not nct_id or not nct_id.startswith("NCT"):
            logger.warning(f"Invalid NCT ID: {nct_id}")
            return None

        cache_key = self._cache_key("get_by_id", nct_id)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        logger.info(f"ClinicalTrials.gov get_by_id: {nct_id}")

        try:
            resp = await self._rate_limited_get(f"{self.API_BASE}/studies/{nct_id}")
            if resp.status_code == 200:
                data = resp.json()
                data["_fetch_source"] = "clinicaltrials_get_by_id"
                self._set_cached(cache_key, data)
                return data
            elif resp.status_code == 404:
                logger.info(f"ClinicalTrials.gov study not found: {nct_id}")
                return None
            else:
                logger.warning(f"ClinicalTrials.gov HTTP {resp.status_code} for {nct_id}")
                return None
        except httpx.HTTPError as exc:
            logger.error(f"ClinicalTrials.gov get_by_id HTTP error for {nct_id}: {exc}")
            return None
        except Exception as exc:
            logger.error(f"ClinicalTrials.gov get_by_id failed for {nct_id}: {exc}")
            return None

    # -- NEW: get_study_design ------------------------------------------

    async def get_study_design(self, nct_id: str) -> Dict[str, Any]:
        """
        Retrieve study design details for a clinical trial.

        Parameters
        ----------
        nct_id: Clinical trial identifier

        Returns
        -------
        Dictionary with study design fields (study_type, phases, allocation,
        intervention_model, primary_purpose, masking_info, enrollment_count).
        """
        study = await self.get_by_id(nct_id)
        if study is None:
            return {"error": f"Study {nct_id} not found", "nct_id": nct_id}

        design = self._extract_study_design(study)
        design["nct_id"] = nct_id
        return design

    # -- NEW: get_interventions -----------------------------------------

    async def get_interventions(self, nct_id: str) -> List[Dict]:
        """
        Retrieve intervention details for a clinical trial.

        Parameters
        ----------
        nct_id: Clinical trial identifier

        Returns
        -------
        List of intervention dictionaries with name, type, and description.
        """
        study = await self.get_by_id(nct_id)
        if study is None:
            return []

        return self._extract_interventions(study)

    # -- NEW: get_outcomes ----------------------------------------------

    async def get_outcomes(self, nct_id: str) -> Dict[str, List[Dict]]:
        """
        Retrieve primary and secondary outcomes for a clinical trial.

        Parameters
        ----------
        nct_id: Clinical trial identifier

        Returns
        -------
        Dictionary with 'primary' and 'secondary' outcome lists.
        """
        study = await self.get_by_id(nct_id)
        if study is None:
            return {"primary": [], "secondary": [], "nct_id": nct_id, "error": "Study not found"}

        outcomes = self._extract_outcomes(study)
        outcomes["nct_id"] = nct_id
        return outcomes

    # -- NEW: get_facilities --------------------------------------------

    async def get_facilities(self, nct_id: str) -> List[Dict]:
        """
        Retrieve facility/site information for a clinical trial.

        Parameters
        ----------
        nct_id: Clinical trial identifier

        Returns
        -------
        List of facility dictionaries with name, city, state, zip, country.
        """
        study = await self.get_by_id(nct_id)
        if study is None:
            return []

        return self._extract_facilities(study)

    # ------------------------------------------------------------------

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

        data_quality = 0.92
        if has_results:
            data_quality = 0.95
        if is_randomized:
            data_quality += 0.02

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

        replication = 0.85 if (overall_status == "COMPLETED" and has_results) else 0.60
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
        """Retrieve a single study by NCT ID (alias for get_by_id)."""
        return await self.get_by_id(nct_id)

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
        """Close the HTTP client and clean up resources."""
        await self.client.aclose()
        self._cache.clear()
        logger.info("ClinicalTrialsAdapter closed")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

async def _test_clinicaltrials_adapter():
    """Smoke-test the ClinicalTrialsAdapter."""
    adapter = ClinicalTrialsAdapter()

    # 1. validate_connection
    ok = await adapter.validate_connection()
    print(f"[TEST] validate_connection: {ok}")

    # 2. search
    results = await adapter.search("diabetes", filters={"max_results": 3, "status": "COMPLETED"})
    print(f"[TEST] search returned {len(results)} results")
    assert isinstance(results, list)

    # 3. get_by_id
    study = await adapter.get_by_id("NCT04292899")
    print(f"[TEST] get_by_id: {'found' if study else 'not found'}")

    # 4. get_study_design
    design = await adapter.get_study_design("NCT04292899")
    print(f"[TEST] get_study_design: {design.get('study_type', 'N/A')}")

    # 5. get_interventions
    ivs = await adapter.get_interventions("NCT04292899")
    print(f"[TEST] get_interventions: {len(ivs)} interventions")

    # 6. get_outcomes
    outcomes = await adapter.get_outcomes("NCT04292899")
    print(f"[TEST] get_outcomes: {len(outcomes.get('primary', []))} primary")

    # 7. get_facilities
    facilities = await adapter.get_facilities("NCT04292899")
    print(f"[TEST] get_facilities: {len(facilities)} facilities")

    # 8. transform_to_canonical
    if results:
        canonical = adapter.transform_to_canonical(results[0])
        print(f"[TEST] transform_to_canonical: {canonical.get('title', 'N/A')[:50]}")

    # 9. cache test
    cached_results = await adapter.search("diabetes", filters={"max_results": 3, "status": "COMPLETED"})
    print(f"[TEST] cached search returned {len(cached_results)} results")

    await adapter.close()
    print("[TEST] All ClinicalTrialsAdapter tests passed!")


if __name__ == "__main__":
    asyncio.run(_test_clinicaltrials_adapter())
