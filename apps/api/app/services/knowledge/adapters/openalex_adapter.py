"""OpenAlex Adapter — stub (expanding via TDD)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import asyncio
import hashlib
import json
import logging

import httpx

from ..base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)

logger = logging.getLogger(__name__)

BASE_URL = "https://api.openalex.org"
DEFAULT_MAILTO = "ali@deepsynaps.net"
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5
REQUESTS_PER_SECOND = 10
MAX_RESULTS_HARD_CAP = 200
DEFAULT_PAGE_SIZE = 25

_TYPE_EVIDENCE: List[tuple] = [
    ("meta-analysis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("systematic-review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("systematic review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("randomized controlled trial", EvidenceLevel.RCT),
    ("randomised controlled trial", EvidenceLevel.RCT),
    ("rct", EvidenceLevel.RCT),
    ("guideline", EvidenceLevel.EXPERT_OPINION),
    ("review", EvidenceLevel.EXPERT_OPINION),
    ("cohort", EvidenceLevel.COHORT_STUDY),
    ("observational", EvidenceLevel.COHORT_STUDY),
    ("case report", EvidenceLevel.CASE_SERIES),
    ("preprint", EvidenceLevel.PILOT_EXPERT),
]


class OpenAlexError(Exception):
    """Base exception for OpenAlex adapter errors."""


class OpenAlexNotFoundError(OpenAlexError):
    """Raised when a queried resource has no result."""


class OpenAlexAPIError(OpenAlexError):
    """Raised on unexpected HTTP status or malformed response."""


class OpenAlexRateLimitError(OpenAlexError):
    """Raised when OpenAlex returns 429 or when the adapter self-throttles."""


class OpenAlexAdapter(DatabaseAdapter):
    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", BASE_URL).rstrip("/")
        self._mailto: str = self.config.get("mailto", DEFAULT_MAILTO)
        self._timeout: httpx.Timeout = httpx.Timeout(self.config.get("timeout", 30.0), connect=10.0)
        self._max_retries: int = int(self.config.get("max_retries", MAX_RETRIES))
        self._cache_ttl = int(self.config.get("cache_ttl", 3600))
        self._page_size: int = min(int(self.config.get("page_size", DEFAULT_PAGE_SIZE)), MAX_RESULTS_HARD_CAP)
        self._client: Optional[httpx.AsyncClient] = None
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0

    @property
    def source_name(self) -> str:
        return "OpenAlex"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        payload = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def _enforce_rate_limit(self) -> None:
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        params = dict(params or {})
        params.setdefault("mailto", self._mailto)
        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached
        if self._client is None:
            raise OpenAlexError("HTTP client not initialised — call connect() first.")
        url = f"{self._base_url}/{endpoint.lstrip('/')}"
        last_exception: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    resp = await self._client.get(url, params=params)
                    if resp.status_code == 404:
                        raise OpenAlexNotFoundError(f"OpenAlex resource not found: {url}")
                    if resp.status_code == 429:
                        raise OpenAlexRateLimitError("Rate limited by OpenAlex")
                    if 500 <= resp.status_code < 600:
                        last_exception = httpx.HTTPStatusError(f"{resp.status_code} server error", request=resp.request, response=resp)
                        wait = RETRY_BACKOFF * attempt
                        logger.warning("OpenAlex transient %s on attempt %d/%d — retrying in %.1fs", resp.status_code, attempt, self._max_retries, wait)
                        await asyncio.sleep(wait)
                        continue
                    if resp.status_code >= 400:
                        raise OpenAlexAPIError(f"OpenAlex API error {resp.status_code}: {resp.text[:200]}")
                    data = resp.json()
                    self._cache[cache_key] = data
                    return data
            except (httpx.RequestError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning("OpenAlex network error on attempt %d/%d — retrying in %.1fs (%s)", attempt, self._max_retries, wait, exc)
                await asyncio.sleep(wait)
        raise OpenAlexAPIError(f"OpenAlex request failed after {self._max_retries} attempts") from last_exception

    async def connect(self) -> bool:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self._timeout, headers={"Accept": "application/json", "User-Agent": "DeepSynaps-OpenAlexAdapter/1.0"})
        try:
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

    async def fetch(self, query: Any) -> List[Dict[str, Any]]:
        if not self._connected:
            await self.connect()
        if isinstance(query, str):
            query = {"search": query}
        if not isinstance(query, dict):
            raise OpenAlexError("Query must be a string or a dict.")
        search_term = query.get("search") or query.get("term") or query.get("query")
        if not search_term:
            raise OpenAlexError("Query requires a 'search' key with a non-empty string.")
        max_results = min(int(query.get("max_results", self._page_size)), MAX_RESULTS_HARD_CAP)
        params: Dict[str, Any] = {"search": search_term, "per-page": min(max_results, self._page_size), "page": 1}
        if query.get("filter"):
            params["filter"] = query["filter"]
        if query.get("sort"):
            params["sort"] = query["sort"]
        collected: List[Dict[str, Any]] = []
        while len(collected) < max_results:
            data = await self._request("works", params)
            results = data.get("results") or []
            collected.extend(results)
            meta = data.get("meta") or {}
            total = meta.get("count", 0)
            if not results or len(collected) >= total:
                break
            params["page"] = meta.get("page", 1) + 1
        return collected[:max_results]

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [n for n in (self._normalize_single(r) for r in raw_records) if n]

    @staticmethod
    def _normalize_single(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        openalex_id = raw.get("id")
        if not openalex_id:
            return None
        raw_doi = raw.get("doi") or ""
        doi = raw_doi.replace("https://doi.org/", "").replace("http://doi.org/", "")
        authorships = raw.get("authorships") or []
        authors = [a.get("author", {}).get("display_name", "") for a in authorships if isinstance(a, dict) and a.get("author")]
        authors = [a for a in authors if a]
        primary_location = raw.get("primary_location") or {}
        source = primary_location.get("source") or {}
        journal = source.get("display_name") or ""
        issn = source.get("issn_l") or ""
        oa_info = raw.get("open_access") or {}
        is_oa = bool(oa_info.get("is_oa")) or bool(primary_location.get("is_oa"))
        abstract = OpenAlexAdapter._reconstruct_abstract(raw.get("abstract_inverted_index"))
        topics_raw = raw.get("topics") or raw.get("concepts") or []
        topics = [t.get("display_name", "") for t in topics_raw if isinstance(t, dict) and t.get("display_name")]
        return {
            "id": str(openalex_id),
            "doi": doi,
            "title": (raw.get("title") or raw.get("display_name") or "").strip(),
            "authors": authors,
            "journal": journal,
            "issn": issn,
            "pub_year": str(raw.get("publication_year") or ""),
            "type": raw.get("type") or "",
            "abstract": abstract,
            "is_open_access": is_oa,
            "cited_by_count": int(raw.get("cited_by_count") or 0),
            "topics": topics,
            "_raw": raw,
        }

    @staticmethod
    def _reconstruct_abstract(inverted_index: Optional[Dict[str, Any]]) -> str:
        if not inverted_index:
            return ""
        try:
            max_pos = max(pos for positions in inverted_index.values() for pos in positions)
            words: List[str] = [""] * (max_pos + 1)
            for word, positions in inverted_index.items():
                for pos in positions:
                    words[pos] = word
            return " ".join(w for w in words if w)
        except (ValueError, TypeError):
            return ""

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            record["_confidence"] = self.get_confidence(record).value
            record["_evidence_level"] = self._evidence_level_for(record).value
            record["_provenance"] = self.get_provenance(record).to_dict()
            validated.append(record)
        return validated

    @staticmethod
    def _is_valid(record: Dict[str, Any]) -> bool:
        return bool(record.get("id")) and bool(record.get("title")) and (bool(record.get("journal")) or bool(record.get("pub_year")))

    @staticmethod
    def _evidence_level_for(record: Dict[str, Any]) -> EvidenceLevel:
        work_type = (record.get("type") or "").lower()
        if work_type == "preprint":
            return EvidenceLevel.PILOT_EXPERT
        topic_text = " ".join(record.get("topics") or []).lower()
        combined = f"{work_type} {topic_text}"
        for needle, level in _TYPE_EVIDENCE:
            if needle in combined:
                return level
        return EvidenceLevel.ANECDOTAL

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        evidence = self._evidence_level_for(record)
        is_research_only = evidence in (EvidenceLevel.ANECDOTAL, EvidenceLevel.PRECLINICAL, EvidenceLevel.PILOT_EXPERT)
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=str(record.get("id", "unknown")),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CC0 1.0 Universal (Public Domain)",
            confidence_tier=self.get_confidence(record),
            evidence_level=evidence,
            citation_doi=record.get("doi") or None,
            attribution_text="Data from OpenAlex, an open catalog of the global research system. Licensed CC0 — no rights reserved.",
            research_only=is_research_only,
            retrieval_method="direct",
            data_quality_score=self._data_quality_score(record),
        )

    @staticmethod
    def _data_quality_score(record: Dict[str, Any]) -> float:
        score = 0.0
        if record.get("title"): score += 0.25
        if record.get("authors"): score += 0.15
        if record.get("journal"): score += 0.20
        if record.get("doi"): score += 0.15
        if record.get("pub_year"): score += 0.05
        if record.get("abstract"): score += 0.10
        if record.get("topics"): score += 0.10
        return round(min(score, 1.0), 4)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC0 1.0 Universal (Public Domain)",
            license_url="https://creativecommons.org/publicdomain/zero/1.0/",
            attribution_text="Data from OpenAlex, an open catalog of the global research system. Licensed CC0 — no rights reserved.",
            commercial_use_allowed=True,
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            requires_share_alike=False,
            share_alike=False,
            modification_allowed=True,
            redistribution_allowed=True,
            restrictions=[
                "Full-text content of individual articles is subject to each publisher's own license; OpenAlex metadata is CC0.",
                "Respect the polite-pool rate limit by including a mailto= param.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        evidence = self._evidence_level_for(record)
        if evidence in (EvidenceLevel.SYSTEMATIC_REVIEW, EvidenceLevel.RCT):
            return ConfidenceTier.HIGH
        if evidence in (EvidenceLevel.COHORT_STUDY, EvidenceLevel.CASE_CONTROL, EvidenceLevel.EXPERT_OPINION):
            return ConfidenceTier.MEDIUM
        if evidence in (EvidenceLevel.CASE_SERIES, EvidenceLevel.PILOT_EXPERT):
            return ConfidenceTier.LOW
        if evidence == EvidenceLevel.PRECLINICAL:
            return ConfidenceTier.RESEARCH
        return ConfidenceTier.LOW

    async def health_check(self) -> Dict[str, Any]:
        if not self._client or self._client.is_closed:
            return {"status": "down", "latency_ms": None, "source": self.source_name, "error": "Client closed"}
        start = asyncio.get_event_loop().time()
        try:
            await self._request("works", {"search": "test", "per-page": 1})
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "ok", "latency_ms": round(latency, 2), "source": self.source_name, "base_url": self._base_url, "rate_limit_per_second": REQUESTS_PER_SECOND}
        except OpenAlexError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "down", "latency_ms": round(latency, 2), "source": self.source_name, "error": str(exc)}
