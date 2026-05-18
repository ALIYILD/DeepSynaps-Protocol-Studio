"""Compatibility shim — re-exports ``FAERSAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.faers_adapter import (  # noqa: F401
    FAERSAdapter,
)

__all__ = ["FAERSAdapter"]
