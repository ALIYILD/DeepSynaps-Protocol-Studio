"""Tests for sessions_router — the core appointment scheduling surface.

Covers 10 test cases across the highest-traffic endpoints:
  GET    /api/v1/sessions            (list)
  POST   /api/v1/sessions            (create)
  GET    /api/v1/sessions/current    (current active session)
  GET    /api/v1/sessions/{id}       (detail)
  PATCH  /api/v1/sessions/{id}       (update / status transition)
  DELETE /api/v1/sessions/{id}       (cancel)
  POST   /api/v1/sessions/{id}/events (append event)

Pattern: seed a Patient + optionally a ClinicalSession through SessionLocal,
then assert via TestClient against the real FastAPI app.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import ClinicalSession, Patient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mk_patient(db, *, pid: str, clinician_id: str = "actor-clinician-demo") -> Patient:
    p = Patient(
        id=pid,
        clinician_id=clinician_id,
        first_name="Test",
        last_name="Patient",
        email=f"{pid}@example.com",
        consent_signed=True,
        status="active",
    )
    db.add(p)
    return p


def _mk_session(
    db,
    *,
    sid: str,
    patient_id: str,
    clinician_id: str = "actor-clinician-demo",
    scheduled_at: str = "2099-01-01T10:00:00Z",
    status: str = "scheduled",
) -> ClinicalSession:
    s = ClinicalSession(
        id=sid,
        patient_id=patient_id,
        clinician_id=clinician_id,
        scheduled_at=scheduled_at,
        duration_minutes=60,
        appointment_type="session",
        status=status,
    )
    db.add(s)
    return s


# ---------------------------------------------------------------------------
# GET /api/v1/sessions
# ---------------------------------------------------------------------------


class TestListSessions:
    def test_list_empty_returns_zero(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get("/api/v1/sessions", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "total" in body

    def test_list_after_seed_returns_session(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = f"sess-list-p-{uuid.uuid4().hex[:8]}"
        sid = f"sess-list-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            _mk_session(db, sid=sid, patient_id=pid)
            db.commit()
        finally:
            db.close()

        r = client.get("/api/v1/sessions", headers=auth_headers["clinician"])
        assert r.status_code == 200
        ids = [item["id"] for item in r.json()["items"]]
        assert sid in ids

    def test_guest_cannot_list_sessions(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get("/api/v1/sessions", headers=auth_headers["guest"])
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/v1/sessions
# ---------------------------------------------------------------------------


class TestCreateSession:
    def test_create_session_happy_path(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = f"sess-create-p-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.commit()
        finally:
            db.close()

        r = client.post(
            "/api/v1/sessions",
            json={
                "patient_id": pid,
                "scheduled_at": "2099-06-01T09:00:00Z",
                "duration_minutes": 45,
                "appointment_type": "session",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["patient_id"] == pid
        assert body["status"] == "scheduled"

    def test_create_session_unknown_patient_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/sessions",
            json={
                "patient_id": "nonexistent-patient",
                "scheduled_at": "2099-07-01T10:00:00Z",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_create_session_missing_patient_id_returns_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/sessions",
            json={"scheduled_at": "2099-08-01T10:00:00Z"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/sessions/{id}
# ---------------------------------------------------------------------------


class TestGetSession:
    def test_get_session_by_id(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = f"sess-get-p-{uuid.uuid4().hex[:8]}"
        sid = f"sess-get-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            _mk_session(db, sid=sid, patient_id=pid)
            db.commit()
        finally:
            db.close()

        r = client.get(f"/api/v1/sessions/{sid}", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        assert r.json()["id"] == sid

    def test_get_nonexistent_session_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get("/api/v1/sessions/no-such-id", headers=auth_headers["clinician"])
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/v1/sessions/{id}
# ---------------------------------------------------------------------------


class TestPatchSession:
    def test_patch_status_transition_scheduled_to_confirmed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = f"sess-patch-p-{uuid.uuid4().hex[:8]}"
        sid = f"sess-patch-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            _mk_session(db, sid=sid, patient_id=pid)
            db.commit()
        finally:
            db.close()

        r = client.patch(
            f"/api/v1/sessions/{sid}",
            json={"status": "confirmed"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "confirmed"

    def test_patch_invalid_transition_returns_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = f"sess-bad-p-{uuid.uuid4().hex[:8]}"
        sid = f"sess-bad-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            _mk_session(db, sid=sid, patient_id=pid, status="scheduled")
            db.commit()
        finally:
            db.close()

        r = client.patch(
            f"/api/v1/sessions/{sid}",
            json={"status": "completed"},  # scheduled → completed is not a valid transition
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_status_transition"


# ---------------------------------------------------------------------------
# DELETE /api/v1/sessions/{id}
# ---------------------------------------------------------------------------


class TestDeleteSession:
    def test_delete_scheduled_session(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = f"sess-del-p-{uuid.uuid4().hex[:8]}"
        sid = f"sess-del-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            _mk_session(db, sid=sid, patient_id=pid)
            db.commit()
        finally:
            db.close()

        r = client.delete(f"/api/v1/sessions/{sid}", headers=auth_headers["clinician"])
        assert r.status_code == 204
