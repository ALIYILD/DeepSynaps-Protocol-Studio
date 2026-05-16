"""
openFDA Adapter — U.S. Food and Drug Administration open data.

Provides normalised access to drug labels (SPL), adverse event reports
(FAERS), and enforcement reports (recalls).  openFDA is a public-domain
U.S. Government resource requiring no authentication.

API docs: https://open.fda.gov/apis/
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

BASE_URL = "https://api.fda.gov"
DEFAULT_TIMEOUT = ClientTimeout(total=60, connect=15)
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0
REQUESTS_PER_SECOND = 10  # FDA limit: 240 requests / minute = 4/sec w/o key, 10 with key
MAX_RESULTS = 99  # FDA hard limit per request (1000 with API key)

# Normalised field schemas
LABEL_SCHEMA: Dict[str, type] = {
    "drug_name": str,
    "active_ingredients": list,
    "indications": list,
    "contraindications": list,
    "warnings": list,
    "adverse_reactions": list,
    "dosage": list,
    "manufacturer": str,
    "set_id": str,
    "version_date": str,
    "spl_id": str,
}

EVENT_SCHEMA: Dict[str, type] = {
    "drug": str,
    "event_term": str,
    "count": int,
    "seriousness": str,
    "report_date": str,
    "age": str,
    "sex": str,
    "country": str,
    "reporter": str,
    "outcome": str,
}

ENFORCEMENT_SCHEMA: Dict[str, type] = {
    "product_description": str,
    "reason_for_recall": str,
    "status": str,
    "recall_number": str,
    "recalling_firm": str,
    "recall_initiation_date": str,
    "classification": str,
    "distribution_pattern": str,
}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class OpenFDAError(Exception):
    """Base exception for openFDA adapter errors."""

    pass


class OpenFDANotFoundError(OpenFDAError):
    """Raised when an openFDA query returns no results."""

    pass


class OpenFDABadRequestError(OpenFDAError):
    """Raised when the query syntax is invalid or parameters are malformed."""

    pass


class OpenFDAAPIError(OpenFDAError):
    """Raised on unexpected HTTP status or malformed JSON."""

    pass


class OpenFDARateLimitError(OpenFDAError):
    """Raised when the openFDA API rate limit is exceeded."""

    pass


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class OpenFDAAdapter(DatabaseAdapter):
    """Async adapter for the openFDA REST API.

    Configuration keys (all optional):
        * ``api_key`` — FDA API key (raises per-request result limit from 99 to 1000).
        * ``base_url`` — override endpoint (default https://api.fda.gov).
        * ``timeout`` — request timeout in seconds (default 60).
        * ``max_retries`` — retry attempts (default 3).
        * ``cache_ttl`` — in-memory cache TTL in seconds (default 86400).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config)
        self._api_key: Optional[str] = self.config.get("api_key")
        self._base_url: str = self.config.get("base_url", BASE_URL).rstrip("/")
        self._timeout: ClientTimeout = ClientTimeout(
            total=self.config.get("timeout", 60), connect=15
        )
        self._max_retries: int = self.config.get("max_retries", MAX_RETRIES)
        self._cache_ttl: int = self.config.get("cache_ttl", 86_400)
        self._max_results: int = 1000 if self._api_key else MAX_RESULTS
        self._requests_per_second: int = 10 if self._api_key else 4
        self._session: Optional[aiohttp.ClientSession] = None
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(self._requests_per_second)
        self._last_request_time: float = 0.0

    # -- read-only properties -------------------------------------------------

    @property
    def source_name(self) -> str:
        return "openFDA"

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
        """Enforce FDA polite per-second request cap."""
        now = asyncio.get_event_loop().time()
        min_interval = 1.0 / self._requests_per_second
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Execute a GET request with retries, rate-limiting, and caching."""
        params = params or {}
        if self._api_key:
            params["api_key"] = self._api_key

        cache_key = self._cache_key(endpoint, params)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self._session is None:
            raise OpenFDAError("HTTP session not initialised — call connect() first.")

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
                if exc.status == 400:
                    body = await exc.response.text()
                    raise OpenFDABadRequestError(f"Bad request: {body}") from exc
                if exc.status == 404:
                    raise OpenFDANotFoundError(f"openFDA resource not found: {url}") from exc
                if exc.status == 429:
                    raise OpenFDARateLimitError("openFDA API rate limit exceeded") from exc
                if 500 <= exc.status < 600:
                    last_exception = exc
                    wait = RETRY_BACKOFF * attempt
                    logger.warning("openFDA transient error %s on attempt %d/%d — retrying in %.1fs", exc.status, attempt, self._max_retries, wait)
                    await asyncio.sleep(wait)
                    continue
                raise OpenFDAAPIError(f"openFDA API error {exc.status}: {exc.message}") from exc
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exception = exc
                wait = RETRY_BACKOFF * attempt
                logger.warning("openFDA network error on attempt %d/%d — retrying in %.1fs", attempt, self._max_retries, wait)
                await asyncio.sleep(wait)

        raise OpenFDAAPIError(f"openFDA request failed after {self._max_retries} attempts") from last_exception

    # -- lifecycle ------------------------------------------------------------

    async def connect(self) -> bool:
        """Initialise session and verify API reachability via status endpoint."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "DeepSynaps-OpenFDAAdapter/1.0",
                },
            )
        try:
            # Lightweight ping — one drug label
            await self._request("/drug/label.json", {"limit": 1})
            self._connected = True
            logger.info("OpenFDAAdapter connected — %s", self._base_url)
            return True
        except OpenFDAError:
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Close session and flush cache."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._cache.clear()
        self._connected = False
        logger.info("OpenFDAAdapter disconnected")

    # -- fetch ----------------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a query against openFDA.

        Supported keys:
            * ``drug`` — brand or generic drug name (labels + events + enforcement).
            * ``endpoint`` — one of ``label``, ``event``, ``enforcement`` (default: all).
            * ``limit`` — max results per sub-endpoint (default 50, max 99/1000).
            * ``search`` — raw openFDA search string (overrides ``drug``).
        """
        if not self._connected:
            await self.connect()

        records: List[Dict[str, Any]] = []
        endpoint = query.get("endpoint", "all")
        limit = min(query.get("limit", 50), self._max_results)

        # Build search string
        search = query.get("search", "")
        if not search and "drug" in query:
            drug = query["drug"].replace(" ", "+")
            search = f"openfda.brand_name:{drug}+openfda.generic_name:{drug}"

        if not search:
            raise OpenFDAError("Query must contain 'drug' or 'search' key.")

        # Fetch labels
        if endpoint in ("all", "label"):
            try:
                label_data = await self._request("/drug/label.json", {"search": search, "limit": limit})
                for result in label_data.get("results", []):
                    result["_endpoint"] = "label"
                    records.append(result)
            except (OpenFDANotFoundError, OpenFDABadRequestError):
                pass

        # Fetch events (FAERS)
        if endpoint in ("all", "event"):
            try:
                event_search = f"patient.drug.medicinalproduct:{query.get('drug', '').replace(' ', '+')}"
                event_data = await self._request("/drug/event.json", {"search": event_search, "limit": limit})
                for result in event_data.get("results", []):
                    result["_endpoint"] = "event"
                    records.append(result)
            except (OpenFDANotFoundError, OpenFDABadRequestError):
                pass

        # Fetch enforcement (recalls)
        if endpoint in ("all", "enforcement"):
            try:
                enforcement_search = f"product_description:{query.get('drug', '').replace(' ', '+')}"
                enforcement_data = await self._request("/drug/enforcement.json", {"search": enforcement_search, "limit": limit})
                for result in enforcement_data.get("results", []):
                    result["_endpoint"] = "enforcement"
                    records.append(result)
            except (OpenFDANotFoundError, OpenFDABadRequestError):
                pass

        return records

    # -- normalize ------------------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform openFDA raw records into the standard internal schema."""
        normalised: List[Dict[str, Any]] = []
        for raw in raw_records:
            norm = await self._normalize_single(raw)
            if norm:
                normalised.append(norm)
        return normalised

    async def _normalize_single(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        endpoint = raw.get("_endpoint", "")

        if endpoint == "label":
            return self._normalize_label(raw)
        if endpoint == "event":
            return self._normalize_event(raw)
        if endpoint == "enforcement":
            return self._normalize_enforcement(raw)

        return None

    def _normalize_label(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise an openFDA drug label (SPL) record."""
        openfda = raw.get("openfda", {})

        # Drug name
        brand_names = openfda.get("brand_name", [])
        generic_names = openfda.get("generic_name", [])
        drug_name = brand_names[0] if brand_names else (generic_names[0] if generic_names else "Unknown")

        # Active ingredients
        active_ingredients: List[str] = openfda.get("substance_name", [])
        if not active_ingredients:
            active_ingredients = openfda.get("active_ingredient", [])

        # Sections
        indications = self._extract_section(raw, ["indications_and_usage", "purpose"])
        contraindications = self._extract_section(raw, ["contraindications"])
        warnings = self._extract_section(raw, ["warnings", "boxed_warning", "precautions"])
        adverse_reactions = self._extract_section(raw, ["adverse_reactions", "adverse_effects"])
        dosage = self._extract_section(raw, ["dosage_and_administration", "dosage"])

        return {
            "drug_name": drug_name,
            "active_ingredients": active_ingredients,
            "indications": indications,
            "contraindications": contraindications,
            "warnings": warnings,
            "adverse_reactions": adverse_reactions,
            "dosage": dosage,
            "manufacturer": openfda.get("manufacturer_name", [""])[0],
            "set_id": raw.get("set_id", ""),
            "version_date": raw.get("effective_time", ""),
            "spl_id": openfda.get("spl_id", [""])[0],
            "_endpoint": "label",
            "_schema": LABEL_SCHEMA,
            "_raw": raw,
        }

    def _normalize_event(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise an openFDA adverse event (FAERS) record."""
        patient = raw.get("patient", {})
        drugs = patient.get("drug", [])

        # Primary drug
        drug_name = ""
        if drugs:
            drug_name = drugs[0].get("medicinalproduct", "") or drugs[0].get("openfda", {}).get("generic_name", [""])[0]

        # Reactions (events)
        reactions = patient.get("reaction", [])
        event_terms: List[str] = [r.get("reactionmeddrapt", "") for r in reactions if r.get("reactionmeddrapt")]
        primary_event = event_terms[0] if event_terms else ""

        # Seriousness
        seriousness_flags = []
        if raw.get("seriousnessdeath") == "1":
            seriousness_flags.append("death")
        if raw.get("seriousnesslifethreatening") == "1":
            seriousness_flags.append("life_threatening")
        if raw.get("seriousnesshospitalization") == "1":
            seriousness_flags.append("hospitalization")
        if raw.get("seriousnessdisabling") == "1":
            seriousness_flags.append("disabling")
        if raw.get("seriousnesscongenitalanomali") == "1":
            seriousness_flags.append("congenital_anomaly")
        if raw.get("seriousnessother") == "1":
            seriousness_flags.append("other")
        seriousness = ",".join(seriousness_flags) if seriousness_flags else "non-serious"

        # Patient demographics
        age = ""
        age_data = patient.get("patientonsetage", "")
        age_unit = patient.get("patientonsetageunit", "")
        if age_data:
            unit_map = {"800": "decade", "801": "year", "802": "month", "803": "week", "804": "day", "805": "hour"}
            age = f"{age_data} {unit_map.get(age_unit, '')}".strip()

        sex = patient.get("patientsex", "")
        sex_map = {"1": "male", "2": "female", "0": "unknown"}
        sex = sex_map.get(sex, "unknown")

        # Outcome
        outcome_map = {
            "1": "recovered/resolved",
            "2": "recovering/resolving",
            "3": "not recovered/not resolved",
            "4": "recovered with sequelae",
            "5": "fatal",
            "6": "unknown",
        }
        outcomes = [outcome_map.get(str(o), "unknown") for o in (patient.get("summary", {}).get("narrativeincludeclinical", []) or [])]
        outcome = outcomes[0] if outcomes else "unknown"

        return {
            "drug": drug_name,
            "event_term": primary_event,
            "count": 1,
            "seriousness": seriousness,
            "report_date": raw.get("receiptdate", ""),
            "age": age,
            "sex": sex,
            "country": raw.get("occurcountry", ""),
            "reporter": raw.get("companynumb", ""),
            "outcome": outcome,
            "_endpoint": "event",
            "_schema": EVENT_SCHEMA,
            "_all_drugs": [d.get("medicinalproduct", "") for d in drugs],
            "_all_events": event_terms,
            "_raw": raw,
        }

    def _normalize_enforcement(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise an openFDA enforcement (recall) record."""
        return {
            "product_description": raw.get("product_description", ""),
            "reason_for_recall": raw.get("reason_for_recall", ""),
            "status": raw.get("status", ""),
            "recall_number": raw.get("recall_number", ""),
            "recalling_firm": raw.get("recalling_firm", ""),
            "recall_initiation_date": raw.get("recall_initiation_date", ""),
            "classification": raw.get("classification", ""),
            "distribution_pattern": raw.get("distribution_pattern", ""),
            "_endpoint": "enforcement",
            "_schema": ENFORCEMENT_SCHEMA,
            "_raw": raw,
        }

    def _extract_section(self, raw: Dict[str, Any], section_keys: List[str]) -> List[str]:
        """Extract text from SPL document sections."""
        results: List[str] = []
        for key in section_keys:
            section = raw.get(key)
            if isinstance(section, list):
                for item in section:
                    if isinstance(item, str) and item.strip():
                        results.append(item.strip())
                    elif isinstance(item, dict):
                        text = item.get("text", "") if "text" in item else str(item)
                        if text.strip():
                            results.append(text.strip())
            elif isinstance(section, str) and section.strip():
                results.append(section.strip())
        return results

    # -- validate -------------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate normalised records and attach flags."""
        validated: List[Dict[str, Any]] = []
        for record in normalized_records:
            record["_valid"] = self._is_valid(record)
            record["_confidence"] = self.get_confidence(record).value
            record["_research_only"] = self._is_research_only(record)
            record["_provenance"] = self.get_provenance(record)
            validated.append(record)
        return validated

    def _is_valid(self, record: Dict[str, Any]) -> bool:
        """Valid based on endpoint-specific rules."""
        endpoint = record.get("_endpoint", "")
        if endpoint == "label":
            return bool(record.get("drug_name")) and bool(record.get("set_id"))
        if endpoint == "event":
            return bool(record.get("drug")) and bool(record.get("event_term"))
        if endpoint == "enforcement":
            return bool(record.get("recall_number"))
        return False

    def _is_research_only(self, record: Dict[str, Any]) -> bool:
        """Flag adverse events and enforcement reports as research-only."""
        endpoint = record.get("_endpoint", "")
        # Labels are HIGH confidence; events and enforcement are inherently observational
        return endpoint in ("event", "enforcement")

    # -- provenance & governance ----------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        endpoint = record.get("_endpoint", "unknown")
        record_id = record.get("set_id", "") or record.get("safetyreportid", "") or record.get("recall_number", "unknown")
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=f"{endpoint}:{record_id}",
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="Public Domain",
            license_url="https://open.fda.gov/license/",
            attribution_text="Data from openFDA, a public-domain resource provided by the U.S. FDA.",
            confidence_tier=self.get_confidence(record),
            evidence_level=self._map_evidence_level(record),
            research_only=self._is_research_only(record),
            research_only_reason=f"{endpoint} data is inherently observational" if self._is_research_only(record) else None,
            cache_ttl_seconds=self._cache_ttl,
        )

    def _map_evidence_level(self, record: Dict[str, Any]) -> EvidenceLevel:
        """Map openFDA data types to evidence levels."""
        endpoint = record.get("_endpoint", "")
        if endpoint == "label":
            return EvidenceLevel.RCT  # FDA-approved labels based on clinical trials
        if endpoint == "event":
            return EvidenceLevel.OBSERVATIONAL  # FAERS is spontaneous reporting
        if endpoint == "enforcement":
            return EvidenceLevel.PILOT_EXPERT  # Recalls are regulatory actions
        return EvidenceLevel.OBSERVATIONAL

    def get_license(self) -> LicenseMetadata:
        return LicenseMetadata(
            license_type="Public Domain (U.S. Government Work)",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            requires_share_alike=False,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="Data from openFDA (https://open.fda.gov).",
            restrictions=[],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Score confidence based on endpoint and data completeness."""
        endpoint = record.get("_endpoint", "")
        if endpoint == "label":
            # FDA-approved labels are HIGH confidence
            has_spl = bool(record.get("set_id")) and bool(record.get("spl_id"))
            has_ingredients = bool(record.get("active_ingredients"))
            if has_spl and has_ingredients:
                return ConfidenceTier.HIGH
            return ConfidenceTier.MEDIUM
        if endpoint == "event":
            # FAERS events are observational — LOW to MEDIUM
            seriousness = record.get("seriousness", "")
            if "death" in seriousness or "life_threatening" in seriousness:
                return ConfidenceTier.MEDIUM
            return ConfidenceTier.LOW
        if endpoint == "enforcement":
            # Recalls are official regulatory actions
            return ConfidenceTier.HIGH
        return ConfidenceTier.MEDIUM

    # -- health check ---------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify openFDA API reachability and report latency."""
        if not self._session or self._session.closed:
            return {"status": "down", "latency_ms": None, "source": self.source_name, "error": "Session closed"}

        start = asyncio.get_event_loop().time()
        try:
            await self._request("/drug/label.json", {"limit": 1})
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "ok", "latency_ms": round(latency, 2), "source": self.source_name, "base_url": self._base_url}
        except OpenFDAError as exc:
            latency = (asyncio.get_event_loop().time() - start) * 1000
            return {"status": "down", "latency_ms": round(latency, 2), "source": self.source_name, "error": str(exc)}
