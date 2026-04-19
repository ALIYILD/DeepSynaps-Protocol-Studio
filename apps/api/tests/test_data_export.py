from __future__ import annotations

from fastapi.testclient import TestClient


def _register(client: TestClient, email: str) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Export User", "password": "testpass1234", "role": "clinician"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def test_request_export_creates_queued_row(client: TestClient) -> None:
    token = _register(client, "export-req@example.com")
    resp = client.post(
        "/api/v1/privacy/export",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "export_id" in data
    assert data["status"] in ("queued", "running", "ready")


def test_list_exports_returns_user_exports_newest_first(client: TestClient) -> None:
    token = _register(client, "export-list@example.com")
    client.post("/api/v1/privacy/export", headers={"Authorization": f"Bearer {token}"}, json={})

    resp = client.get("/api/v1/privacy/exports", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) >= 1
    assert all("status" in item for item in items)


def test_delete_export_removes_row(client: TestClient) -> None:
    token = _register(client, "export-del@example.com")
    req = client.post("/api/v1/privacy/export", headers={"Authorization": f"Bearer {token}"}, json={}).json()
    export_id = req["export_id"]

    delete = client.delete(
        f"/api/v1/privacy/exports/{export_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete.status_code == 200, delete.text
    assert delete.json().get("deleted") is True

    # Follow-up GET should 404
    follow = client.get(
        f"/api/v1/privacy/exports/{export_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert follow.status_code == 404, follow.text
