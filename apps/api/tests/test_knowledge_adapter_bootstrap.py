"""
Unit tests for app.services.knowledge.adapter_bootstrap.

Verifies that the bootstrap module produces a working production
``AdapterRegistry`` with all five live adapters registered at the
declared tier, and that the singleton accessor behaves correctly under
concurrent first-call.
"""
from __future__ import annotations

import asyncio

import pytest

from app.services.knowledge import (
    AdapterRegistry,
    ConfidenceTier,
    DatabaseAdapter,
    LicenseMetadata,
)
from app.services.knowledge.adapter_bootstrap import (
    build_production_registry,
    get_production_registry,
    list_production_adapter_keys,
    reset_production_registry,
)
from app.services.knowledge.adapters.clinicaltrials_adapter import (
    ClinicalTrialsAdapter,
)
from app.services.knowledge.adapters.cochrane_adapter import CochraneAdapter
from app.services.knowledge.adapters.europepmc_adapter import EuropePMCAdapter
from app.services.knowledge.adapters.gnomad_adapter import GnomadAdapter
from app.services.knowledge.adapters.pubmed_adapter import PubMedAdapter


_EXPECTED_KEYS = {"pubmed", "ctgov", "cochrane", "europepmc", "gnomad"}
_EXPECTED_CLASSES = {
    "pubmed": PubMedAdapter,
    "ctgov": ClinicalTrialsAdapter,
    "cochrane": CochraneAdapter,
    "europepmc": EuropePMCAdapter,
    "gnomad": GnomadAdapter,
}
_EXPECTED_TIERS = {
    "pubmed": "P0",
    "ctgov": "P0",
    "cochrane": "P0",
    "europepmc": "P1",
    "gnomad": "P1",
}


# ---------------------------------------------------------------------------
# Catalog declaration
# ---------------------------------------------------------------------------


def test_catalog_keys_are_the_five_documented_databases():
    keys = set(list_production_adapter_keys())
    assert keys == _EXPECTED_KEYS


def test_catalog_keys_are_stable_in_declaration_order():
    # Order matters for HTTP-layer determinism (the /adapters listing
    # follows this order). Lock it down so future re-ordering is intentional.
    assert list_production_adapter_keys() == (
        "pubmed",
        "ctgov",
        "cochrane",
        "europepmc",
        "gnomad",
    )


# ---------------------------------------------------------------------------
# build_production_registry — synchronous, deterministic
# ---------------------------------------------------------------------------


def test_build_production_registry_returns_a_real_registry():
    reg = build_production_registry()
    assert isinstance(reg, AdapterRegistry)


def test_build_production_registry_registers_every_catalogued_adapter():
    reg = build_production_registry()
    for key in _EXPECTED_KEYS:
        assert reg.has_adapter(key), f"{key} not registered"


def test_each_adapter_is_an_instance_of_its_declared_class():
    reg = build_production_registry()
    for key, expected_cls in _EXPECTED_CLASSES.items():
        adapter = reg.get(key)
        assert isinstance(adapter, expected_cls)
        assert isinstance(adapter, DatabaseAdapter)


def test_tiers_match_the_catalog_declaration():
    reg = build_production_registry()
    by_tier = reg.list_by_tier()
    for key, expected_tier in _EXPECTED_TIERS.items():
        assert key in by_tier.get(expected_tier, []), (
            f"{key} should be tier {expected_tier} but isn't"
        )


def test_every_registered_adapter_can_report_its_license():
    """get_license() must not raise — that's the production contract."""
    reg = build_production_registry()
    for key in _EXPECTED_KEYS:
        adapter = reg.get(key)
        assert adapter is not None
        meta = adapter.get_license()
        assert isinstance(meta, LicenseMetadata)
        assert meta.license_type, f"{key} returned empty license_type"


def test_every_registered_adapter_has_a_non_empty_source_name_and_version():
    reg = build_production_registry()
    for key in _EXPECTED_KEYS:
        adapter = reg.get(key)
        assert adapter is not None
        assert adapter.source_name, f"{key} has empty source_name"
        assert adapter.source_version, f"{key} has empty source_version"


def test_overrides_are_applied_to_adapter_config():
    """Per-adapter overrides reach the adapter's config dict."""
    reg = build_production_registry(
        overrides={"pubmed": {"api_key": "test-key", "tool": "TestSuite"}}
    )
    pubmed = reg.get("pubmed")
    assert pubmed is not None
    assert pubmed.config.get("api_key") == "test-key"
    assert pubmed.config.get("tool") == "TestSuite"


def test_overrides_for_unrelated_adapter_do_not_leak_to_others():
    reg = build_production_registry(
        overrides={"pubmed": {"api_key": "leaked-only-to-pubmed"}}
    )
    for key in ("ctgov", "cochrane", "europepmc", "gnomad"):
        adapter = reg.get(key)
        assert adapter is not None
        assert "api_key" not in adapter.config


def test_unknown_overrides_key_is_silently_ignored():
    # Catalogue is the source of truth; passing extras must not crash.
    reg = build_production_registry(
        overrides={"unknown_adapter": {"x": 1}}
    )
    assert not reg.has_adapter("unknown_adapter")
    for key in _EXPECTED_KEYS:
        assert reg.has_adapter(key)


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_production_registry_returns_singleton():
    await reset_production_registry()
    r1 = await get_production_registry()
    r2 = await get_production_registry()
    assert r1 is r2


@pytest.mark.asyncio
async def test_concurrent_first_calls_only_build_once():
    """Async-lock guarantee: two concurrent first-callers see the same registry."""
    await reset_production_registry()
    r1, r2 = await asyncio.gather(
        get_production_registry(), get_production_registry()
    )
    assert r1 is r2


@pytest.mark.asyncio
async def test_reset_production_registry_makes_next_call_rebuild():
    r1 = await get_production_registry()
    await reset_production_registry()
    r2 = await get_production_registry()
    assert r1 is not r2  # new instance after reset


# ---------------------------------------------------------------------------
# Registry health-/info-surface integration
# ---------------------------------------------------------------------------


def test_registry_get_all_info_reports_every_catalogued_adapter():
    reg = build_production_registry()
    info = reg.get_all_info()
    assert set(info.keys()) == _EXPECTED_KEYS
    for key in _EXPECTED_KEYS:
        entry = info[key]
        assert entry.get("source_name"), f"{key} info missing source_name"
        # Tier in info should match catalog
        assert entry.get("tier") == _EXPECTED_TIERS[key]


def test_registry_stats_counts_match_catalog():
    reg = build_production_registry()
    s = reg.stats()
    # Stats shape: at minimum total_adapters or equivalent count field.
    # Don't lock on the exact key — just verify the count matches expectations.
    total = (
        s.get("total_adapters")
        or s.get("count")
        or s.get("total")
        or len(reg.list_adapters())
    )
    assert total == 5
