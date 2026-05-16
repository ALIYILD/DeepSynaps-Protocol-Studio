"""
LOINC Adapter — Logical Observation Identifiers Names and Codes.

Provides normalised access to LOINC codes, long common names, component
classifications (component, property, time, system, scale, method), related
names, and class types.  Uses the LOINC FHIR terminology server or the
SearchLOINC web service.

Licensing: LOINC content is copyright Regenstrief Institute.  Free for
research; commercial use requires a LOINC license.

API docs: https://loinc.org/fhir/
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

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

FHIR_BASE = "https://fhir.loinc.org"
SEARCH_BASE = "https://search.loinc.org"
DEFAULT_TIMEOUT = ClientTimeout(total=30, connect=10)
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5
REQUESTS_PER_SECOND = 10

# Normalised field schema
NORMALIZED_SCHEMA: Dict[str, type] = {
    "loinc_code": str,
    "long_common_name": str,
    "component": str,
    "property": str,
    "time_aspect": str,
    "system": str,
    "scale_type": str,
    "method_type": str,
    "related_names": list,
    "class_type": str,
    "short_name": str,
    "status": str,
}

# LOINC 6-axis property names (FHIR Property keys)
SIX_AXIS_KEYS: Dict[str, str] = {
    "COMPONENT": "component",
    "PROPERTY": "property",
    "TIME": "time_aspect",
    "SYSTEM": "system",
    "SCALE": "scale_type",
    "METHOD": "method_type",
}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class LOINCError(Exception):
    """Base exception for LOINC adapter errors."""

    pass


class LOINCAuthError(LOINCError):
    """Raised when LOINC credentials are missing or rejected."""

    pass


class LOINCNotFoundError(LOINCError):
    """Raised when a LOINC code does not exist."""

    pass


class LOINCAPIError(LOINCError):
    """Raised on unexpected HTTP status or malformed response."""

    pass


class LOINCRateLimitError(LOINCError):
    """Raised when the LOINC server returns HTTP 429."""

    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class LOINCAdapter(DatabaseAdapter):
    """Async adapter for the LOINC FHIR terminology service.

    Configuration keys (all optional):
        * ``username`` / ``password`` — LOINC credentials for FHIR server.
        * ``base_url`` — override FHIR endpoint (default https://fhir.loinc.org).
        * ``timeout`` — request timeout in seconds (default 30).
        * ``max_retries`` — retry attempts (default 3).
        * ``cache_ttl`` — in-memory cache TTL in seconds (default 86400).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._username: Optional[str] = self.config.get("username")
        self._password: Optional[str] = self.config.get("password")
        self._base_url: str = self.config.get("base_url", FHIR_BASE).rstrip("/")
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
        return "LOINC"

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
        """Execute an authenticated GET request with retries and caching."""
        params = params or {}
        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._session is None:
            raise LOINCError("HTTP session not initialised — call connect() first.")

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
                if exc.status == 401:
                    raise LOINCAuthError("LOINC authentication failed — check username/password") from exc
                if exc.status == 404:
                    raise LOINCNotFoundError(f"LOINC resource not found: {url}") from exc
                if exc.status == 429:
                    raise LOINCRateLimitError("LOINC API rate limit exceeded") from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning("LOINC transient error %s on attempt %d/%d — retrying in %.1fs", exc.status, attempt, self._max_retries, wait)
                    await asyncio.sleep(wait)
                    continue
                raise LOINCAPIError(f"LOINC API error {exc.status}: {exc.message}") from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning("LOINC network error on attempt %d/%d — retrying in %.1fs", attempt, self._max_retries, wait)
                await asyncio.sleep(wait)

        raise LOINCAPIError(f"LOINC request failed after {self._max_retries} attempts") from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise session with Basic Auth and verify reachability."""
        if self._session is None or self._session.closed:
            auth = None
            if self._username and self._password:
                auth = aiohttp.BasicAuth(self._username, self._password)
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                auth=auth,
                headers={
                    "Accept": "application/fhir+json",
                    "User-Agent": "DeepSynaps-LOINCAdapter/1.0",
                },
            )
        try:
            # Lightweight ping — LOINC top-level CodeSystem
            await self._request("/CodeSystem/loinc")
            self._connected = True
            logger.info("LOINCAdapter connected — %s", self._base_url)
            return True
        except LOINCAuthError:
            self._connected = False
            logger.error("LOINCAdapter connection failed — authentication error")
            return False
        except LOINCError:
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Close session and flush cache."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._connected = False
        logger.info("LOINCAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a query against the LOINC FHIR server.

        Supported keys:
            * ``code`` — exact LOINC code (e.g. '718-7').
            * ``name`` — partial match on long common name.
            * ``component`` — component axis search.
            * ``class`` — LOINC class type filter.
            * ``limit`` — max results (default 50, max 100).
        """
        if not self._connected:
            await self.connect()

        records: List[Dict[str, Any]] = []

        # Direct code lookup
        if "code" in query:
            try:
                data = await self._request(f"/CodeSystem/loinc/lookup", {"system": "http://loinc.org", "code": query["code"]})
                data["_query_type"] = "lookup"
                data["_query_code"] = query["code"]
                records.append(data)
            except LOINCNotFoundError:
                return []
            return records

        # Search via CodeSystem $lookup or ConceptMap search
        search_params: Dict[str, Any] = {"_count": min(query.get("limit", 50), 100)}
        if "name" in query:
            search_params["display:contains"] = query["name"]
        if "component" in query:
            search_params["property:code"] = query["component"]
        if "class" in query:
            search_params["class"] = query["class"]

        # Use ValueSet $expand for search
        try:
            data = await self._request("/ValueSet/loinc-compose-vs/$expand", search_params)
            expansion = data.get("expansion", {})
            for contains in expansion.get("contains", []):
                contains["_query_type"] = "expand"
                records.append(contains)
        except LOINCError:
            # Fallback: use CodeSystem search
            try:
                data = await self._request("/CodeSystem/loinc", search_params)
                for concept in data.get("concept", []):
                    concept["_query_type"] = "concept"
                    records.append(concept)
            except LOINCError:
                pass

        return records

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform LOINC FHIR responses into the standard internal schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = await self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    async def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        query_type = raw.get("_query_type", "")

        if query_type == "lookup":
            return self._normalize_lookup(raw)
        if query_type == "expand":
            return self._normalize_expand(raw)
        if query_type == "concept":
            return self._normalize_concept(raw)

        return None

    def _normalize_lookup(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise a $lookup response."""
        code = raw.get("_query_code", "")
        display = raw.get("display", "")
        properties: Dict[str, str] = {}
        for prop in raw.get("parameter", []):
            if prop.get("name") == "property":
                parts = prop.get("part", [])
                prop_name = ""
                prop_value = ""
                for part in parts:
                    if part.get("name") == "code":
                        prop_name = part.get("valueString", "")
                    elif part.get("name") == "value":
                        prop_value = part.get("valueString", "")
                if prop_name:
                    properties[prop_name] = prop_value

        return {
            "loinc_code": code,
            "long_common_name": display,
            "component": properties.get("COMPONENT", ""),
            "property": properties.get("PROPERTY", ""),
            "time_aspect": properties.get("TIME", ""),
            "system": properties.get("SYSTEM", ""),
            "scale_type": properties.get("SCALE", ""),
            "method_type": properties.get("METHOD", ""),
            "related_names": self._extract_related_names(raw),
            "class_type": properties.get("CLASS", ""),
            "short_name": properties.get("SHORTNAME", properties.get("SHORT_NAME", "")),
            "status": properties.get("STATUS", "active"),
            "_query_type": "lookup",
        }

    def _normalize_expand(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise a ValueSet $expand contains entry."""
        code = raw.get("code", "")
        display = raw.get("display", "")
        properties: Dict[str, str] = {}
        for prop in raw.get("property", []):
            prop_code = prop.get("code", "")
            value = prop.get("valueString", "") or str(prop.get("valueCode", ""))
            if prop_code:
                properties[prop_code] = value

        return {
            "loinc_code": code,
            "long_common_name": display,
            "component": properties.get("COMPONENT", ""),
            "property": properties.get("PROPERTY", ""),
            "time_aspect": properties.get("TIME", ""),
            "system": properties.get("SYSTEM", ""),
            "scale_type": properties.get("SCALE", ""),
            "method_type": properties.get("METHOD", ""),
            "related_names": self._extract_related_names(raw),
            "class_type": properties.get("CLASS", ""),
            "short_name": properties.get("SHORTNAME", ""),
            "status": properties.get("STATUS", "active"),
            "_query_type": "expand",
        }

    def _normalize_concept(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise a CodeSystem concept entry."""
        code = raw.get("code", "")
        display = raw.get("display", "")
        properties: Dict[str, str] = {}
        for prop in raw.get("property", []):
            prop_code = prop.get("code", "")
            value = prop.get("valueString", "") or str(prop.get("valueCode", ""))
            if prop_code:
                properties[prop_code] = value

        return {
            "loinc_code": code,
            "long_common_name": display,
            "component": properties.get("COMPONENT", ""),
            "property": properties.get("PROPERTY", ""),
            "time_aspect": properties.get("TIME", ""),
            "system": properties.get("SYSTEM", ""),
            "scale_type": properties.get("SCALE", ""),
            "method_type": properties.get("METHOD", ""),
            "related_names": self._extract_related_names(raw),
            "class_type": properties.get("CLASS", ""),
            "short_name": properties.get("SHORTNAME", ""),
            "status": properties.get("STATUS", "active"),
            "_query_type": "concept",
        }

    def _extract_related_names(self, raw: Dict[str, Any]) -> List[str]:
        """Extract related names / synonyms from the raw record."""
        related: List[str] = []
        for prop in raw.get("property", []):
            if prop.get("code") in ("RELATEDNAMES2", "RELATED_NAMES", "Synonym"):
                val = prop.get("valueString", "")
                if val:
                    related.append(val)
        # Also check $lookup parameter format
        for param in raw.get("parameter", []):
            if param.get("name") == "designation":
                parts = param.get("part", [])
                for part in parts:
                    if part.get("name") == "value":
                        val = part.get("valueString", "")
                        if val:
                            related.append(val)
        return related

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
        """Valid when it has a non-empty LOINC code and name."""
        return bool(record.get("loinc_code")) and bool(record.get("long_common_name"))

    def _is_research_only(self, record: Dict[str, Any]) -> bool:
        """Flag deprecated or trial-use LOINC codes as research-only."""
        status = record.get("status", "").lower()
        return status in ("deprecated", "trial-use", "discouraged")

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=record.get("loinc_code", "unknown"),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="LOINC License",
            license_url="https://loinc.org/license/",
            attribution_text="This material contains content from LOINC (http://loinc.org). LOINC is copyright © 1995-2024, Regenstrief Institute, Inc.",
            confidence_tier=self.get_confidence(record),
            evidence_level=EvidenceLevel.OBSERVATIONAL,
            research_only=self._is_research_only(record),
            research_only_reason=f"LOINC status: {record.get('status', 'unknown')}" if self._is_research_only(record) else None,
            cache_ttl_seconds=self._cache_ttl,
        )

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="LOINC License (Regenstrief Institute)",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=False,
            redistribution_allowed=False,
            modification_allowed=False,
            attribution_text="This material contains content from LOINC (http://loinc.org). LOINC is copyright © 1995-2024, Regenstrief Institute, Inc.",
            restrictions=[
                "Commercial use requires a LOINC license from Regenstrief Institute.",
                "Redistribution of LOINC content is not permitted without a license.",
                "Attribution must include the LOINC copyright notice.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Score confidence based on code status and completeness of 6-axis data."""
        status = record.get("status", "").lower()
        if status == "deprecated":
            return ConfidenceTier.RESEARCH
        if status == "trial-use":
            return ConfidenceTier.LOW

        # Count populated 6-axis fields
        six_axis = [record.get("component"), record.get("property"), record.get("time_aspect"), record.get("system"), record.get("scale_type"), record.get("method_type")]
        populated = sum(1 for axis in six_axis if axis)
        if populated >= 5:
            return ConfidenceTier.HIGH
        if populated >= 3:
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.LOW

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify LOINC FHIR server reachability and report latency."""
        if not self._session or self._session.closed:
            return {"status": "down", "latency_ms": None, "source": self.source_name, "error": "Session closed"}

        start = asyncio.get_event_loop().time()
        try:
            await self._request("/CodeSystem/loinc")
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "ok", "latency_ms": round(latency, 2), "source": self.source_name, "base_url": self._base_url}
        except LOINCError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "down", "latency_ms": round(latency, 2), "source": self.source_name, "error": str(exc)}
