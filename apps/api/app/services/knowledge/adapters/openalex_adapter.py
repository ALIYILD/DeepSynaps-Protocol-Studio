"""
OpenAlex Adapter — open scholarly graph (~250 M+ works, authors, institutions).

Wraps the OpenAlex REST API at https://api.openalex.org and emits canonical
records that conform to the Knowledge Layer schema (subclass of the
production ``DatabaseAdapter`` ABC).

API docs: https://developers.openalex.org/

Coverage: aggregates Crossref, ORCID, ROR, DataCite, MAG, and others into
a unified open scholarly graph. Especially useful for citation-velocity
analysis, author/affiliation networks, and concept-based evidence
triangulation across rare conditions.

Briefing: ``docs/engineering/knowledge-adapter-roadmap.md`` § 10.1.

Implementation notes
--------------------
* Uses ``httpx`` (codebase-wide HTTP client).
* OpenAlex now requires an API key (the historical "polite pool with
  mailto=" no-auth path is gone). Free tier ships with $1/day usage
  credit; this adapter logs a WARNING when 80% of the daily credit is
  consumed if the upstream returns a usage-tracking header.
* Data license is **CC0 1.0** — clean, permissive, suitable for
  re-distribution.
* Cursor pagination is preferred for any result set >10 000; this
  adapter uses cursor mode unconditionally so deep paging "just works".
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

BASE_URL = "https://api.openalex.org"
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5
REQUESTS_PER_SECOND = 10
MAX_RESULTS_HARD_CAP = 200
DEFAULT_PAGE_SIZE = 25
DEFAULT_USER_AGENT = "DeepSynaps-OpenAlexAdapter/1.0"

# OpenAlex `type` strings → CEBM evidence levels. The type vocabulary is
# Crossref-derived; see https://api.openalex.org/work-types.
_WORKTYPE_EVIDENCE: List[tuple] = [
    ("review", EvidenceLevel.EXPERT_OPINION),
    ("editorial", EvidenceLevel.EXPERT_OPINION),
    ("letter", EvidenceLevel.EXPERT_OPINION),
    ("book", EvidenceLevel.EXPERT_OPINION),
    ("book-chapter", EvidenceLevel.EXPERT_OPINION),
    ("journal-article", EvidenceLevel.COHORT_STUDY),
    ("proceedings-article", EvidenceLevel.CASE_SERIES),
    ("dissertation", EvidenceLevel.PILOT_EXPERT),
    ("preprint", EvidenceLevel.PILOT_EXPERT),
    ("posted-content", EvidenceLevel.PILOT_EXPERT),
    ("dataset", EvidenceLevel.PRECLINICAL),
    ("report", EvidenceLevel.EXPERT_OPINION),
]


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class OpenAlexError(Exception):
    """Base exception for OpenAlex adapter errors."""


class OpenAlexNotFoundError(OpenAlexError):
    """Raised when a queried external ID has no result."""


class OpenAlexAPIError(OpenAlexError):
    """Raised on unexpected HTTP status or malformed response."""


class OpenAlexAuthError(OpenAlexError):
    """Raised when the API rejects credentials (401/403) or when no key is set."""


class OpenAlexRateLimitError(OpenAlexError):
    """Raised when OpenAlex returns 429 or when the adapter self-throttles."""


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class OpenAlexAdapter(DatabaseAdapter):
    """Async adapter for the OpenAlex REST API.

    Configuration keys:

    * ``api_key``    — **required** at fetch time. Resolved from config or
                       the ``OPENALEX_API_KEY`` env var (the latter is checked
                       lazily at connect-time so missing-key environments can
                       still import the adapter without crashing).
    * ``base_url``   — override the default REST base URL.
    * ``timeout``    — total request timeout in seconds (default 30).
    * ``max_retries``— retries on transient errors (default 3).
    * ``cache_ttl``  — in-memory cache TTL in seconds (default 3600).
    * ``page_size``  — results per page (default 25, hard-capped at 200).
    * ``user_agent`` — override the default UA string.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        # api_key is read lazily so an empty-config catalog entry can still
        # be instantiated. health_check() will surface the missing-key state.
        self._api_key: Optional[str] = self.config.get("api_key") or None
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
        self._user_agent: str = self.config.get("user_agent", DEFAULT_USER_AGENT)
        self._client: Optional[httpx.AsyncClient] = None

        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "OpenAlex"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # -- HTTP plumbing --------------------------------------------------------

    def _resolve_api_key(self) -> Optional[str]:
        """Return the configured api_key, falling back to env var lazily.

        Reading env at use-time (not __init__-time) lets the adapter be
        instantiated cleanly even in test or offline environments where
        the key is intentionally absent.
        """
        if self._api_key:
            return self._api_key
        import os

        env_key = os.environ.get("OPENALEX_API_KEY")
        return env_key or None

    def _cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        # api_key is intentionally NOT part of the cache key — same query
        # with two different keys should hit the same cache entry.
        sanitised = {k: v for k, v in params.items() if k != "api_key"}
        payload = json.dumps(
            {"endpoint": endpoint, "params": sanitised}, sort_keys=True
        )
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
        """GET against OpenAlex with retry, rate-limit, and cache."""
        params = dict(params or {})
        api_key = self._resolve_api_key()
        if api_key:
            params["api_key"] = api_key
        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._client is None:
            raise OpenAlexError(
                "HTTP client not initialised — call connect() first."
            )

        url = f"{self._base_url}/{endpoint.lstrip('/')}"
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    resp = await self._client.get(url, params=params)
                    self._maybe_warn_on_usage(resp)
                    if resp.status_code == 404:
                        raise OpenAlexNotFoundError(
                            f"OpenAlex resource not found: {url}"
                        )
                    if resp.status_code in (401, 403):
                        raise OpenAlexAuthError(
                            f"OpenAlex rejected credentials ({resp.status_code})"
                        )
                    if resp.status_code == 429:
                        raise OpenAlexRateLimitError("Rate limited by OpenAlex")
                    if 500 <= resp.status_code < 600:
                        last_exception = httpx.HTTPStatusError(
                            f"{resp.status_code} server error",
                            request=resp.request,
                            response=resp,
                        )
                        wait = RETRY_BACKOFF * attempt
                        logger.warning(
                            "OpenAlex transient %s on attempt %d/%d — retrying in %.1fs",
                            resp.status_code,
                            attempt,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    if resp.status_code >= 400:
                        raise OpenAlexAPIError(
                            f"OpenAlex API error {resp.status_code}: "
                            f"{resp.text[:200]}"
                        )
                    data = resp.json()
                    self._cache[cache_key] = data
                    return data
            except (httpx.RequestError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "OpenAlex network error on attempt %d/%d — retrying in %.1fs (%s)",
                    attempt,
                    self._max_retries,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)

        raise OpenAlexAPIError(
            f"OpenAlex request failed after {self._max_retries} attempts"
        ) from last_exception

    @staticmethod
    def _maybe_warn_on_usage(resp: "httpx.Response") -> None:
        """If OpenAlex returns a daily-quota header, warn at 80% consumption.

        OpenAlex's $1/day free-tier credit is reported via response headers
        (header names vary; we accept several variants).
        """
        for name in (
            "x-daily-quota-remaining",
            "x-ratelimit-remaining-day",
            "x-quota-remaining",
        ):
            raw = resp.headers.get(name)
            if not raw:
                continue
            try:
                remaining = float(raw)
            except ValueError:
                return
            # We don't know the absolute cap; warn only when explicit low.
            if remaining > 0 and remaining < 0.2:
                logger.warning(
                    "OpenAlex daily quota near exhaustion: %.2f remaining "
                    "(header %s). Slow down or upgrade plan.",
                    remaining,
                    name,
                )
            return

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise httpx client and verify OpenAlex is reachable."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": self._user_agent,
                },
            )
        try:
            # /works with per-page=1 is the lightest healthy ping.
            await self._request("works", {"search": "test", "per-page": 1})
            self._connected = True
            logger.info("OpenAlexAdapter connected — %s", self._base_url)
            return True
        except OpenAlexError as exc:
            logger.warning("OpenAlexAdapter connect failed: %s", exc)
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._cache.clear()
        self._connected = False
        logger.info("OpenAlexAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Any) -> List[Dict[str, Any]]:
        """Execute an OpenAlex query against ``/works``.

        Query forms:

        * ``str`` — free-text search.
        * ``dict`` keys:
            - ``query`` / ``search`` / ``term`` : free-text query
            - ``doi``         : single DOI lookup (uses /works/doi:<doi>)
            - ``pmid``        : single PMID lookup (uses /works/pmid:<pmid>)
            - ``openalex_id`` : explicit OpenAlex Work ID (e.g. W2741809807)
            - ``filter``      : raw OpenAlex filter DSL string
              (e.g. "is_oa:true,cited_by_count:>50")
            - ``max_results`` : hard-capped at MAX_RESULTS_HARD_CAP
            - ``sort``        : "relevance" (default), "cited_by_count:desc",
                                or any OpenAlex sort key
            - ``select``      : comma-separated field projection
        """
        if not self._connected:
            await self.connect()

        if isinstance(query, str):
            query = {"query": query}
        if not isinstance(query, dict):
            raise OpenAlexError("Query must be a string or a dict.")

        # Single-ID lookups bypass /works search entirely.
        if query.get("doi"):
            doi = str(query["doi"]).strip().lower()
            data = await self._request(f"works/doi:{doi}", {})
            return [data] if isinstance(data, dict) else []
        if query.get("pmid"):
            pmid = str(query["pmid"]).strip()
            data = await self._request(f"works/pmid:{pmid}", {})
            return [data] if isinstance(data, dict) else []
        if query.get("openalex_id"):
            oa_id = str(query["openalex_id"]).strip()
            data = await self._request(f"works/{oa_id}", {})
            return [data] if isinstance(data, dict) else []

        max_results = min(
            int(query.get("max_results", self._page_size)), MAX_RESULTS_HARD_CAP
        )
        page_size = min(max_results, self._page_size)

        params: Dict[str, Any] = {"per-page": page_size, "cursor": "*"}
        search = query.get("query") or query.get("search") or query.get("term")
        if search:
            params["search"] = search
        if query.get("filter"):
            params["filter"] = query["filter"]
        if query.get("sort"):
            params["sort"] = query["sort"]
        if query.get("select"):
            params["select"] = query["select"]
        if not search and not query.get("filter"):
            raise OpenAlexError(
                "Query requires one of: query/search/term, filter, doi, pmid, "
                "openalex_id."
            )

        collected: List[Dict[str, Any]] = []
        seen_cursors: set = set()
        while len(collected) < max_results:
            data = await self._request("works", params)
            results = data.get("results") or []
            collected.extend(results)
            meta = data.get("meta") or {}
            next_cursor = meta.get("next_cursor")
            if (
                not next_cursor
                or next_cursor in seen_cursors
                or not results
            ):
                break
            seen_cursors.add(next_cursor)
            params["cursor"] = next_cursor
        return collected[:max_results]

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
        oa_id = raw.get("id") or ""
        doi = (raw.get("doi") or "").replace("https://doi.org/", "")
        title = (raw.get("title") or raw.get("display_name") or "").strip()
        if not oa_id and not doi and not title:
            return None

        authorships = raw.get("authorships") or []
        authors: List[str] = []
        affiliations: List[str] = []
        for authorship in authorships:
            author = authorship.get("author") or {}
            name = author.get("display_name")
            if name:
                authors.append(name)
            for inst in authorship.get("institutions") or []:
                inst_name = inst.get("display_name")
                if inst_name and inst_name not in affiliations:
                    affiliations.append(inst_name)

        oa_meta = raw.get("open_access") or {}
        primary_loc = raw.get("primary_location") or {}
        source = primary_loc.get("source") or {}

        # OpenAlex stores abstracts as an "inverted index" {word: [positions]}.
        # Recover a best-effort plain-text abstract.
        abstract = _abstract_from_inverted_index(
            raw.get("abstract_inverted_index") or {}
        )

        pmid = ""
        ids = raw.get("ids") or {}
        if ids.get("pmid"):
            pmid = str(ids["pmid"]).rsplit("/", 1)[-1]

        concepts = [
            c.get("display_name", "")
            for c in (raw.get("concepts") or [])
            if c.get("display_name")
        ]
        topics = [
            t.get("display_name", "")
            for t in (raw.get("topics") or [])
            if t.get("display_name")
        ]

        return {
            "id": oa_id,
            "doi": doi,
            "pmid": pmid,
            "title": title,
            "authors": authors,
            "affiliations": affiliations,
            "journal": source.get("display_name") or "",
            "issn_l": source.get("issn_l") or "",
            "pub_year": str(raw.get("publication_year") or ""),
            "pub_date": raw.get("publication_date") or "",
            "work_type": (raw.get("type") or "").strip(),
            "abstract": abstract,
            "is_open_access": bool(oa_meta.get("is_oa")),
            "oa_status": oa_meta.get("oa_status") or "",
            "oa_url": oa_meta.get("oa_url") or "",
            "cited_by_count": int(raw.get("cited_by_count") or 0),
            "referenced_works_count": int(
                raw.get("referenced_works_count") or 0
            ),
            "concepts": concepts,
            "topics": topics,
            "language": raw.get("language") or "",
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
            bool(record.get("id") or record.get("doi"))
            and bool(record.get("title"))
            and (bool(record.get("journal")) or bool(record.get("pub_year")))
        )

    @staticmethod
    def _evidence_level_for(record: Dict[str, Any]) -> EvidenceLevel:
        work_type = (record.get("work_type") or "").lower()
        if not work_type:
            return EvidenceLevel.ANECDOTAL
        for needle, level in _WORKTYPE_EVIDENCE:
            if needle in work_type:
                return level
        return EvidenceLevel.ANECDOTAL

    # -- provenance & governance ---------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        evidence = self._evidence_level_for(record)
        is_research_only = evidence in (
            EvidenceLevel.PRECLINICAL,
            EvidenceLevel.PILOT_EXPERT,
        )
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=str(record.get("id", "unknown")),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CC0-1.0",
            confidence_tier=self.get_confidence(record),
            evidence_level=evidence,
            citation_doi=record.get("doi") or None,
            attribution_text=(
                "Data from OpenAlex (https://openalex.org). CC0 1.0 — "
                "free for any use; attribution appreciated but not required."
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
            score += 0.10
        if record.get("doi"):
            score += 0.15
        if record.get("pub_year"):
            score += 0.05
        if record.get("work_type"):
            score += 0.10
        if record.get("abstract"):
            score += 0.15
        if record.get("is_open_access"):
            score += 0.05
        if record.get("concepts"):
            score += 0.10
        return round(min(score, 1.0), 4)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC0-1.0",
            license_url="https://creativecommons.org/publicdomain/zero/1.0/",
            attribution_text=(
                "Data from OpenAlex (https://openalex.org). CC0 1.0 — "
                "free for any use; attribution appreciated but not required."
            ),
            commercial_use_allowed=True,
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            requires_share_alike=False,
            share_alike=False,
            modification_allowed=True,
            redistribution_allowed=True,
            restrictions=[
                "API key required for live access (free, get at "
                "https://openalex.org/settings/api).",
                "Free tier has a $1/day usage credit; higher limits and "
                "snapshot downloads require a paid plan.",
                "Underlying article full-text licensing varies per work; "
                "check is_open_access and oa_status per record before reuse.",
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
        api_key_present = bool(self._resolve_api_key())
        if not self._client or self._client.is_closed:
            return {
                "status": "down",
                "latency_ms": None,
                "source": self.source_name,
                "api_key_configured": api_key_present,
                "error": "Client closed",
            }
        start = asyncio.get_event_loop().time()
        try:
            await self._request("works", {"search": "test", "per-page": 1})
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": self._base_url,
                "api_key_configured": api_key_present,
                "rate_limit_per_second": REQUESTS_PER_SECOND,
            }
        except OpenAlexError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "api_key_configured": api_key_present,
                "error": str(exc),
            }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _abstract_from_inverted_index(index: Dict[str, List[int]]) -> str:
    """Reconstruct a plain-text abstract from OpenAlex's inverted index.

    OpenAlex stores abstracts as ``{word: [positions, ...]}`` to avoid
    re-distributing copyrighted text in a directly readable form. We
    reverse it best-effort — gaps are acceptable.
    """
    if not index:
        return ""
    positions: List[tuple] = []
    for word, occurrences in index.items():
        for pos in occurrences:
            try:
                positions.append((int(pos), word))
            except (ValueError, TypeError):
                continue
    if not positions:
        return ""
    positions.sort(key=lambda p: p[0])
    return " ".join(word for _pos, word in positions)
