"""
PubMed / MEDLINE Adapter — NCBI E-utilities REST API.

Provides normalised access to biomedical citations in PubMed/MEDLINE.
Wraps the NCBI E-utilities endpoints (einfo, esearch, esummary, efetch) and
emits records that conform to the Knowledge Layer canonical schema.

API docs: https://www.ncbi.nlm.nih.gov/books/NBK25499/

Implementation notes
--------------------
* Uses ``httpx`` for outbound HTTP. ``httpx`` is the standard async HTTP
  client in this repo (48 other import sites). The pre-existing adapters in
  this directory import ``aiohttp`` which is not declared in
  ``apps/api/pyproject.toml`` and is not installed in the venv; those
  adapters are not currently importable and are therefore not wired into
  any production code path. This file is the first one in the directory
  that actually imports and runs.
* Subclasses ``app.services.knowledge.base_adapter.DatabaseAdapter`` —
  the production ABC. Implements all 11 abstract members.
* Reference-only research source: ``apps/api/app/knowledge/pubmed_adapter.py``
  (Kimi material, parallel directory, not importable). See
  ``docs/engineering/knowledge-adapter-roadmap.md``.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import xml.etree.ElementTree as ET
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

BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
DB_NAME = "pubmed"
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5

# NCBI rate limits: 3/s without an API key, 10/s with one.
REQUESTS_PER_SECOND_NO_KEY = 3
REQUESTS_PER_SECOND_WITH_KEY = 10

# Hard cap on result-set size to avoid pathological scrapes.
MAX_RESULTS_HARD_CAP = 200

# Map PubMed publication types → CEBM-style EvidenceLevel.
# Order matters: first match wins, so the highest-evidence types come first.
PUBTYPE_EVIDENCE_MAP: List[tuple] = [
    ("Meta-Analysis", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("Systematic Review", EvidenceLevel.SYSTEMATIC_REVIEW),
    ("Randomized Controlled Trial", EvidenceLevel.RCT),
    ("Controlled Clinical Trial", EvidenceLevel.RCT),
    ("Practice Guideline", EvidenceLevel.EXPERT_OPINION),
    ("Guideline", EvidenceLevel.EXPERT_OPINION),
    ("Clinical Trial, Phase III", EvidenceLevel.RCT),
    ("Clinical Trial, Phase II", EvidenceLevel.CASE_SERIES),
    ("Clinical Trial, Phase I", EvidenceLevel.CASE_SERIES),
    ("Clinical Trial", EvidenceLevel.CASE_SERIES),
    ("Observational Study", EvidenceLevel.COHORT_STUDY),
    ("Comparative Study", EvidenceLevel.COHORT_STUDY),
    ("Multicenter Study", EvidenceLevel.COHORT_STUDY),
    ("Case Reports", EvidenceLevel.CASE_SERIES),
    ("Review", EvidenceLevel.EXPERT_OPINION),
]


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class PubMedError(Exception):
    """Base exception for PubMed adapter errors."""


class PubMedNotFoundError(PubMedError):
    """Raised when a queried PMID or term has no results."""


class PubMedAPIError(PubMedError):
    """Raised on unexpected HTTP status or malformed response."""


class PubMedRateLimitError(PubMedError):
    """Raised when NCBI returns 429 or when the adapter is self-throttling."""


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class PubMedAdapter(DatabaseAdapter):
    """Async adapter for the NCBI PubMed / MEDLINE E-utilities REST API.

    Configuration keys (all optional):

    * ``base_url`` — override the default E-utilities base URL.
    * ``api_key``  — NCBI API key. Raises the rate limit from 3/s to 10/s.
    * ``email``    — contact email; NCBI requests this for rate-limit
                     accounting and may throttle anonymous traffic harder.
    * ``tool``     — application identifier (default ``DeepSynaps``).
    * ``timeout``  — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``cache_ttl`` — in-memory cache TTL in seconds (default 3600).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", BASE_URL).rstrip("/")
        self._api_key: Optional[str] = self.config.get("api_key")
        self._email: Optional[str] = self.config.get("email")
        self._tool: str = self.config.get("tool", "DeepSynaps")
        self._timeout: httpx.Timeout = httpx.Timeout(
            self.config.get("timeout", 30.0), connect=10.0
        )
        self._max_retries: int = int(self.config.get("max_retries", MAX_RETRIES))
        self._cache_ttl = int(self.config.get("cache_ttl", 3600))
        self._client: Optional[httpx.AsyncClient] = None

        per_second = (
            REQUESTS_PER_SECOND_WITH_KEY if self._api_key else REQUESTS_PER_SECOND_NO_KEY
        )
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(per_second)
        self._min_interval: float = 1.0 / per_second
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "PubMed"

    @property
    def source_version(self) -> str:
        # PubMed is a rolling daily release; report the current UTC date so
        # provenance records pin the data to the day it was retrieved.
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # -- HTTP plumbing --------------------------------------------------------

    def _cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        payload = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _apply_credentials(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Attach api_key / email / tool to every E-utilities request."""
        merged = dict(params)
        if self._api_key:
            merged["api_key"] = self._api_key
        if self._email:
            merged["email"] = self._email
        merged.setdefault("tool", self._tool)
        return merged

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
        *,
        response_format: str = "json",
    ) -> Any:
        """GET against E-utilities with retry, rate-limit and cache."""
        params = self._apply_credentials(params or {})
        cache_key = self._cache_key(endpoint, params) + f":{response_format}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._client is None:
            raise PubMedError("HTTP client not initialised — call connect() first.")

        url = f"{self._base_url}/{endpoint.lstrip('/')}"
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    resp = await self._client.get(url, params=params)
                    if resp.status_code == 404:
                        raise PubMedNotFoundError(
                            f"PubMed resource not found: {url}"
                        )
                    if resp.status_code == 429:
                        raise PubMedRateLimitError(
                            "Rate limited by NCBI E-utilities"
                        )
                    if 500 <= resp.status_code < 600:
                        last_exception = httpx.HTTPStatusError(
                            f"{resp.status_code} server error",
                            request=resp.request,
                            response=resp,
                        )
                        wait = RETRY_BACKOFF * attempt
                        logger.warning(
                            "PubMed transient %s on attempt %d/%d — retrying in %.1fs",
                            resp.status_code,
                            attempt,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    if resp.status_code >= 400:
                        raise PubMedAPIError(
                            f"PubMed API error {resp.status_code}: {resp.text[:200]}"
                        )
                    data = resp.json() if response_format == "json" else resp.text
                    self._cache[cache_key] = data
                    return data
            except (httpx.RequestError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "PubMed network error on attempt %d/%d — retrying in %.1fs (%s)",
                    attempt,
                    self._max_retries,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)

        raise PubMedAPIError(
            f"PubMed request failed after {self._max_retries} attempts"
        ) from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise httpx client and verify NCBI is reachable."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": f"DeepSynaps-PubMedAdapter/1.0 ({self._tool})",
                },
            )
        try:
            await self._request("einfo.fcgi", {"db": DB_NAME, "retmode": "json"})
            self._connected = True
            logger.info("PubMedAdapter connected — %s", self._base_url)
            return True
        except PubMedError as exc:
            logger.warning("PubMedAdapter connect failed: %s", exc)
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._cache.clear()
        self._connected = False
        logger.info("PubMedAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Any) -> List[Dict[str, Any]]:
        """Execute a PubMed query and return summary records.

        Query forms:

        * ``str`` — free-text search term, executed with default filters.
        * ``dict`` keys:
            - ``term``           : free-text query (required if no ``pmids``)
            - ``pmids``          : list of PMIDs to fetch directly
            - ``max_results``    : int, capped at MAX_RESULTS_HARD_CAP
            - ``date_from``      : YYYY/MM/DD (inclusive, on Entrez Date)
            - ``date_to``        : YYYY/MM/DD (inclusive, on Entrez Date)
            - ``publication_type``: str or list of PubMed pub types
            - ``sort``           : ``relevance`` (default) or ``pub_date``
            - ``include_abstract``: bool, fetch full abstracts via efetch
        """
        if not self._connected:
            await self.connect()

        if isinstance(query, str):
            query = {"term": query}
        if not isinstance(query, dict):
            raise PubMedError("Query must be a string or a dict.")

        pmids: List[str] = []
        if "pmids" in query and query["pmids"]:
            pmids = [str(p) for p in query["pmids"]]
        else:
            term = query.get("term")
            if not term:
                raise PubMedError("Query requires either 'term' or 'pmids'.")
            pmids = await self._esearch(query, term)

        if not pmids:
            return []

        summaries = await self._esummary(pmids)
        if query.get("include_abstract"):
            abstracts = await self._efetch_abstracts(pmids)
            for record in summaries:
                pmid = record.get("uid") or record.get("pmid")
                record["abstract"] = abstracts.get(str(pmid), "")
        return summaries

    async def _esearch(self, query: Dict[str, Any], term: str) -> List[str]:
        max_results = min(
            int(query.get("max_results", 20)), MAX_RESULTS_HARD_CAP
        )
        params: Dict[str, Any] = {
            "db": DB_NAME,
            "term": self._build_esearch_term(term, query),
            "retmode": "json",
            "retmax": max_results,
            "sort": "relevance" if query.get("sort", "relevance") == "relevance" else "pub_date",
        }
        if "date_from" in query:
            params["mindate"] = query["date_from"].replace("-", "/")
        if "date_to" in query:
            params["maxdate"] = query["date_to"].replace("-", "/")
        if "date_from" in query or "date_to" in query:
            params["datetype"] = "edat"

        data = await self._request("esearch.fcgi", params)
        return data.get("esearchresult", {}).get("idlist", [])

    @staticmethod
    def _build_esearch_term(term: str, query: Dict[str, Any]) -> str:
        """Append pub-type filters to the free-text term using PubMed syntax."""
        pub_types = query.get("publication_type")
        if not pub_types:
            return term
        if isinstance(pub_types, str):
            pub_types = [pub_types]
        filters = " OR ".join(f'"{pt}"[Publication Type]' for pt in pub_types)
        return f"({term}) AND ({filters})"

    async def _esummary(self, pmids: List[str]) -> List[Dict[str, Any]]:
        if not pmids:
            return []
        params = {
            "db": DB_NAME,
            "id": ",".join(pmids),
            "retmode": "json",
        }
        data = await self._request("esummary.fcgi", params)
        result = data.get("result", {})
        uids = result.get("uids", [])
        return [result[uid] for uid in uids if uid in result]

    async def _efetch_abstracts(self, pmids: List[str]) -> Dict[str, str]:
        if not pmids:
            return {}
        params = {
            "db": DB_NAME,
            "id": ",".join(pmids),
            "retmode": "xml",
            "rettype": "abstract",
        }
        xml_text = await self._request("efetch.fcgi", params, response_format="xml")
        return self._parse_abstract_xml(xml_text)

    @staticmethod
    def _parse_abstract_xml(xml_text: str) -> Dict[str, str]:
        """Extract PMID → abstract text from an efetch XML payload.

        Errors are tolerated: malformed XML returns an empty dict rather than
        raising, so a partial fetch never poisons normalise().
        """
        out: Dict[str, str] = {}
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            logger.warning("PubMed efetch XML parse error; abstracts skipped")
            return out
        for article in root.iter("PubmedArticle"):
            pmid_el = article.find(".//PMID")
            if pmid_el is None or pmid_el.text is None:
                continue
            pmid = pmid_el.text.strip()
            parts: List[str] = []
            for abst in article.iter("AbstractText"):
                txt = "".join(abst.itertext()).strip()
                if txt:
                    label = abst.attrib.get("Label")
                    parts.append(f"{label}: {txt}" if label else txt)
            if parts:
                out[pmid] = "\n\n".join(parts)
        return out

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
        pmid = raw.get("uid") or raw.get("pmid")
        if not pmid:
            return None

        title = (raw.get("title") or "").strip()
        # Esummary 'authors' is a list of dicts with a 'name' key.
        authors_raw = raw.get("authors") or []
        authors = [
            a.get("name", "") for a in authors_raw if isinstance(a, dict)
        ]
        # Pub types
        pub_types_raw = raw.get("pubtype") or []
        if isinstance(pub_types_raw, str):
            pub_types_raw = [pub_types_raw]
        pub_types = [str(pt).strip() for pt in pub_types_raw if pt]

        # Journal / source
        journal = raw.get("fulljournalname") or raw.get("source") or ""
        issn = raw.get("issn") or raw.get("essn") or ""
        # Article identifiers
        article_ids = raw.get("articleids") or []
        doi = ""
        for art_id in article_ids:
            if isinstance(art_id, dict) and art_id.get("idtype") == "doi":
                doi = art_id.get("value", "")
                break
        # Dates
        pub_date = raw.get("pubdate") or raw.get("epubdate") or ""

        return {
            "pmid": str(pmid),
            "title": title,
            "authors": authors,
            "journal": journal,
            "issn": issn,
            "publication_types": pub_types,
            "doi": doi,
            "pub_date": pub_date,
            "abstract": raw.get("abstract", ""),
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
        """A record is valid when it has a non-empty PMID, title, and journal."""
        return (
            bool(record.get("pmid"))
            and bool(record.get("title"))
            and bool(record.get("journal"))
        )

    @staticmethod
    def _evidence_level_for(record: Dict[str, Any]) -> EvidenceLevel:
        pub_types = record.get("publication_types") or []
        for pt in pub_types:
            for needle, level in PUBTYPE_EVIDENCE_MAP:
                if needle.lower() in pt.lower():
                    return level
        return EvidenceLevel.ANECDOTAL

    # -- provenance & governance ---------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        evidence = self._evidence_level_for(record)
        is_research_only = evidence in (
            EvidenceLevel.ANECDOTAL,
            EvidenceLevel.CASE_SERIES,
            EvidenceLevel.PRECLINICAL,
        )
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=str(record.get("pmid", "unknown")),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="NLM Open Access (Public Domain U.S. Gov work)",
            confidence_tier=self.get_confidence(record),
            evidence_level=evidence,
            citation_doi=record.get("doi") or None,
            attribution_text=(
                "Citations derived from PubMed/MEDLINE, courtesy of the "
                "U.S. National Library of Medicine."
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
            score += 0.25
        if record.get("authors"):
            score += 0.15
        if record.get("journal"):
            score += 0.20
        if record.get("doi"):
            score += 0.15
        if record.get("publication_types"):
            score += 0.10
        if record.get("abstract"):
            score += 0.15
        return round(min(score, 1.0), 4)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="NLM Open Access (Public Domain — U.S. Gov work)",
            license_url="https://www.nlm.nih.gov/databases/download/terms_and_conditions.html",
            attribution_text=(
                "Citations derived from PubMed/MEDLINE, courtesy of the "
                "U.S. National Library of Medicine."
            ),
            commercial_use_allowed=True,
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            requires_share_alike=False,
            share_alike=False,
            modification_allowed=True,
            redistribution_allowed=True,
            restrictions=[
                "Bulk-download of MEDLINE requires a separate NLM license.",
                "Respect NCBI rate limits (3 req/s without API key, 10 req/s with).",
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
                "einfo.fcgi", {"db": DB_NAME, "retmode": "json"}
            )
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": self._base_url,
                "rate_limit_per_second": (
                    REQUESTS_PER_SECOND_WITH_KEY
                    if self._api_key
                    else REQUESTS_PER_SECOND_NO_KEY
                ),
            }
        except PubMedError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
