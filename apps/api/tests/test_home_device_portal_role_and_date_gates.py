"""Regression tests for the home-device patient-portal role + date gates.

Pre-fix the patient-portal home-device routes had two bugs:

* ``_require_patient`` only matched ``Patient.email == user.email`` and
  never checked ``actor.role``. A ``clinician`` (or any non-patient
  role) whose user email happened to match a Patient row could resolve
  as that patient and log home sessions / submit adherence events on
  the patient's behalf. The demo bypass
  (``actor.actor_id == "actor-patient-demo"``) was reachable in any
  environment.
* ``LogSessionRequest.session_date`` and
  ``SubmitAdherenceEventRequest.report_date`` were untyped ``str``
  with only a ``YYYY-MM-DD`` description. A patient could submit
  ``"2099-12-31"`` to pollute adherence summaries with future-dated
  sessions, ``"yesterday"`` (any non-date text), or arbitrary content
  rendered back to clinicians in review queues.

Post-fix:

* Only ``patient`` and ``admin`` roles pass ``_require_patient``.
* The demo bypass is gated to ``app_env in {development, test}``.
* ``_validate_session_date`` rejects malformed strings, non-calendar
  dates, future dates, and dates more than 30 days in the past.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, HomeDeviceAssignment, Patient, User
from app.services.auth_service import create_access_token


@pytest.fixture
def patient_with_assignment() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Home Device Clinic")
        clinician = User(
            id=str(uuid.uuid4()),
            email=f"hd_clin_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Clin",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clinician])
        db.flush()

        # Patient + matching User account so the email-link path works.
        patient_email = f"hd_patient_{uuid.uuid4().hex[:8]}@example.com"
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clinician.id,
            first_name="Pat",
            last_name="Patient",
            email=patient_email,
        )
        patient_user = User(
            id=str(uuid.uuid4()),
            email=patient_email,
            display_name="Pat",
            hashed_password="x",
            role="patient",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([patient, patient_user])
        db.flush()

        assignment = HomeDeviceAssignment(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            assigned_by=clinician.id,
            course_id=None,
            device_name="Demo Device",
            device_model=None,
            device_category="tens",
            parameters_json="{}",
            instructions_text=None,
            session_frequency_per_week=3,
            planned_total_sessions=12,
            status="active",
        )
        db.add(assignment)
        db.commit()

        token_patient = create_access_token(
            user_id=patient_user.id, email=patient_user.email, role="patient",
            package_id="explorer", clinic_id=clinic.id,
        )
        token_clinician = create_access_token(
            user_id=clinician.id, email=clinician.email, role="clinician",
            package_id="explorer", clinic_id=clinic.id,
        )
        return {
            "patient_id": patient.id,
            "patient_email": patient_email,
            "clinician_id": clinician.id,
            "clinician_email": clinician.email,
            "token_patient": token_patient,
            "token_clinician": token_clinician,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# patient-role gate
# ---------------------------------------------------------------------------
def test_clinician_cannot_pose_as_patient_on_home_device_portal(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    """Pre-fix a clinician whose email matched a Patient row could
    resolve as that patient. Post-fix actor.role must be 'patient'."""
    resp = client.get(
        "/api/v1/patient-portal/home-device",
        headers=_auth(patient_with_assignment["token_clinician"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") == "patient_role_required"


def test_clinician_cannot_log_home_session(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    resp = client.post(
        "/api/v1/patient-portal/home-sessions",
        headers=_auth(patient_with_assignment["token_clinician"]),
        json={"session_date": date.today().isoformat()},
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") == "patient_role_required"


def test_patient_role_passes(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    """Sanity: the legitimate patient-role caller still works."""
    resp = client.get(
        "/api/v1/patient-portal/home-device",
        headers=_auth(patient_with_assignment["token_patient"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["assignment"]["status"] == "active"


# ---------------------------------------------------------------------------
# session_date / report_date validation
# ---------------------------------------------------------------------------
def test_log_session_rejects_future_date(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    future = (date.today() + timedelta(days=2)).isoformat()
    resp = client.post(
        "/api/v1/patient-portal/home-sessions",
        headers=_auth(patient_with_assignment["token_patient"]),
        json={"session_date": future},
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_date"


def test_log_session_rejects_far_past_date(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    too_old = (date.today() - timedelta(days=400)).isoformat()
    resp = client.post(
        "/api/v1/patient-portal/home-sessions",
        headers=_auth(patient_with_assignment["token_patient"]),
        json={"session_date": too_old},
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_date"


def test_log_session_rejects_non_iso_string(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    resp = client.post(
        "/api/v1/patient-portal/home-sessions",
        headers=_auth(patient_with_assignment["token_patient"]),
        json={"session_date": "not-a-date"},
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_date"


def test_log_session_rejects_html_in_date(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    """Pre-fix the date column accepted any string — XSS payloads were
    rendered back to clinicians in the review queue."""
    resp = client.post(
        "/api/v1/patient-portal/home-sessions",
        headers=_auth(patient_with_assignment["token_patient"]),
        json={"session_date": "<script>alert(1)</script>"},
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_date"


def test_log_session_accepts_today(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    resp = client.post(
        "/api/v1/patient-portal/home-sessions",
        headers=_auth(patient_with_assignment["token_patient"]),
        json={"session_date": date.today().isoformat()},
    )
    assert resp.status_code == 201, resp.text


def test_adherence_event_rejects_future_report_date(
    client: TestClient, patient_with_assignment: dict[str, Any]
) -> None:
    future = (date.today() + timedelta(days=10)).isoformat()
    resp = client.post(
        "/api/v1/patient-portal/adherence-events",
        headers=_auth(patient_with_assignment["token_patient"]),
        json={"event_type": "concern", "report_date": future},
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_date"
