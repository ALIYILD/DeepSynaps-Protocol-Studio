"""Compatibility shim — re-exports ``PROMISAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.promis_adapter import (  # noqa: F401
    PROMISAdapter,
)

__all__ = ["PROMISAdapter"]
