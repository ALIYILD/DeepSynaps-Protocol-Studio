"""Tests for deeptwin_neuroai_lab_router.py — happy path + auth + edge."""
from __future__ import annotations

from fastapi.testclient import TestClient


_BASE_EVENT = {
    "event_id": "e-1",
    "patient_id": "pt-test",
    "event_type": "observation",
    "modality": "qeeg",
    "timestamp": "2024-06-01T12:00:00Z",
    "source": "test",
    "payload": {"band_power": {"alpha": 0.5}},
    "research_only": True,
}


# ── /status ───────────────────────────────────────────────────────────────────


def test_neuroai_status_200_no_auth(client: TestClient) -> None:
    """Status endpoint is public; always returns research_only=True."""
    r = client.get("/api/v1/deeptwin/neuroai/status")
    assert r.status_code == 200
    body = r.json()
    assert body["research_only"] is True
    assert body["clinical_prediction_enabled"] is False
    assert "module" in body


# ── /timeline/preview ─────────────────────────────────────────────────────────


def test_timeline_preview_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    """Clinician gets a timeline summary with envelope."""
    payload = {
        "patient_id": "pt-abc",
        "events": [_BASE_EVENT],
    }
    r = client.post(
        "/api/v1/deeptwin/neuroai/timeline/preview",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    data = r.json()
    assert "summary" in data
    assert "dashboard_series" in data
    assert data["envelope"]["research_only"] is True
    assert data["envelope"]["requires_clinician_review"] is True


def test_timeline_preview_unauthenticated_allowed(client: TestClient) -> None:
    """Timeline preview resolves to a guest actor — no role gate, so it succeeds."""
    r = client.post(
        "/api/v1/deeptwin/neuroai/timeline/preview",
        json={"events": [_BASE_EVENT]},
    )
    # Guest actor is created for unauthenticated requests; no minimum-role gate here.
    assert r.status_code == 200
    assert r.json()["envelope"]["research_only"] is True


def test_timeline_preview_empty_events(client: TestClient, auth_headers: dict) -> None:
    """Empty events list returns an empty summary without error."""
    r = client.post(
        "/api/v1/deeptwin/neuroai/timeline/preview",
        json={"events": []},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    data = r.json()
    assert "summary" in data
    assert isinstance(data["dashboard_series"], list)


# ── /features/preview ────────────────────────────────────────────────────────


def test_features_preview_clinician(client: TestClient, auth_headers: dict) -> None:
    """Clinician can preview feature extraction."""
    r = client.post(
        "/api/v1/deeptwin/neuroai/features/preview",
        json={"events": [_BASE_EVENT]},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert len(data["results"]) == 1
    assert data["results"][0]["event_id"] == "e-1"
    assert data["envelope"]["research_only"] is True


def test_features_preview_unauthenticated_allowed(client: TestClient) -> None:
    """Features preview has no role gate — resolves to guest actor and returns 200."""
    r = client.post(
        "/api/v1/deeptwin/neuroai/features/preview",
        json={"events": [_BASE_EVENT]},
    )
    assert r.status_code == 200
    assert r.json()["envelope"]["research_only"] is True


# ── /simulation/preview ───────────────────────────────────────────────────────


def test_simulation_preview_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    """Clinician can run a simulation preview."""
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={
            "patient_id": "pt-sim",
            "baseline_events": [_BASE_EVENT],
            "time_horizon_days": 30,
            "outcome_domains": ["mood"],
            "evidence_context": "tDCS DLPFC depression",
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    data = r.json()
    assert "result" in data
    assert data["envelope"]["research_only"] is True


def test_simulation_preview_patient_role_forbidden(client: TestClient, auth_headers: dict) -> None:
    """Patient role must be rejected with 403."""
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={"patient_id": "pt-x", "baseline_events": []},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_simulation_preview_requires_auth(client: TestClient) -> None:
    """Simulation preview must reject unauthenticated requests."""
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={"baseline_events": []},
    )
    assert r.status_code == 403


def test_simulation_preview_invalid_horizon_422(client: TestClient, auth_headers: dict) -> None:
    """time_horizon_days must be >= 1 and <= 3650; 0 is invalid."""
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={"baseline_events": [], "time_horizon_days": 0},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422
