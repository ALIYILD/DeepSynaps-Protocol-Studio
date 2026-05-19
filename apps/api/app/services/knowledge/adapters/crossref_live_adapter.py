"""
CrossRef live adapter — DOI / citation metadata over the public REST API.

This is the Slice B implementation that replaces the catalogued-only
``CrossRefAdapter`` shim landing in PR #1049. It is shipped as a
*sidecar* class (different filename + different class name) so the two
PRs do not edit the same file. A follow-up one-line catalog edit will
swap ``crossref`` → ``CrossRefLiveAdapter`` after #1049 merges.

API
---
- Base URL: https://api.crossref.org
- Search: ``GET /works?query=<text>&rows=<n>&cursor=<mark>``
- DOI lookup: ``GET /works/{doi}``
- Cursor-based pagination via ``next-cursor``.

Polite pool
-----------
CrossRef rewards a User-Agent string of the form
``Name/Version (URL; mailto:contact)`` with a higher request budget
("polite pool"). We send this header whenever ``mailto`` is configured.
Without ``mailto`` we still send a User-Agent — CrossRef serves anonymous
clients but with no rate guarantee.

Out of scope
------------
- Caching: the base adapter ``_cache`` already provides an in-memory
  cache; we reuse the pattern from EuropePMCAdapter rather than adding
  Redis.
- Bulk dump: ``/works/{doi}/agencies`` and the bulk monthly snapshot
  ship a year-of-records archive — out of scope for live citation
  enrichment.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

import httpx

from ..base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)

logger = logging.getLogger(__name__)


BASE_URL = "https://api.crossref.org"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
REQUESTS_PER_SECOND = 8  # well under the polite-pool budget


# CrossRef ``type`` field → CEBM EvidenceLevel.
# CrossRef does not tag publication type with the same granularity as
# PubMed, so we use a coarser map and downgrade to ANECDOTAL when we
# cannot infer anything useful.
_TYPE_EVIDENCE: List[tuple] = [
    ("journal-article", EvidenceLevel.EXPERT_OPINION),
    ("proceedings-article", EvidenceLevel.EXPERT_OPINION),
    ("book-chapter", EvidenceLevel.EXPERT_OPINION),
    ("review-article", EvidenceLevel.EXPERT_OPINION),
    ("preprint", EvidenceLevel.PILOT_EXPERT),
    ("posted-content", EvidenceLevel.PILOT_EXPERT),
    ("dataset", EvidenceLevel.PRECLINICAL),
]


class CrossRefError(Exception):
    """Base exception for CrossRef adapter errors."""


class CrossRefNotFoundError(CrossRefError):
    """Raised when a DOI lookup returns 404."""


class CrossRefAPIError(CrossRefError):
    """Raised on unexpected HTTP status or malformed response."""


class CrossRefRateLimitError(CrossRefError):
    """Raised when CrossRef returns 429 or the adapter self-throttles."""


class CrossRefLiveAdapter(DatabaseAdapter):
    """Async live adapter for the CrossRef REST API.

    Configuration keys (all optional):

    * ``base_url``    — override default REST URL.
    * ``timeout``     — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``page_size``   — results per page (default 20, capped at 100).
    * ``mailto``      — contact email; enables the polite-pool budget.
    * ``user_agent``  — full UA override; if unset we build one from
                        ``app_name``, ``app_version``, ``app_url``, and
                        ``mailto``.
    * ``app_name``    — default "DeepSynaps".
    * ``app_version`` — default "1.0".
    * ``app_url``     — default "https://deepsynaps-studio.fly.dev".
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", BASE_URL).rstrip("/")
        self._timeout = httpx.Timeout(
            self.config.get("timeout", DEFAULT_TIMEOUT), connect=10.0
        )
        self._max_retries: int = int(self.config.get("max_retries", DEFAULT_MAX_RETRIES))
        self._page_size: int = min(
            int(self.config.get("page_size", DEFAULT_PAGE_SIZE)),
            MAX_PAGE_SIZE,
        )
        self._client: Optional[httpx.AsyncClient] = None
        self._user_agent: str = self._build_user_agent()
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "CrossRef"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # -- User-Agent + HTTP plumbing ------------------------------------------

    def _build_user_agent(self) -> str:
        if self.config.get("user_agent"):
            return str(self.config["user_agent"])
        name = str(self.config.get("app_name", "DeepSynaps"))
        version = str(self.config.get("app_version", "1.0"))
        url = str(self.config.get("app_url", "https://deepsynaps-studio.fly.dev"))
        mailto = self.config.get("mailto")
        contact = f"; mailto:{mailto}" if mailto else ""
        return f"{name}/{version} ({url}{contact})"

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
    ) -> Dict[str, Any]:
        if self._client is None:
            raise CrossRefError("Adapter not connected — call connect() first.")
        url = f"{self._base_url}{endpoint}"
        params = params or {}
        last_exc: Optional[BaseException] = None
        for attempt in range(self._max_retries + 1):
            try:
                await self._enforce_rate_limit()
                response = await self._client.get(url, params=params)
                if response.status_code == 404:
                    raise CrossRefNotFoundError(f"CrossRef 404 for {url}")
                if response.status_code == 429:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise CrossRefRateLimitError(
                        f"CrossRef 429 after {self._max_retries} retries"
                    )
                if response.status_code >= 500:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise CrossRefAPIError(
                        f"CrossRef HTTP {response.status_code}: {response.text[:240]}"
                    )
                if response.status_code != 200:
                    raise CrossRefAPIError(
                        f"CrossRef HTTP {response.status_code}: {response.text[:240]}"
                    )
                payload = response.json()
                if not isinstance(payload, dict):
                    raise CrossRefAPIError("CrossRef response was not a JSON object")
                return payload
            except (CrossRefNotFoundError, CrossRefRateLimitError):
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise CrossRefAPIError(f"CrossRef HTTP error: {exc}") from exc
        # Defensive — loop above always returns or raises.
        raise CrossRefAPIError(f"CrossRef unreachable: {last_exc}")

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"User-Agent": self._user_agent, "Accept": "application/json"},
            )
        try:
            payload = await self._request("/works", {"rows": 0})
            self._connected = bool(payload.get("status") == "ok" or "message" in payload)
        except CrossRefError as exc:
            logger.warning("CrossRef connect health-check failed: %s", exc)
            self._connected = False
        return self._connected

    async def disconnect(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            finally:
                self._client = None
        self._connected = False

    # -- query --------------------------------------------------------------

    async def fetch(
        self,
        query: Union[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Search CrossRef for works matching ``query`` and return raw items.

        Accepts either a bare query string or a dict with keys:

        * ``query``  — free-text bibliographic query.
        * ``doi``    — direct DOI lookup (overrides ``query``).
        * ``rows``   — page size override.
        """
        if isinstance(query, str):
            params = {"query": query, "rows": self._page_size}
        elif isinstance(query, dict):
            params = {}
            if query.get("doi"):
                payload = await self._request(f"/works/{query['doi']}")
                msg = payload.get("message") or {}
                return [msg] if msg else []
            if query.get("query"):
                params["query"] = str(query["query"])
            rows = int(query.get("rows", self._page_size))
            params["rows"] = min(rows, MAX_PAGE_SIZE)
        else:
            raise CrossRefError(f"Unsupported query type: {type(query).__name__}")

        payload = await self._request("/works", params)
        message = payload.get("message") or {}
        items = message.get("items") or []
        if not isinstance(items, list):
            raise CrossRefAPIError("CrossRef /works items field was not a list")
        return list(items)

    # -- normalization ------------------------------------------------------

    @staticmethod
    def _first_string(value: Any) -> str:
        if isinstance(value, list) and value:
            return str(value[0]) if value[0] is not None else ""
        if isinstance(value, str):
            return value
        return ""

    @staticmethod
    def _year_from_issued(issued: Any) -> Optional[int]:
        if not isinstance(issued, dict):
            return None
        parts = issued.get("date-parts")
        if isinstance(parts, list) and parts and isinstance(parts[0], list) and parts[0]:
            try:
                return int(parts[0][0])
            except (TypeError, ValueError):
                return None
        return None

    @staticmethod
    def _authors_to_strings(authors: Any) -> List[str]:
        if not isinstance(authors, list):
            return []
        out: List[str] = []
        for entry in authors:
            if not isinstance(entry, dict):
                continue
            family = entry.get("family") or ""
            given = entry.get("given") or ""
            name = " ".join(part for part in (given, family) if part).strip()
            if not name and entry.get("name"):
                name = str(entry["name"])
            if name:
                out.append(name)
        return out

    def _classify_evidence_level(self, work_type: str) -> EvidenceLevel:
        wt = (work_type or "").lower()
        for needle, level in _TYPE_EVIDENCE:
            if needle in wt:
                return level
        return EvidenceLevel.ANECDOTAL

    async def normalize(
        self,
        raw: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            doi = str(item.get("DOI") or "").strip()
            title = self._first_string(item.get("title"))
            journal = self._first_string(item.get("container-title"))
            year = self._year_from_issued(item.get("issued") or item.get("created"))
            authors = self._authors_to_strings(item.get("author"))
            work_type = str(item.get("type") or "")
            evidence_level = self._classify_evidence_level(work_type)
            cited_by = item.get("is-referenced-by-count")
            try:
                cited_by_count = int(cited_by) if cited_by is not None else 0
            except (TypeError, ValueError):
                cited_by_count = 0
            url = item.get("URL") or (f"https://doi.org/{doi}" if doi else "")
            normalized = {
                "source": "crossref",
                "source_record_id": doi or title,
                "doi": doi,
                "title": title,
                "abstract": item.get("abstract") or "",
                "authors": authors,
                "year": year,
                "journal": journal,
                "publication_type": work_type,
                "evidence_level": evidence_level.value,
                "cited_by_count": cited_by_count,
                "url": url,
                "is_open_access": bool(item.get("is-open-access")),
                "issn": item.get("ISSN") or [],
                "subject": item.get("subject") or [],
            }
            out.append(normalized)
        return out

    async def validate(
        self,
        records: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        valid: List[Dict[str, Any]] = []
        for record in records:
            if not record.get("doi") and not record.get("title"):
                # CrossRef sometimes returns metadata-only stubs without DOI
                # AND without title — drop them rather than emit empty rows.
                continue
            valid.append(record)
        return valid

    # -- metadata ----------------------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        doi = str(record.get("doi") or "")
        return ProvenanceRecord(
            source_database="CrossRef",
            source_version=self.source_version,
            source_record_id=doi or str(record.get("source_record_id") or ""),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CrossRef-public-data",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel(
                record.get("evidence_level") or EvidenceLevel.ANECDOTAL.value
            ),
            citation_doi=doi or None,
            attribution_text="Data from CrossRef.",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CrossRef-public-data",
            license_url=(
                "https://www.crossref.org/documentation/retrieve-metadata/"
                "rest-api/rest-api-metadata-license-information/"
            ),
            attribution_text="Data from CrossRef.",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        # CrossRef records are bibliographic metadata only — the confidence
        # we have is in the citation *identity*, not the clinical claim of
        # the paper. We treat journal-articles with a DOI as HIGH and
        # preprints / posted-content as MEDIUM.
        if not record.get("doi"):
            return ConfidenceTier.LOW
        wt = str(record.get("publication_type") or "").lower()
        if "preprint" in wt or "posted-content" in wt:
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.HIGH

    async def health_check(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "adapter_name": "CrossRef",
            "source_name": self.source_name,
            "source_version": self.source_version,
            "endpoint": self._base_url,
            "user_agent": self._user_agent,
            "connected": False,
            "latency_ms": None,
            "last_check": datetime.now(timezone.utc).isoformat(),
            "message": "",
        }
        if self._client is None:
            result["message"] = "Client not connected."
            return result
        loop_now = asyncio.get_event_loop().time
        start = loop_now()
        try:
            payload = await self._request("/works", {"rows": 0})
            latency_ms = int((loop_now() - start) * 1000)
            result["connected"] = bool(payload.get("status") == "ok" or "message" in payload)
            result["latency_ms"] = latency_ms
            result["message"] = "CrossRef /works probe ok."
            result["status"] = "ok"
        except CrossRefError as exc:
            result["message"] = f"CrossRef probe failed: {exc}"
            result["error"] = str(exc)
            result["status"] = "error"
        return result


__all__ = [
    "CrossRefAPIError",
    "CrossRefError",
    "CrossRefLiveAdapter",
    "CrossRefNotFoundError",
    "CrossRefRateLimitError",
]
