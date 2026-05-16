"""
DeepSynaps Protocol Studio — Knowledge Layer Cache Models

SQLAlchemy ORM models for persisting cached knowledge data from external
databases. Provides three core tables:

    1. KnowledgeCacheEntry    — main cache table for normalized records.
    2. KnowledgeCacheSyncLog  — audit log for all sync operations.
    3. KnowledgeLicenseCompliance — license compliance tracking.

All tables include JSON columns for flexible provenance storage,
SHA-256 data integrity hashes, composite indexes for query performance,
and full audit timestamps.

Usage:
    from app.persistence.models.knowledge_cache import (
        KnowledgeCacheEntry,
        KnowledgeCacheSyncLog,
        KnowledgeLicenseCompliance,
    )

    # Query cache entries
    entries = await session.execute(
        select(KnowledgeCacheEntry)
        .where(KnowledgeCacheEntry.adapter_name == "pubmed")
        .where(KnowledgeCacheEntry.expires_at > datetime.utcnow())
    )

    # Log a sync operation
    sync_log = KnowledgeCacheSyncLog(
        adapter_name="pubmed",
        sync_type="full",
        status="success",
        records_processed=150,
        records_inserted=42,
        records_updated=108,
    )
    session.add(sync_log)
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    inspect,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import validates

logger = logging.getLogger("persistence.models.knowledge_cache")

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------

Base = declarative_base()

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _compute_sha256(data: Any) -> str:
    """Compute a SHA-256 hex digest of a JSON-serialized value.

    Args:
        data: Any JSON-serializable Python object.

    Returns:
        64-character hexadecimal SHA-256 digest string.
    """
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _default_expiry() -> datetime:
    """Return the default cache expiration time (24 hours from now).

    Returns:
        UTC datetime representing the default TTL.
    """
    return datetime.utcnow() + timedelta(hours=24)


# ---------------------------------------------------------------------------
# 1. KnowledgeCacheEntry — main cache table
# ---------------------------------------------------------------------------


class KnowledgeCacheEntry(Base):
    """Cache table for normalized data ingested from external databases.

    Each row represents a single canonical record from one external source.
    Records are uniquely identified by the composite of (adapter_name,
    source_database, source_record_id) and are upserted on re-ingestion
    to maintain idempotency.

    Attributes:
        id: Surrogate primary key.
        cache_key: Deterministic cache key for fast lookups.
        adapter_name: Registry name of the source adapter.
        source_database: Human-readable source database name.
        source_version: Version of the source database at ingestion time.
        source_record_id: Primary identifier used by the source database.

        canonical_data: The normalized payload in canonical schema (JSON).
        canonical_schema_version: Semantic version of the canonical schema.

        provenance: Full provenance record as JSON.
        confidence_tier: Aggregated confidence tier string.
        evidence_level: Evidence level classification.
        research_only: Whether record is restricted to research use.
        research_only_reason: Human-readable explanation for restriction.

        license_type: SPDX or custom license identifier.
        license_metadata: Full license metadata as JSON.

        created_at: Row creation timestamp.
        updated_at: Last modification timestamp.
        expires_at: Cache expiration timestamp.
        access_count: Number of times this record has been read.
        last_accessed_at: Timestamp of most recent read.

        data_hash: SHA-256 digest of canonical_data for integrity.
        raw_data_hash: SHA-256 digest of the original raw data.
    """

    __tablename__ = "knowledge_cache"

    # Primary key
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Cache key — deterministic, unique
    cache_key = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        doc="Deterministic cache key (SHA-256 hex of canonical_id + source)",
    )

    # Source identification
    adapter_name = Column(
        String(100),
        nullable=False,
        index=True,
        doc="Registry name of the adapter that produced this record",
    )
    source_database = Column(
        String(100),
        nullable=False,
        doc="Human-readable name of the external source database",
    )
    source_version = Column(
        String(50),
        nullable=False,
        doc="Version string of the external database at fetch time",
    )
    source_record_id = Column(
        String(255),
        nullable=False,
        doc="Primary record identifier used by the source database",
    )

    # Canonical data payload
    canonical_data = Column(
        JSON,
        nullable=False,
        doc="Normalized record payload conforming to the canonical schema",
    )
    canonical_schema_version = Column(
        String(20),
        default="1.0.0",
        nullable=False,
        doc="Semantic version of the canonical schema this record conforms to",
    )

    # Provenance & governance
    provenance = Column(
        JSON,
        nullable=False,
        doc="Full provenance record including source, license, and confidence",
    )
    confidence_tier = Column(
        String(20),
        nullable=False,
        default="medium",
        doc="Confidence tier: high, medium, low, or research",
    )
    evidence_level = Column(
        String(5),
        nullable=False,
        default="C",
        doc="Evidence level: A (meta), B (RCT), C (observational), D (pilot)",
    )
    research_only = Column(
        Boolean,
        default=False,
        nullable=False,
        doc="True if the record is restricted to research use only",
    )
    research_only_reason = Column(
        Text,
        nullable=True,
        doc="Explanation for research-only restriction",
    )

    # License
    license_type = Column(
        String(50),
        nullable=False,
        doc="License identifier (e.g., CC-BY-SA-4.0, PUBLIC_DOMAIN)",
    )
    license_metadata = Column(
        JSON,
        nullable=True,
        doc="Full license metadata including permissions and restrictions",
    )

    # Cache management timestamps
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        doc="Timestamp when the cache entry was first created",
    )
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        doc="Timestamp of the most recent update to this entry",
    )
    expires_at = Column(
        DateTime,
        default=_default_expiry,
        nullable=False,
        doc="Timestamp when this cache entry becomes stale",
    )

    # Access tracking
    access_count = Column(
        Integer,
        default=0,
        nullable=False,
        doc="Number of times this record has been retrieved from cache",
    )
    last_accessed_at = Column(
        DateTime,
        nullable=True,
        doc="Timestamp of the most recent cache hit",
    )

    # Data integrity
    data_hash = Column(
        String(64),
        nullable=False,
        doc="SHA-256 hex digest of canonical_data for tamper detection",
    )
    raw_data_hash = Column(
        String(64),
        nullable=True,
        doc="SHA-256 hex digest of the original raw data before normalization",
    )

    # Composite constraints
    __table_args__ = (
        UniqueConstraint(
            "adapter_name",
            "source_database",
            "source_record_id",
            name="uix_knowledge_cache_source_record",
        ),
        Index(
            "ix_knowledge_cache_adapter_expires",
            "adapter_name",
            "expires_at",
            doc="Fast lookup of non-expired entries per adapter",
        ),
        Index(
            "ix_knowledge_cache_confidence",
            "confidence_tier",
            "evidence_level",
            doc="Filter by confidence and evidence level",
        ),
        Index(
            "ix_knowledge_cache_research_only",
            "research_only",
            "confidence_tier",
            doc="Filter research-only vs clinical-grade records",
        ),
        Index(
            "ix_knowledge_cache_license",
            "license_type",
            doc="Compliance queries by license type",
        ),
        {
            "comment": (
                "Primary cache table for normalized knowledge records. "
                "Records are upserted on re-ingestion for idempotency. "
                "Expired entries are cleaned up by a background sweeper."
            ),
        },
    )

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @validates("confidence_tier")
    def validate_confidence_tier(self, key: str, value: str) -> str:
        """Validate that confidence_tier is one of the allowed values."""
        allowed = {"high", "medium", "low", "research"}
        if value not in allowed:
            raise ValueError(
                f"Invalid confidence_tier '{value}'. Must be one of: {allowed}"
            )
        return value

    @validates("evidence_level")
    def validate_evidence_level(self, key: str, value: str) -> str:
        """Validate that evidence_level is one of the allowed values."""
        allowed = {"A", "B", "C", "D"}
        if value not in allowed:
            raise ValueError(
                f"Invalid evidence_level '{value}'. Must be one of: {allowed}"
            )
        return value

    @validates("canonical_data")
    def validate_canonical_data(self, key: str, value: Any) -> Any:
        """Ensure canonical_data is a dict-like JSON value."""
        if value is None:
            raise ValueError("canonical_data cannot be None")
        return value

    # ------------------------------------------------------------------
    # Computed properties
    # ------------------------------------------------------------------

    @property
    def is_expired(self) -> bool:
        """Return True if this cache entry has exceeded its TTL.

        Returns:
            Boolean indicating cache expiration status.
        """
        if self.expires_at is None:
            return True
        return datetime.utcnow() > self.expires_at

    @property
    def age_seconds(self) -> float:
        """Return the age of this cache entry in seconds.

        Returns:
            Float seconds since creation.
        """
        return (datetime.utcnow() - self.created_at).total_seconds()

    @property
    def ttl_remaining_seconds(self) -> float:
        """Return remaining TTL in seconds.

        Returns:
            Float seconds until expiration (may be negative if expired).
        """
        if self.expires_at is None:
            return 0.0
        return (self.expires_at - datetime.utcnow()).total_seconds()

    # ------------------------------------------------------------------
    # Integrity verification
    # ------------------------------------------------------------------

    def verify_integrity(self) -> bool:
        """Verify that the stored data_hash matches the current canonical_data.

        This detects tampering or corruption of the cached payload.

        Returns:
            True if the integrity hash matches, False otherwise.
        """
        current_hash = _compute_sha256(self.canonical_data)
        return current_hash == self.data_hash

    def recompute_hash(self) -> None:
        """Recompute and update the data_hash from canonical_data.

        Call this after modifying canonical_data to keep the hash in sync.
        """
        self.data_hash = _compute_sha256(self.canonical_data)

    # ------------------------------------------------------------------
    # Touch / access tracking
    # ------------------------------------------------------------------

    def touch(self) -> None:
        """Increment access counter and update last_accessed_at.

        Call this whenever the cache entry is read to maintain accurate
        access statistics for cache eviction policies.
        """
        self.access_count += 1
        self.last_accessed_at = datetime.utcnow()

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self, include_canonical_data: bool = True) -> Dict[str, Any]:
        """Serialize this cache entry to a dictionary.

        Args:
            include_canonical_data: If False, omit the canonical_data
                payload (useful for lightweight listing responses).

        Returns:
            Dictionary representation of the cache entry.
        """
        result: Dict[str, Any] = {
            "id": self.id,
            "cache_key": self.cache_key,
            "adapter_name": self.adapter_name,
            "source_database": self.source_database,
            "source_version": self.source_version,
            "source_record_id": self.source_record_id,
            "canonical_schema_version": self.canonical_schema_version,
            "provenance": self.provenance,
            "confidence_tier": self.confidence_tier,
            "evidence_level": self.evidence_level,
            "research_only": self.research_only,
            "research_only_reason": self.research_only_reason,
            "license_type": self.license_type,
            "license_metadata": self.license_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "access_count": self.access_count,
            "last_accessed_at": self.last_accessed_at.isoformat() if self.last_accessed_at else None,
            "data_hash": self.data_hash,
            "raw_data_hash": self.raw_data_hash,
            "is_expired": self.is_expired,
            "ttl_remaining_seconds": round(self.ttl_remaining_seconds, 1),
        }
        if include_canonical_data:
            result["canonical_data"] = self.canonical_data
        return result

    # ------------------------------------------------------------------
    # Construction helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_enriched_record(
        cls,
        adapter_name: str,
        record: Dict[str, Any],
        expires_at: Optional[datetime] = None,
    ) -> "KnowledgeCacheEntry":
        """Create a KnowledgeCacheEntry from an enriched ETL pipeline record.

        Args:
            adapter_name: Registry name of the source adapter.
            record: Enriched record produced by ETLPipeline._enrich_records().
            expires_at: Optional explicit expiration time.

        Returns:
            A new KnowledgeCacheEntry instance (not yet persisted).
        """
        canonical_data = record.get("canonical_data", {})
        provenance = record.get("_provenance", {})
        cache_key = record.get("_cache_key", _compute_sha256(f"{record.get('canonical_id', '')}:{adapter_name}"))

        return cls(
            cache_key=cache_key,
            adapter_name=adapter_name,
            source_database=provenance.get("source_database", adapter_name),
            source_version=provenance.get("source_version", "unknown"),
            source_record_id=provenance.get("source_record_id", ""),
            canonical_data=canonical_data,
            canonical_schema_version=record.get("canonical_schema_version", "1.0.0"),
            provenance=provenance,
            confidence_tier=record.get("_confidence_tier", "medium"),
            evidence_level=record.get("_evidence_level", "C"),
            research_only=record.get("_research_only", False),
            research_only_reason=record.get("_research_only_reason"),
            license_type=provenance.get("license_type", "unknown"),
            license_metadata=record.get("_license_metadata"),
            expires_at=expires_at or _default_expiry(),
            data_hash=_compute_sha256(canonical_data),
            raw_data_hash=record.get("_raw_data_hash"),
        )

    def __repr__(self) -> str:
        return (
            f"<KnowledgeCacheEntry("
            f"id={self.id}, "
            f"adapter='{self.adapter_name}', "
            f"source='{self.source_database}', "
            f"confidence='{self.confidence_tier}', "
            f"expired={self.is_expired})>"
        )


# ---------------------------------------------------------------------------
# 2. KnowledgeCacheSyncLog — audit log
# ---------------------------------------------------------------------------


class KnowledgeCacheSyncLog(Base):
    """Audit log table for all cache synchronization operations.

    Every ETL run, full sync, incremental update, or recovery attempt
    generates a row in this table. It serves as the immutable audit trail
    for cache operations and supports debugging, compliance reporting, and
    performance analysis.

    Attributes:
        id: Surrogate primary key.
        adapter_name: Registry name of the adapter being synced.
        sync_type: Type of sync operation (full, incremental, recovery).
        status: Terminal status (success, partial, failed).
        records_processed: Total records handled in the sync.
        records_inserted: New records added to cache.
        records_updated: Existing records refreshed.
        records_failed: Records that could not be processed.
        started_at: Sync start timestamp.
        completed_at: Sync end timestamp.
        error_details: Structured error information (JSON).
        checkpoint_data: Checkpoint state for recovery (JSON).
    """

    __tablename__ = "knowledge_cache_sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)

    adapter_name = Column(
        String(100),
        nullable=False,
        index=True,
        doc="Registry name of the adapter being synchronized",
    )
    sync_type = Column(
        String(50),
        nullable=True,
        doc="Type of sync: full, incremental, or recovery",
    )
    status = Column(
        String(20),
        nullable=True,
        doc="Terminal status: success, partial, or failed",
    )

    # Record counts
    records_processed = Column(
        Integer,
        default=0,
        nullable=False,
        doc="Total number of records processed in this sync",
    )
    records_inserted = Column(
        Integer,
        default=0,
        nullable=False,
        doc="Number of new records inserted into the cache",
    )
    records_updated = Column(
        Integer,
        default=0,
        nullable=False,
        doc="Number of existing records updated in the cache",
    )
    records_failed = Column(
        Integer,
        default=0,
        nullable=False,
        doc="Number of records that failed processing",
    )

    # Timestamps
    started_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        doc="Timestamp when the sync operation started",
    )
    completed_at = Column(
        DateTime,
        nullable=True,
        doc="Timestamp when the sync operation completed",
    )

    # Details
    error_details = Column(
        JSON,
        nullable=True,
        doc="Structured error information for failed syncs",
    )
    checkpoint_data = Column(
        JSON,
        nullable=True,
        doc="Serialized checkpoint state for recovery scenarios",
    )

    # Composite indexes
    __table_args__ = (
        Index(
            "ix_knowledge_cache_sync_log_adapter_time",
            "adapter_name",
            "started_at",
            doc="Query sync history per adapter, ordered by time",
        ),
        Index(
            "ix_knowledge_cache_sync_log_status",
            "status",
            "sync_type",
            doc="Filter sync logs by status and type",
        ),
        {
            "comment": (
                "Immutable audit log for all cache synchronization operations. "
                "Rows are INSERT-only; never updated or deleted."
            ),
        },
    )

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @validates("sync_type")
    def validate_sync_type(self, key: str, value: Optional[str]) -> Optional[str]:
        """Validate sync_type is one of the allowed values."""
        if value is not None:
            allowed = {"full", "incremental", "recovery"}
            if value not in allowed:
                raise ValueError(
                    f"Invalid sync_type '{value}'. Must be one of: {allowed}"
                )
        return value

    @validates("status")
    def validate_status(self, key: str, value: Optional[str]) -> Optional[str]:
        """Validate status is one of the allowed values."""
        if value is not None:
            allowed = {"success", "partial", "failed"}
            if value not in allowed:
                raise ValueError(
                    f"Invalid status '{value}'. Must be one of: {allowed}"
                )
        return value

    # ------------------------------------------------------------------
    # Computed properties
    # ------------------------------------------------------------------

    @property
    def duration_seconds(self) -> Optional[float]:
        """Return the sync duration in seconds.

        Returns:
            Float seconds, or None if the sync has not completed.
        """
        if self.completed_at is None or self.started_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()

    @property
    def success_rate(self) -> float:
        """Return the percentage of records successfully processed.

        Returns:
            Float percentage in [0.0, 100.0].
        """
        if self.records_processed == 0:
            return 100.0
        successful = self.records_inserted + self.records_updated
        return round((successful / self.records_processed) * 100, 2)

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        """Serialize this sync log entry to a dictionary.

        Returns:
            Dictionary representation of the sync log.
        """
        return {
            "id": self.id,
            "adapter_name": self.adapter_name,
            "sync_type": self.sync_type,
            "status": self.status,
            "records_processed": self.records_processed,
            "records_inserted": self.records_inserted,
            "records_updated": self.records_updated,
            "records_failed": self.records_failed,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": round(self.duration_seconds, 3) if self.duration_seconds is not None else None,
            "success_rate": self.success_rate,
            "error_details": self.error_details,
            "checkpoint_data": self.checkpoint_data,
        }

    # ------------------------------------------------------------------
    # Construction helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_etl_result(
        cls,
        adapter_name: str,
        etl_result: Dict[str, Any],
    ) -> "KnowledgeCacheSyncLog":
        """Create a KnowledgeCacheSyncLog from an ETL pipeline result.

        Args:
            adapter_name: Registry name of the adapter.
            etl_result: Dictionary produced by ETLResult.to_dict().

        Returns:
            A new KnowledgeCacheSyncLog instance (not yet persisted).
        """
        status = etl_result.get("status", "failed")
        return cls(
            adapter_name=adapter_name,
            sync_type="full",
            status=status,
            records_processed=etl_result.get("records_extracted", 0),
            records_inserted=etl_result.get("records_loaded", 0),
            records_updated=0,  # Incremental updates track this separately
            records_failed=etl_result.get("records_failed", 0),
            error_details={"errors": etl_result.get("errors", [])} if etl_result.get("errors") else None,
            checkpoint_data=None,
        )

    def mark_completed(self, status: Optional[str] = None) -> None:
        """Mark this sync log as completed.

        Args:
            status: Optional status override. Uses the current status if None.
        """
        self.completed_at = datetime.utcnow()
        if status:
            self.status = status

    def __repr__(self) -> str:
        return (
            f"<KnowledgeCacheSyncLog("
            f"id={self.id}, "
            f"adapter='{self.adapter_name}', "
            f"sync_type='{self.sync_type}', "
            f"status='{self.status}', "
            f"processed={self.records_processed})>"
        )


# ---------------------------------------------------------------------------
# 3. KnowledgeLicenseCompliance — license tracking
# ---------------------------------------------------------------------------


class KnowledgeLicenseCompliance(Base):
        """License compliance tracking table for all integrated databases.

        Maintains a snapshot of licensing terms for every external database
        integrated into the Knowledge Layer. This supports automated compliance
        reporting, attribution generation, and governance audits.

        Attributes:
            id: Surrogate primary key.
            database_name: Canonical name of the external database.
            license_type: SPDX identifier or custom license label.
            allows_research: Whether research use is permitted.
            allows_commercial: Whether commercial use is permitted.
            requires_attribution: Whether attribution is mandatory.
            attribution_text: Human-readable attribution string.
            last_verified: When the license was last verified.
            verification_status: Compliance status (compliant, review_needed, violated).
            restrictions: Additional license restrictions as JSON list.
        """

        __tablename__ = "knowledge_license_compliance"

        id = Column(Integer, primary_key=True, autoincrement=True)

        database_name = Column(
            String(100),
            nullable=False,
            unique=True,
            doc="Canonical name of the external database (e.g., 'PubMed')",
        )
        license_type = Column(
            String(50),
            nullable=False,
            doc="License identifier (e.g., 'CC-BY-SA-4.0', 'PUBLIC_DOMAIN')",
        )
        allows_research = Column(
            Boolean,
            default=True,
            nullable=False,
            doc="Whether research use is allowed under the license",
        )
        allows_commercial = Column(
            Boolean,
            default=False,
            nullable=False,
            doc="Whether commercial use is allowed under the license",
        )
        requires_attribution = Column(
            Boolean,
            default=True,
            nullable=False,
            doc="Whether the license mandates attribution",
        )
        attribution_text = Column(
            Text,
            nullable=True,
            doc="Exact text that must be displayed for attribution",
        )
        last_verified = Column(
            DateTime,
            default=datetime.utcnow,
            nullable=False,
            doc="When the license terms were last verified against the source",
        )
        verification_status = Column(
            String(20),
            default="compliant",
            nullable=False,
            doc="Compliance status: compliant, review_needed, or violated",
        )
        restrictions = Column(
            JSON,
            nullable=True,
            doc="List of additional restrictions as strings",
        )

        # Composite indexes
        __table_args__ = (
            Index(
                "ix_knowledge_license_verification",
                "verification_status",
                "last_verified",
                doc="Find licenses needing re-verification",
            ),
            {
                "comment": (
                    "License compliance snapshot for all integrated databases. "
                    "Updated periodically by a background compliance checker."
                ),
            },
        )

        # ------------------------------------------------------------------
        # Validators
        # ------------------------------------------------------------------

        @validates("verification_status")
        def validate_verification_status(self, key: str, value: str) -> str:
            """Validate verification_status is one of the allowed values."""
            allowed = {"compliant", "review_needed", "violated"}
            if value not in allowed:
                raise ValueError(
                    f"Invalid verification_status '{value}'. Must be one of: {allowed}"
                )
            return value

        # ------------------------------------------------------------------
        # Computed properties
        # ------------------------------------------------------------------

        @property
        def days_since_verified(self) -> int:
            """Return the number of days since the license was last verified.

            Returns:
                Integer days since last_verified.
            """
            if self.last_verified is None:
                return 9999
            return (datetime.utcnow() - self.last_verified).days

        @property
        def needs_reverification(self) -> bool:
            """Return True if the license should be re-verified.

            Licenses should be re-verified every 90 days or immediately
            if the status is 'review_needed'.

            Returns:
                Boolean indicating whether re-verification is needed.
            """
            if self.verification_status == "review_needed":
                return True
            return self.days_since_verified > 90

        # ------------------------------------------------------------------
        # Attribution generation
        # ------------------------------------------------------------------

        def generate_attribution(self, record_count: int = 1) -> str:
            """Generate a formatted attribution string for this database.

            Args:
                record_count: Number of records being attributed.

            Returns:
                Formatted attribution text ready for display.
            """
            if self.attribution_text:
                base = self.attribution_text
            else:
                base = f"Data sourced from {self.database_name}"

            if self.license_type and self.license_type != "unknown":
                base += f" under {self.license_type}"

            if record_count > 1:
                base += f" ({record_count} records)"

            return base

        # ------------------------------------------------------------------
        # Serialization
        # ------------------------------------------------------------------

        def to_dict(self) -> Dict[str, Any]:
            """Serialize this license compliance record to a dictionary.

            Returns:
                Dictionary representation of the license compliance entry.
            """
            return {
                "id": self.id,
                "database_name": self.database_name,
                "license_type": self.license_type,
                "allows_research": self.allows_research,
                "allows_commercial": self.allows_commercial,
                "requires_attribution": self.requires_attribution,
                "attribution_text": self.attribution_text,
                "last_verified": self.last_verified.isoformat() if self.last_verified else None,
                "verification_status": self.verification_status,
                "days_since_verified": self.days_since_verified,
                "needs_reverification": self.needs_reverification,
                "restrictions": self.restrictions or [],
            }

        # ------------------------------------------------------------------
        # Construction helpers
        # ------------------------------------------------------------------

        @classmethod
        def from_license_metadata(
            cls,
            database_name: str,
            license_meta: "LicenseMetadata",
        ) -> "KnowledgeLicenseCompliance":
            """Create a KnowledgeLicenseCompliance from LicenseMetadata.

            Args:
                database_name: Canonical database name.
                license_meta: LicenseMetadata instance from an adapter.

            Returns:
                A new KnowledgeLicenseCompliance instance (not yet persisted).
            """
            return cls(
                database_name=database_name,
                license_type=license_meta.license_type,
                allows_research=license_meta.allows_research,
                allows_commercial=license_meta.allows_commercial,
                requires_attribution=license_meta.requires_attribution,
                attribution_text=license_meta.attribution_text,
                last_verified=license_meta.last_verified,
                verification_status="compliant",
                restrictions=license_meta.restrictions or [],
            )

        @classmethod
        def from_adapter(
            cls,
            adapter: "DatabaseAdapter",
        ) -> "KnowledgeLicenseCompliance":
            """Create a KnowledgeLicenseCompliance by querying an adapter.

            Args:
                adapter: A DatabaseAdapter instance.

            Returns:
                A new KnowledgeLicenseCompliance instance (not yet persisted).
            """
            license_meta = adapter.get_license()
            return cls.from_license_metadata(adapter.source_name, license_meta)

        def __repr__(self) -> str:
            return (
                f"<KnowledgeLicenseCompliance("
                f"id={self.id}, "
                f"database='{self.database_name}', "
                f"license='{self.license_type}', "
                f"status='{self.verification_status}')>"
            )


# ---------------------------------------------------------------------------
# 4. KnowledgeCacheHitLog — optional fine-grained access logging
# ---------------------------------------------------------------------------


class KnowledgeCacheHitLog(Base):
    """Fine-grained access log for cache entry reads.

    Tracks every read access to the knowledge cache, enabling analytics
    on data popularity, cache effectiveness, and usage patterns. This table
    grows quickly and should be managed with a retention policy (e.g.,
    partition by month and archive old partitions).

    Attributes:
        id: Surrogate primary key.
        cache_entry_id: Foreign key to knowledge_cache.id.
        adapter_name: Denormalized adapter name for fast filtering.
        accessed_at: Timestamp of the access.
        query_params: The query parameters that led to this cache hit (JSON).
        client_context: Optional client identifier or session info.
    """

    __tablename__ = "knowledge_cache_hit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)

    cache_entry_id = Column(
        Integer,
        nullable=False,
        index=True,
        doc="Reference to the knowledge_cache entry that was accessed",
    )
    adapter_name = Column(
        String(100),
        nullable=False,
        index=True,
        doc="Denormalized adapter name for fast analytics queries",
    )
    accessed_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
        doc="Timestamp when the cache entry was accessed",
    )
    query_params = Column(
        JSON,
        nullable=True,
        doc="Query parameters that resulted in this cache hit",
    )
    client_context = Column(
        String(255),
        nullable=True,
        doc="Optional client identifier, session ID, or request trace",
    )

    __table_args__ = (
        Index(
            "ix_knowledge_cache_hit_log_adapter_time",
            "adapter_name",
            "accessed_at",
            doc="Time-series access analytics per adapter",
        ),
        {
            "comment": (
                "High-volume access log for cache analytics. "
                "Implement partitioning and retention policies in production."
            ),
        },
    )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize this hit log entry to a dictionary."""
        return {
            "id": self.id,
            "cache_entry_id": self.cache_entry_id,
            "adapter_name": self.adapter_name,
            "accessed_at": self.accessed_at.isoformat() if self.accessed_at else None,
            "query_params": self.query_params,
            "client_context": self.client_context,
        }

    def __repr__(self) -> str:
        return (
            f"<KnowledgeCacheHitLog("
            f"id={self.id}, "
            f"entry_id={self.cache_entry_id}, "
            f"adapter='{self.adapter_name}', "
            f"at='{self.accessed_at}')>"
        )


