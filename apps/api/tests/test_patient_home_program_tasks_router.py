"""Tests for the Patient Home Program Tasks router (PR 102 set L).

Covers:
  GET  /api/v1/home-program-tasks/patient/today
  GET  /api/v1/home-program-tasks/patient/upcoming
  GET  /api/v1/home-program-tasks/patient/completed
  GET  /api/v1/home-program-tasks/patient/summary
  GET  /api/v1/home-program-tasks/patient/{task_id}
  POST /api/v1/home-program-tasks/patient/{task_id}/start
  POST /api/v1/home-program-tasks/patient/{task_id}/help-request
  POST /api/v1/home-program-tasks/patient/audit-events
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.persistence.models import ClinicianHomeProgramTask, Patient

PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


@pytest.fixture
def patient_with_task():
    """Seed the demo-patient row and a task assigned to them."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="hpt-patient-001",
            clinician_id="actor-clinician-demo",
            first_name="Homework",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.flush()  # ensure patient FK is satisfied before inserting task
        today = datetime.now(timezone.utc).date().isoformat()
        task = ClinicianHomeProgramTask(
            id="hpt-task-001",
            server_task_id="srv-task-001",
            patient_id="hpt-patient-001",
            clinician_id="actor-clinician-demo",
            task_json=json.dumps({
                "title": "Daily Breathing",
                "category": "relaxation",
                "task_type": "exercise",
                "due_on": today,
                "instructions": "Breathe deeply for 5 minutes.",
                "rationale": "Reduces anxiety.",
            }),
        )
        db.add(task)
        db.commit()
        yield patient
    finally:
        db.close()


# ── Role gate ───────────────────────────────────────────────────────────────


def test_today_clinician_role_returns_404(client: TestClient, patient_with_task) -> None:
    """Clinicians must receive 404 (not 403) so patient-side URL existence is invisible."""
    r = client.get("/api/v1/home-program-tasks/patient/today", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_today_unauthenticated_returns_4xx(client: TestClient) -> None:
    """Unauthenticated request resolves to guest/anon role → not patient → 404."""
    r = client.get("/api/v1/home-program-tasks/patient/today")
    assert r.status_code in (403, 404)


# ── Happy-path list endpoints ────────────────────────────────────────────────


def test_today_happy_path(client: TestClient, patient_with_task) -> None:
    """Patient can list tasks due today."""
    r = client.get("/api/v1/home-program-tasks/patient/today", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)
    assert body["total"] >= 1
    assert body["consent_active"] is True


def test_upcoming_happy_path(client: TestClient, patient_with_task) -> None:
    """Patient can list upcoming tasks."""
    r = client.get("/api/v1/home-program-tasks/patient/upcoming", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body


def test_completed_happy_path(client: TestClient, patient_with_task) -> None:
    """Patient can list completed tasks (empty on a fresh DB)."""
    r = client.get("/api/v1/home-program-tasks/patient/completed", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_summary_happy_path(client: TestClient, patient_with_task) -> None:
    """Patient can fetch the homework summary counts."""
    r = client.get("/api/v1/home-program-tasks/patient/summary", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "total_assigned" in body
    assert "due_today" in body
    assert "completion_rate_7d" in body
    assert body["total_assigned"] >= 1


# ── Single task detail ───────────────────────────────────────────────────────


def test_task_detail_happy_path(client: TestClient, patient_with_task) -> None:
    r = client.get("/api/v1/home-program-tasks/patient/hpt-task-001", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "hpt-task-001"
    assert body["title"] == "Daily Breathing"


def test_task_detail_404_for_unknown(client: TestClient, patient_with_task) -> None:
    r = client.get(
        "/api/v1/home-program-tasks/patient/totally-unknown-task-id",
        headers=PATIENT_HDR,
    )
    assert r.status_code == 404


# ── Start endpoint ───────────────────────────────────────────────────────────


def test_start_task_happy_path(client: TestClient, patient_with_task) -> None:
    r = client.post(
        "/api/v1/home-program-tasks/patient/hpt-task-001/start",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert body["task_id"] == "hpt-task-001"
    assert "started_at" in body


def test_start_task_consent_required(client: TestClient) -> None:
    """Patient with withdrawn consent gets 403 on start."""
    db = SessionLocal()
    try:
        from app.persistence.models import ConsentRecord
        patient = Patient(
            id="hpt-patient-nc",
            clinician_id="actor-clinician-demo",
            first_name="No",
            last_name="Consent",
            email="patient@deepsynaps.com",
            consent_signed=False,
            status="active",
        )
        db.add(patient)
        db.flush()  # patient must exist before FK-dependent rows
        cr = ConsentRecord(
            id="cr-withdrawn-hpt",
            patient_id="hpt-patient-nc",
            clinician_id="actor-clinician-demo",
            consent_type="treatment",
            status="withdrawn",
        )
        db.add(cr)
        task = ClinicianHomeProgramTask(
            id="hpt-task-nc",
            server_task_id="srv-task-nc",
            patient_id="hpt-patient-nc",
            clinician_id="actor-clinician-demo",
            task_json=json.dumps({"title": "Task"}),
        )
        db.add(task)
        db.commit()
    finally:
        db.close()

    r = client.post(
        "/api/v1/home-program-tasks/patient/hpt-task-nc/start",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 403


# ── Audit events ─────────────────────────────────────────────────────────────


def test_audit_events_happy_path(client: TestClient, patient_with_task) -> None:
    r = client.post(
        "/api/v1/home-program-tasks/patient/audit-events",
        json={"event": "view", "note": "mounted homework page"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert "event_id" in body


def test_audit_events_clinician_forbidden(client: TestClient, patient_with_task) -> None:
    r = client.post(
        "/api/v1/home-program-tasks/patient/audit-events",
        json={"event": "view"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 403


def test_audit_events_invalid_body_422(client: TestClient, patient_with_task) -> None:
    """Missing required 'event' field should return 422."""
    r = client.post(
        "/api/v1/home-program-tasks/patient/audit-events",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422
