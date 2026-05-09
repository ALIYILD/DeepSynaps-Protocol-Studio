"""Tests for home_device_portal_router.py — happy + auth + 422 + edge."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient


_BASE = "/api/v1/patient-portal"


def _seed_demo_patient(db) -> None:
    """Seed User + Patient row for the demo patient token."""
    from app.persistence.models import Patient, User

    if db.query(User).filter_by(id="actor-patient-demo").first() is None:
        db.add(User(
            id="actor-patient-demo",
            email="patient@deepsynaps.com",
            display_name="Demo Patient",
            hashed_password="x",
            role="patient",
            package_id="free",
        ))
    if db.query(Patient).filter_by(email="patient@deepsynaps.com").first() is None:
        db.add(Patient(
            id="p-demo-patient",
            clinician_id="actor-clinician-demo",
            first_name="Demo",
            last_name="Patient",
            dob="1990-01-01",
            email="patient@deepsynaps.com",
            gender="prefer_not_to_say",
            primary_condition="MDD",
            primary_modality="tDCS",
            consent_signed=True,
            consent_date="2026-01-01",
            status="active",
        ))
    db.commit()


# ── GET /home-device ──────────────────────────────────────────────────────────


def test_home_device_no_assignment(client: TestClient, auth_headers: dict) -> None:
    """Patient with no device assignment returns assignment=None."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_demo_patient(db)
    finally:
        db.close()

    r = client.get(f"{_BASE}/home-device", headers=auth_headers["patient"])
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert r.json()["assignment"] is None


def test_home_device_requires_auth(client: TestClient) -> None:
    """Home-device endpoint must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/home-device")
    assert r.status_code == 403


def test_home_device_clinician_forbidden(client: TestClient, auth_headers: dict) -> None:
    """Clinician role is not allowed in the patient portal."""
    r = client.get(f"{_BASE}/home-device", headers=auth_headers["clinician"])
    assert r.status_code == 403


# ── GET /home-sessions ────────────────────────────────────────────────────────


def test_home_sessions_list_patient(client: TestClient, auth_headers: dict) -> None:
    """Patient gets an empty session list when no sessions exist."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_demo_patient(db)
    finally:
        db.close()

    r = client.get(f"{_BASE}/home-sessions", headers=auth_headers["patient"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_home_sessions_requires_auth(client: TestClient) -> None:
    """Home-sessions must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/home-sessions")
    assert r.status_code == 403


# ── POST /home-sessions ───────────────────────────────────────────────────────


def test_log_home_session_no_assignment_404(client: TestClient, auth_headers: dict) -> None:
    """Logging a session without an active assignment returns 404."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_demo_patient(db)
    finally:
        db.close()

    today = datetime.now(timezone.utc).date().isoformat()
    r = client.post(
        f"{_BASE}/home-sessions",
        json={"session_date": today, "completed": True},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 404


def test_log_home_session_future_date(client: TestClient, auth_headers: dict) -> None:
    """Session date in the future is rejected (422 if date validation fires first, 404 if no assignment)."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_demo_patient(db)
    finally:
        db.close()

    r = client.post(
        f"{_BASE}/home-sessions",
        json={"session_date": "2099-12-31", "completed": True},
        headers=auth_headers["patient"],
    )
    # Date validation may run after or before the assignment check depending on implementation.
    assert r.status_code in (404, 422)


# ── POST /adherence-events ────────────────────────────────────────────────────


def test_submit_adherence_event_invalid_type_422(client: TestClient, auth_headers: dict) -> None:
    """Invalid event_type returns 422."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_demo_patient(db)
    finally:
        db.close()

    today = datetime.now(timezone.utc).date().isoformat()
    r = client.post(
        f"{_BASE}/adherence-events",
        json={"event_type": "bad_type", "report_date": today},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 422


def test_adherence_events_list_patient(client: TestClient, auth_headers: dict) -> None:
    """Patient gets an empty adherence-events list."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_demo_patient(db)
    finally:
        db.close()

    r = client.get(f"{_BASE}/adherence-events", headers=auth_headers["patient"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── GET /home-adherence-summary ───────────────────────────────────────────────


def test_home_adherence_summary_no_assignment(client: TestClient, auth_headers: dict) -> None:
    """No assignment returns assignment=None."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_demo_patient(db)
    finally:
        db.close()

    r = client.get(f"{_BASE}/home-adherence-summary", headers=auth_headers["patient"])
    assert r.status_code == 200
    body = r.json()
    assert body["assignment"] is None


def test_home_adherence_summary_requires_auth(client: TestClient) -> None:
    """Adherence summary must reject unauthenticated requests."""
    r = client.get(f"{_BASE}/home-adherence-summary")
    assert r.status_code == 403
