"""
DynaMed live adapter — credential-aware, EBSCO subscription-gated.

Slice B-4 of the Category-3 program. Replaces the catalogued-only
``DynaMedAdapter`` stub.

DynaMed is EBSCO's point-of-care evidence summary product. Subscribers
gain access to a REST-style content surface at
``https://www.dynamed.com/api``. The exact endpoints and response shapes
are vendor-contract material and not part of any public documentation,
so this adapter is built on the same defensive pattern as the other
Slice-B live adapters: it tolerates rotation of container keys
(``documents``/``results``/``data``/``items``) and bare-list payloads.

Auth
----

DynaMed Plus uses an API-key bound to the subscribing institution. We
read the key from config (``api_key``) or the ``DEEPSYNAPS_DYNAMED_API_KEY``
env var and present it as a Bearer token AND a ``X-Api-Key`` header.
Without a key the adapter is **disabled** — ``connect()`` returns
``False`` immediately and ``fetch()`` raises ``FetchError``.

The adapter never fabricates rows.
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


BASE_URL = "https://www.dynamed.com/api"
PROBE_PATH = "/"
SEARCH_PATH = "/search"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
REQUESTS_PER_SECOND = 3

CREDENTIAL_ENV_VARS = ("DEEPSYNAPS_DYNAMED_API_KEY",)


# DynaMed topic types — point-of-care summaries tend to be expert
# digests rather than primary research. Map the label families onto
# CEBM evidence levels.
_TYPE_EVIDENCE: List[tuple] = [
    ("systematic review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("meta-analysis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("guideline", EvidenceLevel.EXPERT_OPINION),
    ("topic summary", EvidenceLevel.EXPERT_OPINION),
    ("topic", EvidenceLevel.EXPERT_OPINION),
    ("randomized", EvidenceLevel.RCT),
    ("controlled trial", EvidenceLevel.RCT),
    ("cohort", EvidenceLevel.COHORT_STUDY),
    ("case-control", EvidenceLevel.CASE_CONTROL),
    ("case series", EvidenceLevel.CASE_SERIES),
    ("review", EvidenceLevel.EXPERT_OPINION),
    ("editorial", EvidenceLevel.EXPERT_OPINION),
]


class DynaMedError(Exception):
    """Base exception for DynaMed adapter errors."""


class DynaMedAuthError(DynaMedError):
    """Raised when DynaMed returns 401/403 (bad/missing key)."""


class DynaMedAPIError(DynaMedError):
    """Raised on unexpected HTTP status or malformed response."""


class DynaMedRateLimitError(DynaMedError):
    """Raised when DynaMed returns 429 or the adapter self-throttles."""


class DynaMedLiveAdapter(DatabaseAdapter):
    """Credential-aware live adapter for DynaMed (EBSCO).

    Configuration keys (all optional except auth):

    * ``base_url``    — override default REST URL.
    * ``timeout``     — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``page_size``   — results per page (default 20, capped at 100).
    * ``api_key``     — DynaMed Plus institutional key. Falls back to
                        ``$DEEPSYNAPS_DYNAMED_API_KEY``. Without a key
                        the adapter is **disabled** and never calls the
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
            self.config.get("api_key") or os.environ.get("DEEPSYNAPS_DYNAMED_API_KEY")
        )
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0
        self._client: Optional[httpx.AsyncClient] = None

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "DynaMed"

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

    async def _request(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        if self._client is None:
            raise DynaMedError("Adapter not connected — call connect() first.")
        if path.startswith("/"):
            url = f"{self._base_url}{path}"
        else:
            url = f"{self._base_url}/{path}"
        last_exc: Optional[BaseException] = None
        for attempt in range(self._max_retries + 1):
            try:
                await self._enforce_rate_limit()
                response = await self._client.get(url, params=params or {})
                if response.status_code in (401, 403):
                    raise DynaMedAuthError(
                        f"DynaMed auth rejected (HTTP {response.status_code}). "
                        f"Verify DEEPSYNAPS_DYNAMED_API_KEY."
                    )
                if response.status_code == 429:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise DynaMedRateLimitError(
                        f"DynaMed 429 after {self._max_retries} retries"
                    )
                if response.status_code >= 500:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise DynaMedAPIError(
                        f"DynaMed HTTP {response.status_code}: "
                        f"{response.text[:240]}"
                    )
                if response.status_code != 200:
                    raise DynaMedAPIError(
                        f"DynaMed HTTP {response.status_code}: "
                        f"{response.text[:240]}"
                    )
                try:
                    return response.json()
                except (ValueError, TypeError):
                    return {}
            except (DynaMedAuthError, DynaMedRateLimitError):
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise DynaMedAPIError(f"DynaMed HTTP error: {exc}") from exc
        raise DynaMedAPIError(f"DynaMed unreachable: {last_exc}")

    # -- lifecycle -----------------------------------------------------------

    async def connect(self) -> bool:
        if not self._api_key:
            self._connected = False
            return False
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers=self._headers(),
            )
        try:
            payload = await self._request(PROBE_PATH)
            self._connected = isinstance(payload, (list, dict))
        except DynaMedError as exc:
            logger.warning("DynaMed connect probe failed: %s", exc)
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
        """Defensive against DynaMed's undocumented response shapes."""
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []
        for key in ("documents", "results", "data", "items", "topics"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return []

    async def fetch(
        self,
        query: Union[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        if not self._api_key:
            raise FetchError(
                "DynaMed credentials required: "
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
            raise DynaMedError(
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
            {"q": term.strip(), "limit": rows},
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
            for key in ("type", "topic_type", "category", "document_type")
        ]
        joined = " ".join(labels)
        for needle, level in _TYPE_EVIDENCE:
            if needle in joined:
                return level
        return EvidenceLevel.EXPERT_OPINION

    async def normalize(
        self,
        raw: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for doc in raw:
            if not isinstance(doc, dict):
                continue
            doc_id = str(doc.get("id") or doc.get("topic_id") or "").strip()
            doi = str(doc.get("doi") or "").strip()
            title = str(doc.get("title") or doc.get("topic") or "").strip()
            journal = str(doc.get("journal") or "DynaMed").strip()
            year = self._coerce_year(
                doc.get("year")
                or doc.get("publication_year")
                or doc.get("updated_year")
            )
            authors = self._authors_to_strings(doc.get("authors") or doc.get("author"))
            evidence_level = self._classify_evidence_level(doc)
            url = doc.get("url") or doc.get("link") or ""
            normalized = {
                "source": "dynamed",
                "source_record_id": doc_id or doi or title,
                "dynamed_id": doc_id,
                "doi": doi or None,
                "title": title,
                "abstract": doc.get("abstract") or doc.get("summary") or "",
                "authors": authors,
                "year": year,
                "journal": journal,
                "publication_type": str(doc.get("type") or doc.get("topic_type") or ""),
                "evidence_level": evidence_level.value,
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
                not record.get("dynamed_id")
                and not record.get("doi")
                and not record.get("title")
            ):
                continue
            valid.append(record)
        return valid

    # -- metadata -----------------------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        rec_id = str(record.get("dynamed_id") or record.get("source_record_id") or "")
        doi = str(record.get("doi") or "")
        return ProvenanceRecord(
            source_database="DynaMed",
            source_version=self.source_version,
            source_record_id=rec_id,
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="EBSCO-subscription",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel(
                record.get("evidence_level") or EvidenceLevel.EXPERT_OPINION.value
            ),
            citation_doi=doi or None,
            attribution_text="Data from DynaMed (EBSCO subscription).",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="EBSCO-subscription",
            license_url="https://www.dynamed.com/home/terms-and-conditions",
            attribution_text="Data from DynaMed (EBSCO subscription).",
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
        if record.get("dynamed_id") or record.get("doi"):
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.LOW

    async def health_check(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "adapter_name": "DynaMed",
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
                "DynaMed API key not configured "
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
            payload = await self._request(PROBE_PATH)
            latency_ms = int((loop_now() - start) * 1000)
            result["connected"] = isinstance(payload, (list, dict))
            result["latency_ms"] = latency_ms
            result["status"] = "ok" if result["connected"] else "degraded"
            result["message"] = "DynaMed root probe ok."
        except DynaMedError as exc:
            result["message"] = f"DynaMed probe failed: {exc}"
            result["error"] = str(exc)
            result["status"] = "error"
        return result


__all__ = [
    "CREDENTIAL_ENV_VARS",
    "DynaMedAPIError",
    "DynaMedAuthError",
    "DynaMedError",
    "DynaMedLiveAdapter",
    "DynaMedRateLimitError",
]
