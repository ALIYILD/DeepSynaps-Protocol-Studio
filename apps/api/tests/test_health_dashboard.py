from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.health_dashboard import metrics_router, router


class DummyEvidenceStore:
    def get_stats(self) -> dict:
        return {
            "total_entries": 12,
            "unique_adapters": 2,
        }

    def get_adapter_metadata(self) -> list[dict]:
        return [
            {"adapter_key": "pubmed", "records_count": 7, "status": "active"},
            {"adapter_key": "ctgov", "records_count": 5, "status": "active"},
        ]


def _client_with_state() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.include_router(metrics_router)
    app.state.evidence_store = DummyEvidenceStore()
    return TestClient(app)


def test_health_root_reports_real_knowledge_snapshot() -> None:
    client = _client_with_state()
    response = client.get("/health/")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] in {"degraded", "unhealthy", "healthy"}
    assert data["summary"]["total_adapters"] >= 5
    assert 0 <= data["summary"]["registered_adapters"] <= data["summary"]["total_adapters"]
    assert 0 <= data["summary"]["missing_adapters"] <= data["summary"]["total_adapters"]
    assert data["summary"]["evidence_entries"] == 12
    assert data["components"]["knowledge"]["registry_source"] in {
        "bootstrap_snapshot",
        "app.state",
        "unavailable",
    }
    assert data["components"]["knowledge"]["catalog_adapter_count"] >= 5
    assert data["components"]["evidence_store"]["total_entries"] == 12


def test_health_adapters_uses_knowledge_registry_not_fake_adapter_table() -> None:
    client = _client_with_state()
    response = client.get("/health/adapters")
    assert response.status_code == 200
    data = response.json()

    keys = {item["adapter_key"] for item in data["adapters"]}
    assert {"pubmed", "ctgov", "cochrane", "europepmc", "gnomad"}.issubset(keys)
    assert data["catalog_total"] >= 5
    assert 0 <= data["registered_total"] <= data["catalog_total"]
    assert "stripe-payment" not in keys


def test_adapter_metrics_exports_real_knowledge_adapter_keys() -> None:
    client = _client_with_state()
    response = client.get("/metrics/adapters")
    assert response.status_code == 200
    text = response.text

    assert 'key="pubmed"' in text
    assert 'key="ctgov"' in text
    assert 'key="stripe-payment"' not in text
