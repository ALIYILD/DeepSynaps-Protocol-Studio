"""Tests for the schedule router (rooms, devices, conflicts)."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_list_rooms_empty(client, auth_headers):
    """Empty clinic returns no rooms."""
    r = client.get("/api/v1/schedule/rooms", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json() == []


def test_list_rooms_requires_auth(client):
    """Rooms endpoint requires authentication."""
    r = client.get("/api/v1/schedule/rooms")
    assert r.status_code == 403


def test_create_room_admin_only(client, auth_headers):
    """Clinician cannot create rooms."""
    r = client.post("/api/v1/schedule/rooms", json={
        "name": "Room A",
        "description": "Treatment room",
        "modalities": ["tDCS", "rTMS"],
    }, headers=auth_headers["clinician"])
    assert r.status_code == 403


def test_create_and_list_room(client, auth_headers):
    """Admin creates room, then listing returns it."""
    r = client.post("/api/v1/schedule/rooms", json={
        "name": "Room A",
        "description": "Treatment room",
        "modalities": ["tDCS", "rTMS"],
    }, headers=auth_headers["admin"])
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Room A"
    assert data["modalities"] == ["tDCS", "rTMS"]
    room_id = data["id"]

    r = client.get("/api/v1/schedule/rooms", headers=auth_headers["clinician"])
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert any(i["id"] == room_id for i in items)


def test_list_devices_empty(client, auth_headers):
    """Empty clinic returns no devices."""
    r = client.get("/api/v1/schedule/devices", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list_device(client, auth_headers):
    """Admin creates device, then listing returns it."""
    r = client.post("/api/v1/schedule/devices", json={
        "name": "Magstim 200",
        "device_type": "rTMS",
        "serial_number": "SN-12345",
    }, headers=auth_headers["admin"])
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Magstim 200"
    assert data["device_type"] == "rTMS"
    device_id = data["id"]

    r = client.get("/api/v1/schedule/devices", headers=auth_headers["clinician"])
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert any(i["id"] == device_id for i in items)


def test_conflict_check_empty(client, auth_headers):
    """No conflicts for empty slot."""
    r = client.post("/api/v1/schedule/conflicts", json={
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-05-01T09:00:00",
        "duration_minutes": 60,
    }, headers=auth_headers["clinician"])
    assert r.status_code == 200
    data = r.json()
    assert data["has_conflicts"] is False
    assert data["conflicts"] == []


def test_conflict_check_requires_auth(client):
    """Conflict check requires authentication."""
    r = client.post("/api/v1/schedule/conflicts", json={
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-05-01T09:00:00",
        "duration_minutes": 60,
    })
    assert r.status_code == 403


def test_list_sessions_with_date_filter(client, auth_headers):
    """Sessions can be filtered by date range."""
    # First create a patient and session
    pr = client.post("/api/v1/patients", json={
        "first_name": "Schedule",
        "last_name": "Test",
        "date_of_birth": "1990-01-01",
        "status": "active",
    }, headers=auth_headers["admin"])
    assert pr.status_code == 201
    pid = pr.json()["id"]

    client.post("/api/v1/sessions", json={
        "patient_id": pid,
        "scheduled_at": "2026-04-30T10:00:00",
        "duration_minutes": 60,
        "modality": "tDCS",
        "appointment_type": "session",
    }, headers=auth_headers["admin"])

    r = client.get("/api/v1/sessions?start_date=2026-04-01&end_date=2026-05-01", headers=auth_headers["clinician"])
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1


def test_list_sessions_with_modality_filter(client, auth_headers):
    """Sessions can be filtered by modality."""
    r = client.get("/api/v1/sessions?modality=tDCS", headers=auth_headers["clinician"])
    assert r.status_code == 200
    data = r.json()
    assert all(s.get("modality") == "tDCS" for s in data["items"])


def test_list_resources_combined(client, auth_headers):
    """Resources endpoint returns clinicians, rooms, devices."""
    r = client.get("/api/v1/schedule/resources", headers=auth_headers["clinician"])
    assert r.status_code == 200
    data = r.json()
    assert "clinicians" in data
    assert "rooms" in data
    assert "devices" in data


def _create_patient_for_schedule(client, auth_headers):
    pr = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Demo",
            "last_name": "Sched",
            "date_of_birth": "1990-01-01",
            "status": "active",
        },
        headers=auth_headers["admin"],
    )
    assert pr.status_code == 201
    return pr.json()["id"]


def test_create_session_success_and_conflict_409(client, auth_headers):
    pid = _create_patient_for_schedule(client, auth_headers)
    body = {
        "patient_id": pid,
        "clinician_id": "actor-clinician-demo",
        "scheduled_at": "2026-05-01T09:00:00",
        "duration_minutes": 60,
        "modality": "tDCS",
        "appointment_type": "session",
    }
    r1 = client.post("/api/v1/sessions", json=body, headers=auth_headers["admin"])
    assert r1.status_code == 201
    created = r1.json()
    assert created["patient_id"] == pid
    assert created["status"] == "scheduled"

    # Overlapping create must fail truthfully (409), not "fake success".
    r2 = client.post("/api/v1/sessions", json=body, headers=auth_headers["admin"])
    assert r2.status_code == 409
    assert r2.json().get("code") == "scheduling_conflict"

    # Non-mutating conflict check endpoint surfaces the overlap.
    c = client.post(
        "/api/v1/schedule/conflicts",
        json={
            "clinician_id": "actor-clinician-demo",
            "scheduled_at": "2026-05-01T09:30:00",
            "duration_minutes": 30,
        },
        headers=auth_headers["clinician"],
    )
    assert c.status_code == 200
    data = c.json()
    assert data["has_conflicts"] is True
    assert len(data["conflicts"]) >= 1


def test_reschedule_conflict_409(client, auth_headers):
    pid = _create_patient_for_schedule(client, auth_headers)
    r1 = client.post(
        "/api/v1/sessions",
        json={
            "patient_id": pid,
            "clinician_id": "actor-clinician-demo",
            "scheduled_at": "2026-05-01T09:00:00",
            "duration_minutes": 60,
            "modality": "tDCS",
            "appointment_type": "session",
        },
        headers=auth_headers["admin"],
    )
    assert r1.status_code == 201

    r2 = client.post(
        "/api/v1/sessions",
        json={
            "patient_id": pid,
            "clinician_id": "actor-clinician-demo",
            "scheduled_at": "2026-05-01T11:00:00",
            "duration_minutes": 30,
            "modality": "tDCS",
            "appointment_type": "session",
        },
        headers=auth_headers["admin"],
    )
    assert r2.status_code == 201
    s2 = r2.json()

    # Reschedule s2 into s1's window -> 409
    p = client.patch(
        f"/api/v1/sessions/{s2['id']}",
        json={"scheduled_at": "2026-05-01T09:30:00", "duration_minutes": 30},
        headers=auth_headers["admin"],
    )
    assert p.status_code == 409
    assert p.json().get("code") == "scheduling_conflict"


def test_cancel_requires_reason_is_recorded(client, auth_headers):
    pid = _create_patient_for_schedule(client, auth_headers)
    r = client.post(
        "/api/v1/sessions",
        json={
            "patient_id": pid,
            "clinician_id": "actor-clinician-demo",
            "scheduled_at": "2026-05-01T10:00:00",
            "duration_minutes": 30,
            "modality": "tDCS",
            "appointment_type": "session",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 201
    sid = r.json()["id"]

    reason = "Patient requested reschedule"
    p = client.patch(
        f"/api/v1/sessions/{sid}",
        json={"status": "cancelled", "cancel_reason": reason},
        headers=auth_headers["admin"],
    )
    assert p.status_code == 200
    out = p.json()
    assert out["status"] == "cancelled"
    assert out["cancel_reason"] == reason


def test_invalid_status_transition_fails_truthfully(client, auth_headers):
    pid = _create_patient_for_schedule(client, auth_headers)
    r = client.post(
        "/api/v1/sessions",
        json={
            "patient_id": pid,
            "clinician_id": "actor-clinician-demo",
            "scheduled_at": "2026-05-01T10:30:00",
            "duration_minutes": 30,
            "modality": "tDCS",
            "appointment_type": "session",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 201
    sid = r.json()["id"]

    # scheduled -> completed is not allowed directly
    p = client.patch(
        f"/api/v1/sessions/{sid}",
        json={"status": "completed"},
        headers=auth_headers["admin"],
    )
    assert p.status_code == 400
    assert p.json().get("code") == "invalid_status_transition"
