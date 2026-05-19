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


def test_all_catalogued_adapters_appear_in_lifecycle_summary(monkeypatch):
    """Every adapter key declared in _ADAPTER_CATALOG must have a state.

    The count is asserted at a >= floor rather than an exact value so
    that adding a new adapter does not require updating this test in
    lockstep — the regression that matters is "an adapter is in the
    catalog but missing from the lifecycle summary", not "the catalog
    grew".
    """
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)
    monkeypatch.delenv(DISABLED_ADAPTERS_ENV, raising=False)

    catalog_keys = list(adapter_bootstrap.list_production_adapter_keys())
    assert len(catalog_keys) >= 21, (
        f"Catalog shrunk unexpectedly to {len(catalog_keys)} entries; "
        "investigate which adapter was removed and whether that removal was "
        "intended."
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


# ---------------------------------------------------------------------------
# Deferred / license-blocked source invariants
# ---------------------------------------------------------------------------
#
# Some sources are explicitly DEFERRED (status ⏳ in
# docs/engineering/knowledge-adapter-roadmap.md) because their license
# terms conflict with the DeepSynaps Knowledge Layer's
# dashboard / derivative-product use case. These invariants exist so a
# future contributor (or autonomous agent) cannot silently re-introduce
# the source by adding it to the production catalog or by dropping an
# adapter file into the canonical adapters directory.
#
# To re-enable a deferred source, the operator must:
#   1. Acquire a commercial license that explicitly permits the
#      derivative-product use case (or otherwise resolve the legal
#      blocker recorded in the roadmap).
#   2. Update the roadmap doc: status ⏳ → 📋 with explicit operator note.
#   3. Remove the key from DEFERRED_KNOWLEDGE_ADAPTERS below.
#   4. Add the adapter to apps/api/app/services/knowledge/adapter_bootstrap.py.
#
# Adding the adapter file or catalog entry WITHOUT step 3 will fail this
# test, which is the intended guardrail.

DEFERRED_KNOWLEDGE_ADAPTERS = frozenset(
    {
        # Roadmap row #89, § 10.2. License: "not intended for bulk data or
        # to power dashboards or other derivative products" — direct conflict
        # with the Knowledge Layer's use case. Deferred 2026-05-19.
        "dimensions",
    }
)


def test_deferred_adapters_not_in_production_catalog():
    """Every deferred source must be absent from _ADAPTER_CATALOG.

    Adding a deferred key to the catalog re-enables the source for
    runtime instantiation and federated search, which is the exact
    behaviour the deferral forbids.
    """
    catalog_keys = set(adapter_bootstrap.list_production_adapter_keys())
    overlap = catalog_keys & DEFERRED_KNOWLEDGE_ADAPTERS
    assert not overlap, (
        f"Deferred knowledge adapter(s) leaked into the production catalog: "
        f"{sorted(overlap)}. Remove from _ADAPTER_CATALOG in "
        f"apps/api/app/services/knowledge/adapter_bootstrap.py, OR if the "
        f"deferral has been formally lifted (operator decision + roadmap "
        f"update + license review), remove the key from "
        f"DEFERRED_KNOWLEDGE_ADAPTERS in this file."
    )


def test_deferred_adapters_have_no_adapter_file_on_disk():
    """No `<key>_adapter.py` may exist for a deferred source.

    The mere presence of an adapter file is risky: any future code that
    iterates the adapters directory (registry bootstraps, import
    discovery, doc generators) would surface the deferred source.
    """
    from pathlib import Path

    adapters_dir = (
        Path(__file__).resolve().parent.parent
        / "app"
        / "services"
        / "knowledge"
        / "adapters"
    )
    leaked: list = []
    for key in DEFERRED_KNOWLEDGE_ADAPTERS:
        candidate = adapters_dir / f"{key}_adapter.py"
        if candidate.exists():
            leaked.append(candidate.as_posix())
    assert not leaked, (
        f"Adapter file(s) for deferred source(s) found on disk: {leaked}. "
        f"Delete the file. If the deferral has been formally lifted, also "
        f"remove the key from DEFERRED_KNOWLEDGE_ADAPTERS in this test "
        f"and from the ⏳ row in docs/engineering/knowledge-adapter-roadmap.md."
    )


def test_deferred_adapters_lifecycle_state_is_unknown(monkeypatch):
    """A deferred source must not appear as healthy/registered/catalogued in
    the live lifecycle summary — it should simply be absent.

    Because the deferred key is NOT in _ADAPTER_CATALOG and NOT in
    DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS (the disable mechanism is for
    operator-toggled adapters that DO have a catalog entry, not for
    policy-deferred sources), the key should not appear in the summary
    at all.
    """
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)
    monkeypatch.delenv(DISABLED_ADAPTERS_ENV, raising=False)

    summary = peek_registry_lifecycle_summary()
    for key in DEFERRED_KNOWLEDGE_ADAPTERS:
        assert key not in summary["adapters"], (
            f"Deferred source {key!r} appeared in lifecycle summary; expected "
            f"absent. Check that it has not been re-added to _ADAPTER_CATALOG."
        )


