"""
DeepSynaps Protocol Studio — Knowledge Layer Service Package

This package provides the core infrastructure for integrating external
biomedical and clinical databases into the DeepSynaps Knowledge Layer.

Architecture overview:
    - base_adapter     : Abstract base class, data models, and scoring
    - adapter_registry : Central registry for adapter lifecycle management
    - etl_pipeline     : Extract-Transform-Load pipeline with recovery

Usage:
    from app.services.knowledge import (
        DatabaseAdapter,
        AdapterRegistry,
        ETLPipeline,
        ProvenanceRecord,
        LicenseMetadata,
        ConfidenceTier,
        EvidenceLevel,
    )
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Base adapter exports
# ---------------------------------------------------------------------------

from app.services.knowledge.base_adapter import (
    # Enumerations
    ConfidenceTier,
    EvidenceLevel,
    # Data classes
    LicenseMetadata,
    ProvenanceRecord,
    # Abstract base
    DatabaseAdapter,
    # Exceptions
    AdapterError,
    ConnectionError,
    FetchError,
    NormalizationError,
    ValidationError,
    LicenseViolationError,
    # TypedDict helpers
    ProvenanceDict,
    HealthStatusDict,
)

# ---------------------------------------------------------------------------
# Adapter registry exports
# ---------------------------------------------------------------------------

from app.services.knowledge.adapter_registry import (
    AdapterRegistry,
    AdapterInfo,
    # Exceptions
    RegistryError,
    AdapterNotFoundError,
    AdapterAlreadyRegisteredError,
    InvalidTierError,
    # Tier definitions
    VALID_TIERS,
    TIER_DESCRIPTIONS,
)

# ---------------------------------------------------------------------------
# ETL pipeline exports
# ---------------------------------------------------------------------------

from app.services.knowledge.etl_pipeline import (
    ETLPipeline,
    ETLResult,
    # Enums
    ETLStage,
    ETLStatus,
    # Exceptions
    ETLPipelineError,
    ETLStageError,
    ETLCheckpointError,
    ETLRetryExhaustedError,
    # Configuration defaults
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAY,
    DEFAULT_BATCH_CONCURRENCY,
    DEFAULT_CHECKPOINT_DIR,
)

__all__ = [
    # --- base_adapter ---
    "ConfidenceTier",
    "EvidenceLevel",
    "LicenseMetadata",
    "ProvenanceRecord",
    "DatabaseAdapter",
    "AdapterError",
    "ConnectionError",
    "FetchError",
    "NormalizationError",
    "ValidationError",
    "LicenseViolationError",
    "ProvenanceDict",
    "HealthStatusDict",
    # --- adapter_registry ---
    "AdapterRegistry",
    "AdapterInfo",
    "RegistryError",
    "AdapterNotFoundError",
    "AdapterAlreadyRegisteredError",
    "InvalidTierError",
    "VALID_TIERS",
    "TIER_DESCRIPTIONS",
    # --- etl_pipeline ---
    "ETLPipeline",
    "ETLResult",
    "ETLStage",
    "ETLStatus",
    "ETLPipelineError",
    "ETLStageError",
    "ETLCheckpointError",
    "ETLRetryExhaustedError",
    "DEFAULT_MAX_RETRIES",
    "DEFAULT_RETRY_DELAY",
    "DEFAULT_BATCH_CONCURRENCY",
    "DEFAULT_CHECKPOINT_DIR",
]
