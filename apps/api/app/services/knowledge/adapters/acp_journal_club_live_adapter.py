"""
ACP Journal Club live adapter — credential-aware, subscription-gated.

Slice B-4 of the Category-3 program. Replaces the catalogued-only
``ACPJournalClubAdapter`` stub.

ACP Journal Club is a curated evidence-summary product from the American
College of Physicians published on the Annals of Internal Medicine
platform (``https://www.acpjournals.org/journal/aim``). There is no
publicly documented machine-readable API. Subscribers fetch content over
the standard journal-platform interface, with credentials supplied as
HTTP Basic auth.

This adapter is therefore *credential-aware* rather than fully
machine-readable:

- Without ``DEEPSYNAPS_ACP_USERNAME`` + ``DEEPSYNAPS_ACP_PASSWORD`` it is
  ``disabled`` and never calls the vendor.
- With credentials it probes the vendor base URL with the basic-auth
  header attached; a ``200`` response signals the credentials are
  accepted by the platform.
- ``fetch()`` attempts a credentialed search against the journal
  landing page and returns whatever rows the platform exposes. Vendor
  shapes are not documented, so ``_extract_results()`` accepts the
  same family of JSON containers as the other Slice-B adapters; if the
  vendor returns HTML, the adapter currently treats that as an empty
  result rather than guessing structure.

The adapter never fabricates rows. A failed call raises a typed
``ACPJournalClubAPIError``.
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


BASE_URL = "https://www.acpjournals.org/journal/aim"
SEARCH_PATH = "/journal/aim"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
REQUESTS_PER_SECOND = 2

CREDENTIAL_ENV_VARS = ("DEEPSYNAPS_ACP_USERNAME", "DEEPSYNAPS_ACP_PASSWORD")


_TYPE_EVIDENCE: List[tuple] = [
    ("systematic review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("meta-analysis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("guideline", EvidenceLevel.EXPERT_OPINION),
    ("controlled trial", EvidenceLevel.RCT),
    ("randomized", EvidenceLevel.RCT),
    ("cohort", EvidenceLevel.COHORT_STUDY),
    ("case-control", EvidenceLevel.CASE_CONTROL),
    ("editorial", EvidenceLevel.EXPERT_OPINION),
    ("commentary", EvidenceLevel.EXPERT_OPINION),
    ("review", EvidenceLevel.EXPERT_OPINION),
]


class ACPJournalClubError(Exception):
    """Base exception for ACP Journal Club adapter errors."""


class ACPJournalClubAuthError(ACPJournalClubError):
    """Raised when ACP returns 401/403 (bad/missing credentials)."""


class ACPJournalClubAPIError(ACPJournalClubError):
    """Raised on unexpected HTTP status or malformed response."""


class ACPJournalClubRateLimitError(ACPJournalClubError):
    """Raised when ACP returns 429 or the adapter self-throttles."""


class ACPJournalClubLiveAdapter(DatabaseAdapter):
    """Credential-aware live adapter for ACP Journal Club.

    Configuration keys (all optional except auth):

    * ``base_url``    — override default URL.
    * ``timeout``     — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``page_size``   — results per page (default 20, capped at 100).
    * ``username``    — ACP subscriber username. Falls back to
                        ``$DEEPSYNAPS_ACP_USERNAME``.
    * ``password``    — ACP subscriber password. Falls back to
                        ``$DEEPSYNAPS_ACP_PASSWORD``.
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
        self._username: Optional[str] = (
            self.config.get("username") or os.environ.get("DEEPSYNAPS_ACP_USERNAME")
        )
        self._password: Optional[str] = (
            self.config.get("password") or os.environ.get("DEEPSYNAPS_ACP_PASSWORD")
        )
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0
        self._client: Optional[httpx.AsyncClient] = None

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "ACP Journal Club"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    @property
    def _has_credentials(self) -> bool:
        return bool(self._username and self._password)

    # -- HTTP plumbing -------------------------------------------------------

    def _auth(self) -> Optional[httpx.BasicAuth]:
        if not self._has_credentials:
            return None
        return httpx.BasicAuth(self._username or "", self._password or "")

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
            raise ACPJournalClubError(
                "Adapter not connected — call connect() first."
            )
        url = f"{self._base_url}{path}" if path.startswith("/") else f"{self._base_url}/{path}"
        last_exc: Optional[BaseException] = None
        for attempt in range(self._max_retries + 1):
            try:
                await self._enforce_rate_limit()
                response = await self._client.get(url, params=params or {})
                if response.status_code in (401, 403):
                    raise ACPJournalClubAuthError(
                        f"ACP Journal Club auth rejected (HTTP {response.status_code}). "
                        f"Verify DEEPSYNAPS_ACP_USERNAME / DEEPSYNAPS_ACP_PASSWORD."
                    )
                if response.status_code == 429:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise ACPJournalClubRateLimitError(
                        f"ACP Journal Club 429 after {self._max_retries} retries"
                    )
                if response.status_code >= 500:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise ACPJournalClubAPIError(
                        f"ACP Journal Club HTTP {response.status_code}: "
                        f"{response.text[:240]}"
                    )
                if response.status_code != 200:
                    raise ACPJournalClubAPIError(
                        f"ACP Journal Club HTTP {response.status_code}: "
                        f"{response.text[:240]}"
                    )
                # ACP serves HTML for the journal landing page; tolerate
                # both JSON and non-JSON content. _extract_results() will
                # return [] for HTML, which is the correct "we have no
                # machine-readable rows" signal.
                try:
                    return response.json()
                except (ValueError, TypeError):
                    return {}
            except (
                ACPJournalClubAuthError,
                ACPJournalClubRateLimitError,
            ):
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise ACPJournalClubAPIError(
                    f"ACP Journal Club HTTP error: {exc}"
                ) from exc
        raise ACPJournalClubAPIError(
            f"ACP Journal Club unreachable: {last_exc}"
        )

    # -- lifecycle -----------------------------------------------------------

    async def connect(self) -> bool:
        if not self._has_credentials:
            self._connected = False
            return False
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"Accept": "application/json, text/html;q=0.9"},
                auth=self._auth(),
            )
        try:
            # Probe the journal landing page. A 200 (with or without
            # JSON) means the credentials are accepted by the platform.
            payload = await self._request(SEARCH_PATH)
            self._connected = isinstance(payload, (list, dict))
        except ACPJournalClubError as exc:
            logger.warning("ACP Journal Club connect probe failed: %s", exc)
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
        """Defensive against ACP's undocumented response shapes."""
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []
        for key in ("documents", "results", "data", "items", "articles"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return []

    async def fetch(
        self,
        query: Union[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        if not self._has_credentials:
            raise FetchError(
                "ACP Journal Club credentials required: "
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
            raise ACPJournalClubError(
                f"Unsupported query type: {type(query).__name__}"
            )

        if not term.strip():
            return []

        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"Accept": "application/json, text/html;q=0.9"},
                auth=self._auth(),
            )

        payload = await self._request(
            SEARCH_PATH,
            {"AllField": term.strip(), "pageSize": rows},
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
            for key in ("type", "publication_type", "category", "document_type")
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
            doc_id = str(doc.get("id") or doc.get("doc_id") or "").strip()
            doi = str(doc.get("doi") or "").strip()
            title = str(doc.get("title") or "").strip()
            journal = str(
                doc.get("journal")
                or doc.get("publication")
                or "ACP Journal Club"
            ).strip()
            year = self._coerce_year(doc.get("year") or doc.get("publication_year"))
            authors = self._authors_to_strings(doc.get("authors") or doc.get("author"))
            evidence_level = self._classify_evidence_level(doc)
            url = doc.get("url") or doc.get("link") or ""
            normalized = {
                "source": "acp_journal_club",
                "source_record_id": doc_id or doi or title,
                "acp_id": doc_id,
                "doi": doi or None,
                "title": title,
                "abstract": doc.get("abstract") or doc.get("summary") or "",
                "authors": authors,
                "year": year,
                "journal": journal,
                "publication_type": str(doc.get("type") or ""),
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
                not record.get("acp_id")
                and not record.get("doi")
                and not record.get("title")
            ):
                continue
            valid.append(record)
        return valid

    # -- metadata -----------------------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        rec_id = str(record.get("acp_id") or record.get("source_record_id") or "")
        doi = str(record.get("doi") or "")
        return ProvenanceRecord(
            source_database="ACP Journal Club",
            source_version=self.source_version,
            source_record_id=rec_id,
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="ACP-subscription",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel(
                record.get("evidence_level") or EvidenceLevel.EXPERT_OPINION.value
            ),
            citation_doi=doi or None,
            attribution_text="Data from ACP Journal Club (subscription).",
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="ACP-subscription",
            license_url="https://www.acpjournals.org/journal/aim/about",
            attribution_text="Data from ACP Journal Club (subscription).",
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
        if record.get("acp_id") or record.get("doi"):
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.LOW

    async def health_check(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "adapter_name": "ACP Journal Club",
            "source_name": self.source_name,
            "source_version": self.source_version,
            "endpoint": self._base_url,
            "requires_credentials": True,
            "credential_env_vars": list(CREDENTIAL_ENV_VARS),
            "credentials_configured": self._has_credentials,
            "connected": False,
            "latency_ms": None,
            "last_check": datetime.now(timezone.utc).isoformat(),
            "message": "",
        }
        if not self._has_credentials:
            result["status"] = "disabled"
            result["message"] = (
                "ACP Journal Club credentials not configured "
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
            payload = await self._request(SEARCH_PATH)
            latency_ms = int((loop_now() - start) * 1000)
            result["connected"] = isinstance(payload, (list, dict))
            result["latency_ms"] = latency_ms
            result["status"] = "ok" if result["connected"] else "degraded"
            result["message"] = "ACP Journal Club landing-page probe ok."
        except ACPJournalClubError as exc:
            result["message"] = f"ACP Journal Club probe failed: {exc}"
            result["error"] = str(exc)
            result["status"] = "error"
        return result


__all__ = [
    "ACPJournalClubAPIError",
    "ACPJournalClubAuthError",
    "ACPJournalClubError",
    "ACPJournalClubLiveAdapter",
    "ACPJournalClubRateLimitError",
    "CREDENTIAL_ENV_VARS",
]
