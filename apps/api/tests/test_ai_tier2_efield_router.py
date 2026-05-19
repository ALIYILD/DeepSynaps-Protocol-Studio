"""Tests for ``app.routers.ai_tier2_efield_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_efield import EFIELD_DISCLAIMER


def test_efield_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/efield/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False
    assert "figure8" in body["supported_coil_types"]


def test_efield_simulate_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {
        "patient_id": "pat-001",
        "head_model_uri": "s3://bucket/head.msh",
        "coil_position": [0.0, 0.0, 0.0],
        "coil_orientation": [0.0, 1.0, 0.0],
    }
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/efield/simulate", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403


def test_efield_simulate_returns_stub(client: TestClient, auth_headers: dict) -> None:
    payload = {
        "patient_id": "pat-001",
        "head_model_uri": "s3://bucket/head.msh",
        "coil_position": [-50.0, 20.0, 60.0],
        "coil_orientation": [0.0, 1.0, 0.0],
    }
    resp = client.post("/api/v1/ai/efield/simulate", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["peak_efield_v_per_m"] is None
    assert body["target_efield_v_per_m"] is None
    assert body["off_target_ratio"] is None
    assert body["disclaimer"] == EFIELD_DISCLAIMER


def test_efield_simulate_rejects_bad_position(client: TestClient, auth_headers: dict) -> None:
    payload = {
        "patient_id": "pat-001",
        "head_model_uri": "s3://x",
        "coil_position": [0.0, 0.0],  # not XYZ
        "coil_orientation": [0.0, 1.0, 0.0],
    }
    resp = client.post("/api/v1/ai/efield/simulate", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 422


def test_efield_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/efield/health" in schema["paths"]
    assert "/api/v1/ai/efield/simulate" in schema["paths"]
