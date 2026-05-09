"""Tests for the schedule router (rooms, devices, conflicts, resources)."""
from __future__ import annotations

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}


def test_rooms_requires_auth():
    """GET /schedule/rooms must reject unauthenticated requests."""
    r = client.get("/api/v1/schedule/rooms")
    assert r.status_code == 403


def test_rooms_returns_list():
    """Clinician gets an empty-or-valid rooms list."""
    r = client.get("/api/v1/schedule/rooms", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_devices_returns_list():
    """Clinician gets a devices list."""
    r = client.get("/api/v1/schedule/devices", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_room_requires_admin():
    """Clinician cannot create a room."""
    r = client.post("/api/v1/schedule/rooms", headers=CLINICIAN_HDR, json={"name": "Room A"})
    assert r.status_code == 403


def test_create_room_as_admin():
    """Admin can create a room; response contains id and name."""
    r = client.post("/api/v1/schedule/rooms", headers=ADMIN_HDR, json={
        "name": "Treatment Room 1",
        "description": "tDCS treatment room",
        "modalities": ["tDCS", "TMS"],
    })
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Treatment Room 1"
    assert "id" in body


def test_create_device_as_admin():
    """Admin can create a device; response contains id and device_type."""
    r = client.post("/api/v1/schedule/devices", headers=ADMIN_HDR, json={
        "name": "Starstim 20",
        "device_type": "tDCS",
        "serial_number": "SN-001",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["device_type"] == "tDCS"
    assert "id" in body


def test_conflict_check_no_sessions():
    """Conflict check on empty DB reports no conflicts."""
    r = client.post("/api/v1/schedule/conflicts", headers=CLINICIAN_HDR, json={
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-06-01T10:00:00",
        "duration_minutes": 60,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["has_conflicts"] is False
    assert body["conflicts"] == []


def test_resources_returns_combined_shape():
    """GET /schedule/resources returns clinicians, rooms, devices keys."""
    r = client.get("/api/v1/schedule/resources", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "clinicians" in body
    assert "rooms" in body
    assert "devices" in body
    assert isinstance(body["clinicians"], list)
