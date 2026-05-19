"""Minimal MedDRA terminology adapter compatibility shim.

The adverse-event inventory and medication-safety helpers still reference the
historical import path ``app.adapters.meddra_adapter``. The full MedDRA-backed
implementation is not present in this worktree, but those callers only require:

- an importable ``MedDRAAdapter`` class
- a ``display_name`` attribute for inventory health checks
- async ``search()`` and ``close()`` methods for terminology normalization

This shim keeps that contract intact without pretending to provide licensed
MedDRA content. By default it performs a transparent pass-through mapping:
exact-term queries return the queried term itself.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class MedDRAAdapter:
    """Compatibility adapter for MedDRA terminology lookups.

    The real MedDRA dictionary is licensed. In this repository state we expose
    a conservative, non-licensed fallback that preserves import/runtime
    contracts for callers which only need stable terminology normalization
    behavior during tests and degraded local operation.
    """

    display_name = "MedDRA Terminology"
    source_name = "MedDRA"
    source_version = "compat-shim"

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        self.config: Dict[str, Any] = config or {}
        self._closed = False

    async def search(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Return a conservative exact-match style result.

        Without a licensed MedDRA dataset we should not fabricate hierarchy or
        codes. The safest fallback is to echo the requested term so upstream
        normalization remains deterministic and honest.
        """

        del filters
        clean = str(query or "").strip()
        if not clean:
            return []
        return [{"term": clean}]

    async def close(self) -> None:
        self._closed = True

