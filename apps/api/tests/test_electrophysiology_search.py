from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.electrophysiology_router import router as electrophysiology_router


app = FastAPI()
app.include_router(electrophysiology_router)
client = TestClient(app)


def test_electrophysiology_search_returns_normalized_reference_shape() -> None:
    resp = client.post(
        "/api/v1/electrophysiology/search",
        json={
            "modality": "qEEG",
            "condition": "sleep",
            "recording_condition": "sleep",
            "frequency_band": "theta",
            "biomarker": "slow-wave activity",
            "age_group": "adult",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision_support_only"] is True
    assert "not diagnostic" in body["decision_support_disclaimer"].lower()
    assert body["partial"] is False
    assert body["source_count"] == 4
    assert len(body["source_statuses"]) == 4
    assert len(body["matching_reference_datasets"]) == 4
    assert body["matching_reference_datasets"][0]["source_id"] == "sleep_edf"

    first = body["matching_reference_datasets"][0]
    required = {
        "source",
        "source_id",
        "dataset_name",
        "modality",
        "recording_condition",
        "population_context",
        "frequency_band",
        "biomarker_tags",
        "artifact_tags",
        "access_license_notes",
        "provenance",
        "limitations",
        "warnings",
        "decision_support_disclaimer",
    }
    assert required.issubset(first.keys())
    assert "normative_zscore" not in first
    assert any("reference dataset only" in " ".join(row["warnings"]).lower() for row in body["matching_reference_datasets"])


def test_electrophysiology_adapter_lookup_is_honest() -> None:
    resp = client.get("/api/v1/electrophysiology/adapters/eegbase")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_id"] == "eegbase"
    assert body["lifecycle_state"] == "catalogued"
    assert body["status"] == "catalogued"
