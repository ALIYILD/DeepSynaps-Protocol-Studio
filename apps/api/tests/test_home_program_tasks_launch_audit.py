"""Tests for the Patient Home Program Tasks (Homework) launch-audit (PR 2026-05-01).

Seventh patient-facing surface to receive the launch-audit treatment
after Symptom Journal (#344), Wellness Hub (#345), Patient Reports
(#346), Patient Messages (#347), Home Devices (#348), and Adherence
Events (#350). Closes the home-therapy regulator loop end-to-end:
clinician assigns home-program tasks → patient SEES tasks here →
patient LOGS completion via Adherence Events (#350) → side-effect with
severity >= 7 escalates to AE Hub (#342) → safety review in QA Hub
(#321).

Covers the patient-scope endpoints added in
``apps/api/app/routers/patient_home_program_tasks_router.py``:

* GET    /api/v1/home-program-tasks/patient/today
* GET    /api/v1/home-program-tasks/patient/upcoming
* GET    /api/v1/home-program-tasks/patient/completed
* GET    /api/v1/home-program-tasks/patient/summary
* GET    /api/v1/home-program-tasks/patient/{task_id}
* POST   /api/v1/home-program-tasks/patient/{task_id}/start
* POST   /api/v1/home-program-tasks/patient/{task_id}/help-request
* GET    /api/v1/home-program-tasks/patient/export.csv
* GET    /api/v1/home-program-tasks/patient/export.ndjson
* POST   /api/v1/home-program-tasks/patient/audit-events

Plus the cross-router contracts:

* ``home_program_tasks`` is whitelisted by ``audit_trail_router.KNOWN_SURFACES``.
* ``home_program_tasks`` is accepted by ``/api/v1/qeeg-analysis/audit-events``.
* Patient-side audit rows surface at
  ``/api/v1/audit-trail?surface=home_program_tasks``.
"""
from __future__ import annotations

import json
import uuid as _uuid
from datetime import date as _date, datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    ClinicianHomeProgramTask,
    ConsentRecord,
    Message,
    Patient,
    PatientHomeProgramTaskCompletion,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient_with_consent() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to via email."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-homework-demo",
            clinician_id="actor-clinician-demo",
            first_name="Jane",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
            notes=None,
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def demo_patient_consent_withdrawn() -> Patient:
    """Patient who signed and later withdrew consent."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-homework-withdrawn",
            clinician_id="actor-clinician-demo",
            first_name="Withdrawn",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
            notes=None,
        )
        db.add(patient)
        db.add(
            ConsentRecord(
                patient_id=patient.id,
                clinician_id="actor-clinician-demo",
                consent_type="participation",
                status="withdrawn",
            )
        )
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def other_patient() -> Patient:
    """A different patient — used as the cross-patient IDOR target."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-homework-other",
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            email="other-homework@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_task(
    *,
    patient_id: str,
    clinician_id: str = "actor-clinician-demo",
    title: str = "10 min walk + mood log",
    due_on: str | None = None,
    task_type: str = "walk",
    category: str = "activation",
    extra: dict | None = None,
    external_id: str | None = None,
) -> str:
    """Create a clinician_home_program_tasks row owned by ``patient_id``."""
    db = SessionLocal()
    try:
        task_payload = {
            "id": external_id or f"hp-{_uuid.uuid4().hex[:10]}",
            "patientId": patient_id,
            "title": title,
            "task_type": task_type,
            "category": category,
            "due_on": due_on or _dt.now(_tz.utc).date().isoformat(),
            "duration_min": 15,
            "instructions": "Walk for ten minutes. Log mood before and after.",
            "rationale": (
                "Behavioural activation reduces depressive avoidance. "
                "We track mood before/after to spot which activities help."
            ),
            "rationale_author": "Dr. Kolmar",
        }
        if extra:
            task_payload.update(extra)
        external = task_payload["id"]
        row = ClinicianHomeProgramTask(
            id=external,
            server_task_id=str(_uuid.uuid4()),
            patient_id=patient_id,
            clinician_id=clinician_id,
            task_json=json.dumps(task_payload),
            revision=1,
            created_at=_dt.now(_tz.utc),
            updated_at=_dt.now(_tz.utc),
        )
        db.add(row)
        db.commit()
        return external
    finally:
        db.close()


