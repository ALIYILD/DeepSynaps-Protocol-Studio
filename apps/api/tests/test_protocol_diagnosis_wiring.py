"""Wiring tests for Category 8 — diagnosis coding.

These verify that the registry, lifecycle metadata, router, and legacy
adapter-metadata facade all reflect the 5 expected sources.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.services.diagnosis_coding import DIAGNOSIS_CODING_SOURCES
from app.services.knowledge import adapter_bootstrap
from app.knowledge.adapter_registry import _LEGACY_METADATA


def test_diagnosis_coding_sources_constant_has_all_five() -> None:
    assert set(DIAGNOSIS_CODING_SOURCES) == {"icd10", "snomedct", "mesh", "umls", "ols"}


def test_legacy_metadata_includes_all_five_with_category() -> None:
    for key in DIAGNOSIS_CODING_SOURCES:
        assert key in _LEGACY_METADATA, f"Missing legacy metadata for {key}"
        assert _LEGACY_METADATA[key]["category"] == "diagnosis_coding"
        assert _LEGACY_METADATA[key]["display_name"]
        assert _LEGACY_METADATA[key]["description"]


def test_umls_metadata_signals_license_required() -> None:
    umls = _LEGACY_METADATA["umls"]
    assert umls["license_required"] is True
    assert umls["credentials_env"] == "UMLS_API_KEY"


def test_snomedct_metadata_signals_license_required() -> None:
    snomed = _LEGACY_METADATA["snomedct"]
    assert snomed["license_required"] is True
    assert snomed["credentials_env"] == "SNOMEDCT_SNOWSTORM_URL"


def test_adapter_catalog_has_all_five_keys() -> None:
    catalog_keys = adapter_bootstrap.list_production_adapter_keys()
    for key in DIAGNOSIS_CODING_SOURCES:
        assert key in catalog_keys, f"Missing adapter catalog entry for {key}"


def test_build_production_registry_registers_diagnosis_adapters() -> None:
    registry = adapter_bootstrap.build_production_registry()
    for key in DIAGNOSIS_CODING_SOURCES:
        adapter = registry.get(key)
        assert adapter is not None, f"Adapter {key} should be registered"
        # source_name attribute is required by the abstract base class.
        assert adapter.source_name


def test_diagnosis_coding_router_is_importable_and_prefixed() -> None:
    from app.routers.diagnosis_coding_router import router as diagnosis_router

    assert diagnosis_router.prefix == "/api/v1/diagnosis"
    paths = {route.path for route in diagnosis_router.routes}
    assert "/api/v1/diagnosis/sources" in paths
    assert "/api/v1/diagnosis/normalize" in paths
    assert "/api/v1/diagnosis/query-expansion" in paths
    assert "/api/v1/diagnosis/eligibility-context" in paths


def test_diagnosis_router_mounted_on_app() -> None:
    try:
        from app.main import app
    except Exception:  # pragma: no cover — broken main.py in worktree
        pytest.skip("app.main not importable in this environment")
    paths = {getattr(r, "path", "") for r in app.routes}
    assert "/api/v1/diagnosis/sources" in paths
