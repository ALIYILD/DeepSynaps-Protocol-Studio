"""Compatibility shim — re-exports ``ClinVarAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.clinvar_adapter import (  # noqa: F401
    ClinVarAdapter,
)

__all__ = ["ClinVarAdapter"]
