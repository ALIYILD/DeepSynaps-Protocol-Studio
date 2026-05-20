"""Tests for ``app.routers.ai_tier1_unimedvl_router``."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier1_unimedvl import UNIMEDVL_DISCLAIMER


def test_unimedvl_health_stub(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/ai/unimedvl/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["model_loaded"] is False
    assert body["device"] == "cpu"


def test_unimedvl_understand_requires_clinician(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "text": "What is shown?", "image_uri": "s3://x/t1.png"}
    for role in ("guest", "patient"):
        resp = client.post("/api/v1/ai/unimedvl/understand", json=payload, headers=auth_headers[role])
        assert resp.status_code == 403


def test_unimedvl_understand_returns_stub(client: TestClient, auth_headers: dict) -> None:
    payload = {"patient_id": "pat-001", "text": "Describe this T1 axial slice.", "image_uri": "s3://x/t1.png"}
    resp = client.post("/api/v1/ai/unimedvl/understand", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["stub"] is True
    assert body["understanding"] is None
    assert body["caption"] is None
    assert body["disclaimer"] == UNIMEDVL_DISCLAIMER


def test_unimedvl_endpoints_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/unimedvl/health" in schema["paths"]
    assert "/api/v1/ai/unimedvl/understand" in schema["paths"]
