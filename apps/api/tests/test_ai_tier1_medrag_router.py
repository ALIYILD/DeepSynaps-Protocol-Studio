"""Tests for ``app.routers.ai_tier1_medrag_router``.

Exercises the MedRAG stub: health reports stub mode (no embedding, no
DB connection), ``/query`` is gated on clinician-or-above, schema
validation catches missing / empty questions and bad ``top_k``, every
response carries the canonical disclaimer and an empty citations list,
and both endpoints register in OpenAPI.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ai.tier1_medrag import MEDRAG_DISCLAIMER


def test_medrag_health_reports_stub_mode(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.get(
        "/api/v1/ai/medrag/health", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["status"] == "stub"
    assert body["embedding_model_loaded"] is False
    assert body["evidence_db_connected"] is False


def test_medrag_query_requires_clinician(
    client: TestClient, auth_headers: dict
) -> None:
    payload = {"question": "What evidence supports rTMS in depression?"}
    for role in ("guest", "patient"):
        resp = client.post(
            "/api/v1/ai/medrag/query",
            json=payload,
            headers=auth_headers[role],
        )
        assert resp.status_code == 403, f"role={role} got {resp.status_code}"


def test_medrag_query_returns_stub_envelope(
    client: TestClient, auth_headers: dict
) -> None:
    payload = {
        "question": "What evidence supports rTMS in depression?",
        "indication": "depression",
        "modality": "rTMS",
        "top_k": 5,
    }
    resp = client.post(
        "/api/v1/ai/medrag/query",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stub"] is True
    assert body["status"] == "stub"
    assert body["answer"] is None
    assert body["citations"] == []
    assert body["disclaimer"] == MEDRAG_DISCLAIMER


def test_medrag_query_rejects_missing_question(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/ai/medrag/query",
        json={},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_medrag_query_rejects_empty_question(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/ai/medrag/query",
        json={"question": ""},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_medrag_query_rejects_zero_top_k(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/ai/medrag/query",
        json={"question": "rTMS evidence?", "top_k": 0},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text


def test_medrag_endpoints_registered_in_openapi(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/ai/medrag/health" in schema["paths"]
    assert "/api/v1/ai/medrag/query" in schema["paths"]
