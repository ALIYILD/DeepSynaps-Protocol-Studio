"""
OnSIDES (ON Side Effects) Adapter
===================================
Production-grade adapter for querying the OnSIDES adverse event dataset,
which provides NLP-extracted adverse events from FDA drug product labels.

CRITICAL GOVERNANCE NOTICE:
- OnSIDES captures label-reported adverse events from NLP extraction.
- These are drug-event pairs extracted from product labels, NOT proven causal
  relationships or incidence rates.
- Product labels report events observed during clinical trials and post-marketing,
  which do NOT establish causation.
- ALL data from this adapter is flagged as research-only.

Data Source: https://github.com/tatonetti-lab/onsides
License: CC BY 4.0

Author: DeepSynaps Protocol Studio / PHASE 2 Knowledge Layer
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Final, List, Optional, Tuple

import httpx

# Canonical ABC + license contract. The local ConfidenceTier / EvidenceLevel /
# ProvenanceRecord / LicenseMetadata dataclasses below predate this import and
# remain in place for backward-compat with code that depended on them; the
# production registry contract still expects the shared base LicenseMetadata.
from ..base_adapter import DatabaseAdapter as _DatabaseAdapter
from ..base_adapter import LicenseMetadata as _BaseLicenseMetadata

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Enums (mirrored from base interface)
# ---------------------------------------------------------------------------

class ConfidenceTier(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    RESEARCH = "research"


class EvidenceLevel(str, Enum):
    META_ANALYSIS = "A"
    RCT = "B"
    OBSERVATIONAL = "C"
    PILOT_EXPERT = "D"


# ---------------------------------------------------------------------------
# Data classes (mirrored from base interface)
# ---------------------------------------------------------------------------

@dataclass
class ProvenanceRecord:
    source_database: str
    source_version: str
    source_record_id: str
    ingestion_timestamp: datetime
    license_type: str
    license_url: Optional[str] = None
    attribution_text: Optional[str] = None
    confidence_tier: ConfidenceTier = ConfidenceTier.MEDIUM
    evidence_level: EvidenceLevel = EvidenceLevel.OBSERVATIONAL
    research_only: bool = False
    research_only_reason: Optional[str] = None
    update_timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    cache_ttl_seconds: int = 86_400


@dataclass
class LicenseMetadata:
    license_type: str
    allows_research: bool = True
    allows_commercial: bool = False
    requires_attribution: bool = True
    requires_share_alike: bool = False
    redistribution_allowed: bool = True
    modification_allowed: bool = True
    attribution_text: str = ""
    restrictions: List[str] = field(default_factory=list)
    last_verified: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ONSIDES_GITHUB_RAW: Final[str] = (
    "https://raw.githubusercontent.com/tatonetti-lab/onsides/main"
)
ONSIDES_RELEASE_FILES: Final[Dict[str, str]] = {
    "adverse_reactions": "/data/archive/onsides_adverse_reactions.tsv",
    "boxed_warnings": "/data/archive/onsides_boxed_warnings.tsv",
    "warnings_precautions": "/data/archive/onsides_warnings_precautions.tsv",
}
ONSIDES_API_BASE: Final[str] = "https://rxnav.nlm.nih.gov/REST"
DEFAULT_TIMEOUT: Final[float] = 30.0
MAX_RETRIES: Final[int] = 3
RETRY_DELAY_BASE: Final[float] = 1.0

# Mandatory governance disclaimers
ONSIDES_CAUSATION_DISCLAIMER: Final[str] = (
    "OnSIDES captures label-reported adverse events from NLP extraction. "
    "These are drug-event pairs from product labels, not proven causal "
    "relationships or incidence rates. Label content reflects sponsor-reported "
    "observations from clinical trials and post-marketing surveillance, which "
    "do not establish causation."
)

ONSIDES_RESEARCH_ONLY_REASON: Final[str] = (
    "OnSIDES captures label-reported adverse events from NLP extraction. "
    "These are drug-event pairs from product labels, not proven causal "
    "relationships or incidence rates."
)

# ---------------------------------------------------------------------------
# Token bucket rate limiter
# ---------------------------------------------------------------------------

class TokenBucketRateLimiter:
    """Async token-bucket rate limiter for API compliance."""

    def __init__(self, max_calls: int, period_seconds: int) -> None:
        self.max_calls = max_calls
        self.period = period_seconds
        self.tokens: float = float(max_calls)
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            self.tokens = min(self.max_calls, self.tokens + elapsed * (self.max_calls / self.period))
            self.last_refill = now
            if self.tokens < 1:
                wait = (1 - self.tokens) * (self.period / self.max_calls)
                await asyncio.sleep(wait)
                self.tokens = 0
            else:
                self.tokens -= 1


# ---------------------------------------------------------------------------
# OnSIDES Adapter
# ---------------------------------------------------------------------------

class OnSIDESAdapter(_DatabaseAdapter):
    """Adapter for the OnSIDES (ON Side Effects) dataset.

    Provides access to NLP-extracted adverse events from FDA drug labels.
    All data carries mandatory research-only flags and causation disclaimers.
    """

    def __init__(self, config: Dict[str, Any] | None = None) -> None:
        self.config = config or {}
        self._cache: Dict[str, Any] = {}
        self._version = self.config.get("version", "current")
        self._connected = False
        self._client: Optional[httpx.AsyncClient] = None
        self._rate_limiter = TokenBucketRateLimiter(120, 60)
        self._request_count = 0
        self._error_count = 0
        self._local_data_path: Optional[str] = self.config.get("local_data_path")
        self._in_memory_db: Dict[str, List[Dict[str, Any]]] = {}
        self._loaded = False

    # -- Properties -------------------------------------------------------

    @property
    def source_name(self) -> str:
        return "OnSIDES"

    @property
    def source_version(self) -> str:
        return self._version

    # -- Lifecycle --------------------------------------------------------

    async def connect(self) -> bool:
        """Initialize HTTP client and optionally preload local data."""
        if self._connected:
            return True
        headers = {"User-Agent": "DeepSynaps-OnSIDES-Adapter/2.0"}
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(DEFAULT_TIMEOUT),
            headers=headers,
            follow_redirects=True,
        )
        self._connected = True

        # Preload local TSV if configured
        if self._local_data_path and os.path.exists(self._local_data_path):
            await self._load_local_tsv(self._local_data_path)

        logger.info("OnSIDES adapter connected")
        return True

    async def disconnect(self) -> None:
        """Close HTTP client and release resources."""
        if self._client:
            await self._client.aclose()
            self._client = None
        self._connected = False
        self._in_memory_db.clear()
        self._loaded = False
        logger.info("OnSIDES adapter disconnected")

    # -- Local data loading -----------------------------------------------

    async def _load_local_tsv(self, file_path: str) -> None:
        """Load a local OnSIDES TSV file into in-memory index."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._parse_tsv_sync, file_path)

    def _parse_tsv_sync(self, file_path: str) -> None:
        """Synchronous TSV parser (runs in thread pool)."""
        path = Path(file_path)
        if not path.exists():
            logger.warning("OnSIDES local file not found: %s", file_path)
            return

        logger.info("Loading OnSIDES data from %s", file_path)
        records: List[Dict[str, Any]] = []
        try:
            with path.open("r", encoding="utf-8") as fh:
                reader = csv.DictReader(fh, delimiter="\t")
                for row in reader:
                    records.append(dict(row))
            self._in_memory_db["local"] = records
            self._loaded = True
            logger.info("Loaded %d OnSIDES records from local file", len(records))
        except Exception as exc:
            logger.error("Failed to parse OnSIDES TSV: %s", exc)
            self._error_count += 1

    # -- Core fetch -------------------------------------------------------

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a query against OnSIDES data.

        Query modes:
            - drug_rxnorm: str      -> filter by RxNorm CUI
            - drug_name: str        -> filter by drug name (case-insensitive)
            - adverse_event: str    -> filter by MedDRA PT
            - label_section: str    -> filter by section type
            - source: str           -> "github", "local", or "rxnav"
            - min_probability: float-> minimum NLP probability score
            - limit: int            -> max results
        """
        source = query.get("source", "github")

        if source == "local":
            return await self._query_local(query)
        elif source == "rxnav":
            return await self._query_rxnav(query)
        else:
            return await self._query_github(query)

    async def _query_github(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Fetch OnSIDES data from GitHub raw TSV releases."""
        file_key = query.get("file", "adverse_reactions")
        file_path = ONSIDES_RELEASE_FILES.get(file_key, ONSIDES_RELEASE_FILES["adverse_reactions"])
        url = f"{ONSIDES_GITHUB_RAW}{file_path}"

        await self._rate_limiter.acquire()
        data = await self._fetch_tsv_with_retry(url)
        return self._filter_records(data, query)

    async def _query_local(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Query pre-loaded local OnSIDES data."""
        if not self._loaded or "local" not in self._in_memory_db:
            return []
        return self._filter_records(self._in_memory_db["local"], query)

    async def _query_rxnav(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Query via RxNorm API for drug concept mapping."""
        drug_name = query.get("drug_name", "")
        if not drug_name:
            return []
        rxnorm_cui = await self._resolve_rxnorm_cui(drug_name)
        if not rxnorm_cui:
            return []
        # Re-query with resolved RxNorm CUI
        updated_query = {**query, "drug_rxnorm": rxnorm_cui, "source": "github"}
        return await self._query_github(updated_query)

    async def _fetch_tsv_with_retry(self, url: str) -> List[Dict[str, Any]]:
        """Fetch TSV from URL with retries and parse to records."""
        if not self._client:
            raise RuntimeError("OnSIDES adapter not connected")

        last_exception: Optional[Exception] = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await self._client.get(url, timeout=DEFAULT_TIMEOUT)
                self._request_count += 1
                if response.status_code == 200:
                    return self._parse_tsv_text(response.text)
                if response.status_code == 404:
                    logger.error("OnSIDES file not found at %s", url)
                    return []
                if response.status_code in (429, 500, 502, 503, 504):
                    logger.warning("OnSIDES HTTP %d on attempt %d", response.status_code, attempt)
                    await asyncio.sleep(RETRY_DELAY_BASE * (2 ** attempt))
                    continue
                response.raise_for_status()
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_exception = exc
                logger.warning("OnSIDES connection error attempt %d: %s", attempt, exc)
                await asyncio.sleep(RETRY_DELAY_BASE * (2 ** attempt))

        self._error_count += 1
        logger.error("OnSIDES fetch failed after %d attempts: %s", MAX_RETRIES, last_exception)
        return []

    @staticmethod
    def _parse_tsv_text(tsv_text: str) -> List[Dict[str, Any]]:
        """Parse TSV text content into list of dictionaries."""
        records: List[Dict[str, Any]] = []
        try:
            reader = csv.DictReader(io.StringIO(tsv_text), delimiter="\t")
            for row in reader:
                records.append({k: (v if v != "" else None) for k, v in row.items()})
        except csv.Error as exc:
            logger.error("OnSIDES TSV parse error: %s", exc)
        return records

    def _filter_records(
        self, records: List[Dict[str, Any]], query: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Apply query filters to OnSIDES records."""
        filtered = records

        if drug_rxnorm := query.get("drug_rxnorm"):
            filtered = [r for r in filtered if r.get("drug_rxnorm") == drug_rxnorm]

        if drug_name := query.get("drug_name"):
            drug_lower = drug_name.lower()
            filtered = [
                r for r in filtered
                if (r.get("drug_name") or "").lower() == drug_lower
                or drug_lower in (r.get("drug_name") or "").lower()
            ]

        if adverse_event := query.get("adverse_event"):
            ae_lower = adverse_event.lower()
            filtered = [
                r for r in filtered
                if ae_lower in (r.get("adverse_event_name") or "").lower()
                or ae_lower in (r.get("adverse_event_meddra") or "").lower()
            ]

        if section := query.get("label_section"):
            filtered = [r for r in filtered if r.get("label_section") == section]

        if min_prob := query.get("min_probability"):
            try:
                min_p = float(min_prob)
                filtered = [
                    r for r in filtered
                    if float(r.get("probability_score") or 0) >= min_p
                ]
            except (ValueError, TypeError):
                pass

        limit = query.get("limit", 1000)
        return filtered[:limit]

    # -- RxNorm resolution ------------------------------------------------

    async def _resolve_rxnorm_cui(self, drug_name: str) -> Optional[str]:
        """Resolve a drug name to RxNorm CUI via RxNav API."""
        if not self._client:
            return None
        url = f"{ONSIDES_API_BASE}/rxcui.json"
        try:
            await self._rate_limiter.acquire()
            response = await self._client.get(url, params={"name": drug_name}, timeout=10.0)
            self._request_count += 1
            if response.status_code == 200:
                data = response.json()
                id_group = data.get("idGroup", {})
                rxnorm_id = id_group.get("rxnormId", [])
                if rxnorm_id:
                    return str(rxnorm_id[0])
        except Exception as exc:
            logger.warning("RxNorm resolution failed for '%s': %s", drug_name, exc)
            self._error_count += 1
        return None

    async def get_drug_properties(self, rxnorm_cui: str) -> Dict[str, Any]:
        """Fetch drug properties from RxNorm for a given CUI."""
        if not self._client:
            return {}
        url = f"{ONSIDES_API_BASE}/rxcui/{rxnorm_cui}/properties.json"
        try:
            await self._rate_limiter.acquire()
            response = await self._client.get(url, timeout=10.0)
            self._request_count += 1
            if response.status_code == 200:
                return response.json()
        except Exception as exc:
            logger.warning("RxNorm properties fetch failed for %s: %s", rxnorm_cui, exc)
            self._error_count += 1
        return {}

    # -- Normalization ----------------------------------------------------

    async def normalize(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Normalize OnSIDES records into canonical format with governance."""
        normalized: List[Dict[str, Any]] = []
        for raw in raw_records:
            try:
                rec = self._normalize_single(raw)
                normalized.append(rec)
            except Exception as exc:
                logger.warning("Skipping malformed OnSIDES record: %s", exc)
        return normalized

    def _normalize_single(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize a single OnSIDES record with mandatory governance."""
        # Probability score handling
        prob_score: Optional[float] = None
        try:
            if raw.get("probability_score"):
                prob_score = round(float(raw["probability_score"]), 6)
        except (ValueError, TypeError):
            prob_score = None

        # Confidence tier based on probability score
        confidence = ConfidenceTier.RESEARCH
        if prob_score is not None:
            if prob_score >= 0.8:
                confidence = ConfidenceTier.MEDIUM
            elif prob_score >= 0.5:
                confidence = ConfidenceTier.LOW
            else:
                confidence = ConfidenceTier.RESEARCH

        label_section = raw.get("label_section", "unknown")
        section_display = {
            "adverse_reactions": "Adverse Reactions",
            "boxed_warnings": "Boxed Warnings",
            "warnings_precautions": "Warnings and Precautions",
        }.get(label_section, label_section)

        return {
            "source": "OnSIDES",
            "source_id": raw.get("id") or raw.get("source_label_id", "UNKNOWN"),
            "drug_rxnorm": raw.get("drug_rxnorm"),
            "drug_name": raw.get("drug_name"),
            "adverse_event_meddra": raw.get("adverse_event_meddra"),
            "adverse_event_name": raw.get("adverse_event_name"),
            "probability_score": prob_score,
            "probability_note": (
                f"NLP probability {prob_score}: indicates model confidence in extraction, "
                "NOT clinical probability of event occurrence"
                if prob_score is not None else None
            ),
            "label_section": label_section,
            "label_section_display": section_display,
            "source_label_id": raw.get("source_label_id"),
            "source_label_url": (
                f"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid={raw['source_label_id']}"
                if raw.get("source_label_id") else None
            ),
            "extraction_method": raw.get("extraction_method", "NLP (BERT-based)"),
            "extraction_version": raw.get("extraction_version"),
            "label_date": raw.get("label_date"),
            "ingredient_rxnorm": raw.get("ingredient_rxnorm"),
            "ingredient_name": raw.get("ingredient_name"),
            # MANDATORY governance fields
            "_causation_disclaimer": ONSIDES_CAUSATION_DISCLAIMER,
            "_reporting_bias_warning": (
                "Drug labels report events observed during development and post-marketing. "
                "These observations do not establish causal relationships or population-level "
                "incidence rates. Event rates from clinical trials reflect the studied population, "
                "which may differ from real-world use."
            ),
            "_research_only": True,
            "_research_only_reason": ONSIDES_RESEARCH_ONLY_REASON,
            "_confidence_tier": confidence.value,
            "_evidence_level": EvidenceLevel.OBSERVATIONAL.value,
        }

    # -- Validation -------------------------------------------------------

    async def validate(self, normalized_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate normalized OnSIDES records and attach provenance."""
        validated: List[Dict[str, Any]] = []
        for rec in normalized_records:
            if not rec.get("drug_name") and not rec.get("drug_rxnorm"):
                logger.debug("Dropping OnSIDES record without drug identifier")
                continue
            if not rec.get("adverse_event_meddra") and not rec.get("adverse_event_name"):
                logger.debug("Dropping OnSIDES record without adverse event identifier")
                continue
            rec["_provenance"] = self.get_provenance(rec)
            rec["_license"] = self.get_license()
            validated.append(rec)
        return validated

    # -- Provenance & License ---------------------------------------------

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        return ProvenanceRecord(
            source_database=self.source_name,
            source_version=self.source_version,
            source_record_id=record.get("source_id", "UNKNOWN"),
            ingestion_timestamp=datetime.now(timezone.utc),
            license_type="CC BY 4.0",
            license_url="https://creativecommons.org/licenses/by/4.0/",
            attribution_text=(
                "Data from OnSIDES (Tatonetti Lab). "
                "Available under CC BY 4.0. "
                "https://github.com/tatonetti-lab/onsides"
            ),
            confidence_tier=ConfidenceTier(record.get("_confidence_tier", ConfidenceTier.RESEARCH.value)),
            evidence_level=EvidenceLevel.OBSERVATIONAL,
            research_only=True,
            research_only_reason=ONSIDES_RESEARCH_ONLY_REASON,
        )

    def get_license(self) -> _BaseLicenseMetadata:
        return _BaseLicenseMetadata(
            license_type="CC BY 4.0",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            requires_share_alike=False,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text=(
                "OnSIDES data by Tatonetti Lab, Columbia University. "
                "Licensed under CC BY 4.0."
            ),
            restrictions=[
                "Attribution required: cite OnSIDES and Tatonetti Lab.",
                "Data must not be presented as incidence rates or causation.",
                "Label-derived associations are not proven causal relationships.",
            ],
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Determine confidence tier based on NLP probability score."""
        score = record.get("probability_score")
        if score is None:
            return ConfidenceTier.RESEARCH
        if score >= 0.8:
            return ConfidenceTier.MEDIUM
        if score >= 0.5:
            return ConfidenceTier.LOW
        return ConfidenceTier.RESEARCH

    # -- Utility methods --------------------------------------------------

    async def get_drug_events(
        self, drug_name: str, min_probability: Optional[float] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Convenience: get adverse events for a specific drug."""
        query: Dict[str, Any] = {
            "drug_name": drug_name,
            "source": "github",
            "limit": limit,
        }
        if min_probability is not None:
            query["min_probability"] = min_probability

        raw = await self.fetch(query)
        normalized = await self.normalize(raw)
        validated = await self.validate(normalized)
        return validated

    async def get_event_drugs(
        self, event_name: str, min_probability: Optional[float] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Convenience: get drugs associated with a specific adverse event."""
        query: Dict[str, Any] = {
            "adverse_event": event_name,
            "source": "github",
            "limit": limit,
        }
        if min_probability is not None:
            query["min_probability"] = min_probability

        raw = await self.fetch(query)
        normalized = await self.normalize(raw)
        validated = await self.validate(normalized)
        return validated

    async def get_by_label_section(
        self, section: str, limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """Fetch records by label section type."""
        raw = await self.fetch({"label_section": section, "limit": limit})
        normalized = await self.normalize(raw)
        validated = await self.validate(normalized)
        return validated

    # -- Health check -----------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Verify OnSIDES data source accessibility."""
        status = {
            "adapter": "OnSIDES",
            "connected": self._connected,
            "version": self.source_version,
            "requests_made": self._request_count,
            "errors": self._error_count,
            "local_data_loaded": self._loaded,
            "local_data_path": self._local_data_path,
            "local_record_count": len(self._in_memory_db.get("local", [])),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if self._connected and self._client:
            # Check GitHub raw availability
            try:
                test_url = f"{ONSIDES_GITHUB_RAW}/README.md"
                probe = await self._client.get(test_url, timeout=10.0)
                status["github_reachable"] = probe.status_code == 200
                status["github_status_code"] = probe.status_code
            except Exception as exc:
                status["github_reachable"] = False
                status["github_error"] = str(exc)

            # Check RxNav availability
            try:
                await self._rate_limiter.acquire()
                probe = await self._client.get(
                    f"{ONSIDES_API_BASE}/version.json", timeout=10.0
                )
                self._request_count += 1
                status["rxnav_reachable"] = probe.status_code == 200
            except Exception as exc:
                status["rxnav_reachable"] = False
                status["rxnav_error"] = str(exc)
        else:
            status["github_reachable"] = False
            status["github_error"] = "Adapter not connected"
            status["rxnav_reachable"] = False

        return status

    # -- String representation --------------------------------------------

    def __repr__(self) -> str:
        return (
            f"OnSIDESAdapter(connected={self._connected}, "
            f"requests={self._request_count}, errors={self._error_count}, "
            f"local_loaded={self._loaded})"
        )
