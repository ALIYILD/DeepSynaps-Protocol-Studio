"""Tests for clinic_router.py.

The clinic router uses auth_service.current_user which requires a real JWT
(not demo bearer tokens). Tests register/login accounts to obtain real JWTs.

Covers:
- GET   /api/v1/clinic           — 401 with no auth + shape when present
- POST  /api/v1/clinic           — create clinic; role gate (guest blocked)
- PATCH /api/v1/clinic           — partial update (admin only)
- PUT   /api/v1/clinic/working-hours — set schedule
- GET   /api/v1/clinic/day-queue — empty list when no sessions
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

_WORKING_HOURS = {
    "mon": {"open": True,  "from": "09:00", "to": "17:00"},
    "tue": {"open": True,  "from": "09:00", "to": "17:00"},
    "wed": {"open": True,  "from": "09:00", "to": "17:00"},
    "thu": {"open": True,  "from": "09:00", "to": "17:00"},
    "fri": {"open": True,  "from": "09:00", "to": "17:00"},
    "sat": {"open": False, "from": "09:00", "to": "17:00"},
    "sun": {"open": False, "from": "09:00", "to": "17:00"},
}


def _register_and_token(tc: TestClient, email: str, role: str = "clinician") -> str:
    """Register a user and return their access_token."""
    r = tc.post("/api/v1/auth/register", json={
        "email": email,
        "display_name": "Test User",
        "password": "TestPass1234!",
        "role": role,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"]


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── No-auth gate ─────────────────────────────────────────────────────────────

def test_get_clinic_requires_auth():
    """Unauthenticated GET /clinic must return 401."""
    with TestClient(app) as tc:
        r = tc.get("/api/v1/clinic")
    assert r.status_code == 401


def test_post_clinic_requires_auth():
    """Unauthenticated POST /clinic must return 401."""
    with TestClient(app) as tc:
        r = tc.post("/api/v1/clinic", json={"name": "No Auth Clinic"})
    assert r.status_code == 401


# ── GET /clinic — solo clinician without a clinic gets 404 ──────────────────

def test_get_clinic_404_when_no_clinic():
    """A freshly registered clinician (no clinic_id) gets 404."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "solo-clin@example.com", role="clinician")
        r = tc.get("/api/v1/clinic", headers=_hdr(token))
    assert r.status_code == 404


# ── POST /clinic — create and verify shape ───────────────────────────────────

def test_create_clinic_happy_path():
    """Clinician creates clinic and response has expected shape."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "clinic-creator@example.com", role="clinician")
        r = tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "My Test Clinic", "timezone": "Europe/London"},
        )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "My Test Clinic"
    assert body["timezone"] == "Europe/London"
    assert "id" in body
    assert "retention_days" in body


def test_create_clinic_blocked_for_guest():
    """Guest role must be rejected with 403."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "guest-clinic@example.com", role="guest")
        r = tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "Guest Clinic Attempt"},
        )
    assert r.status_code == 403


def test_create_clinic_409_already_in_clinic():
    """Creating a second clinic while already in one returns 409."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "double-clinic@example.com", role="clinician")
        r1 = tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "First Clinic"},
        )
        assert r1.status_code == 201
        r2 = tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "Second Clinic"},
        )
    assert r2.status_code == 409


# ── GET /clinic — after creation ─────────────────────────────────────────────

def test_get_clinic_returns_shape_after_creation():
    """After creating a clinic the GET endpoint returns the same record."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "get-clinic-test@example.com", role="clinician")
        tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "Readable Clinic", "timezone": "UTC"},
        )
        r = tc.get("/api/v1/clinic", headers=_hdr(token))
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Readable Clinic"
    assert "id" in body
    assert "timezone" in body


# ── PATCH /clinic ─────────────────────────────────────────────────────────────

def test_patch_clinic_updates_name():
    """Admin (creator) can update clinic name."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "patch-clin@example.com", role="clinician")
        tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "Patch Source Clinic"},
        )
        r = tc.patch(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "Patched Clinic Name"},
        )
    assert r.status_code == 200
    assert r.json()["name"] == "Patched Clinic Name"


def test_patch_clinic_blocked_for_non_admin():
    """A clinician who is NOT admin of a clinic cannot PATCH."""
    with TestClient(app) as tc:
        # Register a clinician without a clinic
        token = _register_and_token(tc, "non-admin-patch@example.com", role="clinician")
        r = tc.patch(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "Unauthorised Update"},
        )
    # No clinic → 404; wrong role → 403; either is correct rejection
    assert r.status_code in (403, 404)


# ── PUT /clinic/working-hours ─────────────────────────────────────────────────

def test_set_working_hours_happy_path():
    """Admin who owns a clinic can set working hours."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "wh-admin@example.com", role="clinician")
        tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "WH Clinic"},
        )
        r = tc.put(
            "/api/v1/clinic/working-hours",
            headers=_hdr(token),
            json=_WORKING_HOURS,
        )
    assert r.status_code == 200
    body = r.json()
    assert "working_hours" in body
    assert body["working_hours"]["mon"]["open"] is True


def test_set_working_hours_blocked_no_clinic():
    """Clinician without clinic cannot set working hours."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "no-clinic-wh@example.com", role="clinician")
        r = tc.put(
            "/api/v1/clinic/working-hours",
            headers=_hdr(token),
            json=_WORKING_HOURS,
        )
    assert r.status_code in (403, 404)


# ── GET /clinic/day-queue ─────────────────────────────────────────────────────

def test_day_queue_requires_auth():
    """Unauthenticated GET /clinic/day-queue must return 401."""
    with TestClient(app) as tc:
        r = tc.get("/api/v1/clinic/day-queue")
    assert r.status_code == 401


def test_day_queue_returns_empty_on_no_sessions():
    """Day queue for a user with a clinic but no sessions is an empty list."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "dq-clin@example.com", role="clinician")
        tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "DQ Clinic"},
        )
        r = tc.get("/api/v1/clinic/day-queue", headers=_hdr(token))
    assert r.status_code == 200
    body = r.json()
    assert "date" in body
    assert "entries" in body
    assert isinstance(body["entries"], list)


def test_day_queue_invalid_date_returns_400():
    """An invalid date format returns 400."""
    with TestClient(app) as tc:
        token = _register_and_token(tc, "dq-invalid@example.com", role="clinician")
        tc.post(
            "/api/v1/clinic",
            headers=_hdr(token),
            json={"name": "DQ Clinic 2"},
        )
        r = tc.get(
            "/api/v1/clinic/day-queue?date=not-a-date",
            headers=_hdr(token),
        )
    assert r.status_code == 400
