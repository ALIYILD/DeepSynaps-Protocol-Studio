"""Tests for adapter lifecycle state derivation.

Covers ``app.services.knowledge.lifecycle`` and the cooperation with
``app.services.knowledge.adapter_bootstrap``. These tests intentionally
avoid building the real production registry — lifecycle inspection must
work on metadata alone, with no heavy adapter instantiation and no
upstream calls.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest

from app.services.knowledge import adapter_bootstrap
from app.services.knowledge.lifecycle import (
    DISABLED_ADAPTERS_ENV,
    LifecycleState,
    compute_registry_lifecycle,
    derive_state_from_health,
    peek_registry_lifecycle_summary,
    read_disabled_adapter_keys,
    summarize_lifecycle,
)


# ---------------------------------------------------------------------------
# Fake registry — minimal duck-typed stand-in. compute_registry_lifecycle
# only calls .list_adapters() and .get_all_cached_health().
# ---------------------------------------------------------------------------


class _FakeRegistry:
    def __init__(
        self,
        registered: Optional[List[str]] = None,
        cached_health: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> None:
        self._registered = list(registered or [])
        self._cached = dict(cached_health or {})

    def list_adapters(self) -> List[str]:
        return list(self._registered)

    def get_all_cached_health(self) -> Dict[str, Dict[str, Any]]:
        return dict(self._cached)


# ---------------------------------------------------------------------------
# LifecycleState contract
# ---------------------------------------------------------------------------


def test_lifecycle_state_values_are_stable_contract():
    assert {s.value for s in LifecycleState} == {
        "catalogued",
        "registered",
        "healthy",
        "degraded",
        "disabled",
        "unavailable",
        "unknown",
    }


# ---------------------------------------------------------------------------
# derive_state_from_health
# ---------------------------------------------------------------------------


def test_derive_state_healthy_from_status_ok():
    assert derive_state_from_health({"status": "ok"}) == LifecycleState.HEALTHY
    assert derive_state_from_health({"status": "healthy"}) == LifecycleState.HEALTHY
    assert derive_state_from_health({"status": "up"}) == LifecycleState.HEALTHY


def test_derive_state_healthy_from_connected_only():
    assert (
        derive_state_from_health({"connected": True}) == LifecycleState.HEALTHY
    )


def test_derive_state_degraded():
    assert (
        derive_state_from_health({"status": "degraded"}) == LifecycleState.DEGRADED
    )
    assert (
        derive_state_from_health({"status": "partial"}) == LifecycleState.DEGRADED
    )


def test_derive_state_unavailable_from_status():
    assert (
        derive_state_from_health({"status": "down"}) == LifecycleState.UNAVAILABLE
    )
    assert (
        derive_state_from_health({"status": "error"}) == LifecycleState.UNAVAILABLE
    )


def test_derive_state_unavailable_from_error_field():
    assert (
        derive_state_from_health({"error": "ECONNREFUSED", "connected": False})
        == LifecycleState.UNAVAILABLE
    )


def test_derive_state_unavailable_from_connected_false():
    assert (
        derive_state_from_health({"connected": False}) == LifecycleState.UNAVAILABLE
    )


def test_derive_state_unknown_for_empty_cache():
    assert derive_state_from_health(None) == LifecycleState.UNKNOWN
    assert derive_state_from_health({}) == LifecycleState.UNKNOWN


def test_derive_state_unknown_for_unrecognized_input():
    """Neither status nor connection → UNKNOWN; no fake 'healthy' claims."""
    assert (
        derive_state_from_health({"latency_ms": 123}) == LifecycleState.UNKNOWN
    )


# ---------------------------------------------------------------------------
# compute_registry_lifecycle
# ---------------------------------------------------------------------------


def test_compute_lifecycle_catalogued_when_in_catalog_only():
    fake = _FakeRegistry(registered=[])
    states = compute_registry_lifecycle(fake, catalog_keys=["pubmed", "ctgov"])
    assert states == {
        "pubmed": LifecycleState.CATALOGUED,
        "ctgov": LifecycleState.CATALOGUED,
    }


def test_compute_lifecycle_disabled_overrides_catalogued():
    fake = _FakeRegistry(registered=[])
    states = compute_registry_lifecycle(
        fake,
        catalog_keys=["pubmed", "gnomad"],
        disabled_keys=["gnomad"],
    )
    assert states["pubmed"] == LifecycleState.CATALOGUED
    assert states["gnomad"] == LifecycleState.DISABLED


def test_compute_lifecycle_registered_when_no_cached_health():
    fake = _FakeRegistry(registered=["pubmed"], cached_health={})
    states = compute_registry_lifecycle(fake, catalog_keys=["pubmed"])
    assert states == {"pubmed": LifecycleState.REGISTERED}


def test_compute_lifecycle_healthy_when_cached_ok():
    fake = _FakeRegistry(
        registered=["pubmed"],
        cached_health={"pubmed": {"status": "ok", "connected": True}},
    )
    states = compute_registry_lifecycle(fake, catalog_keys=["pubmed"])
    assert states == {"pubmed": LifecycleState.HEALTHY}


def test_compute_lifecycle_unavailable_when_cached_error():
    fake = _FakeRegistry(
        registered=["pubmed"],
        cached_health={
            "pubmed": {"connected": False, "error": "DNS failure"},
        },
    )
    states = compute_registry_lifecycle(fake, catalog_keys=["pubmed"])
    assert states == {"pubmed": LifecycleState.UNAVAILABLE}


def test_compute_lifecycle_registered_but_disabled_still_reports_state():
    """Disable flag only relabels MISSING adapters."""
    fake = _FakeRegistry(
        registered=["gnomad"],
        cached_health={"gnomad": {"status": "ok"}},
    )
    states = compute_registry_lifecycle(
        fake,
        catalog_keys=["gnomad"],
        disabled_keys=["gnomad"],
    )
    assert states == {"gnomad": LifecycleState.HEALTHY}


def test_compute_lifecycle_mixed_fleet():
    fake = _FakeRegistry(
        registered=["pubmed", "ctgov", "cochrane"],
        cached_health={
            "pubmed": {"status": "ok"},
            "ctgov": {"status": "degraded"},
        },
    )
    states = compute_registry_lifecycle(
        fake,
        catalog_keys=["pubmed", "ctgov", "cochrane", "europepmc", "gnomad"],
        disabled_keys=["gnomad"],
    )
    assert states["pubmed"] == LifecycleState.HEALTHY
    assert states["ctgov"] == LifecycleState.DEGRADED
    assert states["cochrane"] == LifecycleState.REGISTERED
    assert states["europepmc"] == LifecycleState.CATALOGUED
    assert states["gnomad"] == LifecycleState.DISABLED


# ---------------------------------------------------------------------------
# summarize_lifecycle
# ---------------------------------------------------------------------------


def test_summarize_buckets_all_known_states():
    states = {
        "a": LifecycleState.HEALTHY,
        "b": LifecycleState.HEALTHY,
        "c": LifecycleState.DEGRADED,
        "d": LifecycleState.CATALOGUED,
    }
    summary = summarize_lifecycle(states)
    assert summary["total"] == 4
    assert summary["by_state"]["healthy"] == 2
    assert summary["by_state"]["degraded"] == 1
    assert summary["by_state"]["catalogued"] == 1
    assert summary["by_state"]["unknown"] == 0
    assert summary["adapters"] == {
        "a": "healthy",
        "b": "healthy",
        "c": "degraded",
        "d": "catalogued",
    }


def test_summarize_includes_zero_counts_for_unused_states():
    summary = summarize_lifecycle({"x": LifecycleState.HEALTHY})
    for state in LifecycleState:
        assert state.value in summary["by_state"]


# ---------------------------------------------------------------------------
# read_disabled_adapter_keys
# ---------------------------------------------------------------------------


def test_read_disabled_adapter_keys_from_env():
    env = {DISABLED_ADAPTERS_ENV: "pubmed, gnomad,cochrane"}
    assert read_disabled_adapter_keys(env=env) == frozenset(
        {"pubmed", "gnomad", "cochrane"}
    )


def test_read_disabled_adapter_keys_empty():
    assert read_disabled_adapter_keys(env={}) == frozenset()
    assert read_disabled_adapter_keys(env={DISABLED_ADAPTERS_ENV: ""}) == frozenset()
    assert read_disabled_adapter_keys(
        env={DISABLED_ADAPTERS_ENV: " , , "}
    ) == frozenset()


# ---------------------------------------------------------------------------
# peek_registry_lifecycle_summary — sync, side-effect-free
# ---------------------------------------------------------------------------


def test_peek_when_registry_not_built_reports_all_catalogued(monkeypatch):
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)

    builder_calls: List[str] = []

    def _spy_builder(*args, **kwargs):
        builder_calls.append("called")
        raise AssertionError(
            "peek_registry_lifecycle_summary triggered heavy build — this is the "
            "exact regression the lifecycle peek is meant to prevent."
        )

    monkeypatch.setattr(
        adapter_bootstrap, "build_production_registry", _spy_builder
    )

    summary = peek_registry_lifecycle_summary()
    catalog_keys = list(adapter_bootstrap.list_production_adapter_keys())
    assert summary["total"] == len(catalog_keys)
    assert summary["by_state"]["catalogued"] == len(catalog_keys)
    assert summary["by_state"]["healthy"] == 0
    assert summary["by_state"]["registered"] == 0
    assert builder_calls == []


def test_peek_reflects_disabled_env(monkeypatch):
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)
    monkeypatch.setenv(DISABLED_ADAPTERS_ENV, "gnomad")
    summary = peek_registry_lifecycle_summary()
    assert summary["adapters"]["gnomad"] == "disabled"
    assert summary["by_state"]["disabled"] >= 1


def test_peek_with_fake_registry_reports_real_states(monkeypatch):
    fake = _FakeRegistry(
        registered=["pubmed"],
        cached_health={"pubmed": {"status": "ok", "connected": True}},
    )
    monkeypatch.setattr(adapter_bootstrap, "_registry", fake, raising=False)
    monkeypatch.delenv(DISABLED_ADAPTERS_ENV, raising=False)

    summary = peek_registry_lifecycle_summary()
    assert summary["adapters"]["pubmed"] == "healthy"
    catalog_keys = list(adapter_bootstrap.list_production_adapter_keys())
    other_keys = [k for k in catalog_keys if k != "pubmed"]
    for key in other_keys:
        assert summary["adapters"][key] == "catalogued", key


# ---------------------------------------------------------------------------
# Full-catalog coverage
# ---------------------------------------------------------------------------


def test_all_21_catalogued_adapters_appear_in_lifecycle_summary(monkeypatch):
    """Every adapter key declared in _ADAPTER_CATALOG must have a state."""
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)
    monkeypatch.delenv(DISABLED_ADAPTERS_ENV, raising=False)

    catalog_keys = list(adapter_bootstrap.list_production_adapter_keys())
    assert len(catalog_keys) == 21, (
        "Catalog size changed — update this test and the lifecycle doc."
    )
    summary = peek_registry_lifecycle_summary()
    for key in catalog_keys:
        assert key in summary["adapters"], f"Adapter {key!r} missing from summary"
        assert summary["adapters"][key] in {s.value for s in LifecycleState}


def test_lifecycle_peek_does_not_instantiate_adapters(monkeypatch):
    """Patch every catalogued adapter constructor to a tripwire and verify
    that peek_registry_lifecycle_summary still works without invoking any
    of them."""
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)

    catalog = adapter_bootstrap._ADAPTER_CATALOG
    for key, (cls, _tier, _cfg) in list(catalog.items()):

        def _boom(*args, **kwargs):  # pragma: no cover — must never be called
            raise AssertionError(
                "Adapter constructor was called during lifecycle peek — "
                "this is the regression the policy is meant to prevent."
            )

        monkeypatch.setattr(cls, "__init__", _boom, raising=False)

    summary = peek_registry_lifecycle_summary()
    assert summary["total"] >= 1
