# DeepSynaps Database Adapter Architecture

> **Version:** 1.0.0
> **Last Updated:** 2025-01-20
> **Owner:** Research Engineering Team
> **Status:** Architecture Specification
> **Coverage:** 73 databases across 14 clinical domains

---

## 1. Executive Summary

The DeepSynaps Database Adapter Architecture defines a unified, isolated, versioned, and auditable integration layer that connects 73 external clinical databases to the DeepSynaps platform. Every external database receives a dedicated adapter implementing the `DatabaseAdapter` abstract base class, ensuring consistent query semantics, provenance tracking, license compliance, and schema mapping across all data sources.

**Key Principles:**

| Principle | Description |
|-----------|-------------|
| **Isolation** | Each adapter runs in its own execution context with independent rate limits, cache TTLs, and error boundaries |
| **Versioning** | Adapters are versioned independently; schema mappings are pinned to source versions |
| **Auditability** | Every query, transform, and load operation is logged with full provenance |
| **Resilience** | Automatic fallback to stale cached data when external sources are unavailable |
| **Compliance** | License attribution and usage constraints are enforced at the adapter boundary |

**Adapter Inventory:**

| Tier | Count | Status |
|------|-------|--------|
| Active Adapters (already integrated) | 13 | Production-ready |
| Critical Priority Adapters | 20 | Blocking features |
| High Priority Adapters | 20 | Major capabilities |
| Medium Priority Adapters | 20 | Enhanced features |
| **Total** | **73** | **Roadmap: 17 weeks** |

---

## 2. Core Data Models

### 2.1 CanonicalRecord

Every record returned by any adapter is normalized into a `CanonicalRecord` -- the universal data container used across DeepSynaps.

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from enum import Enum

class RecordDomain(str, Enum):
    """Clinical domain classification for all canonical records."""
    MEDICATION = "medication"
    PHARMACOGENOMICS = "pharmacogenomics"
    NEUROIMAGING = "neuroimaging"
    EEG = "eeg"
    EVIDENCE = "evidence"
    TERMINOLOGY = "terminology"
    BIOMARKER = "biomarker"
    NUTRITION = "nutrition"
    OUTCOME_MEASURE = "outcome_measure"
    WEARABLE = "wearable"
    SAFETY = "safety"
    GENETICS = "genetics"
    POPULATION_HEALTH = "population_health"

