"""
Base adapter definitions for the Knowledge Layer.

Defines the abstract base class, data models, enums, and shared utilities
that all biomedical data adapters must implement.
"""
from __future__ import annotations

import hashlib
import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta

from app.utils.time_utils import utc_now
from enum import Enum
from typing import Any, Dict, List, Optional, Union


# ── Enums ────────────────────────────────────────────────────────────────────

class ConfidenceTier(str, Enum):
    """Confidence tier for data quality assessment."""
    CRITICAL = "critical"      # P0 — verified by multiple independent sources
    HIGH = "high"              # P1 — strong evidence, peer-reviewed
    MEDIUM = "medium"          # P2 — moderate evidence, single study
    LOW = "low"                # P3 — limited evidence, expert opinion
    UNKNOWN = "unknown"        # No confidence data available
    RESEARCH = "research"      # Preclinical / research-only data


class EvidenceLevel(str, Enum):
    """Evidence level classification following Oxford CEBM levels."""
    SYSTEMATIC_REVIEW = "SYSTEMATIC_REVIEW"      # Level 1
    RCT = "RCT"                                   # Level 2
    COHORT_STUDY = "COHORT_STUDY"                # Level 3
    CASE_CONTROL = "CASE_CONTROL"                # Level 3b
    CASE_SERIES = "CASE_SERIES"                  # Level 4
    EXPERT_OPINION = "EXPERT_OPINION"            # Level 5
    PRECLINICAL = "PRECLINICAL"                  # In-vitro / animal
    ANECDOTAL = "ANECDOTAL"                      # Unverified reports
    PILOT_EXPERT = "PILOT_EXPERT"                # Pilot study / expert hybrid


# ── Exceptions ───────────────────────────────────────────────────────────────


class KnowledgeAdapterError(Exception):
    """Base exception for knowledge adapter operations."""


# Backwards-compatible aliases
AdapterError = KnowledgeAdapterError


class ConnectionError(KnowledgeAdapterError):
    """Raised when a connection to the upstream source fails."""


