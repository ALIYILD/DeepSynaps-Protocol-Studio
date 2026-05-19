"""Tests for ``app.routers.ai_tier2_tms_response_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_tms_response import TMS_RESPONSE_DISCLAIMER


def test_tms_response_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/tms-response/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False
    assert body["auc_reference"] == 0.932


def test_tms_response_predict_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "mri_uri": "s3://bucket/t1.nii.gz"}
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/tms-response/predict", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403


def test_tms_response_predict_returns_stub(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "mri_uri": "s3://bucket/t1.nii.gz"}
    resp = client.post("/api/v1/ai/tms-response/predict", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["predicted_response_probability"] is None
    assert body["feature_attribution"] is None
    assert body["auc_reference"] == 0.932
    assert body["disclaimer"] == TMS_RESPONSE_DISCLAIMER


def test_tms_response_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/tms-response/health" in schema["paths"]
    assert "/api/v1/ai/tms-response/predict" in schema["paths"]
