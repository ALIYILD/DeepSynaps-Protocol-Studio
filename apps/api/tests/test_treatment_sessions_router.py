"""Tests for /api/v1/treatment-sessions (sign-status batch).

Covers:
- Auth gate (403)
- Empty batch (422)
- Batch over limit (422)
- Unknown course IDs → empty items, counts=0
- Unknown session IDs → empty items
- Batch with valid course IDs returns shape (items, summary, courses)
- summary counters are non-negative integers
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_ADMIN = {"Authorization": "Bearer admin-demo-token"}
_BASE = "/api/v1/treatment-sessions"


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


# ── Auth ─────────────────────────────────────────────────────────────────────

def test_sign_status_batch_requires_auth(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/sign-status/batch",
        json={"course_ids": ["c1"], "session_ids": []},
    )
    assert r.status_code == 403


# ── Validation: empty batch ───────────────────────────────────────────────────

def test_sign_status_batch_empty_ids_returns_422(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/sign-status/batch",
        json={"course_ids": [], "session_ids": []},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


# ── Validation: batch over limit ──────────────────────────────────────────────

def test_sign_status_batch_too_many_course_ids_returns_422(
    client: TestClient,
) -> None:
    r = client.post(
        f"{_BASE}/sign-status/batch",
        json={"course_ids": [f"c{i}" for i in range(101)], "session_ids": []},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


def test_sign_status_batch_too_many_session_ids_returns_422(
    client: TestClient,
) -> None:
    r = client.post(
        f"{_BASE}/sign-status/batch",
        json={"course_ids": [], "session_ids": [f"s{i}" for i in range(501)]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


# ── Unknown IDs ───────────────────────────────────────────────────────────────

def test_sign_status_batch_unknown_course_returns_empty(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/sign-status/batch",
        json={"course_ids": ["nonexistent-course-abc"], "session_ids": []},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["summary"]["returned_count"] == 0
    assert body["courses"] == []


def test_sign_status_batch_unknown_session_returns_empty(
    client: TestClient,
) -> None:
    r = client.post(
        f"{_BASE}/sign-status/batch",
        json={"course_ids": [], "session_ids": ["nonexistent-session-xyz"]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["summary"]["returned_count"] == 0


# ── Shape assertions on returned data ────────────────────────────────────────

def test_sign_status_batch_response_shape(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/sign-status/batch",
        json={"course_ids": ["c-shape-test"], "session_ids": []},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    # Top-level keys
    assert "items" in body
    assert "summary" in body
    assert "courses" in body
    # Summary shape
    s = body["summary"]
    assert "requested_course_count" in s
    assert "requested_session_count" in s
    assert "returned_count" in s
    assert s["signed_count"] >= 0
    assert s["pending_count"] >= 0
    assert s["unknown_count"] >= 0


def test_sign_status_batch_counts_are_non_negative(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/sign-status/batch",
        json={"course_ids": [], "session_ids": ["s-count-test"]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    s = r.json()["summary"]
    for key in ("signed_count", "pending_count", "unknown_count"):
        assert s[key] >= 0
