"""Compatibility shim — re-exports ``AllenBrainAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.allen_brain_adapter import (  # noqa: F401
    AllenBrainAdapter,
)

__all__ = ["AllenBrainAdapter"]
