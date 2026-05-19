"""
PubMed Central (PMC) live adapter — NCBI E-utilities, db=pmc.

Slice B-2 of the Category-3 program. Sidecar to the catalogued-only
``PubMedCentralAdapter`` shim from PR #1049; same swap-on-merge pattern
as ``CrossRefLiveAdapter`` in PR #1074.

Scope
-----

This adapter targets the *bibliographic / metadata* slice of PMC, not
full-text XML retrieval. Two-call workflow:

1. ``esearch.fcgi?db=pmc&term=<query>&retmode=json`` → PMC IDs.
2. ``esummary.fcgi?db=pmc&id=<csv>&retmode=json`` → per-record metadata.

Full-text ``efetch`` (PMC XML) is out of scope for the federation use
case and is a separate slice if/when we add full-text excerpts.

Why JSON only
-------------

PMC has only one record-format mode that comes back as JSON (``esummary``
with ``retmode=json``). For everything richer the NCBI server returns
XML or NLM-DTD. The federation only needs bibliographic shape, so we
stay in JSON and avoid pulling in an XML parser for this adapter — the
PubMed adapter already exercises XML parsing for the abstract path.

NCBI etiquette
--------------

- No API key → 3 req/s
- API key (``NCBI_API_KEY`` env or ``api_key`` config) → 10 req/s
- ``tool=`` and ``email=`` parameters help NCBI throttle politely
  rather than blacklist. We send both when configured.

Out of scope
------------

- Cursor / WebEnv-based deep pagination. PMC search results are bounded
  by ``retmax`` (we cap at ``MAX_RESULTS_HARD_CAP=200``); deep walks
  belong in an ingest job, not in a federation hot path.
- Full-text XML normalization.
"""

from __future__ import annotations

import asyncio
import logging
import os
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


BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
DB_NAME = "pmc"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_PAGE_SIZE = 20
MAX_RESULTS_HARD_CAP = 200

# NCBI E-utilities limits.
REQUESTS_PER_SECOND_NO_KEY = 3
REQUESTS_PER_SECOND_WITH_KEY = 10


