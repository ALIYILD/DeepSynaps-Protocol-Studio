"""Compatibility shim — re-exports ``SchaeferAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.schaefer_adapter import (  # noqa: F401
    SchaeferAdapter,
)

__all__ = ["SchaeferAdapter"]
