"""Tests for ``app.routers.ai_tier2_lightgbm_dbs_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_lightgbm_dbs import LIGHTGBM_DBS_DISCLAIMER


def test_dbs_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/dbs-predict/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False
    assert body["auc_reference"] == 0.921


def test_dbs_predict_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "clinical_features": {}}
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/dbs-predict/predict", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403


def test_dbs_predict_returns_stub(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "clinical_features": {"updrs_iii": 42.0}}
    resp = client.post("/api/v1/ai/dbs-predict/predict", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["predicted_motor_improvement_pct"] is None
    assert body["auc_reference"] == 0.921
    assert body["disclaimer"] == LIGHTGBM_DBS_DISCLAIMER


def test_dbs_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/dbs-predict/health" in schema["paths"]
    assert "/api/v1/ai/dbs-predict/predict" in schema["paths"]
