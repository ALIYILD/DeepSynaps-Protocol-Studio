"""Happy-path tests for the Sessions router.

Scope: /api/v1/sessions — list, create, get, update, delete, status
transitions. Verifies role gate, empty-DB stability, and that invalid
status transitions are rejected.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}


def test_list_sessions_empty_db(client: TestClient) -> None:
    r = client.get("/api/v1/sessions", headers=AUTH_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body["total"] == 0


def test_list_sessions_guest_blocked(client: TestClient) -> None:
    r = client.get("/api/v1/sessions", headers=AUTH_GUEST)
    assert r.status_code in (403, 404)


def test_get_session_not_found(client: TestClient) -> None:
    r = client.get("/api/v1/sessions/no-such-session", headers=AUTH_CLINICIAN)
    assert r.status_code == 404


def test_create_session_missing_required_fields(client: TestClient) -> None:
    """Creating a session without required fields returns 422."""
    r = client.post(
        "/api/v1/sessions",
        json={},
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 422


def _seed_patient_and_session(client: TestClient) -> dict:
    """Create a minimal patient then a session; returns session dict."""
    # Create a patient first.
    pt_r = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Session",
            "last_name": "Tester",
            "dob": "1990-01-01",
            "email": None,
            "phone": None,
            "gender": "prefer_not_to_say",
            "primary_condition": "MDD",
            "primary_modality": "TMS",
            "consent_signed": True,
            "consent_date": "2026-01-01",
        },
        headers=AUTH_CLINICIAN,
    )
    assert pt_r.status_code in (200, 201), pt_r.text
    patient_id = pt_r.json()["id"]

    sess_r = client.post(
        "/api/v1/sessions",
        json={
            "patient_id": patient_id,
            "scheduled_at": "2026-06-01T09:00:00+00:00",
            "duration_minutes": 45,
            "appointment_type": "session",
        },
        headers=AUTH_CLINICIAN,
    )
    assert sess_r.status_code in (200, 201), sess_r.text
    return sess_r.json()


def test_create_and_get_session(client: TestClient) -> None:
    session = _seed_patient_and_session(client)
    sid = session["id"]

    get_r = client.get(f"/api/v1/sessions/{sid}", headers=AUTH_CLINICIAN)
    assert get_r.status_code == 200
    assert get_r.json()["id"] == sid
    assert get_r.json()["status"] == "scheduled"


def test_session_invalid_status_transition_rejected(client: TestClient) -> None:
    session = _seed_patient_and_session(client)
    sid = session["id"]

    # "scheduled" → "completed" is not a valid direct transition.
    patch_r = client.patch(
        f"/api/v1/sessions/{sid}",
        json={"status": "completed"},
        headers=AUTH_CLINICIAN,
    )
    assert patch_r.status_code in (400, 422), patch_r.text


def test_create_session_list_reflects_new_entry(client: TestClient) -> None:
    _seed_patient_and_session(client)

    list_r = client.get("/api/v1/sessions", headers=AUTH_CLINICIAN)
    assert list_r.status_code == 200
    assert list_r.json()["total"] >= 1