# ---------------------------------------------------------------------------
# SQLAlchemy event listeners
# ---------------------------------------------------------------------------


@event.listens_for(KnowledgeCacheEntry, "before_insert")
def _cache_entry_before_insert(mapper, connection, target: KnowledgeCacheEntry) -> None:
    """Auto-compute data_hash before insert if not already set."""
    if target.data_hash is None and target.canonical_data is not None:
        target.data_hash = _compute_sha256(target.canonical_data)
        logger.debug("Auto-computed data_hash for new cache entry")


@event.listens_for(KnowledgeCacheEntry, "before_update")
def _cache_entry_before_update(mapper, connection, target: KnowledgeCacheEntry) -> None:
    """Recompute data_hash before update if canonical_data changed."""
    state = inspect(target)
    hist = state.get_history("canonical_data", True)
    if hist.has_changes():
        target.data_hash = _compute_sha256(target.canonical_data)
        logger.debug("Recomputed data_hash after canonical_data update")


# ---------------------------------------------------------------------------
# Model registration helper
# ---------------------------------------------------------------------------


def get_all_knowledge_models() -> List[type]:
    """Return all Knowledge Layer SQLAlchemy model classes.

    This helper is used by Alembic and schema management tools to
    automatically discover all models for migration generation.

    Returns:
        List of model classes.
    """
    return [
        KnowledgeCacheEntry,
        KnowledgeCacheSyncLog,
        KnowledgeLicenseCompliance,
        KnowledgeCacheHitLog,
    ]


def get_knowledge_metadata() -> Dict[str, Any]:
    """Return aggregated metadata about the knowledge models.

    Returns:
        Dictionary with table names, column counts, and index information.
    """
    models = get_all_knowledge_models()
    return {
        "tables": [model.__tablename__ for model in models],
        "total_tables": len(models),
        "models": {
            model.__name__: {
                "table": model.__tablename__,
                "columns": len(model.__table__.columns),
                "indexes": len(model.__table__.indexes),
                "constraints": len(model.__table__.constraints),
            }
            for model in models
        },
    }
