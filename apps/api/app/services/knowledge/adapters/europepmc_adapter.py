"""
Europe PMC Adapter — EBI biomedical literature aggregator.

Wraps the Europe PMC REST API at
https://www.ebi.ac.uk/europepmc/webservices/rest/ and emits canonical
records that conform to the Knowledge Layer schema (subclass of the
production ``DatabaseAdapter`` ABC).

API docs: https://europepmc.org/RestfulWebService

Coverage: ~40M biomedical articles (PubMed + PMC + other sources). Crucially
adds **open-access full-text availability flags** and citation/reference
graph traversal that PubMed itself doesn't expose via E-utilities.

Implementation notes
--------------------
* Uses ``httpx`` (codebase-wide HTTP client).
* Reference research source (preserved, not imported):
  ``apps/api/app/knowledge/europepmc_adapter.py``.
* Briefing: ``docs/knowledge/BATCH3_EVIDENCE_INTEGRATION_REPORT.md`` § 4.
* Roadmap row: Batch 2 #1 in
  ``docs/engineering/knowledge-adapter-roadmap.md``.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
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

BASE_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest"
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5
REQUESTS_PER_SECOND = 10  # Europe PMC is generous (~1000/min); 10 rps is safe.
MAX_RESULTS_HARD_CAP = 200
DEFAULT_PAGE_SIZE = 25

# Europe PMC's "pubType" is a single string but reflects the underlying
# PubMed publication type. Map to CEBM evidence levels — same map as PubMed
# but flattened to the strings Europe PMC actually returns.
_PUBTYPE_EVIDENCE: List[tuple] = [
    ("meta-analysis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("systematic review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("randomized controlled trial", EvidenceLevel.RCT),
    ("clinical trial, phase 3", EvidenceLevel.RCT),
    ("clinical trial, phase 4", EvidenceLevel.RCT),
    ("controlled clinical trial", EvidenceLevel.RCT),
    ("practice guideline", EvidenceLevel.EXPERT_OPINION),
    ("guideline", EvidenceLevel.EXPERT_OPINION),
    ("clinical trial", EvidenceLevel.CASE_SERIES),
    ("observational study", EvidenceLevel.COHORT_STUDY),
    ("comparative study", EvidenceLevel.COHORT_STUDY),
    ("case reports", EvidenceLevel.CASE_SERIES),
    ("review", EvidenceLevel.EXPERT_OPINION),
    ("preprint", EvidenceLevel.PILOT_EXPERT),
]


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class EuropePMCError(Exception):
    """Base exception for Europe PMC adapter errors."""


class EuropePMCNotFoundError(EuropePMCError):
    """Raised when a queried article ID has no result."""


class EuropePMCAPIError(EuropePMCError):
    """Raised on unexpected HTTP status or malformed response."""


class EuropePMCRateLimitError(EuropePMCError):
    """Raised when Europe PMC returns 429 or when the adapter self-throttles."""


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class EuropePMCAdapter(DatabaseAdapter):
    """Async adapter for the EBI Europe PMC REST API.

    Configuration keys (all optional):

    * ``base_url``    — override the default REST base URL.
    * ``timeout``     — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``cache_ttl``   — in-memory cache TTL in seconds (default 3600).
    * ``page_size``   — results per page (default 25, hard-capped at 200).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", BASE_URL).rstrip("/")
        self._timeout: httpx.Timeout = httpx.Timeout(
            self.config.get("timeout", 30.0), connect=10.0
        )
        self._max_retries: int = int(self.config.get("max_retries", MAX_RETRIES))
        self._cache_ttl = int(self.config.get("cache_ttl", 3600))
        self._page_size: int = min(
            int(self.config.get("page_size", DEFAULT_PAGE_SIZE)),
            MAX_RESULTS_HARD_CAP,
        )
        self._client: Optional[httpx.AsyncClient] = None

        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "Europe PMC"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # -- HTTP plumbing --------------------------------------------------------

    def _cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        payload = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def _enforce_rate_limit(self) -> None:
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """GET against Europe PMC with retry, rate-limit and cache."""
        params = params or {}
        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._client is None:
            raise EuropePMCError(
                "HTTP client not initialised — call connect() first."
            )

        url = f"{self._base_url}/{endpoint.lstrip('/')}"
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    resp = await self._client.get(url, params=params)
                    if resp.status_code == 404:
                        raise EuropePMCNotFoundError(
                            f"Europe PMC resource not found: {url}"
                        )
                    if resp.status_code == 429:
                        raise EuropePMCRateLimitError(
                            "Rate limited by Europe PMC"
                        )
                    if 500 <= resp.status_code < 600:
                        last_exception = httpx.HTTPStatusError(
                            f"{resp.status_code} server error",
                            request=resp.request,
                            response=resp,
                        )
                        wait = RETRY_BACKOFF * attempt
                        logger.warning(
                            "Europe PMC transient %s on attempt %d/%d — retrying in %.1fs",
                            resp.status_code,
                            attempt,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    if resp.status_code >= 400:
                        raise EuropePMCAPIError(
                            f"Europe PMC API error {resp.status_code}: "
                            f"{resp.text[:200]}"
                        )
                    data = resp.json()
                    self._cache[cache_key] = data
                    return data
            except (httpx.RequestError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "Europe PMC network error on attempt %d/%d — retrying in %.1fs (%s)",
                    attempt,
                    self._max_retries,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)

        raise EuropePMCAPIError(
            f"Europe PMC request failed after {self._max_retries} attempts"
        ) from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise httpx client and verify Europe PMC is reachable."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-EuropePMCAdapter/1.0",
                },
            )
        try:
            # /search with hitsOnly is the lightest healthy ping.
            await self._request(
                "search", {"query": "test", "resultType": "idlist", "format": "json", "pageSize": 1}
            )
            self._connected = True
            logger.info("EuropePMCAdapter connected — %s", self._base_url)
            return True
        except EuropePMCError as exc:
            logger.warning("EuropePMCAdapter connect failed: %s", exc)
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._cache.clear()
        self._connected = False
        logger.info("EuropePMCAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Any) -> List[Dict[str, Any]]:
        """Execute a Europe PMC query.

        Query forms:

        * ``str`` — free-text search.
        * ``dict`` keys:
            - ``query`` / ``term`` : free-text query (required if no ids)
            - ``pmid``  : single PubMed ID (uses MED:<pmid> shortcut)
            - ``pmcid`` : single PMC ID (uses PMC:<pmcid>)
            - ``doi``   : single DOI
            - ``max_results``: hard-capped at MAX_RESULTS_HARD_CAP
            - ``date_from`` / ``date_to`` : YYYY-MM-DD inclusive
            - ``sort``  : "relevance" (default), "date", or "cited"
            - ``has_ft`` : bool — only OA full-text-available articles
            - ``author`` : surname or surname-initial
        """
        if not self._connected:
            await self.connect()

        if isinstance(query, str):
            query = {"query": query}
        if not isinstance(query, dict):
            raise EuropePMCError("Query must be a string or a dict.")

        term = self._build_search_term(query)
        max_results = min(
            int(query.get("max_results", self._page_size)), MAX_RESULTS_HARD_CAP
        )
        page_size = min(max_results, self._page_size)

        sort_map = {"relevance": "relevance", "date": "Date", "cited": "CITED"}
        sort = sort_map.get(query.get("sort", "relevance"), "relevance")

        params: Dict[str, Any] = {
            "query": term,
            "resultType": "core",
            "format": "json",
            "pageSize": page_size,
            "cursorMark": "*",
        }
        if sort != "relevance":
            params["sort"] = sort

        collected: List[Dict[str, Any]] = []
        while len(collected) < max_results:
            data = await self._request("search", params)
            result_list = data.get("resultList", {})
            results = result_list.get("result") or []
            collected.extend(results)
            next_cursor = data.get("nextCursorMark")
            if not next_cursor or next_cursor == params["cursorMark"] or not results:
                break
            params["cursorMark"] = next_cursor
        return collected[:max_results]

    @staticmethod
    def _build_search_term(query: Dict[str, Any]) -> str:
        """Compose a Europe PMC query string from structured filters."""
        # Direct ID shortcuts
        if query.get("pmid"):
            return f"EXT_ID:{query['pmid']} AND SRC:MED"
        if query.get("pmcid"):
            pmcid = str(query["pmcid"]).removeprefix("PMC")
            return f"PMCID:PMC{pmcid}"
        if query.get("doi"):
            return f'DOI:"{query["doi"]}"'

        # Free-text + filters
        term = query.get("query") or query.get("term") or ""
        if not term:
            raise EuropePMCError(
                "Query requires one of: query/term, pmid, pmcid, doi."
            )

        parts = [f"({term})"]
        if query.get("date_from"):
            parts.append(f'FIRST_PDATE:[{query["date_from"]} TO ' f'{query.get("date_to", "3000-01-01")}]')
        elif query.get("date_to"):
            parts.append(f'FIRST_PDATE:[1900-01-01 TO {query["date_to"]}]')
        if query.get("has_ft"):
            parts.append("HAS_FT:Y")
        if query.get("author"):
            parts.append(f'AUTH:"{query["author"]}"')
        return " AND ".join(parts)

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
        # Each result has either pmid+source=MED, pmcid+source=PMC, or other.
        epmc_id = raw.get("id")
        source = raw.get("source", "")
        pmid = raw.get("pmid") or ""
        pmcid = raw.get("pmcid") or ""
        if not epmc_id and not pmid and not pmcid:
            return None

        author_string = raw.get("authorString") or ""
        authors = [a.strip() for a in author_string.split(",") if a.strip()] if author_string else []

        return {
            "id": str(epmc_id) if epmc_id else (pmid or pmcid),
            "source": source,
            "pmid": pmid,
            "pmcid": pmcid,
            "doi": raw.get("doi") or "",
            "title": (raw.get("title") or "").strip(),
            "authors": authors,
            "journal": raw.get("journalTitle") or raw.get("bookOrReportDetails", {}).get("publisher", "") or "",
            "issn": raw.get("journalIssn") or raw.get("issn") or "",
            "pub_year": str(raw.get("pubYear") or ""),
            "pub_type": (raw.get("pubType") or "").strip(),
            "abstract": raw.get("abstractText") or "",
            "is_open_access": (raw.get("isOpenAccess") == "Y"),
            "has_full_text": (raw.get("hasFT") == "Y"),
            "in_epmc": (raw.get("inEPMC") == "Y"),
            "in_pmc": (raw.get("inPMC") == "Y"),
            "cited_by_count": int(raw.get("citedByCount") or 0),
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
        """Valid records have an ID, title, and at least one of journal/year."""
        return (
            bool(record.get("id"))
            and bool(record.get("title"))
            and (bool(record.get("journal")) or bool(record.get("pub_year")))
        )

    @staticmethod
    def _evidence_level_for(record: Dict[str, Any]) -> EvidenceLevel:
        pub_type = (record.get("pub_type") or "").lower()
        if not pub_type:
            return EvidenceLevel.ANECDOTAL
        for needle, level in _PUBTYPE_EVIDENCE:
            if needle in pub_type:
                return level
        return EvidenceLevel.ANECDOTAL

    # -- provenance & governance ---------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        evidence = self._evidence_level_for(record)
        # Preprints + uncategorised + case series are research-only.
        is_research_only = evidence in (
            EvidenceLevel.ANECDOTAL,
            EvidenceLevel.CASE_SERIES,
            EvidenceLevel.PRECLINICAL,
            EvidenceLevel.PILOT_EXPERT,
        )
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=str(record.get("id", "unknown")),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="EBI Terms of Use (free for research)",
            confidence_tier=self.get_confidence(record),
            evidence_level=evidence,
            citation_doi=record.get("doi") or None,
            attribution_text=(
                "Citation data courtesy of Europe PMC, EMBL-EBI. "
                "Full-text access subject to individual article licenses."
            ),
            research_only=is_research_only,
            retrieval_method="direct",
            data_quality_score=self._data_quality_score(record),
        )

    @staticmethod
    def _data_quality_score(record: Dict[str, Any]) -> float:
        """Composite 0.0–1.0 score based on field completeness."""
        score = 0.0
        if record.get("title"):
            score += 0.20
        if record.get("authors"):
            score += 0.10
        if record.get("journal"):
            score += 0.15
        if record.get("doi"):
            score += 0.15
        if record.get("pub_year"):
            score += 0.05
        if record.get("pub_type"):
            score += 0.10
        if record.get("abstract"):
            score += 0.15
        if record.get("has_full_text"):
            score += 0.10
        return round(min(score, 1.0), 4)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="EBI Terms of Use",
            license_url="https://europepmc.org/Copyright",
            attribution_text=(
                "Citation data courtesy of Europe PMC, EMBL-EBI. "
                "Full-text access subject to individual article licenses."
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
                "Citation metadata is freely available for research.",
                "Article full-text licensing varies; check isOpenAccess flag "
                "per record before reuse.",
                "Bulk-download of Europe PMC requires separate licensing.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        evidence = self._evidence_level_for(record)
        if evidence in (EvidenceLevel.SYSTEMATIC_REVIEW, EvidenceLevel.RCT):
            return ConfidenceTier.HIGH
        if evidence in (
            EvidenceLevel.COHORT_STUDY,
            EvidenceLevel.CASE_CONTROL,
            EvidenceLevel.EXPERT_OPINION,
        ):
            return ConfidenceTier.MEDIUM
        if evidence in (EvidenceLevel.CASE_SERIES, EvidenceLevel.PILOT_EXPERT):
            return ConfidenceTier.LOW
        if evidence == EvidenceLevel.PRECLINICAL:
            return ConfidenceTier.RESEARCH
        return ConfidenceTier.LOW

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
                "search",
                {"query": "test", "resultType": "idlist", "format": "json", "pageSize": 1},
            )
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": self._base_url,
                "rate_limit_per_second": REQUESTS_PER_SECOND,
            }
        except EuropePMCError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
