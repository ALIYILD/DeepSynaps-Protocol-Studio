"""
Cochrane Library Adapter - Systematic Review Evidence
======================================================
Provides access to the Cochrane Library, the gold-standard source for
systematic reviews and meta-analyses in healthcare.

* Website: https://www.cochranelibrary.com/
* Export API: https://export.cochrane.org/
* Confidence tier: A (systematic reviews = highest evidence grade)
"""

import logging
import asyncio
import json
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
# Cochrane Library Adapter
# ---------------------------------------------------------------------------


class CochraneAdapter(BaseAdapter):
    """
    Adapter for the Cochrane Library.

    The Cochrane Library provides:
      - Cochrane Reviews (systematic reviews / meta-analyses)
      - Protocols (reviews in progress)
      - Editorials and special collections

    This adapter targets the public Cochrane Library search/export endpoints
    and the Cochrane Library API for structured access.
    """

    SEARCH_URL = "https://www.cochranelibrary.com/csr/doi"
    EXPORT_API = "https://export.cochrane.org/api"
    SEARCH_API = "https://www.cochranelibrary.com/search"

    def __init__(self, api_key: Optional[str] = None):
        self.name = "cochrane_library"
        self.display_name = "Cochrane Library"
        self.source_url = "https://www.cochranelibrary.com/"
        self.version = "2025"
        self.confidence_tier = "A"          # gold-standard systematic reviews
        self.data_types = [
            "systematic_review",
            "meta_analysis",
            "protocol",
            "cochrane_review",
        ]
        self.rate_limit_per_minute = 120    # ~2/sec
        self.requires_auth = False
        self.auth_type = "api_key_optional"
        self.api_key = api_key

        self._semaphore = asyncio.Semaphore(2)   # max 2 concurrent requests

        headers = {
            "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)",
            "Accept": "application/json",
        }
        self.client = httpx.AsyncClient(timeout=30.0, headers=headers)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _safe_get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        """Execute a rate-limited GET request."""
        async with self._semaphore:
            try:
                response = await self.client.get(url, params=params, timeout=30.0)
                return response
            except httpx.RequestError as exc:
                logger.error(f"Cochrane request error for {url}: {exc}")
                raise

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Check connectivity by fetching the Cochrane Library homepage."""
        try:
            response = await self._safe_get("https://www.cochranelibrary.com/")
            return response.status_code == 200
        except Exception as exc:
            logger.error(f"Cochrane connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search the Cochrane Library for systematic reviews.

        Parameters
        ----------
        query: Free-text search string (condition, intervention, etc.).
        filters: Optional dictionary with keys:
            - max_results (int):     maximum results to return (default 20)
            - status (str):          filter by status, e.g. 'published', 'withdrawn'
            - date_from (str):       YYYY-MM-DD start date
            - date_to (str):         YYYY-MM-DD end date
            - review_type (str):     e.g. 'review', 'protocol'
            - product (str):         'cdsr', 'dare', 'hta', 'economic'
            - sort (str):            'relevance' or 'date'
            - doi (str):             specific DOI to retrieve

        Returns
        -------
        List of raw Cochrane review dictionaries.
        """
        filters = filters or {}
        max_results = min(filters.get("max_results", 20), 100)

        # Cochrane Library uses a query-based search endpoint
        # We use the public search API format
        search_params: Dict[str, Any] = {
            "p_p_id": "scolaris_search_results_portlet",
            "p_p_lifecycle": "0",
            "p_p_state": "normal",
            "p_p_mode": "view",
            "_scolaris_search_results_portlet_cur": "1",
            "_scolaris_search_results_portlet_delta": str(max_results),
            "_scolaris_search_results_portlet_keywords": query,
            "_scolaris_search_results_portlet_searchForm": "basic",
            "_scolaris_search_results_portlet_orderBy": filters.get("sort", "relevance"),
        }

        if filters.get("product"):
            search_params["_scolaris_search_results_portlet_product"] = filters["product"]
        if filters.get("review_type"):
            search_params["_scolaris_search_results_portlet_reviewType"] = filters["review_type"]

        logger.info(f"Cochrane search: query='{query}'")

        try:
            resp = await self._safe_get(self.SEARCH_API, params=search_params)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")

            # Attempt JSON parsing; fall back to structured extraction
            if "application/json" in content_type:
                data = resp.json()
                results = data if isinstance(data, list) else data.get("results", [])
            else:
                # The public search returns HTML – extract structured data
                results = self._parse_search_html(resp.text, query, max_results)

        except httpx.HTTPStatusError as exc:
            logger.error(f"Cochrane search HTTP error {exc.response.status_code}: {exc}")
            return []
        except Exception as exc:
            logger.error(f"Cochrane search failed: {exc}")
            return []

        # Add provenance metadata to each result
        for r in results:
            r["_query"] = query
            r["_fetch_source"] = "cochrane_search"

        logger.info(f"Cochrane returned {len(results)} results")
        return results

    def _parse_search_html(self, html_text: str, query: str, max_results: int) -> List[Dict]:
        """
        Fallback: parse structured review data from Cochrane Library HTML.

        In a production environment this would use BeautifulSoup;
        here we simulate the parsed result structure based on known Cochrane
        HTML patterns (meta tags and JSON-LD embedded data).
        """
        import re
        results: List[Dict] = []

        # Look for JSON-LD structured data in the HTML
        jsonld_pattern = re.compile(
            r'<script type="application/ld\+json">(.*?)</script>', re.DOTALL
        )
        matches = jsonld_pattern.findall(html_text)
        for match in matches[:max_results]:
            try:
                item = json.loads(match)
                if isinstance(item, dict) and item.get("@type") in ("ScholarlyArticle", "MedicalWebPage"):
                    results.append({
                        "title": item.get("name") or item.get("headline", ""),
                        "doi": item.get("identifier", ""),
                        "url": item.get("url", ""),
                        "authors": [a.get("name", "") for a in item.get("author", []) if isinstance(a, dict)],
                        "datePublished": item.get("datePublished", ""),
                        "description": item.get("description", ""),
                    })
            except json.JSONDecodeError:
                continue

        # Also extract DOI links as evidence of review presence
        if not results:
            doi_pattern = re.compile(r'/doi/(10\.\d{4,}/[^"\s]+)')
            dois = list(dict.fromkeys(doi_pattern.findall(html_text)))[:max_results]
            for doi in dois:
                results.append({
                    "title": f"Cochrane Review: {doi}",
                    "doi": doi,
                    "url": f"https://www.cochranelibrary.com/csr/doi/{doi}",
                    "authors": [],
                    "datePublished": "",
                    "description": "",
                })

        return results

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        """
        Convert a raw Cochrane Library result into the canonical EvidenceEntry.
        """
        doi = raw_data.get("doi", "")
        url = raw_data.get("url", "")
        if not url and doi:
            url = f"https://www.cochranelibrary.com/csr/doi/{doi}"

        authors = raw_data.get("authors", [])
        if isinstance(authors, str):
            authors = [a.strip() for a in authors.split(",") if a.strip()]

        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": doi or raw_data.get("id", ""),
            "title": raw_data.get("title", ""),
            "abstract": raw_data.get("description") or raw_data.get("abstract", ""),
            "authors": authors,
            "journal": "Cochrane Database of Systematic Reviews",
            "publication_date": raw_data.get("datePublished") or raw_data.get("publication_date", ""),
            "doi": doi,
            "mesh_terms": raw_data.get("mesh_terms", []),
            "publication_types": ["systematic_review"],
            "evidence_grade": "A",
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": url,
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.95,
            "research_only": False,
            "curation_status": "cochrane_peer_reviewed",
            "review_status": "published",
            "last_updated": result.get("dateModified") or result.get("datePublished", ""),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Cochrane systematic reviews receive the highest confidence scores.
        """
        # Cochrane reviews are peer-reviewed systematic reviews with protocol registration
        is_cochrane = "cochrane" in result.get("title", "").lower() or bool(result.get("doi", ""))

        evidence_strength = 0.98 if is_cochrane else 0.95
        data_quality = 0.96
        sample_size = 0.90     # varies by included studies
        replication = 0.92     # SRs synthesize replicated studies
        consistency = 0.94
        temporal_relevance = 0.88
        population_match = 0.75

        overall = round(
            (evidence_strength * 0.30
             + data_quality * 0.25
             + sample_size * 0.15
             + replication * 0.10
             + consistency * 0.10
             + temporal_relevance * 0.05
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

    async def fetch_review_by_doi(self, doi: str) -> Optional[Dict]:
        """
        Retrieve a specific Cochrane review by its DOI.

        Parameters
        ----------
        doi: Cochrane DOI (e.g. '10.1002/14651858.CD012345.pub2')

        Returns
        -------
        Raw review dictionary or None if not found.
        """
        try:
            url = f"{self.EXPORT_API}/review/{doi}"
            resp = await self._safe_get(url)
            if resp.status_code == 200:
                data = resp.json()
                data["_fetch_source"] = "cochrane_export_api"
                return data
            elif resp.status_code == 404:
                logger.info(f"Cochrane review not found: {doi}")
                return None
            else:
                logger.warning(f"Cochrane export API returned HTTP {resp.status_code}")
                return None
        except Exception as exc:
            logger.error(f"Cochrane fetch_review_by_doi failed for {doi}: {exc}")
            return None

    async def close(self):
        await self.client.aclose()
