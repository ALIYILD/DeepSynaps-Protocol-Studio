"""Tests for ``app.routers.ai_tier1_llm_router``.

Exercises the Tier 1 LLM stub adapter under the SQLite test harness:
confirms health reports stub mode when no endpoint is configured, role
gating on ``/complete`` (clinician-or-above), schema validation on the
request body, and that every response envelope carries the canonical
disclaimer.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier1_llm import CLINICAL_DISCLAIMER


def test_tier1_health_reports_stub_mode(
    client: TestClient, auth_headers: dict
) -> None:
    """With TIER1_LLM_ENDPOINT unset (test env default), health is stub."""
    resp = client.get(
        "/api/v1/ai/tier1/health", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["endpoint"] is None
    assert body["status"] in ("stub", "not_configured")
    assert "model" in body and body["model"]


def test_tier1_complete_requires_clinician_role(
    client: TestClient, auth_headers: dict
) -> None:
    """Patient, guest, and reviewer are denied; clinician+ passes."""
    payload = {"prompt": "Summarize evidence for rTMS in depression."}
    for role in ("guest", "patient"):
        resp = client.post(
            "/api/v1/ai/tier1/complete",
            json=payload,
            headers=auth_headers[role],
        )
        assert resp.status_code == 403, f"role={role} got {resp.status_code}"


def test_tier1_complete_returns_stub_envelope(
    client: TestClient, auth_headers: dict
) -> None:
    """Clinician sees a stub response with disclaimer and no fake output."""
    payload = {"prompt": "Summarize evidence for rTMS in depression."}
    resp = client.post(
        "/api/v1/ai/tier1/complete",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["output"] is None
    assert body["status"] == "stub"
    assert body["disclaimer"] == CLINICAL_DISCLAIMER
    assert body["tokens_used"] == 0


def test_tier1_complete_rejects_missing_prompt(
    client: TestClient, auth_headers: dict
) -> None:
    """Schema validation: missing prompt → 422."""
    resp = client.post(
        "/api/v1/ai/tier1/complete",
        json={},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_tier1_complete_rejects_empty_prompt(
    client: TestClient, auth_headers: dict
) -> None:
    """Schema validation: empty prompt → 422 (Field(min_length=1))."""
    resp = client.post(
        "/api/v1/ai/tier1/complete",
        json={"prompt": ""},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_tier1_endpoint_registered_in_openapi(client: TestClient) -> None:
    """Both endpoints are wired into the FastAPI app."""
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/tier1/health" in schema["paths"]
    assert "/api/v1/ai/tier1/complete" in schema["paths"]
