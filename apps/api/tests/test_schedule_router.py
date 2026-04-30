"""Tests for the schedule router (rooms, devices, conflicts)."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

AUTH_HDR = {"Authorization": "Bearer token-testadmin"}
CLINICIAN_HDR = {"Authorization": "Bearer token-testclinician"}


def test_list_rooms_empty():
    """Empty clinic returns no rooms."""
    r = client.get("/api/v1/schedule/rooms", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert r.json() == []


def test_list_rooms_requires_auth():
    """Rooms endpoint requires authentication."""
    r = client.get("/api/v1/schedule/rooms")
    assert r.status_code == 403


def test_create_room_admin_only():
    """Clinician cannot create rooms."""
    r = client.post("/api/v1/schedule/rooms", json={
        "name": "Room A",
        "description": "Treatment room",
        "modalities": ["tDCS", "rTMS"],
    }, headers=CLINICIAN_HDR)
    assert r.status_code == 403


def test_create_and_list_room():
    """Admin creates room, then listing returns it."""
    r = client.post("/api/v1/schedule/rooms", json={
        "name": "Room A",
        "description": "Treatment room",
        "modalities": ["tDCS", "rTMS"],
    }, headers=AUTH_HDR)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Room A"
    assert data["modalities"] == ["tDCS", "rTMS"]
    room_id = data["id"]

    r = client.get("/api/v1/schedule/rooms", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert any(i["id"] == room_id for i in items)


def test_list_devices_empty():
    """Empty clinic returns no devices."""
    r = client.get("/api/v1/schedule/devices", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list_device():
    """Admin creates device, then listing returns it."""
    r = client.post("/api/v1/schedule/devices", json={
        "name": "Magstim 200",
        "device_type": "rTMS",
        "serial_number": "SN-12345",
    }, headers=AUTH_HDR)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Magstim 200"
    assert data["device_type"] == "rTMS"
    device_id = data["id"]

    r = client.get("/api/v1/schedule/devices", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert any(i["id"] == device_id for i in items)


def test_conflict_check_empty():
    """No conflicts for empty slot."""
    r = client.post("/api/v1/schedule/conflicts", json={
        "clinician_id": "clinician-test",
        "scheduled_at": "2026-05-01T09:00:00",
        "duration_minutes": 60,
    }, headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["has_conflicts"] is False
    assert data["conflicts"] == []


def test_conflict_check_requires_auth():
    """Conflict check requires authentication."""
    r = client.post("/api/v1/schedule/conflicts", json={
        "clinician_id": "clinician-test",
        "scheduled_at": "2026-05-01T09:00:00",
        "duration_minutes": 60,
    })
    assert r.status_code == 403


def test_list_sessions_with_date_filter():
    """Sessions can be filtered by date range."""
    # First create a patient and session
    pr = client.post("/api/v1/patients", json={
        "first_name": "Schedule",
        "last_name": "Test",
        "date_of_birth": "1990-01-01",
        "status": "active",
    }, headers=AUTH_HDR)
    pid = pr.json()["id"]

    client.post("/api/v1/sessions", json={
        "patient_id": pid,
        "scheduled_at": "2026-04-30T10:00:00",
        "duration_minutes": 60,
        "modality": "tDCS",
        "appointment_type": "session",
    }, headers=AUTH_HDR)

    r = client.get("/api/v1/sessions?start_date=2026-04-01&end_date=2026-05-01", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1


def test_list_sessions_with_modality_filter():
    """Sessions can be filtered by modality."""
    r = client.get("/api/v1/sessions?modality=tDCS", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert all(s.get("modality") == "tDCS" for s in data["items"])


def test_list_resources_combined():
    """Resources endpoint returns clinicians, rooms, devices."""
    r = client.get("/api/v1/schedule/resources", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "clinicians" in data
    assert "rooms" in data
    assert "devices" in data
