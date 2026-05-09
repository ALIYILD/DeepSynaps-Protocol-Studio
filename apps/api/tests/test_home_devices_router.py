"""Tests for home_devices_router.py.

Covers:
- GET  /api/v1/home-devices/source-registry — auth gate + happy path
- POST /api/v1/home-devices/assign          — auth + 404 patient + happy path
- GET  /api/v1/home-devices/assignments     — list (auth)
- GET  /api/v1/home-devices/assignments/{id} — detail 404
- PATCH /api/v1/home-devices/assignments/{id} — bad status 422
- GET  /api/v1/home-devices/session-logs    — auth
- GET  /api/v1/home-devices/adherence-events — auth
- GET  /api/v1/home-devices/review-flags    — auth
- POST /api/v1/home-devices/ai-summary/{id} — review_required gate
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}

_PATIENT_ID = "P-HD-001"


def _seed_patient(db, clinician_id: str) -> None:
    from app.persistence.models import Patient

    if db.query(Patient).filter_by(id=_PATIENT_ID).first() is None:
        db.add(Patient(
            id=_PATIENT_ID,
            clinician_id=clinician_id,
            first_name="Home",
            last_name="DeviceTester",
            dob="1985-03-15",
            email=None,
            phone=None,
            gender="prefer_not_to_say",
            primary_condition="MDD",
            primary_modality="tDCS",
            consent_signed=True,
            consent_date="2026-01-01",
            status="active",
            notes="test",
        ))
        db.commit()


@pytest.fixture()
def seeded_patient():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db, "actor-clinician-demo")
    finally:
        db.close()


# ── Auth gates ──────────────────────────────────────────────────────────────

def test_source_registry_requires_auth():
    r = TestClient(app).get("/api/v1/home-devices/source-registry")
    assert r.status_code == 403


def test_assign_requires_auth():
    r = TestClient(app).post("/api/v1/home-devices/assign", json={
        "patient_id": _PATIENT_ID,
        "device_name": "tDCS Device",
        "device_category": "tDCS",
    })
    assert r.status_code == 403


def test_list_assignments_requires_auth():
    r = TestClient(app).get("/api/v1/home-devices/assignments")
    assert r.status_code == 403


def test_session_logs_requires_auth():
    r = TestClient(app).get("/api/v1/home-devices/session-logs")
    assert r.status_code == 403


def test_adherence_events_requires_auth():
    r = TestClient(app).get("/api/v1/home-devices/adherence-events")
    assert r.status_code == 403


def test_review_flags_requires_auth():
    r = TestClient(app).get("/api/v1/home-devices/review-flags")
    assert r.status_code == 403


# ── Happy paths ─────────────────────────────────────────────────────────────

def test_source_registry_returns_list():
    with TestClient(app) as tc:
        r = tc.get("/api/v1/home-devices/source-registry", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_assignments_returns_empty():
    with TestClient(app) as tc:
        r = tc.get("/api/v1/home-devices/assignments", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_assign_device_404_unknown_patient():
    """Assigning to a non-existent patient must return 404."""
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/home-devices/assign",
            headers=CLINICIAN_HDR,
            json={
                "patient_id": "P-NOBODY-9999",
                "device_name": "Soterix 1x1",
                "device_category": "tDCS",
            },
        )
    assert r.status_code == 404


def test_assign_device_happy_path(seeded_patient):
    with TestClient(app) as tc:
        r = tc.post(
            "/api/v1/home-devices/assign",
            headers=CLINICIAN_HDR,
            json={
                "patient_id": _PATIENT_ID,
                "device_name": "Soterix 1x1",
                "device_category": "tDCS",
                "session_frequency_per_week": 3,
                "planned_total_sessions": 20,
            },
        )
    assert r.status_code == 201
    body = r.json()
    assert body["patient_id"] == _PATIENT_ID
    assert body["device_name"] == "Soterix 1x1"
    assert body["status"] == "active"


def test_get_assignment_404_unknown():
    with TestClient(app) as tc:
        r = tc.get(
            "/api/v1/home-devices/assignments/assign-does-not-exist",
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 404


def test_update_assignment_invalid_status_422(seeded_patient):
    """PATCH with unrecognised status must return 422."""
    # First create one
    with TestClient(app) as tc:
        create_r = tc.post(
            "/api/v1/home-devices/assign",
            headers=CLINICIAN_HDR,
            json={
                "patient_id": _PATIENT_ID,
                "device_name": "TestDevice",
                "device_category": "other",
            },
        )
        assert create_r.status_code == 201
        aid = create_r.json()["id"]

        update_r = tc.patch(
            f"/api/v1/home-devices/assignments/{aid}",
            headers=CLINICIAN_HDR,
            json={"status": "not_a_valid_status"},
        )
    assert update_r.status_code == 422


def test_ai_summary_gate_no_reviewed_sessions(seeded_patient):
    """AI summary must return 403 when no sessions have been reviewed."""
    with TestClient(app) as tc:
        create_r = tc.post(
            "/api/v1/home-devices/assign",
            headers=CLINICIAN_HDR,
            json={
                "patient_id": _PATIENT_ID,
                "device_name": "TestDevice2",
                "device_category": "other",
            },
        )
        assert create_r.status_code == 201
        aid = create_r.json()["id"]

        summary_r = tc.post(
            f"/api/v1/home-devices/ai-summary/{aid}",
            headers=CLINICIAN_HDR,
        )
    assert summary_r.status_code == 403
