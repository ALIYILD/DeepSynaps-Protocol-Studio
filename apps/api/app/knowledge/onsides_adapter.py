"""Compatibility shim — re-exports ``OnSIDESAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.onsides_adapter import (  # noqa: F401
    OnSIDESAdapter,
)

__all__ = ["OnSIDESAdapter"]
