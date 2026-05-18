"""Compatibility shim — re-exports ``MNIAtlasAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.mni_atlas_adapter import (  # noqa: F401
    MNIAtlasAdapter,
)

__all__ = ["MNIAtlasAdapter"]
