"""Tests for ``app.routers.ai_tier2_cbramod_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier2_cbramod import CBRAMOD_DISCLAIMER


def test_cbramod_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/cbramod/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False


def test_cbramod_embed_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001"}
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/cbramod/embed", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403


def test_cbramod_embed_returns_stub(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "channels": ["Fp1", "Fp2", "F3", "F4"]}
    resp = client.post("/api/v1/ai/cbramod/embed", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["embedding"] is None
    assert body["embedding_dim"] is None
    assert body["disclaimer"] == CBRAMOD_DISCLAIMER


def test_cbramod_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/cbramod/health" in schema["paths"]
    assert "/api/v1/ai/cbramod/embed" in schema["paths"]
