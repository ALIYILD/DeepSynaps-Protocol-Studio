"""
ClinicalTrials.gov v2 Adapter.

Provides normalised access to registered clinical trials at ClinicalTrials.gov
via the v2 REST API. Emits records that conform to the Knowledge Layer
canonical schema (subclass of the production ``DatabaseAdapter`` ABC).

API docs:    https://clinicaltrials.gov/data-api/api
v2 base URL: https://clinicaltrials.gov/api/v2

Implementation notes
--------------------
* Uses ``httpx`` (matches the codebase-wide HTTP client). Same rationale as
  the PubMed adapter.
* Reference research source (preserved, not imported):
  ``apps/api/app/knowledge/clinicaltrials_adapter.py``.
* Briefing: ``docs/knowledge/BATCH3_EVIDENCE_INTEGRATION_REPORT.md`` § 3.
* Roadmap row: ``docs/engineering/knowledge-adapter-roadmap.md`` Batch 1 #2.
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

BASE_URL = "https://clinicaltrials.gov/api/v2"
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5
REQUESTS_PER_SECOND = 2  # CT.gov has no documented hard limit; stay polite.
MAX_RESULTS_HARD_CAP = 200
PAGE_SIZE = 50  # CT.gov v2 default is 10; 50 is still well within limits.

# Map CT.gov phase + status → CEBM EvidenceLevel.
# Phase 3/4 trials are treated as RCT-tier; earlier phases as case-series.
_RCT_PHASES = {"PHASE3", "PHASE4"}
_CASE_PHASES = {"PHASE1", "PHASE2", "EARLY_PHASE1"}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ClinicalTrialsError(Exception):
    """Base exception for ClinicalTrials.gov adapter errors."""


class ClinicalTrialsNotFoundError(ClinicalTrialsError):
    """Raised when a queried NCT ID or term has no results."""


class ClinicalTrialsAPIError(ClinicalTrialsError):
    """Raised on unexpected HTTP status or malformed response."""


class ClinicalTrialsRateLimitError(ClinicalTrialsError):
    """Raised when CT.gov returns 429 or when the adapter is self-throttling."""


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class ClinicalTrialsAdapter(DatabaseAdapter):
    """Async adapter for the ClinicalTrials.gov v2 REST API.

    Configuration keys (all optional):

    * ``base_url``    — override the default v2 base URL.
    * ``timeout``     — total request timeout in seconds (default 30).
    * ``max_retries`` — retries on transient errors (default 3).
    * ``cache_ttl``   — in-memory cache TTL in seconds (default 3600).
    * ``page_size``   — results per page (default 50, hard cap MAX_RESULTS_HARD_CAP).
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
            int(self.config.get("page_size", PAGE_SIZE)), MAX_RESULTS_HARD_CAP
        )
        self._client: Optional[httpx.AsyncClient] = None

        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._min_interval: float = 1.0 / REQUESTS_PER_SECOND
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "ClinicalTrials.gov"

    @property
    def source_version(self) -> str:
        # CT.gov is a rolling daily release; report the current UTC date so
        # provenance records pin the data to the day it was retrieved.
        return f"v2-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"

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
        """GET against CT.gov v2 with retry, rate-limit and cache."""
        params = params or {}
        cache_key = self._cache_key(endpoint, params)

        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._client is None:
            raise ClinicalTrialsError(
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
                        raise ClinicalTrialsNotFoundError(
                            f"ClinicalTrials.gov resource not found: {url}"
                        )
                    if resp.status_code == 429:
                        raise ClinicalTrialsRateLimitError(
                            "Rate limited by ClinicalTrials.gov"
                        )
                    if 500 <= resp.status_code < 600:
                        last_exception = httpx.HTTPStatusError(
                            f"{resp.status_code} server error",
                            request=resp.request,
                            response=resp,
                        )
                        wait = RETRY_BACKOFF * attempt
                        logger.warning(
                            "CT.gov transient %s on attempt %d/%d — retrying in %.1fs",
                            resp.status_code,
                            attempt,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    if resp.status_code >= 400:
                        raise ClinicalTrialsAPIError(
                            f"ClinicalTrials.gov API error {resp.status_code}: "
                            f"{resp.text[:200]}"
                        )
                    data = resp.json()
                    self._cache[cache_key] = data
                    return data
            except (httpx.RequestError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "CT.gov network error on attempt %d/%d — retrying in %.1fs (%s)",
                    attempt,
                    self._max_retries,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)

        raise ClinicalTrialsAPIError(
            f"ClinicalTrials.gov request failed after {self._max_retries} attempts"
        ) from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise httpx client and verify CT.gov v2 is reachable."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-ClinicalTrialsAdapter/1.0",
                },
            )
        try:
            # /stats is a lightweight metadata endpoint that responds quickly.
            await self._request("stats/size", {"format": "json"})
            self._connected = True
            logger.info("ClinicalTrialsAdapter connected — %s", self._base_url)
            return True
        except ClinicalTrialsError as exc:
            logger.warning("ClinicalTrialsAdapter connect failed: %s", exc)
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._cache.clear()
        self._connected = False
        logger.info("ClinicalTrialsAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Any) -> List[Dict[str, Any]]:
        """Execute a ClinicalTrials.gov query.

        Query forms:

        * ``str`` — free-text search term using ``query.term`` parameter.
        * ``dict`` keys (all optional, at least one query input required):
            - ``term``       : free-text query (mapped to query.term)
            - ``condition``  : condition name (mapped to query.cond)
            - ``intervention``: intervention name (mapped to query.intr)
            - ``location``   : location filter (mapped to query.locn)
            - ``status``     : str or list — overallStatus filter values
                               (e.g. ["RECRUITING", "COMPLETED"])
            - ``nct_id``     : single NCT ID for direct lookup
            - ``max_results``: int, hard-capped at MAX_RESULTS_HARD_CAP
        """
        if not self._connected:
            await self.connect()

        if isinstance(query, str):
            query = {"term": query}
        if not isinstance(query, dict):
            raise ClinicalTrialsError("Query must be a string or a dict.")

        # Single-trial direct lookup
        if "nct_id" in query and query["nct_id"]:
            return await self._fetch_single(str(query["nct_id"]))

        # Build search params
        return await self._fetch_search(query)

    async def _fetch_single(self, nct_id: str) -> List[Dict[str, Any]]:
        data = await self._request(f"studies/{nct_id}")
        # Single-study response is the protocolSection directly.
        return [data]

    async def _fetch_search(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not any(
            query.get(k) for k in ("term", "condition", "intervention", "location")
        ):
            raise ClinicalTrialsError(
                "Search query requires one of: term, condition, intervention, "
                "location, nct_id."
            )

        max_results = min(
            int(query.get("max_results", self._page_size)), MAX_RESULTS_HARD_CAP
        )
        params: Dict[str, Any] = {
            "pageSize": min(max_results, self._page_size),
            "format": "json",
            "countTotal": "true",
        }
        if query.get("term"):
            params["query.term"] = query["term"]
        if query.get("condition"):
            params["query.cond"] = query["condition"]
        if query.get("intervention"):
            params["query.intr"] = query["intervention"]
        if query.get("location"):
            params["query.locn"] = query["location"]
        statuses = query.get("status")
        if statuses:
            if isinstance(statuses, str):
                statuses = [statuses]
            params["filter.overallStatus"] = "|".join(statuses)

        collected: List[Dict[str, Any]] = []
        next_token: Optional[str] = None
        # Paginate until we have max_results or run out of pages.
        while len(collected) < max_results:
            if next_token:
                params["pageToken"] = next_token
            data = await self._request("studies", params)
            studies = data.get("studies", []) or []
            collected.extend(studies)
            next_token = data.get("nextPageToken")
            if not next_token or not studies:
                break
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
        # Studies are wrapped in protocolSection; single-trial response IS the wrapper.
        proto = raw.get("protocolSection") or raw
        ident = proto.get("identificationModule") or {}
        status_mod = proto.get("statusModule") or {}
        design_mod = proto.get("designModule") or {}
        cond_mod = proto.get("conditionsModule") or {}
        arms_mod = proto.get("armsInterventionsModule") or {}
        sponsor_mod = proto.get("sponsorCollaboratorsModule") or {}
        contacts_mod = proto.get("contactsLocationsModule") or {}

        nct_id = ident.get("nctId")
        if not nct_id:
            return None

        phases = design_mod.get("phases") or []
        if isinstance(phases, str):
            phases = [phases]

        interventions = []
        for itv in arms_mod.get("interventions") or []:
            name = itv.get("name") if isinstance(itv, dict) else None
            if name:
                interventions.append({"name": name, "type": itv.get("type", "")})

        locations = []
        for loc in contacts_mod.get("locations") or []:
            if isinstance(loc, dict):
                locations.append(
                    {
                        "facility": loc.get("facility", ""),
                        "city": loc.get("city", ""),
                        "country": loc.get("country", ""),
                    }
                )

        enrollment_info = design_mod.get("enrollmentInfo") or {}
        lead_sponsor = sponsor_mod.get("leadSponsor") or {}

        return {
            "nct_id": nct_id,
            "title": ident.get("briefTitle", ""),
            "official_title": ident.get("officialTitle", ""),
            "overall_status": status_mod.get("overallStatus", ""),
            "phases": [str(p) for p in phases if p],
            "conditions": list(cond_mod.get("conditions") or []),
            "interventions": interventions,
            "enrollment_count": enrollment_info.get("count"),
            "enrollment_type": enrollment_info.get("type", ""),
            "start_date": (status_mod.get("startDateStruct") or {}).get("date", ""),
            "completion_date": (status_mod.get("completionDateStruct") or {}).get(
                "date", ""
            ),
            "lead_sponsor": lead_sponsor.get("name", ""),
            "locations": locations,
            "has_results": bool(raw.get("hasResults", False)),
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
        """A record is valid when it has an NCT ID and a title."""
        return bool(record.get("nct_id")) and bool(record.get("title"))

    @staticmethod
    def _evidence_level_for(record: Dict[str, Any]) -> EvidenceLevel:
        phases = set(record.get("phases") or [])
        if phases & _RCT_PHASES:
            return EvidenceLevel.RCT
        if phases & _CASE_PHASES:
            return EvidenceLevel.CASE_SERIES
        return EvidenceLevel.CASE_SERIES

    # -- provenance & governance ---------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        evidence = self._evidence_level_for(record)
        # Trials without published results are research-only by safety convention,
        # regardless of phase: design alone doesn't constitute proven outcome data.
        research_only = not bool(record.get("has_results"))
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=str(record.get("nct_id", "unknown")),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="Public Domain (U.S. Gov work)",
            confidence_tier=self.get_confidence(record),
            evidence_level=evidence,
            citation_doi=None,  # CT.gov records are not DOI-keyed.
            attribution_text=(
                "Trial record courtesy of ClinicalTrials.gov, "
                "U.S. National Library of Medicine."
            ),
            research_only=research_only,
            retrieval_method="direct",
            data_quality_score=self._data_quality_score(record),
        )

    @staticmethod
    def _data_quality_score(record: Dict[str, Any]) -> float:
        """Composite 0.0–1.0 score based on field completeness."""
        score = 0.0
        if record.get("title"):
            score += 0.20
        if record.get("phases"):
            score += 0.15
        if record.get("overall_status"):
            score += 0.10
        if record.get("conditions"):
            score += 0.10
        if record.get("interventions"):
            score += 0.15
        if record.get("enrollment_count"):
            score += 0.10
        if record.get("has_results"):
            score += 0.15
        if record.get("lead_sponsor"):
            score += 0.05
        return round(min(score, 1.0), 4)

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain (U.S. Gov work)",
            license_url=(
                "https://clinicaltrials.gov/about-site/terms-conditions"
            ),
            attribution_text=(
                "Trial record courtesy of ClinicalTrials.gov, "
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
                "Trial data without published results is research-only — "
                "do not represent design as outcome evidence.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        evidence = self._evidence_level_for(record)
        has_results = bool(record.get("has_results"))
        status = (record.get("overall_status") or "").upper()
        # Completed phase 3/4 with results = HIGH; ongoing phase 3/4 = MEDIUM;
        # earlier phases = LOW; otherwise RESEARCH (informational only).
        if evidence == EvidenceLevel.RCT and has_results and status == "COMPLETED":
            return ConfidenceTier.HIGH
        if evidence == EvidenceLevel.RCT:
            return ConfidenceTier.MEDIUM
        if evidence == EvidenceLevel.CASE_SERIES:
            return ConfidenceTier.LOW
        return ConfidenceTier.RESEARCH

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
            await self._request("stats/size", {"format": "json"})
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "ok",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "base_url": self._base_url,
                "rate_limit_per_second": REQUESTS_PER_SECOND,
            }
        except ClinicalTrialsError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {
                "status": "down",
                "latency_ms": round(latency, 2),
                "source": self.source_name,
                "error": str(exc),
            }
