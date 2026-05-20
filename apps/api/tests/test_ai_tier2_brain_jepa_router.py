"""Tests for ``app.routers.ai_tier2_brain_jepa_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_brain_jepa import BRAIN_JEPA_DISCLAIMER


def test_brain_jepa_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/brain-jepa/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False
    assert body["device"] == "cpu"


def test_brain_jepa_embed_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "fmri_uri": "s3://bucket/rest.nii.gz"}
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/brain-jepa/embed", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403


def test_brain_jepa_embed_returns_stub(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "fmri_uri": "s3://bucket/rest.nii.gz"}
    resp = client.post("/api/v1/ai/brain-jepa/embed", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["embedding"] is None
    assert body["embedding_dim"] is None
    assert body["disclaimer"] == BRAIN_JEPA_DISCLAIMER


def test_brain_jepa_embed_rejects_bad_pool(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/ai/brain-jepa/embed",
        json={"patient_id": "p", "fmri_uri": "s3://x", "pool": "median"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422


def test_brain_jepa_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/brain-jepa/health" in schema["paths"]
    assert "/api/v1/ai/brain-jepa/embed" in schema["paths"]
