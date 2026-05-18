from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.knowledge.lifecycle import (
    LifecycleState,
    compute_registry_lifecycle,
    read_disabled_adapter_keys,
    summarize_lifecycle,
)


class _FakeRegistry:
    def __init__(self, names: list[str], info: dict[str, dict], health: dict[str, dict]):
        self._names = names
        self._info = info
        self._health = health

    def list_adapters(self) -> list[str]:
        return list(self._names)

    def get_all_info(self) -> dict[str, dict]:
        return dict(self._info)

    def get_all_cached_health(self) -> dict[str, dict]:
        return dict(self._health)


def test_read_disabled_adapter_keys_parses_csv_tokens() -> None:
    disabled = read_disabled_adapter_keys(
        {"DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS": "gnomad, ctgov , ,cochrane"}
    )
    assert disabled == frozenset({"gnomad", "ctgov", "cochrane"})


def test_compute_registry_lifecycle_marks_catalogued_disabled_and_cached_health() -> None:
    registry = _FakeRegistry(
        names=["pubmed", "ctgov", "gnomad"],
        info={
            "pubmed": {"source_name": "PubMed", "source_version": "2026", "tier": "P0", "connected": True},
            "ctgov": {"source_name": "ClinicalTrials.gov", "source_version": "v2", "tier": "P0", "connected": False},
            "gnomad": {"source_name": "gnomAD", "source_version": "4", "tier": "P1", "connected": True},
        },
        health={
            "pubmed": {"status": "ok"},
            "ctgov": {"status": "degraded"},
        },
    )

    states = compute_registry_lifecycle(
        registry,
        catalog_keys=["pubmed", "ctgov", "gnomad", "cochrane", "abide"],
        disabled_keys=["abide"],
    )

    assert states["pubmed"] is LifecycleState.HEALTHY
    assert states["ctgov"] is LifecycleState.DEGRADED
    assert states["gnomad"] is LifecycleState.REGISTERED
    assert states["cochrane"] is LifecycleState.CATALOGUED
    assert states["abide"] is LifecycleState.DISABLED


def test_summarize_lifecycle_counts_states() -> None:
    summary = summarize_lifecycle(
        {
            "pubmed": LifecycleState.HEALTHY,
            "ctgov": LifecycleState.DEGRADED,
            "abide": LifecycleState.DISABLED,
            "cochrane": LifecycleState.CATALOGUED,
        }
    )

    assert summary["total"] == 4
    assert summary["by_state"]["healthy"] == 1
    assert summary["by_state"]["degraded"] == 1
    assert summary["by_state"]["disabled"] == 1
    assert summary["by_state"]["catalogued"] == 1
    assert summary["adapters"]["ctgov"] == "degraded"


def test_live_adapter_routes_expose_lifecycle_states(monkeypatch) -> None:
    from app.routers import knowledge_adapters_live_router as mod

    registry = _FakeRegistry(
        names=["pubmed", "ctgov"],
        info={
            "pubmed": {"source_name": "PubMed", "source_version": "2026", "tier": "P0", "connected": True},
            "ctgov": {"source_name": "ClinicalTrials.gov", "source_version": "v2", "tier": "P0", "connected": False},
        },
        health={
            "pubmed": {"status": "ok"},
            "ctgov": {"status": "down", "error": "timeout"},
        },
    )

    app = FastAPI()
    app.include_router(mod.router)
    app.dependency_overrides[mod.get_production_registry] = lambda: registry

    monkeypatch.setattr(mod, "list_production_adapter_keys", lambda: ("pubmed", "ctgov", "cochrane", "abide"))
    monkeypatch.setattr(mod, "list_disabled_adapter_keys", lambda: ("abide",))

    with TestClient(app) as client:
        adapters = client.get("/api/v1/knowledge/live/adapters")
        assert adapters.status_code == 200
        payload = adapters.json()
        by_key = {row["key"]: row for row in payload["adapters"]}
        assert by_key["pubmed"]["lifecycle_state"] == "healthy"
        assert by_key["ctgov"]["lifecycle_state"] == "unavailable"
        assert by_key["cochrane"]["lifecycle_state"] == "catalogued"
        assert by_key["abide"]["lifecycle_state"] == "disabled"

        lifecycle = client.get("/api/v1/knowledge/live/adapters/_lifecycle")
        assert lifecycle.status_code == 200
        summary = lifecycle.json()
        assert summary["total"] == 4
        assert summary["by_state"]["healthy"] == 1
        assert summary["by_state"]["unavailable"] == 1
        assert summary["by_state"]["catalogued"] == 1
        assert summary["by_state"]["disabled"] == 1
