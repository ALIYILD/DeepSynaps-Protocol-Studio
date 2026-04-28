"""Regression tests for the patient_portal_router.py role + demo gates.

Pre-fix ``_require_patient`` had two gaps:

* No ``actor.role`` check — a clinician (or any non-patient role)
  whose ``user.email`` matched a Patient row could read / write that
  patient's wellness logs, dashboard, notifications, and
  learn-progress (the routes that called this helper without an
  explicit ``if actor.role != "patient"`` pre-check).
* The demo bypass (``actor.actor_id == "actor-patient-demo"``) was
  reachable in any environment, including production.

Post-fix only ``patient`` and ``admin`` actors pass; the demo
bypass is gated to ``app_env in {development, test}``.

Sister fix to ``test_home_device_portal_role_and_date_gates.py``;
together they close the same role-bypass on both the home-device
portal and the broader patient portal.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User
from app.services.auth_service import create_access_token


@pytest.fixture
def patient_clinician_overlap() -> dict[str, Any]:
    """Build a clinic with a clinician + a patient sharing the email
    column. The Patient record does NOT belong to the clinician — but
    pre-fix ``_require_patient`` would still resolve via
    ``Patient.email == user.email``."""
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Portal Clinic")

        shared_email = f"pp_overlap_{uuid.uuid4().hex[:8]}@example.com"
        clinician = User(
            id=str(uuid.uuid4()),
            email=shared_email,  # crafted overlap
            display_name="Clin",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        # Patient with the same email — pre-fix the clinician's user row
        # would resolve as this patient.
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clinician.id,
            first_name="Pat",
            last_name="Patient",
            email=shared_email,
        )
        # Real patient User (separate id, same email semantics) for the
        # legitimate-actor sanity check.
        legit_patient_email = f"pp_legit_{uuid.uuid4().hex[:8]}@example.com"
        legit_patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clinician.id,
            first_name="Legit",
            last_name="Patient",
            email=legit_patient_email,
        )
        legit_patient_user = User(
            id=str(uuid.uuid4()),
            email=legit_patient_email,
            display_name="Legit",
            hashed_password="x",
            role="patient",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clinician, patient, legit_patient, legit_patient_user])
        db.commit()

        token_clinician = create_access_token(
            user_id=clinician.id, email=clinician.email, role="clinician",
            package_id="explorer", clinic_id=clinic.id,
        )
        token_patient = create_access_token(
            user_id=legit_patient_user.id, email=legit_patient_user.email, role="patient",
            package_id="explorer", clinic_id=clinic.id,
        )
        return {
            "clinic_id": clinic.id,
            "patient_id": patient.id,
            "legit_patient_id": legit_patient.id,
            "token_clinician": token_clinician,
            "token_patient": token_patient,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Routes that pre-fix lacked an explicit role pre-check and relied
# solely on ``_require_patient``.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/v1/patient-portal/wellness-logs"),
        ("GET", "/api/v1/patient-portal/dashboard"),
        ("GET", "/api/v1/patient-portal/notifications"),
        ("GET", "/api/v1/patient-portal/learn-progress"),
    ],
)
def test_clinician_cannot_pose_as_patient_via_email_overlap(
    client: TestClient,
    patient_clinician_overlap: dict[str, Any],
    method: str,
    path: str,
) -> None:
    """Pre-fix a clinician with an email matching a Patient row could
    resolve as that patient via these routes (they called
    ``_require_patient`` without the ``actor.role`` pre-check). The
    helper now refuses any non-patient (and non-admin) actor."""
    resp = client.request(
        method, path, headers=_auth(patient_clinician_overlap["token_clinician"])
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") == "patient_role_required"


def test_patient_role_passes_dashboard(
    client: TestClient, patient_clinician_overlap: dict[str, Any]
) -> None:
    """Sanity: legitimate patient-role caller still works."""
    resp = client.get(
        "/api/v1/patient-portal/dashboard",
        headers=_auth(patient_clinician_overlap["token_patient"]),
    )
    # 200 happy path — the dashboard always renders for a patient.
    assert resp.status_code == 200, resp.text
