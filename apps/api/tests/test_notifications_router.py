"""Tests for the notifications router (presence, unread-count, test notification)."""
from __future__ import annotations

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


def test_presence_post_requires_auth():
    """POST /notifications/presence must reject unauthenticated requests."""
    r = client.post("/api/v1/notifications/presence", json={"page_id": "test-page"})
    assert r.status_code == 403


def test_presence_get_requires_auth():
    """GET /notifications/presence/{page_id} must reject unauthenticated requests."""
    r = client.get("/api/v1/notifications/presence/some-page-id")
    assert r.status_code == 403


def test_unread_count_requires_auth():
    """GET /notifications/unread-count must reject unauthenticated requests."""
    r = client.get("/api/v1/notifications/unread-count")
    assert r.status_code == 403


def test_unread_count_empty_db():
    """Fresh DB returns zero unread items."""
    r = client.get("/api/v1/notifications/unread-count", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 0
    assert body["unread_messages"] == 0
    assert body["open_adverse_events"] == 0


def test_post_presence_returns_users_list():
    """Posting presence returns a users list (may be empty on fresh DB)."""
    r = client.post("/api/v1/notifications/presence", headers=CLINICIAN_HDR,
                    json={"page_id": "patient-profile-123"})
    assert r.status_code == 200
    body = r.json()
    assert "users" in body
    assert isinstance(body["users"], list)


def test_get_presence_page():
    """GET presence for a page returns users list."""
    r = client.get("/api/v1/notifications/presence/patient-profile-xyz", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "users" in body


def test_page_id_too_long_rejected():
    """A page_id exceeding 200 chars should be rejected by schema validation."""
    long_id = "x" * 201
    r = client.post("/api/v1/notifications/presence", headers=CLINICIAN_HDR,
                    json={"page_id": long_id})
    assert r.status_code == 422


def test_test_notification_requires_auth():
    """POST /notifications/test must require authentication."""
    r = client.post("/api/v1/notifications/test")
    assert r.status_code == 403
