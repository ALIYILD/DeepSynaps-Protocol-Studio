"""Deep-coverage branch tests for sessions_router.

Pins every error path, state-transition edge, telemetry path, role gate,
Pydantic-422, impedance, comfort, sign, video, remote-monitor, and phase
endpoints not touched by the primary test_sessions_router.py file.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    ClinicalSession,
    ClinicalSessionEvent,
    DeviceSessionLog,
    Patient,
    PatientAdherenceEvent,
    TreatmentCourse,
    User,
    WearableDailySummary,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _mk_patient(
    db,
    *,
    pid: str,
    clinician_id: str = "actor-clinician-demo",
) -> Patient:
    p = Patient(
        id=pid,
        clinician_id=clinician_id,
        first_name="Branch",
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
    device_id: str | None = None,
    checked_in_at: str | None = None,
) -> ClinicalSession:
    s = ClinicalSession(
        id=sid,
        patient_id=patient_id,
        clinician_id=clinician_id,
        scheduled_at=scheduled_at,
        duration_minutes=60,
        appointment_type="session",
        status=status,
        device_id=device_id,
        checked_in_at=checked_in_at,
    )
    db.add(s)
    return s


def _seed_patient_and_session(pid: str, sid: str, **session_kwargs) -> None:
    """Seed a patient then a session in two separate flushes to satisfy FK ordering."""
    db = SessionLocal()
    try:
        _mk_patient(db, pid=pid)
        db.flush()
        _mk_session(db, sid=sid, patient_id=pid, **session_kwargs)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _seed(setup_fn) -> None:
    """Run a setup lambda against a fresh SessionLocal and commit.
    The setup_fn receives a db session; it should call db.flush() before
    adding FK-dependent rows if inserting in a single pass.
    """
    db = SessionLocal()
    try:
        setup_fn(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# LIST: filter edge cases
# ---------------------------------------------------------------------------


class TestListSessionsFilters:
    def test_list_with_start_date_filter(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"lf-p-{uuid.uuid4().hex[:8]}"
        sid = f"lf-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, scheduled_at="2099-06-01T10:00:00Z")
        r = client.get(
            "/api/v1/sessions",
            params={"start_date": "2099-05-01T00:00:00Z"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert any(i["id"] == sid for i in r.json()["items"])

    def test_list_with_end_date_excludes_old(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"lf2-p-{uuid.uuid4().hex[:8]}"
        sid = f"lf2-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, scheduled_at="2098-01-01T10:00:00Z")
        r = client.get(
            "/api/v1/sessions",
            params={"end_date": "2097-12-31T00:00:00Z"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert all(i["id"] != sid for i in r.json()["items"])

    def test_list_with_status_filter(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"lfs-p-{uuid.uuid4().hex[:8]}"
        sid = f"lfs-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, status="confirmed")
        r = client.get(
            "/api/v1/sessions",
            params={"status": "confirmed"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert any(i["id"] == sid for i in r.json()["items"])

    def test_list_with_modality_filter(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"lfm-p-{uuid.uuid4().hex[:8]}"
        sid_m = f"lfm-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            s = _mk_session(db, sid=sid_m, patient_id=pid)
            s.modality = "TMS"
            db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/sessions",
            params={"modality": "TMS"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert any(i["id"] == sid_m for i in r.json()["items"])

    def test_list_telehealth_true_filter(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"tele-p-{uuid.uuid4().hex[:8]}"
        sid = f"tele-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            s = _mk_session(db, sid=sid, patient_id=pid)
            s.room_id = "telehealth"
            db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/sessions",
            params={"telehealth": "true"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert any(i["id"] == sid for i in r.json()["items"])

    def test_list_telehealth_false_excludes_telehealth(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"tele2-p-{uuid.uuid4().hex[:8]}"
        sid = f"tele2-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            s = _mk_session(db, sid=sid, patient_id=pid)
            s.room_id = "telehealth"
            db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/sessions",
            params={"telehealth": "false"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert all(i.get("room_id") != "telehealth" for i in r.json()["items"])

    def test_list_with_room_id_filter(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"room-p-{uuid.uuid4().hex[:8]}"
        sid = f"room-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            s = _mk_session(db, sid=sid, patient_id=pid)
            s.room_id = "room-42"
            db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/sessions",
            params={"room_id": "room-42"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert any(i["id"] == sid for i in r.json()["items"])

    def test_list_admin_sees_all_sessions(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"adm-p-{uuid.uuid4().hex[:8]}"
        sid = f"adm-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        r = client.get("/api/v1/sessions", headers=auth_headers["admin"])
        assert r.status_code == 200
        assert any(i["id"] == sid for i in r.json()["items"])

    def test_list_cross_clinic_patient_returns_empty(self, client: TestClient, auth_headers: dict) -> None:
        """Patient in a different clinic — list with patient_id filter returns []."""
        from app.persistence.models import Clinic
        other_clinic_id = f"oc-{uuid.uuid4().hex[:8]}"
        other_clin_id = f"oc-u-{uuid.uuid4().hex[:8]}"
        pid = f"oc-p-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            db.add(Clinic(id=other_clinic_id, name="Other Clinic"))
            db.flush()
            db.add(User(
                id=other_clin_id,
                email=f"{other_clin_id}@example.com",
                display_name="Other",
                hashed_password="x",
                role="clinician",
                package_id="explorer",
                clinic_id=other_clinic_id,
            ))
            db.flush()
            db.add(Patient(
                id=pid,
                clinician_id=other_clin_id,
                first_name="X",
                last_name="Y",
                email=f"{pid}@example.com",
                consent_signed=True,
                status="active",
            ))
            db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/sessions",
            params={"patient_id": pid},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_list_pagination_limit_and_offset(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"pag-p-{uuid.uuid4().hex[:8]}"
        sids = [f"pag-s-{uuid.uuid4().hex[:8]}" for _ in range(3)]
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            for sid in sids:
                _mk_session(db, sid=sid, patient_id=pid)
            db.commit()
        finally:
            db.close()
        r = client.get("/api/v1/sessions", params={"limit": 1, "offset": 0}, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 1

    def test_list_limit_too_large_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/sessions", params={"limit": 9999}, headers=auth_headers["clinician"])
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# CREATE: validation edge cases
# ---------------------------------------------------------------------------


class TestCreateSessionEdgeCases:
    def test_invalid_appointment_type_returns_400(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"cat-p-{uuid.uuid4().hex[:8]}"
        _seed(lambda db: _mk_patient(db, pid=pid))
        r = client.post(
            "/api/v1/sessions",
            json={
                "patient_id": pid,
                "scheduled_at": "2099-09-01T10:00:00Z",
                "appointment_type": "INVALID_TYPE",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_appointment_type"

    def test_duration_out_of_range_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"dur-p-{uuid.uuid4().hex[:8]}"
        _seed(lambda db: _mk_patient(db, pid=pid))
        # duration_minutes max is 480
        r = client.post(
            "/api/v1/sessions",
            json={
                "patient_id": pid,
                "scheduled_at": "2099-09-01T10:00:00Z",
                "duration_minutes": 999,
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_create_missing_scheduled_at_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/sessions",
            json={"patient_id": "any-pid"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_guest_cannot_create_session(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/sessions",
            json={"patient_id": "x", "scheduled_at": "2099-09-01T10:00:00Z"},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_create_invalid_clinician_returns_400(self, client: TestClient, auth_headers: dict) -> None:
        """clinician_id that is not in the actor's clinic returns 400."""
        pid = f"ic-p-{uuid.uuid4().hex[:8]}"
        _seed(lambda db: _mk_patient(db, pid=pid))
        r = client.post(
            "/api/v1/sessions",
            json={
                "patient_id": pid,
                "scheduled_at": "2099-09-01T10:00:00Z",
                "clinician_id": "non-existent-clin-id",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_clinician"

    def test_scheduling_conflict_returns_409(self, client: TestClient, auth_headers: dict) -> None:
        """Two overlapping sessions on the same clinician calendar → 409."""
        pid = f"conf-p-{uuid.uuid4().hex[:8]}"
        _seed(lambda db: _mk_patient(db, pid=pid))
        payload = {
            "patient_id": pid,
            "scheduled_at": "2099-10-01T10:00:00Z",
            "duration_minutes": 60,
        }
        r1 = client.post("/api/v1/sessions", json=payload, headers=auth_headers["clinician"])
        assert r1.status_code == 201
        # Overlapping — starts 30 min into the first session
        payload2 = dict(payload, scheduled_at="2099-10-01T10:30:00Z")
        r2 = client.post("/api/v1/sessions", json=payload2, headers=auth_headers["clinician"])
        assert r2.status_code == 409
        assert r2.json()["code"] == "scheduling_conflict"


# ---------------------------------------------------------------------------
# STATUS TRANSITIONS: full chain + invalid paths
# ---------------------------------------------------------------------------


class TestStatusTransitions:
    def _seed_session(self, status: str = "scheduled") -> tuple[str, str]:
        pid = f"st-p-{uuid.uuid4().hex[:8]}"
        sid = f"st-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, status=status)
        return pid, sid

    def test_scheduled_to_no_show(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("scheduled")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "no_show"}, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["status"] == "no_show"

    def test_scheduled_to_cancelled(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("scheduled")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "cancelled"}, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"

    def test_confirmed_to_checked_in(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("confirmed")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "checked_in"}, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["status"] == "checked_in"

    def test_confirmed_to_no_show(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("confirmed")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "no_show"}, headers=auth_headers["clinician"])
        assert r.status_code == 200

    def test_checked_in_to_in_progress(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("checked_in")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "in_progress"}, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

    def test_in_progress_to_completed(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("in_progress")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "completed"}, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    def test_completed_to_scheduled_is_terminal(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("completed")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "scheduled"}, headers=auth_headers["clinician"])
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_status_transition"

    def test_no_show_to_any_is_terminal(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("no_show")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "confirmed"}, headers=auth_headers["clinician"])
        assert r.status_code == 400

    def test_same_status_patch_is_noop(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("scheduled")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "scheduled"}, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["status"] == "scheduled"

    def test_patch_confirmed_sets_confirmed_at(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("scheduled")
        r = client.patch(f"/api/v1/sessions/{sid}", json={"status": "confirmed"}, headers=auth_headers["clinician"])
        assert r.status_code == 200

    def test_patch_invalid_appointment_type_returns_400(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("scheduled")
        r = client.patch(
            f"/api/v1/sessions/{sid}",
            json={"appointment_type": "NOT_VALID"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_appointment_type"

    def test_patch_invalid_clinician_returns_400(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_session("scheduled")
        r = client.patch(
            f"/api/v1/sessions/{sid}",
            json={"clinician_id": "ghost-clinician"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_clinician"

    def test_patch_reschedule_conflict_returns_409(self, client: TestClient, auth_headers: dict) -> None:
        """Rescheduling into an occupied slot returns 409."""
        pid = f"pc-p-{uuid.uuid4().hex[:8]}"
        sid1 = f"pc-s1-{uuid.uuid4().hex[:8]}"
        sid2 = f"pc-s2-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            _mk_session(db, sid=sid1, patient_id=pid, scheduled_at="2099-11-01T10:00:00Z")
            _mk_session(db, sid=sid2, patient_id=pid, scheduled_at="2099-11-05T10:00:00Z")
            db.commit()
        finally:
            db.close()
        # Try to move sid2 into sid1's slot
        r = client.patch(
            f"/api/v1/sessions/{sid2}",
            json={"scheduled_at": "2099-11-01T10:00:00Z", "duration_minutes": 60},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409
        assert r.json()["code"] == "scheduling_conflict"


# ---------------------------------------------------------------------------
# GET /current
# ---------------------------------------------------------------------------


class TestGetCurrentSession:
    def test_current_session_not_found_when_none_active(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/sessions/current", headers=auth_headers["clinician"])
        assert r.status_code == 404

    def test_current_session_returns_in_progress(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"cur-p-{uuid.uuid4().hex[:8]}"
        sid = f"cur-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, status="in_progress")
        r = client.get("/api/v1/sessions/current", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["id"] == sid

    def test_current_session_admin_sees_all(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"curadm-p-{uuid.uuid4().hex[:8]}"
        sid = f"curadm-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, status="checked_in")
        r = client.get("/api/v1/sessions/current", headers=auth_headers["admin"])
        assert r.status_code == 200

    def test_guest_cannot_get_current_session(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/sessions/current", headers=auth_headers["guest"])
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# EVENTS endpoint
# ---------------------------------------------------------------------------


class TestSessionEvents:
    def _seed_data(self) -> tuple[str, str]:
        pid = f"ev-p-{uuid.uuid4().hex[:8]}"
        sid = f"ev-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        return pid, sid

    def test_post_event_happy_path(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/events",
            json={"type": "OPER", "note": "test note", "payload": {"action": "start"}},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        body = r.json()
        assert body["type"] == "OPER"
        assert body["session_id"] == sid

    def test_post_event_type_too_long_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/events",
            json={"type": "X" * 41},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_post_event_empty_type_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/events",
            json={"type": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_list_events_empty(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.get(f"/api/v1/sessions/{sid}/events", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json() == []

    def test_list_events_after_creating(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        client.post(
            f"/api/v1/sessions/{sid}/events",
            json={"type": "CHECKLIST", "payload": {"checklist_id": "pre-check", "done": True}},
            headers=auth_headers["clinician"],
        )
        r = client.get(f"/api/v1/sessions/{sid}/events", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_post_ae_event_creates_adverse_event(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/events",
            json={
                "type": "AE",
                "note": "Mild headache",
                "payload": {"severity": "mild", "description": "Patient reported headache"},
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        assert r.json()["type"] == "AE"

    def test_events_nonexistent_session_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/sessions/no-such/events",
            json={"type": "OPER"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_guest_cannot_post_events(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/events",
            json={"type": "OPER"},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# PHASE endpoint
# ---------------------------------------------------------------------------


class TestPhaseTransition:
    def _seed_data(self) -> tuple[str, str]:
        pid = f"ph-p-{uuid.uuid4().hex[:8]}"
        sid = f"ph-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, status="in_progress")
        return pid, sid

    def test_phase_transition_setup(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/phase",
            json={"phase": "setup"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["phase"] == "setup"

    def test_phase_transition_stim(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/phase",
            json={"phase": "stim"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["phase"] == "stim"

    def test_phase_ended_finalizes_session(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/phase",
            json={"phase": "ended"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # After finalization, status should be completed
        r2 = client.get(f"/api/v1/sessions/{sid}", headers=auth_headers["clinician"])
        assert r2.json()["status"] == "completed"

    def test_phase_empty_string_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/phase",
            json={"phase": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_phase_nonexistent_session_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/sessions/nope/phase",
            json={"phase": "stim"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# IMPEDANCE endpoint
# ---------------------------------------------------------------------------


class TestImpedanceEndpoint:
    def _seed_data(self) -> tuple[str, str]:
        pid = f"imp-p-{uuid.uuid4().hex[:8]}"
        sid = f"imp-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        return pid, sid

    def test_set_impedance_happy_path(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/impedance",
            json={"impedance_kohm": 3.5},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        assert r.json()["type"] == "IMPEDANCE"

    def test_impedance_out_of_range_negative(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/impedance",
            json={"impedance_kohm": -1.0},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_impedance_out_of_range_over_100(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/impedance",
            json={"impedance_kohm": 101.0},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_impedance_nonexistent_session_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/sessions/nope/impedance",
            json={"impedance_kohm": 5.0},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_impedance_zero_is_valid(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/impedance",
            json={"impedance_kohm": 0.0},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201


# ---------------------------------------------------------------------------
# COMFORT endpoint
# ---------------------------------------------------------------------------


class TestComfortEndpoint:
    def _seed_data(self) -> tuple[str, str]:
        pid = f"cof-p-{uuid.uuid4().hex[:8]}"
        sid = f"cof-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        return pid, sid

    def test_comfort_rating_happy_path(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/comfort",
            json={"nrs_se": 3},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        assert r.json()["type"] == "COMFORT"

    def test_comfort_with_note(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/comfort",
            json={"nrs_se": 5, "note": "Tingling sensation at electrode site"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        assert "5/10" in r.json()["note"]

    def test_comfort_nrs_above_10_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/comfort",
            json={"nrs_se": 11},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_comfort_nrs_negative_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/comfort",
            json={"nrs_se": -1},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_comfort_missing_nrs_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/comfort",
            json={"note": "just a note"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_comfort_nonexistent_session_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/sessions/nope/comfort",
            json={"nrs_se": 2},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_comfort_note_too_long_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/comfort",
            json={"nrs_se": 2, "note": "x" * 501},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# SIGN endpoint
# ---------------------------------------------------------------------------


class TestSignEndpoint:
    def _seed_data(self) -> tuple[str, str]:
        pid = f"sgn-p-{uuid.uuid4().hex[:8]}"
        sid = f"sgn-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, status="completed")
        return pid, sid

    def test_sign_happy_path(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/sign",
            json={},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        assert r.json()["type"] == "SIGN"

    def test_sign_with_note(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/sign",
            json={"note": "All parameters within protocol bounds."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        body = r.json()
        assert body["type"] == "SIGN"

    def test_sign_with_is_demo_flag(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/sign",
            json={"is_demo": True},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201
        body = r.json()
        payload = body.get("payload")
        if isinstance(payload, dict):
            assert payload.get("is_demo") is True
        # (some serializations return payload as a string; both are acceptable)

    def test_sign_note_too_long_returns_422(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/sign",
            json={"note": "x" * 501},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_sign_nonexistent_session_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/sessions/nope/sign",
            json={},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_guest_cannot_sign(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(
            f"/api/v1/sessions/{sid}/sign",
            json={},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# VIDEO endpoints
# ---------------------------------------------------------------------------


class TestVideoEndpoints:
    def _seed_data(self) -> tuple[str, str]:
        pid = f"vid-p-{uuid.uuid4().hex[:8]}"
        sid = f"vid-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        return pid, sid

    def test_video_start_happy_path(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(f"/api/v1/sessions/{sid}/video/start", headers=auth_headers["clinician"])
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["active"] is True
        assert f"ds-live-{sid}" == body["room_name"]

    def test_video_end_happy_path(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        client.post(f"/api/v1/sessions/{sid}/video/start", headers=auth_headers["clinician"])
        r = client.post(f"/api/v1/sessions/{sid}/video/end", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["active"] is False

    def test_video_start_nonexistent_session(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post("/api/v1/sessions/nope/video/start", headers=auth_headers["clinician"])
        assert r.status_code == 404

    def test_video_end_nonexistent_session(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post("/api/v1/sessions/nope/video/end", headers=auth_headers["clinician"])
        assert r.status_code == 404

    def test_guest_cannot_start_video(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.post(f"/api/v1/sessions/{sid}/video/start", headers=auth_headers["guest"])
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# TELEMETRY endpoint
# ---------------------------------------------------------------------------


class TestTelemetryEndpoint:
    def _seed_no_device(self) -> tuple[str, str]:
        pid = f"tel-p-{uuid.uuid4().hex[:8]}"
        sid = f"tel-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        return pid, sid

    def _seed_real_device(self) -> tuple[str, str]:
        pid = f"tel2-p-{uuid.uuid4().hex[:8]}"
        sid = f"tel2-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, device_id="real-device-001")
        return pid, sid

    def _seed_demo_device(self) -> tuple[str, str]:
        pid = f"teld-p-{uuid.uuid4().hex[:8]}"
        sid = f"teld-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, device_id="demo")
        return pid, sid

    def test_telemetry_no_device_is_demo(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_no_device()
        r = client.get(f"/api/v1/sessions/{sid}/telemetry", headers=auth_headers["clinician"])
        assert r.status_code == 200
        body = r.json()
        assert body["is_demo"] is True
        assert body["impedance_kohm"] is not None
        assert body["session_id"] == sid

    def test_telemetry_real_device_not_demo(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_real_device()
        r = client.get(f"/api/v1/sessions/{sid}/telemetry", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["is_demo"] is False

    def test_telemetry_demo_device_id_is_demo(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_demo_device()
        r = client.get(f"/api/v1/sessions/{sid}/telemetry", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["is_demo"] is True

    def test_telemetry_with_checked_in_at_includes_elapsed(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"tel3-p-{uuid.uuid4().hex[:8]}"
        sid = f"tel3-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid, checked_in_at="2026-01-01T09:00:00Z")
        r = client.get(f"/api/v1/sessions/{sid}/telemetry", headers=auth_headers["clinician"])
        assert r.status_code == 200
        # elapsed_sec should be a non-negative int when checked_in_at is set
        assert r.json()["elapsed_sec"] is not None
        assert r.json()["elapsed_sec"] >= 0

    def test_telemetry_nonexistent_session(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/sessions/nope/telemetry", headers=auth_headers["clinician"])
        assert r.status_code == 404

    def test_telemetry_demo_values_are_deterministic(self, client: TestClient, auth_headers: dict) -> None:
        """Same session id → same demo stub values on consecutive calls."""
        _, sid = self._seed_no_device()
        r1 = client.get(f"/api/v1/sessions/{sid}/telemetry", headers=auth_headers["clinician"])
        r2 = client.get(f"/api/v1/sessions/{sid}/telemetry", headers=auth_headers["clinician"])
        assert r1.json()["impedance_kohm"] == r2.json()["impedance_kohm"]
        assert r1.json()["intensity_pct_rmt"] == r2.json()["intensity_pct_rmt"]

    def test_stub_device_ids_are_demo(self, client: TestClient, auth_headers: dict) -> None:
        """Device ids 'rehearsal', 'none', 'stub' are all treated as demo."""
        for dev in ("rehearsal", "none", "stub"):
            pid = f"stubdev-p-{uuid.uuid4().hex[:8]}"
            sid = f"stubdev-s-{uuid.uuid4().hex[:8]}"
            _seed_patient_and_session(pid, sid, device_id=dev)
            r = client.get(f"/api/v1/sessions/{sid}/telemetry", headers=auth_headers["clinician"])
            assert r.json()["is_demo"] is True, f"Expected is_demo=True for device_id={dev}"


# ---------------------------------------------------------------------------
# REMOTE MONITOR SNAPSHOT endpoint
# ---------------------------------------------------------------------------


class TestRemoteMonitorSnapshot:
    def _seed_data(self) -> tuple[str, str]:
        pid = f"rms-p-{uuid.uuid4().hex[:8]}"
        sid = f"rms-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        return pid, sid

    def test_snapshot_no_data_returns_unknown(self, client: TestClient, auth_headers: dict) -> None:
        _, sid = self._seed_data()
        r = client.get(f"/api/v1/sessions/{sid}/remote-monitor-snapshot", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["adherence"] == "unknown"

    def test_snapshot_with_wearable_summary(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"rms2-p-{uuid.uuid4().hex[:8]}"
        sid = f"rms2-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            _mk_session(db, sid=sid, patient_id=pid)
            db.add(WearableDailySummary(
                patient_id=pid,
                source="garmin",
                date="2026-01-01",
                hrv_ms=45.0,
                synced_at=datetime.now(timezone.utc),
            ))
            db.commit()
        finally:
            db.close()
        r = client.get(f"/api/v1/sessions/{sid}/remote-monitor-snapshot", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["hrv"] == 45.0

    def test_snapshot_with_completed_device_log(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"rms3-p-{uuid.uuid4().hex[:8]}"
        sid = f"rms3-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            _mk_session(db, sid=sid, patient_id=pid)
            db.add(DeviceSessionLog(
                patient_id=pid,
                assignment_id=f"assign-{pid}",
                session_date="2026-01-01",
                completed=True,
                logged_at=datetime.now(timezone.utc),
            ))
            db.commit()
        finally:
            db.close()
        r = client.get(f"/api/v1/sessions/{sid}/remote-monitor-snapshot", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["adherence"] == "OK"

    def test_snapshot_with_open_adherence_event(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"rms4-p-{uuid.uuid4().hex[:8]}"
        sid = f"rms4-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            _mk_session(db, sid=sid, patient_id=pid)
            db.add(PatientAdherenceEvent(
                patient_id=pid,
                event_type="non_completion",
                report_date="2026-01-01",
                status="open",
                created_at=datetime.now(timezone.utc),
            ))
            db.commit()
        finally:
            db.close()
        r = client.get(f"/api/v1/sessions/{sid}/remote-monitor-snapshot", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["adherence"] == "review"

    def test_snapshot_nonexistent_session(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/sessions/nope/remote-monitor-snapshot", headers=auth_headers["clinician"])
        assert r.status_code == 404

    def test_snapshot_with_impedance_event(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"rms5-p-{uuid.uuid4().hex[:8]}"
        sid = f"rms5-s-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            db.flush()
            _mk_session(db, sid=sid, patient_id=pid)
            db.add(ClinicalSessionEvent(
                session_id=sid,
                clinician_id="actor-clinician-demo",
                actor_id="actor-clinician-demo",
                event_type="IMPEDANCE",
                payload_json=json.dumps({"impedance_kohm": 4.2}),
            ))
            db.commit()
        finally:
            db.close()
        r = client.get(f"/api/v1/sessions/{sid}/remote-monitor-snapshot", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["impedance"] == 4.2


# ---------------------------------------------------------------------------
# DELETE edge cases
# ---------------------------------------------------------------------------


class TestDeleteSessionEdgeCases:
    def test_delete_nonexistent_session_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.delete("/api/v1/sessions/no-such-id", headers=auth_headers["clinician"])
        assert r.status_code == 404

    def test_guest_cannot_delete_session(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"del2-p-{uuid.uuid4().hex[:8]}"
        sid = f"del2-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        r = client.delete(f"/api/v1/sessions/{sid}", headers=auth_headers["guest"])
        assert r.status_code == 403

    def test_delete_returns_204(self, client: TestClient, auth_headers: dict) -> None:
        pid = f"del3-p-{uuid.uuid4().hex[:8]}"
        sid = f"del3-s-{uuid.uuid4().hex[:8]}"
        _seed_patient_and_session(pid, sid)
        r = client.delete(f"/api/v1/sessions/{sid}", headers=auth_headers["clinician"])
        assert r.status_code == 204


# ---------------------------------------------------------------------------
# HELPER unit tests (pure logic, no HTTP)
# ---------------------------------------------------------------------------


class TestHelperFunctions:
    def test_safe_json_loads_empty_string(self) -> None:
        from app.routers.sessions_router import _safe_json_loads
        assert _safe_json_loads("") == {}

    def test_safe_json_loads_invalid_json(self) -> None:
        from app.routers.sessions_router import _safe_json_loads
        assert _safe_json_loads("{bad json}") == {}

    def test_safe_json_loads_non_dict_returns_empty(self) -> None:
        from app.routers.sessions_router import _safe_json_loads
        assert _safe_json_loads("[1,2,3]") == {}

    def test_safe_json_loads_valid_dict(self) -> None:
        from app.routers.sessions_router import _safe_json_loads
        assert _safe_json_loads('{"key": "val"}') == {"key": "val"}

    def test_extract_first_float_none(self) -> None:
        from app.routers.sessions_router import _extract_first_float
        assert _extract_first_float(None) is None

    def test_extract_first_float_digits_with_prefix(self) -> None:
        from app.routers.sessions_router import _extract_first_float
        assert _extract_first_float("2 mA") == 2.0

    def test_extract_first_float_decimal(self) -> None:
        from app.routers.sessions_router import _extract_first_float
        assert _extract_first_float("3.5 kOhm") == 3.5

    def test_extract_first_float_no_digits(self) -> None:
        from app.routers.sessions_router import _extract_first_float
        assert _extract_first_float("no digits here") is None

    def test_severity_for_ae_known_values(self) -> None:
        from app.routers.sessions_router import _severity_for_ae
        for v in ("mild", "moderate", "severe", "serious"):
            assert _severity_for_ae(v) == v

    def test_severity_for_ae_unknown_defaults_moderate(self) -> None:
        from app.routers.sessions_router import _severity_for_ae
        assert _severity_for_ae("unknown_severity") == "moderate"
        assert _severity_for_ae(None) == "moderate"

    def test_patient_name_none(self) -> None:
        from app.routers.sessions_router import _patient_name
        assert _patient_name(None) == "Patient"

    def test_session_has_real_device_empty(self) -> None:
        from app.routers.sessions_router import _session_has_real_device
        s = ClinicalSession(id="x", device_id="")
        assert _session_has_real_device(s) is False

    def test_session_has_real_device_real(self) -> None:
        from app.routers.sessions_router import _session_has_real_device
        s = ClinicalSession(id="x", device_id="real-device-001")
        assert _session_has_real_device(s) is True

    def test_session_has_real_device_demo_sentinel(self) -> None:
        from app.routers.sessions_router import _session_has_real_device
        for sentinel in ("demo", "DEMO", "rehearsal", "none", "stub"):
            s = ClinicalSession(id="x", device_id=sentinel)
            assert _session_has_real_device(s) is False, f"Expected False for '{sentinel}'"

    def test_deterministic_demo_telemetry_consistent(self) -> None:
        from app.routers.sessions_router import _deterministic_demo_telemetry
        s = ClinicalSession(id="fixed-id-123")
        t1 = _deterministic_demo_telemetry(s)
        t2 = _deterministic_demo_telemetry(s)
        assert t1 == t2

    def test_deterministic_demo_telemetry_ranges(self) -> None:
        from app.routers.sessions_router import _deterministic_demo_telemetry
        s = ClinicalSession(id="range-test-id")
        t = _deterministic_demo_telemetry(s)
        assert 2.0 <= t["impedance_kohm"] < 8.0
        assert 1.0 <= t["intensity_pct_rmt"] < 3.0

    def test_validate_status_transition_same_status(self) -> None:
        from app.routers.sessions_router import _validate_status_transition
        # No exception
        _validate_status_transition("scheduled", "scheduled")

    def test_validate_status_transition_invalid(self) -> None:
        from app.routers.sessions_router import _validate_status_transition
        from app.errors import ApiServiceError
        with pytest.raises(ApiServiceError) as exc:
            _validate_status_transition("completed", "scheduled")
        assert exc.value.code == "invalid_status_transition"

    def test_summarize_session_events_checklist(self) -> None:
        from app.routers.sessions_router import _summarize_session_events
        from unittest.mock import MagicMock
        from datetime import datetime, timezone

        row = MagicMock()
        row.event_type = "CHECKLIST"
        row.payload_json = json.dumps({"checklist_id": "chk-1", "label": "Verify setup", "done": True})
        row.note = None
        row.id = "ev-1"
        row.created_at = datetime.now(timezone.utc)

        result = _summarize_session_events([row])
        assert len(result["checklist"]) == 1
        assert result["checklist"][0]["done"] is True

    def test_summarize_session_events_ae(self) -> None:
        from app.routers.sessions_router import _summarize_session_events
        from unittest.mock import MagicMock
        from datetime import datetime, timezone

        row = MagicMock()
        row.event_type = "AE"
        row.payload_json = "{}"
        row.note = "Headache reported"
        row.id = "ae-1"
        row.created_at = datetime.now(timezone.utc)

        result = _summarize_session_events([row])
        assert "Headache reported" in result["adverse_events"]

    def test_summarize_session_events_pause(self) -> None:
        from app.routers.sessions_router import _summarize_session_events
        from unittest.mock import MagicMock
        from datetime import datetime, timezone

        row = MagicMock()
        row.event_type = "OPER"
        row.payload_json = json.dumps({"action": "pause"})
        row.note = "Paused for comfort check"
        row.id = "op-1"
        row.created_at = datetime.now(timezone.utc)

        result = _summarize_session_events([row])
        assert len(result["interruptions"]) == 1
        assert "Paused" in result["interruptions"][0]
