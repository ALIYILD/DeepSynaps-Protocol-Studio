"""Tests for onboarding_router.py.

Covers:
- POST /api/v1/onboarding/events    — happy path + unknown step 400
- GET  /api/v1/onboarding/funnel    — admin only
- GET  /api/v1/onboarding/state     — get/create state for authenticated user
- POST /api/v1/onboarding/state     — advance wizard step
- POST /api/v1/onboarding/step-complete — mark step done
- POST /api/v1/onboarding/skip      — abandon wizard
- POST /api/v1/onboarding/audit-events — page-level audit
- POST /api/v1/onboarding/seed-demo — explicit demo seed
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}


# ── Auth gates (guest actor must be rejected by launch-audit endpoints) ─────

def test_get_state_rejects_guest():
    """Guest actors cannot access wizard state."""
    with TestClient(app) as tc:
        r = tc.get("/api/v1/onboarding/state", headers=GUEST_HDR)
    assert r.status_code == 403


def test_post_state_rejects_guest():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/state",
            headers=GUEST_HDR,
            json={"current_step": "welcome"},
        )
    assert r.status_code == 403


def test_funnel_requires_admin():
    """Funnel summary is admin-only."""
    with TestClient(app) as tc:
        r = tc.get("/api/v1/onboarding/funnel", headers=CLINICIAN_HDR)
    assert r.status_code == 403


# ── Funnel event (anonymous-safe POST) ──────────────────────────────────────

def test_post_onboarding_event_happy_path():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/events",
            headers=CLINICIAN_HDR,
            json={"step": "started"},
        )
    assert r.status_code == 201
    body = r.json()
    assert "id" in body
    assert "recorded_at" in body


def test_post_onboarding_event_unknown_step_400():
    """Unknown step value must return 400."""
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/events",
            headers=CLINICIAN_HDR,
            json={"step": "not_a_valid_step"},
        )
    assert r.status_code == 400


def test_post_onboarding_event_completed_step():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/events",
            headers=CLINICIAN_HDR,
            json={"step": "completed", "payload": {"package": "pro"}},
        )
    assert r.status_code == 201


# ── Funnel aggregate (admin) ─────────────────────────────────────────────────

def test_get_funnel_admin_happy_path():
    with TestClient(app) as tc:
        r = tc.get("/api/v1/onboarding/funnel?days=7", headers=ADMIN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "since_days" in body
    assert "totals" in body
    assert "conversion" in body
    assert body["since_days"] == 7


# ── State CRUD ──────────────────────────────────────────────────────────────

def test_get_state_creates_on_first_read():
    with TestClient(app) as tc:
        r = tc.get("/api/v1/onboarding/state", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["current_step"] == "welcome"
    assert "disclaimers" in body
    assert isinstance(body["disclaimers"], list)


def test_post_state_advances_step():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/state",
            headers=CLINICIAN_HDR,
            json={"current_step": "clinic_info"},
        )
    assert r.status_code == 200
    assert r.json()["current_step"] == "clinic_info"


def test_post_state_unknown_step_400():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/state",
            headers=CLINICIAN_HDR,
            json={"current_step": "definitely_not_a_wizard_step"},
        )
    assert r.status_code == 400


# ── Step complete ────────────────────────────────────────────────────────────

def test_step_complete_happy_path():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/step-complete",
            headers=CLINICIAN_HDR,
            json={"step": "welcome", "next_step": "clinic_info"},
        )
    assert r.status_code == 200
    assert r.json()["current_step"] == "clinic_info"


# ── Skip wizard ──────────────────────────────────────────────────────────────

def test_skip_wizard_happy_path():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/skip",
            headers=CLINICIAN_HDR,
            json={"step": "welcome", "reason": "not needed"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["abandoned_at"] is not None


# ── Audit events ─────────────────────────────────────────────────────────────

def test_post_audit_event_happy_path():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/audit-events",
            headers=CLINICIAN_HDR,
            json={"event": "view", "step": "welcome"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert "event_id" in body


# ── Demo seed ────────────────────────────────────────────────────────────────

def test_seed_demo_stamps_is_demo():
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/onboarding/seed-demo",
            headers=CLINICIAN_HDR,
            json={"requested_kinds": ["patients", "courses"]},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert body["is_demo"] is True
    assert body["state"]["is_demo"] is True
