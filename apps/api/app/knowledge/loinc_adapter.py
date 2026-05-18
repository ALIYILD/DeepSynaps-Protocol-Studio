"""Compatibility shim — re-exports ``LOINCAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.loinc_adapter import (  # noqa: F401
    LOINCAdapter,
)

__all__ = ["LOINCAdapter"]
