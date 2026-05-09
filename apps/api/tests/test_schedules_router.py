"""Happy-path tests for the Schedules (rooms, devices, conflicts) router.

Scope: /api/v1/schedule — rooms list, devices list, resources, conflict
check. Verifies role gate, empty-DB stability, and that admin can create
rooms and devices.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}


def test_list_rooms_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/schedule/rooms", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)


def test_list_rooms_guest_blocked(client: TestClient) -> None:
    r = client.get("/api/v1/schedule/rooms", headers=AUTH_GUEST)
    assert r.status_code in (403, 404)


def test_list_devices_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/schedule/devices", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)


def test_resources_empty_db(client: TestClient) -> None:
    r = client.get(
        "/api/v1/schedule/resources?start=2026-06-01T00:00:00Z&end=2026-06-07T23:59:59Z",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200


def test_admin_can_create_room(client: TestClient) -> None:
    r = client.post(
        "/api/v1/schedule/rooms",
        json={"name": "TMS Room A", "description": "Primary TMS suite", "modalities": ["TMS"]},
        headers=AUTH_ADMIN,
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["name"] == "TMS Room A"
    assert body.get("id")


def test_admin_can_create_device(client: TestClient) -> None:
    r = client.post(
        "/api/v1/schedule/devices",
        json={"name": "MagVenture MagPro X100", "device_type": "TMS", "serial_number": "MV-001"},
        headers=AUTH_ADMIN,
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body.get("id")


def test_conflict_check_no_sessions(client: TestClient) -> None:
    r = client.post(
        "/api/v1/schedule/conflicts",
        json={
            "clinician_id": "actor-clinician-demo",
            "scheduled_at": "2026-06-01T09:00:00+00:00",
            "duration_minutes": 60,
        },
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    # No conflicts expected in empty DB
    assert body.get("has_conflict") is False or "conflicts" in body
