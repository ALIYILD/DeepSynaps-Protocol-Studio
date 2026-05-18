"""
Semantic Scholar Adapter - AI-Powered Academic Literature Search
===============================================================
Adapter for Semantic Scholar API (Allen Institute for AI).
200M+ papers with AI-generated TLDRs, citation velocity, and influential citation metrics.

API: https://api.semanticscholar.org/graph/v1/
Rate Limit: 100 req/5min (free), 1 req/s (batch)
Auth: None required for basic usage
"""

import os
import time
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------

class BaseAdapter:
    """Abstract base class for all adverse event / literature adapters."""

    async def validate_connection(self) -> bool:
        raise NotImplementedError

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        raise NotImplementedError

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "adverse_event"
    ) -> Dict:
        raise NotImplementedError

    def get_provenance(self, result: Dict) -> Dict:
        raise NotImplementedError

    def get_confidence_score(self, result: Dict) -> Dict:
        raise NotImplementedError

    async def close(self):
        pass


# ---------------------------------------------------------------------------
# SemanticScholarAdapter
# ---------------------------------------------------------------------------

class SemanticScholarAdapter(BaseAdapter):
    """
    Semantic Scholar Graph API adapter.

    * Full-text search across 200M+ academic papers
    * AI-generated TLDR summaries
    * Citation velocity, influential citations
    * Author disambiguation, paper recommendations
    """

    # API endpoints
    BASE_URL = "https://api.semanticscholar.org/graph/v1"
    SEARCH_URL = f"{BASE_URL}/paper/search"
    PAPER_URL = f"{BASE_URL}/paper"
    AUTHOR_URL = f"{BASE_URL}/author"
    RECOMMENDATIONS_URL = f"{BASE_URL}/recommendations"

    # Fields that can be requested for a paper (comma-separated)
    DEFAULT_PAPER_FIELDS = (
        "paperId,title,abstract,year,authors,venue,fieldsOfStudy,"
        "citationCount,referenceCount,influentialCitationCount,"
        "isOpenAccess,openAccessPdf,citations,references,tldr"
    )

    def __init__(
        self,
        api_key: Optional[str] = None,
        cache_dir: Optional[str] = None,
        request_interval: float = 1.0,  # 1 req/s for free tier
    ):
        self.name = "semantic_scholar"
        self.display_name = "Semantic Scholar"
        self.source_url = self.BASE_URL
        self.version = "2024-06"
        self.confidence_tier = "B"  # literature, not clinical evidence
        self.data_types = ["literature", "citation", "evidence"]
        self.rate_limit_per_minute = 20  # conservative: 100/5min
        self.requires_auth = False
        self.auth_type = "api_key_optional"

        self.api_key = api_key or os.environ.get("SEMANTIC_SCHOLAR_API_KEY", None)
        self.request_interval = request_interval
        self._last_request_time: Optional[float] = None

        # HTTP client
        headers = {"User-Agent": "DeepSynaps-Protocol-Studio/1.0"}
        if self.api_key:
            headers["x-api-key"] = self.api_key
            self.requires_auth = True
            self.auth_type = "api_key"
            self.rate_limit_per_minute = 100  # higher with key
            self.request_interval = 0.6  # ~100 req/5min

        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers=headers,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )

        # Caching
        self.cache_dir = Path(cache_dir or os.environ.get("SEMANTIC_SCHOLAR_CACHE", "./cache/semantic_scholar"))
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._cache_memory: Dict[str, Any] = {}

    # -- rate limiting ------------------------------------------------------

    async def _rate_limit(self):
        """Enforce per-second request interval."""
        if self._last_request_time is not None:
            elapsed = time.monotonic() - self._last_request_time
            if elapsed < self.request_interval:
                wait = self.request_interval - elapsed
                logger.debug(f"Rate-limit sleep {wait:.2f}s")
                await __import__("asyncio").sleep(wait)
        self._last_request_time = time.monotonic()

    # -- cache helpers ------------------------------------------------------

    def _cache_key(self, *parts: str) -> str:
        import hashlib
        return hashlib.sha256("|".join(parts).encode()).hexdigest()[:24]

    def _cache_path(self, key: str) -> Path:
        return self.cache_dir / f"{key}.json"

    def _cache_get(self, key: str) -> Optional[Any]:
        # memory cache
        if key in self._cache_memory:
            return self._cache_memory[key]
        # disk cache
        path = self._cache_path(key)
        if path.exists():
            import json
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._cache_memory[key] = data
                return data
            except Exception:
                pass
        return None

    def _cache_set(self, key: str, data: Any):
        import json
        self._cache_memory[key] = data
        path = self._cache_path(key)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as exc:
            logger.warning(f"Cache write failed for {key}: {exc}")

    # -- connection validation -----------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate connectivity to Semantic Scholar API."""
        try:
            await self._rate_limit()
            resp = await self.client.get(
                f"{self.BASE_URL}/paper/fields",
                timeout=10.0,
            )
            if resp.status_code == 200:
                logger.info(f"{self.name} connection validated")
                return True
            if resp.status_code == 429:
                logger.warning(f"{self.name} rate-limited during validation")
                return True  # API is reachable, just throttled
            logger.warning(f"{self.name} validation HTTP {resp.status_code}")
            return False
        except httpx.RequestError as exc:
            logger.error(f"{self.name} connection failed: {exc}")
            return False
        except Exception as exc:
            logger.error(f"{self.name} unexpected error: {exc}")
            return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None, _retry_count: int = 0) -> List[Dict]:
        """
        Search for papers on Semantic Scholar.

        Parameters
        ----------
        query: str
            Search query (supports boolean, fielded search)
        filters: Optional[Dict]
            - year_min / year_max: int
            - fields_of_study: List[str]
            - venue: str
            - open_access_only: bool
            - limit: int (max 100 per page)
            - offset: int
            - publication_types: List[str]
            - sort: str (relevance, citationCount, publicationDate)
        _retry_count: int (internal)
            Tracks rate-limit retries; do not set manually.

        Returns
        -------
        List[Dict] — raw paper records
        """
        filters = filters or {}
        cache_key = self._cache_key("search", query, str(sorted(filters.items())))
        cached = self._cache_get(cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for search: {query[:50]}")
            return cached

        limit = min(filters.get("limit", 20), 100)
        offset = filters.get("offset", 0)
        sort = filters.get("sort", "relevance")

        params: Dict[str, Any] = {
            "query": query,
            "fields": self.DEFAULT_PAPER_FIELDS,
            "limit": limit,
            "offset": offset,
            "sort": sort,
        }

        # Build publicationDateOrYear filter
        date_filter_parts = []
        year_min = filters.get("year_min")
        year_max = filters.get("year_max")
        if year_min or year_max:
            date_filter_parts.append("publicationDateOrYear")
            if year_min and year_max:
                date_filter_parts.append(f"{year_min}:{year_max}")
            elif year_min:
                date_filter_parts.append(f">={year_min}")
            elif year_max:
                date_filter_parts.append(f"<={year_max}")

        if date_filter_parts:
            # Complex filters go in POST body
            filter_body: Dict[str, Any] = {
                "query": query,
                "fields": self.DEFAULT_PAPER_FIELDS.split(","),
                "limit": limit,
                "offset": offset,
                "sort": sort,
            }
            if len(date_filter_parts) > 1:
                filter_body["publicationDateOrYear"] = date_filter_parts[1] if ":" in date_filter_parts[1] else date_filter_parts[1]

            fields_of_study = filters.get("fields_of_study")
            if fields_of_study:
                filter_body["fieldsOfStudy"] = fields_of_study

            venue = filters.get("venue")
            if venue:
                filter_body["venue"] = venue

            open_access_only = filters.get("open_access_only")
            if open_access_only:
                filter_body["openAccessPdf"] = {"exists": True}

            try:
                await self._rate_limit()
                resp = await self.client.post(
                    self.SEARCH_URL,
                    json=filter_body,
                    timeout=30.0,
                )
            except httpx.RequestError as exc:
                logger.error(f"{self.name} search POST request failed: {exc}")
                return []
        else:
            try:
                await self._rate_limit()
                resp = await self.client.get(
                    self.SEARCH_URL,
                    params=params,
                    timeout=30.0,
                )
            except httpx.RequestError as exc:
                logger.error(f"{self.name} search GET request failed: {exc}")
                return []

        if resp.status_code == 429:
            if _retry_count >= 3:
                logger.error(f"{self.name} rate limited after {_retry_count} retries; giving up")
                return []
            retry_after = int(resp.headers.get("Retry-After", 5))
            logger.warning(f"{self.name} rate limited. Retry after {retry_after}s")
            await __import__("asyncio").sleep(retry_after)
            return await self.search(query, filters, _retry_count=_retry_count + 1)

        if resp.status_code != 200:
            logger.error(f"{self.name} search HTTP {resp.status_code}: {resp.text[:500]}")
            return []

        try:
            data = resp.json()
        except Exception as exc:
            logger.error(f"{self.name} JSON parse error: {exc}")
            return []

        papers = data.get("data", [])
        total = data.get("total", 0)
        logger.info(f"{self.name} search '{query[:40]}' returned {len(papers)}/{total} papers")

        self._cache_set(cache_key, papers)
        return papers

    # -- paper details -------------------------------------------------------

    async def get_paper(self, paper_id: str, include_citations: bool = False) -> Optional[Dict]:
        """Fetch detailed info for a single paper by ID."""
        cache_key = self._cache_key("paper", paper_id, str(include_citations))
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        fields = "paperId,title,abstract,year,authors,venue,fieldsOfStudy,citationCount,referenceCount,influentialCitationCount,isOpenAccess,openAccessPdf,tldr"
        if include_citations:
            fields += ",citations,references"

        try:
            await self._rate_limit()
            resp = await self.client.get(
                f"{self.PAPER_URL}/{paper_id}",
                params={"fields": fields},
                timeout=30.0,
            )
            if resp.status_code == 200:
                paper = resp.json()
                self._cache_set(cache_key, paper)
                return paper
            logger.warning(f"{self.name} get_paper HTTP {resp.status_code}")
        except Exception as exc:
            logger.error(f"{self.name} get_paper error: {exc}")
        return None

    # -- recommendations -----------------------------------------------------

    async def get_recommendations(self, paper_ids: List[str], limit: int = 100) -> List[Dict]:
        """Get paper recommendations based on a list of positive paper IDs."""
        try:
            await self._rate_limit()
            resp = await self.client.post(
                f"{self.RECOMMENDATIONS_URL}/papers/",
                json={
                    "positivePaperIds": paper_ids,
                    "fields": self.DEFAULT_PAPER_FIELDS.split(","),
                    "limit": min(limit, 500),
                },
                timeout=30.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("recommendedPapers", [])
            logger.warning(f"{self.name} recommendations HTTP {resp.status_code}")
        except Exception as exc:
            logger.error(f"{self.name} recommendations error: {exc}")
        return []

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence") -> Dict:
        """
        Transform a Semantic Scholar paper record into the canonical EvidenceEntry format.
        """
        paper_id = raw_data.get("paperId", "")
        title = raw_data.get("title", "")
        abstract = raw_data.get("abstract", "")
        tldr = raw_data.get("tldr", {}).get("text", "") if isinstance(raw_data.get("tldr"), dict) else ""

        authors = raw_data.get("authors", [])
        author_names = [a.get("name", "") for a in authors if isinstance(a, dict)]

        year = raw_data.get("year")
        venue = raw_data.get("venue", "")

        citation_count = raw_data.get("citationCount", 0) or 0
        ref_count = raw_data.get("referenceCount", 0) or 0
        influential_citations = raw_data.get("influentialCitationCount", 0) or 0

        fields_of_study = raw_data.get("fieldsOfStudy", [])

        # Derive relevance to adverse events / drug safety
        ae_relevance = self._calculate_ae_relevance(title, abstract, tldr, fields_of_study)

        provenance = self.get_provenance(raw_data)
        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": paper_id,
            "title": title,
            "abstract": abstract,
            "tldr": tldr,
            "authors": author_names,
            "year": year,
            "venue": venue,
            "citation_count": citation_count,
            "reference_count": ref_count,
            "influential_citation_count": influential_citations,
            "fields_of_study": fields_of_study,
            "is_open_access": raw_data.get("isOpenAccess", False),
            "open_access_pdf": raw_data.get("openAccessPdf", {}),
            "adverse_event_relevance_score": ae_relevance,
            "confidence": confidence,
            "provenance": provenance,
            "raw_data": raw_data,
        }

    def _calculate_ae_relevance(
        self, title: str, abstract: str, tldr: str, fields_of_study: List[str]
    ) -> float:
        """Calculate how relevant a paper is to adverse event / drug safety research."""
        score = 0.0
        text = f"{title} {abstract} {tldr}".lower()

        ae_keywords = [
            "adverse", "side effect", "toxicity", "drug safety",
            "pharmacovigilance", "faers", "meddra", "adverse event",
            "adverse reaction", "drug-induced", "drug interaction",
            "contraindication", "black box", "warning",
        ]
        for kw in ae_keywords:
            if kw in text:
                score += 0.15

        if any(f in ["Medicine", "Pharmacology", "Toxicology"] for f in (fields_of_study or [])):
            score += 0.2

        return min(score, 1.0)

    # -- provenance & confidence ---------------------------------------------

    def get_provenance(self, result: Dict) -> Dict:
        year = result.get("year")
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.82,
            "research_only": True,
            "citation_metrics_available": True,
            "ai_generated_summary": bool(result.get("tldr")),
            "publication_year": year,
            "open_access": result.get("isOpenAccess", False),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute a composite confidence score for a literature result.
        Factors: citations, influential citations, open access, year.
        """
        citations = result.get("citationCount", 0) or 0
        influential = result.get("influentialCitationCount", 0) or 0
        year = result.get("year") or datetime.utcnow().year

        # Citation strength (log-scaled, cap at 1.0)
        citation_strength = min(1.0, __import__("math").log1p(citations) / 5.0) if citations > 0 else 0.1

        # Influential ratio
        influential_ratio = influential / citations if citations > 0 else 0.0
        influential_score = min(1.0, influential_ratio * 2)

        # Recency (papers from last 5 years score higher)
        age = max(0, datetime.utcnow().year - year)
        recency = max(0.0, 1.0 - age / 20.0)

        # Open access bonus
        oa_bonus = 0.15 if result.get("isOpenAccess") else 0.0

        overall = (
            citation_strength * 0.25
            + influential_score * 0.20
            + recency * 0.20
            + 0.20  # base peer-review score
            + oa_bonus
        )
        overall = min(1.0, overall)

        return {
            "data_quality": 0.80,
            "evidence_strength": round(citation_strength, 2),
            "sample_size": round(min(1.0, citations / 1000), 2),
            "replication": round(influential_score, 2),
            "consistency": 0.65,
            "temporal_relevance": round(recency, 2),
            "population_match": 0.55,  # varies by paper
            "overall": round(overall, 2),
        }

    # -- lifecycle -----------------------------------------------------------

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()
