"""HTTP tests for research-only NeuroAI Lab preview routes."""

from fastapi.testclient import TestClient


def test_neuroai_status_public(client: TestClient) -> None:
    r = client.get("/api/v1/deeptwin/neuroai/status")
    assert r.status_code == 200
    body = r.json()
    assert body.get("research_only") is True
    assert body.get("clinical_prediction_enabled") is False


def test_timeline_preview_guest_ok(client: TestClient) -> None:
    payload = {
        "patient_id": "pt-test",
        "events": [
            {
                "event_id": "e1",
                "patient_id": "pt-test",
                "event_type": "observation",
                "modality": "qeeg",
                "timestamp": "2024-06-01T12:00:00Z",
                "source": "test",
                "payload": {"band_power": {"alpha": 0.5}},
                "research_only": True,
            }
        ],
    }
    r = client.post("/api/v1/deeptwin/neuroai/timeline/preview", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert "summary" in data
    assert data["envelope"]["research_only"] is True


def test_simulation_preview_blocked_for_patient(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={"patient_id": "pt-x", "baseline_events": []},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_simulation_preview_ok_for_clinician(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={
            "patient_id": "pt-x",
            "baseline_events": [],
            "proposed_intervention": {
                "intervention_type": "tDCS",
                "target": "M1",
                "duration_minutes": 20,
                "clinician_approved": True,
            },
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["result"]["clinician_review_required"] is True
    assert body["result"]["no_parameter_change_recommendation"] is True
