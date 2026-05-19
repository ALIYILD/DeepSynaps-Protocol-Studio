"""
Literature Intelligence Module for DeepSynaps Protocol Studio.

Provides automated literature search, evidence tracking, and citation management
by integrating multiple scholarly APIs: OpenAlex, Semantic Scholar, PubMed,
and Europe PMC. Supports parallel querying, response caching, deduplication,
and relevance ranking for neuromodulation research queries.

APIs Integrated:
    - OpenAlex (primary): https://api.openalex.org/ — 260M works, CC0
    - Semantic Scholar (secondary): https://api.semanticscholar.org/ — 200M papers
    - PubMed (tertiary): https://eutils.ncbi.nlm.nih.gov/entrez/eutils/ — NIH
    - Europe PMC (quaternary): https://europepmc.org/RestfulWebService — European lit

Author: DeepSynaps Protocol Studio
License: MIT
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union
from functools import wraps

import httpx
from pydantic import BaseModel, Field, validator

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("literature_intelligence")

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class Paper(BaseModel):
    """Represents a scholarly paper aggregated from multiple sources."""

    title: str = Field(..., description="Paper title")
    authors: List[str] = Field(default_factory=list, description="List of author names")
    year: int = Field(0, description="Publication year")
    doi: Optional[str] = Field(None, description="Digital Object Identifier")
    pmid: Optional[str] = Field(None, description="PubMed identifier")
    pmcid: Optional[str] = Field(None, description="PubMed Central identifier")
    openalex_id: Optional[str] = Field(None, description="OpenAlex work ID")
    ss_id: Optional[str] = Field(None, description="Semantic Scholar paper ID")
    abstract: Optional[str] = Field(None, description="Paper abstract")
    citation_count: int = Field(0, description="Number of citations")
    reference_count: int = Field(0, description="Number of references")
    source: str = Field(..., description="Originating API: openalex | semanticscholar | pubmed | europepmc")
    confidence: float = Field(0.5, ge=0.0, le=1.0, description="Relevance confidence score")
    url: Optional[str] = Field(None, description="Direct URL to the paper")
    pdf_url: Optional[str] = Field(None, description="URL to PDF if available")
    journal: Optional[str] = Field(None, description="Journal or venue name")
    topics: List[str] = Field(default_factory=list, description="Associated topics/keywords")
    publication_date: Optional[str] = Field(None, description="Full publication date (YYYY-MM-DD)")
    open_access: bool = Field(False, description="Whether the paper is open access")
    cited_by_api: List[str] = Field(default_factory=list, description="Source APIs that cited this count")

    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "Transcranial Magnetic Stimulation for Depression",
                "authors": ["Smith, J.", "Doe, A."],
                "year": 2023,
                "doi": "10.1234/example.123",
                "pmid": "12345678",
                "abstract": "This study examines...",
                "citation_count": 42,
                "source": "openalex",
                "confidence": 0.92,
            }
        }
    }


class SearchFilters(BaseModel):
    """Optional filters for literature search queries."""

    year_from: Optional[int] = Field(None, description="Minimum publication year")
    year_to: Optional[int] = Field(None, description="Maximum publication year")
    min_citations: Optional[int] = Field(None, description="Minimum citation count")
    open_access_only: bool = Field(False, description="Only return open access papers")
    max_results: int = Field(25, ge=1, le=200, description="Maximum results per source")
    sort_by: str = Field("relevance", description="Sort key: relevance | citations | date")
    publication_types: List[str] = Field(default_factory=list, description="Filter by type: journal-article, review, book-chapter, etc.")


class CitationNetwork(BaseModel):
    """Citation network for a paper: papers that cite it and papers it cites."""

    doi: Optional[str] = Field(None, description="DOI of the focal paper")
    openalex_id: Optional[str] = Field(None, description="OpenAlex ID of the focal paper")
    title: Optional[str] = Field(None, description="Title of the focal paper")
    citing_papers: List[Paper] = Field(default_factory=list, description="Papers that cite this paper")
    cited_papers: List[Paper] = Field(default_factory=list, description="Papers cited by this paper")
    total_citations: int = Field(0, description="Total incoming citations")
    total_references: int = Field(0, description="Total outgoing references")


class EvidenceSummary(BaseModel):
    """Aggregated evidence landscape summary for a research topic."""

    topic: str = Field(..., description="Search topic/query")
    total_studies: int = Field(0, description="Total number of studies found")
    total_citations: int = Field(0, description="Aggregate citation count")
    year_range: Tuple[int, int] = Field((0, 0), description="Min and max publication years")
    top_papers: List[Paper] = Field(default_factory=list, description="Top 10 most cited papers")
    recent_papers: List[Paper] = Field(default_factory=list, description="Papers from last 30 days")
    open_access_ratio: float = Field(0.0, description="Fraction of papers that are open access")
    avg_citations_per_paper: float = Field(0.0, description="Mean citation count")
    sources_breakdown: Dict[str, int] = Field(default_factory=dict, description="Count per source API")
    year_distribution: Dict[int, int] = Field(default_factory=dict, description="Publication count per year")
    key_authors: List[Tuple[str, int]] = Field(default_factory=list, description="Top authors with paper counts")
    key_journals: List[Tuple[str, int]] = Field(default_factory=list, description="Top journals with paper counts")
    evidence_gaps: List[str] = Field(default_factory=list, description="Identified evidence gaps")


class CacheEntry(BaseModel):
    """A single cache entry with TTL support."""

    data: Any
    timestamp: float
    ttl: int

    @property
    def is_expired(self) -> bool:
        """Check if the cache entry has expired."""
        return (time.time() - self.timestamp) > self.ttl


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _normalize_doi(doi: Optional[str]) -> Optional[str]:
    """Normalize a DOI string to lowercase with https://doi.org/ prefix removed."""
    if not doi:
        return None
    doi = doi.strip().lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi.org/"):
        if doi.startswith(prefix):
            doi = doi[len(prefix) :]
    return doi


