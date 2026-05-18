"""Compatibility shim — re-exports canonical names from
``app.services.knowledge.base_adapter`` so historical sibling imports
under ``app.knowledge`` keep resolving.
"""
from __future__ import annotations

import logging

from app.services.knowledge.base_adapter import (  # noqa: F401  (re-export)
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    FetchError,
    LicenseMetadata,
    ProvenanceRecord,
)

logger = logging.getLogger(__name__)


class BaseAdapter:
    """Historical marker base; superseded by DatabaseAdapter."""