@dataclass
class CanonicalRecord:
    """
    Universal record container for all DeepSynaps database queries.
    Every adapter normalizes its output into this structure.
    """
    # Identity
    record_id: str                          # Globally unique record ID
    source_name: str                        # Originating adapter (e.g., "PharmGKB")
    source_version: str                     # Source data version (e.g., "2024-12-01")
    source_record_id: str                   # Original ID at the source database

    # Domain classification
    domain: RecordDomain                    # Clinical domain
    record_type: str                        # Entity type (e.g., "gene_drug_annotation")

    # Payload
    data: Dict[str, Any] = field(default_factory=dict)
                                            # Canonical-schema-mapped data

    # Provenance
    provenance: "ProvenanceRecord" = field(default=None)
    extracted_at: Optional[datetime] = None # When data was extracted
    transformed_at: Optional[datetime] = None
                                            # When data was transformed

    # Quality
    confidence: "ConfidenceScore" = field(default=None)
    validation_errors: List[str] = field(default_factory=list)
                                            # Schema validation failures

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for caching and API responses."""
        return {
            "record_id": self.record_id,
            "source_name": self.source_name,
            "source_version": self.source_version,
            "source_record_id": self.source_record_id,
            "domain": self.domain.value,
            "record_type": self.record_type,
            "data": self.data,
            "provenance": self.provenance.to_dict() if self.provenance else None,
            "extracted_at": self.extracted_at.isoformat() if self.extracted_at else None,
            "transformed_at": self.transformed_at.isoformat() if self.transformed_at else None,
            "confidence": self.confidence.to_dict() if self.confidence else None,
            "validation_errors": self.validation_errors,
        }
```

### 2.2 ProvenanceRecord

Every record carries a complete provenance chain tracing its origin, transformations, and the confidence assigned at each step.

```python
@dataclass
class ProvenanceRecord:
    """
    Full data lineage for any record returned by the adapter layer.
    Tracks the complete journey from external source to canonical result.
    """
    # Source identification
    source_name: str                        # "PharmGKB", "ClinVar", "PubMed"
    source_url: Optional[str] = None        # API endpoint or file URL
    source_version: str = "unknown"         # Data version at source
    source_access_date: Optional[datetime] = None
                                            # When the source was accessed

    # Extraction details
    extraction_method: str = "api"          # "api", "file_download", "ftp", "graphql"
    extraction_query: Optional[str] = None  # The query sent to the source
    extraction_status: str = "success"      # "success", "partial", "failed"

    # Transform chain
    transformations: List["TransformStep"] = field(default_factory=list)
                                            # Ordered list of transformations applied

    # Licensing
    license_type: str = "unknown"           # "CC-BY-SA-4.0", "public_domain"
    license_url: Optional[str] = None       # URL to full license text
    attribution_text: Optional[str] = None  # Required attribution string

    # Chain of custody
    previous_provenance: Optional["ProvenanceRecord"] = None
                                            # Links to upstream provenance if data
                                            # was derived from multiple sources

    # Verification
    checksum_source: Optional[str] = None   # SHA-256 of raw source data
    checksum_canonical: Optional[str] = None
                                            # SHA-256 of canonical representation

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_name": self.source_name,
            "source_url": self.source_url,
            "source_version": self.source_version,
            "source_access_date": self.source_access_date.isoformat() if self.source_access_date else None,
            "extraction_method": self.extraction_method,
            "extraction_query": self.extraction_query,
            "extraction_status": self.extraction_status,
            "transformations": [t.to_dict() for t in self.transformations],
            "license_type": self.license_type,
            "license_url": self.license_url,
            "attribution_text": self.attribution_text,
            "checksum_source": self.checksum_source,
            "checksum_canonical": self.checksum_canonical,
        }

@dataclass
class TransformStep:
    """A single transformation applied during the ETL pipeline."""
    step_name: str                          # "schema_map", "evidence_level_convert"
    step_order: int                         # 0-based position in pipeline
    input_schema: Optional[str] = None      # Schema version before transform
    output_schema: Optional[str] = None     # Schema version after transform
    transform_description: str = ""         # Human-readable description
    parameters: Dict[str, Any] = field(default_factory=dict)
                                            # Transform-specific parameters

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_name": self.step_name,
            "step_order": self.step_order,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "transform_description": self.transform_description,
            "parameters": self.parameters,
        }
```

### 2.3 ConfidenceScore

Confidence is computed per-field and rolled up to a record-level score using configurable rules.

```python
@dataclass
class ConfidenceScore:
    """
    Structured confidence scoring for canonical records.
    Combines source evidence level, data freshness, and transform fidelity.
    """
    # Overall score: 0.0 - 1.0
    overall: float = 0.0

    # Component scores
    source_reliability: float = 0.0         # Source database reputation (0-1)
    evidence_strength: float = 0.0          # Evidence level (A=1.0, B=0.75, C=0.5, D=0.25)
    data_freshness: float = 0.0             # 1.0 = fresh, 0.0 = max_staleness exceeded
    transform_fidelity: float = 1.0         # 1.0 = lossless, <1.0 = data loss in mapping

    # Per-field confidence
    field_scores: Dict[str, float] = field(default_factory=dict)

    # Reasoning
    score_reasoning: str = ""               # Human-readable confidence explanation

    def to_dict(self) -> Dict[str, Any]:
        return {
            "overall": self.overall,
            "source_reliability": self.source_reliability,
            "evidence_strength": self.evidence_strength,
            "data_freshness": self.data_freshness,
            "transform_fidelity": self.transform_fidelity,
            "field_scores": self.field_scores,
            "score_reasoning": self.score_reasoning,
        }
```

### 2.4 CanonicalQuery

The unified query language used by all consumers of the adapter layer.

```python
@dataclass
class CanonicalQuery:
    """
    Universal query object sent to any DatabaseAdapter.
    Adapters translate this into source-specific query syntax.
    """
    # Query targets
    domains: List[RecordDomain] = field(default_factory=list)
                                            # Which domains to search
    record_types: List[str] = field(default_factory=list)
                                            # Entity type filters

    # Search parameters
    search_terms: Dict[str, Any] = field(default_factory=dict)
                                            # Field-value pairs (e.g., {"gene": "CYP2D6"})
    full_text_query: Optional[str] = None   # Free-text search string

    # Filters
    filters: List["QueryFilter"] = field(default_factory=list)
                                            # Structured filter conditions
    evidence_min_grade: Optional[str] = None
                                            # Minimum evidence grade ("A", "B", "C", "D")
    date_range: Optional[tuple] = None      # (start_date, end_date)

    # Pagination
    limit: int = 50                         # Max records to return
    offset: int = 0                         # Pagination offset

    # Routing hints
    source_preference: List[str] = field(default_factory=list)
                                            # Preferred adapter names
    source_exclusion: List[str] = field(default_factory=list)
                                            # Adapters to exclude

    # Cache behavior
    use_cache: bool = True                  # Allow cached responses
    cache_ttl_override: Optional[int] = None
                                            # Override default cache TTL (seconds)
    require_fresh: bool = False             # If True, bypass cache entirely

    def to_dict(self) -> Dict[str, Any]:
        return {
            "domains": [d.value for d in self.domains],
            "record_types": self.record_types,
            "search_terms": self.search_terms,
            "full_text_query": self.full_text_query,
            "filters": [f.to_dict() for f in self.filters],
            "evidence_min_grade": self.evidence_min_grade,
            "date_range": self.date_range,
            "limit": self.limit,
            "offset": self.offset,
            "source_preference": self.source_preference,
            "source_exclusion": self.source_exclusion,
            "use_cache": self.use_cache,
            "cache_ttl_override": self.cache_ttl_override,
            "require_fresh": self.require_fresh,
        }

@dataclass
class QueryFilter:
    """A structured filter condition for canonical queries."""
    field: str                              # Canonical field name
    operator: str                           # "eq", "ne", "gt", "lt", "in", "contains"
    value: Any                              # Filter value

    def to_dict(self) -> Dict[str, Any]:
        return {"field": self.field, "operator": self.operator, "value": self.value}
```

### 2.5 AdapterResult

The standardized response wrapper returned by every adapter query.

```python
@dataclass
class AdapterResult:
    """
    Standardized response from any DatabaseAdapter.query() call.
    Contains records, metadata, provenance, and error information.
    """
    # Results
    records: List[CanonicalRecord] = field(default_factory=list)
    total_available: int = 0                # Total matching records at source

    # Performance
    source_latency_ms: float = 0.0          # Round-trip time to external source
    total_latency_ms: float = 0.0           # Total time including transforms
    cached: bool = False                    # Response came from cache
    cache_hit: bool = False                 # Cache was hit (True = no external call)

    # Provenance & compliance
    provenance: ProvenanceRecord = field(default=None)
    license: str = ""                       # License for all returned records
    attribution_required: bool = False      # Whether attribution must be displayed
    attribution_text: str = ""              # Required attribution string

    # Quality
    confidence: ConfidenceScore = field(default=None)

    # Errors (non-fatal; partial results may still be present)
    errors: List["AdapterError"] = field(default_factory=list)

    # Source metadata
    adapter_version: str = ""               # Adapter code version
    source_version: str = ""                # Data version at source

    def is_success(self) -> bool:
        """True if result contains at least one record and no critical errors."""
        return len(self.records) > 0 and not any(
            e.severity == "critical" for e in self.errors
        )

    def is_partial(self) -> bool:
        """True if some records were returned but errors occurred."""
        return len(self.records) > 0 and len(self.errors) > 0

    def is_empty(self) -> bool:
        """True if no records were returned."""
        return len(self.records) == 0

    def is_fallback(self) -> bool:
        """True if result came from stale cache due to source failure."""
        return self.cached and any(
            e.error_code == "SOURCE_UNAVAILABLE" for e in self.errors
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "records": [r.to_dict() for r in self.records],
            "total_available": self.total_available,
            "source_latency_ms": self.source_latency_ms,
            "total_latency_ms": self.total_latency_ms,
            "cached": self.cached,
            "cache_hit": self.cache_hit,
            "provenance": self.provenance.to_dict() if self.provenance else None,
            "license": self.license,
            "attribution_required": self.attribution_required,
            "attribution_text": self.attribution_text,
            "confidence": self.confidence.to_dict() if self.confidence else None,
            "errors": [e.to_dict() for e in self.errors],
            "adapter_version": self.adapter_version,
            "source_version": self.source_version,
        }

@dataclass
class AdapterError:
    """Structured error information from adapter operations."""
    error_code: str                         # "SOURCE_UNAVAILABLE", "RATE_LIMITED",
                                            # "SCHEMA_MISMATCH", "VALIDATION_FAILED",
                                            # "TIMEOUT", "LICENSE_VIOLATION"
    severity: str                           # "warning", "error", "critical"
    message: str                            # Human-readable description
    source_name: str = ""                   # Which adapter raised the error
    field_name: Optional[str] = None        # Field involved (for schema/validation errors)
    retryable: bool = False                 # Whether the operation can be retried
    retry_after_seconds: Optional[int] = None
                                            # For rate-limit errors: when to retry

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_code": self.error_code,
            "severity": self.severity,
            "message": self.message,
            "source_name": self.source_name,
            "field_name": self.field_name,
            "retryable": self.retryable,
            "retry_after_seconds": self.retry_after_seconds,
        }
```

### 2.6 AdapterHealth

Health status reporting for monitoring and alerting.

```python
@dataclass
class AdapterHealth:
    """Health status for a single database adapter."""
    source_name: str
    adapter_version: str
    source_version: str
    status: str                             # "healthy", "degraded", "unavailable", "unknown"
    last_successful_query: Optional[datetime] = None
    last_failed_query: Optional[datetime] = None
    consecutive_failures: int = 0
    average_latency_ms: float = 0.0
    cache_hit_rate: float = 0.0
    records_in_cache: int = 0
    error_rate_24h: float = 0.0             # Percentage of errors in last 24 hours
    license_status: str = "valid"           # "valid", "expired", "unknown"
    next_scheduled_update: Optional[datetime] = None

    def is_healthy(self) -> bool:
        return self.status == "healthy"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_name": self.source_name,
            "adapter_version": self.adapter_version,
            "source_version": self.source_version,
            "status": self.status,
            "last_successful_query": self.last_successful_query.isoformat() if self.last_successful_query else None,
            "last_failed_query": self.last_failed_query.isoformat() if self.last_failed_query else None,
            "consecutive_failures": self.consecutive_failures,
            "average_latency_ms": self.average_latency_ms,
            "cache_hit_rate": self.cache_hit_rate,
            "records_in_cache": self.records_in_cache,
            "error_rate_24h": self.error_rate_24h,
            "license_status": self.license_status,
            "next_scheduled_update": self.next_scheduled_update.isoformat() if self.next_scheduled_update else None,
        }
```


## 3. Schema Mapping System

### 3.1 Schema Mapping Core Classes

Every adapter declares explicit, auditable mappings between its source schema and the DeepSynaps canonical schema.

```python
@dataclass
class FieldDefinition:
    """Defines a single field in either source or canonical schema."""
    field_name: str
    field_type: str                       # "string", "integer", "float", "boolean",
                                          # "text", "enum", "date", "datetime", "json",
                                          # "array_string", "array_integer"
    nullable: bool = True
    description: str = ""
    enum_values: Optional[List[str]] = None
                                          # Valid values for enum fields
    max_length: Optional[int] = None      # For string fields
    precision: Optional[int] = None       # For numeric fields
    units: Optional[str] = None           # Physical units (e.g., "mg", "mm")
    references: Optional[str] = None      # Link to external standard (e.g., "LOINC:1234-5")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field_name": self.field_name,
            "field_type": self.field_type,
            "nullable": self.nullable,
            "description": self.description,
            "enum_values": self.enum_values,
            "max_length": self.max_length,
            "precision": self.precision,
            "units": self.units,
            "references": self.references,
        }

@dataclass
class FieldMapping:
    """Maps one source field to one canonical field."""
    source_field: str                     # Dot-notation path: "gene.symbol"
    canonical_field: str                  # Canonical field name: "gene"
    required: bool = False                # If True, missing source field = error
    default_value: Any = None             # Value to use when source is null
    condition: Optional[str] = None       # Conditional mapping expression

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_field": self.source_field,
            "canonical_field": self.canonical_field,
            "required": self.required,
            "default_value": self.default_value,
            "condition": self.condition,
        }

@dataclass
class FieldTransformation:
    """
    Defines a value transformation applied during schema mapping.
    Transformations are pure functions: f(source_value) -> canonical_value.
    """
    source_field: str                     # Input field name
    target_field: str                     # Output field name
    transform_name: str                   # Human-readable transform identifier
    transform_description: str = ""       # Documentation
    parameters: Dict[str, Any] = field(default_factory=dict)
                                          # Transform-specific config

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_field": self.source_field,
            "target_field": self.target_field,
            "transform_name": self.transform_name,
            "transform_description": self.transform_description,
            "parameters": self.parameters,
        }

@dataclass
class ConfidenceRule:
    """
    Maps source evidence levels to canonical confidence scores.
    Each rule defines how a source value translates to a confidence grade.
    """
    field_name: str                       # Canonical field this rule applies to
    mappings: Dict[str, tuple] = field(default_factory=dict)
                                          # source_value -> (canonical_value, confidence_score, reasoning)
    default_confidence: float = 0.5       # Confidence when no mapping matches
    default_reasoning: str = "No specific evidence level mapping found"

    def evaluate(self, source_value: str) -> tuple:
        """Returns (canonical_value, confidence_score, reasoning) for a source value."""
        if source_value in self.mappings:
            return self.mappings[source_value]
        return (source_value, self.default_confidence, self.default_reasoning)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field_name": self.field_name,
            "mappings": {k: list(v) for k, v in self.mappings.items()},
            "default_confidence": self.default_confidence,
            "default_reasoning": self.default_reasoning,
        }

@dataclass
class SchemaMapping:
    """
    Complete schema mapping specification for a database adapter.
    Maps external database fields to DeepSynaps canonical schema.
    """
    # Schema definitions
    source_schema: Dict[str, FieldDefinition] = field(default_factory=dict)
                                          # External fields with metadata
    canonical_schema: Dict[str, FieldDefinition] = field(default_factory=dict)
                                          # DeepSynaps fields with metadata

    # Mappings
    mappings: List[FieldMapping] = field(default_factory=list)
                                          # Source -> Canonical field mappings
    transformations: List[FieldTransformation] = field(default_factory=list)
                                          # Value transforms
    confidence_rules: Dict[str, ConfidenceRule] = field(default_factory=dict)
                                          # Per-field confidence scoring

    # Metadata
    mapping_version: str = "1.0.0"        # Version of this mapping spec
    source_schema_version: str = ""       # Version of source schema being mapped
    canonical_schema_version: str = "1.0.0"
                                          # Version of canonical schema target
    created_at: Optional[datetime] = None
    created_by: str = ""

    def validate(self) -> List[AdapterError]:
        """
        Validate the schema mapping for consistency.
        Returns list of errors; empty list means mapping is valid.
        """
        errors = []
        canonical_fields = set(self.canonical_schema.keys())

        # Check all mappings reference valid fields
        for mapping in self.mappings:
            if mapping.source_field not in self.source_schema:
                errors.append(AdapterError(
                    error_code="SCHEMA_MISMATCH",
                    severity="error",
                    message=f"Mapping references unknown source field: {mapping.source_field}",
                    field_name=mapping.source_field,
                ))
            if mapping.canonical_field not in canonical_fields:
                errors.append(AdapterError(
                    error_code="SCHEMA_MISMATCH",
                    severity="error",
                    message=f"Mapping references unknown canonical field: {mapping.canonical_field}",
                    field_name=mapping.canonical_field,
                ))

        # Check all canonical required fields are mapped
        for field_name, field_def in self.canonical_schema.items():
            if not field_def.nullable:
                mapped = any(m.canonical_field == field_name for m in self.mappings)
                if not mapped:
                    errors.append(AdapterError(
                        error_code="SCHEMA_MISMATCH",
                        severity="critical",
                        message=f"Required canonical field '{field_name}' has no source mapping",
                        field_name=field_name,
                    ))

        return errors

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mapping_version": self.mapping_version,
            "source_schema_version": self.source_schema_version,
            "canonical_schema_version": self.canonical_schema_version,
            "source_schema": {k: v.to_dict() for k, v in self.source_schema.items()},
            "canonical_schema": {k: v.to_dict() for k, v in self.canonical_schema.items()},
            "mappings": [m.to_dict() for m in self.mappings],
            "transformations": [t.to_dict() for t in self.transformations],
            "confidence_rules": {k: v.to_dict() for k, v in self.confidence_rules.items()},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": self.created_by,
        }
```

---

## 4. Adapter Interface

### 4.1 DatabaseAdapter Abstract Base Class

Every external database adapter implements this interface. The base class enforces consistent behavior across all 73 adapters.

```python
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any
import hashlib
import json

class DatabaseAdapter(ABC):
    """
    Base interface for all external database adapters in DeepSynaps.

    Every adapter MUST implement all abstract methods and properties.
    Adapters are versioned independently and isolated from each other.
    """

    # --- Metadata Properties (must be overridden) ---

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Human-readable source name: 'PharmGKB', 'ClinVar', 'PubMed'."""
        ...

    @property
    @abstractmethod
    def source_version(self) -> str:
        """Current data version at source: '2024-12-01', 'GRCh38.p14'."""
        ...

    @property
    @abstractmethod
    def adapter_version(self) -> str:
        """Version of this adapter implementation: '1.0.0', '2.1.3'."""
        ...

    @property
    @abstractmethod
    def license(self) -> str:
        """License for data from this source: 'CC-BY-NC-SA-4.0', 'public_domain'."""
        ...

    @property
    @abstractmethod
    def license_url(self) -> Optional[str]:
        """URL to full license text."""
        ...

    @property
    @abstractmethod
    def attribution_required(self) -> bool:
        """Whether data from this source requires attribution on display."""
        ...

    @property
    @abstractmethod
    def attribution_text(self) -> str:
        """Required attribution string when displaying data from this source."""
        ...

    @property
    @abstractmethod
    def update_cadence(self) -> str:
        """Expected update frequency: 'daily', 'weekly', 'monthly', 'quarterly', 'annual'."""
        ...

    @property
    @abstractmethod
    def domains(self) -> List[RecordDomain]:
        """Clinical domains this adapter covers."""
        ...

    @property
    @abstractmethod
    def rate_limit(self) -> "RateLimitConfig":
        """Rate limiting configuration for this source."""
        ...

    @property
    @abstractmethod
    def cache_ttl(self) -> int:
        """Default cache TTL in seconds for this adapter's data."""
        ...

    @property
    @abstractmethod
    def update_strategy(self) -> "UpdateStrategy":
        """How this adapter's data is kept current."""
        ...

    @property
    @abstractmethod
    def max_staleness_hours(self) -> int:
        """Maximum acceptable data age in hours before fallback is triggered."""
        ...

    # --- Core Query Methods ---

    @abstractmethod
    async def query(self, query: CanonicalQuery) -> AdapterResult:
        """
        Execute a canonical query against this data source.

        Implementation contract:
        1. Validate query against supported domains/record_types
        2. Check cache (respect query.use_cache and query.cache_ttl_override)
        3. Translate CanonicalQuery to source-specific query syntax
        4. Execute with rate limiting and retry logic
        5. Transform source response to CanonicalRecord(s)
        6. Compute provenance and confidence scores
        7. Store in cache
        8. Return AdapterResult

        All errors MUST be non-fatal; return partial results with errors populated.
        """
        ...

    @abstractmethod
    async def get_by_id(self, record_id: str) -> Optional[CanonicalRecord]:
        """Retrieve a single record by its source-specific ID."""
        ...

    @abstractmethod
    async def health_check(self) -> AdapterHealth:
        """
        Perform a lightweight health check against the external source.
        Should complete in < 5 seconds and not consume rate limit budget.
        """
        ...

    @abstractmethod
    async def get_provenance(self, record_id: str) -> Optional[ProvenanceRecord]:
        """Retrieve full provenance for a specific record."""
        ...

    @abstractmethod
    def schema_mapping(self) -> SchemaMapping:
        """
        Return the complete schema mapping specification for this adapter.
        This is a static definition -- it does not call the external source.
        """
        ...

    # --- Lifecycle Methods ---

    @abstractmethod
    async def initialize(self) -> None:
        """
        One-time setup: load credentials, validate connectivity,
        warm cache, register with AdapterRegistry.
        Called before any query operations.
        """
        ...

    @abstractmethod
    async def shutdown(self) -> None:
        """Graceful shutdown: close connections, flush caches, cleanup."""
        ...

    @abstractmethod
    async def refresh_cache(self, force: bool = False) -> "RefreshResult":
        """
        Trigger a cache refresh for this adapter.

        Args:
            force: If True, refresh even if cache is not stale.
        """
        ...

    # --- Utility Methods (concrete implementations) ---

    def get_attribution(self) -> str:
        """Generate attribution text for data from this source."""
        if self.attribution_required:
            return f"{self.attribution_text} | Source: {self.source_name} v{self.source_version} | License: {self.license}"
        return f"Source: {self.source_name} v{self.source_version}"

    def compute_record_hash(self, record: CanonicalRecord) -> str:
        """Compute SHA-256 checksum of a canonical record."""
        canonical_json = json.dumps(record.to_dict(), sort_keys=True, default=str)
        return hashlib.sha256(canonical_json.encode()).hexdigest()

    def supports_domain(self, domain: RecordDomain) -> bool:
        """Check if this adapter supports a given clinical domain."""
        return domain in self.domains

    def _build_provenance(
        self,
        extraction_method: str,
        extraction_query: Optional[str],
        checksum_source: Optional[str] = None,
        checksum_canonical: Optional[str] = None,
    ) -> ProvenanceRecord:
        """Helper to construct a ProvenanceRecord for this adapter."""
        return ProvenanceRecord(
            source_name=self.source_name,
            source_version=self.source_version,
            source_access_date=datetime.utcnow(),
            extraction_method=extraction_method,
            extraction_query=extraction_query,
            license_type=self.license,
            license_url=self.license_url,
            attribution_text=self.attribution_text if self.attribution_required else None,
            checksum_source=checksum_source,
            checksum_canonical=checksum_canonical,
        )
