"""Tests for the audit trail router — set K (PR 101).

Covers:
  - GET /api/v1/audit-trail             list (empty + filtered)
  - GET /api/v1/audit-trail/summary     summary shape
  - GET /api/v1/audit-trail/export.csv  CSV download
  - GET /api/v1/audit-trail/export.ndjson  NDJSON download
  - GET /api/v1/audit-trail/{event_id}  detail + 404
  - Role gate: patient blocked (403)
  - Auth gate: unauthenticated blocked (403)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}


def _seed_audit_event(db, *, event_id: str = "test-evt-001") -> None:
    from app.persistence.models import AuditEventRecord

    db.add(
        AuditEventRecord(
            event_id=event_id,
            target_id="tgt-1",
            target_type="qeeg",
            action="qeeg.export_csv",
            role="clinician",
            actor_id="actor-clinician-demo",
            note="test note",
            created_at="2026-01-15T10:00:00+00:00",
        )
    )
    db.commit()


# ── Auth gate ────────────────────────────────────────────────────────────────

def test_audit_trail_list_requires_auth():
    r = client.get("/api/v1/audit-trail")
    assert r.status_code == 403


def test_audit_trail_patient_blocked():
    r = client.get("/api/v1/audit-trail", headers=PATIENT_HDR)
    assert r.status_code == 403


# ── List endpoint ────────────────────────────────────────────────────────────

def test_audit_trail_list_empty_db():
    r = client.get("/api/v1/audit-trail", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert "total" in data
    assert "limit" in data
    assert "disclaimers" in data


def test_audit_trail_list_returns_seeded_event():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_audit_event(db, event_id="evt-seed-list-001")
    finally:
        db.close()

    r = client.get("/api/v1/audit-trail", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    # Should contain at least the seeded row (or demo seeds)
    assert data["total"] >= 1


def test_audit_trail_list_surface_filter():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_audit_event(db, event_id="evt-qeeg-filter-001")
    finally:
        db.close()

    r = client.get("/api/v1/audit-trail?surface=qeeg", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["items"], list)


def test_audit_trail_list_pagination():
    r = client.get("/api/v1/audit-trail?limit=5&offset=0", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["limit"] == 5
    assert data["offset"] == 0


# ── Summary endpoint ─────────────────────────────────────────────────────────

def test_audit_trail_summary_shape():
    r = client.get("/api/v1/audit-trail/summary", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "by_surface" in data
    assert "by_day_30d" in data
    assert "sae_related" in data
    assert "regulatory_flagged" in data
    assert "disclaimers" in data


def test_audit_trail_summary_patient_blocked():
    r = client.get("/api/v1/audit-trail/summary", headers=PATIENT_HDR)
    assert r.status_code == 403


# ── Export CSV ────────────────────────────────────────────────────────────────

def test_audit_trail_export_csv_requires_auth():
    r = client.get("/api/v1/audit-trail/export.csv")
    assert r.status_code == 403


def test_audit_trail_export_csv_returns_csv():
    r = client.get("/api/v1/audit-trail/export.csv", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    assert "audit_trail.csv" in r.headers.get("content-disposition", "")
    # Header row must be present
    assert "event_id" in r.text


# ── Export NDJSON ─────────────────────────────────────────────────────────────

def test_audit_trail_export_ndjson_returns_ndjson():
    r = client.get("/api/v1/audit-trail/export.ndjson", headers=ADMIN_HDR)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "ndjson" in ct or "json" in ct
    assert "audit_trail.ndjson" in r.headers.get("content-disposition", "")


# ── Detail endpoint ───────────────────────────────────────────────────────────

def test_audit_trail_detail_not_found():
    r = client.get("/api/v1/audit-trail/no-such-event-id", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_audit_trail_detail_returns_event():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_audit_event(db, event_id="evt-detail-test-001")
    finally:
        db.close()

    r = client.get("/api/v1/audit-trail/evt-detail-test-001", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    data = r.json()
    assert data["event_id"] == "evt-detail-test-001"
    assert "surface" in data
    assert "event_type" in data
    assert "payload_hash" in data
