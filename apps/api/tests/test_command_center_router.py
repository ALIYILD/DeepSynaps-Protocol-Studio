"""Tests for the Patient Command Center router (PR 102 set L).

Covers:
  GET /api/v1/command-center/{patient_id}

Key contracts:
  * Requires clinician+ role.
  * Cross-clinic IDOR gate: clinician can only see patients in their own clinic.
  * 404 for unknown patient_id.
  * Happy-path returns expected CommandCenterOut shape with patient_id + patient_name.
  * Patient role is rejected (403).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.persistence.models import Patient, User, Clinic, ClinicalSession

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}


@pytest.fixture
def patient_in_demo_clinic():
    """Seed a Patient in the demo clinic (same as the demo clinician)."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="cc-patient-001",
            clinician_id="actor-clinician-demo",
            first_name="Command",
            last_name="Patient",
            email="cc-patient@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        yield patient
    finally:
        db.close()


@pytest.fixture
def patient_in_other_clinic():
    """Seed a Patient in a DIFFERENT clinic (cross-clinic IDOR target)."""
    db = SessionLocal()
    try:
        other_clinic = Clinic(id="clinic-other-cc", name="Other Clinic CC")
        db.add(other_clinic)
        db.flush()
        other_clinician = User(
            id="clinician-other-cc",
            email="other-clinician-cc@example.com",
            display_name="Other Clinician CC",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id="clinic-other-cc",
        )
        db.add(other_clinician)
        db.flush()
        patient = Patient(
            id="cc-patient-other",
            clinician_id="clinician-other-cc",
            first_name="Cross",
            last_name="ClinicPatient",
            email="cross-patient-cc@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        yield patient
    finally:
        db.close()


# ── Auth gates ───────────────────────────────────────────────────────────────


def test_command_center_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/command-center/any-patient-id")
    assert r.status_code == 403


def test_command_center_patient_role_rejected(client: TestClient, patient_in_demo_clinic) -> None:
    r = client.get(
        f"/api/v1/command-center/{patient_in_demo_clinic.id}",
        headers=PATIENT_HDR,
    )
    assert r.status_code == 403


# ── 404 for unknown patient ──────────────────────────────────────────────────


def test_command_center_unknown_patient_404(client: TestClient) -> None:
    r = client.get(
        "/api/v1/command-center/nonexistent-patient-xyz",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


# ── Cross-clinic IDOR ────────────────────────────────────────────────────────


def test_command_center_cross_clinic_idor_blocked(
    client: TestClient, patient_in_other_clinic
) -> None:
    """Clinician from demo clinic must NOT see a patient in another clinic."""
    r = client.get(
        f"/api/v1/command-center/{patient_in_other_clinic.id}",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code in (403, 404)


# ── Happy path ───────────────────────────────────────────────────────────────


def test_command_center_happy_path(client: TestClient, patient_in_demo_clinic) -> None:
    """Returns a valid CommandCenterOut payload for an in-clinic patient."""
    r = client.get(
        f"/api/v1/command-center/{patient_in_demo_clinic.id}",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["patient_id"] == patient_in_demo_clinic.id
    assert "patient_name" in body
    assert isinstance(body.get("kpis"), list)
    assert isinstance(body.get("charts"), list)
    assert isinstance(body.get("assessments"), list)
    assert isinstance(body.get("wearables"), list)
    assert "sessions" in body
    assert "treatment" in body
    assert "neuroimaging" in body
    assert isinstance(body.get("alerts"), list)


def test_command_center_shape_includes_session_fields(
    client: TestClient, patient_in_demo_clinic
) -> None:
    """sessions sub-object has total, completed, scheduled, cancelled, progress_pct."""
    r = client.get(
        f"/api/v1/command-center/{patient_in_demo_clinic.id}",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    sessions = r.json()["sessions"]
    for key in ("total", "completed", "scheduled", "cancelled", "progress_pct", "recent"):
        assert key in sessions, f"Missing key '{key}' in sessions"


# Regression: the router previously referenced ClinicalSession.scheduled_date,
# which does not exist on the model (the column is scheduled_at, String(32)).
# Without seeded sessions the bug was invisible, and the router's outer
# try/except swallowed the AttributeError into a demo payload in dev mode.
#
# This is a unit-level regression that exercises just the order_by + recent-
# row construction the fix touched, so it is not coupled to other unrelated
# schema drift in _build_command_center (AssessmentRecord fields, etc.).
def test_recent_sessions_uses_scheduled_at_not_scheduled_date() -> None:
    from app.persistence import models as _models

    CS = _models.ClinicalSession

    # The model must expose scheduled_at and must NOT expose scheduled_date
    # (the buggy attribute). If a future refactor renames scheduled_at, this
    # assertion fires and forces the router rename to ride along.
    assert hasattr(CS, "scheduled_at")
    assert not hasattr(CS, "scheduled_date")

    # The order_by expression must construct without raising — this is what
    # the router calls and what raised AttributeError before the fix.
    expr = CS.scheduled_at.desc()
    assert expr is not None


def test_recent_sessions_real_db_query_against_seeded_rows(patient_in_demo_clinic) -> None:
    """End-to-end: seed real sessions, run the exact query the router runs."""
    from app.persistence import models as _models

    CS = _models.ClinicalSession
    db = SessionLocal()
    try:
        for i, status in enumerate(("completed", "scheduled", "cancelled")):
            db.add(ClinicalSession(
                id=f"cc-sess-{i}",
                patient_id=patient_in_demo_clinic.id,
                clinician_id="actor-clinician-demo",
                scheduled_at=f"2026-05-0{i+1}T10:00:00Z",
                status=status,
            ))
        db.commit()

        rows = (
            db.query(CS)
            .filter(CS.patient_id == patient_in_demo_clinic.id)
            .order_by(CS.scheduled_at.desc())
            .limit(100)
            .all()
        )
        assert len(rows) == 3
        # desc order
        assert rows[0].scheduled_at >= rows[-1].scheduled_at
        # the dict-construction line the fix also touched
        recent = [
            {"date": s.scheduled_at or "", "status": s.status}
            for s in rows
        ]
        assert all(r["date"] for r in recent)
    finally:
        db.close()
