"""Tests for ``app.routers.ai_tier1_pubmedbert_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier1_pubmedbert import PUBMEDBERT_DISCLAIMER


def test_pubmedbert_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/pubmedbert/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False
    assert body["status"] == "stub"


def test_pubmedbert_extract_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {"text": "Patient presents with treatment-resistant depression."}
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/pubmedbert/extract", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403, f"role={role} got {resp.status_code}"


def test_pubmedbert_extract_returns_empty_entities(client: TestClient, auth_headers: dict) -> None:
    payload = {"text": "Patient presents with treatment-resistant depression."}
    resp = client.post("/api/v1/ai/pubmedbert/extract", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["entities"] == []
    assert body["text_length"] == len(payload["text"])
    assert body["disclaimer"] == PUBMEDBERT_DISCLAIMER


def test_pubmedbert_extract_rejects_empty_text(client: TestClient, auth_headers: dict) -> None:
    resp = client.post("/api/v1/ai/pubmedbert/extract", json={"text": ""}, headers=auth_headers["clinician"])
    assert resp.status_code == 422, resp.text


def test_pubmedbert_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/pubmedbert/health" in schema["paths"]
    assert "/api/v1/ai/pubmedbert/extract" in schema["paths"]
