"""Compatibility shim — re-exports ``ABIDEAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.abide_adapter import (  # noqa: F401
    ABIDEAdapter,
)

__all__ = ["ABIDEAdapter"]
