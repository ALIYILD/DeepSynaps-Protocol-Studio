"""Compatibility shim — re-exports ``NeurosynthAdapter`` from the
canonical home under ``app.services.knowledge.adapters``."""
from __future__ import annotations

from app.services.knowledge.adapters.neurosynth_adapter import (  # noqa: F401
    NeurosynthAdapter,
)

__all__ = ["NeurosynthAdapter"]