```

### 4.2 Rate Limit Configuration

```python
@dataclass
class RateLimitConfig:
    """Rate limiting configuration per external database."""
    requests_per_second: float = 10.0       # Max sustained requests per second
    burst_size: int = 20                    # Max burst before throttling
    requests_per_minute: Optional[int] = None
                                          # Per-minute limit (if source specifies)
    requests_per_day: Optional[int] = None  # Per-day limit (if source specifies)
    daily_quota_reset_hour: int = 0         # Hour of day when daily quota resets (UTC)
    retry_after_header: bool = True         # Whether to respect Retry-After header
    jitter: bool = True                     # Add random jitter to retry delays

    def to_dict(self) -> Dict[str, Any]:
        return {
            "requests_per_second": self.requests_per_second,
            "burst_size": self.burst_size,
            "requests_per_minute": self.requests_per_minute,
            "requests_per_day": self.requests_per_day,
            "daily_quota_reset_hour": self.daily_quota_reset_hour,
            "retry_after_header": self.retry_after_header,
            "jitter": self.jitter,
        }
```

### 4.3 Update Strategy

```python
@dataclass
class UpdateStrategy:
    """How each database is kept current."""
    full_refresh: bool = False              # True = replace all data on update
    incremental: bool = True                # True = only update changes
    delta_field: str = "updated_at"         # Field to track changes
    frequency: str = "weekly"               # "daily", "weekly", "monthly", "quarterly"
    fallback_on_error: bool = True          # Use stale data if update fails
    max_staleness_hours: int = 168          # Maximum acceptable staleness (7 days default)
    retry_failed_updates: bool = True       # Retry failed updates on next cycle
    max_retry_attempts: int = 3             # Max consecutive retry attempts
    backpressure_enabled: bool = True       # Skip updates when source is under load

    def to_dict(self) -> Dict[str, Any]:
        return {
            "full_refresh": self.full_refresh,
            "incremental": self.incremental,
            "delta_field": self.delta_field,
            "frequency": self.frequency,
            "fallback_on_error": self.fallback_on_error,
            "max_staleness_hours": self.max_staleness_hours,
            "retry_failed_updates": self.retry_failed_updates,
            "max_retry_attempts": self.max_retry_attempts,
            "backpressure_enabled": self.backpressure_enabled,
        }

@dataclass
class RefreshResult:
    """Result of a cache refresh operation."""
    source_name: str
    status: str                             # "success", "partial", "failed"
    records_added: int = 0
    records_updated: int = 0
    records_removed: int = 0
    errors: List[AdapterError] = field(default_factory=list)
    duration_ms: float = 0.0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
```


## 5. Example Adapters

### 5.1 PharmGKBAdapter -- Pharmacogenomics

```python
class PharmGKBAdapter(DatabaseAdapter):
    """
    Adapter for PharmGKB pharmacogenomics database.

    Provides gene-drug interaction annotations, clinical guidelines,
    variant annotations, and pharmacogenomic evidence.

    License: CC-BY-NC-SA-4.0 (Non-commercial use requires attribution)
    API: https://api.pharmgkb.org (API key required)
    Rate Limit: 5,000 requests/day
    """

    # --- Metadata ---
    source_name = "PharmGKB"
    source_version = "2024-12-01"
    adapter_version = "1.0.0"
    license = "CC-BY-NC-SA-4.0"
    license_url = "https://www.pharmgkb.org/page/dataUsage"
    attribution_required = True
    attribution_text = "Data from PharmGKB (https://www.pharmgkb.org), licensed under CC BY-NC-SA 4.0"
    update_cadence = "monthly"
    domains = [RecordDomain.PHARMACOGENOMICS, RecordDomain.MEDICATION]
    rate_limit = RateLimitConfig(
        requests_per_second=0.06,           # ~5,000/day = 0.058/sec
        burst_size=10,
        requests_per_day=5000,
    )
    cache_ttl = 86400                       # 24 hours
    max_staleness_hours = 720               # 30 days max

    @property
    def update_strategy(self) -> UpdateStrategy:
        return UpdateStrategy(
            full_refresh=False,
            incremental=True,
            delta_field="updated_at",
            frequency="monthly",
            fallback_on_error=True,
            max_staleness_hours=720,
        )

    # --- Schema Mapping ---

    def schema_mapping(self) -> SchemaMapping:
        return SchemaMapping(
            mapping_version="1.0.0",
            source_schema_version="2024-12-01",
            canonical_schema_version="1.0.0",
            source_schema={
                "gene.symbol": FieldDefinition(
                    field_name="gene.symbol", field_type="string", nullable=False,
                    description="HGNC gene symbol (e.g., CYP2D6)",
                ),
                "gene.pharmgkb_id": FieldDefinition(
                    field_name="gene.pharmgkb_id", field_type="string", nullable=False,
                    description="PharmGKB internal gene ID (PAxxx)",
                ),
                "gene.variants.rs_id": FieldDefinition(
                    field_name="gene.variants.rs_id", field_type="array_string", nullable=True,
                    description="dbSNP rsIDs associated with gene",
                ),
                "chemical.name": FieldDefinition(
                    field_name="chemical.name", field_type="string", nullable=False,
                    description="Drug/chemical name",
                ),
                "chemical.pharmgkb_id": FieldDefinition(
                    field_name="chemical.pharmgkb_id", field_type="string", nullable=False,
                ),
                "variant.id": FieldDefinition(
                    field_name="variant.id", field_type="string", nullable=True,
                    description="Variant identifier (rsID or PharmGKB ID)",
                ),
                "annotation.clinical_annotation": FieldDefinition(
                    field_name="annotation.clinical_annotation", field_type="text", nullable=True,
                    description="Full clinical annotation text",
                ),
                "annotation.id": FieldDefinition(
                    field_name="annotation.id", field_type="string", nullable=False,
                ),
                "evidence.level": FieldDefinition(
                    field_name="evidence.level", field_type="enum", nullable=False,
                    enum_values=["1A", "1B", "2A", "2B", "3", "4"],
                    description="PharmGKB evidence level: 1A=highest, 4=lowest",
                ),
                "evidence.citations": FieldDefinition(
                    field_name="evidence.citations", field_type="array_string", nullable=True,
                    description="PubMed PMIDs supporting the annotation",
                ),
                "guideline.cpic": FieldDefinition(
                    field_name="guideline.cpic", field_type="string", nullable=True,
                    description="CPIC guideline phenotype recommendation",
                ),
                "phenotype": FieldDefinition(
                    field_name="phenotype", field_type="string", nullable=True,
                    description="Metabolizer phenotype (e.g., Poor, Normal, Ultra-rapid)",
                ),
            },
            canonical_schema={
                "gene": FieldDefinition(
                    field_name="gene", field_type="string", nullable=False,
                    description="HGNC gene symbol",
                ),
                "drug": FieldDefinition(
                    field_name="drug", field_type="string", nullable=False,
                    description="Drug/chemical name",
                ),
                "variant_id": FieldDefinition(
                    field_name="variant_id", field_type="string", nullable=True,
                ),
                "clinical_significance": FieldDefinition(
                    field_name="clinical_significance", field_type="text", nullable=True,
                    description="Clinical annotation summary",
                ),
                "evidence_grade": FieldDefinition(
                    field_name="evidence_grade", field_type="enum", nullable=False,
                    enum_values=["A", "B", "C", "D"],
                    description="DeepSynaps evidence grade: A=highest, D=lowest",
                ),
                "guideline_summary": FieldDefinition(
                    field_name="guideline_summary", field_type="text", nullable=True,
                    description="CPIC or other guideline recommendation",
                ),
                "phenotype": FieldDefinition(
                    field_name="phenotype", field_type="string", nullable=True,
                ),
                "pmid_references": FieldDefinition(
                    field_name="pmid_references", field_type="array_string", nullable=True,
                ),
            },
            mappings=[
                FieldMapping("gene.symbol", "gene", required=True),
                FieldMapping("chemical.name", "drug", required=True),
                FieldMapping("variant.id", "variant_id"),
                FieldMapping("annotation.clinical_annotation", "clinical_significance"),
                FieldMapping("annotation.id", "source_annotation_id"),
                FieldMapping("guideline.cpic", "guideline_summary"),
                FieldMapping("phenotype", "phenotype"),
                FieldMapping("evidence.citations", "pmid_references"),
            ],
            transformations=[
                FieldTransformation(
                    source_field="evidence.level",
                    target_field="evidence_grade",
                    transform_name="pharmgkb_evidence_level_map",
                    transform_description="Maps PharmGKB evidence levels to DeepSynaps canonical grades",
                    parameters={"mapping": {"1A": "A", "1B": "A", "2A": "B", "2B": "B", "3": "C", "4": "D"}},
                ),
            ],
            confidence_rules={
                "evidence_grade": ConfidenceRule(
                    field_name="evidence_grade",
                    mappings={
                        "1A": ("A", 1.0, "FDA-approved pharmacogenomic biomarker"),
                        "1B": ("A", 1.0, "Strong clinical evidence"),
                        "2A": ("B", 0.75, "Moderate clinical evidence"),
                        "2B": ("B", 0.75, "Moderate clinical evidence, limited studies"),
                        "3": ("C", 0.5, "Weak clinical evidence"),
                        "4": ("D", 0.25, "Very weak or anecdotal evidence"),
                    },
                    default_confidence=0.25,
                    default_reasoning="Unknown evidence level from PharmGKB",
                ),
            },
        )

    def _map_evidence_level(self, level: str) -> str:
        mapping = {"1A": "A", "1B": "A", "2A": "B", "2B": "B", "3": "C", "4": "D"}
        return mapping.get(level, "D")

    def _compute_confidence(self, evidence_grade: str, source_reliability: float = 0.9) -> ConfidenceScore:
        grade_scores = {"A": 1.0, "B": 0.75, "C": 0.5, "D": 0.25}
        evidence_strength = grade_scores.get(evidence_grade, 0.25)
        return ConfidenceScore(
            overall=source_reliability * evidence_strength,
            source_reliability=source_reliability,
            evidence_strength=evidence_strength,
            data_freshness=1.0,              # Computed at query time
            transform_fidelity=1.0,          # No data loss in this mapping
            score_reasoning=f"PharmGKB evidence grade {evidence_grade} -> confidence {evidence_strength}",
        )

    # --- Core Methods ---

    async def query(self, query: CanonicalQuery) -> AdapterResult:
        """Execute query against PharmGKB API."""
        # Implementation: check cache -> rate-limit -> call API -> transform -> cache -> return
        ...

    async def get_by_id(self, record_id: str) -> Optional[CanonicalRecord]:
        """Get PharmGKB annotation by PharmGKB ID."""
        ...

    async def health_check(self) -> AdapterHealth:
        """Verify PharmGKB API availability."""
        ...

    async def get_provenance(self, record_id: str) -> Optional[ProvenanceRecord]:
        """Get provenance for a PharmGKB record."""
        ...

    async def initialize(self) -> None:
        """Initialize PharmGKB adapter: load API key, test connection."""
        ...

    async def shutdown(self) -> None:
        """Graceful shutdown."""
        ...

    async def refresh_cache(self, force: bool = False) -> RefreshResult:
        """Refresh cached PharmGKB data."""
        ...
