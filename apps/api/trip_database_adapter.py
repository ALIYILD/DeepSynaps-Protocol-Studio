"""
TRIP Database Adapter - Clinical Search Engine
===============================================
Provides access to the TRIP (Turning Research Into Practice) Database,
a clinical search engine indexing 500K+ evidence sources.

API: https://www.tripdatabase.com/ (partner API)
Confidence tier: B
"""

import logging
import asyncio
import re
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
# TRIP Database Adapter
# ---------------------------------------------------------------------------


class TRIPDatabaseAdapter(BaseAdapter):
    """
    Adapter for the TRIP Database clinical search engine.

    TRIP aggregates evidence from multiple sources:
      - Systematic reviews (Cochrane, DARE, PROSPERO)
      - Clinical guidelines (NICE, SIGN, RACGP)
      - Clinical trials (ClinicalTrials.gov, WHO ICTRP)
      - Core medical journals (BMJ, Lancet, NEJM, JAMA)
      - eTextbooks and medical education resources
      - Patient information leaflets
      - Regulatory documents (FDA, EMA)

    Evidence type filter categories:
      - systematic_review, guideline, rct, evidence_summary
      - primary_research, review, clinical_qa
    """

    API_BASE = "https://www.tripdatabase.com/api"
    WEB_BASE = "https://www.tripdatabase.com"

    # TRIP evidence type mapping
    EVIDENCE_TYPES = {
        "systematic_review": "Systematic Review",
        "guideline": "Guideline",
        "rct": "Randomised Controlled Trial",
        "evidence_summary": "Evidence Summary",
        "primary_research": "Primary Research",
        "review": "Review",
        "clinical_qa": "Clinical Q&A",
        "cohort_study": "Cohort Study",
        "case_report": "Case Report",
        "economic_evaluation": "Economic Evaluation",
        "hta": "Health Technology Assessment",
    }

    # Evidence type to grade mapping
    TYPE_TO_GRADE = {
        "systematic_review": "A",
        "guideline": "A",
        "rct": "A",
        "hta": "A",
        "evidence_summary": "B",
        "review": "B",
        "primary_research": "B",
        "cohort_study": "B",
        "clinical_qa": "B",
        "economic_evaluation": "B",
        "case_report": "C",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.name = "trip_database"
        self.display_name = "TRIP Database"
        self.source_url = self.WEB_BASE
        self.version = "2025"
        self.confidence_tier = "B"
        self.data_types = list(self.EVIDENCE_TYPES.keys())
        self.rate_limit_per_minute = 120  # ~2/sec
        self.requires_auth = True
        self.auth_type = "api_key"
        self.api_key = api_key

        self._semaphore = asyncio.Semaphore(3)
        self._last_request_time: Optional[datetime] = None

        headers = {
            "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers=headers,
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

    def _detect_evidence_type(self, raw: Dict) -> str:
        """Infer evidence type from raw result fields."""
        raw_type = (raw.get("type") or raw.get("evidenceType") or raw.get("category", "")).lower()
        for code, label in self.EVIDENCE_TYPES.items():
            if code.replace("_", " ") in raw_type or label.lower() in raw_type:
                return code
        # Check publication type hints
        pub_type = (raw.get("publicationType") or raw.get("pubType", "")).lower()
        if "systematic review" in pub_type:
            return "systematic_review"
        elif "guideline" in pub_type:
            return "guideline"
        elif "randomised" in pub_type or "randomized" in pub_type:
            return "rct"
        elif "cohort" in pub_type:
            return "cohort_study"
        return "primary_research"

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking the TRIP Database homepage."""
        try:
            response = await self._rate_limited_get(self.WEB_BASE)
            if response.status_code == 200:
                logger.info("TRIP Database validated")
                return True
            logger.warning(f"TRIP Database returned HTTP {response.status_code}")
            return False
        except Exception as exc:
            logger.error(f"TRIP Database connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search TRIP Database for clinical evidence.

        Parameters
        ----------
        query: Clinical question, condition, intervention, or topic.
        filters: Optional dictionary with keys:
            - max_results (int):     maximum results, default 20, max 100
            - evidence_type (str):   filter by evidence type code
            - date_from (str):       YYYY-MM-DD start date
            - date_to (str):         YYYY-MM-DD end date
            - source (str):          specific source filter
            - sort (str):            'relevance' or 'date'
            - page (int):            page number for pagination

        Returns
        -------
        List of raw TRIP result dictionaries.
        """
        filters = filters or {}
        max_results = min(filters.get("max_results", 20), 100)
        page = filters.get("page", 1)

        params: Dict[str, Any] = {
            "q": query,
            "limit": max_results,
            "page": page,
        }

        # Evidence type filter
        if filters.get("evidence_type"):
            etype = filters["evidence_type"]
            params["type"] = self.EVIDENCE_TYPES.get(etype, etype)

        # Date range
        if filters.get("date_from"):
            params["dateFrom"] = filters["date_from"]
        if filters.get("date_to"):
            params["dateTo"] = filters["date_to"]

        # Sort order
        if filters.get("sort"):
            params["sort"] = filters["sort"]

        logger.info(f"TRIP search: query='{query}', filters={filters}")

        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/search", params=params
            )
            resp.raise_for_status()
            data = resp.json()

            results: List[Dict] = []
            if isinstance(data, list):
                results = data
            elif isinstance(data, dict):
                results = data.get("results", data.get("data", []))

            for r in results:
                r["_query"] = query
                r["_fetch_source"] = "trip_database"

            logger.info(f"TRIP Database returned {len(results)} results")
            return results[:max_results]

        except httpx.HTTPStatusError as exc:
            logger.error(f"TRIP search HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"TRIP search failed: {exc}")
            return []

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw TRIP result into the canonical EvidenceEntry.
        """
        trip_id = raw_data.get("id") or raw_data.get("documentId") or raw_data.get("tripId", "")
        title = raw_data.get("title") or raw_data.get("name", "")

        # Clean HTML from title
        title = re.sub(r"<[^>]+>", "", title).strip()

        # Abstract / snippet
        abstract = raw_data.get("abstract") or raw_data.get("snippet") or raw_data.get("description", "")
        abstract = re.sub(r"<[^>]+>", "", abstract).strip()

        # Authors
        authors = raw_data.get("authors") or raw_data.get("author", [])
        if isinstance(authors, str):
            authors = [a.strip() for a in authors.split(",") if a.strip()]
        author_list = []
        for a in authors if isinstance(authors, (list, tuple)) else []:
            if isinstance(a, str):
                author_list.append(a)
            elif isinstance(a, dict):
                author_list.append(a.get("name") or a.get("fullName", ""))

        # Journal / source
        source = raw_data.get("source") or raw_data.get("journal") or raw_data.get("publication", "TRIP Database")

        # Publication date
        pub_date = raw_data.get("date") or raw_data.get("publicationDate") or raw_data.get("year", "")

        # DOI
        doi = raw_data.get("doi") or raw_data.get("DOI", "")

        # Evidence type
        evidence_type = self._detect_evidence_type(raw_data)
        evidence_grade = self.TYPE_TO_GRADE.get(evidence_type, "B")

        # URLs
        url = raw_data.get("url") or raw_data.get("link", "")
        pdf_url = raw_data.get("pdfUrl") or raw_data.get("pdf", "")

        # Quality indicators
        is_open_access = raw_data.get("openAccess") or raw_data.get("isOpenAccess", False)
        if isinstance(is_open_access, str):
            is_open_access = is_open_access.lower() in ("true", "yes", "y", "1")

        peer_reviewed = raw_data.get("peerReviewed") or raw_data.get("isPeerReviewed", True)
        if isinstance(peer_reviewed, str):
            peer_reviewed = peer_reviewed.lower() in ("true", "yes", "y", "1")

        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": str(trip_id),
            "title": title,
            "abstract": abstract,
            "authors": author_list,
            "journal": source,
            "publication_date": pub_date,
            "doi": doi,
            "evidence_type": evidence_type,
            "evidence_type_label": self.EVIDENCE_TYPES.get(evidence_type, evidence_type),
            "evidence_grade": evidence_grade,
            "is_open_access": bool(is_open_access),
            "peer_reviewed": bool(peer_reviewed),
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": url,
            "pdf_url": pdf_url,
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for a TRIP Database result."""
        evidence_type = self._detect_evidence_type(result)
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.82,
            "research_only": False,
            "curation_status": "trip_aggregated",
            "evidence_type": evidence_type,
            "original_source": result.get("source") or result.get("journal", ""),
            "peer_reviewed": result.get("peerReviewed", True),
            "open_access": result.get("openAccess", False),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score for a TRIP Database result.

        Confidence varies by evidence source type within TRIP.
        Systematic reviews and guidelines score highest.
        """
        evidence_type = self._detect_evidence_type(result)
        is_peer_reviewed = bool(result.get("peerReviewed", True))
        is_open_access = bool(result.get("openAccess", False))

        # Evidence strength by type
        type_strength = {
            "systematic_review": 0.95,
            "guideline": 0.94,
            "rct": 0.93,
            "hta": 0.92,
            "evidence_summary": 0.85,
            "review": 0.78,
            "primary_research": 0.80,
            "cohort_study": 0.75,
            "clinical_qa": 0.72,
            "economic_evaluation": 0.75,
            "case_report": 0.50,
        }
        evidence_strength = type_strength.get(evidence_type, 0.70)

        # Data quality
        data_quality = 0.82 if is_peer_reviewed else 0.60
        if is_open_access:
            data_quality += 0.05

        sample_size = 0.70
        replication = 0.75 if evidence_type in ("systematic_review", "guideline") else 0.60
        consistency = 0.80
        temporal_relevance = 0.82
        population_match = 0.78

        overall = round(
            (evidence_strength * 0.28
             + data_quality * 0.22
             + sample_size * 0.10
             + replication * 0.12
             + consistency * 0.10
             + temporal_relevance * 0.10
             + population_match * 0.08),
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

    async def fetch_document_detail(self, doc_id: str) -> Optional[Dict]:
        """
        Retrieve detailed information for a specific TRIP document.

        Parameters
        ----------
        doc_id: TRIP document identifier

        Returns
        -------
        Detailed document dictionary or None.
        """
        try:
            resp = await self._rate_limited_get(
                f"{self.API_BASE}/documents/{doc_id}"
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    data["_fetch_source"] = "trip_database_detail"
                    return data
                elif isinstance(data, list) and data:
                    data[0]["_fetch_source"] = "trip_database_detail"
                    return data[0]
                return None
            elif resp.status_code == 404:
                logger.info(f"TRIP document not found: {doc_id}")
                return None
            else:
                logger.warning(f"TRIP detail HTTP {resp.status_code} for {doc_id}")
                return None
        except Exception as exc:
            logger.error(f"TRIP fetch_document_detail failed for {doc_id}: {exc}")
            return None

    async def get_evidence_types(self) -> List[Dict]:
        """Return available evidence type filters."""
        return [
            {"code": code, "name": name}
            for code, name in self.EVIDENCE_TYPES.items()
        ]

    async def close(self):
        await self.client.aclose()
