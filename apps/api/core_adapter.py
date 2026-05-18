"""
CORE Adapter - Open Access Research Aggregator
===============================================
Provides access to the CORE API, aggregating 200M+ open access
articles from repositories and journals worldwide.

API: https://api.core.ac.uk/ (REST API)
Requires free API key from https://core.ac.uk/services/api
Confidence tier: B
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
# CORE Adapter
# ---------------------------------------------------------------------------


class COREAdapter(BaseAdapter):
    """
    Adapter for the CORE (COnnecting REpositories) open access aggregator.

    CORE aggregates from:
      - 11,000+ open access repositories
      - 7,000+ journals
      - 200M+ research articles

    API endpoints:
      - /v3/search/works – full-text search across all articles
      - /v3/works/{coreId} – retrieve specific article
      - /v3/repositories – list connected repositories
      - /v3/journals – list indexed journals

    Requires a free API key obtainable at https://core.ac.uk/services/api
    """

    API_BASE = "https://api.core.ac.uk/v3"
    WEB_BASE = "https://core.ac.uk"

    # CORE work types
    WORK_TYPES = {
        "journal_article": "Journal article",
        "book": "Book",
        "book_chapter": "Book chapter",
        "conference_paper": "Conference paper",
        "dataset": "Dataset",
        "preprint": "Preprint",
        "report": "Report",
        "thesis": "Thesis",
        "working_paper": "Working paper",
        "software": "Software",
        "patent": "Patent",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.name = "core"
        self.display_name = "CORE (Open Access)"
        self.source_url = self.WEB_BASE
        self.version = "2025"
        self.confidence_tier = "B"
        self.data_types = [
            "journal_article",
            "book_chapter",
            "conference_paper",
            "dataset",
            "preprint",
            "report",
            "thesis",
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
            headers["Authorization"] = f"Bearer {self.api_key}"
        else:
            logger.warning("CORE API key not provided. Requests may be rate-limited or rejected.")

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

    async def _rate_limited_post(self, url: str, json_data: Optional[Dict] = None) -> httpx.Response:
        """Execute a POST request with rate limiting."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 0.5:
                    await asyncio.sleep(0.5 - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.post(url, json=json_data)
            return response

    def _detect_work_type(self, raw: Dict) -> str:
        """Infer CORE work type from raw result fields."""
        raw_type = (raw.get("type") or raw.get("workType") or raw.get("documentType", "")).lower()
        for code, label in self.WORK_TYPES.items():
            if code.replace("_", " ") in raw_type or label.lower() == raw_type:
                return code
        # Check type field variations
        if "journal" in raw_type:
            return "journal_article"
        elif "conference" in raw_type:
            return "conference_paper"
        elif "book" in raw_type:
            return "book"
        elif "thesis" in raw_type or "dissertation" in raw_type:
            return "thesis"
        elif "preprint" in raw_type:
            return "preprint"
        return "journal_article"  # default

    @staticmethod
    def _safe_year(date_str: Any) -> str:
        """Extract year from date string."""
        if not date_str:
            return ""
        s = str(date_str)
        # Try to find 4-digit year
        import re
        match = re.search(r"(19|20)\d{2}", s)
        if match:
            return match.group(0)
        return s[:4] if len(s) >= 4 else s

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate CORE API connectivity."""
        if not self.api_key:
            logger.warning("CORE validation skipped: no API key")
            return False
        try:
            resp = await self._rate_limited_get(f"{self.API_BASE}/search/works", params={"q": "test", "limit": 1})
            if resp.status_code == 200:
                logger.info("CORE API validated")
                return True
            elif resp.status_code == 401:
                logger.error("CORE API authentication failed (401)")
                return False
            logger.warning(f"CORE API returned HTTP {resp.status_code}")
            return False
        except Exception as exc:
            logger.error(f"CORE API connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search CORE for open access articles.

        Parameters
        ----------
        query: Search query string.
        filters: Optional dictionary with keys:
            - max_results (int):     maximum results, default 20, max 100
            - year_from (int):       minimum publication year
            - year_to (int):         maximum publication year
            - language (str):        ISO language code (e.g., 'en', 'es')
            - work_type (str):       document type filter
            - is_open_access (bool): filter open access only
            - repository (str):      specific repository name
            - sort (str):            'relevance' or 'cited' or 'recent'
            - full_text (bool):      search full text (default True)

        Returns
        -------
        List of raw CORE work dictionaries.
        """
        filters = filters or {}
        max_results = min(filters.get("max_results", 20), 100)

        # CORE v3 uses POST search for complex queries
        search_body: Dict[str, Any] = {
            "q": query,
            "limit": max_results,
            "offset": 0,
        }

        # Full text search toggle
        if filters.get("full_text", True):
            search_body["searchInFullText"] = True

        # Build filter query if needed
        filter_parts: List[str] = []

        if filters.get("year_from"):
            filter_parts.append(f"year:>={filters['year_from']}")
        if filters.get("year_to"):
            filter_parts.append(f"year:<={filters['year_to']}")
        if filters.get("language"):
            filter_parts.append(f"language:{filters['language']}")
        if filters.get("work_type"):
            wt = self.WORK_TYPES.get(filters["work_type"], filters["work_type"])
            filter_parts.append(f'type:"{wt}"')
        if filters.get("is_open_access") is True:
            filter_parts.append("isOpenAccess:true")
        if filters.get("repository"):
            filter_parts.append(f'repositoryName:"{filters["repository"]}"')

        if filter_parts:
            search_body["filter"] = " AND ".join(filter_parts)

        # Sort
        sort_map = {
            "relevance": "relevance",
            "cited": "citedByCount",
            "recent": "publishedDate",
            "date": "publishedDate",
        }
        if filters.get("sort"):
            search_body["sort"] = sort_map.get(filters["sort"], "relevance")

        logger.info(f"CORE search: query='{query}', filters={filters}")

        try:
            resp = await self._rate_limited_post(
                f"{self.API_BASE}/search/works", json_data=search_body
            )
            resp.raise_for_status()
            data = resp.json()

            results: List[Dict] = []
            if isinstance(data, dict):
                results = data.get("results", data.get("works", data.get("data", [])))
            elif isinstance(data, list):
                results = data

            for r in results:
                r["_query"] = query
                r["_fetch_source"] = "core"

            logger.info(f"CORE returned {len(results)} results")
            return results[:max_results]

        except httpx.HTTPStatusError as exc:
            logger.error(f"CORE search HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"CORE search failed: {exc}")
            return []

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw CORE work into the canonical EvidenceEntry.
        """
        work_id = raw_data.get("id") or raw_data.get("coreId") or raw_data.get("workId", "")
        title = raw_data.get("title") or ""

        # Clean HTML entities from title
        import html as _html
        title = _html.unescape(title)

        # Abstract
        abstract = raw_data.get("abstract") or raw_data.get("description") or ""
        abstract = _html.unescape(abstract)

        # Authors
        authors_data = raw_data.get("authors") or raw_data.get("author", [])
        author_list: List[str] = []
        if isinstance(authors_data, list):
            for a in authors_data:
                if isinstance(a, str):
                    author_list.append(a)
                elif isinstance(a, dict):
                    name = a.get("name") or ""
                    if not name:
                        name = f"{a.get('firstName', '')} {a.get('lastName', '')}".strip()
                    if name:
                        author_list.append(name)
        elif isinstance(authors_data, str):
            author_list = [a.strip() for a in authors_data.split(",") if a.strip()]

        # Journal / publisher
        journal = raw_data.get("publisher") or raw_data.get("journalName") or raw_data.get("source", "")
        if isinstance(journal, dict):
            journal = journal.get("name") or journal.get("publisher", "")

        # Publication date / year
        pub_date = raw_data.get("publishedDate") or raw_data.get("publicationDate", "")
        year = raw_data.get("year") or self._safe_year(pub_date)

        # DOI
        doi = raw_data.get("doi") or raw_data.get("DOI", "")
        # Normalize DOI
        if doi and not doi.startswith("10."):
            doi = ""

        # Work type
        work_type = self._detect_work_type(raw_data)

        # URLs
        download_url = raw_data.get("downloadUrl") or raw_data.get("download_url", "")
        url = raw_data.get("links") or raw_data.get("url", [])
        if isinstance(url, list) and url:
            url = url[0]
        elif isinstance(url, str):
            pass
        else:
            url = ""

        # Open access status
        is_open_access = bool(raw_data.get("isOpenAccess") or raw_data.get("open_access", True))
        if isinstance(is_open_access, str):
            is_open_access = is_open_access.lower() in ("true", "yes", "1")

        # Language
        language = raw_data.get("language") or raw_data.get("languageCode", "")

        # Full text available
        has_full_text = bool(raw_data.get("fullText") or raw_data.get("full_text") or download_url)

        # Citation count
        cited_by = raw_data.get("citedByCount") or raw_data.get("citation_count") or 0
        if isinstance(cited_by, str):
            try:
                cited_by = int(cited_by)
            except ValueError:
                cited_by = 0

        confidence = self.get_confidence_score(raw_data)

        # Evidence grade: preprints get C, journal articles get B
        evidence_grade = "C" if work_type == "preprint" else "B"

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": str(work_id),
            "title": title,
            "abstract": abstract,
            "authors": author_list,
            "journal": journal,
            "publication_date": pub_date,
            "year": year,
            "doi": doi,
            "work_type": work_type,
            "work_type_label": self.WORK_TYPES.get(work_type, work_type),
            "is_open_access": is_open_access,
            "has_full_text": has_full_text,
            "language": language,
            "cited_by_count": cited_by,
            "download_url": download_url,
            "evidence_grade": evidence_grade,
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": url if url else f"{self.WEB_BASE}/reader/{work_id}" if work_id else "",
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for a CORE result."""
        work_type = self._detect_work_type(result)
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.82,
            "research_only": False,
            "curation_status": "core_aggregated",
            "work_type": work_type,
            "is_open_access": result.get("isOpenAccess", True),
            "repository": result.get("repositoryName") or result.get("repository", ""),
            "language": result.get("language") or result.get("languageCode", ""),
            "has_full_text": bool(result.get("downloadUrl") or result.get("fullText")),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score for a CORE aggregated article.

        Confidence varies by document type and OA availability.
        Journal articles with full text score highest.
        """
        work_type = self._detect_work_type(result)
        is_open_access = bool(result.get("isOpenAccess", True))
        has_full_text = bool(result.get("fullText") or result.get("downloadUrl"))
        cited_by = result.get("citedByCount") or 0
        if isinstance(cited_by, str):
            try:
                cited_by = int(cited_by)
            except ValueError:
                cited_by = 0

        # Evidence strength by work type
        type_strength = {
            "journal_article": 0.85,
            "book_chapter": 0.78,
            "conference_paper": 0.72,
            "thesis": 0.68,
            "preprint": 0.60,
            "report": 0.75,
            "dataset": 0.75,
            "working_paper": 0.65,
        }
        evidence_strength = type_strength.get(work_type, 0.75)

        # Data quality
        data_quality = 0.80 if has_full_text else 0.70
        if is_open_access:
            data_quality += 0.05

        # Citation-based indicators
        if cited_by > 100:
            replication = 0.88
        elif cited_by > 20:
            replication = 0.78
        elif cited_by > 5:
            replication = 0.68
        else:
            replication = 0.55

        sample_size = 0.70
        consistency = 0.78
        temporal_relevance = 0.82
        population_match = 0.78

        overall = round(
            (evidence_strength * 0.28
             + data_quality * 0.25
             + sample_size * 0.08
             + replication * 0.12
             + consistency * 0.10
             + temporal_relevance * 0.10
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

    async def fetch_work_by_id(self, work_id: str) -> Optional[Dict]:
        """
        Retrieve a specific work by its CORE ID.

        Parameters
        ----------
        work_id: CORE work identifier

        Returns
        -------
        Work dictionary or None.
        """
        try:
            resp = await self._rate_limited_get(f"{self.API_BASE}/works/{work_id}")
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    data["_fetch_source"] = "core_detail"
                    return data
                return None
            elif resp.status_code == 404:
                logger.info(f"CORE work not found: {work_id}")
                return None
            elif resp.status_code == 401:
                logger.error("CORE API authentication failed (401)")
                return None
            else:
                logger.warning(f"CORE work HTTP {resp.status_code} for {work_id}")
                return None
        except Exception as exc:
            logger.error(f"CORE fetch_work_by_id failed for {work_id}: {exc}")
            return None

    async def get_repositories(self) -> List[Dict]:
        """Return a list of connected repositories."""
        try:
            resp = await self._rate_limited_get(f"{self.API_BASE}/repositories", params={"limit": 100})
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    return data.get("results", [])
                return data if isinstance(data, list) else []
            return []
        except Exception as exc:
            logger.error(f"CORE get_repositories failed: {exc}")
            return []

    async def close(self):
        await self.client.aclose()
