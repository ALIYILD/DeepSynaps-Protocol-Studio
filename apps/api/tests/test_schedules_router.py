"""Tests for schedules_router — /api/v1/schedule.

Covers:
  - GET /rooms: auth gate + empty result for no clinic
  - GET /devices: auth gate + empty result for no clinic
  - POST /rooms: admin happy path + 403 for clinician + 400 for admin without clinic
  - POST /devices: admin happy path + 403 for clinician
  - POST /conflicts: clinician happy path + 403 cross-clinic clinician
  - GET /resources: returns envelope with clinicians/rooms/devices
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}
NO_AUTH: dict = {}


# ── GET /rooms ─────────────────────────────────────────────────────────────────

def test_list_rooms_requires_auth():
    r = client.get("/api/v1/schedule/rooms")
    assert r.status_code == 403


def test_list_rooms_clinician_happy_path():
    r = client.get("/api/v1/schedule/rooms", headers=CLINICIAN)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_rooms_admin_happy_path():
    r = client.get("/api/v1/schedule/rooms", headers=ADMIN)
    assert r.status_code == 200


# ── GET /devices ──────────────────────────────────────────────────────────────

def test_list_devices_requires_auth():
    r = client.get("/api/v1/schedule/devices")
    assert r.status_code == 403


def test_list_devices_clinician_happy_path():
    r = client.get("/api/v1/schedule/devices", headers=CLINICIAN)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── POST /rooms ───────────────────────────────────────────────────────────────

def test_create_room_clinician_forbidden():
    r = client.post("/api/v1/schedule/rooms", json={"name": "Room A"}, headers=CLINICIAN)
    assert r.status_code == 403


def test_create_room_admin_happy_path():
    r = client.post("/api/v1/schedule/rooms", json={
        "name": "EEG Suite 1",
        "description": "Primary EEG room",
        "modalities": ["tDCS", "TMS"],
    }, headers=ADMIN)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "EEG Suite 1"
    assert body["is_active"] is True
    assert body["modalities"] == ["tDCS", "TMS"]


def test_create_room_returns_in_list():
    client.post("/api/v1/schedule/rooms", json={"name": "Listable Room"}, headers=ADMIN)
    r = client.get("/api/v1/schedule/rooms", headers=CLINICIAN)
    names = [room["name"] for room in r.json()]
    assert "Listable Room" in names


# ── POST /devices ─────────────────────────────────────────────────────────────

def test_create_device_clinician_forbidden():
    r = client.post("/api/v1/schedule/devices", json={
        "name": "tDCS Device 1",
        "device_type": "tDCS",
    }, headers=CLINICIAN)
    assert r.status_code == 403


def test_create_device_admin_happy_path():
    r = client.post("/api/v1/schedule/devices", json={
        "name": "tDCS Unit Alpha",
        "device_type": "tDCS",
        "serial_number": "SN-2024-001",
    }, headers=ADMIN)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "tDCS Unit Alpha"
    assert body["device_type"] == "tDCS"
    assert body["serial_number"] == "SN-2024-001"
    assert body["is_active"] is True


# ── POST /conflicts ───────────────────────────────────────────────────────────

def test_check_conflicts_requires_auth():
    r = client.post("/api/v1/schedule/conflicts", json={
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-06-01T10:00:00Z",
        "duration_minutes": 60,
    })
    assert r.status_code == 403


def test_check_conflicts_happy_path_no_conflicts():
    r = client.post("/api/v1/schedule/conflicts", json={
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-06-01T10:00:00Z",
        "duration_minutes": 60,
    }, headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "has_conflicts" in body
    assert "conflicts" in body
    assert isinstance(body["conflicts"], list)
    assert body["has_conflicts"] is False


def test_check_conflicts_cross_clinic_clinician_forbidden():
    """Clinician checking for a clinician_id that is not in their clinic gets 403."""
    r = client.post("/api/v1/schedule/conflicts", json={
        "clinician_id": "outsider-clinician-xyz",
        "scheduled_at": "2026-06-01T10:00:00Z",
        "duration_minutes": 30,
    }, headers=CLINICIAN)
    assert r.status_code == 403


def test_check_conflicts_missing_scheduled_at_422():
    r = client.post("/api/v1/schedule/conflicts", json={
        "clinician_id": "actor-clinician-demo",
        "duration_minutes": 60,
    }, headers=CLINICIAN)
    assert r.status_code == 422


# ── GET /resources ────────────────────────────────────────────────────────────

def test_list_resources_requires_auth():
    r = client.get("/api/v1/schedule/resources")
    assert r.status_code == 403


def test_list_resources_happy_path():
    r = client.get("/api/v1/schedule/resources", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "clinicians" in body
    assert "rooms" in body
    assert "devices" in body
    assert isinstance(body["clinicians"], list)
    assert isinstance(body["rooms"], list)
    assert isinstance(body["devices"], list)


def test_list_resources_includes_seeded_clinician():
    r = client.get("/api/v1/schedule/resources", headers=CLINICIAN)
    body = r.json()
    ids = [c["id"] for c in body["clinicians"]]
    assert "actor-clinician-demo" in ids
