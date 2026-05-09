"""Tests for schedules_router — /api/v1/schedule.

Tests cover:
- GET  /rooms returns empty list when no rooms (clinician with clinic)
- POST /rooms creates a room (admin only) → 201
- POST /rooms with clinician role returns 403
- GET  /devices returns empty list when no devices
- POST /devices creates a device (admin only) → 201
- POST /devices with clinician role returns 403
- GET  /resources returns combined clinicians/rooms/devices shape
- POST /conflicts returns no-conflict result for empty clinic
- POST /conflicts missing required fields returns 422
- Endpoints require at least clinician role (guest gets 403)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}


# ── Rooms ─────────────────────────────────────────────────────────────────────


def test_list_rooms_empty(client: TestClient) -> None:
    """GET /schedule/rooms returns empty list when no rooms are seeded."""
    r = client.get("/api/v1/schedule/rooms", headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_create_room_admin_only(client: TestClient) -> None:
    """POST /schedule/rooms requires admin role — clinician gets 403."""
    r = client.post(
        "/api/v1/schedule/rooms",
        json={"name": "Treatment Room 1", "description": "Main TMS room"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 403


def test_create_room_as_admin(client: TestClient) -> None:
    """POST /schedule/rooms as admin creates room and returns 201."""
    r = client.post(
        "/api/v1/schedule/rooms",
        json={"name": "TMS Room A", "description": "Primary TMS suite", "modalities": ["rTMS", "tDCS"]},
        headers=ADMIN_HDR,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "TMS Room A"
    assert body["is_active"] is True
    assert body["modalities"] == ["rTMS", "tDCS"]


def test_list_rooms_after_create(client: TestClient) -> None:
    """GET /schedule/rooms returns the room created by admin."""
    client.post(
        "/api/v1/schedule/rooms",
        json={"name": "Visible Room"},
        headers=ADMIN_HDR,
    )
    r = client.get("/api/v1/schedule/rooms", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    names = [room["name"] for room in r.json()]
    assert "Visible Room" in names


def test_rooms_requires_auth(client: TestClient) -> None:
    """GET /schedule/rooms without auth returns 403."""
    r = client.get("/api/v1/schedule/rooms")
    assert r.status_code == 403


def test_rooms_guest_forbidden(client: TestClient) -> None:
    """GET /schedule/rooms with guest role returns 403."""
    r = client.get("/api/v1/schedule/rooms", headers=GUEST_HDR)
    assert r.status_code == 403


# ── Devices ──────────────────────────────────────────────────────────────────


def test_list_devices_empty(client: TestClient) -> None:
    """GET /schedule/devices returns empty list when no devices are seeded."""
    r = client.get("/api/v1/schedule/devices", headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_create_device_admin_only(client: TestClient) -> None:
    """POST /schedule/devices requires admin role — clinician gets 403."""
    r = client.post(
        "/api/v1/schedule/devices",
        json={"name": "NeuroMS Pro", "device_type": "rTMS"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 403


def test_create_device_as_admin(client: TestClient) -> None:
    """POST /schedule/devices as admin creates device and returns 201."""
    r = client.post(
        "/api/v1/schedule/devices",
        json={"name": "NeuroMS Pro", "device_type": "rTMS", "serial_number": "SN-001"},
        headers=ADMIN_HDR,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "NeuroMS Pro"
    assert body["device_type"] == "rTMS"
    assert body["serial_number"] == "SN-001"
    assert body["is_active"] is True


def test_list_devices_after_create(client: TestClient) -> None:
    """GET /schedule/devices returns device created by admin."""
    client.post(
        "/api/v1/schedule/devices",
        json={"name": "Visible Device", "device_type": "tDCS"},
        headers=ADMIN_HDR,
    )
    r = client.get("/api/v1/schedule/devices", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    names = [d["name"] for d in r.json()]
    assert "Visible Device" in names


# ── Resources ─────────────────────────────────────────────────────────────────


def test_list_resources_shape(client: TestClient) -> None:
    """GET /schedule/resources returns combined shape with clinicians/rooms/devices."""
    r = client.get("/api/v1/schedule/resources", headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "clinicians" in body
    assert "rooms" in body
    assert "devices" in body
    assert isinstance(body["clinicians"], list)
    assert isinstance(body["rooms"], list)
    assert isinstance(body["devices"], list)


def test_list_resources_includes_actor(client: TestClient) -> None:
    """GET /schedule/resources returns the authenticated clinician in the list."""
    r = client.get("/api/v1/schedule/resources", headers=CLINICIAN_HDR)
    clinician_ids = [c["id"] for c in r.json()["clinicians"]]
    assert "actor-clinician-demo" in clinician_ids


def test_resources_guest_forbidden(client: TestClient) -> None:
    """GET /schedule/resources with guest role returns 403."""
    r = client.get("/api/v1/schedule/resources", headers=GUEST_HDR)
    assert r.status_code == 403


# ── Conflict check ────────────────────────────────────────────────────────────


def test_conflicts_no_conflict_empty_clinic(client: TestClient) -> None:
    """POST /schedule/conflicts returns no conflicts for an empty schedule."""
    payload = {
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-06-01T10:00:00Z",
        "duration_minutes": 60,
    }
    r = client.post("/api/v1/schedule/conflicts", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "has_conflicts" in body
    assert "conflicts" in body
    assert body["has_conflicts"] is False
    assert body["conflicts"] == []


def test_conflicts_missing_clinician_id_422(client: TestClient) -> None:
    """POST /schedule/conflicts without clinician_id returns 422."""
    payload = {
        "scheduled_at": "2026-06-01T10:00:00Z",
        "duration_minutes": 60,
    }
    r = client.post("/api/v1/schedule/conflicts", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 422


def test_conflicts_invalid_duration_422(client: TestClient) -> None:
    """POST /schedule/conflicts with duration_minutes=0 returns 422 (min=1)."""
    payload = {
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-06-01T10:00:00Z",
        "duration_minutes": 0,
    }
    r = client.post("/api/v1/schedule/conflicts", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 422


def test_conflicts_guest_forbidden(client: TestClient) -> None:
    """POST /schedule/conflicts with guest role returns 403."""
    payload = {
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-06-01T10:00:00Z",
        "duration_minutes": 60,
    }
    r = client.post("/api/v1/schedule/conflicts", json=payload, headers=GUEST_HDR)
    assert r.status_code == 403