```

### 5.2 ClinVarAdapter -- Genetic Variants

```python
class ClinVarAdapter(DatabaseAdapter):
    """
    Adapter for NCBI ClinVar genetic variant database.

    Provides clinical significance, review status, and evidence
    for genetic variants and their relationship to human health.

    License: Public Domain (U.S. Government work)
    API: NCBI E-utilities (https://eutils.ncbi.nlm.nih.gov)
    Rate Limit: 3 requests/second (10/sec with API key)
    """

    source_name = "ClinVar"
    source_version = "2025-01-04"
    adapter_version = "1.0.0"
    license = "public_domain"
    license_url = "https://www.ncbi.nlm.nih.gov/home/about/policies/"
    attribution_required = False
    attribution_text = "Data from NCBI ClinVar"
    update_cadence = "weekly"
    domains = [RecordDomain.GENETICS, RecordDomain.BIOMARKER]
    rate_limit = RateLimitConfig(
        requests_per_second=3,
        burst_size=5,
        requests_per_minute=180,
    )
    cache_ttl = 604800                      # 1 week (genetic data is stable)
    max_staleness_hours = 2160              # 90 days

    @property
    def update_strategy(self) -> UpdateStrategy:
        return UpdateStrategy(
            full_refresh=False,
            incremental=True,
            delta_field="last_evaluated",
            frequency="weekly",
            fallback_on_error=True,
            max_staleness_hours=2160,
        )

    def schema_mapping(self) -> SchemaMapping:
        return SchemaMapping(
            mapping_version="1.0.0",
            source_schema_version="2025-01-04",
            canonical_schema_version="1.0.0",
            source_schema={
                "variation.id": FieldDefinition(field_name="variation.id", field_type="string", nullable=False),
                "variation.name": FieldDefinition(field_name="variation.name", field_type="string", nullable=False),
                "gene.symbol": FieldDefinition(field_name="gene.symbol", field_type="string", nullable=True),
                "chromosome": FieldDefinition(field_name="chromosome", field_type="string", nullable=False),
                "position.start": FieldDefinition(field_name="position.start", field_type="integer", nullable=False),
                "position.stop": FieldDefinition(field_name="position.stop", field_type="integer", nullable=False),
                "ref_allele": FieldDefinition(field_name="ref_allele", field_type="string", nullable=False),
                "alt_allele": FieldDefinition(field_name="alt_allele", field_type="string", nullable=False),
                "clinical_significance": FieldDefinition(
                    field_name="clinical_significance", field_type="enum", nullable=False,
                    enum_values=["Pathogenic", "Likely pathogenic", "Uncertain significance",
                                 "Likely benign", "Benign", "Conflicting interpretations",
                                 "drug response", "risk factor", "association",
                                 "protective", "Affects", "other"],
                ),
                "review_status": FieldDefinition(
                    field_name="review_status", field_type="enum", nullable=False,
                    enum_values=["practice guideline", "reviewed by expert panel",
                                 "criteria provided, multiple submitters, no conflicts",
                                 "criteria provided, single submitter",
                                 "criteria provided, conflicting interpretations",
                                 "no assertion criteria", "no assertion provided",
                                 "no interpretation for the single variant"],
                ),
                "accession": FieldDefinition(field_name="accession", field_type="string", nullable=False),
                "rcv": FieldDefinition(field_name="rcv", field_type="string", nullable=False),
                "conditions": FieldDefinition(field_name="conditions", field_type="array_string", nullable=True),
                "last_evaluated": FieldDefinition(field_name="last_evaluated", field_type="date", nullable=True),
                "star_rating": FieldDefinition(field_name="star_rating", field_type="integer", nullable=False),
            },
            canonical_schema={
                "variant_id": FieldDefinition(field_name="variant_id", field_type="string", nullable=False),
                "variant_name": FieldDefinition(field_name="variant_name", field_type="string", nullable=False),
                "gene": FieldDefinition(field_name="gene", field_type="string", nullable=True),
                "chromosome": FieldDefinition(field_name="chromosome", field_type="string", nullable=False),
                "position": FieldDefinition(field_name="position", field_type="integer", nullable=False),
                "reference_allele": FieldDefinition(field_name="reference_allele", field_type="string", nullable=False),
                "alternate_allele": FieldDefinition(field_name="alternate_allele", field_type="string", nullable=False),
                "clinical_significance": FieldDefinition(
                    field_name="clinical_significance", field_type="string", nullable=False,
                ),
                "review_status": FieldDefinition(
                    field_name="review_status", field_type="string", nullable=False,
                ),
                "accession": FieldDefinition(field_name="accession", field_type="string", nullable=False),
                "conditions": FieldDefinition(field_name="conditions", field_type="array_string", nullable=True),
                "last_evaluated": FieldDefinition(field_name="last_evaluated", field_type="date", nullable=True),
                "evidence_stars": FieldDefinition(
                    field_name="evidence_stars", field_type="integer", nullable=False,
                    description="ClinVar star rating (0-4)",
                ),
                "evidence_grade": FieldDefinition(
                    field_name="evidence_grade", field_type="enum", nullable=False,
                    enum_values=["A", "B", "C", "D"],
                ),
            },
            mappings=[
                FieldMapping("variation.id", "variant_id", required=True),
                FieldMapping("variation.name", "variant_name", required=True),
                FieldMapping("gene.symbol", "gene"),
                FieldMapping("chromosome", "chromosome", required=True),
                FieldMapping("position.start", "position", required=True),
                FieldMapping("ref_allele", "reference_allele", required=True),
                FieldMapping("alt_allele", "alternate_allele", required=True),
                FieldMapping("clinical_significance", "clinical_significance", required=True),
                FieldMapping("review_status", "review_status", required=True),
                FieldMapping("accession", "accession", required=True),
                FieldMapping("conditions", "conditions"),
                FieldMapping("last_evaluated", "last_evaluated"),
                FieldMapping("star_rating", "evidence_stars", required=True),
            ],
            transformations=[
                FieldTransformation(
                    source_field="review_status",
                    target_field="evidence_grade",
                    transform_name="clinvar_star_to_grade",
                    transform_description="Maps ClinVar review status to DeepSynaps evidence grade",
                    parameters={
                        "practice guideline": "A",
                        "reviewed by expert panel": "A",
                        "criteria provided, multiple submitters, no conflicts": "B",
                        "criteria provided, single submitter": "C",
                        "criteria provided, conflicting interpretations": "C",
                    },
                ),
            ],
            confidence_rules={
                "evidence_grade": ConfidenceRule(
                    field_name="evidence_grade",
                    mappings={
                        "practice guideline": ("A", 1.0, "ACMG/AMP practice guideline"),
                        "reviewed by expert panel": ("A", 1.0, "Expert panel review"),
                        "criteria provided, multiple submitters, no conflicts": ("B", 0.75, "Multiple consistent submissions"),
                        "criteria provided, single submitter": ("C", 0.5, "Single submitter, criteria provided"),
                        "criteria provided, conflicting interpretations": ("D", 0.25, "Conflicting interpretations of clinical significance"),
                    },
                    default_confidence=0.25,
                    default_reasoning="No assertion criteria or unreviewed ClinVar entry",
                ),
            },
        )

    async def query(self, query: CanonicalQuery) -> AdapterResult: ...
    async def get_by_id(self, record_id: str) -> Optional[CanonicalRecord]: ...
    async def health_check(self) -> AdapterHealth: ...
    async def get_provenance(self, record_id: str) -> Optional[ProvenanceRecord]: ...
    async def initialize(self) -> None: ...
    async def shutdown(self) -> None: ...
    async def refresh_cache(self, force: bool = False) -> RefreshResult: ...
```

### 5.3 PubMedAdapter -- Evidence Literature

```python
class PubMedAdapter(DatabaseAdapter):
    """
    Adapter for NCBI PubMed biomedical literature database.

    Provides article abstracts, metadata, and MeSH terms for
    evidence-based clinical decision support.

    License: Public Domain (U.S. Government work)
    API: NCBI E-utilities (https://eutils.ncbi.nlm.nih.gov)
    Rate Limit: 10 requests/second (with API key)
    """

    source_name = "PubMed"
    source_version = "2025-01"
    adapter_version = "1.0.0"
    license = "public_domain"
    license_url = "https://www.ncbi.nlm.nih.gov/home/about/policies/"
    attribution_required = False
    attribution_text = "Data from NCBI PubMed"
    update_cadence = "daily"
    domains = [RecordDomain.EVIDENCE]
    rate_limit = RateLimitConfig(
        requests_per_second=10,
        burst_size=15,
    )
    cache_ttl = 604800                      # 1 week
    max_staleness_hours = 168               # 7 days

    @property
    def update_strategy(self) -> UpdateStrategy:
        return UpdateStrategy(
            full_refresh=False,
            incremental=True,
            delta_field="date_completed",
            frequency="daily",
            fallback_on_error=True,
            max_staleness_hours=168,
        )

    def schema_mapping(self) -> SchemaMapping:
        return SchemaMapping(
            source_schema={
                "pmid": FieldDefinition(field_name="pmid", field_type="string", nullable=False),
                "title": FieldDefinition(field_name="title", field_type="string", nullable=False),
                "abstract": FieldDefinition(field_name="abstract", field_type="text", nullable=True),
                "authors": FieldDefinition(field_name="authors", field_type="array_string", nullable=True),
                "journal": FieldDefinition(field_name="journal", field_type="string", nullable=True),
                "pub_date": FieldDefinition(field_name="pub_date", field_type="date", nullable=True),
                "mesh_terms": FieldDefinition(field_name="mesh_terms", field_type="array_string", nullable=True),
                "doi": FieldDefinition(field_name="doi", field_type="string", nullable=True),
            },
            canonical_schema={
                "pmid": FieldDefinition(field_name="pmid", field_type="string", nullable=False),
                "title": FieldDefinition(field_name="title", field_type="string", nullable=False),
                "abstract": FieldDefinition(field_name="abstract", field_type="text", nullable=True),
                "authors": FieldDefinition(field_name="authors", field_type="array_string", nullable=True),
                "journal": FieldDefinition(field_name="journal", field_type="string", nullable=True),
                "publication_date": FieldDefinition(field_name="publication_date", field_type="date", nullable=True),
                "mesh_terms": FieldDefinition(field_name="mesh_terms", field_type="array_string", nullable=True),
                "doi": FieldDefinition(field_name="doi", field_type="string", nullable=True),
                "evidence_grade": FieldDefinition(
                    field_name="evidence_grade", field_type="enum", nullable=False,
                    enum_values=["A", "B", "C", "D"],
                ),
            },
            mappings=[
                FieldMapping("pmid", "pmid", required=True),
                FieldMapping("title", "title", required=True),
                FieldMapping("abstract", "abstract"),
                FieldMapping("authors", "authors"),
                FieldMapping("journal", "journal"),
                FieldMapping("pub_date", "publication_date"),
                FieldMapping("mesh_terms", "mesh_terms"),
                FieldMapping("doi", "doi"),
            ],
            transformations=[
                FieldTransformation(
                    source_field="pub_date",
                    target_field="evidence_grade",
                    transform_name="pubmed_publication_age_evidence",
                    transform_description="Evidence grade based on recency and impact factor",
                    parameters={"max_age_months": 60},
                ),
            ],
            confidence_rules={
                "evidence_grade": ConfidenceRule(
                    field_name="evidence_grade",
                    mappings={
                        "systematic_review": ("A", 1.0, "Systematic review or meta-analysis"),
                        "rct": ("A", 0.9, "Randomized controlled trial"),
                        "cohort": ("B", 0.75, "Cohort study"),
                        "case_control": ("B", 0.7, "Case-control study"),
                        "case_series": ("C", 0.5, "Case series or report"),
                        "expert_opinion": ("D", 0.3, "Expert opinion or narrative review"),
                    },
                    default_confidence=0.5,
                ),
            },
        )

    async def query(self, query: CanonicalQuery) -> AdapterResult: ...
    async def get_by_id(self, record_id: str) -> Optional[CanonicalRecord]: ...
    async def health_check(self) -> AdapterHealth: ...
    async def get_provenance(self, record_id: str) -> Optional[ProvenanceRecord]: ...
    async def initialize(self) -> None: ...
    async def shutdown(self) -> None: ...
    async def refresh_cache(self, force: bool = False) -> RefreshResult: ...