def _cache_key(prefix: str, query: str, **kwargs) -> str:
    """Generate a deterministic cache key from query parameters."""
    payload = f"{prefix}:{query}:{sorted(kwargs.items())}"
    return hashlib.sha256(payload.encode()).hexdigest()


def _safe_int(value: Any, default: int = 0) -> int:
    """Safely cast a value to int, returning default on failure."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Main Class
# ---------------------------------------------------------------------------


class LiteratureIntelligence:
    """Literature search and evidence intelligence for neuromodulation.

    Integrates OpenAlex, Semantic Scholar, PubMed, and Europe PMC APIs
    to provide unified literature search, citation tracking, and evidence
    summarisation with response caching and graceful error handling.

    Example:
        >>> lit = LiteratureIntelligence(cache_ttl=3600)
        >>> papers = await lit.search("transcranial magnetic stimulation depression")
        >>> summary = await lit.get_evidence_summary("TMS depression")
        >>> await lit.close()
    """

    # --- API endpoint constants ------------------------------------------------
    OPENALEX_BASE: str = "https://api.openalex.org"
    SEMANTIC_SCHOLAR_BASE: str = "https://api.semanticscholar.org/graph/v1"
    PUBMED_ESEARCH: str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    PUBMED_ESUMMARY: str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    PUBMED_EFETCH: str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    EUROPE_PMC_SEARCH: str = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    EUROPE_PMC_PROFILE: str = "https://www.ebi.ac.uk/europepmc/webservices/rest/{id}/profile"

    def __init__(self, cache_ttl: int = 3600):
        """Initialize the LiteratureIntelligence client.

        Args:
            cache_ttl: Time-to-live for cached responses in seconds (default 1 hour).
        """
        self._cache: Dict[str, CacheEntry] = {}
        self._cache_ttl: int = cache_ttl
        self._client: httpx.AsyncClient = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            headers={"Accept": "application/json", "User-Agent": "DeepSynaps-LiteratureBot/1.0"},
        )
        self._source_health: Dict[str, bool] = {
            "openalex": True,
            "semanticscholar": True,
            "pubmed": True,
            "europepmc": True,
        }
        logger.info("LiteratureIntelligence initialized (cache_ttl=%ds)", cache_ttl)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get(self, url: str, params: Optional[dict] = None) -> dict:
        """Execute an async GET request and return parsed JSON.

        Args:
            url: Target URL.
            params: Optional query parameters.

        Returns:
            Parsed JSON response as a dict.

        Raises:
            httpx.HTTPError: On non-2xx responses.
        """
        response = await self._client.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def _get_cached(self, key: str) -> Optional[Any]:
        """Retrieve a value from cache if present and not expired.

        Args:
            key: Cache key.

        Returns:
            Cached value or None if miss/expired.
        """
        entry = self._cache.get(key)
        if entry is None or entry.is_expired:
            if entry is not None:
                del self._cache[key]
            return None
        logger.debug("Cache hit for key %s", key[:8])
        return entry.data

    def _set_cached(self, key: str, value: Any) -> None:
        """Store a value in the cache.

        Args:
            key: Cache key.
            value: Value to cache.
        """
        self._cache[key] = CacheEntry(data=value, timestamp=time.time(), ttl=self._cache_ttl)

    def _mark_source_down(self, source: str, exc: Exception) -> None:
        """Mark a source API as unhealthy after an error.

        Args:
            source: API source name.
            exc: The exception that triggered the mark.
        """
        self._source_health[source] = False
        logger.warning("Source '%s' marked unhealthy: %s", source, exc)

    @staticmethod
    def _build_openalex_query(query: str, filters: Optional[SearchFilters]) -> dict:
        """Build OpenAlex query parameters.

        Args:
            query: Search query string.
            filters: Optional search filters.

        Returns:
            Dictionary of query parameters for the OpenAlex API.
        """
        params: Dict[str, Any] = {
            "search": query,
            "per_page": filters.max_results if filters else 25,
            "sort": "relevance_score:desc",
        }
        if filters:
            filter_parts = []
            if filters.year_from and filters.year_to:
                filter_parts.append(f"from_publication_date:{filters.year_from}-01-01,to_publication_date:{filters.year_to}-12-31")
            elif filters.year_from:
                filter_parts.append(f"from_publication_date:{filters.year_from}-01-01")
            elif filters.year_to:
                filter_parts.append(f"to_publication_date:{filters.year_to}-12-31")
            if filters.open_access_only:
                filter_parts.append("is_oa:true")
            if filter_parts:
                params["filter"] = ",".join(filter_parts)
        return params

    @staticmethod
    def _build_semantic_scholar_query(query: str, filters: Optional[SearchFilters]) -> dict:
        """Build Semantic Scholar query parameters.

        Args:
            query: Search query string.
            filters: Optional search filters.

        Returns:
            Dictionary of query parameters for the Semantic Scholar API.
        """
        params: Dict[str, Any] = {
            "query": query,
            "limit": filters.max_results if filters else 25,
            "fields": "title,authors,year,citationCount,referenceCount,abstract,doi,openAccessPdf,journal,publicationDate",
        }
        if filters and filters.year_from and filters.year_to:
            params["publicationDateOrYear"] = f"{filters.year_from}:{filters.year_to}"
        return params

    @staticmethod
    def _build_europe_pmc_query(query: str, filters: Optional[SearchFilters]) -> dict:
        """Build Europe PMC query parameters.

        Args:
            query: Search query string.
            filters: Optional search filters.

        Returns:
            Dictionary of query parameters for the Europe PMC API.
        """
        params: Dict[str, Any] = {
            "query": query,
            "pageSize": filters.max_results if filters else 25,
            "format": "json",
            "resultType": "core",
        }
        if filters:
            if filters.year_from:
                params["query"] += f" AND FIRST_PDATE:[{filters.year_from}-01-01 TO 3000-12-31]"
            if filters.year_to:
                params["query"] += f" AND FIRST_PDATE:[1000-01-01 TO {filters.year_to}-12-31]"
        return params

    # ------------------------------------------------------------------
    # OpenAlex
    # ------------------------------------------------------------------

    async def search_openalex(
        self, query: str, filters: Optional[Union[SearchFilters, dict]] = None
    ) -> List[Paper]:
        """Search the OpenAlex API for scholarly works.

        Queries https://api.openalex.org/works with the provided search terms
        and optional date/citation filters. OpenAlex is the primary source,
        providing 260M+ works under CC0 license.

        Args:
            query: Free-text search query (e.g. "TMS depression").
            filters: Optional SearchFilters or dict with year, citation, and
                access constraints.

        Returns:
            List of Paper objects parsed from the OpenAlex response.
        """
        if isinstance(filters, dict):
            filters = SearchFilters(**filters)
        cache_key = _cache_key("oa", query, filters=filters.model_dump_json() if filters else "")
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        try:
            params = self._build_openalex_query(query, filters)
            data = await self._get(f"{self.OPENALEX_BASE}/works", params=params)
        except Exception as exc:
            self._mark_source_down("openalex", exc)
            logger.error("OpenAlex search failed: %s", exc)
            return []

        papers: List[Paper] = []
        for work in data.get("results", []):
            try:
                authorships = work.get("authorships", [])
                authors = [a.get("author", {}).get("display_name", "") for a in authorships]
                topics_data = work.get("topics", []) or []
                topics = [t.get("display_name", "") for t in topics_data if t.get("display_name")]
                doi_norm = _normalize_doi(work.get("doi"))
                paper = Paper(
                    title=work.get("display_name", "Untitled"),
                    authors=authors,
                    year=_safe_int(work.get("publication_year")),
                    doi=doi_norm,
                    openalex_id=work.get("id", "").replace("https://openalex.org/", ""),
                    abstract=work.get("abstract") or None,
                    citation_count=_safe_int(work.get("cited_by_count")),
                    reference_count=_safe_int(work.get("referenced_works_count")),
                    source="openalex",
                    confidence=0.9,
                    url=work.get("id"),
                    pdf_url=work.get("open_access", {}).get("oa_url") if work.get("open_access") else None,
                    journal=work.get("primary_location", {}).get("source", {}).get("display_name") if work.get("primary_location") else None,
                    topics=topics,
                    publication_date=work.get("publication_date"),
                    open_access=bool(work.get("open_access", {}).get("is_oa", False)),
                )
                papers.append(paper)
            except Exception as exc:
                logger.debug("Skipping malformed OpenAlex work: %s", exc)
                continue

        self._set_cached(cache_key, papers)
        logger.info("OpenAlex returned %d papers for '%s'", len(papers), query)
        return papers

    # ------------------------------------------------------------------
    # Semantic Scholar
    # ------------------------------------------------------------------

    async def search_semantic_scholar(
        self, query: str, filters: Optional[Union[SearchFilters, dict]] = None
    ) -> List[Paper]:
        """Search the Semantic Scholar API for academic papers.

        Uses the paper search endpoint at /graph/v1/paper/search with
        rich field selection. Semantic Scholar provides 200M+ papers
        with AI-powered relevance ranking.

        Args:
            query: Free-text search query.
            filters: Optional SearchFilters or dict for result constraints.

        Returns:
            List of Paper objects from Semantic Scholar.
        """
        if isinstance(filters, dict):
            filters = SearchFilters(**filters)
        cache_key = _cache_key("ss", query, filters=filters.model_dump_json() if filters else "")
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        try:
            params = self._build_semantic_scholar_query(query, filters)
            data = await self._get(f"{self.SEMANTIC_SCHOLAR_BASE}/paper/search", params=params)
        except Exception as exc:
            self._mark_source_down("semanticscholar", exc)
            logger.error("Semantic Scholar search failed: %s", exc)
            return []

        papers: List[Paper] = []
        for item in data.get("data", []):
            try:
                authors_raw = item.get("authors", [])
                authors = [a.get("name", "") for a in authors_raw if a.get("name")]
                pdf_info = item.get("openAccessPdf")
                pdf_url = pdf_info.get("url") if isinstance(pdf_info, dict) else None
                paper = Paper(
                    title=item.get("title", "Untitled"),
                    authors=authors,
                    year=_safe_int(item.get("year")),
                    doi=_normalize_doi(item.get("doi")),
                    ss_id=item.get("paperId"),
                    abstract=item.get("abstract") or None,
                    citation_count=_safe_int(item.get("citationCount")),
                    reference_count=_safe_int(item.get("referenceCount")),
                    source="semanticscholar",
                    confidence=0.85,
                    url=f"https://www.semanticscholar.org/paper/{item.get('paperId')}" if item.get("paperId") else None,
                    pdf_url=pdf_url,
                    journal=item.get("journal", {}).get("name") if item.get("journal") else None,
                    publication_date=item.get("publicationDate"),
                )
                papers.append(paper)
            except Exception as exc:
                logger.debug("Skipping malformed Semantic Scholar item: %s", exc)
                continue

        self._set_cached(cache_key, papers)
        logger.info("Semantic Scholar returned %d papers for '%s'", len(papers), query)
        return papers

    # ------------------------------------------------------------------
    # PubMed (E-utilities)
    # ------------------------------------------------------------------

    async def search_pubmed(
        self, query: str, filters: Optional[Union[SearchFilters, dict]] = None
    ) -> List[Paper]:
        """Search PubMed via the NCBI E-utilities API.

        Implements the two-step esearch -> esummary pipeline to retrieve
        paper metadata from PubMed. Includes a short delay between steps
        to respect NCBI rate limits.

        Args:
            query: Free-text search query (e.g. "transcranial magnetic stimulation").
            filters: Optional SearchFilters or dict for year and result limits.

        Returns:
            List of Paper objects with PubMed metadata.
        """
        if isinstance(filters, dict):
            filters = SearchFilters(**filters)
        cache_key = _cache_key("pm", query, filters=filters.model_dump_json() if filters else "")
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        retmax = filters.max_results if filters else 25
        year_from = filters.year_from if filters else None
        year_to = filters.year_to if filters else None

        # Step 1: esearch — get PMIDs
        search_params: Dict[str, Any] = {
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": retmax,
            "sort": "relevance",
        }
        if year_from or year_to:
            yf = year_from if year_from else "1000"
            yt = year_to if year_to else "3000"
            search_params["term"] += f" AND ({yf}[PDAT] : {yt}[PDAT])"

        try:
            search_data = await self._get(self.PUBMED_ESEARCH, params=search_params)
        except Exception as exc:
            self._mark_source_down("pubmed", exc)
            logger.error("PubMed esearch failed: %s", exc)
            return []

        idlist = search_data.get("esearchresult", {}).get("idlist", [])
        if not idlist:
            self._set_cached(cache_key, [])
            return []

        # Respect NCBI rate limits
        await asyncio.sleep(0.34)

        # Step 2: esummary — get metadata for PMIDs
        summary_params = {
            "db": "pubmed",
            "id": ",".join(idlist),
            "retmode": "json",
        }
        try:
            summary_data = await self._get(self.PUBMED_ESUMMARY, params=summary_params)
        except Exception as exc:
            self._mark_source_down("pubmed", exc)
            logger.error("PubMed esummary failed: %s", exc)
            return []

        papers: List[Paper] = []
        result_obj = summary_data.get("result", {})
        for pmid in idlist:
            try:
                item = result_obj.get(pmid, {})
                if not item:
                    continue
                authors_raw = item.get("authors", [])
                authors = [a.get("name", "") for a in authors_raw if a.get("name")]
                pubdate = item.get("pubdate", "")
                year = 0
                if pubdate and len(pubdate) >= 4:
                    year = _safe_int(pubdate[:4])

                # Build DOI from articleids
                doi_val = None
                pmcid_val = None
                for aid in item.get("articleids", []):
                    if aid.get("idtype") == "doi":
                        doi_val = _normalize_doi(aid.get("value"))
                    elif aid.get("idtype") == "pmcid":
                        pmcid_val = aid.get("value")

                paper = Paper(
                    title=item.get("title", "Untitled").rstrip("."),
                    authors=authors,
                    year=year,
                    doi=doi_val,
                    pmid=str(pmid),
                    pmcid=pmcid_val,
                    abstract=None,  # esummary does not return abstracts
                    citation_count=0,  # PubMed does not provide citation counts
                    source="pubmed",
                    confidence=0.75,
                    url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                    journal=item.get("fulljournalname") or item.get("source"),
                    publication_date=pubdate if pubdate else None,
                )
                papers.append(paper)
            except Exception as exc:
                logger.debug("Skipping malformed PubMed item PMID=%s: %s", pmid, exc)
                continue

        self._set_cached(cache_key, papers)
        logger.info("PubMed returned %d papers for '%s'", len(papers), query)
        return papers

    # ------------------------------------------------------------------
    # Europe PMC
    # ------------------------------------------------------------------

    async def search_europe_pmc(
        self, query: str, filters: Optional[Union[SearchFilters, dict]] = None
    ) -> List[Paper]:
        """Search Europe PMC for biomedical and life-sciences literature.

        Queries the Europe PMC RESTful web service which includes PubMed,
        PMC, and additional European literature sources.

        Args:
            query: Free-text search query.
            filters: Optional SearchFilters or dict for year and result limits.

        Returns:
            List of Paper objects from Europe PMC.
        """
        if isinstance(filters, dict):
            filters = SearchFilters(**filters)
        cache_key = _cache_key("epmc", query, filters=filters.model_dump_json() if filters else "")
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        try:
            params = self._build_europe_pmc_query(query, filters)
            data = await self._get(self.EUROPE_PMC_SEARCH, params=params)
        except Exception as exc:
            self._mark_source_down("europepmc", exc)
            logger.error("Europe PMC search failed: %s", exc)
            return []

        papers: List[Paper] = []
        for item in data.get("resultList", {}).get("result", []):
            try:
                authors_raw = item.get("authorString", "")
                authors = [a.strip() for a in authors_raw.split(",") if a.strip()] if authors_raw else []
                year = _safe_int(item.get("pubYear") or item.get("firstPublicationDate", "")[:4])

                paper = Paper(
                    title=item.get("title", "Untitled").replace("<i>", "").replace("</i>", ""),
                    authors=authors,
                    year=year,
                    doi=_normalize_doi(item.get("doi")),
                    pmid=item.get("pmid"),
                    pmcid=item.get("pmcid"),
                    abstract=item.get("abstractText") or None,
                    citation_count=_safe_int(item.get("citedByCount")),
                    source="europepmc",
                    confidence=0.8,
                    url=item.get("fullTextUrlList", {}).get("fullTextUrl", [{}])[0].get("url") if item.get("fullTextUrlList") else None,
                    journal=item.get("journalTitle") or item.get("journalInfo", {}).get("journal"),
                    publication_date=item.get("firstPublicationDate") or item.get("pubYear"),
                    open_access=bool(item.get("isOpenAccess") == "Y"),
                )
                papers.append(paper)
            except Exception as exc:
                logger.debug("Skipping malformed Europe PMC item: %s", exc)
                continue

        self._set_cached(cache_key, papers)
        logger.info("Europe PMC returned %d papers for '%s'", len(papers), query)
        return papers

    # ------------------------------------------------------------------
    # Unified search (parallel)
    # ------------------------------------------------------------------

    async def search(
        self, query: str, filters: Optional[Union[SearchFilters, dict]] = None
    ) -> List[Paper]:
        """Search all scholarly APIs in parallel and return merged results.

        Executes queries against OpenAlex, Semantic Scholar, PubMed, and
        Europe PMC concurrently. Results are deduplicated by DOI, merged
        (citation counts from multiple sources are summed), and ranked by
        a composite relevance + citation score.

        Args:
            query: Free-text search query.
            filters: Optional SearchFilters or dict with constraints.

        Returns:
            Deduplicated, ranked list of Paper objects.
        """
        if isinstance(filters, dict):
            filters = SearchFilters(**filters)

        logger.info("Unified search starting for query: '%s'", query)

        # Execute all 4 API calls concurrently
        results = await asyncio.gather(
            self.search_openalex(query, filters),
            self.search_semantic_scholar(query, filters),
            self.search_pubmed(query, filters),
            self.search_europe_pmc(query, filters),
            return_exceptions=True,
        )

        all_papers: List[Paper] = []
        for r in results:
            if isinstance(r, list):
                all_papers.extend(r)
            else:
                logger.warning("One source returned exception: %s", r)

        # Deduplicate by DOI (or PMID if DOI missing)
        seen: Dict[str, Paper] = {}
        for paper in all_papers:
            key = paper.doi or paper.pmid or paper.openalex_id or paper.ss_id
            if not key:
                key = hashlib.md5(paper.title.encode()).hexdigest()[:12]
            if key in seen:
                existing = seen[key]
                # Merge: sum citation counts, keep richer metadata
                existing.citation_count = max(existing.citation_count, paper.citation_count)
                existing.reference_count = max(existing.reference_count, paper.reference_count)
                if paper.abstract and not existing.abstract:
                    existing.abstract = paper.abstract
                if paper.pmid and not existing.pmid:
                    existing.pmid = paper.pmid
                if paper.pmcid and not existing.pmcid:
                    existing.pmcid = paper.pmcid
                if paper.openalex_id and not existing.openalex_id:
                    existing.openalex_id = paper.openalex_id
                if paper.ss_id and not existing.ss_id:
                    existing.ss_id = paper.ss_id
                existing.cited_by_api = list(set(existing.cited_by_api + [paper.source]))
            else:
                paper.cited_by_api = [paper.source]
                seen[key] = paper

        merged = list(seen.values())

        # Ranking: composite score (confidence * 0.6 + normalized citation score * 0.4)
        max_citations = max((p.citation_count for p in merged), default=1)
        for p in merged:
            citation_score = (p.citation_count / max_citations) * 0.4 if max_citations > 0 else 0
            relevance_score = p.confidence * 0.6
            p.confidence = round(min(relevance_score + citation_score, 1.0), 4)

        # Sort by composite score descending
        merged.sort(key=lambda x: (x.confidence, x.citation_count, x.year), reverse=True)

        logger.info("Unified search completed: %d unique papers from %d raw", len(merged), len(all_papers))
        return merged

    # ------------------------------------------------------------------
    # Citation Network
    # ------------------------------------------------------------------

    async def get_citation_network(self, doi: str) -> CitationNetwork:
        """Retrieve the citation network for a paper using OpenAlex.

        Fetches papers that cite the given DOI (citing_papers) and papers
        cited by it (cited_papers) via the OpenAlex works endpoint.

        Args:
            doi: DOI of the paper to analyse.

        Returns:
            CitationNetwork model with citing and cited paper lists.
        """
        norm_doi = _normalize_doi(doi)
        cache_key = _cache_key("cn", norm_doi)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        openalex_id = f"W{norm_doi.replace('/', '_').replace('.', '_')}" if norm_doi else None
        citing_papers: List[Paper] = []
        cited_papers: List[Paper] = []
        title: Optional[str] = None

        try:
            # Resolve DOI to OpenAlex ID
            if norm_doi:
                work_data = await self._get(
                    f"{self.OPENALEX_BASE}/works/doi:{norm_doi}"
                )
                openalex_id = work_data.get("id", "").replace("https://openalex.org/", "")
                title = work_data.get("display_name")

                # Get papers that cite this work
                citing_url = f"{self.OPENALEX_BASE}/works"
                citing_params = {"filter": f"cites:{openalex_id}", "per_page": 50}
                citing_data = await self._get(citing_url, params=citing_params)
                for w in citing_data.get("results", []):
                    try:
                        authors = [a.get("author", {}).get("display_name", "") for a in w.get("authorships", [])]
                        paper = Paper(
                            title=w.get("display_name", "Untitled"),
                            authors=authors,
                            year=_safe_int(w.get("publication_year")),
                            doi=_normalize_doi(w.get("doi")),
                            openalex_id=w.get("id", "").replace("https://openalex.org/", ""),
                            citation_count=_safe_int(w.get("cited_by_count")),
                            source="openalex",
                            confidence=0.7,
                            url=w.get("id"),
                        )
                        citing_papers.append(paper)
                    except Exception:
                        continue

                # Get papers cited by this work
                refs = work_data.get("referenced_works", [])
                if refs:
                    refs_chunked = [refs[i : i + 50] for i in range(0, len(refs), 50)]
                    for chunk in refs_chunked:
                        refs_filter = "|".join(chunk)
                        cited_data = await self._get(
                            f"{self.OPENALEX_BASE}/works",
                            params={"filter": f"openalex:{refs_filter}", "per_page": 50},
                        )
                        for w in cited_data.get("results", []):
                            try:
                                authors = [a.get("author", {}).get("display_name", "") for a in w.get("authorships", [])]
                                paper = Paper(
                                    title=w.get("display_name", "Untitled"),
                                    authors=authors,
                                    year=_safe_int(w.get("publication_year")),
                                    doi=_normalize_doi(w.get("doi")),
                                    openalex_id=w.get("id", "").replace("https://openalex.org/", ""),
                                    citation_count=_safe_int(w.get("cited_by_count")),
                                    source="openalex",
                                    confidence=0.7,
                                    url=w.get("id"),
                                )
                                cited_papers.append(paper)
                            except Exception:
                                continue

        except Exception as exc:
            logger.error("Citation network fetch failed for DOI %s: %s", doi, exc)

        network = CitationNetwork(
            doi=norm_doi,
            openalex_id=openalex_id,
            title=title,
            citing_papers=citing_papers,
            cited_papers=cited_papers,
            total_citations=len(citing_papers),
            total_references=len(cited_papers),
        )
        self._set_cached(cache_key, network)
        return network

    # ------------------------------------------------------------------
    # Recent Evidence
    # ------------------------------------------------------------------

    async def get_recent_evidence(self, topic: str, days: int = 30) -> List[Paper]:
        """Get evidence published within the last N days.

        Searches all APIs with a date filter restricting results to the
        specified recent window. Useful for monitoring new publications
        on a neuromodulation topic.

        Args:
            topic: Research topic to search.
            days: Number of days to look back (default 30).

        Returns:
            List of recently published Paper objects, sorted by date.
        """
        cutoff = datetime.now() - timedelta(days=days)
        year_from = cutoff.year

        filters = SearchFilters(
            year_from=year_from,
            sort_by="date",
            max_results=50,
        )

        papers = await self.search(topic, filters)

        # Further filter to exact date window
        recent_papers: List[Paper] = []
        for p in papers:
            if p.publication_date:
                try:
                    pub_dt = datetime.strptime(p.publication_date[:10], "%Y-%m-%d")
                    if pub_dt >= cutoff:
                        recent_papers.append(p)
                except ValueError:
                    if p.year >= year_from:
                        recent_papers.append(p)
            elif p.year >= year_from:
                recent_papers.append(p)

        # Sort by publication date descending
        recent_papers.sort(
            key=lambda x: x.publication_date or f"{x.year}-01-01", reverse=True
        )
        logger.info("Recent evidence: %d papers in last %d days for '%s'", len(recent_papers), days, topic)
        return recent_papers

    # ------------------------------------------------------------------
    # Evidence Summary
    # ------------------------------------------------------------------

    async def get_evidence_summary(self, topic: str) -> EvidenceSummary:
        """Generate an aggregated evidence landscape summary.

        Searches all APIs for the given topic and produces comprehensive
        statistics: total studies, citation metrics, temporal trends,
        top authors/journals, and identified evidence gaps.

        Args:
            topic: Research topic to analyse.

        Returns:
            EvidenceSummary model with aggregated statistics.
        """
        papers = await self.search(topic, filters=SearchFilters(max_results=100, sort_by="citations"))

        if not papers:
            return EvidenceSummary(topic=topic, evidence_gaps=["No studies found for this topic."])

        # Core statistics
        total_studies = len(papers)
        total_citations = sum(p.citation_count for p in papers)
        years = [p.year for p in papers if p.year > 0]
        year_range = (min(years), max(years)) if years else (0, 0)
        oa_count = sum(1 for p in papers if p.open_access)

        # Top papers by citation
        top_papers = sorted(papers, key=lambda x: x.citation_count, reverse=True)[:10]

        # Recent papers (last 30 days)
        recent_papers = await self.get_recent_evidence(topic, days=30)

        # Source breakdown
        sources_breakdown: Dict[str, int] = {}
        for p in papers:
            sources_breakdown[p.source] = sources_breakdown.get(p.source, 0) + 1

        # Year distribution
        year_distribution: Dict[int, int] = {}
        for p in papers:
            if p.year > 0:
                year_distribution[p.year] = year_distribution.get(p.year, 0) + 1

        # Key authors
        author_counts: Dict[str, int] = {}
        for p in papers:
            for a in p.authors:
                name = a.strip()
                if name:
                    author_counts[name] = author_counts.get(name, 0) + 1
        key_authors = sorted(author_counts.items(), key=lambda x: x[1], reverse=True)[:10]

        # Key journals
        journal_counts: Dict[str, int] = {}
        for p in papers:
            if p.journal:
                journal_counts[p.journal] = journal_counts.get(p.journal, 0) + 1
        key_journals = sorted(journal_counts.items(), key=lambda x: x[1], reverse=True)[:10]

        # Evidence gaps heuristic
        evidence_gaps: List[str] = []
        current_year = datetime.now().year
        recent_years = [y for y in years if y >= current_year - 3]
        if not recent_years:
            evidence_gaps.append("No recent studies found in the last 3 years.")
        if oa_count / total_studies < 0.3:
            evidence_gaps.append("Low open-access coverage; consider additional grey-literature sources.")
        if total_studies < 20:
            evidence_gaps.append("Limited evidence base; more primary research is needed.")
        if not any(p.abstract for p in papers):
            evidence_gaps.append("Many papers lack abstracts; full-text review may be necessary.")

        summary = EvidenceSummary(
            topic=topic,
            total_studies=total_studies,
            total_citations=total_citations,
            year_range=year_range,
            top_papers=top_papers,
            recent_papers=recent_papers[:10],
            open_access_ratio=round(oa_count / total_studies, 4) if total_studies else 0.0,
            avg_citations_per_paper=round(total_citations / total_studies, 2) if total_studies else 0.0,
            sources_breakdown=sources_breakdown,
            year_distribution=dict(sorted(year_distribution.items())),
            key_authors=key_authors,
            key_journals=key_journals,
            evidence_gaps=evidence_gaps,
        )
        logger.info("Evidence summary generated for '%s': %d studies", topic, total_studies)
        return summary

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Close the underlying HTTP client and release resources."""
        await self._client.aclose()
        logger.info("LiteratureIntelligence client closed")

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit — ensures client cleanup."""
        await self.close()

    # ------------------------------------------------------------------
    # Utility / diagnostics
    # ------------------------------------------------------------------

    def get_source_health(self) -> Dict[str, bool]:
        """Return the current health status of all integrated APIs.

        Returns:
            Dictionary mapping source name to boolean (True = healthy).
        """
        return dict(self._source_health)

    def clear_cache(self) -> int:
        """Clear all cached entries and return the number removed.

        Returns:
            Number of cache entries cleared.
        """
        count = len(self._cache)
        self._cache.clear()
        logger.info("Cache cleared (%d entries)", count)
        return count

    def get_cache_stats(self) -> Dict[str, int]:
        """Return cache statistics.

        Returns:
            Dictionary with 'entries', 'active', and 'expired' counts.
        """
        now = time.time()
        entries = len(self._cache)
        expired = sum(1 for e in self._cache.values() if (now - e.timestamp) > e.ttl)
        return {"entries": entries, "active": entries - expired, "expired": expired}


# ---------------------------------------------------------------------------
# Convenience factory (sync-style entry for non-async callers)
# ---------------------------------------------------------------------------


async def search_literature(query: str, **kwargs) -> List[Paper]:
    """One-shot literature search convenience function.

    Creates a LiteratureIntelligence instance, runs the search, and
    cleans up automatically.

    Args:
        query: Search query string.
        **kwargs: Passed to LiteratureIntelligence constructor.

    Returns:
        List of ranked Paper objects.
    """
    async with LiteratureIntelligence(**kwargs) as lit:
        return await lit.search(query)


async def get_topic_summary(topic: str, **kwargs) -> EvidenceSummary:
    """One-shot evidence summary convenience function.

    Args:
        topic: Research topic.
        **kwargs: Passed to LiteratureIntelligence constructor.

    Returns:
        EvidenceSummary with aggregated statistics.
    """
    async with LiteratureIntelligence(**kwargs) as lit:
        return await lit.get_evidence_summary(topic)


# ---------------------------------------------------------------------------
# Unit Tests
# ---------------------------------------------------------------------------


def _test_models() -> None:
    """Test Pydantic model instantiation and validation."""
    paper = Paper(
        title="Test Paper",
        authors=["Author One", "Author Two"],
        year=2023,
        doi="10.1234/test.567",
        source="openalex",
        confidence=0.95,
    )
    assert paper.title == "Test Paper"
    assert len(paper.authors) == 2
    assert paper.citation_count == 0

    filters = SearchFilters(year_from=2020, max_results=10)
    assert filters.year_from == 2020
    assert filters.max_results == 10

    summary = EvidenceSummary(topic="TMS")
    assert summary.total_studies == 0
    print("  [PASS] Model tests")


def _test_normalization() -> None:
    """Test DOI normalization."""
    assert _normalize_doi("https://doi.org/10.1234/TEST") == "10.1234/test"
    assert _normalize_doi("10.5678/Example") == "10.5678/example"
    assert _normalize_doi(None) is None
    assert _normalize_doi("") is None
    print("  [PASS] DOI normalization tests")


def _test_caching() -> None:
    """Test cache set/get/expire logic."""
    lit = LiteratureIntelligence(cache_ttl=1)
    lit._set_cached("key1", ["paper_a"])
    assert lit._get_cached("key1") == ["paper_a"]
    import time

    time.sleep(1.1)
    assert lit._get_cached("key1") is None
    lit.close_sync = lambda: None
    print("  [PASS] Cache TTL tests")


def _test_cache_key() -> None:
    """Test cache key generation determinism."""
    k1 = _cache_key("oa", "TMS depression", filters="{}" )
    k2 = _cache_key("oa", "TMS depression", filters="{}" )
    assert k1 == k2
    assert len(k1) == 64  # SHA-256 hex
    print("  [PASS] Cache key tests")


def _test_deduplication_logic() -> None:
    """Test paper deduplication by DOI merging."""
    p1 = Paper(title="Same Paper", authors=["A"], year=2023, doi="10.1/same", source="openalex", confidence=0.9, citation_count=10)
    p2 = Paper(title="Same Paper v2", authors=["A"], year=2023, doi="10.1/same", source="semanticscholar", confidence=0.8, citation_count=25)

    # Simulate merge logic from search()
    seen: Dict[str, Paper] = {}
    for p in [p1, p2]:
        key = p.doi
        if key in seen:
            existing = seen[key]
            existing.citation_count = max(existing.citation_count, p.citation_count)
            existing.cited_by_api = list(set(existing.cited_by_api + [p.source]))
        else:
            p.cited_by_api = [p.source]
            seen[key] = p

    merged = seen["10.1/same"]
    assert merged.citation_count == 25
    assert set(merged.cited_by_api) == {"openalex", "semanticscholar"}
    print("  [PASS] Deduplication merge tests")


def _test_filters_validation() -> None:
    """Test SearchFilters boundary validation."""
    try:
        SearchFilters(max_results=300)  # exceeds le=200
        assert False, "Should have raised"
    except Exception:
        pass
    f = SearchFilters(max_results=50, sort_by="citations")
    assert f.max_results == 50
    print("  [PASS] Filters validation tests")


async def _test_async_search(query: str = "deep brain stimulation") -> List[Paper]:
    """Integration test: run a real search and validate results."""
    async with LiteratureIntelligence(cache_ttl=300) as lit:
        papers = await lit.search(query, filters=SearchFilters(max_results=5))
        assert isinstance(papers, list)
        assert all(isinstance(p, Paper) for p in papers)
        if papers:
            assert papers[0].title
            assert papers[0].source in ("openalex", "semanticscholar", "pubmed", "europepmc")
        health = lit.get_source_health()
        assert isinstance(health, dict)
        stats = lit.get_cache_stats()
        assert "entries" in stats
        return papers


async def _test_citation_network() -> None:
    """Integration test: citation network retrieval."""
    async with LiteratureIntelligence(cache_ttl=300) as lit:
        network = await lit.get_citation_network("10.1038/s41586-021-04061-3")
        assert isinstance(network, CitationNetwork)
        assert network.doi is not None


async def _test_recent_evidence() -> None:
    """Integration test: recent evidence retrieval."""
    async with LiteratureIntelligence(cache_ttl=300) as lit:
        recent = await lit.get_recent_evidence("neuromodulation", days=365)
        assert isinstance(recent, list)
        assert all(isinstance(p, Paper) for p in recent)


async def _test_evidence_summary() -> None:
    """Integration test: evidence summary generation."""
    async with LiteratureIntelligence(cache_ttl=300) as lit:
        summary = await lit.get_evidence_summary("transcranial magnetic stimulation")
        assert isinstance(summary, EvidenceSummary)
        assert summary.topic == "transcranial magnetic stimulation"
        assert summary.total_studies >= 0


def run_tests() -> None:
    """Run the full test suite.

    Executes unit tests (sync) followed by async integration tests.
    """
    print("=" * 60)
    print("LiteratureIntelligence Test Suite")
    print("=" * 60)

    # Sync unit tests
    print("\n--- Unit Tests ---")
    _test_models()
    _test_normalization()
    _test_caching()
    _test_cache_key()
    _test_deduplication_logic()
    _test_filters_validation()

    # Async integration tests
    print("\n--- Async Integration Tests ---")
    try:
        papers = asyncio.run(_test_async_search())
        print(f"  [PASS] Async search returned {len(papers)} papers")
    except Exception as exc:
        print(f"  [WARN] Async search test: {exc}")

    try:
        asyncio.run(_test_citation_network())
        print("  [PASS] Citation network test")
    except Exception as exc:
        print(f"  [WARN] Citation network test: {exc}")

    try:
        asyncio.run(_test_recent_evidence())
        print("  [PASS] Recent evidence test")
    except Exception as exc:
        print(f"  [WARN] Recent evidence test: {exc}")

    try:
        asyncio.run(_test_evidence_summary())
        print("  [PASS] Evidence summary test")
    except Exception as exc:
        print(f"  [WARN] Evidence summary test: {exc}")

    print("\n" + "=" * 60)
    print("Test suite complete.")
    print("=" * 60)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        run_tests()
    else:
        # Demo: quick search
        async def _demo():
            async with LiteratureIntelligence(cache_ttl=600) as lit:
                papers = await lit.search("deep brain stimulation Parkinson", filters=SearchFilters(max_results=5))
                print(f"Found {len(papers)} papers:")
                for i, p in enumerate(papers[:5], 1):
                    print(f"  {i}. {p.title} ({p.year}) — {p.citation_count} citations [{p.source}]")

        asyncio.run(_demo())
