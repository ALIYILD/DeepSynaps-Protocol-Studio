"""Tests for notifications_router — presence + unread-count.

Pins:
  - stream endpoint rejects missing/invalid token (401)
  - presence POST requires clinician role
  - presence GET requires clinician role
  - unread-count requires auth
  - unread-count returns expected shape on fresh DB
  - test-notification endpoint requires clinician role
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}
PATIENT = {"Authorization": "Bearer patient-demo-token"}


def test_notification_stream_no_token_returns_401():
    """SSE stream must reject requests with no token."""
    r = client.get("/api/v1/notifications/stream")
    # 401 (or 403 when the framework wraps it) is expected
    assert r.status_code in (401, 403)


def test_notification_stream_bad_token_returns_401():
    r = client.get("/api/v1/notifications/stream?token=not-a-real-token")
    assert r.status_code in (401, 403)


def test_presence_post_requires_auth():
    r = client.post("/api/v1/notifications/presence", json={"page_id": "test-page"})
    assert r.status_code == 403


def test_presence_post_requires_clinician_role():
    r = client.post(
        "/api/v1/notifications/presence",
        headers=PATIENT,
        json={"page_id": "test-page"},
    )
    assert r.status_code == 403


def test_presence_post_with_clinician_returns_users():
    r = client.post(
        "/api/v1/notifications/presence",
        headers=CLINICIAN,
        json={"page_id": "test-page-ok"},
    )
    assert r.status_code == 200
    assert "users" in r.json()


def test_presence_get_requires_auth():
    r = client.get("/api/v1/notifications/presence/some-page")
    assert r.status_code == 403


def test_presence_get_with_clinician():
    r = client.get("/api/v1/notifications/presence/some-page", headers=CLINICIAN)
    assert r.status_code == 200
    assert "users" in r.json()


def test_unread_count_requires_auth():
    r = client.get("/api/v1/notifications/unread-count")
    assert r.status_code == 403


def test_unread_count_shape_on_fresh_db():
    r = client.get("/api/v1/notifications/unread-count", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "count" in body
    assert "unread_messages" in body
    assert "open_adverse_events" in body
    assert body["count"] == body["unread_messages"] + body["open_adverse_events"]


def test_test_notification_requires_auth():
    r = client.post("/api/v1/notifications/test")
    assert r.status_code == 403


def test_test_notification_with_clinician():
    r = client.post("/api/v1/notifications/test", headers=CLINICIAN)
    assert r.status_code == 200
    assert r.json()["ok"] is True
