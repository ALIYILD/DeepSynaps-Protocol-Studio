"""Tests for the wearables workbench router — set K (PR 101).

Covers:
  - GET /api/v1/wearables/workbench/flags           list (empty + seeded)
  - GET /api/v1/wearables/workbench/flags/summary   summary shape
  - GET /api/v1/wearables/workbench/flags/{id}      detail + 404
  - POST /api/v1/wearables/workbench/flags/{id}/acknowledge  (note required)
  - POST /api/v1/wearables/workbench/flags/{id}/resolve      (immutable 409)
  - POST /api/v1/wearables/workbench/audit-events    audit ingestion
  - Role gate: patient blocked (403)
  - Export CSV content-type
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}


def _seed_patient(db, *, pid: str = "patient-wb-001"):
    from app.persistence.models import Patient

    if db.query(Patient).filter_by(id=pid).first():
        return pid
    db.add(
        Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="WB",
            last_name="TestPat",
            dob="1982-04-15",
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


def _seed_flag(db, *, flag_id: str | None = None, patient_id: str = "patient-wb-001",
               severity: str = "warning", dismissed: bool = False) -> str:
    from app.persistence.models import WearableAlertFlag

    flag_id = flag_id or str(uuid.uuid4())
    if db.query(WearableAlertFlag).filter_by(id=flag_id).first():
        return flag_id
    db.add(
        WearableAlertFlag(
            id=flag_id,
            patient_id=patient_id,
            course_id=None,
            flag_type="hr_high",
            severity=severity,
            detail="HR spike detected",
            metric_snapshot=None,
            triggered_at=datetime.now(timezone.utc),
            dismissed=dismissed,
            auto_generated=True,
        )
    )
    db.commit()
    return flag_id


# ── Role gates ────────────────────────────────────────────────────────────────

def test_workbench_flags_patient_forbidden():
    r = client.get("/api/v1/wearables/workbench/flags", headers=PATIENT_HDR)
    assert r.status_code == 403


def test_workbench_flags_requires_auth():
    r = client.get("/api/v1/wearables/workbench/flags")
    assert r.status_code == 403


# ── List flags ────────────────────────────────────────────────────────────────

def test_workbench_flags_list_empty():
    r = client.get("/api/v1/wearables/workbench/flags", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert "total" in data
    assert "disclaimers" in data


def test_workbench_flags_list_seeded():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        fid = _seed_flag(db, flag_id="wb-flag-list-001")
    finally:
        db.close()

    r = client.get("/api/v1/wearables/workbench/flags", headers=ADMIN_HDR)
    assert r.status_code == 200
    data = r.json()
    ids = [it["id"] for it in data["items"]]
    assert fid in ids


# ── Summary ───────────────────────────────────────────────────────────────────

def test_workbench_summary_shape():
    r = client.get("/api/v1/wearables/workbench/flags/summary", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "open" in data
    assert "acknowledged" in data
    assert "escalated" in data
    assert "resolved" in data
    assert "incidence_7d" in data
    assert "disclaimers" in data


# ── Detail ────────────────────────────────────────────────────────────────────

def test_workbench_flag_detail_not_found():
    r = client.get("/api/v1/wearables/workbench/flags/no-such-id", headers=ADMIN_HDR)
    assert r.status_code == 404


def test_workbench_flag_detail_returns_flag():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        fid = _seed_flag(db, flag_id="wb-flag-detail-001")
    finally:
        db.close()

    r = client.get(f"/api/v1/wearables/workbench/flags/{fid}", headers=ADMIN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == fid
    assert "status" in data
    assert "severity" in data


# ── Acknowledge ───────────────────────────────────────────────────────────────

def test_workbench_acknowledge_happy_path():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        fid = _seed_flag(db, flag_id="wb-ack-001")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/wearables/workbench/flags/{fid}/acknowledge",
        json={"note": "Reviewed by clinician"},
        headers=ADMIN_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["status"] == "acknowledged"


def test_workbench_acknowledge_missing_note_422():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        fid = _seed_flag(db, flag_id="wb-ack-note-422")
    finally:
        db.close()

    r = client.post(
        f"/api/v1/wearables/workbench/flags/{fid}/acknowledge",
        json={},
        headers=ADMIN_HDR,
    )
    assert r.status_code == 422


# ── Resolve immutability ──────────────────────────────────────────────────────

def test_workbench_resolve_then_409():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient(db)
        fid = _seed_flag(db, flag_id="wb-resolve-imm-001")
    finally:
        db.close()

    client.post(
        f"/api/v1/wearables/workbench/flags/{fid}/resolve",
        json={"note": "Resolved"},
        headers=ADMIN_HDR,
    )
    r2 = client.post(
        f"/api/v1/wearables/workbench/flags/{fid}/acknowledge",
        json={"note": "Should fail"},
        headers=ADMIN_HDR,
    )
    assert r2.status_code == 409


# ── Export CSV ────────────────────────────────────────────────────────────────

def test_workbench_export_csv_content_type():
    r = client.get("/api/v1/wearables/workbench/flags/export.csv", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "flag_id" in r.text  # CSV header row


# ── Audit event ingestion ─────────────────────────────────────────────────────

def test_workbench_audit_event_ingestion():
    r = client.post(
        "/api/v1/wearables/workbench/audit-events",
        json={"event": "view", "using_demo_data": False},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data


def test_workbench_audit_event_patient_blocked():
    r = client.post(
        "/api/v1/wearables/workbench/audit-events",
        json={"event": "view"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 403
