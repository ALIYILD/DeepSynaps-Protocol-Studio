from fastapi.testclient import TestClient

from app.services.clinical_data import EXPECTED_TOTAL_RECORDS


def test_health_endpoint_returns_runtime_status(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["database"] == "ok"
    assert payload["clinical_snapshot"]["total_records"] == EXPECTED_TOTAL_RECORDS


def test_healthz_alias_returns_same_payload(client: TestClient) -> None:
    health_response = client.get("/health")
    healthz_response = client.get("/healthz")

    assert healthz_response.status_code == 200
    assert healthz_response.json() == health_response.json()


def test_health_endpoint_includes_knowledge_adapter_lifecycle(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.knowledge.lifecycle.peek_registry_lifecycle_summary",
        lambda: {
            "total": 2,
            "by_state": {"healthy": 1, "catalogued": 1},
            "adapters": {"pubmed": "healthy", "cochrane": "catalogued"},
        },
    )

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["knowledge_adapters"]["total"] == 2
    assert payload["knowledge_adapters"]["adapters"]["pubmed"] == "healthy"
