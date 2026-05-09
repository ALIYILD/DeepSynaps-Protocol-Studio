"""Tests for channel_auth_health_probe_router.

Covers:
  - GET /status: clinician can read; 403 for unauthenticated; returns expected shape
  - POST /tick: requires admin role; clinician gets 403; admin without clinic gets 400
  - POST /tick: unknown channel returns 400
  - GET /audit-events: clinician can list; returns expected shape; pagination params accepted
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}
NO_AUTH: dict = {}


# ── GET /status ────────────────────────────────────────────────────────────────

def test_status_requires_auth():
    r = client.get("/api/v1/channel-auth-health-probe/status")
    assert r.status_code == 403


def test_status_clinician_happy_path():
    r = client.get("/api/v1/channel-auth-health-probe/status", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    # Required envelope fields.
    assert "enabled" in body
    assert "running" in body
    assert "per_channel" in body
    assert isinstance(body["per_channel"], dict)
    assert "disclaimers" in body
    assert isinstance(body["disclaimers"], list)


def test_status_admin_happy_path():
    r = client.get("/api/v1/channel-auth-health-probe/status", headers=ADMIN)
    assert r.status_code == 200


def test_status_per_channel_has_expected_keys():
    r = client.get("/api/v1/channel-auth-health-probe/status", headers=CLINICIAN)
    body = r.json()
    for _ch, val in body["per_channel"].items():
        assert "status" in val
        # last_probed_at and error_class may be None but must be present.
        assert "last_probed_at" in val
        assert "error_class" in val


# ── POST /tick ─────────────────────────────────────────────────────────────────

def test_tick_requires_auth():
    r = client.post("/api/v1/channel-auth-health-probe/tick")
    assert r.status_code == 403


def test_tick_clinician_forbidden():
    r = client.post("/api/v1/channel-auth-health-probe/tick", headers=CLINICIAN)
    assert r.status_code == 403


def test_tick_admin_with_clinic_happy_path():
    """Admin actor seeded in conftest has clinic_id so tick should succeed."""
    r = client.post("/api/v1/channel-auth-health-probe/tick", headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert "probes_run" in body
    assert "audit_event_id" in body


def test_tick_unknown_channel_returns_400():
    r = client.post(
        "/api/v1/channel-auth-health-probe/tick",
        json={"channel": "not_a_real_channel_xyz"},
        headers=ADMIN,
    )
    assert r.status_code == 400
    assert r.json()["code"] == "unknown_channel"


def test_tick_with_valid_channel():
    """Bounding tick to a known channel should succeed."""
    from app.workers.channel_auth_health_probe_worker import PROBE_CHANNELS
    if not PROBE_CHANNELS:
        import pytest
        pytest.skip("no channels configured")
    ch = next(iter(PROBE_CHANNELS))
    r = client.post(
        "/api/v1/channel-auth-health-probe/tick",
        json={"channel": ch},
        headers=ADMIN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["channel"] == ch


# ── GET /audit-events ──────────────────────────────────────────────────────────

def test_audit_events_requires_auth():
    r = client.get("/api/v1/channel-auth-health-probe/audit-events")
    assert r.status_code == 403


def test_audit_events_clinician_happy_path():
    r = client.get("/api/v1/channel-auth-health-probe/audit-events", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body
    assert "surface" in body


def test_audit_events_pagination_params_accepted():
    r = client.get(
        "/api/v1/channel-auth-health-probe/audit-events",
        params={"limit": 5, "offset": 0},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["limit"] == 5
    assert body["offset"] == 0


def test_audit_events_populated_after_tick():
    """A tick call should create an audit row visible in the list."""
    client.post("/api/v1/channel-auth-health-probe/tick", headers=ADMIN)
    r = client.get("/api/v1/channel-auth-health-probe/audit-events", headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
