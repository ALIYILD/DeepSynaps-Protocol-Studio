"""
Epistemonikos live adapter — public REST API for systematic-review evidence.

Slice B-3 of the Category-3 program. Sidecar to the catalogued-only
``EpistemonikosAdapter`` shim from PR #1049; same swap-on-merge pattern
as ``CrossRefLiveAdapter`` (#1074) and ``PubMedCentralLiveAdapter`` (#1092).

API
---

- Base URL: ``https://www.epistemonikos.org/api/v1``
- Search: ``GET /search?q=<query>&limit=<n>&offset=<n>``
- Response shape (defensive parsing — Epistemonikos has rotated
  field names across API versions):

    { "count": N,
      "documents" | "results" | "data": [
        { "id": ...,
          "title": ...,
          "year": ...,
          "doi": ...,
          "type": "systematic-review" | "broad-synthesis" | ...,
          "classification": "L1" | "L2" | ...,
          "authors": "Smith J., Doe A.",
          "journal": ...,
          ... }
      ]
    }

Auth
----

The public unauthenticated tier is rate-limited but documented. If an
``EPISTEMONIKOS_API_KEY`` env var (or ``api_key`` config) is supplied,
the adapter sends it as a Bearer token and enjoys the higher polite-pool
quota. The adapter does NOT fail if no key is configured — it falls
back to anonymous mode.

Out of scope
------------

- Per-document detail (``/reviews/{id}``). The federation hot path only
  needs the search-result list; per-document detail is a separate
  enrichment slice.
- Structured-summary endpoint. Documented but rarely populated for
  neuromodulation interventions.
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
    LicenseMetadata,
    ProvenanceRecord,
)

logger = logging.getLogger(__name__)


BASE_URL = "https://www.epistemonikos.org/api/v1"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
REQUESTS_PER_SECOND_NO_KEY = 2
REQUESTS_PER_SECOND_WITH_KEY = 5


# Epistemonikos ``type`` / ``classification`` → CEBM EvidenceLevel.
# Epistemonikos's classification is L1 (best — systematic reviews of
# RCTs), L2 (broad synthesis), through L5 (single primary studies).
_TYPE_EVIDENCE: List[tuple] = [
    ("systematic-review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("systematic review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("broad-synthesis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("overview", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("structured-summary", EvidenceLevel.EXPERT_OPINION),
    ("guideline", EvidenceLevel.EXPERT_OPINION),
    ("primary-study", EvidenceLevel.COHORT_STUDY),
    ("rct", EvidenceLevel.RCT),
    ("randomized", EvidenceLevel.RCT),
]


class EpistemonikosError(Exception):
    """Base exception for Epistemonikos adapter errors."""


class EpistemonikosNotFoundError(EpistemonikosError):
    """Raised when a queried record has no result."""


class EpistemonikosAPIError(EpistemonikosError):
    """Raised on unexpected HTTP status or malformed response."""


class EpistemonikosRateLimitError(EpistemonikosError):
    """Raised when Epistemonikos returns 429 or the adapter self-throttles."""


class EpistemonikosLiveAdapter(DatabaseAdapter):
    """Async live adapter for the Epistemonikos REST API.

    Configuration keys (all optional):

    * ``base_url``    — override default REST URL.
    * ``timeout``     — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``page_size``   — results per page (default 20, capped at 100).
    * ``api_key``     — bearer token. Falls back to
                        ``$EPISTEMONIKOS_API_KEY``. Optional.
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
            self.config.get("api_key") or os.environ.get("EPISTEMONIKOS_API_KEY")
        )
        rps = REQUESTS_PER_SECOND_WITH_KEY if self._api_key else REQUESTS_PER_SECOND_NO_KEY
        self._min_interval: float = 1.0 / rps
        self._last_request_time: float = 0.0
        self._client: Optional[httpx.AsyncClient] = None

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "Epistemonikos"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # -- HTTP plumbing -------------------------------------------------------

    def _headers(self) -> Dict[str, str]:
        h = {"Accept": "application/json"}
        if self._api_key:
            h["Authorization"] = f"Bearer {self._api_key}"
        return h

    async def _enforce_rate_limit(self) -> None:
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(
        self,
        path: str,
        params: Dict[str, Any],
    ) -> Any:
        if self._client is None:
            raise EpistemonikosError("Adapter not connected — call connect() first.")
        url = f"{self._base_url}{path}"
        last_exc: Optional[BaseException] = None
        for attempt in range(self._max_retries + 1):
            try:
                await self._enforce_rate_limit()
                response = await self._client.get(url, params=params)
                if response.status_code == 404:
                    raise EpistemonikosNotFoundError(f"Epistemonikos 404 for {url}")
                if response.status_code == 429:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise EpistemonikosRateLimitError(
                        f"Epistemonikos 429 after {self._max_retries} retries"
                    )
                if response.status_code >= 500:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise EpistemonikosAPIError(
                        f"Epistemonikos HTTP {response.status_code}: {response.text[:240]}"
                    )
                if response.status_code != 200:
                    raise EpistemonikosAPIError(
                        f"Epistemonikos HTTP {response.status_code}: {response.text[:240]}"
                    )
                payload = response.json()
                return payload
            except (EpistemonikosNotFoundError, EpistemonikosRateLimitError):
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise EpistemonikosAPIError(
                    f"Epistemonikos HTTP error: {exc}"
                ) from exc
        raise EpistemonikosAPIError(f"Epistemonikos unreachable: {last_exc}")

    # -- lifecycle -----------------------------------------------------------

    async def connect(self) -> bool:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers=self._headers(),
            )
        try:
            # The probe is a tiny zero-result search; cheaper than a
            # dedicated health endpoint and validates auth in one call.
            payload = await self._request(
                "/search",
                {"q": "epistemonikos-deepsynaps-probe", "limit": 1},
            )
            self._connected = bool(
                isinstance(payload, (list, dict))
            )
        except EpistemonikosError as exc:
            logger.warning("Epistemonikos connect probe failed: %s", exc)
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
        """Defensive against Epistemonikos's rotating response shapes."""
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
        """Search Epistemonikos and return raw documents."""
        if isinstance(query, str):
            term = query
            rows = self._page_size
        elif isinstance(query, dict):
            term = str(query.get("query") or "")
            rows = min(int(query.get("rows", self._page_size)), MAX_PAGE_SIZE)
        else:
            raise EpistemonikosError(
                f"Unsupported query type: {type(query).__name__}"
            )

        if not term.strip():
            return []

        payload = await self._request(
            "/search",
            {"q": term.strip(), "limit": rows, "offset": 0},
        )
        return self._extract_results(payload)

    # -- normalization ------------------------------------------------------

    @staticmethod
    def _authors_to_strings(raw: Any) -> List[str]:
        # Epistemonikos returns authors as a single string in many
        # responses; split on common separators.
        if not raw:
            return []
        if isinstance(raw, list):
            return [str(a).strip() for a in raw if str(a).strip()]
        text = str(raw)
        # Common separators: "; " "," " and " " & "
        parts = re.split(r"\s*[;]\s*|\s*,\s*", text)
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
        # Try ``type`` then ``classification`` then ``doc_type``.
        labels = [
            str(doc.get(key) or "").lower()
            for key in ("type", "classification", "doc_type", "document_type")
        ]
        joined = " ".join(labels)
        for needle, level in _TYPE_EVIDENCE:
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
            doc_id = str(doc.get("id") or doc.get("pk") or "").strip()
            doi = str(doc.get("doi") or "").strip()
            title = str(doc.get("title") or "").strip()
            journal = str(doc.get("journal") or doc.get("publication") or "").strip()
            year = self._coerce_year(doc.get("year") or doc.get("publication_year"))
            authors = self._authors_to_strings(doc.get("authors") or doc.get("author"))
            evidence_level = self._classify_evidence_level(doc)
            classification = str(doc.get("classification") or "").strip()
            url = (
                doc.get("url")
                or (f"https://www.epistemonikos.org/en/documents/{doc_id}" if doc_id else "")
            )
            normalized = {
                "source": "epistemonikos",
                "source_record_id": doc_id or doi or title,
                "epistemonikos_id": doc_id,
                "doi": doi or None,
                "pmid": str(doc.get("pmid") or "").strip() or None,
                "title": title,
                "abstract": doc.get("abstract") or doc.get("summary") or "",
                "authors": authors,
                "year": year,
                "journal": journal,
                "publication_type": str(doc.get("type") or doc.get("document_type") or ""),
                "evidence_level": evidence_level.value,
                "classification": classification,
                "url": url,
                "is_open_access": bool(doc.get("is_open_access")),
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
                not record.get("epistemonikos_id")
                and not record.get("doi")
                and not record.get("title")
            ):
                continue
            valid.append(record)
        return valid

    # -- metadata -----------------------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        rec_id = str(record.get("epistemonikos_id") or record.get("source_record_id") or "")
        doi = str(record.get("doi") or "")
        return ProvenanceRecord(
            source_database="Epistemonikos",
            source_version=self.source_version,
            source_record_id=rec_id,
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CC-BY-NC-4.0",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel(
                record.get("evidence_level") or EvidenceLevel.ANECDOTAL.value
            ),
            citation_doi=doi or None,
            attribution_text="Data from Epistemonikos Foundation.",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="CC-BY-NC-4.0",
            license_url="https://creativecommons.org/licenses/by-nc/4.0/",
            attribution_text="Data from Epistemonikos Foundation.",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        classification = str(record.get("classification") or "").upper()
        # Epistemonikos classification: L1 best (systematic reviews of
        # RCTs), L5 lowest (primary single studies).
        if classification in ("L1", "L2"):
            return ConfidenceTier.HIGH
        if classification in ("L3", "L4"):
            return ConfidenceTier.MEDIUM
        if record.get("epistemonikos_id"):
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.LOW

    async def health_check(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "adapter_name": "Epistemonikos",
            "source_name": self.source_name,
            "source_version": self.source_version,
            "endpoint": self._base_url,
            "api_key_configured": bool(self._api_key),
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
            payload = await self._request(
                "/search",
                {"q": "epistemonikos-deepsynaps-probe", "limit": 1},
            )
            latency_ms = int((loop_now() - start) * 1000)
            result["connected"] = bool(isinstance(payload, (list, dict)))
            result["latency_ms"] = latency_ms
            result["status"] = "ok"
            result["message"] = "Epistemonikos search probe ok."
        except EpistemonikosError as exc:
            result["message"] = f"Epistemonikos probe failed: {exc}"
            result["error"] = str(exc)
            result["status"] = "error"
        return result


__all__ = [
    "EpistemonikosAPIError",
    "EpistemonikosError",
    "EpistemonikosLiveAdapter",
    "EpistemonikosNotFoundError",
    "EpistemonikosRateLimitError",
]
