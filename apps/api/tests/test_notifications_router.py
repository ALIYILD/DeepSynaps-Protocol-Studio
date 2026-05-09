"""Tests for notifications_router — set D (PR 76/N).

Covers:
  - GET  /api/v1/notifications/stream       (SSE auth + role gate)
  - POST /api/v1/notifications/presence     (clinician gate, page_id cap)
  - GET  /api/v1/notifications/presence/{page_id}
  - POST /api/v1/notifications/test         (rate-limited test push)
  - GET  /api/v1/notifications/unread-count
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ── GET /stream ───────────────────────────────────────────────────────────────


def test_stream_no_token_is_401(client: TestClient) -> None:
    """No auth → 401."""
    r = client.get("/api/v1/notifications/stream")
    assert r.status_code == 401


def test_stream_invalid_token_is_401(client: TestClient) -> None:
    r = client.get("/api/v1/notifications/stream?token=not-a-real-token")
    assert r.status_code == 401


# ── POST /presence ────────────────────────────────────────────────────────────


def test_presence_requires_auth(client: TestClient) -> None:
    r = client.post("/api/v1/notifications/presence", json={"page_id": "some-page"})
    assert r.status_code == 403


def test_presence_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/notifications/presence",
        json={"page_id": "patient-profile"},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_presence_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/notifications/presence",
        json={"page_id": "dashboard"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert "users" in body
    assert isinstance(body["users"], list)


def test_presence_page_id_too_long_is_422(client: TestClient, auth_headers: dict) -> None:
    long_id = "x" * 201
    r = client.post(
        "/api/v1/notifications/presence",
        json={"page_id": long_id},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_presence_page_id_max_length_ok(client: TestClient, auth_headers: dict) -> None:
    max_id = "a" * 200
    r = client.post(
        "/api/v1/notifications/presence",
        json={"page_id": max_id},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200


def test_presence_missing_page_id_is_422(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/notifications/presence",
        json={},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


# ── GET /presence/{page_id} ───────────────────────────────────────────────────


def test_get_presence_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/notifications/presence/my-page")
    assert r.status_code == 403


def test_get_presence_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/notifications/presence/some-page-id",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert "users" in body
    assert isinstance(body["users"], list)


def test_get_presence_returns_own_update(client: TestClient, auth_headers: dict) -> None:
    """After posting presence, GET returns the same user in the list."""
    pid = "test-presence-round-trip"
    client.post(
        "/api/v1/notifications/presence",
        json={"page_id": pid},
        headers=auth_headers["clinician"],
    )
    r = client.get(
        f"/api/v1/notifications/presence/{pid}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    # The posting actor should appear in the presence list
    users = r.json()["users"]
    actor_ids = [u.get("id") for u in users]
    assert "actor-clinician-demo" in actor_ids


# ── POST /test ────────────────────────────────────────────────────────────────


def test_test_notification_requires_auth(client: TestClient) -> None:
    r = client.post("/api/v1/notifications/test")
    assert r.status_code == 403


def test_test_notification_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/notifications/test",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_test_notification_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/notifications/test",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ── GET /unread-count ─────────────────────────────────────────────────────────


def test_unread_count_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/notifications/unread-count")
    assert r.status_code == 403


def test_unread_count_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_unread_count_clinician_empty_db(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert "count" in body
    assert "unread_messages" in body
    assert "open_adverse_events" in body
    assert body["count"] == body["unread_messages"] + body["open_adverse_events"]
    assert body["count"] == 0
