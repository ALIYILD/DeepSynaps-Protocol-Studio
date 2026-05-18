"""Regression tests for the app.knowledge import shims.

Two modules under apps/api/app/knowledge/ are intentionally thin
re-export shims so historical sibling-import statements
(`from .base_adapter import BaseAdapter, FetchError, logger` and
`from app.knowledge.rxnorm_adapter import RxNormAdapter`) keep working
after the canonical implementations were moved under
`app.services.knowledge`.

Without these shims, 6 adapters + the registry are dead-on-import on
main. The first failing test below pins the immediate symptom; further
tests will be added in follow-up commits once this one is green.
"""
from __future__ import annotations

import importlib
import importlib.util

import pytest

# The canonical rxnorm_adapter hard-imports aiohttp at module load. aiohttp
# is not in apps/api/pyproject.toml today (tracked in a follow-up issue),
# so when it happens to be missing we skip the consumer-import test rather
# than fail it — the shim itself is correct, the dep declaration is the
# separate bug.
_AIOHTTP_AVAILABLE = importlib.util.find_spec("aiohttp") is not None


def test_base_adapter_shim_reexports_canonical_types() -> None:
    mod = importlib.import_module("app.knowledge.base_adapter")
    for name in (
        "ConfidenceTier",
        "DatabaseAdapter",
        "EvidenceLevel",
        "LicenseMetadata",
        "ProvenanceRecord",
        "FetchError",
        "BaseAdapter",
        "logger",
    ):
        assert hasattr(mod, name), f"app.knowledge.base_adapter missing {name!r}"


def test_base_adapter_is_instantiable_with_no_args() -> None:
    """The 5 simple file/ZIP adapters (NDC, Orange Book, OTseeker, PEDro,
    UNII) all construct with zero arguments — ``NdcDirectoryAdapter()`` —
    so BaseAdapter must be concrete and accept the empty-args call."""
    from app.knowledge.base_adapter import BaseAdapter

    BaseAdapter()  # must not raise


def test_rxnorm_adapter_shim_reexports_class() -> None:
    """Pure shim test: the module exposes ``RxNormAdapter`` from the
    canonical home. Skipped in environments missing the optional
    ``aiohttp`` dep (the canonical module imports it at module load)."""
    if not _AIOHTTP_AVAILABLE:
        pytest.skip("aiohttp missing — canonical rxnorm adapter cannot load")
    mod = importlib.import_module("app.knowledge.rxnorm_adapter")
    assert hasattr(mod, "RxNormAdapter")


@pytest.mark.skipif(not _AIOHTTP_AVAILABLE, reason="aiohttp missing")
def test_medication_analyzer_bridge_imports_cleanly() -> None:
    """The bridge imports ``ConfidenceTier``, ``DatabaseAdapter``,
    ``EvidenceLevel``, ``LicenseMetadata``, ``ProvenanceRecord`` from
    ``app.knowledge.base_adapter`` and ``RxNormAdapter`` from
    ``app.knowledge.rxnorm_adapter`` — both targets are shims maintained
    here. Crashes at import time without them."""
    importlib.import_module("app.knowledge.medication_analyzer_bridge")


@pytest.mark.skipif(not _AIOHTTP_AVAILABLE, reason="aiohttp missing")
def test_adapter_registry_imports_cleanly() -> None:
    """``adapter_registry`` imports ~60 adapter classes from
    ``app.knowledge.*``. Several of those need re-export shims because
    the canonical implementations live under
    ``app.services.knowledge.adapters``. Without those shims, the
    registry crashes at the first missing import and the entire
    Knowledge Layer is unreachable.

    Skipped when ``aiohttp`` is missing because many canonical adapters
    transitively require it (#1025)."""
    importlib.import_module("app.knowledge.adapter_registry")