```

### 5.4 USFDAOpenFdaAdapter -- Adverse Events

```python
class USFDAOpenFdaAdapter(DatabaseAdapter):
    """
    Adapter for FDA OpenFDA adverse event reports (FAERS).

    Provides drug adverse event reports, drug labels, and
    enforcement reports from the FDA.

    License: Public Domain (U.S. Government work)
    API: https://api.fda.gov
    Rate Limit: 240 requests/minute
    """

    source_name = "OpenFDA"
    source_version = "2025-Q4"
    adapter_version = "1.0.0"
    license = "public_domain"
    license_url = "https://open.fda.gov/license/"
    attribution_required = True
    attribution_text = "Data from U.S. Food and Drug Administration via OpenFDA"
    update_cadence = "quarterly"
    domains = [RecordDomain.SAFETY, RecordDomain.MEDICATION]
    rate_limit = RateLimitConfig(
        requests_per_second=4,
        burst_size=10,
    )
    cache_ttl = 604800                      # 1 week
    max_staleness_hours = 720               # 30 days

    @property
    def update_strategy(self) -> UpdateStrategy:
        return UpdateStrategy(
            full_refresh=False,
            incremental=True,
            delta_field="receivedate",
            frequency="quarterly",
            fallback_on_error=True,
            max_staleness_hours=720,
        )

    def schema_mapping(self) -> SchemaMapping:
        return SchemaMapping(
            source_schema={
                "safetyreportid": FieldDefinition(field_name="safetyreportid", field_type="string", nullable=False),
                "serious": FieldDefinition(field_name="serious", field_type="integer", nullable=False),
                "patient.patientonsetage": FieldDefinition(field_name="patient.patientonsetage", field_type="integer", nullable=True),
                "patient.patientsex": FieldDefinition(field_name="patient.patientsex", field_type="integer", nullable=True),
                "drug.medicinalproduct": FieldDefinition(field_name="drug.medicinalproduct", field_type="array_string", nullable=True),
                "drug.openfda.brand_name": FieldDefinition(field_name="drug.openfda.brand_name", field_type="array_string", nullable=True),
                "reaction.reactionmeddrapt": FieldDefinition(field_name="reaction.reactionmeddrapt", field_type="array_string", nullable=True),
                "receivedate": FieldDefinition(field_name="receivedate", field_type="date", nullable=False),
                "primarysource.qualification": FieldDefinition(field_name="primarysource.qualification", field_type="integer", nullable=True),
            },
            canonical_schema={
                "report_id": FieldDefinition(field_name="report_id", field_type="string", nullable=False),
                "is_serious": FieldDefinition(field_name="is_serious", field_type="boolean", nullable=False),
                "patient_age": FieldDefinition(field_name="patient_age", field_type="integer", nullable=True, units="years"),
                "patient_sex": FieldDefinition(field_name="patient_sex", field_type="string", nullable=True),
                "drug_names": FieldDefinition(field_name="drug_names", field_type="array_string", nullable=True),
                "adverse_reactions": FieldDefinition(field_name="adverse_reactions", field_type="array_string", nullable=True),
                "report_date": FieldDefinition(field_name="report_date", field_type="date", nullable=False),
                "reporter_qualification": FieldDefinition(field_name="reporter_qualification", field_type="string", nullable=True),
                "evidence_grade": FieldDefinition(
                    field_name="evidence_grade", field_type="enum", nullable=False,
                    enum_values=["A", "B", "C", "D"],
                ),
            },
            mappings=[
                FieldMapping("safetyreportid", "report_id", required=True),
                FieldMapping("serious", "is_serious", required=True),
                FieldMapping("patient.patientonsetage", "patient_age"),
                FieldMapping("patient.patientsex", "patient_sex"),
                FieldMapping("drug.medicinalproduct", "drug_names"),
                FieldMapping("reaction.reactionmeddrapt", "adverse_reactions"),
                FieldMapping("receivedate", "report_date", required=True),
                FieldMapping("primarysource.qualification", "reporter_qualification"),
            ],
            transformations=[
                FieldTransformation(
                    source_field="serious",
                    target_field="is_serious",
                    transform_name="int_to_boolean",
                    transform_description="Convert integer 0/1 to boolean",
                ),
                FieldTransformation(
                    source_field="primarysource.qualification",
                    target_field="evidence_grade",
                    transform_name="reporter_qual_to_grade",
                    transform_description="Map reporter qualification to evidence grade",
                    parameters={"physician": "A", "pharmacist": "A", "other_health_professional": "B", "lawyer": "C", "consumer": "D"},
                ),
            ],
            confidence_rules={
                "evidence_grade": ConfidenceRule(
                    field_name="evidence_grade",
                    mappings={
                        "Physician": ("A", 0.8, "Reported by physician"),
                        "Pharmacist": ("A", 0.8, "Reported by pharmacist"),
                        "Other health professional": ("B", 0.6, "Reported by health professional"),
                        "Lawyer": ("C", 0.4, "Reported by legal representative"),
                        "Consumer": ("D", 0.25, "Reported by consumer/patient"),
                    },
                    default_confidence=0.3,
                ),
            },
        )

    async def query(self, query: CanonicalQuery) -> AdapterResult: ...
    async def get_by_id(self, record_id: str) -> Optional[CanonicalRecord]: ...
    async def health_check(self) -> AdapterHealth: ...
    async def get_provenance(self, record_id: str) -> Optional[ProvenanceRecord]: ...
    async def initialize(self) -> None: ...
    async def shutdown(self) -> None: ...
    async def refresh_cache(self, force: bool = False) -> RefreshResult: ...
```


## 6. Adapter Registry

### 6.1 Centralized Adapter Registry

The `AdapterRegistry` manages all adapter instances, provides health monitoring, routes queries to the appropriate adapters, and enforces lifecycle management.

```python
class AdapterRegistry:
    """
    Central registry for all DatabaseAdapter instances.

    The registry is a singleton that manages the lifecycle of every adapter,
    provides health monitoring, and routes canonical queries to the
    appropriate adapter(s).

    Usage:
        registry = AdapterRegistry()
        registry.register(PharmGKBAdapter())
        registry.register(ClinVarAdapter())

        # Query a specific adapter
        result = await registry.query("PharmGKB", query)

        # Query all adapters in a domain
        results = await registry.query_by_domain(
            RecordDomain.PHARMACOGENOMICS, query
        )
    """

    _instance = None                      # Singleton pattern
    _lock = None                          # Async lock for thread safety

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._adapters: Dict[str, DatabaseAdapter] = {}
            cls._instance._adapter_info: Dict[str, "AdapterInfo"] = {}
            cls._instance._domain_index: Dict[RecordDomain, List[str]] = {}
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        pass

    # --- Registration ---

    def register(self, adapter: DatabaseAdapter) -> "AdapterInfo":
        """
        Register a database adapter with the registry.

        Validates the adapter's schema mapping before registration.
        Populates domain index for routing.
        """
        source_name = adapter.source_name

        # Check for duplicate registration
        if source_name in self._adapters:
            raise AdapterRegistryError(
                f"Adapter '{source_name}' is already registered. "
                f"Unregister first or use replace()."
            )

        # Validate schema mapping
        schema = adapter.schema_mapping()
        errors = schema.validate()
        if any(e.severity == "critical" for e in errors):
            raise AdapterRegistryError(
                f"Cannot register adapter '{source_name}': "
                f"{len([e for e in errors if e.severity == 'critical'])} critical schema errors"
            )

        # Store adapter
        self._adapters[source_name] = adapter
        info = AdapterInfo(
            source_name=source_name,
            adapter_version=adapter.adapter_version,
            source_version=adapter.source_version,
            license=adapter.license,
            attribution_required=adapter.attribution_required,
            domains=adapter.domains,
            rate_limit=adapter.rate_limit,
            cache_ttl=adapter.cache_ttl,
            update_cadence=adapter.update_cadence,
            schema_errors=[e.to_dict() for e in errors],
            registered_at=datetime.utcnow(),
        )
        self._adapter_info[source_name] = info

        # Update domain index
        for domain in adapter.domains:
            if domain not in self._domain_index:
                self._domain_index[domain] = []
            if source_name not in self._domain_index[domain]:
                self._domain_index[domain].append(source_name)

        return info

    def unregister(self, source_name: str) -> None:
        """Remove an adapter from the registry."""
        if source_name not in self._adapters:
            raise AdapterRegistryError(f"Adapter '{source_name}' is not registered")

        adapter = self._adapters[source_name]
        del self._adapters[source_name]
        del self._adapter_info[source_name]

        # Remove from domain index
        for domain in adapter.domains:
            if domain in self._domain_index:
                if source_name in self._domain_index[domain]:
                    self._domain_index[domain].remove(source_name)

    def replace(self, adapter: DatabaseAdapter) -> "AdapterInfo":
        """Replace an existing adapter with a new version."""
        self.unregister(adapter.source_name)
        return self.register(adapter)

    # --- Retrieval ---

    def get(self, source_name: str) -> DatabaseAdapter:
        """Retrieve an adapter by its source name."""
        if source_name not in self._adapters:
            raise AdapterRegistryError(f"No adapter registered for source '{source_name}'")
        return self._adapters[source_name]

    def get_info(self, source_name: str) -> "AdapterInfo":
        """Get metadata about a registered adapter."""
        if source_name not in self._adapter_info:
            raise AdapterRegistryError(f"No adapter registered for source '{source_name}'")
        return self._adapter_info[source_name]

    def list_all(self) -> List["AdapterInfo"]:
        """List all registered adapters."""
        return list(self._adapter_info.values())

    def list_by_domain(self, domain: RecordDomain) -> List[DatabaseAdapter]:
        """Get all adapters that serve a given clinical domain."""
        source_names = self._domain_index.get(domain, [])
        return [self._adapters[name] for name in source_names if name in self._adapters]

    def get_by_domain(self, domain: RecordDomain) -> List[DatabaseAdapter]:
        """Alias for list_by_domain."""
        return self.list_by_domain(domain)

    def is_registered(self, source_name: str) -> bool:
        """Check if an adapter is registered."""
        return source_name in self._adapters

    @property
    def adapter_count(self) -> int:
        """Total number of registered adapters."""
        return len(self._adapters)

    # --- Query Routing ---

    async def query(
        self,
        source_name: str,
        query: CanonicalQuery,
    ) -> AdapterResult:
        """
        Route a query to a specific adapter.

        Args:
            source_name: Name of the adapter to query
            query: CanonicalQuery to execute

        Returns:
            AdapterResult from the specified adapter
        """
        adapter = self.get(source_name)
        return await adapter.query(query)

    async def query_all(
        self,
        query: CanonicalQuery,
    ) -> Dict[str, AdapterResult]:
        """
        Execute a query against ALL registered adapters.

        Returns a dictionary mapping source_name -> AdapterResult.
        Non-fatal errors are collected in each result's errors list.
        """
        results = {}
        for source_name, adapter in self._adapters.items():
            try:
                result = await adapter.query(query)
                results[source_name] = result
            except Exception as e:
                results[source_name] = AdapterResult(
                    errors=[AdapterError(
                        error_code="QUERY_FAILED",
                        severity="error",
                        message=f"Query to {source_name} failed: {str(e)}",
                        source_name=source_name,
                    )],
                )
        return results

    async def query_by_domain(
        self,
        domain: RecordDomain,
        query: CanonicalQuery,
    ) -> Dict[str, AdapterResult]:
        """
        Execute a query against all adapters serving a clinical domain.

        Args:
            domain: Clinical domain to query
            query: CanonicalQuery to execute

        Returns:
            Dictionary of source_name -> AdapterResult
        """
        adapters = self.list_by_domain(domain)
        results = {}
        for adapter in adapters:
            try:
                result = await adapter.query(query)
                results[adapter.source_name] = result
            except Exception as e:
                results[adapter.source_name] = AdapterResult(
                    errors=[AdapterError(
                        error_code="QUERY_FAILED",
                        severity="error",
                        message=f"Query failed: {str(e)}",
                        source_name=adapter.source_name,
                    )],
                )
        return results

    # --- Health Monitoring ---

    async def health_check_all(self) -> Dict[str, AdapterHealth]:
        """Run health checks on all registered adapters."""
        health = {}
        for source_name, adapter in self._adapters.items():
            try:
                health[source_name] = await adapter.health_check()
            except Exception as e:
                health[source_name] = AdapterHealth(
                    source_name=source_name,
                    adapter_version=adapter.adapter_version,
                    source_version=adapter.source_version,
                    status="unknown",
                    consecutive_failures=1,
                )
        return health

    async def health_check(self, source_name: str) -> AdapterHealth:
        """Run health check on a specific adapter."""
        adapter = self.get(source_name)
        return await adapter.health_check()

    # --- Lifecycle ---

    async def initialize_all(self) -> None:
        """Initialize all registered adapters."""
        for source_name, adapter in self._adapters.items():
            try:
                await adapter.initialize()
            except Exception as e:
                raise AdapterRegistryError(
                    f"Failed to initialize adapter '{source_name}': {e}"
                )
        self._initialized = True

    async def shutdown_all(self) -> None:
        """Gracefully shut down all adapters."""
        for source_name, adapter in self._adapters.items():
            try:
                await adapter.shutdown()
            except Exception as e:
                # Log but don't raise -- attempt to shut down all adapters
                pass
        self._initialized = False

    # --- Statistics ---

    def get_statistics(self) -> Dict[str, Any]:
        """Get aggregate statistics about the registry."""
        domain_counts = {}
        for domain, adapters in self._domain_index.items():
            domain_counts[domain.value] = len(adapters)

        return {
            "total_adapters": len(self._adapters),
            "total_domains": len(self._domain_index),
            "adapters_per_domain": domain_counts,
            "adapter_names": list(self._adapters.keys()),
            "initialized": self._initialized,
        }

@dataclass
class AdapterInfo:
    """Metadata about a registered adapter."""
    source_name: str
    adapter_version: str
    source_version: str
    license: str
    attribution_required: bool
    domains: List[RecordDomain]
    rate_limit: RateLimitConfig
    cache_ttl: int
    update_cadence: str
    schema_errors: List[Dict[str, Any]]
    registered_at: datetime

class AdapterRegistryError(Exception):
    """Exception raised for adapter registry operations."""
    pass
```

### 6.2 Adapter Lifecycle Flow

```
+----------------------------------------------------------------+
|                     ADAPTER LIFECYCLE                           |
+----------------------------------------------------------------+

  CREATE          INITIALIZE           QUERY              SHUTDOWN
    |                  |                  |                    |
    v                  v                  v                    v
+--------+       +----------+      +-----------+        +----------+
| new    |------>| validate |----->| cache hit |------->| flush    |
| Adapter|       | schema   |      |    ?      |        | cache    |
+--------+       +----------+      +-----+-----+        +----------+
                       |                  |
                       |           +------+------+
                       |           |             |
                       |           v             v
                       |    +----------+   +-----------+
                       |    | return   |   | rate limit|
                       |    | cached   |   |    ?      |
                       |    +----------+   +-----+-----+
                       |                         |
                       |                  +------+------+
                       |                  |             |
                       |                  v             v
                       |           +----------+   +-----------+
                       |           | throttle |   | external  |
                       |           | request  |   | API call  |
                       |           +----------+   +-----+-----+
                       |                              |
                       |                              v
                       |                       +-----------+
                       |                       | transform |
                       |                       | + proven. |
                       |                       +-----+-----+
                       |                             |
                       |                             v
                       |                       +-----------+
                       |                       |  cache    |
                       |                       |  result   |
                       |                       +-----+-----+
                       |                             |
                       |                             v
                       |                       +-----------+
                       +---------------------->|  return   |
                                               |  result   |
                                               +-----------+
