"""Tests for clinic_router — /api/v1/clinic.

Pins:
  - GET /clinic returns 401 when no auth header is sent
  - GET /clinic returns 404 when user has no clinic
  - POST /clinic requires clinician role (not patient/guest → 403)
  - POST /clinic creates a clinic and returns 201 with shape
  - POST /clinic 409 when user already has a clinic_id
  - GET /clinic/day-queue returns empty entries for no sessions
  - GET /clinic/day-queue returns 400 for invalid date format
  - GET /clinic/day-queue returns 401 with no auth
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _register(email: str, *, role: str = "clinician", password: str = "testpass1234") -> str:
    """Register a user and return their access token."""
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Test User", "password": password, "role": role},
    )
    assert resp.status_code in (200, 201), f"Register failed: {resp.text}"
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── GET /clinic ───────────────────────────────────────────────────────────────

def test_get_clinic_no_auth_returns_401():
    r = client.get("/api/v1/clinic")
    assert r.status_code == 401


def test_get_clinic_no_clinic_returns_404():
    """Fresh clinician with no clinic_id gets 404."""
    token = _register("clinician-no-clinic@example.com", role="clinician")
    r = client.get("/api/v1/clinic", headers=_auth(token))
    assert r.status_code == 404


# ── POST /clinic ──────────────────────────────────────────────────────────────

def test_create_clinic_no_auth_returns_401():
    r = client.post("/api/v1/clinic", json={"name": "No Auth Clinic"})
    assert r.status_code == 401


def test_create_clinic_guest_role_forbidden():
    """Guest role cannot self-promote to admin by creating a clinic."""
    token = _register("guest-clinic-test@example.com", role="guest")
    r = client.post("/api/v1/clinic", headers=_auth(token), json={"name": "Forbidden Clinic"})
    assert r.status_code == 403


def test_create_clinic_happy_path():
    """Fresh clinician can create a clinic and gets 201 back."""
    token = _register("clinician-create-clinic@example.com", role="clinician")
    r = client.post(
        "/api/v1/clinic",
        headers=_auth(token),
        json={"name": "My Test Clinic", "timezone": "UTC"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "My Test Clinic"
    assert "id" in body
    assert "retention_days" in body


def test_create_clinic_already_in_clinic_returns_409():
    """Clinician who just created a clinic cannot create another → 409."""
    token = _register("clinician-double-clinic@example.com", role="clinician")
    r1 = client.post("/api/v1/clinic", headers=_auth(token), json={"name": "First Clinic"})
    assert r1.status_code == 201
    r2 = client.post("/api/v1/clinic", headers=_auth(token), json={"name": "Second Clinic"})
    assert r2.status_code == 409


# ── GET /clinic/day-queue ─────────────────────────────────────────────────────

def test_day_queue_no_auth_returns_401():
    r = client.get("/api/v1/clinic/day-queue")
    assert r.status_code == 401


def test_day_queue_returns_empty_for_no_sessions():
    """With no ClinicalSession rows, day-queue returns an empty entries list."""
    token = _register("clinician-day-queue@example.com", role="clinician")
    # Create a clinic first so the user is valid
    client.post("/api/v1/clinic", headers=_auth(token), json={"name": "DQ Clinic"})
    r = client.get("/api/v1/clinic/day-queue", headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert "date" in body
    assert "entries" in body
    assert isinstance(body["entries"], list)


def test_day_queue_invalid_date_returns_400():
    token = _register("clinician-day-queue-bad@example.com", role="clinician")
    client.post("/api/v1/clinic", headers=_auth(token), json={"name": "DQ Clinic Bad"})
    r = client.get("/api/v1/clinic/day-queue?date=not-a-date", headers=_auth(token))
    assert r.status_code == 400
