"""Compatibility shim — re-exports ``PharmGKBAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.pharmgkb_adapter import (  # noqa: F401
    PharmGKBAdapter,
)

__all__ = ["PharmGKBAdapter"]
