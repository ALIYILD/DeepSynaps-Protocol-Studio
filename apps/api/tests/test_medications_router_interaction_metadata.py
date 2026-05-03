"""Interaction check response includes engine metadata and review flag."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.routers.medications_router import INTERACTION_ENGINE_ID


def test_check_interactions_includes_engine_metadata(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.post(
        "/api/v1/medications/check-interactions",
        headers=auth_headers["clinician"],
        json={"patient_id": "pt-test-medmeta", "medications": ["sertraline", "tramadol"]},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("engine_id") == INTERACTION_ENGINE_ID
    assert data.get("requires_clinician_review") is True
    assert "engine_detail" in data and data["engine_detail"]


def test_check_interactions_guest_forbidden(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.post(
        "/api/v1/medications/check-interactions",
        headers=auth_headers["guest"],
        json={"medications": ["sertraline", "tramadol"]},
    )
    assert r.status_code in (401, 403)
