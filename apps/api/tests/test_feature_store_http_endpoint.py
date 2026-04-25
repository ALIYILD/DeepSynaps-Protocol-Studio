from __future__ import annotations


def test_feature_store_http_endpoint_requires_clinician(client, auth_headers) -> None:
    r = client.get("/api/v1/feature-store/patients/p1/features?feature_set=full", headers=auth_headers["guest"])
    assert r.status_code == 403


def test_feature_store_http_endpoint_returns_envelope(client, auth_headers, monkeypatch) -> None:
    # Force a deterministic, non-empty response without requiring Redis.
    from app.services.feature_store_client import InMemoryFeatureStoreClient

    store = {
        "tenant_a": {
            "p1": {
                "full": {"features": {"qeeg": {"alpha_power": 1.0}}, "metadata": {"max_occurred_at": "2026-01-01T00:00:00Z"}},
            }
        }
    }
    client_impl = InMemoryFeatureStoreClient(store=store)

    monkeypatch.setattr("app.routers.feature_store_router.build_feature_store_client", lambda _settings: client_impl)
    monkeypatch.setattr("app.routers.feature_store_router.get_settings", lambda: type("S", (), {"feature_store_default_tenant_id": "tenant_a"})())

    r = client.get(
        "/api/v1/feature-store/patients/p1/features?feature_set=full&tenant_id=tenant_a",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["tenant_id"] == "tenant_a"
    assert body["patient_id"] == "p1"
    assert body["feature_set"] == "full"
    assert body["features"]["qeeg"]["alpha_power"] == 1.0
    assert isinstance(body["metadata"], dict)

