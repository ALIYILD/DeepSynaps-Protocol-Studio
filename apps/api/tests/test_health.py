from fastapi.testclient import TestClient


def test_health_endpoint_returns_runtime_status(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["database"] == "ok"
    assert payload["clinical_snapshot"]["total_records"] == 201


def test_healthz_alias_returns_same_payload(client: TestClient) -> None:
    health_response = client.get("/health")
    healthz_response = client.get("/healthz")

    assert healthz_response.status_code == 200
    assert healthz_response.json() == health_response.json()
