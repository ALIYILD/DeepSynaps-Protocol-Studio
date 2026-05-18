"""Compatibility shim — re-exports ``SimNIBSAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.simnibs_adapter import (  # noqa: F401
    SimNIBSAdapter,
)

__all__ = ["SimNIBSAdapter"]
