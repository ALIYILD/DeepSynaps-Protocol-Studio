"""Compatibility shim — re-exports ``ADNIAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.adni_adapter import (  # noqa: F401
    ADNIAdapter,
)

__all__ = ["ADNIAdapter"]
