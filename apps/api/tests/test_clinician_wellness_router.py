"""Tests for the clinician wellness router — set K (PR 101).

Covers:
  - GET /api/v1/clinician-wellness/checkins           list (empty + seeded)
  - GET /api/v1/clinician-wellness/checkins/summary   summary shape
  - GET /api/v1/clinician-wellness/checkins/{id}      detail + 404
  - POST /api/v1/clinician-wellness/checkins/{id}/acknowledge  (note required)
  - POST /api/v1/clinician-wellness/checkins/{id}/resolve      (immutable 409)
  - POST /api/v1/clinician-wellness/audit-events      audit ingestion
  - Role gate: patient blocked (403)
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}


def _seed_patient(db, *, pid: str = "patient-wl-001"):
    from app.persistence.models import Patient

    if db.query(Patient).filter_by(id=pid).first():
        return pid
    db.add(
        Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="Wellness",
            last_name="TestPat",
            dob="1985-06-01",
            email=None,
            phone=None,
            gender="prefer_not_to_say",
            primary_condition="Demo",
            primary_modality="Demo",
            consent_signed=True,
            consent_date="2026-01-01",
            status="active",
        )
    )
    db.commit()
    return pid


def _seed_checkin(db, *, cid: str | None = None, patient_id: str = "patient-wl-001", mood: int = 3):
    from datetime import datetime, timezone

    from app.persistence.models import WellnessCheckin

    cid = cid or str(uuid.uuid4())
    if db.query(WellnessCheckin).filter_by(id=cid).first():
        return cid
    db.add(
        WellnessCheckin(
            id=cid,
            patient_id=patient_id,
            author_actor_id="actor-patient-demo",
            mood=mood,
            energy=5,
            sleep=5,
            anxiety=2,
            focus=5,
            pain=1,
            note="test checkin",
            tags="",
            clinician_status="open",
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return cid


# ── Role gates ────────────────────────────────────────────────────────────────

def test_wellness_checkins_patient_forbidden():
    r = client.get("/api/v1/clinician-wellness/checkins", headers=PATIENT_HDR)
    assert r.status_code == 403


def test_wellness_checkins_requires_auth():
    r = client.get("/api/v1/clinician-wellness/checkins")
    assert r.status_code == 403


# ── List checkins ─────────────────────────────────────────────────────────────

def test_wellness_checkins_list_empty():
    r = client.get("/api/v1/clinician-wellness/checkins", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert "total" in data
    assert "disclaimers" in data


def test_wellness_checkins_list_seeded():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        cid = _seed_checkin(db, mood=2)
    finally:
        db.close()

    # Admin sees all clinics
    r = client.get("/api/v1/clinician-wellness/checkins", headers=ADMIN_HDR)
    assert r.status_code == 200
    data = r.json()
    ids = [it["id"] for it in data["items"]]
    assert cid in ids


# ── Summary ───────────────────────────────────────────────────────────────────

def test_wellness_summary_shape():
    r = client.get("/api/v1/clinician-wellness/checkins/summary", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "total_today" in data
    assert "total_7d" in data
    assert "escalation_candidates" in data
    assert "response_rate_pct" in data
    assert "disclaimers" in data


# ── Detail ────────────────────────────────────────────────────────────────────

def test_wellness_detail_not_found():
    r = client.get("/api/v1/clinician-wellness/checkins/no-such-id", headers=ADMIN_HDR)
    assert r.status_code == 404


def test_wellness_detail_returns_checkin():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        cid = _seed_checkin(db, cid="wl-detail-001")
    finally:
        db.close()

    r = client.get(f"/api/v1/clinician-wellness/checkins/{cid}", headers=ADMIN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == cid
    assert "severity_band" in data
    assert "clinician_status" in data


# ── Acknowledge ───────────────────────────────────────────────────────────────

def test_wellness_acknowledge_happy_path():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        cid = _seed_checkin(db, cid="wl-ack-001")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/clinician-wellness/checkins/{cid}/acknowledge",
        json={"note": "Reviewed by clinician"},
        headers=ADMIN_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["clinician_status"] == "acknowledged"


def test_wellness_acknowledge_missing_note_422():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        cid = _seed_checkin(db, cid="wl-ack-note-422")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/clinician-wellness/checkins/{cid}/acknowledge",
        json={},
        headers=ADMIN_HDR,
    )
    assert r.status_code == 422


# ── Resolve immutability ──────────────────────────────────────────────────────

def test_wellness_resolve_then_409_on_second_action():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        cid = _seed_checkin(db, cid="wl-resolve-imm-001")
    finally:
        db.close()

    client.post(
        f"/api/v1/clinician-wellness/checkins/{cid}/resolve",
        json={"note": "Resolved by test"},
        headers=ADMIN_HDR,
    )
    # Second action on a resolved check-in must return 409
    r2 = client.post(
        f"/api/v1/clinician-wellness/checkins/{cid}/acknowledge",
        json={"note": "Should fail"},
        headers=ADMIN_HDR,
    )
    assert r2.status_code == 409


# ── Audit event ingestion ─────────────────────────────────────────────────────

def test_wellness_audit_event_ingestion():
    r = client.post(
        "/api/v1/clinician-wellness/audit-events",
        json={"event": "view", "using_demo_data": False},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data


def test_wellness_audit_event_patient_blocked():
    r = client.post(
        "/api/v1/clinician-wellness/audit-events",
        json={"event": "view"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 403
