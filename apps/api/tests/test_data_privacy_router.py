"""Tests for data_privacy_router — /api/v1/privacy.

Covers:
- POST /privacy/export requires real JWT (demo tokens rejected)
- POST creates a queued export row
- GET /privacy/exports lists user's exports
- GET /privacy/exports/{id} returns 404 for another user's export
- DELETE removes the export row
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def _register(client: TestClient, email: str) -> str:
    """Register a fresh user and return their access token."""
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "display_name": "Privacy Test User",
            "password": "testpass1234",
            "role": "clinician",
        },
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def test_create_export_requires_real_jwt(client: TestClient, auth_headers: dict) -> None:
    """Demo tokens are rejected — need a real JWT."""
    resp = client.post("/api/v1/privacy/export", headers=auth_headers["clinician"])
    assert resp.status_code in (401, 403)


def test_create_export_unauthenticated_returns_401(client: TestClient) -> None:
    resp = client.post("/api/v1/privacy/export")
    assert resp.status_code in (401, 403)


def test_create_export_creates_queued_row(client: TestClient) -> None:
    token = _register(client, "privacy-create@example.com")
    resp = client.post(
        "/api/v1/privacy/export",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "export_id" in body
    assert body["status"] == "queued"


def test_list_exports_returns_user_exports(client: TestClient) -> None:
    token = _register(client, "privacy-list@example.com")
    # Create one export first
    client.post(
        "/api/v1/privacy/export",
        headers={"Authorization": f"Bearer {token}"},
    )
    resp = client.get(
        "/api/v1/privacy/exports",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "items" in body
    assert len(body["items"]) >= 1
    assert all("status" in item for item in body["items"])


def test_get_export_404_for_other_user(client: TestClient) -> None:
    token_a = _register(client, "privacy-usera@example.com")
    token_b = _register(client, "privacy-userb@example.com")

    # User A creates an export
    create_resp = client.post(
        "/api/v1/privacy/export",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    export_id = create_resp.json()["export_id"]

    # User B should not be able to see User A's export
    resp = client.get(
        f"/api/v1/privacy/exports/{export_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


def test_delete_export_removes_row(client: TestClient) -> None:
    token = _register(client, "privacy-delete@example.com")
    create_resp = client.post(
        "/api/v1/privacy/export",
        headers={"Authorization": f"Bearer {token}"},
    )
    export_id = create_resp.json()["export_id"]

    del_resp = client.delete(
        f"/api/v1/privacy/exports/{export_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_resp.status_code == 200
    assert del_resp.json().get("deleted") is True

    # Follow-up GET should be 404
    follow_resp = client.get(
        f"/api/v1/privacy/exports/{export_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert follow_resp.status_code == 404
