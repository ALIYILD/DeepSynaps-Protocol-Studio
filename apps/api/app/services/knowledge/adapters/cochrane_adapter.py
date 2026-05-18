"""
Cochrane Library Adapter — gold-standard systematic reviews.

Wraps the Cochrane public search + DOI-resolution endpoints and emits
canonical records that conform to the Knowledge Layer schema (subclass of
the production ``DatabaseAdapter`` ABC).

Cochrane's public REST surface is narrow — the searchable list pages are
HTML and the JSON export endpoint at ``export.cochrane.org`` accepts a
review DOI. We treat the JSON export as the authoritative source and use
search results only as a way to discover DOIs.

API docs:        https://www.cochranelibrary.com/about/api
Search base:     https://www.cochranelibrary.com
Export base:     https://export.cochrane.org

Implementation notes
--------------------
* Uses ``httpx`` (codebase-wide HTTP client).
* Reference research source (preserved, not imported):
  ``apps/api/app/knowledge/cochrane_adapter.py``.
* Briefing: ``docs/knowledge/BATCH3_EVIDENCE_INTEGRATION_REPORT.md`` § 2.
* Roadmap row: Batch 2 #2 in
  ``docs/engineering/knowledge-adapter-roadmap.md``.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from ..base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEARCH_BASE_URL = "https://www.cochranelibrary.com"
EXPORT_BASE_URL = "https://export.cochrane.org"
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5
REQUESTS_PER_SECOND = 2  # Be conservative — Cochrane has no published limit.
MAX_RESULTS_HARD_CAP = 100

# Cochrane reviews are systematic reviews by definition. The only meaningful
# distinction we make is review (CDSR) vs protocol (pre-review): protocols
# have no findings yet, so they're research-only.
_PROTOCOL_DOI_PATTERN = re.compile(r"\.CD\d+\.(pub\d+)?$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class CochraneError(Exception):
    """Base exception for Cochrane adapter errors."""


class CochraneNotFoundError(CochraneError):
    """Raised when a queried DOI or search has no result."""


class CochraneAPIError(CochraneError):
    """Raised on unexpected HTTP status or malformed response."""


class CochraneRateLimitError(CochraneError):
    """Raised when Cochrane returns 429 or when the adapter self-throttles."""


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class CochraneAdapter(DatabaseAdapter):
    """Async adapter for Cochrane Library search + review export.

    Configuration keys (all optional):

    * ``search_base_url`` — override search base.
    * ``export_base_url`` — override export base.
    * ``timeout``         — request timeout in seconds (default 30).
    * ``max_retries``     — retries on transient errors (default 3).
    * ``cache_ttl``       — in-memory cache TTL in seconds (default 3600).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._search_base: str = self.config.get(
            "search_base_url", SEARCH_BASE_URL
        ).rstrip("/")
        self._export_base: str = self.config.get(
            "export_base_url", EXPORT_BASE_URL
        ).rstrip("/")
        self._timeout: httpx.Timeout = httpx.Timeout(
            self.config.get("timeout", 30.0), connect=10.0
        )
        self._max_retries: int = int(self.config.get("max_retries", MAX_RETRIES))
        self._cache_ttl = int(self.config.get("cache_ttl", 3600))
        self._client: Optional[httpx.AsyncClient] = None

        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "Cochrane Library"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # -- HTTP plumbing --------------------------------------------------------

    def _cache_key(self, url: str, params: Dict[str, Any]) -> str:
        payload = json.dumps({"url": url, "params": params}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def _enforce_rate_limit(self) -> None:
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        *,
        response_format: str = "json",
    ) -> Any:
        """GET with retry, rate-limit, cache. Returns dict (json) or str (html)."""
        params = params or {}
        cache_key = self._cache_key(url, params) + f":{response_format}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._client is None:
            raise CochraneError(
                "HTTP client not initialised — call connect() first."
            )

        last_exception: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    resp = await self._client.get(url, params=params)
                    if resp.status_code == 404:
                        raise CochraneNotFoundError(
                            f"Cochrane resource not found: {url}"
                        )
                    if resp.status_code == 429:
                        raise CochraneRateLimitError("Rate limited by Cochrane")
                    if 500 <= resp.status_code < 600:
                        last_exception = httpx.HTTPStatusError(
                            f"{resp.status_code} server error",
                            request=resp.request,
                            response=resp,
                        )
                        wait = RETRY_BACKOFF * attempt
                        logger.warning(
                            "Cochrane transient %s on attempt %d/%d — retrying in %.1fs",
                            resp.status_code,
                            attempt,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    if resp.status_code >= 400:
                        raise CochraneAPIError(
                            f"Cochrane API error {resp.status_code}: "
                            f"{resp.text[:200]}"
                        )
                    data = resp.json() if response_format == "json" else resp.text
                    self._cache[cache_key] = data
                    return data
            except (httpx.RequestError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "Cochrane network error on attempt %d/%d — retrying in %.1fs (%s)",
                    attempt,
                    self._max_retries,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)

        raise CochraneAPIError(
            f"Cochrane request failed after {self._max_retries} attempts"
        ) from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise httpx client and verify Cochrane is reachable."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json, text/html;q=0.9",
                    "User-Agent": "DeepSynaps-CochraneAdapter/1.0",
                },
            )
        try:
            # Lightweight HEAD-style ping on the search base URL.
            await self._request(
                f"{self._search_base}/", response_format="text"
            )
            self._connected = True
            logger.info("CochraneAdapter connected — %s", self._search_base)
            return True
        except CochraneError as exc:
            logger.warning("CochraneAdapter connect failed: %s", exc)
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._cache.clear()
        self._connected = False
        logger.info("CochraneAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Any) -> List[Dict[str, Any]]:
        """Execute a Cochrane query.

        Query forms:

        * ``str`` — free-text search.
        * ``dict`` keys:
            - ``term`` / ``query`` : free-text query
            - ``doi``              : single Cochrane review DOI for direct fetch
            - ``max_results``      : hard-capped at MAX_RESULTS_HARD_CAP
            - ``product``          : ``cdsr`` (default), ``protocols``, ``editorials``
        """
        if not self._connected:
            await self.connect()

        if isinstance(query, str):
            query = {"term": query}
        if not isinstance(query, dict):
            raise CochraneError("Query must be a string or a dict.")

        if query.get("doi"):
            review = await self._fetch_review_by_doi(str(query["doi"]))
            return [review] if review else []

        term = query.get("term") or query.get("query")
        if not term:
            raise CochraneError("Query requires 'term', 'query' or 'doi'.")

        max_results = min(
            int(query.get("max_results", 25)), MAX_RESULTS_HARD_CAP
        )
        product = query.get("product", "cdsr")
        return await self._fetch_search(term, max_results, product)

    async def _fetch_search(
        self, term: str, max_results: int, product: str
    ) -> List[Dict[str, Any]]:
        # The public Cochrane search returns HTML; we use the JSON-LD/embedded
        # data shape on /search?searchText=... with rows= parameter. When the
        # response is JSON, we use it; if HTML, we extract DOIs from the
        # markup. Both paths are guarded by validate().
        params: Dict[str, Any] = {
            "searchText": term,
            "rows": max_results,
            "product": product,
        }
        url = f"{self._search_base}/search"
        try:
            data = await self._request(url, params)
        except (CochraneAPIError, ValueError, json.JSONDecodeError):
            # JSON wasn't returned (Cochrane's search base returns HTML by
            # default); fall back to text/HTML extraction.
            html = await self._request(url, params, response_format="text")
            return self._extract_results_from_html(html, max_results)

        # If the search API ever returns a JSON list, surface it directly.
        if isinstance(data, list):
            return data[:max_results]
        if isinstance(data, dict):
            results = data.get("results") or data.get("documents") or []
            return list(results)[:max_results]
        return []

    @staticmethod
    def _extract_results_from_html(html: str, max_results: int) -> List[Dict[str, Any]]:
        """Pull DOI + title pairs from the Cochrane search HTML."""
        # DOI pattern: 10.1002/14651858.CDxxxxx.pubN
        doi_re = re.compile(r"(10\.1002/14651858\.CD\d+(?:\.pub\d+)?)", re.IGNORECASE)
        title_re = re.compile(
            r'class="result-title"[^>]*>\s*<a[^>]*>(?P<title>[^<]+)</a>',
            re.IGNORECASE,
        )
        dois = list(dict.fromkeys(doi_re.findall(html)))[:max_results]
        titles = [m.group("title").strip() for m in title_re.finditer(html)][:max_results]
        out: List[Dict[str, Any]] = []
        for i, doi in enumerate(dois):
            out.append(
                {
                    "doi": doi,
                    "title": titles[i] if i < len(titles) else "",
                }
            )
        return out

    async def _fetch_review_by_doi(self, doi: str) -> Optional[Dict[str, Any]]:
        """Direct review lookup via the export endpoint."""
        url = f"{self._export_base}/api/review/{doi}"
        try:
            data = await self._request(url)
        except CochraneNotFoundError:
            return None
        if not isinstance(data, dict):
            return None
        # Ensure DOI is in the record (different endpoints surface it differently).
        data.setdefault("doi", doi)
        return data

    # -- normalize ------------------------------------------------------------

    async def normalize(
        self, raw_records: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    @staticmethod
    def _normalize_single(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        doi = raw.get("doi") or raw.get("DOI") or ""
        title = raw.get("title") or raw.get("Title") or ""
        if not doi and not title:
            return None

        is_protocol = bool(
            raw.get("isProtocol")
            or raw.get("type", "").lower() == "protocol"
            # Heuristic for DOIs of the form .CDxxxxxx without .pub suffix.
            or (doi and not _PROTOCOL_DOI_PATTERN.search(doi) and ".pub" not in doi)
        )

        authors_raw = raw.get("authors") or []
        if isinstance(authors_raw, str):
            authors = [a.strip() for a in authors_raw.split(";") if a.strip()]
        elif isinstance(authors_raw, list):
            authors = [a.get("name", a) if isinstance(a, dict) else str(a) for a in authors_raw]
        else:
            authors = []

        return {
            "doi": doi,
            "title": title.strip(),
            "authors": authors,
            "abstract": raw.get("abstract") or raw.get("Abstract") or "",
            "publication_date": raw.get("publishedDate") or raw.get("date") or "",
            "version": raw.get("version") or "",
            "review_group": raw.get("reviewGroup") or raw.get("group") or "",
            "is_protocol": is_protocol,
            "is_withdrawn": bool(raw.get("isWithdrawn") or raw.get("withdrawn")),
            "_raw": raw,
        }

    # -- validate -------------------------------------------------------------

    async def validate(
        self, normalized_records: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            confidence = self.get_confidence(record)
            record["_confidence"] = confidence.value
            record["_evidence_level"] = self._evidence_level_for(record).value
            record["_provenance"] = self.get_provenance(record).to_dict()
            validated.append(record)
        return validated

    @staticmethod
    def _is_valid(record: Dict[str, Any]) -> bool:
        """Valid records have a DOI and a title; withdrawn reviews are invalid."""
        if record.get("is_withdrawn"):
            return False
        return bool(record.get("doi")) and bool(record.get("title"))

    @staticmethod
    def _evidence_level_for(record: Dict[str, Any]) -> EvidenceLevel:
        # Cochrane Database of Systematic Reviews — by definition.
        # Protocols are pre-review and have no findings yet.
        if record.get("is_protocol"):
            return EvidenceLevel.EXPERT_OPINION
        return EvidenceLevel.SYSTEMATIC_REVIEW

    # -- provenance & governance ---------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        evidence = self._evidence_level_for(record)
        is_protocol = bool(record.get("is_protocol"))
        is_withdrawn = bool(record.get("is_withdrawn"))
        # Protocols (pre-publication) and withdrawn reviews carry the
        # research_only flag so consumers don't surface a not-yet-or-no-longer
        # valid review as clinical evidence.
        research_only = is_protocol or is_withdrawn
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=str(record.get("doi", "unknown")),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="Wiley / Cochrane (subscription; abstracts free)",
            confidence_tier=self.get_confidence(record),
            evidence_level=evidence,
            citation_doi=record.get("doi") or None,
            attribution_text=(
                "Systematic review courtesy of the Cochrane Library, "
                "published by Wiley on behalf of Cochrane."
            ),
            research_only=research_only,
            retrieval_method="direct",
            data_quality_score=self._data_quality_score(record),
        )

    @staticmethod
    def _data_quality_score(record: Dict[str, Any]) -> float:
        score = 0.0
        if record.get("doi"):
            score += 0.25
        if record.get("title"):
            score += 0.20
        if record.get("authors"):
            score += 0.10
        if record.get("abstract"):
            score += 0.20
        if record.get("publication_date"):
            score += 0.10
        if record.get("review_group"):
            score += 0.05
        if record.get("version"):
            score += 0.05
        if record.get("is_withdrawn"):
            score = max(0.0, score - 0.5)
        return round(min(max(score, 0.0), 1.0), 4)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Wiley / Cochrane Collaboration",
            license_url="https://www.cochranelibrary.com/about/terms-and-conditions",
            attribution_text=(
                "Systematic review courtesy of the Cochrane Library, "
                "published by Wiley on behalf of Cochrane."
            ),
            commercial_use_allowed=False,
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=False,
            share_alike=False,
            modification_allowed=False,
            redistribution_allowed=False,
            restrictions=[
                "Abstracts are publicly readable; full reviews require a "
                "subscription or open-access purchase per article.",
                "Bulk-mirror of Cochrane review text is not permitted.",
                "Withdrawn or protocol-stage reviews must not be presented "
                "as current clinical evidence.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        # Cochrane reviews are the highest-quality observational evidence
        # source we ingest — published systematic reviews of RCTs.
        if record.get("is_withdrawn"):
            return ConfidenceTier.LOW
        if record.get("is_protocol"):
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.HIGH

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        if not self._client or self._client.is_closed:
            return {
                "status": "down",
                "latency_ms": None,
                "source": self.source_name,
                "error": "Client closed",
            }
        start = asyncio.get_event_loop().time()
        try:
            await self._request(
                f"{self._search_base}/", response_format="text"
            )
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "search_base_url": self._search_base,
                "export_base_url": self._export_base,
                "rate_limit_per_second": REQUESTS_PER_SECOND,
            }
        except CochraneError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
