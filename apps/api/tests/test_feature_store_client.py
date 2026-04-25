from app.services.feature_store_client import InMemoryFeatureStoreClient


def test_cross_tenant_lookup_returns_empty() -> None:
    store = {
        "tenant_a": {
            "patient_1": {
                "fs_v1": {"features": {"x": 1}, "metadata": {"event_id": "evt_1"}},
            }
        }
    }
    client = InMemoryFeatureStoreClient(store=store)

    hit = client.fetch_patient_features("tenant_a", "patient_1", "fs_v1")
    assert hit.features == {"x": 1}
    assert hit.metadata["empty"] is False

    miss = client.fetch_patient_features("tenant_b", "patient_1", "fs_v1")
    assert miss.features == {}
    assert miss.metadata["empty"] is True
    assert miss.metadata["empty_reason"] == "not_found"

