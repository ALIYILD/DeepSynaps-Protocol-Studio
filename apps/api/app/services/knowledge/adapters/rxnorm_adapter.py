"""
RxNorm / RxNav Adapter — U.S. National Library of Medicine.

Provides normalised access to RxNorm clinical drug names, RxCUIs, ingredients,
dose forms, strengths, ATC classifications, and NDC mappings.  The RxNorm API
is public-domain and requires no authentication.

API docs: https://rxnav.nlm.nih.gov/RxNormAPIs.html#uLink=RxNorm_REST_findRxcuiByString
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import aiohttp
from aiohttp import ClientTimeout, ClientResponseError

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

BASE_URL = "https://rxnav.nlm.nih.gov/REST"
DEFAULT_TIMEOUT = ClientTimeout(total=30, connect=10)
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5  # seconds, multiplied by attempt number
REQUESTS_PER_SECOND = 20  # RxNav has no hard limit but we are polite

# Normalised field schema
NORMALIZED_SCHEMA: Dict[str, type] = {
    "rxcui": str,
    "name": str,
    "ingredient": list,
    "brand_names": list,
    "dose_forms": list,
    "strengths": list,
    "atc_codes": list,
    "ndcs": list,
    "synonyms": list,
    "tty": str,
}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class RxNormError(Exception):
    """Base exception for RxNorm adapter errors."""

    pass


class RxNormNotFoundError(RxNormError):
    """Raised when a queried concept does not exist in RxNorm."""

    pass


class RxNormAPIError(RxNormError):
    """Raised on unexpected HTTP status or malformed JSON from RxNav."""

    pass


class RxNormRateLimitError(RxNormError):
    """Raised when the adapter is rate-limiting itself."""

    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class RxNormAdapter(DatabaseAdapter):
    """Async adapter for the NLM RxNorm / RxNav REST API.

    Configuration keys (all optional):
        * ``base_url`` — override the default RxNav endpoint.
        * ``timeout`` — request timeout in seconds (default 30).
        * ``max_retries`` — retry attempts on transient errors (default 3).
        * ``cache_ttl`` — in-memory cache TTL in seconds (default 86400).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._base_url: str = self.config.get("base_url", BASE_URL).rstrip("/")
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", 30), connect=10
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._cache_ttl: int = self.config.get("cache_ttl", 86_400)
        self._session: Optional[aiohttp.ClientSession] = None
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(REQUESTS_PER_SECOND)
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "RxNorm"

    @property
    def source_version(self) -> str:
        return self._version

    # -- cache key generation -------------------------------------------------

    def _cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        """Generate a deterministic SHA-256 cache key."""
        payload = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    # -- HTTP helpers ---------------------------------------------------------

    async def _enforce_rate_limit(self) -> None:
        """Enforce a polite per-second request cap."""
        now = asyncio.get_event_loop().time()
        min_interval = 1.0 / REQUESTS_PER_SECOND
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Execute a GET request with retries, rate-limiting, and caching."""
        params = params or {}
        cache_key = self._cache_key(endpoint, params)

        # In-memory cache hit
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._session is None:
            raise RxNormError("HTTP session not initialised — call connect() first.")

        url = f"{self._base_url}{endpoint}"
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                async with self._semaphore:
                    await self._enforce_rate_limit()
                    async with self._session.get(url, params=params, raise_for_status=True) as resp:
                        data = await resp.json()
                        self._cache[cache_key] = data
                        return data
            except ClientResponseError as exc:
                if exc.status == 404:
                    raise RxNormNotFoundError(f"RxNorm resource not found: {url}") from exc
                if exc.status == 429:
                    raise RxNormRateLimitError("Rate limited by RxNav API") from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning("RxNorm transient error %s on attempt %d/%d — retrying in %.1fs", exc.status, attempt, self._max_retries, wait)
                    await asyncio.sleep(wait)
                    continue
                raise RxNormAPIError(f"RxNorm API error {exc.status}: {exc.message}") from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning("RxNorm network error on attempt %d/%d — retrying in %.1fs", attempt, self._max_retries, wait)
                await asyncio.sleep(wait)

        raise RxNormAPIError(f"RxNorm request failed after {self._max_retries} attempts") from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise aiohttp session and verify API reachability."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={"Accept": "application/json", "User-Agent": "DeepSynaps-RxNormAdapter/1.0"},
            )
        try:
            # Lightweight health ping via version endpoint
            await self._request("/version")
            self._connected = True
            logger.info("RxNormAdapter connected — %s", self._base_url)
            return True
        except RxNormError:
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Close aiohttp session and flush cache."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._connected = False
        logger.info("RxNormAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a query against RxNav.

        Supported query keys:
            * ``name`` — drug name for fuzzy / exact search (findRxcuiByString).
            * ``rxcui`` — exact RxCUI for related-info lookup.
            * ``ndc`` — NDC code to resolve to RxCUI.
            * ``search_type`` — ``exact`` (default) or ``approximate``.
        """
        if not self._connected:
            await self.connect()

        records: List[Dict[str, Any]] = []
        search_type = query.get("search_type", "exact")

        if "name" in query:
            if search_type == "approximate":
                records = await self._fetch_approximate(query["name"])
            else:
                records = await self._fetch_by_name(query["name"])
        elif "rxcui" in query:
            records = await self._fetch_by_rxcui(query["rxcui"])
        elif "ndc" in query:
            records = await self._fetch_by_ndc(query["ndc"])
        else:
            raise RxNormError("Query must contain 'name', 'rxcui', or 'ndc' key.")

        return records

    async def _fetch_by_name(self, name: str) -> List[Dict[str, Any]]:
        """findRxcuiByString → getAllRelatedInfo pipeline."""
        data = await self._request("/rxcui.json", {"name": name, "search": 1})
        id_group = data.get("idGroup", {})
        rxcuis = id_group.get("rxnormId", [])
        if not rxcuis:
            return []
        results = []
        for rxcui in rxcuis[:10]:  # cap to avoid overload
            related = await self._request(f"/rxcui/{rxcui}/allrelated.json")
            results.append({"rxcui": rxcui, "allRelatedInformation": related, "match_type": "exact"})
        return results

    async def _fetch_approximate(self, name: str) -> List[Dict[str, Any]]:
        """approximateMatch endpoint."""
        data = await self._request("/approximateTerm.json", {"term": name, "maxEntries": 10})
        candidates = data.get("approximateGroup", {}).get("candidate", [])
        results = []
        for cand in candidates[:10]:
            rxcui = cand.get("rxcui")
            if not rxcui:
                continue
            related = await self._request(f"/rxcui/{rxcui}/allrelated.json")
            results.append({"rxcui": rxcui, "allRelatedInformation": related, "match_type": "approximate", "score": cand.get("score")})
        return results

    async def _fetch_by_rxcui(self, rxcui: str) -> List[Dict[str, Any]]:
        """Direct RxCUI lookup with full related info and NDCs."""
        related = await self._request(f"/rxcui/{rxcui}/allrelated.json")
        ndcs_data = await self._request(f"/rxcui/{rxcui}/ndcs.json")
        return [{"rxcui": rxcui, "allRelatedInformation": related, "ndcs_data": ndcs_data, "match_type": "direct"}]

    async def _fetch_by_ndc(self, ndc: str) -> List[Dict[str, Any]]:
        """getRxcuiById (NDC → RxCUI)."""
        data = await self._request("/rxcui.json", {"idtype": "NDC", "id": ndc})
        id_group = data.get("idGroup", {})
        rxcuis = id_group.get("rxnormId", [])
        if not rxcuis:
            return []
        return await self._fetch_by_rxcui(rxcuis[0])

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform RxNav raw responses into the standard RxNorm schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = await self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    async def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rxcui = raw.get("rxcui")
        if not rxcui:
            return None

        related = raw.get("allRelatedInformation", {})
        concept_group = related.get("allRelatedGroup", {}).get("conceptGroup", [])

        ingredients: List[str] = []
        brand_names: List[str] = []
        dose_forms: List[str] = []
        strengths: List[str] = []
        synonyms: List[str] = []
        tty = ""

        for group in concept_group:
            tty_val = group.get("tty", "")
            concepts = group.get("conceptProperties", [])
            for concept in concepts:
                name = concept.get("name", "")
                if not tty:
                    tty = concept.get("tty", "")
                if tty_val in ("IN", "MIN") and name:
                    ingredients.append(name)
                elif tty_val == "BN" and name:
                    brand_names.append(name)
                elif tty_val == "DF" and name:
                    dose_forms.append(name)
                elif tty_val in ("SCD", "SBD") and name:
                    strengths.append(name)
                elif name:
                    synonyms.append(name)

        # De-duplicate synonyms
        seen = set(ingredients + brand_names + dose_forms + strengths)
        synonyms = [s for s in synonyms if s not in seen]

        # NDCs
        ndcs: List[str] = []
        ndcs_data = raw.get("ndcs_data", {})
        ndc_list = ndcs_data.get("ndcGroup", {}).get("ndcList", {}).get("ndc", [])
        if isinstance(ndc_list, str):
            ndc_list = [ndc_list]
        ndcs = ndc_list

        # ATC codes — derive from class lookup
        atc_codes = await self._lookup_atc(rxcui)

        # Build primary name from RxCUI properties
        properties = await self._request(f"/rxcui/{rxcui}/properties.json")
        name = properties.get("properties", {}).get("name", "Unknown")

        return {
            "rxcui": str(rxcui),
            "name": name,
            "ingredient": list(set(ingredients)),
            "brand_names": list(set(brand_names)),
            "dose_forms": list(set(dose_forms)),
            "strengths": list(set(strengths)),
            "atc_codes": atc_codes,
            "ndcs": ndcs,
            "synonyms": list(set(synonyms)),
            "tty": tty,
            "_match_type": raw.get("match_type", "exact"),
            "_score": raw.get("score"),
            "_raw": raw,
        }

    async def _lookup_atc(self, rxcui: str) -> List[str]:
        """Query RxClass for ATC codes associated with an RxCUI."""
        try:
            data = await self._request(f"/rxcui/{rxcui}/allProperties.json", {"prop": "ATC"})
            properties = data.get("propConceptGroup", {}).get("propConcept", [])
            return [p.get("propValue", "") for p in properties if p.get("propValue")]
        except RxNormError:
            return []

    # -- validate -------------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate normalised records and attach a ``_valid`` flag."""
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            record["_confidence"] = self.get_confidence(record).value
            record["_research_only"] = self._is_research_only(record)
            record["_provenance"] = self.get_provenance(record)
            validated.append(record)
        return validated

    def _is_valid(self, record: Dict[str, Any]) -> bool:
        """A record is valid when it has a non-empty RxCUI and name."""
        return bool(record.get("rxcui")) and bool(record.get("name"))

    def _is_research_only(self, record: Dict[str, Any]) -> bool:
        """Flag as research-only when the match was approximate and no ingredients were found."""
        return record.get("_match_type") == "approximate" and not record.get("ingredient")

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=record.get("rxcui", "unknown"),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="Public Domain",
            license_url="https://www.nlm.nih.gov/copyright.html",
            attribution_text="Courtesy of the U.S. National Library of Medicine (NLM).",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.OBSERVATIONAL,
            research_only=self._is_research_only(record),
            research_only_reason="Approximate match with no resolved ingredients" if self._is_research_only(record) else None,
            cache_ttl_seconds=self._cache_ttl,
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain (U.S. Government Work)",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            requires_share_alike=False,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="Courtesy of the U.S. National Library of Medicine.",
            restrictions=[],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        match_type = record.get("_match_type", "exact")
        if match_type == "exact":
            return ConfidenceTier.HIGH
        if match_type == "approximate":
            return ConfidenceTier.MEDIUM
        if match_type == "direct" and record.get("ingredient"):
            return ConfidenceTier.HIGH
        return ConfidenceTier.RESEARCH

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify API reachability and report latency."""
        if not self._session or self._session.closed:
            return {"status": "down", "latency_ms": None, "source": self.source_name, "error": "Session closed"}

        start = asyncio.get_event_loop().time()
        try:
            await self._request("/version")
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "ok", "latency_ms": round(latency, 2), "source": self.source_name, "base_url": self._base_url}
        except RxNormError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "down", "latency_ms": round(latency, 2), "source": self.source_name, "error": str(exc)}
