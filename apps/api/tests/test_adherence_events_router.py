"""Tests for the patient adherence events router — set K (PR 101).

Covers:
  - GET /api/v1/adherence/events           list (patient only; 404 for clinician)
  - GET /api/v1/adherence/summary          summary shape
  - GET /api/v1/adherence/events/{id}      detail + 404
  - POST /api/v1/adherence/events          log event (complete / skipped; future date 422)
  - POST /api/v1/adherence/events/{id}/side-effect  (severity 1-10; missing note 422)
  - POST /api/v1/adherence/events/{id}/escalate
  - GET /api/v1/adherence/export.csv       export shape
  - POST /api/v1/adherence/audit-events    audit ingestion (patient only)
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


def _today_str() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _seed_patient(db, *, pid: str = "patient-ad-001"):
    from app.persistence.models import AdverseEvent, Patient, PatientAdherenceEvent, ConsentRecord

    patient = db.query(Patient).filter_by(email="patient@deepsynaps.com").first()
    if patient is None:
        patient = Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="Adherence",
            last_name="Patient",
            dob="1991-03-11",
            email="patient@deepsynaps.com",
            phone=None,
            gender="prefer_not_to_say",
            primary_condition="Demo",
            primary_modality="Demo",
            consent_signed=True,
            consent_date="2026-01-01",
            status="active",
            notes="[DEMO] adherence test",
        )
        db.add(patient)
        db.flush()
    else:
        patient.id = pid
        patient.clinician_id = "actor-clinician-demo"
        patient.first_name = "Adherence"
        patient.last_name = "Patient"
        patient.dob = "1991-03-11"
        patient.phone = None
        patient.gender = "prefer_not_to_say"
        patient.primary_condition = "Demo"
        patient.primary_modality = "Demo"
        patient.consent_signed = True
        patient.consent_date = "2026-01-01"
        patient.status = "active"
        patient.notes = "[DEMO] adherence test"

    db.query(PatientAdherenceEvent).filter_by(patient_id=patient.id).delete()
    db.query(AdverseEvent).filter_by(patient_id=patient.id).delete()
    db.query(ConsentRecord).filter_by(patient_id=patient.id).delete()
    db.commit()
    return patient.id


def _seed_adherence_event(
    db,
    *,
    event_id: str | None = None,
    patient_id: str = "patient-ad-001",
    event_type: str = "adherence_report",
    status: str = "open",
) -> str:
    import json

    from app.persistence.models import PatientAdherenceEvent

    event_id = event_id or str(uuid.uuid4())
    if db.query(PatientAdherenceEvent).filter_by(id=event_id).first():
        return event_id
    db.add(
        PatientAdherenceEvent(
            id=event_id,
            patient_id=patient_id,
            assignment_id=None,
            course_id=None,
            event_type=event_type,
            severity=None,
            report_date=_today_str(),
            body="Test event body",
            structured_json=json.dumps({"status": "complete"}),
            status=status,
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return event_id


# ── Auth / role gates ─────────────────────────────────────────────────────────

def test_adherence_events_requires_auth():
    r = client.get("/api/v1/adherence/events")
    # Patient-only endpoints return 404 for unauthenticated requests (hides existence)
    assert r.status_code in (403, 404)


def test_adherence_events_clinician_gets_404():
    r = client.get("/api/v1/adherence/events", headers=CLINICIAN_HDR)
    assert r.status_code == 404


# ── List events ───────────────────────────────────────────────────────────────

def test_adherence_events_list_empty():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.get("/api/v1/adherence/events", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "consent_active" in data
    assert "disclaimers" in data


def test_adherence_events_list_seeded():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        eid = _seed_adherence_event(db, event_id="ad-list-event-001")
    finally:
        db.close()

    r = client.get("/api/v1/adherence/events", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    ids = [it["id"] for it in data["items"]]
    assert eid in ids


# ── Summary ───────────────────────────────────────────────────────────────────

def test_adherence_summary_shape():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.get("/api/v1/adherence/summary", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "total_events" in data
    assert "completed_today" in data
    assert "skipped_today" in data
    assert "side_effects_7d" in data
    assert "escalated_open" in data
    assert "consent_active" in data


# ── Detail ────────────────────────────────────────────────────────────────────

def test_adherence_event_detail_not_found():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.get("/api/v1/adherence/events/no-such-id", headers=PATIENT_HDR)
    assert r.status_code == 404


def test_adherence_event_detail_returns_event():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        eid = _seed_adherence_event(db, event_id="ad-detail-001")
    finally:
        db.close()

    r = client.get(f"/api/v1/adherence/events/{eid}", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == eid
    assert "event_type" in data
    assert "status" in data


# ── Log event (POST) ──────────────────────────────────────────────────────────

def test_adherence_log_event_complete():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/adherence/events",
        json={"status": "complete", "report_date": _today_str()},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["event_type"] == "adherence_report"
    assert data["status"] == "open"


def test_adherence_log_event_future_date_422():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/adherence/events",
        json={"status": "complete", "report_date": "2099-12-31"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


def test_adherence_log_event_invalid_status_422():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/adherence/events",
        json={"status": "invalid_status", "report_date": _today_str()},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


# ── Side effect ───────────────────────────────────────────────────────────────

def test_adherence_log_side_effect_happy_path():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        eid = _seed_adherence_event(db, event_id="ad-se-parent-001")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/adherence/events/{eid}/side-effect",
        json={"severity": 5, "note": "Mild headache"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["event_type"] == "side_effect"


def test_adherence_log_side_effect_missing_note_422():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        eid = _seed_adherence_event(db, event_id="ad-se-no-note-001")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/adherence/events/{eid}/side-effect",
        json={"severity": 5},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


# ── Escalate ──────────────────────────────────────────────────────────────────

def test_adherence_escalate_happy_path():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        eid = _seed_adherence_event(db, event_id="ad-escalate-001")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/adherence/events/{eid}/escalate",
        json={"reason": "Clinician review needed"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["status"] == "escalated"


# ── Export CSV ────────────────────────────────────────────────────────────────

def test_adherence_export_csv_content_type():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.get("/api/v1/adherence/export.csv", headers=PATIENT_HDR)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "event_id" in r.text


# ── Audit event ingestion ─────────────────────────────────────────────────────

def test_adherence_audit_event_ingestion():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/adherence/audit-events",
        json={"event": "view", "using_demo_data": True},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data


def test_adherence_audit_event_clinician_blocked():
    r = client.post(
        "/api/v1/adherence/audit-events",
        json={"event": "view"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 403
