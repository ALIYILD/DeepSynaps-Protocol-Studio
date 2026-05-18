"""Compatibility shim — three canonical adapters (chbmp, promis, simnibs)
import their base types from ``app.services.knowledge.adapters.base``
instead of the actual canonical location ``..base_adapter``. Re-exporting
here is smaller than touching each adapter's imports.
"""
from __future__ import annotations

from app.services.knowledge.base_adapter import (  # noqa: F401
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)

__all__ = [
    "ConfidenceTier",
    "DatabaseAdapter",
    "EvidenceLevel",
    "LicenseMetadata",
    "ProvenanceRecord",
]
