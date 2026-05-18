"""
Epistemonikos Adapter - Systematic Review Database
===================================================
Provides access to Epistemonikos, a database of 100K+ systematic reviews
and structured evidence summaries.

API: https://www.epistemonikos.org/ (REST API available)
Confidence tier: A (systematic reviews are top-tier evidence)
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
# Epistemonikos Adapter
# ---------------------------------------------------------------------------


class EpistemonikosAdapter(BaseAdapter):
    """
    Adapter for Epistemonikos systematic review database.

    Epistemonikos aggregates:
      - Systematic reviews (Cochrane, PubMed, Embase, LILACS)
      - Broad synthesis / overviews of reviews
      - Structured summaries (REHAB, DARE-style)
      - Primary studies included in reviews
      - Health systems evidence

    All content relates to health decision-making, with emphasis on
    rehabilitation, mental health, and clinical interventions.

    API endpoints:
      - /api/v1/search – full-text search across reviews
      - /api/v1/reviews/{id} – individual review details
      - /api/v1/structured_summaries – evidence summaries
    """

    API_BASE = "https://www.epistemonikos.org/api/v1"
    WEB_BASE = "https://www.epistemonikos.org"

    # Epistemonikos document types
    DOC_TYPES = {
        "systematic_review": "Systematic review",
        "broad_synthesis": "Broad synthesis",
        "structured_summary": "Structured summary",
        "primary_study": "Primary study",
        "health_systems_evidence": "Health systems evidence",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.name = "epistemonikos"
        self.display_name = "Epistemonikos"
        self.source_url = self.WEB_BASE
        self.version = "2025"
        self.confidence_tier = "A"  # systematic reviews
        self.data_types = [
            "systematic_review",
            "broad_synthesis",
            "structured_summary",
            "primary_study",
            "health_systems_evidence",
        ]
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

    def _detect_doc_type(self, raw: Dict) -> str:
        """Infer Epistemonikos document type from raw fields."""
        raw_type = (raw.get("type") or raw.get("docType") or raw.get("document_type", "")).lower()
        for code, label in self.DOC_TYPES.items():
            if code in raw_type or label.lower() in raw_type:
                return code
        # Check for systematic review indicators
        title = (raw.get("title") or "").lower()
        if "systematic review" in title:
            return "systematic_review"
        elif "overview" in title or "broad synthesis" in title:
            return "broad_synthesis"
        elif "structured summary" in title:
            return "structured_summary"
        return "systematic_review"  # default

    @staticmethod
    def _extract_sample_size(raw: Dict) -> Optional[int]:
        """Attempt to extract total sample size from review data."""
        participants = raw.get("participants") or raw.get("totalParticipants") or raw.get("sampleSize")
        if isinstance(participants, int):
            return participants
        if isinstance(participants, str):
            nums = re.findall(r"[\d,]+", participants)
            if nums:
                try:
                    return int(nums[0].replace(",", ""))
                except ValueError:
                    pass
        return None

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking the Epistemonikos homepage."""
        try:
            response = await self._rate_limited_get(self.WEB_BASE)
            if response.status_code == 200:
                logger.info("Epistemonikos validated")
                return True
            logger.warning(f"Epistemonikos returned HTTP {response.status_code}")
            return False
        except Exception as exc:
            logger.error(f"Epistemonikos connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search Epistemonikos for systematic reviews and evidence.

        Parameters
        ----------
        query: Condition, intervention, or clinical topic.
        filters: Optional dictionary with keys:
            - max_results (int):     maximum results, default 20, max 100
            - doc_type (str):        document type filter
            - condition (str):       specific condition filter
            - intervention (str):    specific intervention filter
            - date_from (str):       YYYY-MM-DD start date
            - date_to (str):         YYYY-MM-DD end date
            - sort (str):            'relevance' or 'date'
            - language (str):        language code (en, es, pt)

        Returns
        -------
        List of raw Epistemonikos document dictionaries.
        """
        filters = filters or {}
        max_results = min(filters.get("max_results", 20), 100)

        params: Dict[str, Any] = {
            "q": query,
            "limit": max_results,
            "offset": 0,
        }

        # Document type filter
        if filters.get("doc_type"):
            dt = filters["doc_type"]
            params["type"] = self.DOC_TYPES.get(dt, dt)

        # Condition filter
        if filters.get("condition"):
            params["condition"] = filters["condition"]

        # Intervention filter
        if filters.get("intervention"):
            params["intervention"] = filters["intervention"]

        # Date range
        if filters.get("date_from"):
            params["dateFrom"] = filters["date_from"]
        if filters.get("date_to"):
            params["dateTo"] = filters["date_to"]

        # Language
        if filters.get("language"):
            params["lang"] = filters["language"]

        # Sort
        if filters.get("sort"):
            params["sort"] = filters["sort"]

        logger.info(f"Epistemonikos search: query='{query}', filters={filters}")

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
                results = data.get("documents", data.get("results", data.get("data", [])))

            for r in results:
                r["_query"] = query
                r["_fetch_source"] = "epistemonikos"

            logger.info(f"Epistemonikos returned {len(results)} documents")
            return results[:max_results]

        except httpx.HTTPStatusError as exc:
            logger.error(f"Epistemonikos search HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"Epistemonikos search failed: {exc}")
            return []

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw Epistemonikos document into the canonical EvidenceEntry.
        """
        doc_id = raw_data.get("id") or raw_data.get("docId") or raw_data.get("documentId", "")
        title = raw_data.get("title") or raw_data.get("name", "")

        # Clean HTML from title
        title = re.sub(r"<[^>]+>", "", title).strip()

        # Abstract
        abstract = raw_data.get("abstract") or raw_data.get("summary") or raw_data.get("structuredAbstract", "")

        # Authors
        authors = raw_data.get("authors") or raw_data.get("author", [])
        author_list: List[str] = []
        if isinstance(authors, str):
            author_list = [a.strip() for a in authors.split(",") if a.strip()]
        elif isinstance(authors, list):
            for a in authors:
                if isinstance(a, str):
                    author_list.append(a)
                elif isinstance(a, dict):
                    name = a.get("name") or a.get("fullName") or ""
                    if name:
                        author_list.append(name)

        # Journal / source
        journal = raw_data.get("journal") or raw_data.get("source") or raw_data.get("publication", "")

        # Publication date
        pub_date = raw_data.get("date") or raw_data.get("publicationDate") or raw_data.get("year", "")

        # DOI
        doi = raw_data.get("doi") or raw_data.get("DOI", "")

        # Document type
        doc_type = self._detect_doc_type(raw_data)

        # URL
        url = raw_data.get("url") or raw_data.get("link", "")
        if not url and doc_id:
            url = f"{self.WEB_BASE}/en/documents/{doc_id}"

        # PICO elements if available
        pico = raw_data.get("pico") or {}
        population = pico.get("population") or raw_data.get("population", "")
        intervention = pico.get("intervention") or raw_data.get("intervention", "")
        comparison = pico.get("comparison") or raw_data.get("comparison", "")
        outcomes = pico.get("outcomes") or raw_data.get("outcomes", [])

        # Sample size
        sample_size = self._extract_sample_size(raw_data)

        # Included studies count
        included_studies = raw_data.get("includedStudies") or raw_data.get("numberOfStudies") or raw_data.get("studiesCount")
        if isinstance(included_studies, str):
            try:
                included_studies = int(included_studies)
            except ValueError:
                included_studies = None

        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": str(doc_id),
            "title": title,
            "abstract": abstract,
            "authors": author_list,
            "journal": journal,
            "publication_date": pub_date,
            "doi": doi,
            "document_type": doc_type,
            "document_type_label": self.DOC_TYPES.get(doc_type, doc_type),
            "pico_population": population,
            "pico_intervention": intervention,
            "pico_comparison": comparison,
            "pico_outcomes": outcomes if isinstance(outcomes, list) else [outcomes] if outcomes else [],
            "sample_size": sample_size,
            "included_studies_count": included_studies,
            "evidence_grade": "A",  # systematic reviews
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": url,
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for an Epistemonikos result."""
        doc_type = self._detect_doc_type(result)
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.93,
            "research_only": False,
            "curation_status": "epistemonikos_review_aggregated",
            "document_type": doc_type,
            "systematic_review": doc_type in ("systematic_review", "broad_synthesis"),
            "has_structured_abstract": bool(result.get("structuredAbstract")),
            "last_updated": result.get("updateDate") or result.get("lastUpdated", ""),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score for an Epistemonikos document.

        Systematic reviews and broad syntheses score highest due to
        comprehensive search and synthesis methodology.
        """
        doc_type = self._detect_doc_type(result)
        has_structured_abstract = bool(result.get("structuredAbstract"))
        included_studies = result.get("includedStudies") or result.get("numberOfStudies", 0)
        if isinstance(included_studies, str):
            try:
                included_studies = int(included_studies)
            except ValueError:
                included_studies = 0

        # Evidence strength by document type
        type_strength = {
            "systematic_review": 0.96,
            "broad_synthesis": 0.95,
            "structured_summary": 0.88,
            "primary_study": 0.78,
            "health_systems_evidence": 0.82,
        }
        evidence_strength = type_strength.get(doc_type, 0.80)

        # Data quality
        data_quality = 0.90 if has_structured_abstract else 0.85

        # Sample size from included studies
        if included_studies > 50:
            sample_size = 0.95
        elif included_studies > 20:
            sample_size = 0.88
        elif included_studies > 5:
            sample_size = 0.78
        elif included_studies > 0:
            sample_size = 0.65
        else:
            sample_size = 0.60

        replication = 0.90 if doc_type in ("systematic_review", "broad_synthesis") else 0.70
        consistency = 0.92 if doc_type in ("systematic_review", "broad_synthesis") else 0.78
        temporal_relevance = 0.85
        population_match = 0.80

        overall = round(
            (evidence_strength * 0.30
             + data_quality * 0.25
             + sample_size * 0.10
             + replication * 0.12
             + consistency * 0.08
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

    async def fetch_document_detail(self, doc_id: str) -> Optional[Dict]:
        """
        Retrieve detailed information for a specific Epistemonikos document.

        Parameters
        ----------
        doc_id: Epistemonikos document identifier

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
                    data["_fetch_source"] = "epistemonikos_detail"
                    return data
                elif isinstance(data, list) and data:
                    data[0]["_fetch_source"] = "epistemonikos_detail"
                    return data[0]
                return None
            elif resp.status_code == 404:
                logger.info(f"Epistemonikos document not found: {doc_id}")
                return None
            else:
                logger.warning(f"Epistemonikos detail HTTP {resp.status_code} for {doc_id}")
                return None
        except Exception as exc:
            logger.error(f"Epistemonikos fetch_document_detail failed for {doc_id}: {exc}")
            return None

    async def get_document_types(self) -> List[Dict]:
        """Return available document types."""
        return [
            {"code": code, "name": name}
            for code, name in self.DOC_TYPES.items()
        ]

    async def close(self):
        await self.client.aclose()
