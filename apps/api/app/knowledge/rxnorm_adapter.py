"""Compatibility shim — re-exports ``RxNormAdapter`` from its canonical
home at :mod:`app.services.knowledge.adapters.rxnorm_adapter`.

Historical imports such as

    from app.knowledge.rxnorm_adapter import RxNormAdapter

(used by ``adapter_registry`` and ``medication_analyzer_bridge``) were
dead-on-main before this shim existed.

Note: the canonical module hard-imports ``aiohttp`` at module load.
``aiohttp`` is not declared in this app's ``pyproject.toml`` so the
canonical import can fail in lean environments — that's a separate dep
issue tracked in the follow-up issue.
"""
from __future__ import annotations

from app.services.knowledge.adapters.rxnorm_adapter import (  # noqa: F401
    RxNormAdapter,
)

__all__ = ["RxNormAdapter"]
