"""Tests for the patient wearables router — set K (PR 101).

Covers:
  - GET /api/v1/patient-wearables/devices          list (patient only; 404 for clinician)
  - GET /api/v1/patient-wearables/devices/summary  summary shape
  - GET /api/v1/patient-wearables/devices/{id}     detail + 404
  - POST /api/v1/patient-wearables/devices/{id}/sync  sync trigger (consent, 409 disconnected)
  - POST /api/v1/patient-wearables/devices/{id}/disconnect  (note required)
  - POST /api/v1/patient-wearables/audit-events    audit ingestion (patient only)
  - Auth gate: unauthenticated → 403
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


def _seed_patient(db, *, pid: str = "patient-pw-001"):
    from app.persistence.models import Patient

    if db.query(Patient).filter_by(id=pid).first():
        return pid
    db.add(
        Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="Wearables",
            last_name="Patient",
            dob="1988-07-22",
            email="patient@deepsynaps.com",
            phone=None,
            gender="prefer_not_to_say",
            primary_condition="Demo",
            primary_modality="Demo",
            consent_signed=True,
            consent_date="2026-01-01",
            status="active",
            notes="[DEMO] wearables test",
        )
    )
    db.commit()
    return pid


def _seed_device(
    db,
    *,
    device_id: str | None = None,
    patient_id: str = "patient-pw-001",
    status: str = "connected",
) -> str:
    from app.persistence.models import DeviceConnection

    device_id = device_id or str(uuid.uuid4())
    if db.query(DeviceConnection).filter_by(id=device_id).first():
        return device_id
    db.add(
        DeviceConnection(
            id=device_id,
            patient_id=patient_id,
            source="fitbit",
            source_type="wearable",
            display_name="Fitbit Test",
            status=status,
            consent_given=True,
            connected_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return device_id


# ── Auth / role gates ─────────────────────────────────────────────────────────

def test_patient_wearables_requires_auth():
    r = client.get("/api/v1/patient-wearables/devices")
    # Patient-only endpoints return 404 for unauthenticated requests (hides existence)
    assert r.status_code in (403, 404)


def test_patient_wearables_clinician_gets_404():
    """Clinician must receive 404 (patient-only endpoint hides its existence)."""
    r = client.get("/api/v1/patient-wearables/devices", headers=CLINICIAN_HDR)
    assert r.status_code == 404


# ── Device list ───────────────────────────────────────────────────────────────

def test_patient_wearables_list_empty():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.get("/api/v1/patient-wearables/devices", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "consent_active" in data
    assert "disclaimers" in data


def test_patient_wearables_list_seeded():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        did = _seed_device(db, device_id="pw-device-list-001")
    finally:
        db.close()

    r = client.get("/api/v1/patient-wearables/devices", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    ids = [it["id"] for it in data["items"]]
    assert did in ids


# ── Summary ───────────────────────────────────────────────────────────────────

def test_patient_wearables_summary_shape():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.get("/api/v1/patient-wearables/devices/summary", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "connected" in data
    assert "synced_today" in data
    assert "synced_7d" in data
    assert "pending_anomalies" in data
    assert "consent_active" in data


# ── Device detail ─────────────────────────────────────────────────────────────

def test_patient_wearables_device_detail_not_found():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.get("/api/v1/patient-wearables/devices/no-such-device", headers=PATIENT_HDR)
    assert r.status_code == 404


def test_patient_wearables_device_detail_returns_device():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        did = _seed_device(db, device_id="pw-device-detail-001")
    finally:
        db.close()

    r = client.get(f"/api/v1/patient-wearables/devices/{did}", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == did
    assert data["source"] == "fitbit"
    assert "status" in data


# ── Sync ─────────────────────────────────────────────────────────────────────

def test_patient_wearables_sync_happy_path():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        did = _seed_device(db, device_id="pw-sync-happy-001")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/patient-wearables/devices/{did}/sync",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "last_sync_at" in data


def test_patient_wearables_sync_disconnected_409():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        did = _seed_device(db, device_id="pw-sync-disc-001", status="disconnected")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/patient-wearables/devices/{did}/sync",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 409


# ── Disconnect ────────────────────────────────────────────────────────────────

def test_patient_wearables_disconnect_requires_note():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        did = _seed_device(db, device_id="pw-disc-no-note-001")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/patient-wearables/devices/{did}/disconnect",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


def test_patient_wearables_disconnect_happy_path():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        did = _seed_device(db, device_id="pw-disc-happy-001")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/patient-wearables/devices/{did}/disconnect",
        json={"note": "No longer needed"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["status"] == "disconnected"


# ── Audit event ingestion ─────────────────────────────────────────────────────

def test_patient_wearables_audit_event():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/patient-wearables/audit-events",
        json={"event": "view", "using_demo_data": True},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data


def test_patient_wearables_audit_event_clinician_blocked():
    r = client.post(
        "/api/v1/patient-wearables/audit-events",
        json={"event": "view"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 403
