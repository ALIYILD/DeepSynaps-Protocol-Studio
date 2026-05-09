"""Tests for data_privacy_router — /api/v1/privacy.

Tests cover:
- POST /export queues a job and returns export_id + status=queued
- POST /export returns 401 without auth (demo-token blocked; real JWT required)
- GET  /exports lists the user's exports (empty initially)
- GET  /exports returns the row after creation (status may advance to 'ready')
- GET  /exports/{id} returns single export for the owner
- GET  /exports/{id} returns 404 for another user's export (IDOR guard)
- GET  /exports/{id} returns 404 for unknown id
- DELETE /exports/{id} removes the export row
- DELETE /exports/{id} returns 404 for unknown id
- POST /export creates a DataExport row in the DB

Notes:
- TestClient runs background tasks synchronously, so status may advance
  from 'queued' to 'ready' before the follow-up request.
- Uses create_access_token to mint real JWTs (demo tokens are rejected).
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import User
from app.services.auth_service import create_access_token


# ── Helpers ───────────────────────────────────────────────────────────────────


def _seed_user_attrs(
    db: Session, *, role: str = "clinician", clinic_id: str | None = None
) -> dict:
    """Seed a User row and return a plain dict with the attributes we need.

    Returning a plain dict avoids SQLAlchemy DetachedInstanceError when the
    session is closed before the attributes are accessed.
    """
    uid = str(uuid.uuid4())
    user = User(
        id=uid,
        email=f"priv_{uid[:8]}@example.com",
        display_name="Privacy Test User",
        hashed_password="x",
        role=role,
        package_id="clinician_pro",
        clinic_id=clinic_id,
    )
    db.add(user)
    db.commit()
    return {
        "id": uid,
        "email": f"priv_{uid[:8]}@example.com",
        "role": role,
        "package_id": "clinician_pro",
        "clinic_id": clinic_id,
    }


def _mint(attrs: dict) -> dict[str, str]:
    token = create_access_token(
        user_id=attrs["id"],
        email=attrs["email"],
        role=attrs["role"],
        package_id=attrs["package_id"] or "explorer",
        clinic_id=attrs["clinic_id"],
    )
    return {"Authorization": f"Bearer {token}"}


_VALID_STATUSES = {"queued", "running", "ready", "failed", "expired"}


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_export_queued_returns_export_id(client: TestClient) -> None:
    """POST /export returns export_id and status=queued in the immediate response."""
    db: Session = SessionLocal()
    try:
        attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    r = client.post("/api/v1/privacy/export", headers=_mint(attrs))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "export_id" in body
    assert body["status"] == "queued"
    assert len(body["export_id"]) == 36  # UUID


def test_export_demo_token_rejected(client: TestClient) -> None:
    """Demo tokens must NOT access the privacy endpoint (current_user requires real JWT)."""
    r = client.post(
        "/api/v1/privacy/export",
        headers={"Authorization": "Bearer clinician-demo-token"},
    )
    assert r.status_code == 401


def test_export_no_auth_rejected(client: TestClient) -> None:
    """Missing Authorization header must be rejected."""
    r = client.post("/api/v1/privacy/export")
    assert r.status_code == 401


def test_list_exports_empty(client: TestClient) -> None:
    """GET /exports returns empty list when no exports exist."""
    db: Session = SessionLocal()
    try:
        attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    r = client.get("/api/v1/privacy/exports", headers=_mint(attrs))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert body["items"] == []


def test_list_exports_after_create(client: TestClient) -> None:
    """GET /exports returns the export row after POST /export.

    TestClient runs background tasks synchronously so status may advance
    from 'queued' to 'ready' by the time the GET is made.
    """
    db: Session = SessionLocal()
    try:
        attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    hdrs = _mint(attrs)
    client.post("/api/v1/privacy/export", headers=hdrs)

    r = client.get("/api/v1/privacy/exports", headers=hdrs)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["status"] in _VALID_STATUSES


def test_get_export_by_id(client: TestClient) -> None:
    """GET /exports/{id} returns the export row for its owner."""
    db: Session = SessionLocal()
    try:
        attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    hdrs = _mint(attrs)
    create_r = client.post("/api/v1/privacy/export", headers=hdrs)
    export_id = create_r.json()["export_id"]

    r = client.get(f"/api/v1/privacy/exports/{export_id}", headers=hdrs)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == export_id
    assert body["status"] in _VALID_STATUSES


def test_get_export_404_for_wrong_user(client: TestClient) -> None:
    """GET /exports/{id} returns 404 when called by a different user (IDOR guard)."""
    db: Session = SessionLocal()
    try:
        owner_attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
        other_attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    create_r = client.post("/api/v1/privacy/export", headers=_mint(owner_attrs))
    export_id = create_r.json()["export_id"]

    r = client.get(f"/api/v1/privacy/exports/{export_id}", headers=_mint(other_attrs))
    assert r.status_code == 404


def test_get_export_404_unknown_id(client: TestClient) -> None:
    """GET /exports/{id} returns 404 for a completely unknown ID."""
    db: Session = SessionLocal()
    try:
        attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    r = client.get("/api/v1/privacy/exports/nonexistent-id-000", headers=_mint(attrs))
    assert r.status_code == 404


def test_delete_export(client: TestClient) -> None:
    """DELETE /exports/{id} removes the row and subsequent GET returns 404."""
    db: Session = SessionLocal()
    try:
        attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    hdrs = _mint(attrs)
    create_r = client.post("/api/v1/privacy/export", headers=hdrs)
    export_id = create_r.json()["export_id"]

    del_r = client.delete(f"/api/v1/privacy/exports/{export_id}", headers=hdrs)
    assert del_r.status_code == 200, del_r.text
    assert del_r.json()["deleted"] is True

    # Verify row is gone
    r2 = client.get(f"/api/v1/privacy/exports/{export_id}", headers=hdrs)
    assert r2.status_code == 404


def test_delete_export_404_wrong_user(client: TestClient) -> None:
    """DELETE /exports/{id} returns 404 when called by a different user."""
    db: Session = SessionLocal()
    try:
        owner_attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
        other_attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    create_r = client.post("/api/v1/privacy/export", headers=_mint(owner_attrs))
    export_id = create_r.json()["export_id"]

    r = client.delete(f"/api/v1/privacy/exports/{export_id}", headers=_mint(other_attrs))
    assert r.status_code == 404


def test_export_persisted_in_db(client: TestClient) -> None:
    """POST /export writes a DataExport row to the DB."""
    from app.persistence.models import DataExport

    db: Session = SessionLocal()
    try:
        attrs = _seed_user_attrs(db, clinic_id="clinic-demo-default")
    finally:
        db.close()

    r = client.post("/api/v1/privacy/export", headers=_mint(attrs))
    export_id = r.json()["export_id"]

    db2: Session = SessionLocal()
    try:
        row = db2.get(DataExport, export_id)
        assert row is not None
        assert row.user_id == attrs["id"]
        assert row.status in _VALID_STATUSES
    finally:
        db2.close()
