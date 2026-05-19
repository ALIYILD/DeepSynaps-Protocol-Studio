"""Tests for ``app.routers.ai_tier3_edge_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier3_edge import TIER3_DISCLAIMER


def test_tier3_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/tier3/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["eegnet_loaded"] is False
    assert body["llamacpp_loaded"] is False
    assert body["device"] == "cpu"


def test_tier3_screen_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/tier3/screen", json={}, headers=auth_headers[role])
        assert resp.status_code == 403


def test_tier3_screen_returns_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/ai/tier3/screen",
        json={"sampling_rate_hz": 256, "channels": ["Fp1", "Fp2"]},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["screening_flag"] is None
    assert body["score"] is None
    assert body["disclaimer"] == TIER3_DISCLAIMER


def test_tier3_chat_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    for role in ("guest", "patient"):
        resp = client.post(
            "/api/v1/ai/tier3/chat", json={"prompt": "Hi"}, headers=auth_headers[role]
        )
        assert resp.status_code == 403


def test_tier3_chat_returns_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/ai/tier3/chat",
        json={"prompt": "Summarize the morning notes."},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["output"] is None
    assert body["disclaimer"] == TIER3_DISCLAIMER


def test_tier3_chat_rejects_empty_prompt(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/ai/tier3/chat", json={"prompt": ""}, headers=auth_headers["clinician"]
    )
    assert resp.status_code == 422


def test_tier3_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/tier3/health" in schema["paths"]
    assert "/api/v1/ai/tier3/screen" in schema["paths"]
    assert "/api/v1/ai/tier3/chat" in schema["paths"]
