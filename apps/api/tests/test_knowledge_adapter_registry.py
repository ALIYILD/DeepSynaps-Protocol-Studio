from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.knowledge.adapter_bootstrap import (
    build_production_registry,
    list_production_adapter_keys,
)
from app.services.knowledge.adapter_manifest import (
    ADAPTER_MANIFEST,
    build_drift_report,
    get_live_manifest_keys,
    get_registered_manifest_keys,
)


def test_every_registered_manifest_adapter_exists_and_registers() -> None:
    registry = build_production_registry()
    manifest_keys = set(get_registered_manifest_keys())

    assert set(list_production_adapter_keys()) == manifest_keys
    for key in manifest_keys:
        assert registry.has_adapter(key), f"{key} should be registered"


def test_every_live_exposed_manifest_adapter_is_implemented() -> None:
    for key in get_live_manifest_keys():
        entry = ADAPTER_MANIFEST[key]
        assert entry["implemented"] is True, f"{key} is live_exposed but missing"


def test_drift_report_has_no_registered_or_live_missing_entries() -> None:
    report = build_drift_report()

    assert report["registered_missing_adapters"] == []
    assert report["live_exposed_missing_adapters"] == []


def test_live_router_surfaces_missing_manifest_entries_honestly() -> None:
    from app.routers import knowledge_adapters_live_router as mod

    app = FastAPI()
    app.include_router(mod.router)
    app.dependency_overrides[mod.get_production_registry] = build_production_registry

    with TestClient(app) as client:
        detail = client.get("/api/v1/knowledge/live/adapters/uniprot")
        assert detail.status_code == 200
        payload = detail.json()
        assert payload["status"] == "missing"
        assert payload["implemented"] is False
        assert payload["registered"] is False

        health = client.get("/api/v1/knowledge/live/adapters/uniprot/health")
        assert health.status_code == 200
        health_payload = health.json()
        assert health_payload["status"] == "missing"

        search = client.post(
            "/api/v1/knowledge/live/adapters/uniprot/search",
            json={"query": {"term": "TP53"}},
        )
        assert search.status_code == 409


def test_genetic_bridge_no_longer_embeds_nonexistent_service_module_paths() -> None:
    bridge_path = Path(
        "/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/api/app/knowledge/genetic_analyzer_bridge.py"
    )
    text = bridge_path.read_text()

    assert "app.services.knowledge.adapters.uniprot_adapter" not in text
    assert "app.services.knowledge.adapters.dbsnp_adapter" not in text
    assert "app.services.knowledge.adapters.ensembl_adapter" not in text
    assert "app.services.knowledge.adapters.gwas_catalog_adapter" not in text
