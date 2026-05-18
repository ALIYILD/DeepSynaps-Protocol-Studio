"""Compatibility shim — re-exports ``OpenFDAAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.openfda_adapter import (  # noqa: F401
    OpenFDAAdapter,
)

__all__ = ["OpenFDAAdapter"]