# ---------------------------------------------------------------------------
# ABC-inheritance invariant for catalogued adapters
# ---------------------------------------------------------------------------
#
# Before 2026-05-19, FAERS and OnSIDES adapters were declared as plain
# classes (no `(DatabaseAdapter)` inheritance) despite being in the
# production catalog. AdapterRegistry.register() rejects non-DatabaseAdapter
# instances, so both keys were silently dropped from every built registry
# while still appearing in the catalog — they showed up CATALOGUED on
# /health forever. The audit subagent that surfaced this on 2026-05-19
# also flagged it as RED-critical because the failure was silent.
#
# This invariant prevents the regression returning.


def test_every_catalogued_adapter_class_inherits_databaseadapter():
    """Each class registered in _ADAPTER_CATALOG must be a DatabaseAdapter
    subclass at the class level — separate from instantiation, so this
    catches the bug even if `__init__` has pre-existing issues."""
    from app.services.knowledge.base_adapter import DatabaseAdapter

    catalog = adapter_bootstrap._ADAPTER_CATALOG
    offenders: list = []
    for key, (cls, _tier, _cfg) in catalog.items():
        if not issubclass(cls, DatabaseAdapter):
            offenders.append((key, cls.__module__ + "." + cls.__name__))
    assert not offenders, (
        "Catalogued adapter class(es) do not inherit DatabaseAdapter — "
        f"registry will silently drop them: {offenders}. Add "
        "`(DatabaseAdapter)` to the class declaration and ensure the "
        "ABC is imported."
    )


def test_every_catalogued_adapter_passes_isinstance_check_on_empty_config():
    """Every catalogued class, instantiated with empty config, must satisfy
    isinstance(_, DatabaseAdapter) — the exact predicate AdapterRegistry
    uses at register() time. Adapters whose __init__ raises on empty config
    are skipped (separate from the inheritance question)."""
    from app.services.knowledge.base_adapter import DatabaseAdapter

    catalog = adapter_bootstrap._ADAPTER_CATALOG
    failures: list = []
    for key, (cls, _tier, _cfg) in catalog.items():
        try:
            instance = cls({})
        except Exception:
            # Constructor-raises-on-empty-config is tracked separately
            # (Priority 6 audit). Inheritance is the lane this test guards.
            continue
        if not isinstance(instance, DatabaseAdapter):
            failures.append(
                f"{key} -> {cls.__module__}.{cls.__name__} "
                f"(instance type {type(instance).__module__}.{type(instance).__name__})"
            )
    assert not failures, (
        "Catalogued adapter instance(s) failed isinstance(DatabaseAdapter) "
        f"despite being constructed successfully: {failures}. The class "
        "may have lost its inheritance or be defined under a parallel "
        "DatabaseAdapter ABC."
    )
