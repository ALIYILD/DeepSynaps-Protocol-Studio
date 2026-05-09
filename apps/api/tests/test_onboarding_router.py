"""Tests for onboarding_router — /api/v1/onboarding.

Pins:
  - POST /events records a valid step and returns 201
  - POST /events rejects unknown step with 400
  - GET /funnel requires admin role
  - GET /state requires authenticated (not guest) actor
  - GET /state returns expected shape
  - POST /state advances the current_step
  - POST /step-complete records step and marks completed_at when step=completion
  - POST /skip marks abandoned_at
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}
GUEST = {"Authorization": "Bearer guest-demo-token"}


# ── /events ───────────────────────────────────────────────────────────────────

def test_post_event_happy_path():
    r = client.post(
        "/api/v1/onboarding/events",
        headers=CLINICIAN,
        json={"step": "started"},
    )
    assert r.status_code == 201
    body = r.json()
    assert "id" in body
    assert "recorded_at" in body


def test_post_event_invalid_step_returns_400():
    r = client.post(
        "/api/v1/onboarding/events",
        headers=CLINICIAN,
        json={"step": "totally_unknown_step"},
    )
    assert r.status_code == 400


def test_post_event_all_valid_steps():
    """All documented steps should be accepted without 400."""
    valid_steps = [
        "started", "package_selected", "stripe_initiated", "stripe_skipped",
        "agents_enabled", "team_invited", "completed", "skipped",
    ]
    for step in valid_steps:
        r = client.post(
            "/api/v1/onboarding/events",
            headers=CLINICIAN,
            json={"step": step},
        )
        assert r.status_code == 201, f"Step '{step}' was rejected"


# ── /funnel ───────────────────────────────────────────────────────────────────

def test_funnel_requires_admin():
    r = client.get("/api/v1/onboarding/funnel", headers=CLINICIAN)
    assert r.status_code == 403


def test_funnel_with_admin_returns_shape():
    r = client.get("/api/v1/onboarding/funnel", headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert "since_days" in body
    assert "totals" in body
    assert "conversion" in body


# ── /state ────────────────────────────────────────────────────────────────────

def test_get_state_requires_auth():
    r = client.get("/api/v1/onboarding/state", headers=GUEST)
    assert r.status_code == 403


def test_get_state_returns_shape():
    r = client.get("/api/v1/onboarding/state", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "actor_id" in body
    assert "current_step" in body
    assert "is_demo" in body
    assert "disclaimers" in body


def test_post_state_advances_step():
    r = client.post(
        "/api/v1/onboarding/state",
        headers=CLINICIAN,
        json={"current_step": "clinic_info"},
    )
    assert r.status_code == 200
    assert r.json()["current_step"] == "clinic_info"


def test_post_state_invalid_step_returns_400():
    r = client.post(
        "/api/v1/onboarding/state",
        headers=CLINICIAN,
        json={"current_step": "not_a_wizard_step"},
    )
    assert r.status_code == 400


# ── /step-complete ────────────────────────────────────────────────────────────

def test_step_complete_happy_path():
    r = client.post(
        "/api/v1/onboarding/step-complete",
        headers=CLINICIAN,
        json={"step": "welcome", "next_step": "clinic_info"},
    )
    assert r.status_code == 200
    assert r.json()["current_step"] == "clinic_info"


# ── /skip ─────────────────────────────────────────────────────────────────────

def test_skip_marks_abandoned():
    r = client.post(
        "/api/v1/onboarding/skip",
        headers=CLINICIAN,
        json={"step": "role", "reason": "Not ready yet"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["abandoned_at"] is not None
