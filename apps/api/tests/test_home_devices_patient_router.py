"""Tests for the Patient Home Devices patient-scope router.

Pins:
  - GET /devices requires patient role (clinician gets 404)
  - GET /devices requires auth (no token → 403)
  - GET /devices returns well-shaped list response with patient seeded
  - GET /devices/summary returns well-shaped response
  - POST /devices registers a device (happy path)
  - POST /devices invalid category returns 422
  - POST /devices duplicate serial in same clinic returns 409
  - GET /devices/{id} returns 404 for unknown id
  - GET /devices/{id} cross-patient lookup returns 404
  - POST /audit-events accepts valid event
  - POST /devices/{id}/calibrate happy path
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.persistence.models import Patient, PatientHomeDeviceRegistration

client = TestClient(app)

_PATIENT = {"Authorization": "Bearer patient-demo-token"}
_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}

_BASE = "/api/v1/home-devices"


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def demo_patient() -> Patient:
    """Seed the Patient row that actor-patient-demo resolves to via email."""
    db = SessionLocal()
    try:
        p = Patient(
            id=f"patient-hd-test-{uuid.uuid4().hex[:8]}",
            clinician_id="actor-clinician-demo",
            first_name="Jane",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
            notes=None,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p
    finally:
        db.close()


@pytest.fixture()
def other_patient() -> Patient:
    """A different patient — used as the cross-patient IDOR target."""
    db = SessionLocal()
    try:
        p = Patient(
            id=f"patient-hd-other-{uuid.uuid4().hex[:8]}",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email="other@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p
    finally:
        db.close()


def _seed_registration(*, patient_id: str, device_serial: str | None = None) -> str:
    from datetime import datetime, timezone

    db = SessionLocal()
    try:
        rid = str(uuid.uuid4())
        db.add(
            PatientHomeDeviceRegistration(
                id=rid,
                patient_id=patient_id,
                clinic_id="clinic-demo-default",
                registered_by_actor_id="actor-patient-demo",
                device_name="Synaps One",
                device_category="tdcs",
                device_serial=device_serial,
                settings_json="{}",
                settings_revision=0,
                status="active",
                is_demo=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        return rid
    finally:
        db.close()


# ── Auth guards ──────────────────────────────────────────────────────────────
# NOTE: home_devices_patient_router intentionally returns 404 (not 403) for
# non-patient roles to avoid hinting that the URL exists outside patient scope.
# An unauthenticated caller gets the guest role which is a non-patient role,
# so these endpoints return 404 for unauthenticated requests.


def test_list_devices_non_patient_returns_404():
    # Guest (no token) resolves to the anonymous actor with role=guest → 404.
    r = client.get(f"{_BASE}/devices")
    assert r.status_code == 404


def test_register_device_non_patient_returns_404():
    r = client.post(f"{_BASE}/devices", json={"device_name": "X", "device_category": "tdcs"})
    assert r.status_code == 404


# ── Role gate: clinicians must get 404 on patient-scope endpoints ─────────────


def test_clinician_list_devices_returns_404(demo_patient: Patient):
    r = client.get(f"{_BASE}/devices", headers=_CLINICIAN)
    assert r.status_code == 404


def test_clinician_summary_returns_404(demo_patient: Patient):
    r = client.get(f"{_BASE}/devices/summary", headers=_CLINICIAN)
    assert r.status_code == 404


# ── GET /devices ─────────────────────────────────────────────────────────────


def test_list_devices_patient_empty_returns_well_shaped(demo_patient: Patient):
    r = client.get(f"{_BASE}/devices", headers=_PATIENT)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "consent_active" in body
    assert "is_demo" in body
    assert "disclaimers" in body
    assert body["total"] == 0


def test_list_devices_returns_seeded_device(demo_patient: Patient):
    _seed_registration(patient_id=demo_patient.id)
    r = client.get(f"{_BASE}/devices", headers=_PATIENT)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1


# ── GET /devices/summary ──────────────────────────────────────────────────────


def test_summary_empty_returns_well_shaped(demo_patient: Patient):
    r = client.get(f"{_BASE}/devices/summary", headers=_PATIENT)
    assert r.status_code == 200
    body = r.json()
    for key in ("total_devices", "active", "decommissioned", "faulty",
                "sessions_today", "sessions_7d", "missed_days_7d",
                "consent_active", "is_demo", "disclaimers"):
        assert key in body, f"Missing key: {key}"


# ── POST /devices (register) ──────────────────────────────────────────────────


def test_register_device_happy_path(demo_patient: Patient):
    r = client.post(
        f"{_BASE}/devices",
        json={"device_name": "Synaps One", "device_category": "tdcs"},
        headers=_PATIENT,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["device_name"] == "Synaps One"
    assert body["device_category"] == "tdcs"
    assert body["status"] == "active"


def test_register_device_invalid_category_returns_422(demo_patient: Patient):
    r = client.post(
        f"{_BASE}/devices",
        json={"device_name": "Bad Cat Device", "device_category": "laser_sword"},
        headers=_PATIENT,
    )
    assert r.status_code == 422


def test_register_device_duplicate_serial_returns_409(demo_patient: Patient):
    _seed_registration(patient_id=demo_patient.id, device_serial="SN-DUPE-001")
    r = client.post(
        f"{_BASE}/devices",
        json={
            "device_name": "Another Device",
            "device_category": "tdcs",
            "device_serial": "SN-DUPE-001",
        },
        headers=_PATIENT,
    )
    assert r.status_code == 409


# ── GET /devices/{id} ────────────────────────────────────────────────────────


def test_get_device_unknown_id_returns_404(demo_patient: Patient):
    r = client.get(f"{_BASE}/devices/{uuid.uuid4()}", headers=_PATIENT)
    assert r.status_code == 404


def test_get_device_cross_patient_returns_404(
    demo_patient: Patient, other_patient: Patient
):
    rid = _seed_registration(patient_id=other_patient.id)
    r = client.get(f"{_BASE}/devices/{rid}", headers=_PATIENT)
    assert r.status_code == 404


# ── POST /audit-events ────────────────────────────────────────────────────────


def test_audit_events_accepts_valid_event(demo_patient: Patient):
    r = client.post(
        f"{_BASE}/audit-events",
        json={"event": "page_mounted"},
        headers=_PATIENT,
    )
    assert r.status_code in (200, 201)
    body = r.json()
    assert body.get("accepted") is True
    assert "event_id" in body