class LicenseViolationError(KnowledgeAdapterError):
    """Raised when a proposed use violates the adapter's license terms."""

    def __init__(
        self,
        message: str,
        adapter_name: str = "",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.adapter_name = adapter_name
        self.details = details or {}


class FetchError(KnowledgeAdapterError):
    """Raised when data extraction from the upstream source fails."""


class NormalizationError(KnowledgeAdapterError):
    """Raised when record normalization fails irrecoverably."""


class ValidationError(KnowledgeAdapterError):
    """Raised when a record fails schema validation."""


# ── Dataclasses ──────────────────────────────────────────────────────────────

@dataclass
class ProvenanceRecord:
    """Immutable provenance metadata attached to every knowledge record."""
    source_database: str
    source_version: str
    source_record_id: str
    ingestion_timestamp: datetime
    license_type: str = "UNKNOWN"
    confidence_tier: ConfidenceTier = ConfidenceTier.UNKNOWN
    evidence_level: EvidenceLevel = EvidenceLevel.ANECDOTAL
    citation_doi: Optional[str] = None
    attribution_text: Optional[str] = None
    research_only: bool = False
    retrieval_method: str = "direct"  # direct, cached, computed
    data_quality_score: float = 0.0  # 0.0–1.0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary with ISO timestamp."""
        d = asdict(self)
        d["ingestion_timestamp"] = self.ingestion_timestamp.isoformat()
        d["confidence_tier"] = self.confidence_tier.value
        d["evidence_level"] = self.evidence_level.value
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProvenanceRecord":
        """Deserialize from dictionary."""
        kwargs = dict(data)
        kwargs["ingestion_timestamp"] = datetime.fromisoformat(
            kwargs["ingestion_timestamp"]
        )
        kwargs["confidence_tier"] = ConfidenceTier(
            kwargs.get("confidence_tier", "UNKNOWN")
        )
        kwargs["evidence_level"] = EvidenceLevel(
            kwargs.get("evidence_level", "ANECDOTAL")
        )
        return cls(**{k: v for k, v in kwargs.items() if k in cls.__dataclass_fields__})


@dataclass
class LicenseMetadata:
    """License and attribution metadata for a data source."""
    license_type: str = "UNKNOWN"
    license_url: Optional[str] = None
    attribution_text: str = ""
    commercial_use_allowed: bool = False
    allows_research: bool = True
    allows_commercial: bool = False
    requires_attribution: bool = True
    requires_share_alike: bool = False
    share_alike: bool = False
    modification_allowed: bool = False
    redistribution_allowed: bool = False
    restrictions: List[str] = field(default_factory=list)
    last_verified: datetime = field(default_factory=datetime.utcnow)

    def is_compliant_for_use(self, use_case: str = "research") -> bool:
        """Check if license permits the given use case."""
        if use_case == "commercial":
            return self.allows_commercial
        if use_case == "redistribution":
            return self.redistribution_allowed
        if use_case == "research":
            return self.allows_research
        return True


# ── Abstract Base Adapter ────────────────────────────────────────────────────

class DatabaseAdapter(ABC):
    """Abstract base class for all biomedical database adapters.

    Every adapter must implement the full lifecycle: connect, fetch,
    normalize, validate, and produce provenance + confidence metadata.
    """

    # Cache configuration
    _cache_ttl_seconds: int = 3600
    _cache_dir: str = "/tmp/knowledge_cache"

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        self.config: Dict[str, Any] = config or {}
        self._connected: bool = False
        self._last_fetch_time: Optional[datetime] = None
        self._cache: Dict[str, Any] = {}

    @property
    def is_connected(self) -> bool:
        """Whether the adapter is currently connected."""
        return self._connected

    # ── Abstract properties ────────────────────────────────────────────────

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Human-readable source name, e.g. 'RxNorm'."""
        ...

    @property
    @abstractmethod
    def source_version(self) -> str:
        """Version identifier for the data source, e.g. '2026-01'."""
        ...

    # ── Abstract lifecycle methods ─────────────────────────────────────────

    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection to the data source."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Close connection and clean up resources."""
        ...

    @abstractmethod
    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Execute a query and return raw records."""
        ...

    @abstractmethod
    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw records into canonical schema."""
        ...

    @abstractmethod
    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate records and filter invalid entries."""
        ...

    @abstractmethod
    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        """Build a provenance record for the given data record."""
        ...

    @abstractmethod
    def get_license(self) -> LicenseMetadata:
        """Return license metadata for this data source."""
        ...

    @abstractmethod
    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        """Assess confidence tier for a specific record."""
        ...

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """Return health status of the adapter / upstream source."""
        ...

    # ── Cache utilities ────────────────────────────────────────────────────

    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if a cached entry exists and is within TTL."""
        if cache_key not in self._cache:
            return False
        entry = self._cache[cache_key]
        if entry is None:
            return False
        cached_at = entry.get("_cached_at")
        if cached_at is None:
            return False
        age = (utc_now() - cached_at).total_seconds()
        return age < self._cache_ttl_seconds

    def _get_cache_path(self, query: Union[str, Dict[str, Any]]) -> str:
        """Deterministic cache key from query content."""
        if isinstance(query, dict):
            raw = json.dumps(query, sort_keys=True, default=str)
        else:
            raw = str(query)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        source = self.source_name.lower().replace(" ", "_")
        return f"{source}_{digest}"

    def _write_cache(self, cache_key: str, data: Any) -> None:
        """Store data in the in-memory cache."""
        self._cache[cache_key] = {"data": data, "_cached_at": utc_now()}

    def _read_cache(self, cache_key: str) -> Any:
        """Read data from the in-memory cache."""
        entry = self._cache.get(cache_key)
        if entry:
            return entry.get("data")
        return None

    # ── Confidence scoring ─────────────────────────────────────────────────

    def _calculate_confidence_score(
        self,
        record: Dict[str, Any],
        evidence_dimensions: Optional[Dict[str, Any]] = None,
    ) -> float:
        """Calculate a composite confidence score (0.0–1.0).

        Dimensions:
            - source_reliability: 0–1  (peer-reviewed = 1.0)
            - evidence_strength:  0–1  (RCT = 1.0, anecdotal = 0.1)
            - data_completeness:  0–1  (all fields present = 1.0)
            - temporal_relevance: 0–1  (recent = 1.0)
            - cross_validation:   0–1  (multi-source confirmed = 1.0)
        """
        dims = evidence_dimensions or {}
        source_reliability = dims.get("source_reliability", 0.5)
        evidence_strength = dims.get("evidence_strength", 0.5)
        data_completeness = dims.get("data_completeness", 0.5)
        temporal_relevance = dims.get("temporal_relevance", 0.5)
        cross_validation = dims.get("cross_validation", 0.0)

        # Weighted average
        score = (
            source_reliability * 0.25
            + evidence_strength * 0.25
            + data_completeness * 0.20
            + temporal_relevance * 0.15
            + cross_validation * 0.15
        )
        return round(min(max(score, 0.0), 1.0), 4)

    # ── Research-only flagging ─────────────────────────────────────────────

    _RESEARCH_ONLY_CRITERIA = {
        "single_source",
        "pilot_study",
        "population_mismatch",
        "off_label_use",
        "investigational_device",
        "preclinical_only",
        "small_sample_size",
        "short_follow_up",
        "conflict_of_interest",
        "unreplicated_findings",
    }

    def _flag_research_only(
        self,
        record: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
        *,
        is_preclinical: bool = False,
        is_pilot_study: bool = False,
    ) -> tuple[bool, str]:
        """Determine if a record should be flagged research_only.

        Returns (True, reason) if any research-only criteria are met,
        otherwise (False, "").
        """
        ctx = context or {}
        flags = ctx.get("flags", set())

        # Direct flag match
        for criterion in self._RESEARCH_ONLY_CRITERIA:
            if criterion in flags:
                return True, f"Flag '{criterion}' triggered research-only"

        # Preclinical data
        if is_preclinical:
            return True, "Preclinical evidence level"

        # Pilot study
        if is_pilot_study:
            return True, "Pilot study evidence level"

        # Single-source data
        if ctx.get("source_count", 0) == 1:
            return True, "Single-source data"

        # Pilot study via context
        if ctx.get("is_pilot_study", False):
            return True, "Pilot study"

        # Population mismatch
        patient_age = ctx.get("patient_age")
        study_population = ctx.get("study_population", "")
        if patient_age is not None and study_population:
            if study_population == "pediatric" and patient_age >= 18:
                return True, "Population mismatch: adult patient in pediatric study"
            if study_population == "adult" and patient_age < 18:
                return True, "Population mismatch: pediatric patient in adult study"
            if study_population == "geriatric" and patient_age < 65:
                return True, "Population mismatch: non-geriatric patient in geriatric study"

        # Off-label use
        if ctx.get("is_off_label", False):
            return True, "Off-label use"

        # Small sample size
        if ctx.get("sample_size", 1000) < 30:
            return True, "Sample size < 30"

        # Preclinical via context
        if ctx.get("evidence_level") == "PRECLINICAL":
            return True, "Preclinical evidence"

        # Investigational device
        if ctx.get("is_investigational_device", False):
            return True, "Investigational device"

        # Short follow-up
        if ctx.get("follow_up_months", 12) < 3:
            return True, "Follow-up < 3 months"

        # Unreplicated findings
        if ctx.get("replication_count", 1) < 2 and ctx.get("is_novel_finding", False):
            return True, "Unreplicated novel findings"

        return False, ""

    # ── License / Attribution helpers ──────────────────────────────────────

    def _hash_record(self, data: Dict[str, Any]) -> str:
        """Generate a SHA-256 integrity hash for canonical record data.

        Args:
            data: Canonical record data dictionary.

        Returns:
            64-character hex digest string.
        """
        payload = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _generate_attribution_text(self, license_meta: LicenseMetadata) -> str:
        """Generate human-readable attribution string."""
        parts = [f"Source: {self.source_name} (v{self.source_version})"]
        if license_meta.license_type != "UNKNOWN":
            parts.append(f"License: {license_meta.license_type}")
        if license_meta.license_url:
            parts.append(f"URL: {license_meta.license_url}")
        if license_meta.requires_attribution:
            parts.append("Attribution required.")
        return " | ".join(parts)


# ── TypedDict helpers ────────────────────────────────────────────────────────


class ProvenanceDict(Dict[str, Any]):
    """Type hint for serialized provenance dictionaries."""

    pass


class HealthStatusDict(Dict[str, Any]):
    """Type hint for health status dictionaries."""

    pass

    def _format_source_reference(self, record: Dict[str, Any]) -> str:
        """Format a compact source reference string for a record.

        Args:
            record: A normalized record.

        Returns:
            Formatted reference like 'PubMed:12345678 (v2024.01)'.
        """
        prov = record.get("provenance", {})
        db = prov.get("source_database", self.source_name)
        rec_id = prov.get("source_record_id", record.get("canonical_id", "unknown"))
        ver = prov.get("source_version", self.source_version)
        return f"{db}:{rec_id} (v{ver})"

    def _extract_sample_size(self, record: Dict[str, Any]) -> Optional[int]:
        """Extract reported sample size from a normalized record.

        Args:
            record: A normalized record with canonical_data.

        Returns:
            Sample size as integer, or None if not found.
        """
        canonical = record.get("canonical_data", {})
        for key in ("sample_size", "n_enrolled", "participant_count", "n"):
            val = canonical.get(key)
            if isinstance(val, int) and val > 0:
                return val
            if isinstance(val, str):
                try:
                    return int(val)
                except ValueError:
                    continue
        return None

    def _safe_get_datetime(self, record: Dict[str, Any], *keys: str) -> Optional[datetime]:
        """Safely extract and parse a datetime from a record.

        Tries each key in order, returning the first successfully parsed value.

        Args:
            record: Dictionary to search.
            *keys: Field names to try.

        Returns:
            Parsed datetime, or None if no valid field found.
        """
        for key in keys:
            val = record.get(key)
            if val is None:
                continue
            if isinstance(val, datetime):
                return val
            if isinstance(val, str):
                try:
                    return datetime.fromisoformat(val)
                except ValueError:
                    continue
        return None