def _seed_completion(
    *,
    patient_id: str,
    server_task_id: str,
    clinician_id: str = "actor-clinician-demo",
    completed_at: _dt | None = None,
) -> str:
    db = SessionLocal()
    try:
        cid = str(_uuid.uuid4())
        c = PatientHomeProgramTaskCompletion(
            id=cid,
            server_task_id=server_task_id,
            patient_id=patient_id,
            clinician_id=clinician_id,
            completed=True,
            completed_at=completed_at or _dt.now(_tz.utc),
            rating=None,
            difficulty=None,
            feedback_text=None,
        )
        db.add(c)
        db.commit()
        return cid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_home_program_tasks_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "home_program_tasks" in KNOWN_SURFACES


def test_home_program_tasks_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "home_program_tasks surface whitelist sanity",
        "surface": "home_program_tasks",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("home_program_tasks-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_list_today(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        _seed_task(patient_id=demo_patient_with_consent.id)
        r = client.get(
            "/api/v1/home-program-tasks/patient/today",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        assert data["consent_active"] is True
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_clinician_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # The patient-scope /today listing must 404 for clinicians —
        # they use the existing /home-program-tasks (no /patient prefix)
        # router for the clinician queue.
        r = client.get(
            "/api/v1/home-program-tasks/patient/today",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_calling_patient_scope_endpoint_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/home-program-tasks/patient/today",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text


# ── Cross-patient isolation (IDOR) ──────────────────────────────────────────


class TestCrossPatientIsolation:
    def test_patient_cannot_view_another_patients_task(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        tid = _seed_task(patient_id=other_patient.id)
        r = client.get(
            f"/api/v1/home-program-tasks/patient/{tid}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_start_another_patients_task(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        tid = _seed_task(patient_id=other_patient.id)
        r = client.post(
            f"/api/v1/home-program-tasks/patient/{tid}/start",
            json={"note": "hijack attempt"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_patient_cannot_help_request_another_patients_task(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        tid = _seed_task(patient_id=other_patient.id)
        r = client.post(
            f"/api/v1/home-program-tasks/patient/{tid}/help-request",
            json={"reason": "stuck on this task"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404, r.text

    def test_today_excludes_other_patients_tasks(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        _seed_task(patient_id=other_patient.id, title="not-mine")
        r = client.get(
            "/api/v1/home-program-tasks/patient/today",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_audit_event_with_cross_patient_task_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
        other_patient: Patient,
    ) -> None:
        tid = _seed_task(patient_id=other_patient.id)
        r = client.post(
            "/api/v1/home-program-tasks/patient/audit-events",
            json={"event": "task_viewed", "task_id": tid},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 404


# ── Today / Upcoming / Completed lists ──────────────────────────────────────


class TestLists:
    def test_today_returns_only_due_today_uncompleted(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        today = _dt.now(_tz.utc).date().isoformat()
        tomorrow = (_dt.now(_tz.utc).date() + _td(days=1)).isoformat()
        # Today, uncompleted — should appear.
        _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="today-task",
            due_on=today,
            external_id="hp-today-1",
        )
        # Today but already completed — should NOT appear.
        completed_id = _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="today-done",
            due_on=today,
            external_id="hp-today-done",
        )
        # Look up server_task_id
        db = SessionLocal()
        try:
            row = db.query(ClinicianHomeProgramTask).filter_by(id=completed_id).first()
            assert row is not None
            server_id = row.server_task_id
        finally:
            db.close()
        _seed_completion(
            patient_id=demo_patient_with_consent.id, server_task_id=server_id
        )
        # Tomorrow — should NOT appear.
        _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="tomorrow-task",
            due_on=tomorrow,
            external_id="hp-tomorrow-1",
        )

        r = client.get(
            "/api/v1/home-program-tasks/patient/today",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "today-task"

    def test_upcoming_returns_next_7_days_excluding_today(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        today = _dt.now(_tz.utc).date()
        _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="today",
            due_on=today.isoformat(),
            external_id="hp-up-today",
        )
        _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="day3",
            due_on=(today + _td(days=3)).isoformat(),
            external_id="hp-up-d3",
        )
        _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="day7",
            due_on=(today + _td(days=7)).isoformat(),
            external_id="hp-up-d7",
        )
        # Beyond horizon.
        _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="day20",
            due_on=(today + _td(days=20)).isoformat(),
            external_id="hp-up-d20",
        )

        r = client.get(
            "/api/v1/home-program-tasks/patient/upcoming",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        data = r.json()
        # Excludes today (day 0). Includes day 3 and day 7.
        titles = sorted(t["title"] for t in data["items"])
        assert titles == ["day3", "day7"]

    def test_completed_returns_completion_history(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        external_id = _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="archived",
            external_id="hp-archived",
        )
        db = SessionLocal()
        try:
            row = db.query(ClinicianHomeProgramTask).filter_by(id=external_id).first()
            assert row is not None
            sid = row.server_task_id
        finally:
            db.close()
        _seed_completion(
            patient_id=demo_patient_with_consent.id, server_task_id=sid
        )
        r = client.get(
            "/api/v1/home-program-tasks/patient/completed",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "archived"
        assert data["items"][0]["completed"] is True


# ── Summary counts ──────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_today_due_overdue_and_rate(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        today = _dt.now(_tz.utc).date()
        yesterday = (today - _td(days=1)).isoformat()
        _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="due today",
            due_on=today.isoformat(),
            external_id="hp-sum-1",
        )
        # Overdue (yesterday, not completed).
        _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="overdue",
            due_on=yesterday,
            external_id="hp-sum-2",
        )
        # Completed yesterday → completed_7d / completion_rate_7d numerator.
        completed_external = _seed_task(
            patient_id=demo_patient_with_consent.id,
            title="done yesterday",
            due_on=yesterday,
            external_id="hp-sum-3",
        )
        db = SessionLocal()
        try:
            row = (
                db.query(ClinicianHomeProgramTask)
                .filter_by(id=completed_external)
                .first()
            )
            assert row is not None
            sid = row.server_task_id
        finally:
            db.close()
        _seed_completion(
            patient_id=demo_patient_with_consent.id,
            server_task_id=sid,
            completed_at=_dt.now(_tz.utc) - _td(days=1),
        )

        r = client.get(
            "/api/v1/home-program-tasks/patient/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["total_assigned"] >= 3
        assert s["due_today"] == 1
        assert s["overdue"] == 1
        assert s["completed_7d"] >= 1
        assert s["completion_rate_7d"] >= 1
        assert s["consent_active"] is True


# ── Start ───────────────────────────────────────────────────────────────────


class TestStart:
    def test_start_emits_audit_and_clinician_mirror(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = _seed_task(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-program-tasks/patient/{tid}/start",
            json={"note": "starting now"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["task_id"] == tid

        audit = client.get(
            "/api/v1/audit-trail?surface=home_program_tasks",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "home_program_tasks.task_started" in actions
        # Clinician-visible mirror so the care-team feed shows the start
        # without exposing PHI.
        mirror = next(
            (
                it
                for it in audit
                if it.get("action") == "home_program_tasks.task_started_to_clinician"
            ),
            None,
        )
        assert mirror is not None
        assert mirror.get("target_id") == "actor-clinician-demo"

    def test_start_blocked_when_consent_withdrawn(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        tid = _seed_task(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/home-program-tasks/patient/{tid}/start",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403


# ── Help-request ────────────────────────────────────────────────────────────


class TestHelpRequest:
    def test_help_request_creates_message_thread_keyed_to_task(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = _seed_task(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-program-tasks/patient/{tid}/help-request",
            json={"reason": "I cannot find the right electrode placement"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["thread_id"] == f"task-{tid}"
        assert body["is_urgent"] is False

        # Verify a Message row was created with the right thread_id and patient.
        db = SessionLocal()
        try:
            msg = db.query(Message).filter_by(thread_id=f"task-{tid}").first()
            assert msg is not None
            assert msg.patient_id == demo_patient_with_consent.id
            assert msg.recipient_id == "actor-clinician-demo"
            assert msg.category == "task-help"
        finally:
            db.close()

        audit = client.get(
            "/api/v1/audit-trail?surface=home_program_tasks",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "home_program_tasks.task_help_requested" in actions

    def test_urgent_help_request_emits_high_priority_clinician_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = _seed_task(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-program-tasks/patient/{tid}/help-request",
            json={
                "reason": "device sparks when I plug it in",
                "is_urgent": True,
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201
        assert r.json()["is_urgent"] is True

        audit = client.get(
            "/api/v1/audit-trail?surface=home_program_tasks",
            headers=auth_headers["admin"],
        ).json()["items"]
        mirror = next(
            (
                it
                for it in audit
                if it.get("action") == "home_program_tasks.task_help_urgent_to_clinician"
            ),
            None,
        )
        assert mirror is not None
        assert "priority=high" in (mirror.get("note") or "")
        assert mirror.get("target_id") == "actor-clinician-demo"

    def test_help_request_blank_reason_returns_422(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = _seed_task(patient_id=demo_patient_with_consent.id)
        r = client.post(
            f"/api/v1/home-program-tasks/patient/{tid}/help-request",
            json={"reason": "   "},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 422

    def test_help_request_blocked_when_consent_withdrawn(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_consent_withdrawn: Patient,
    ) -> None:
        tid = _seed_task(patient_id=demo_patient_consent_withdrawn.id)
        r = client.post(
            f"/api/v1/home-program-tasks/patient/{tid}/help-request",
            json={"reason": "consent test"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403


# ── Exports ─────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_demo_prefix(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # Force the DEMO branch by stamping ``[DEMO]`` in patient.notes.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient_with_consent.id).first()
            assert p is not None
            p.notes = "[DEMO] launch-audit"
            db.commit()
        finally:
            db.close()

        _seed_task(patient_id=demo_patient_with_consent.id)
        r = client.get(
            "/api/v1/home-program-tasks/patient/export.csv",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-home-program-tasks-" in cd
        assert r.headers.get("X-HomeProgramTasks-Demo") == "1"
        assert "task_id" in r.text  # CSV header row

    def test_ndjson_export_when_not_demo_no_prefix(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        # demo_patient_with_consent has notes=None and clinician_id=
        # "actor-clinician-demo"; the default conftest setup wires
        # actor-clinician-demo into a demo clinic
        # (clinic-cd-demo / clinic-demo-default), which trips the
        # demo branch via _patient_is_demo_hpt. So we deliberately
        # re-point the clinician to a non-demo id for this case.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=demo_patient_with_consent.id).first()
            assert p is not None
            p.clinician_id = "non-demo-clinician"
            db.commit()
        finally:
            db.close()

        _seed_task(
            patient_id=demo_patient_with_consent.id,
            clinician_id="non-demo-clinician",
        )
        r = client.get(
            "/api/v1/home-program-tasks/patient/export.ndjson",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-" not in cd
        assert r.headers.get("X-HomeProgramTasks-Demo") == "0"


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/home-program-tasks/patient/audit-events",
            json={
                "event": "view",
                "note": "patient mounted Homework page",
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("home_program_tasks-")

    def test_audit_ingestion_clinician_403(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/home-program-tasks/patient/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_audit_ingestion_with_own_task_ok(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient_with_consent: Patient,
    ) -> None:
        tid = _seed_task(patient_id=demo_patient_with_consent.id)
        r = client.post(
            "/api/v1/home-program-tasks/patient/audit-events",
            json={"event": "task_viewed", "task_id": tid},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200

        # Verify the row reaches /api/v1/audit-trail.
        audit = client.get(
            "/api/v1/audit-trail?surface=home_program_tasks",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "home_program_tasks.task_viewed" in actions