```

---

## 7. ETL Pipeline

### 7.1 Pipeline Architecture

Every adapter executes an identical ETL pipeline with six steps: Extract, Validate, Transform, Enrich, Load, and Audit.

```python
@dataclass
class ETLPipeline:
    """
    Extract-Transform-Load pipeline for external database adapters.

    Every adapter uses this pipeline to process data from external sources
    into DeepSynaps canonical records. The pipeline is auditable and
    tracks provenance at every step.
    """
    adapter: DatabaseAdapter                # Owning adapter
    cache: "AdapterCache"                   # Cache layer
    metrics: "PipelineMetrics"            # Metrics collector

    async def execute(self, query: CanonicalQuery) -> AdapterResult:
        """
        Execute the full ETL pipeline for a canonical query.

        Pipeline Steps:
        1. EXTRACT:    Query the external data source
        2. VALIDATE:   Validate raw source data integrity
        3. TRANSFORM:  Map to canonical schema
        4. ENRICH:     Add provenance, confidence, licensing
        5. LOAD:       Store in cache
        6. AUDIT:      Log all operations
        """
        pipeline_start = time.time()
        errors: List[AdapterError] = []
        records: List[CanonicalRecord] = []
        provenance: Optional[ProvenanceRecord] = None
        source_latency = 0.0
        cached = False
        cache_hit = False

        try:
            # --- STEP 1: EXTRACT ---
            extract_start = time.time()
            raw_data, provenance, source_latency = await self._extract(query)
            extract_time = (time.time() - extract_start) * 1000
            self.metrics.observe("extract_latency_ms", extract_time)

            if raw_data is None:
                # Source unavailable -- attempt cache fallback
                fallback_result = await self._fallback_to_cache(query)
                if fallback_result:
                    fallback_result.errors.append(AdapterError(
                        error_code="SOURCE_UNAVAILABLE",
                        severity="warning",
                        message=f"Source {self.adapter.source_name} unavailable; returning cached data",
                        source_name=self.adapter.source_name,
                        retryable=True,
                    ))
                    return fallback_result
                else:
                    return AdapterResult(
                        errors=[AdapterError(
                            error_code="SOURCE_UNAVAILABLE",
                            severity="critical",
                            message=f"Source {self.adapter.source_name} unavailable and no cache",
                            source_name=self.adapter.source_name,
                            retryable=True,
                        )],
                    )

            # --- STEP 2: VALIDATE ---
            validation_errors = await self._validate(raw_data)
            if any(e.severity == "critical" for e in validation_errors):
                return AdapterResult(
                    errors=validation_errors,
                    provenance=provenance,
                )
            errors.extend(validation_errors)

            # --- STEP 3: TRANSFORM ---
            transform_start = time.time()
            records = await self._transform(raw_data, provenance)
            transform_time = (time.time() - transform_start) * 1000
            self.metrics.observe("transform_latency_ms", transform_time)

            # --- STEP 4: ENRICH ---
            records = await self._enrich(records, provenance)

            # --- STEP 5: LOAD ---
            await self._load(query, records)

            # --- STEP 6: AUDIT ---
            await self._audit(query, records, provenance, errors)

        except Exception as e:
            errors.append(AdapterError(
                error_code="PIPELINE_ERROR",
                severity="error",
                message=f"ETL pipeline error: {str(e)}",
                source_name=self.adapter.source_name,
            ))

        total_latency = (time.time() - pipeline_start) * 1000

        return AdapterResult(
            records=records,
            total_available=len(records),  # Updated by extract step
            source_latency_ms=source_latency,
            total_latency_ms=total_latency,
            cached=cached,
            cache_hit=cache_hit,
            provenance=provenance,
            license=self.adapter.license,
            attribution_required=self.adapter.attribution_required,
            attribution_text=self.adapter.attribution_text,
            confidence=ConfidenceScore(),
            errors=errors,
            adapter_version=self.adapter.adapter_version,
            source_version=self.adapter.source_version,
        )

    async def _extract(self, query: CanonicalQuery) -> tuple:
        """Extract raw data from the external source."""
        # Check cache first
        cache_key = self._build_cache_key(query)
        if query.use_cache:
            cached_result = await self.cache.get(cache_key)
            if cached_result and not query.require_fresh:
                return cached_result["data"], cached_result["provenance"], 0.0

        # Call external API with rate limiting
        start = time.time()
        raw_data = await self._call_external(query)
        latency = (time.time() - start) * 1000

        if raw_data is not None:
            provenance = self.adapter._build_provenance(
                extraction_method="api",
                extraction_query=str(query.to_dict()),
                checksum_source=self._compute_checksum(raw_data),
            )
        else:
            provenance = None

        return raw_data, provenance, latency

    async def _validate(self, raw_data: Any) -> List[AdapterError]:
        """Validate raw source data for integrity."""
        errors = []
        if raw_data is None:
            errors.append(AdapterError(
                error_code="VALIDATION_FAILED",
                severity="critical",
                message="Raw data is null after extraction",
                source_name=self.adapter.source_name,
            ))
            return errors

        if isinstance(raw_data, dict):
            if "error" in raw_data:
                errors.append(AdapterError(
                    error_code="SOURCE_ERROR",
                    severity="error",
                    message=f"Source returned error: {raw_data.get('error')}",
                    source_name=self.adapter.source_name,
                ))

        return errors

    async def _transform(self, raw_data: Any, provenance: ProvenanceRecord) -> List[CanonicalRecord]:
        """Transform raw data into canonical records using schema mapping."""
        schema = self.adapter.schema_mapping()
        records = []

        # Extract record list from raw response
        raw_records = self._extract_records(raw_data)

        for idx, raw_record in enumerate(raw_records):
            record_id = f"{self.adapter.source_name}:{idx}:{hash(str(raw_record))}"

            # Apply field mappings
            canonical_data = {}
            for mapping in schema.mappings:
                source_value = self._get_nested_value(raw_record, mapping.source_field)
                if source_value is None and mapping.default_value is not None:
                    source_value = mapping.default_value
                canonical_data[mapping.canonical_field] = source_value

            # Apply transformations
            for transform in schema.transformations:
                source_value = self._get_nested_value(raw_record, transform.source_field)
                transformed_value = self._apply_transform(transform, source_value)
                canonical_data[transform.target_field] = transformed_value

            # Build provenance for this specific record
            record_provenance = self._build_record_provenance(provenance, schema.transformations)

            # Compute confidence
            confidence = self._compute_record_confidence(canonical_data, schema.confidence_rules)

            # Build canonical record
            record = CanonicalRecord(
                record_id=record_id,
                source_name=self.adapter.source_name,
                source_version=self.adapter.source_version,
                source_record_id=str(canonical_data.get("variant_id", record_id)),
                domain=self.adapter.domains[0] if self.adapter.domains else RecordDomain.EVIDENCE,
                record_type="canonical",
                data=canonical_data,
                provenance=record_provenance,
                extracted_at=datetime.utcnow(),
                transformed_at=datetime.utcnow(),
                confidence=confidence,
            )
            record.provenance.checksum_canonical = self.adapter.compute_record_hash(record)
            records.append(record)

        return records

    async def _enrich(self, records: List[CanonicalRecord], provenance: ProvenanceRecord) -> List[CanonicalRecord]:
        """Enrich records with licensing, attribution, and cross-references."""
        for record in records:
            # Add license info to provenance
            record.provenance.license_type = self.adapter.license
            record.provenance.license_url = self.adapter.license_url
            if self.adapter.attribution_required:
                record.provenance.attribution_text = self.adapter.attribution_text
        return records

    async def _load(self, query: CanonicalQuery, records: List[CanonicalRecord]) -> None:
        """Load results into cache."""
        cache_key = self._build_cache_key(query)
        cache_entry = {
            "data": records,
            "provenance": records[0].provenance if records else None,
            "cached_at": datetime.utcnow().isoformat(),
            "source_version": self.adapter.source_version,
        }
        ttl = query.cache_ttl_override or self.adapter.cache_ttl
        await self.cache.set(cache_key, cache_entry, ttl=ttl)

    async def _audit(self, query: CanonicalQuery, records: List[CanonicalRecord], provenance: ProvenanceRecord, errors: List[AdapterError]) -> None:
        """Log all pipeline operations for audit trail."""
        audit_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "adapter": self.adapter.source_name,
            "adapter_version": self.adapter.adapter_version,
            "query": query.to_dict(),
            "records_returned": len(records),
            "errors": [e.to_dict() for e in errors],
            "provenance": provenance.to_dict() if provenance else None,
        }
        # Write to audit log (async logging or message queue)
        await self._write_audit_log(audit_entry)

    async def _fallback_to_cache(self, query: CanonicalQuery) -> Optional[AdapterResult]:
        """Attempt to return stale cached data when source is unavailable."""
        if not self.adapter.update_strategy.fallback_on_error:
            return None
        cache_key = self._build_cache_key(query)
        cached = await self.cache.get(cache_key)
        if cached:
            return AdapterResult(
                records=cached.get("data", []),
                cached=True,
                cache_hit=True,
                provenance=cached.get("provenance"),
                license=self.adapter.license,
                attribution_required=self.adapter.attribution_required,
                attribution_text=self.adapter.attribution_text,
                adapter_version=self.adapter.adapter_version,
                source_version=self.adapter.source_version,
            )
        return None

    async def _call_external(self, query: CanonicalQuery) -> Any:
        """Call external API with rate limiting and retry logic."""
        # Implemented by concrete adapter
        raise NotImplementedError

    def _build_cache_key(self, query: CanonicalQuery) -> str:
        """Build a deterministic cache key for a query."""
        query_hash = hashlib.sha256(json.dumps(query.to_dict(), sort_keys=True, default=str).encode()).hexdigest()[:16]
        return f"{self.adapter.source_name}:{self.adapter.source_version}:{query_hash}"

    def _compute_checksum(self, data: Any) -> str:
        """Compute SHA-256 checksum of raw data."""
        return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()

    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """Extract a value from nested dict using dot notation."""
        parts = path.split(".")
        current = data
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current

    def _extract_records(self, raw_data: Any) -> List[Dict]:
        """Extract record list from raw API response."""
        if isinstance(raw_data, list):
            return raw_data
        if isinstance(raw_data, dict):
            for key in ["results", "data", "records", "items", "hits"]:
                if key in raw_data:
                    return raw_data[key] if isinstance(raw_data[key], list) else []
            return [raw_data]
        return []

    def _apply_transform(self, transform: FieldTransformation, value: Any) -> Any:
        """Apply a value transformation."""
        if value is None:
            return None
        # Transform implementation is adapter-specific
        return value

    def _build_record_provenance(self, base_provenance: ProvenanceRecord, transformations: List[FieldTransformation]) -> ProvenanceRecord:
        """Build record-specific provenance from base provenance."""
        record_prov = ProvenanceRecord(
            source_name=base_provenance.source_name,
            source_url=base_provenance.source_url,
            source_version=base_provenance.source_version,
            source_access_date=base_provenance.source_access_date,
            extraction_method=base_provenance.extraction_method,
            extraction_query=base_provenance.extraction_query,
            license_type=base_provenance.license_type,
            license_url=base_provenance.license_url,
            previous_provenance=base_provenance,
        )
        for idx, t in enumerate(transformations):
            record_prov.transformations.append(TransformStep(
                step_name=t.transform_name,
                step_order=idx,
                transform_description=t.transform_description,
                parameters=t.parameters,
            ))
        return record_prov

    def _compute_record_confidence(self, data: Dict[str, Any], confidence_rules: Dict[str, ConfidenceRule]) -> ConfidenceScore:
        """Compute confidence score for a record using confidence rules."""
        field_scores = {}
        for field_name, rule in confidence_rules.items():
            if field_name in data and data[field_name] is not None:
                _, score, reasoning = rule.evaluate(str(data[field_name]))
                field_scores[field_name] = score

        overall = sum(field_scores.values()) / len(field_scores) if field_scores else 0.5

        return ConfidenceScore(
            overall=overall,
            field_scores=field_scores,
            score_reasoning=f"Confidence computed from {len(field_scores)} field rules",
        )

    async def _write_audit_log(self, entry: Dict[str, Any]) -> None:
        """Write audit log entry."""
        pass  # Implemented by audit subsystem
