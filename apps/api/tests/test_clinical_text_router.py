"""Integration tests for /api/v1/clinical-text/* endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


_NOTE = "Patient on sertraline 50mg, MDD. Email: jane.doe@example.com."


def test_health_requires_clinician(client: TestClient) -> None:
    resp = client.get("/api/v1/clinical-text/health")
    assert resp.status_code in (401, 403)


def test_health_ok_for_clinician(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(
        "/api/v1/clinical-text/health", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["backend"] in {"heuristic", "openmed_http"}


def test_analyze_returns_typed_response(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/clinical-text/analyze",
        json={"text": _NOTE, "source_type": "clinician_note"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["schema_id"] == "deepsynaps.openmed.analyze/v1"
    assert body["char_count"] == len(_NOTE)
    assert any(e["label"] == "medication" for e in body["entities"])
    assert any(p["label"] == "email" for p in body["pii"])
    assert body["safety_footer"].startswith("decision-support")


def test_analyze_rejects_empty(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/clinical-text/analyze",
        json={"text": "", "source_type": "clinician_note"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422


def test_extract_pii_endpoint(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/clinical-text/extract-pii",
        json={"text": _NOTE},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_id"] == "deepsynaps.openmed.pii/v1"
    assert any(p["label"] == "email" for p in body["pii"])


def test_deidentify_endpoint(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/clinical-text/deidentify",
        json={"text": _NOTE},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_id"] == "deepsynaps.openmed.deid/v1"
    assert "jane.doe@example.com" not in body["redacted_text"]
    assert "[EMAIL]" in body["redacted_text"]
    assert body["replacements"]


def test_analyze_rejects_non_clinician(client: TestClient, auth_headers: dict) -> None:
    if "guest" in auth_headers:
        resp = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _NOTE},
            headers=auth_headers["guest"],
        )
        assert resp.status_code in (401, 403)
