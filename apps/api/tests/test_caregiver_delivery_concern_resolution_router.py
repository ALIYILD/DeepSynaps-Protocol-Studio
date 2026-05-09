"""Tests for caregiver_delivery_concern_resolution_router (DCR1).

Covers:
  - GET /list auth gate + happy path (open + resolved)
  - POST /resolve auth gate + invalid reason (422) + no open flag (409)
  - POST /resolve caregiver_not_found (404) + happy path
  - GET /audit-events auth gate + shape
  - POST /audit-events page-level ingestion
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}

BASE = "/api/v1/caregiver-delivery-concern-resolution"


# ── seed helpers ──────────────────────────────────────────────────────────────

def _seed_caregiver(user_id: str = "cg-test-001") -> str:
    """Add a User row to act as a caregiver in the demo clinic."""
    from app.database import SessionLocal
    from app.persistence.models import User

    db = SessionLocal()
    try:
        if db.query(User).filter_by(id=user_id).first() is None:
            db.add(User(
                id=user_id,
                email=f"{user_id}@example.com",
                display_name="Test Caregiver",
                hashed_password="x",
                role="patient",
                package_id="free",
                clinic_id="clinic-demo-default",
            ))
            db.commit()
    finally:
        db.close()
    return user_id


def _seed_flag_row(caregiver_id: str) -> None:
    """Emit a threshold_reached audit row so resolve can find an open flag."""
    from app.database import SessionLocal
    from app.persistence.models import AuditEventRecord
    from app.workers.caregiver_delivery_concern_aggregator_worker import FLAG_ACTION, PORTAL_SURFACE
    import uuid
    from datetime import datetime, timezone

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc).isoformat()
        eid = f"flag-test-{uuid.uuid4().hex[:12]}"
        db.add(AuditEventRecord(
            event_id=eid,
            target_id=caregiver_id,
            target_type=PORTAL_SURFACE,
            action=FLAG_ACTION,
            role="admin",
            actor_id="actor-admin-demo",
            note=(
                f"priority=high caregiver_id={caregiver_id} "
                f"clinic_id=clinic-demo-default concern_count=5 "
                f"window_hours=168 threshold=5"
            ),
            created_at=now,
        ))
        db.commit()
    finally:
        db.close()


# ── tests ─────────────────────────────────────────────────────────────────────

def test_list_requires_auth():
    r = client.get(f"{BASE}/list")
    assert r.status_code == 403


def test_list_open_empty():
    r = client.get(f"{BASE}/list?status=open", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "open"
    assert "items" in data
    assert data["total"] == 0


def test_list_resolved_empty():
    r = client.get(f"{BASE}/list?status=resolved", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "resolved"
    assert "resolved_items" in data


def test_resolve_requires_auth():
    r = client.post(
        f"{BASE}/resolve",
        json={
            "caregiver_user_id": "cg-test-001",
            "resolution_reason": "concerns_addressed",
            "resolution_note": "All concerns have been addressed and resolved",
        },
    )
    assert r.status_code == 403


def test_resolve_invalid_reason_422():
    r = client.post(
        f"{BASE}/resolve",
        json={
            "caregiver_user_id": "cg-test-001",
            "resolution_reason": "not_a_valid_reason",
            "resolution_note": "This note satisfies the minimum length requirement",
        },
        headers=ADMIN,
    )
    assert r.status_code == 422


def test_resolve_nonexistent_caregiver_404():
    r = client.post(
        f"{BASE}/resolve",
        json={
            "caregiver_user_id": "cg-does-not-exist-xyz",
            "resolution_reason": "false_positive",
            "resolution_note": "Caregiver does not exist so this should 404",
        },
        headers=ADMIN,
    )
    assert r.status_code == 404


def test_resolve_no_open_flag_409():
    cg_id = _seed_caregiver("cg-no-flag-001")
    r = client.post(
        f"{BASE}/resolve",
        json={
            "caregiver_user_id": cg_id,
            "resolution_reason": "concerns_addressed",
            "resolution_note": "No open flag exists so this should return 409",
        },
        headers=ADMIN,
    )
    assert r.status_code == 409


def test_resolve_happy_path():
    cg_id = _seed_caregiver("cg-flag-happy-001")
    _seed_flag_row(cg_id)
    r = client.post(
        f"{BASE}/resolve",
        json={
            "caregiver_user_id": cg_id,
            "resolution_reason": "concerns_addressed",
            "resolution_note": "All delivery concerns have been thoroughly addressed",
        },
        headers=ADMIN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["caregiver_user_id"] == cg_id
    assert data["resolution_reason"] == "concerns_addressed"
    assert "audit_event_id" in data


def test_audit_events_requires_auth():
    r = client.get(f"{BASE}/audit-events")
    assert r.status_code == 403


def test_audit_events_shape():
    r = client.get(f"{BASE}/audit-events", headers=CLINICIAN)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "surface" in data
    assert data["surface"] == "caregiver_delivery_concern_resolution"


def test_post_audit_event_happy_path():
    r = client.post(
        f"{BASE}/audit-events",
        json={"event": "resolution_panel_opened"},
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "event_id" in data