```

### 7.2 Pipeline Metrics

```python
@dataclass
class PipelineMetrics:
    """Metrics collector for ETL pipeline operations."""
    _counters: Dict[str, int] = field(default_factory=dict)
    _histograms: Dict[str, List[float]] = field(default_factory=dict)

    def increment(self, metric_name: str, value: int = 1) -> None:
        """Increment a counter metric."""
        self._counters[metric_name] = self._counters.get(metric_name, 0) + value

    def observe(self, metric_name: str, value: float) -> None:
        """Observe a value in a histogram metric."""
        if metric_name not in self._histograms:
            self._histograms[metric_name] = []
        self._histograms[metric_name].append(value)

    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all collected metrics."""
        return {
            "counters": dict(self._counters),
            "histograms": {
                name: {
                    "count": len(values),
                    "sum": sum(values),
                    "avg": sum(values) / len(values) if values else 0,
                    "min": min(values) if values else 0,
                    "max": max(values) if values else 0,
                }
                for name, values in self._histograms.items()
            },
        }
```


## 8. Rate Limiting & Throttling

### 8.1 Rate Limiter

Every adapter enforces source-specific rate limits using a token-bucket algorithm with optional jitter.

```python
import asyncio
import random
import time
from collections import deque
from typing import Optional

class TokenBucketRateLimiter:
    """
    Token-bucket rate limiter per external data source.

    Enforces both per-second and per-day rate limits simultaneously.
    Supports burst tolerance, jitter, and fair queuing across
    concurrent requests.

    Usage:
        limiter = TokenBucketRateLimiter(
            adapter_name="PharmGKB",
            requests_per_second=0.06,
            burst_size=10,
            requests_per_day=5000,
        )
        async with limiter.acquire():
            response = await api_client.query(...)
    """

    def __init__(
        self,
        adapter_name: str,
        requests_per_second: float = 10.0,
        burst_size: int = 20,
        requests_per_minute: Optional[int] = None,
        requests_per_day: Optional[int] = None,
        daily_quota_reset_hour: int = 0,
        jitter: bool = True,
        jitter_max_ms: int = 500,
    ):
        self.adapter_name = adapter_name
        self.requests_per_second = requests_per_second
        self.burst_size = burst_size
        self.requests_per_minute = requests_per_minute
        self.requests_per_day = requests_per_day
        self.daily_quota_reset_hour = daily_quota_reset_hour
        self.jitter = jitter
        self.jitter_max_ms = jitter_max_ms

        # Token bucket state
        self._tokens = burst_size
        self._last_refill = time.monotonic()
        self._token_rate = requests_per_second

        # Minute tracking
        self._minute_window = deque()
        self._minute_limit = requests_per_minute or 0

        # Daily tracking
        self._daily_count = 0
        self._daily_reset_time = self._compute_next_daily_reset()

        # Fair queuing
        self._waiters = deque()
        self._lock = asyncio.Lock()

    def _compute_next_daily_reset(self) -> float:
        """Compute timestamp of next daily quota reset."""
        now = datetime.utcnow()
        reset = now.replace(hour=self.daily_quota_reset_hour, minute=0, second=0, microsecond=0)
        if reset <= now:
            reset += timedelta(days=1)
        return reset.timestamp()

    def _refill_tokens(self) -> None:
        """Refill token bucket based on elapsed time."""
        now = time.monotonic()
        elapsed = now - self._last_refill
        tokens_to_add = elapsed * self._token_rate
        self._tokens = min(self.burst_size, self._tokens + tokens_to_add)
        self._last_refill = now

    def _check_daily_quota(self) -> bool:
        """Check if daily quota is exhausted."""
        if self.requests_per_day is None:
            return True
        now = time.monotonic()
        if now >= self._daily_reset_time:
            self._daily_count = 0
            self._daily_reset_time = self._compute_next_daily_reset()
        return self._daily_count < self.requests_per_day

    def _check_minute_quota(self) -> bool:
        """Check if per-minute quota is exhausted."""
        if self._minute_limit <= 0:
            return True
        now = time.monotonic()
        # Remove entries older than 60 seconds
        while self._minute_window and self._minute_window[0] < now - 60:
            self._minute_window.popleft()
        return len(self._minute_window) < self._minute_limit

    async def acquire(self) -> "RateLimiterContext":
        """Acquire rate limit permission. Returns context manager."""
        async with self._lock:
            self._refill_tokens()

            # Check daily quota
            if not self._check_daily_quota():
                raise RateLimitExceededError(
                    adapter=self.adapter_name,
                    message=f"Daily quota exhausted ({self.requests_per_day}/day)",
                    retry_after_seconds=int(self._daily_reset_time - time.monotonic()),
                )

            # Check minute quota
            if not self._check_minute_quota():
                raise RateLimitExceededError(
                    adapter=self.adapter_name,
                    message=f"Per-minute quota exhausted ({self._minute_limit}/min)",
                    retry_after_seconds=60,
                )

            # Wait for token
            while self._tokens < 1:
                wait_time = (1 - self._tokens) / self._token_rate
                if self.jitter:
                    wait_time += random.uniform(0, self.jitter_max_ms / 1000.0)
                await asyncio.sleep(wait_time)
                self._refill_tokens()

            # Consume token
            self._tokens -= 1
            now = time.monotonic()
            self._minute_window.append(now)
            self._daily_count += 1

        return RateLimiterContext(self)

class RateLimiterContext:
    """Async context manager for rate limiter."""
    def __init__(self, limiter: TokenBucketRateLimiter):
        self.limiter = limiter
    async def __aenter__(self):
        return self
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

class RateLimitExceededError(Exception):
    """Raised when rate limit is exceeded."""
    def __init__(self, adapter: str, message: str, retry_after_seconds: int = 60):
        self.adapter = adapter
        self.retry_after_seconds = retry_after_seconds
        super().__init__(message)
```

### 8.2 Rate Limit Configuration by Source

| Source | Requests/sec | Burst | Per day | Per min | Strategy |
|--------|-------------|-------|---------|---------|----------|
| PharmGKB | 0.06 | 10 | 5,000 | - | Token bucket, daily quota |
| ClinVar | 3.0 | 5 | - | 180 | Token bucket, minute window |
| PubMed | 10.0 | 15 | - | - | Token bucket only |
| OpenFDA | 4.0 | 10 | - | 240 | Token bucket, minute window |
| ClinicalTrials.gov | 8.3 | 20 | - | 500 | Token bucket, minute window |
| USDA FoodData | 1.0 | 5 | - | - | Token bucket only |
| Allen Brain Atlas | 2.0 | 10 | - | - | Token bucket, fair use |
| NeuroVault | 5.0 | 15 | - | - | Token bucket, fair use |
| SNOMED CT | 1.0 | 5 | - | - | Token bucket, varies by license |
| gnomAD | 2.0 | 10 | - | - | Token bucket, fair use |

---

## 9. Caching Layer

### 9.1 Adapter Cache

Each adapter has an isolated cache namespace with source-specific TTL values.

```python
class AdapterCache:
    """
    Cache layer for adapter query results.

    Each adapter has its own cache namespace to prevent
    key collisions and enable independent cache management.

    Supports:
    - Redis (production)
    - In-memory (development/testing)
    - TTL per adapter and per-query override
    - Staleness tracking for fallback scenarios
    """

    def __init__(self, adapter_name: str, backend: "CacheBackend", default_ttl: int = 3600):
        self.adapter_name = adapter_name
        self.backend = backend
        self.default_ttl = default_ttl
        self.namespace = f"deepsynaps:adapter:{adapter_name}"

    def _namespaced_key(self, key: str) -> str:
        """Prefix cache key with adapter namespace."""
        return f"{self.namespace}:{key}"

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Get cached value by key."""
        namespaced = self._namespaced_key(key)
        return await self.backend.get(namespaced)

    async def set(self, key: str, value: Dict[str, Any], ttl: Optional[int] = None) -> None:
        """Set cached value with TTL."""
        namespaced = self._namespaced_key(key)
        effective_ttl = ttl or self.default_ttl
        await self.backend.set(namespaced, value, ttl=effective_ttl)

    async def delete(self, key: str) -> None:
        """Delete cached value by key."""
        namespaced = self._namespaced_key(key)
        await self.backend.delete(namespaced)

    async def clear(self) -> int:
        """Clear all cached entries for this adapter. Returns count deleted."""
        return await self.backend.delete_namespace(self.namespace)

    async def get_ttl_remaining(self, key: str) -> Optional[int]:
        """Get remaining TTL for a cached key."""
        namespaced = self._namespaced_key(key)
        return await self.backend.ttl(namespaced)

    async def is_stale(self, key: str, max_age_hours: int) -> bool:
        """Check if a cached entry exceeds max age."""
        remaining = await self.get_ttl_remaining(key)
        if remaining is None:
            return True
        ttl = self.default_ttl
        age = ttl - remaining
        return age > max_age_hours * 3600

class CacheBackend(ABC):
    """Abstract cache backend interface."""
    @abstractmethod
    async def get(self, key: str) -> Optional[Any]: ...
    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int) -> None: ...
    @abstractmethod
    async def delete(self, key: str) -> None: ...
    @abstractmethod
    async def delete_namespace(self, namespace: str) -> int: ...
    @abstractmethod
    async def ttl(self, key: str) -> Optional[int]: ...

class RedisCacheBackend(CacheBackend):
    """Redis-backed cache implementation."""
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self._client = None

    async def connect(self):
        import redis.asyncio as redis
        self._client = redis.from_url(self.redis_url)

    async def get(self, key: str) -> Optional[Any]:
        import json
        raw = await self._client.get(key)
        return json.loads(raw) if raw else None

    async def set(self, key: str, value: Any, ttl: int) -> None:
        import json
        await self._client.setex(key, ttl, json.dumps(value, default=str))

    async def delete(self, key: str) -> None:
        await self._client.delete(key)

    async def delete_namespace(self, namespace: str) -> int:
        keys = await self._client.keys(f"{namespace}:*")
        if keys:
            return await self._client.delete(*keys)
        return 0

    async def ttl(self, key: str) -> Optional[int]:
        return await self._client.ttl(key)

class InMemoryCacheBackend(CacheBackend):
    """In-memory cache for development and testing."""
    def __init__(self):
        self._store: Dict[str, tuple] = {}  # key -> (value, expires_at)

    async def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            value, expires_at = self._store[key]
            if time.monotonic() < expires_at:
                return value
            del self._store[key]
        return None

    async def set(self, key: str, value: Any, ttl: int) -> None:
        self._store[key] = (value, time.monotonic() + ttl)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def delete_namespace(self, namespace: str) -> int:
        keys_to_delete = [k for k in self._store if k.startswith(f"{namespace}:")]
        for k in keys_to_delete:
            del self._store[k]
        return len(keys_to_delete)

    async def ttl(self, key: str) -> Optional[int]:
        if key in self._store:
            _, expires_at = self._store[key]
            remaining = int(expires_at - time.monotonic())
            return max(0, remaining)
        return None
```

### 9.2 Cache TTL Strategy by Data Type

| Data Type | Default TTL | Max Staleness | Storage | Rationale |
|-----------|-------------|---------------|---------|-----------|
| Drug data (names, doses) | 24 hours | 30 days | Redis + Local | Frequent recalls |
| Evidence data (papers, trials) | 7 days | 30 days | PostgreSQL | Weekly updates |
| Normative data (EEG, MRI) | 30 days | 90 days | Local files | Stable reference data |
| Genetic data (variants, pathways) | 30 days | 90 days | PostgreSQL | Stable reference |
| Trial data (ClinicalTrials.gov) | 3 days | 14 days | Redis | Frequent enrollment changes |
| Atlas data (brain regions) | 30 days | 180 days | Local files | Anatomically stable |
| Terminology (SNOMED, ICD-10) | 180 days | 365 days | PostgreSQL | Annual releases |
| Adverse events (FAERS) | 7 days | 30 days | PostgreSQL | Quarterly updates |
| Nutrition data (USDA) | 30 days | 90 days | SQLite | Annual updates |
| Wearable data | 5 minutes | 1 hour | Redis | Real-time stream |

---

## 10. Error Handling & Resilience

### 10.1 Error Classification

All adapter errors are classified by error code, severity, and retryability.

| Error Code | Severity | Retryable | Description |
|------------|----------|-----------|-------------|
| `SOURCE_UNAVAILABLE` | warning | Yes | External API unreachable |
| `RATE_LIMITED` | warning | Yes | Rate limit hit (respect Retry-After) |
| `TIMEOUT` | error | Yes | Request exceeded timeout |
| `SCHEMA_MISMATCH` | error | No | Source schema changed unexpectedly |
| `VALIDATION_FAILED` | error | No | Data validation failed |
| `LICENSE_VIOLATION` | critical | No | License terms violated |
| `AUTHENTICATION_FAILED` | error | No | API key invalid or expired |
| `QUERY_FAILED` | error | Yes | Generic query failure |
| `PIPELINE_ERROR` | error | Yes | Internal pipeline error |
| `CACHE_ERROR` | warning | Yes | Cache read/write failure |
| `PARTIAL_DATA` | warning | No | Some fields missing from response |
| `FALLBACK_USED` | warning | N/A | Returning stale cached data |

### 10.2 Resilience Patterns

```python
class ResilienceHandler:
    """
    Handles error recovery and resilience patterns for adapters.

    Implements:
    - Circuit breaker pattern
    - Exponential backoff retry
    - Fallback to stale cache
    - Graceful degradation
    """

    def __init__(
        self,
        adapter: DatabaseAdapter,
        cache: AdapterCache,
        max_retries: int = 3,
        backoff_factor: float = 2.0,
        circuit_failure_threshold: int = 5,
        circuit_recovery_timeout: int = 60,
    ):
        self.adapter = adapter
        self.cache = cache
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor

        # Circuit breaker state
        self._circuit_state = "closed"      # "closed", "open", "half_open"
        self._failure_count = 0
        self._circuit_failure_threshold = circuit_failure_threshold
        self._circuit_recovery_timeout = circuit_recovery_timeout
        self._last_failure_time: Optional[float] = None

    @property
    def circuit_open(self) -> bool:
        """Check if circuit breaker is open."""
        if self._circuit_state == "open":
            # Check if recovery timeout has elapsed
            if self._last_failure_time:
                elapsed = time.monotonic() - self._last_failure_time
                if elapsed > self._circuit_recovery_timeout:
                    self._circuit_state = "half_open"
                    return False
            return True
        return False

    def _record_success(self) -> None:
        """Record a successful operation."""
        self._failure_count = 0
        self._circuit_state = "closed"

    def _record_failure(self) -> None:
        """Record a failed operation."""
        self._failure_count += 1
        self._last_failure_time = time.monotonic()
        if self._failure_count >= self._circuit_failure_threshold:
            self._circuit_state = "open"

    async def execute_with_resilience(
        self,
        operation: callable,
        fallback_query: CanonicalQuery,
    ) -> AdapterResult:
        """
        Execute an adapter operation with full resilience patterns.

        1. Check circuit breaker
        2. Execute with retry and backoff
        3. On failure, fallback to stale cache
        4. Record success/failure for circuit breaker
        """
        # Check circuit breaker
        if self.circuit_open:
            fallback = await self.cache.get(self._build_cache_key(fallback_query))
            if fallback:
                return AdapterResult(
                    records=fallback.get("data", []),
                    cached=True,
                    cache_hit=True,
                    errors=[AdapterError(
                        error_code="FALLBACK_USED",
                        severity="warning",
                        message=f"Circuit breaker open for {self.adapter.source_name}; returning cached data",
                        source_name=self.adapter.source_name,
                    )],
                )
            return AdapterResult(
                errors=[AdapterError(
                    error_code="SOURCE_UNAVAILABLE",
                    severity="critical",
                    message=f"Circuit breaker open for {self.adapter.source_name} and no cache available",
                    source_name=self.adapter.source_name,
                )],
            )

        # Execute with retry
        for attempt in range(self.max_retries + 1):
            try:
                result = await operation()
                self._record_success()
                return result
            except RateLimitExceededError as e:
                if attempt < self.max_retries:
                    wait_time = e.retry_after_seconds * (self.backoff_factor ** attempt)
                    wait_time += random.uniform(0, 1)  # Jitter
                    await asyncio.sleep(wait_time)
                else:
                    self._record_failure()
            except Exception as e:
                if attempt < self.max_retries:
                    wait_time = (self.backoff_factor ** attempt) + random.uniform(0, 1)
                    await asyncio.sleep(wait_time)
                else:
                    self._record_failure()

        # All retries exhausted -- fallback to cache
        fallback = await self.cache.get(self._build_cache_key(fallback_query))
        if fallback and self.adapter.update_strategy.fallback_on_error:
            return AdapterResult(
                records=fallback.get("data", []),
                cached=True,
                cache_hit=True,
                errors=[AdapterError(
                    error_code="FALLBACK_USED",
                    severity="warning",
                    message=f"All retries exhausted for {self.adapter.source_name}; returning cached data",
                    source_name=self.adapter.source_name,
                    retryable=True,
                )],
            )

        return AdapterResult(
            errors=[AdapterError(
                error_code="SOURCE_UNAVAILABLE",
                severity="critical",
                message=f"All retries exhausted for {self.adapter.source_name}; no cache fallback available",
                source_name=self.adapter.source_name,
                retryable=True,
            )],
        )

    def _build_cache_key(self, query: CanonicalQuery) -> str:
        query_hash = hashlib.sha256(json.dumps(query.to_dict(), sort_keys=True, default=str).encode()).hexdigest()[:16]
        return f"{self.adapter.source_name}:{self.adapter.source_version}:{query_hash}"
