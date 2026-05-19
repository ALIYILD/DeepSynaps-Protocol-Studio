"""
Trip Database live adapter — credential-aware Cat-3 evidence source.

Slice B-4 of the Category-3 program. Replaces the catalogued-only
``TripDatabaseAdapter`` stub with an adapter that:

- reports ``status="disabled"`` when no ``DEEPSYNAPS_TRIP_API_KEY`` is set,
- attempts a real probe + search call against the vendor base URL when
  the key IS set, and
- never fabricates rows. If the upstream call fails, the adapter raises
  a typed ``TripDatabaseAPIError``; it does not return placeholder
  records that would look indistinguishable from "we queried and got
  nothing back".

API
---

Trip Pro publishes a JSON search surface at
``https://www.tripdatabase.com/api/v2/results.json?term=<q>``. The exact
response field names are not publicly documented and have rotated across
Trip releases, so the adapter accepts the canonical shape with defensive
fall-throughs (``documents``/``results``/``data``/``items``, or a bare
list at the top level).

Auth
----

Trip uses an API-key bound to the calling organisation. We read the key
from config (``api_key``) or the ``DEEPSYNAPS_TRIP_API_KEY`` env var and
send it as a Bearer token AND as an ``X-Api-Key`` header — Trip has used
both forms in the field. Without a key the adapter refuses to call the
vendor (returns ``False`` from ``connect()``, raises ``FetchError`` from
``fetch()``).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

import httpx

from ..base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    FetchError,
    LicenseMetadata,
    ProvenanceRecord,
)

logger = logging.getLogger(__name__)


BASE_URL = "https://www.tripdatabase.com/api"
SEARCH_PATH = "/v2/results.json"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
REQUESTS_PER_SECOND = 3

CREDENTIAL_ENV_VARS = ("DEEPSYNAPS_TRIP_API_KEY",)


# Trip Pro classifies records into "categories" (Systematic Reviews,
# Guidelines, Primary Research, etc). Map the common labels onto CEBM
# evidence levels. Unknown labels fall through to ANECDOTAL.
_CATEGORY_EVIDENCE: List[tuple] = [
    ("systematic review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("meta-analysis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("evidence-based synopsis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("evidence-based summary", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("guideline", EvidenceLevel.EXPERT_OPINION),
    ("controlled trial", EvidenceLevel.RCT),
    ("randomized", EvidenceLevel.RCT),
    ("rct", EvidenceLevel.RCT),
    ("cohort", EvidenceLevel.COHORT_STUDY),
    ("case-control", EvidenceLevel.CASE_CONTROL),
    ("case series", EvidenceLevel.CASE_SERIES),
    ("primary research", EvidenceLevel.COHORT_STUDY),
    ("expert opinion", EvidenceLevel.EXPERT_OPINION),
    ("editorial", EvidenceLevel.EXPERT_OPINION),
]


class TripDatabaseError(Exception):
    """Base exception for Trip Database adapter errors."""


class TripDatabaseAuthError(TripDatabaseError):
    """Raised when Trip returns 401/403 (bad/missing key)."""


class TripDatabaseAPIError(TripDatabaseError):
    """Raised on unexpected HTTP status or malformed response."""


class TripDatabaseRateLimitError(TripDatabaseError):
    """Raised when Trip returns 429 or the adapter self-throttles."""


class TripDatabaseLiveAdapter(DatabaseAdapter):
    """Credential-aware live adapter for Trip Database.

    Configuration keys (all optional except auth):

    * ``base_url``    — override default REST URL.
    * ``timeout``     — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``page_size``   — results per page (default 20, capped at 100).
    * ``api_key``     — Trip Pro API key. Falls back to
                        ``$DEEPSYNAPS_TRIP_API_KEY``. Without a key the
                        adapter is **disabled** and never calls the
                        vendor.
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
        self._api_key: Optional[str] = (
            self.config.get("api_key") or os.environ.get("DEEPSYNAPS_TRIP_API_KEY")
        )
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0
        self._client: Optional[httpx.AsyncClient] = None

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "Trip Database"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # -- HTTP plumbing -------------------------------------------------------

    def _headers(self) -> Dict[str, str]:
        h = {"Accept": "application/json"}
        if self._api_key:
            h["Authorization"] = f"Bearer {self._api_key}"
            h["X-Api-Key"] = self._api_key
        return h

    async def _enforce_rate_limit(self) -> None:
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(self, path: str, params: Dict[str, Any]) -> Any:
        if self._client is None:
            raise TripDatabaseError("Adapter not connected — call connect() first.")
        url = f"{self._base_url}{path}"
        last_exc: Optional[BaseException] = None
        for attempt in range(self._max_retries + 1):
            try:
                await self._enforce_rate_limit()
                response = await self._client.get(url, params=params)
                if response.status_code in (401, 403):
                    raise TripDatabaseAuthError(
                        f"Trip Database auth rejected (HTTP {response.status_code}). "
                        f"Verify DEEPSYNAPS_TRIP_API_KEY."
                    )
                if response.status_code == 429:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise TripDatabaseRateLimitError(
                        f"Trip Database 429 after {self._max_retries} retries"
                    )
                if response.status_code >= 500:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise TripDatabaseAPIError(
                        f"Trip Database HTTP {response.status_code}: "
                        f"{response.text[:240]}"
                    )
                if response.status_code != 200:
                    raise TripDatabaseAPIError(
                        f"Trip Database HTTP {response.status_code}: "
                        f"{response.text[:240]}"
                    )
                payload = response.json()
                return payload
            except (
                TripDatabaseAuthError,
                TripDatabaseRateLimitError,
            ):
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise TripDatabaseAPIError(
                    f"Trip Database HTTP error: {exc}"
                ) from exc
        raise TripDatabaseAPIError(f"Trip Database unreachable: {last_exc}")

    # -- lifecycle -----------------------------------------------------------

    async def connect(self) -> bool:
        if not self._api_key:
            # Honest: no transport without a key.
            self._connected = False
            return False
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers=self._headers(),
            )
        try:
            payload = await self._request(
                SEARCH_PATH,
                {"term": "trip-deepsynaps-probe", "limit": 1},
            )
            self._connected = isinstance(payload, (list, dict))
        except TripDatabaseError as exc:
            logger.warning("Trip Database connect probe failed: %s", exc)
            self._connected = False
        return self._connected

    async def disconnect(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            finally:
                self._client = None
        self._connected = False

    # -- query ---------------------------------------------------------------

    @staticmethod
    def _extract_results(payload: Any) -> List[Dict[str, Any]]:
        """Defensive against Trip's rotating response shapes."""
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []
        for key in ("documents", "results", "data", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return []

    async def fetch(
        self,
        query: Union[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Search Trip Database and return raw documents."""
        if not self._api_key:
            raise FetchError(
                "Trip Database credentials required: "
                f"{', '.join(CREDENTIAL_ENV_VARS)}. "
                "Adapter refuses to fabricate results."
            )

        if isinstance(query, str):
            term = query
            rows = self._page_size
        elif isinstance(query, dict):
            term = str(query.get("query") or query.get("term") or "")
            rows = min(int(query.get("rows", self._page_size)), MAX_PAGE_SIZE)
        else:
            raise TripDatabaseError(
                f"Unsupported query type: {type(query).__name__}"
            )

        if not term.strip():
            return []

        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers=self._headers(),
            )

        payload = await self._request(
            SEARCH_PATH,
            {"term": term.strip(), "limit": rows},
        )
        return self._extract_results(payload)

    # -- normalization ------------------------------------------------------

    @staticmethod
    def _authors_to_strings(raw: Any) -> List[str]:
        if not raw:
            return []
        if isinstance(raw, list):
            return [str(a).strip() for a in raw if str(a).strip()]
        parts = re.split(r"\s*[;]\s*|\s*,\s*", str(raw))
        return [p.strip() for p in parts if p.strip()]

    @staticmethod
    def _coerce_year(value: Any) -> Optional[int]:
        if value is None:
            return None
        try:
            year = int(str(value)[:4])
        except (TypeError, ValueError):
            return None
        if 1900 <= year <= 2100:
            return year
        return None

    def _classify_evidence_level(self, doc: Dict[str, Any]) -> EvidenceLevel:
        labels = [
            str(doc.get(key) or "").lower()
            for key in ("category", "type", "publication_type", "document_type")
        ]
        joined = " ".join(labels)
        for needle, level in _CATEGORY_EVIDENCE:
            if needle in joined:
                return level
        return EvidenceLevel.ANECDOTAL

    async def normalize(
        self,
        raw: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for doc in raw:
            if not isinstance(doc, dict):
                continue
            doc_id = str(doc.get("id") or doc.get("doc_id") or "").strip()
            doi = str(doc.get("doi") or "").strip()
            title = str(doc.get("title") or "").strip()
            journal = str(doc.get("journal") or doc.get("publication") or "").strip()
            year = self._coerce_year(doc.get("year") or doc.get("publication_year"))
            authors = self._authors_to_strings(doc.get("authors") or doc.get("author"))
            evidence_level = self._classify_evidence_level(doc)
            url = doc.get("url") or doc.get("link") or ""
            normalized = {
                "source": "trip",
                "source_record_id": doc_id or doi or title,
                "trip_id": doc_id,
                "doi": doi or None,
                "title": title,
                "abstract": doc.get("abstract") or doc.get("summary") or "",
                "authors": authors,
                "year": year,
                "journal": journal,
                "publication_type": str(doc.get("category") or doc.get("type") or ""),
                "evidence_level": evidence_level.value,
                "category": str(doc.get("category") or "").strip(),
                "url": url,
            }
            out.append(normalized)
        return out

    async def validate(
        self,
        records: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        valid: List[Dict[str, Any]] = []
        for record in records:
            if (
                not record.get("trip_id")
                and not record.get("doi")
                and not record.get("title")
            ):
                continue
            valid.append(record)
        return valid

    # -- metadata -----------------------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        rec_id = str(record.get("trip_id") or record.get("source_record_id") or "")
        doi = str(record.get("doi") or "")
        return ProvenanceRecord(
            source_database="Trip Database",
            source_version=self.source_version,
            source_record_id=rec_id,
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="Trip-terms",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel(
                record.get("evidence_level") or EvidenceLevel.ANECDOTAL.value
            ),
            citation_doi=doi or None,
            attribution_text="Data from Trip Database.",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Trip-terms",
            license_url="https://www.tripdatabase.com/about/terms",
            attribution_text="Data from Trip Database.",
            allows_research=False,
            allows_commercial=False,
            requires_attribution=True,
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        level = str(record.get("evidence_level") or "").upper()
        if level in (
            EvidenceLevel.SYSTEMATIC_REVIEW.value,
            EvidenceLevel.RCT.value,
        ):
            return ConfidenceTier.HIGH
        if level in (
            EvidenceLevel.COHORT_STUDY.value,
            EvidenceLevel.CASE_CONTROL.value,
            EvidenceLevel.EXPERT_OPINION.value,
        ):
            return ConfidenceTier.MEDIUM
        if record.get("trip_id") or record.get("doi"):
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.LOW

    async def health_check(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "adapter_name": "Trip Database",
            "source_name": self.source_name,
            "source_version": self.source_version,
            "endpoint": self._base_url,
            "requires_credentials": True,
            "credential_env_vars": list(CREDENTIAL_ENV_VARS),
            "api_key_configured": bool(self._api_key),
            "connected": False,
            "latency_ms": None,
            "last_check": datetime.now(timezone.utc).isoformat(),
            "message": "",
        }
        if not self._api_key:
            result["status"] = "disabled"
            result["message"] = (
                "Trip Database API key not configured "
                f"({', '.join(CREDENTIAL_ENV_VARS)}); adapter disabled."
            )
            return result
        if self._client is None:
            result["status"] = "disabled"
            result["message"] = "Client not connected."
            return result
        loop_now = asyncio.get_event_loop().time
        start = loop_now()
        try:
            payload = await self._request(
                SEARCH_PATH,
                {"term": "trip-deepsynaps-probe", "limit": 1},
            )
            latency_ms = int((loop_now() - start) * 1000)
            result["connected"] = isinstance(payload, (list, dict))
            result["latency_ms"] = latency_ms
            result["status"] = "ok" if result["connected"] else "degraded"
            result["message"] = "Trip Database search probe ok."
        except TripDatabaseError as exc:
            result["message"] = f"Trip Database probe failed: {exc}"
            result["error"] = str(exc)
            result["status"] = "error"
        return result


__all__ = [
    "CREDENTIAL_ENV_VARS",
    "TripDatabaseAPIError",
    "TripDatabaseAuthError",
    "TripDatabaseError",
    "TripDatabaseLiveAdapter",
    "TripDatabaseRateLimitError",
]
