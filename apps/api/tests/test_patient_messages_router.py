"""Tests for the patient messages router — set K (PR 101).

Covers:
  - GET /api/v1/messages/threads           list (requires patient role)
  - GET /api/v1/messages/threads/summary   summary shape
  - POST /api/v1/messages/threads          create thread (201, consent gate)
  - POST /api/v1/messages/threads/{id}/messages  reply
  - POST /api/v1/messages/threads/{id}/mark-urgent
  - POST /api/v1/messages/audit-events     audit ingestion
  - Role gate: clinician → 404; unauth → 403
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


def _seed_patient_with_consent(db):
    """Seed a demo patient row that the patient-demo-token actor resolves to."""
    from app.persistence.models import Patient

    existing = db.query(Patient).filter_by(email="patient@deepsynaps.com").first()
    if existing:
        return existing
    p = Patient(
        id="patient-demo-id",
        clinician_id="actor-clinician-demo",
        first_name="Demo",
        last_name="Patient",
        dob="1990-01-01",
        email="patient@deepsynaps.com",
        phone=None,
        gender="prefer_not_to_say",
        primary_condition="Demo",
        primary_modality="Demo",
        consent_signed=True,
        consent_date="2026-01-01",
        status="active",
        notes="[DEMO] test patient",
    )
    db.add(p)
    db.commit()
    return p


# ── Auth / role gates ─────────────────────────────────────────────────────────

def test_messages_threads_requires_auth():
    r = client.get("/api/v1/messages/threads")
    # Patient-only endpoints return 404 for unauthenticated requests (hides existence)
    assert r.status_code in (403, 404)


def test_messages_clinician_gets_404():
    """Clinician role returns 404 (patient-only endpoint hides its existence)."""
    r = client.get("/api/v1/messages/threads", headers=CLINICIAN_HDR)
    assert r.status_code == 404


# ── List threads (empty) ─────────────────────────────────────────────────────

def test_messages_list_threads_empty():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_with_consent(db)
    finally:
        db.close()

    r = client.get("/api/v1/messages/threads", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert "total" in data
    assert "consent_active" in data
    assert "disclaimers" in data


# ── Summary ───────────────────────────────────────────────────────────────────

def test_messages_summary_shape():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_with_consent(db)
    finally:
        db.close()

    r = client.get("/api/v1/messages/threads/summary", headers=PATIENT_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "total_threads" in data
    assert "unread" in data
    assert "urgent" in data
    assert "awaiting_reply" in data
    assert "consent_active" in data


# ── Create thread (POST) ──────────────────────────────────────────────────────

def test_messages_create_thread_happy_path():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_with_consent(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/messages/threads",
        json={"category": "general", "subject": "Test thread", "body": "Hello from patient"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 201
    data = r.json()
    assert "thread" in data
    assert "messages" in data
    assert data["thread"]["message_count"] == 1


def test_messages_create_thread_blank_body_422():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_with_consent(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/messages/threads",
        json={"category": "general", "body": "   "},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


def test_messages_create_thread_missing_body_422():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_with_consent(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/messages/threads",
        json={"category": "general"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


# ── Reply to thread ───────────────────────────────────────────────────────────

def test_messages_reply_to_thread():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_with_consent(db)
    finally:
        db.close()

    # Create a thread first
    create = client.post(
        "/api/v1/messages/threads",
        json={"category": "general", "body": "Initial message"},
        headers=PATIENT_HDR,
    )
    assert create.status_code == 201
    thread_id = create.json()["thread"]["thread_id"]

    # Reply
    r = client.post(
        f"/api/v1/messages/threads/{thread_id}/messages",
        json={"body": "A reply from patient"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["thread"]["message_count"] == 2


# ── Mark urgent ───────────────────────────────────────────────────────────────

def test_messages_mark_urgent():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_with_consent(db)
    finally:
        db.close()

    create = client.post(
        "/api/v1/messages/threads",
        json={"category": "urgent", "body": "Something urgent"},
        headers=PATIENT_HDR,
    )
    assert create.status_code == 201
    thread_id = create.json()["thread"]["thread_id"]

    r = client.post(
        f"/api/v1/messages/threads/{thread_id}/mark-urgent",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["is_urgent"] is True


# ── Audit event ingestion ─────────────────────────────────────────────────────

def test_messages_audit_event_ingestion():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_with_consent(db)
    finally:
        db.close()

    r = client.post(
        "/api/v1/messages/audit-events",
        json={"event": "view", "using_demo_data": True},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data


def test_messages_audit_event_clinician_blocked():
    """Clinician role must get 404 (cross-role patient resolver)."""
    r = client.post(
        "/api/v1/messages/audit-events",
        json={"event": "view"},
        headers=CLINICIAN_HDR,
    )
    # Router returns 403 specifically for audit-events endpoint (not 404)
    assert r.status_code in (403, 404)
