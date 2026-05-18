"""
AHRQ ePSS Adapter - Electronic Preventive Services Selector
=============================================================
Provides access to US Preventive Services Task Force (USPSTF)
recommendations via the AHRQ ePSS API.

API: https://epss.ahrq.gov/
USPSTF Recommendations: 100+ preventive service topics
Confidence tier: A (USPSTF grade A/B recommendations are top-tier evidence)
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
# AHRQ ePSS Adapter
# ---------------------------------------------------------------------------


class AHRQEPSSAdapter(BaseAdapter):
    """
    Adapter for AHRQ Electronic Preventive Services Selector (ePSS).

    The ePSS provides US Preventive Services Task Force (USPSTF) recommendations
    for clinical preventive services including screening, counseling, and
    preventive medications. Recommendations are graded A, B, C, D, or I
    based on evidence certainty and net benefit magnitude.

    API endpoints:
      - Topic/recommendation search
      - Recommendation details by topic ID
      - Grade and evidence summaries

    USPSTF Grade Definitions:
      A - High certainty of substantial net benefit (offer/provide)
      B - High certainty of moderate benefit or moderate certainty of
          moderate-to-substantial benefit (offer/provide)
      C - Moderate certainty of small net benefit (selective offer)
      D - Moderate/high certainty of no net benefit or harms outweigh (discourage)
      I - Insufficient evidence
    """

    API_BASE = "https://epss.ahrq.gov/rest"
    WEB_BASE = "https://www.uspreventiveservicestaskforce.org"

    # USPSTF grade to evidence strength mapping
    GRADE_EVIDENCE = {
        "A": {"strength": 0.98, "certainty": "high", "recommend": True},
        "B": {"strength": 0.92, "certainty": "high_moderate", "recommend": True},
        "C": {"strength": 0.75, "certainty": "moderate", "recommend": None},
        "D": {"strength": 0.70, "certainty": "moderate_high", "recommend": False},
        "I": {"strength": 0.50, "certainty": "insufficient", "recommend": None},
    }

    # Preventive service categories
    SERVICE_CATEGORIES = [
        "behavioral_counseling",
        "cancer_screening",
        "cardiovascular_prevention",
        "infectious_disease_screening",
        "mental_health_screening",
        "nutritional_counseling",
        "preventive_medication",
        "skin_cancer_prevention",
        "tobacco_use",
        "vision_screening",
    ]

    def __init__(self, api_key: Optional[str] = None):
        self.name = "ahrq_epss"
        self.display_name = "AHRQ ePSS / USPSTF"
        self.source_url = self.API_BASE
        self.version = "2025"
        self.confidence_tier = "A"  # USPSTF recommendations
        self.data_types = [
            "preventive_service_recommendation",
            "screening_guideline",
            "counseling_recommendation",
            "preventive_medication_recommendation",
            "uspstf_grade_statement",
        ]
        self.rate_limit_per_minute = 120  # ~2/sec
        self.requires_auth = False
        self.auth_type = "none"
        self.api_key = api_key

        self._semaphore = asyncio.Semaphore(3)
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
        """Execute a GET request with rate limiting."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 0.5:
                    await asyncio.sleep(0.5 - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.get(url, params=params)
            return response

    def _parse_age_range(self, age_str: str) -> Dict[str, Optional[int]]:
        """Parse age range strings like '18-39', '40-49', '65+' into numeric bounds."""
        import re
        result: Dict[str, Optional[int]] = {"min": None, "max": None}
        if not age_str:
            return result
        age_str = age_str.strip()
        # Match patterns: "18-39", "65+", "<18", ">=50"
        range_match = re.match(r"^(\d+)\s*-\s*(\d+)$", age_str)
        plus_match = re.match(r"^(\d+)\+$$", age_str)
        lt_match = re.match(r"^<(\d+)$$", age_str)
        gte_match = re.match(r"^>=(\d+)$$", age_str)

        if range_match:
            result["min"] = int(range_match.group(1))
            result["max"] = int(range_match.group(2))
        elif plus_match:
            result["min"] = int(plus_match.group(1))
            result["max"] = None
        elif lt_match:
            result["min"] = 0
            result["max"] = int(lt_match.group(1)) - 1
        elif gte_match:
            result["min"] = int(gte_match.group(1))
            result["max"] = None

        return result

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking the ePSS homepage/API availability."""
        try:
            response = await self._rate_limited_get("https://epss.ahrq.gov/")
            if response.status_code == 200:
                logger.info("AHRQ ePSS validated")
                return True
            logger.warning(f"AHRQ ePSS returned HTTP {response.status_code}")
            return False
        except Exception as exc:
            logger.error(f"AHRQ ePSS connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search USPSTF recommendations.

        Parameters
        ----------
        query: Condition, screening topic, or preventive service keyword.
        filters: Optional dictionary with keys:
            - max_results (int):     maximum results, default 20, max 100
            - age_min (int):         minimum patient age in years
            - age_max (int):         maximum patient age in years
            - sex (str):             'male', 'female', or 'all'
            - risk_factors (List[str]): risk factor keywords
            - grade (List[str]):     filter by USPSTF grade A/B/C/D/I
            - category (str):        service category (e.g., 'cancer_screening')
            - pregnant (bool):       include pregnancy-specific recommendations
            - sort (str):            'relevance' or 'grade'

        Returns
        -------
        List of raw recommendation dictionaries.
        """
        filters = filters or {}
        max_results = min(filters.get("max_results", 20), 100)

        # Build search parameters
        params: Dict[str, Any] = {
            "q": query,
            "limit": max_results,
            "offset": 0,
        }

        # Age filter
        if filters.get("age_min") is not None:
            params["ageMin"] = filters["age_min"]
        if filters.get("age_max") is not None:
            params["ageMax"] = filters["age_max"]

        # Sex filter
        if filters.get("sex"):
            sex_val = filters["sex"].lower()
            if sex_val in ("male", "m"):
                params["sex"] = "M"
            elif sex_val in ("female", "f"):
                params["sex"] = "F"

        # Grade filter
        if filters.get("grade"):
            grades = filters["grade"] if isinstance(filters["grade"], list) else [filters["grade"]]
            params["grade"] = ",".join(g.upper() for g in grades)

        # Category filter
        if filters.get("category"):
            params["category"] = filters["category"]

        # Pregnancy filter
        if filters.get("pregnant") is True:
            params["pregnant"] = "true"

        logger.info(f"AHRQ ePSS search: query='{query}', filters={filters}")

        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/recommendations", params=params
            )
            resp.raise_for_status()
            data = resp.json()

            results: List[Dict] = []
            if isinstance(data, list):
                results = data
            elif isinstance(data, dict):
                results = data.get("recommendations", data.get("results", []))

            for r in results:
                r["_query"] = query
                r["_fetch_source"] = "ahrq_epss"

            logger.info(f"AHRQ ePSS returned {len(results)} recommendations")
            return results[:max_results]

        except httpx.HTTPStatusError as exc:
            logger.error(f"AHRQ ePSS search HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"AHRQ ePSS search failed: {exc}")
            return []

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw USPSTF recommendation into the canonical EvidenceEntry.
        """
        rec_id = raw_data.get("id") or raw_data.get("topicId") or raw_data.get("recommendationId", "")
        title = raw_data.get("title") or raw_data.get("topic", "")
        grade = (raw_data.get("grade") or raw_data.get("uspstfGrade", "")).upper()

        # Recommendation text
        abstract = raw_data.get("recommendation") or raw_data.get("summary") or raw_data.get("recommendationText", "")
        rationale = raw_data.get("rationale") or raw_data.get("clinicalSummary", "")
        if rationale and rationale not in abstract:
            abstract = f"{abstract}\n\nRationale: {rationale}".strip()

        # Service category and type
        category = raw_data.get("category") or raw_data.get("serviceCategory", "preventive_service")
        service_type = raw_data.get("serviceType") or raw_data.get("type", "screening")

        # Target population
        target_pop = raw_data.get("targetPopulation") or raw_data.get("population", "")
        age_range = raw_data.get("ageRange") or raw_data.get("ages", "")
        target_sex = raw_data.get("sex") or raw_data.get("targetSex", "all")

        # Risk factors
        risk_factors = raw_data.get("riskFactors") or raw_data.get("risk factors", [])
        if isinstance(risk_factors, str):
            risk_factors = [rf.strip() for rf in risk_factors.split(",") if rf.strip()]

        # Dates
        pub_date = raw_data.get("date") or raw_data.get("publishDate") or raw_data.get("recommendationDate", "")
        update_date = raw_data.get("updateDate") or raw_data.get("lastUpdated", "")

        # Evidence links
        evidence_url = raw_data.get("evidenceUrl") or raw_data.get("evidenceLink", "")
        recommendation_url = raw_data.get("url") or raw_data.get("recommendationUrl", "")
        if not recommendation_url and rec_id:
            recommendation_url = f"https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/{rec_id}"

        # Confidence and provenance
        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": str(rec_id),
            "title": title,
            "abstract": abstract,
            "authors": [],  # USPSTF recommendations are committee products
            "grade": grade,
            "category": category,
            "service_type": service_type,
            "target_population": target_pop,
            "age_range": age_range,
            "target_sex": target_sex,
            "risk_factors": risk_factors,
            "publication_date": pub_date,
            "last_updated": update_date,
            "evidence_url": evidence_url,
            "evidence_grade": grade if grade else "I",
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": recommendation_url,
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for a USPSTF recommendation."""
        grade = (result.get("grade") or result.get("uspstfGrade", "")).upper()
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.96,
            "research_only": False,
            "curation_status": "uspstf_expert_panel",
            "grade": grade,
            "federal_mandate": grade in ("A", "B"),
            "aca_coverage_required": grade in ("A", "B"),
            "last_updated": result.get("updateDate") or result.get("lastUpdated", ""),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score for a USPSTF recommendation.

        USPSTF A and B grade recommendations have the strongest evidentiary
        foundation and are tied to ACA coverage requirements.
        """
        grade = (result.get("grade") or result.get("uspstfGrade", "")).upper()
        grade_info = self.GRADE_EVIDENCE.get(grade, self.GRADE_EVIDENCE["I"])

        evidence_strength = grade_info["strength"]

        # Data quality - USPSTF systematic reviews are rigorous
        data_quality = 0.95 if grade in ("A", "B") else 0.85
        if grade == "I":
            data_quality = 0.60

        # Sample size from evidence base
        evidence_base = result.get("evidenceBase", "")
        if isinstance(evidence_base, str) and evidence_base:
            import re
            # Extract numbers like "N=50,000" or "12 trials"
            nums = re.findall(r"[Nn]=?([\d,]+)", evidence_base)
            if nums:
                try:
                    n = int(nums[0].replace(",", ""))
                    if n > 100000:
                        sample_size = 0.95
                    elif n > 10000:
                        sample_size = 0.90
                    elif n > 1000:
                        sample_size = 0.80
                    else:
                        sample_size = 0.65
                except ValueError:
                    sample_size = 0.75
            else:
                sample_size = 0.75
        else:
            sample_size = 0.75

        replication = 0.90 if grade in ("A", "B") else 0.70
        consistency = 0.92 if grade in ("A", "B") else 0.75
        temporal_relevance = 0.90
        population_match = 0.85  # US-based but widely applicable

        overall = round(
            (evidence_strength * 0.30
             + data_quality * 0.25
             + sample_size * 0.10
             + replication * 0.10
             + consistency * 0.10
             + temporal_relevance * 0.08
             + population_match * 0.07),
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

    async def fetch_recommendation_detail(self, rec_id: str) -> Optional[Dict]:
        """
        Retrieve detailed information for a specific USPSTF recommendation.

        Parameters
        ----------
        rec_id: USPSTF recommendation/topic identifier

        Returns
        -------
        Detailed recommendation dictionary or None.
        """
        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/recommendations/{rec_id}"
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    data["_fetch_source"] = "ahrq_epss_detail"
                    return data
                elif isinstance(data, list) and data:
                    data[0]["_fetch_source"] = "ahrq_epss_detail"
                    return data[0]
                return None
            elif resp.status_code == 404:
                logger.info(f"USPSTF recommendation not found: {rec_id}")
                return None
            else:
                logger.warning(f"AHRQ ePSS detail HTTP {resp.status_code} for {rec_id}")
                return None
        except Exception as exc:
            logger.error(f"AHRQ ePSS fetch_recommendation_detail failed for {rec_id}: {exc}")
            return None

    async def get_categories(self) -> List[Dict]:
        """Return a list of available preventive service categories."""
        return [
            {"code": cat, "name": cat.replace("_", " ").title()}
            for cat in self.SERVICE_CATEGORIES
        ]

    async def get_grade_definitions(self) -> Dict[str, Dict]:
        """Return USPSTF grade definitions."""
        return self.GRADE_EVIDENCE.copy()

    async def close(self):
        await self.client.aclose()
