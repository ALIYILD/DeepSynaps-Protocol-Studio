"""Tests for ``app.routers.ai_tier2_medfuse_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_medfuse import MEDFUSE_DISCLAIMER


def test_medfuse_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/medfuse/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False
    assert "mri" in body["supported_modalities"]
    assert "eeg" in body["supported_modalities"]


def test_medfuse_fuse_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "modalities": {"mri": "s3://x.nii.gz"}}
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/medfuse/fuse", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403


def test_medfuse_fuse_returns_stub(client: TestClient, auth_headers: dict) -> None:
    payload = {
        "patient_id": "pat-001",
        "modalities": {"mri": "s3://x.nii.gz", "eeg": "s3://y.edf"},
    }
    resp = client.post("/api/v1/ai/medfuse/fuse", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["fused_embedding"] is None
    assert body["embedding_dim"] is None
    assert set(body["modalities_used"]) == {"mri", "eeg"}
    assert body["disclaimer"] == MEDFUSE_DISCLAIMER


def test_medfuse_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/medfuse/health" in schema["paths"]
    assert "/api/v1/ai/medfuse/fuse" in schema["paths"]