```

---

## 11. Versioning Strategy

### 11.1 Adapter Versioning

Adapters follow semantic versioning (MAJOR.MINOR.PATCH) with source-version pinning.

```
ADAPTER VERSION = {MAJOR}.{MINOR}.{PATCH}

MAJOR: Breaking changes to schema mapping or interface
MINOR: New features, non-breaking additions
PATCH: Bug fixes, performance improvements

SOURCE VERSION PINNING:
  Each adapter pins to a specific source data version.
  Source version changes trigger adapter MINOR version bump.

VERSION MANIFEST:
  /adapters/{source_name}/
    adapter.py              -- Adapter implementation
    schema_mapping_v{N}.py  -- Schema mapping version N
    CHANGELOG.md            -- Version history
    requirements.txt        -- Dependencies
    README.md               -- Documentation

EXAMPLE:
  PharmGKBAdapter v1.0.0 -> PharmGKB data 2024-12-01
  PharmGKBAdapter v1.1.0 -> PharmGKB data 2025-01-01 (schema unchanged)
  PharmGKBAdapter v2.0.0 -> Breaking schema change at PharmGKB
```

### 11.2 Schema Mapping Versioning

Schema mappings are independently versioned to support schema evolution.

| Mapping Version | Source Version | Canonical Version | Status |
|-----------------|----------------|-------------------|--------|
| 1.0.0 | PharmGKB 2024-12-01 | DeepSynaps 1.0.0 | Active |
| 1.1.0 | PharmGKB 2025-01-01 | DeepSynaps 1.0.0 | Active |
| 2.0.0 | PharmGKB 2025-Q2 | DeepSynaps 2.0.0 | Planned |

```python
class SchemaMigration:
    """
    Handles migration between schema mapping versions.
    Ensures backward compatibility during version transitions.
    """
    from_version: str
    to_version: str
    field_additions: List[str] = field(default_factory=list)
    field_removals: List[str] = field(default_factory=list)
    field_renames: Dict[str, str] = field(default_factory=dict)
    transform_changes: List[str] = field(default_factory=list)
```

---

## 12. Adapter Configuration Summary

### 12.1 Complete Adapter Configuration Matrix

| # | Source | Domain(s) | License | Attribution | Cadence | Cache TTL | Max Staleness | Rate Limit |
|---|--------|-----------|---------|-------------|---------|-----------|---------------|------------|
| 1 | DrugBank | Medication | Commercial | Yes | Monthly | 24h | 30d | 1,000/day |
| 2 | OpenFDA | Safety/Medication | Public Domain | Yes | Quarterly | 7d | 30d | 240/min |
| 3 | RxNorm | Terminology | Public Domain | No | Monthly | 180d | 365d | Fair use |
| 4 | ATC Codes | Terminology | Public Domain | No | Annual | 180d | 365d | Fair use |
| 5 | NDC Database | Medication | Public Domain | No | Monthly | 24h | 30d | Fair use |
| 6 | FAERS | Safety | Public Domain | Yes | Quarterly | 7d | 30d | 240/min |
| 7 | PharmGKB | Pharmacogenomics | CC-BY-NC-SA-4.0 | Yes | Monthly | 24h | 30d | 5,000/day |
| 8 | ClinVar | Genetics | Public Domain | No | Weekly | 7d | 90d | 180/min |
| 9 | MNI152 | Neuroimaging | Academic | Yes | Annual | 30d | 180d | Fair use |
| 10 | AAL Atlas | Neuroimaging | Academic | Yes | Annual | 30d | 180d | Fair use |
| 11 | FreeSurfer | Neuroimaging | GPL | Yes | Annual | 30d | 180d | Fair use |
| 12 | Normative EEG DB | EEG | Academic | Yes | Quarterly | 30d | 90d | Fair use |
| 13 | PubMed | Evidence | Public Domain | No | Daily | 7d | 7d | 10/sec |
| 14 | ClinicalTrials.gov | Evidence | Public Domain | No | Daily | 3d | 14d | 500/min |
| 15 | NIH PROMIS | Outcome | Academic | Yes | Annual | 30d | 90d | Fair use |
| 16 | LOINC | Terminology | UMLS License | Yes | Annual | 180d | 365d | Varies |
| 17 | USDA FoodData | Nutrition | Public Domain | No | Annual | 30d | 90d | 3,600/hr |
| 18 | SNOMED CT | Terminology | UMLS License | Yes | Annual | 180d | 365d | Varies |
| 19 | ICD-10-CM | Terminology | Public Domain | No | Annual | 180d | 365d | Fair use |
| 20 | MedDRA | Terminology | Proprietary | Yes | Quarterly | 180d | 365d | Varies |
| 21 | Allen Brain Atlas | Genetics | Academic | Yes | Monthly | 30d | 90d | Fair use |
| 22 | NeuroVault | Neuroimaging | CC0 | No | Daily | 30d | 90d | Fair use |
| 23 | gnomAD | Genetics | MIT/Odense | Yes | Quarterly | 30d | 90d | Fair use |
| 24 | Cochrane | Evidence | Subscription | Yes | Monthly | 7d | 30d | Varies |
| 25 | NICE Guidelines | Evidence | OGL-UK | Yes | Monthly | 30d | 90d | Fair use |

---

## 13. File Structure

```
DeepSynaps-Protocol-Studio/
└── apps/api/src/adapters/
    ├── __init__.py                      # Adapter registry singleton
    ├── base.py                          # DatabaseAdapter ABC + core models
    ├── cache.py                         # AdapterCache + backends
    ├── etl.py                           # ETLPipeline + PipelineMetrics
    ├── rate_limiter.py                  # TokenBucketRateLimiter
    ├── resilience.py                    # ResilienceHandler
    ├── errors.py                        # Error classes + classification
    ├── provenance.py                    # ProvenanceRecord + TransformStep
    ├── confidence.py                    # ConfidenceScore + ConfidenceRule
    ├── schema.py                        # SchemaMapping + FieldDefinition
    ├── query.py                         # CanonicalQuery + QueryFilter
    ├── registry.py                      # AdapterRegistry + AdapterInfo
    │
    ├── medication/
    │   ├── __init__.py
    │   ├── drugbank_adapter.py
    │   ├── openfda_adapter.py
    │   ├── rxnorm_adapter.py
    │   ├── atc_adapter.py
    │   └── ...
    │
    ├── pharmacogenomics/
    │   ├── __init__.py
    │   ├── pharmgkb_adapter.py          # Full implementation (reference)
    │   └── ...
    │
    ├── genomics/
    │   ├── __init__.py
    │   ├── clinvar_adapter.py           # Full implementation (reference)
    │   ├── gnomad_adapter.py
    │   └── ...
    │
    ├── neuroimaging/
    │   ├── __init__.py
    │   ├── mni152_adapter.py
    │   └── ...
    │
    ├── eeg/
    │   ├── __init__.py
    │   ├── normative_eeg_adapter.py
    │   └── ...
    │
    ├── evidence/
    │   ├── __init__.py
    │   ├── pubmed_adapter.py            # Full implementation (reference)
    │   ├── clinicaltrials_adapter.py
    │   └── ...
    │
    ├── nutrition/
    │   ├── __init__.py
    │   ├── usda_fooddata_adapter.py
    │   └── ...
    │
    ├── terminology/
    │   ├── __init__.py
    │   ├── snomed_adapter.py
    │   └── ...
    │
    └── tests/
        ├── test_base.py
        ├── test_etl.py
        ├── test_cache.py
        ├── test_rate_limiter.py
        ├── test_resilience.py
        ├── test_schema_mapping.py
        ├── test_pharmgkb.py
        ├── test_clinvar.py
        └── ...
```

---

## 14. Summary

### 14.1 Architecture Statistics

| Metric | Count |
|--------|-------|
| Total Adapters | **73** (13 active + 20 critical + 20 high + 20 medium) |
| Abstract Classes | 2 (`DatabaseAdapter`, `CacheBackend`) |
| Core Data Models | 12 (`CanonicalRecord`, `ProvenanceRecord`, `TransformStep`, `ConfidenceScore`, `ConfidenceRule`, `CanonicalQuery`, `QueryFilter`, `AdapterResult`, `AdapterError`, `AdapterHealth`, `SchemaMapping`, `FieldDefinition`) |
| ETL Pipeline Steps | 6 (Extract, Validate, Transform, Enrich, Load, Audit) |
| Reference Adapters Implemented | 4 (PharmGKB, ClinVar, PubMed, OpenFDA) |
| Resilience Patterns | 4 (Circuit Breaker, Retry/Backoff, Cache Fallback, Rate Limiting) |
| Cache Backends | 2 (Redis, In-Memory) |
| Clinical Domains | 14 |

### 14.2 Key Interfaces

1. **`DatabaseAdapter`** (ABC) -- Base interface all 73 adapters implement. 8 properties + 9 methods.
2. **`AdapterRegistry`** (Singleton) -- Central registry with routing, health checks, lifecycle management.
3. **`ETLPipeline`** -- 6-step extract-transform-load pipeline with provenance tracking.
4. **`SchemaMapping`** -- Explicit, auditable field mappings with confidence rules.
5. **`TokenBucketRateLimiter`** -- Per-adapter rate limiting with burst tolerance and jitter.
6. **`AdapterCache`** -- Isolated cache namespaces with TTL management.
7. **`ResilienceHandler`** -- Circuit breaker, retry, and fallback patterns.

### 14.3 Design Guarantees

| Guarantee | Implementation |
|-----------|----------------|
| **Isolation** | Each adapter has independent cache namespace, rate limiter, and error boundary |
| **Versioning** | Adapters and schema mappings are semantically versioned independently |
| **Auditability** | Every query, transform, and load is logged with full provenance chain |
| **Resilience** | Circuit breaker + retry + stale-cache fallback on every adapter |
| **Compliance** | License and attribution are enforced at the adapter boundary |
| **Quality** | Confidence scores computed per-field using configurable rules |
| **Scalability** | Async throughout; independent cache namespaces prevent contention |

---

*DeepSynaps Protocol Studio -- Research Division*
*Confidential -- Internal Use Only*
