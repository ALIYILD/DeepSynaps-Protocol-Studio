"""Tests for ``app.routers.ai_tier2_brainharmony_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_brainharmony import BRAINHARMONY_DISCLAIMER


def test_brainharmony_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/brainharmony/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False
    assert body["device"] == "cpu"


def test_brainharmony_fuse_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "smri_uri": "s3://x/t1.nii.gz", "fmri_uri": "s3://x/rest.nii.gz"}
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/brainharmony/fuse", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403


def test_brainharmony_fuse_returns_stub(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "smri_uri": "s3://x/t1.nii.gz", "fmri_uri": "s3://x/rest.nii.gz"}
    resp = client.post("/api/v1/ai/brainharmony/fuse", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["fused_features"] is None
    assert body["feature_dim"] is None
    assert body["disclaimer"] == BRAINHARMONY_DISCLAIMER


def test_brainharmony_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/brainharmony/health" in schema["paths"]
    assert "/api/v1/ai/brainharmony/fuse" in schema["paths"]