# PMC ``pubtype`` strings → CEBM EvidenceLevel. Same map as PubMed but
# only the labels that PMC actually returns in its esummary docsums.
_PUBTYPE_EVIDENCE: List[tuple] = [
    ("meta-analysis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("systematic review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("randomized controlled trial", EvidenceLevel.RCT),
    ("controlled clinical trial", EvidenceLevel.RCT),
    ("practice guideline", EvidenceLevel.EXPERT_OPINION),
    ("guideline", EvidenceLevel.EXPERT_OPINION),
    ("clinical trial", EvidenceLevel.CASE_SERIES),
    ("observational study", EvidenceLevel.COHORT_STUDY),
    ("review", EvidenceLevel.EXPERT_OPINION),
    ("case reports", EvidenceLevel.CASE_SERIES),
    ("preprint", EvidenceLevel.PILOT_EXPERT),
]


class PubMedCentralError(Exception):
    """Base exception for PMC adapter errors."""


class PubMedCentralNotFoundError(PubMedCentralError):
    """Raised when a PMCID lookup has no result."""


class PubMedCentralAPIError(PubMedCentralError):
    """Raised on unexpected HTTP status or malformed response."""


class PubMedCentralRateLimitError(PubMedCentralError):
    """Raised when NCBI returns 429 or the adapter self-throttles."""


class PubMedCentralLiveAdapter(DatabaseAdapter):
    """Async live adapter for the PubMed Central JSON E-utility surface.

    Configuration keys (all optional):

    * ``base_url``    — override default E-utility URL.
    * ``timeout``     — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``page_size``   — results per query (default 20, capped at 200).
    * ``api_key``     — NCBI API key. Falls back to ``$NCBI_API_KEY``.
    * ``tool``        — NCBI ``tool=`` param. Default "deepsynaps".
    * ``email``       — NCBI ``email=`` param. Recommended for polite
                        throttling; falls back to ``$NCBI_EMAIL``.
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
            MAX_RESULTS_HARD_CAP,
        )
        self._api_key: Optional[str] = (
            self.config.get("api_key") or os.environ.get("NCBI_API_KEY")
        )
        self._tool: str = str(self.config.get("tool", "deepsynaps"))
        self._email: Optional[str] = (
            self.config.get("email") or os.environ.get("NCBI_EMAIL")
        )
        rps = REQUESTS_PER_SECOND_WITH_KEY if self._api_key else REQUESTS_PER_SECOND_NO_KEY
        self._min_interval: float = 1.0 / rps
        self._last_request_time: float = 0.0
        self._client: Optional[httpx.AsyncClient] = None

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "PubMed Central"

    @property
    def source_version(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # -- params + HTTP plumbing ----------------------------------------------

    def _base_params(self) -> Dict[str, Any]:
        params: Dict[str, Any] = {"db": DB_NAME, "tool": self._tool}
        if self._email:
            params["email"] = self._email
        if self._api_key:
            params["api_key"] = self._api_key
        return params

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
    ) -> Dict[str, Any]:
        if self._client is None:
            raise PubMedCentralError("Adapter not connected — call connect() first.")
        url = f"{self._base_url}{path}"
        last_exc: Optional[BaseException] = None
        for attempt in range(self._max_retries + 1):
            try:
                await self._enforce_rate_limit()
                response = await self._client.get(url, params=params)
                if response.status_code == 404:
                    raise PubMedCentralNotFoundError(f"PMC 404 for {url}")
                if response.status_code == 429:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise PubMedCentralRateLimitError(
                        f"PMC 429 after {self._max_retries} retries"
                    )
                if response.status_code >= 500:
                    if attempt < self._max_retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise PubMedCentralAPIError(
                        f"PMC HTTP {response.status_code}: {response.text[:240]}"
                    )
                if response.status_code != 200:
                    raise PubMedCentralAPIError(
                        f"PMC HTTP {response.status_code}: {response.text[:240]}"
                    )
                payload = response.json()
                if not isinstance(payload, dict):
                    raise PubMedCentralAPIError("PMC response was not a JSON object")
                return payload
            except (PubMedCentralNotFoundError, PubMedCentralRateLimitError):
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise PubMedCentralAPIError(f"PMC HTTP error: {exc}") from exc
        raise PubMedCentralAPIError(f"PMC unreachable: {last_exc}")

    # -- lifecycle -----------------------------------------------------------

    async def connect(self) -> bool:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"Accept": "application/json"},
            )
        try:
            payload = await self._request(
                "/einfo.fcgi",
                {**self._base_params(), "retmode": "json"},
            )
            self._connected = bool(payload.get("einforesult") or "header" in payload)
        except PubMedCentralError as exc:
            logger.warning("PMC connect probe failed: %s", exc)
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

    async def _esearch(self, term: str, retmax: int) -> List[str]:
        params = {
            **self._base_params(),
            "term": term,
            "retmode": "json",
            "retmax": min(retmax, MAX_RESULTS_HARD_CAP),
        }
        payload = await self._request("/esearch.fcgi", params)
        result = payload.get("esearchresult") or {}
        id_list = result.get("idlist")
        if not isinstance(id_list, list):
            return []
        return [str(pmcid) for pmcid in id_list if pmcid]

    async def _esummary(self, pmcids: List[str]) -> List[Dict[str, Any]]:
        if not pmcids:
            return []
        params = {
            **self._base_params(),
            "id": ",".join(pmcids),
            "retmode": "json",
        }
        payload = await self._request("/esummary.fcgi", params)
        result = payload.get("result") or {}
        uids = result.get("uids")
        if not isinstance(uids, list):
            return []
        out: List[Dict[str, Any]] = []
        for uid in uids:
            doc = result.get(str(uid))
            if isinstance(doc, dict):
                # Always preserve the PMCID — the doc may omit it under
                # surprising key names in NCBI responses.
                doc.setdefault("uid", str(uid))
                out.append(doc)
        return out

    async def fetch(
        self,
        query: Union[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Search PMC and return raw esummary documents.

        Accepts a bare query string or a dict ``{query, rows, pmcid}``.
        ``pmcid`` overrides the search and fetches one record directly.
        """
        if isinstance(query, str):
            term = query
            retmax = self._page_size
            pmcid_lookup: Optional[str] = None
        elif isinstance(query, dict):
            term = str(query.get("query") or "")
            retmax = min(int(query.get("rows", self._page_size)), MAX_RESULTS_HARD_CAP)
            pmcid_lookup = query.get("pmcid") or query.get("pmc_id")
        else:
            raise PubMedCentralError(
                f"Unsupported query type: {type(query).__name__}"
            )

        if pmcid_lookup:
            normalized = str(pmcid_lookup).upper().replace("PMC", "").strip()
            docs = await self._esummary([normalized])
            if not docs:
                raise PubMedCentralNotFoundError(
                    f"PMC has no record for PMCID {pmcid_lookup}"
                )
            return docs

        if not term.strip():
            return []
        pmcids = await self._esearch(term.strip(), retmax)
        return await self._esummary(pmcids)

    # -- normalization ------------------------------------------------------

    @staticmethod
    def _authors_to_strings(authors: Any) -> List[str]:
        if not isinstance(authors, list):
            return []
        out: List[str] = []
        for entry in authors:
            if not isinstance(entry, dict):
                continue
            name = entry.get("name") or ""
            if not name:
                last = entry.get("lastname") or ""
                first = entry.get("forename") or entry.get("initials") or ""
                name = f"{first} {last}".strip()
            if name:
                out.append(str(name))
        return out

    @staticmethod
    def _year_from(doc: Dict[str, Any]) -> Optional[int]:
        for key in ("pubdate", "epubdate", "sortpubdate", "printpubdate"):
            value = doc.get(key)
            if isinstance(value, str) and value[:4].isdigit():
                try:
                    return int(value[:4])
                except (TypeError, ValueError):
                    continue
        return None

    @staticmethod
    def _extract_ids(article_ids: Any) -> Dict[str, str]:
        """NCBI returns articleids as a list of {idtype, value} dicts."""
        out: Dict[str, str] = {}
        if isinstance(article_ids, list):
            for entry in article_ids:
                if not isinstance(entry, dict):
                    continue
                idtype = str(entry.get("idtype") or "").lower()
                value = str(entry.get("value") or "").strip()
                if idtype and value:
                    out[idtype] = value
        return out

    def _classify_evidence_level(self, pubtypes: Any) -> EvidenceLevel:
        labels: List[str] = []
        if isinstance(pubtypes, list):
            labels = [str(p).lower() for p in pubtypes if isinstance(p, str)]
        elif isinstance(pubtypes, str):
            labels = [pubtypes.lower()]
        joined = " | ".join(labels)
        for needle, level in _PUBTYPE_EVIDENCE:
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
            ids = self._extract_ids(doc.get("articleids"))
            # PMCID must come from articleids — never fall back to ``uid``
            # alone, which is just NCBI's docsum row key and not a real
            # PMCID. ``validate()`` relies on this so malformed docs
            # (no articleids) are correctly dropped.
            pmcid_raw = ids.get("pmcid") or ""
            pmcid = (
                str(pmcid_raw).upper()
                if isinstance(pmcid_raw, str) and pmcid_raw
                else ""
            )
            pmid = ids.get("pmid") or ""
            doi = ids.get("doi") or ""
            title = doc.get("title") or ""
            journal = doc.get("fulljournalname") or doc.get("source") or ""
            year = self._year_from(doc)
            authors = self._authors_to_strings(doc.get("authors"))
            pubtypes = doc.get("pubtype")
            evidence_level = self._classify_evidence_level(pubtypes)
            url = (
                f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
                if pmcid
                else ""
            )
            normalized = {
                "source": "pubmed_central",
                "source_record_id": pmcid or pmid or doi or title,
                "pmcid": pmcid,
                "pmid": pmid,
                "doi": doi,
                "title": title,
                "abstract": "",  # esummary does not include abstracts
                "authors": authors,
                "year": year,
                "journal": journal,
                "publication_type": ", ".join(pubtypes) if isinstance(pubtypes, list) else (pubtypes or ""),
                "evidence_level": evidence_level.value,
                "url": url,
                "is_open_access": True,  # all PMC records are OA by definition
                "issn": doc.get("issn") or doc.get("essn") or "",
            }
            out.append(normalized)
        return out

    async def validate(
        self,
        records: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        valid: List[Dict[str, Any]] = []
        for record in records:
            # PMC records always have a PMCID or PMID — drop anything missing
            # both (defensive against malformed upstream responses).
            if not record.get("pmcid") and not record.get("pmid") and not record.get("doi"):
                continue
            valid.append(record)
        return valid

    # -- metadata ----------------------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        pmcid = str(record.get("pmcid") or "")
        doi = str(record.get("doi") or "")
        return ProvenanceRecord(
            source_database="PubMed Central",
            source_version=self.source_version,
            source_record_id=pmcid or doi or str(record.get("pmid") or ""),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="NCBI-terms",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel(
                record.get("evidence_level") or EvidenceLevel.ANECDOTAL.value
            ),
            citation_doi=doi or None,
            attribution_text=(
                "Data from PubMed Central, U.S. National Library of Medicine."
            ),
            retrieval_method="direct",
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="NCBI-terms",
            license_url="https://www.ncbi.nlm.nih.gov/home/about/policies/",
            attribution_text=(
                "Data from PubMed Central, U.S. National Library of Medicine."
            ),
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        pubtype = str(record.get("publication_type") or "").lower()
        if "preprint" in pubtype or "posted-content" in pubtype:
            return ConfidenceTier.MEDIUM
        if record.get("pmcid") or record.get("pmid"):
            return ConfidenceTier.HIGH
        return ConfidenceTier.LOW

    async def health_check(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "adapter_name": "PubMed Central",
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
                "/einfo.fcgi",
                {**self._base_params(), "retmode": "json"},
            )
            latency_ms = int((loop_now() - start) * 1000)
            result["connected"] = bool(
                payload.get("einforesult") or "header" in payload
            )
            result["latency_ms"] = latency_ms
            result["status"] = "ok"
            result["message"] = "PMC einfo probe ok."
        except PubMedCentralError as exc:
            result["message"] = f"PMC probe failed: {exc}"
            result["error"] = str(exc)
            result["status"] = "error"
        return result


__all__ = [
    "PubMedCentralAPIError",
    "PubMedCentralError",
    "PubMedCentralLiveAdapter",
    "PubMedCentralNotFoundError",
    "PubMedCentralRateLimitError",
]
