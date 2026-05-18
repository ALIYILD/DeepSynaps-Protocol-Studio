"""Compatibility shim — re-exports ``CHBMPAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.chbmp_adapter import (  # noqa: F401
    CHBMPAdapter,
)

__all__ = ["CHBMPAdapter"]
