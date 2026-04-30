"""Regression tests for virtual_care_router._require_patient role + demo gates.

Pre-fix the helper resolved Patient.email == user.email with no role
check, and accepted ``actor_id == "actor-patient-demo"`` in any
environment. Sister fix to PRs #201 / #206 — same root cause.
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
def vc_clin_with_patient_email() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Virtual Care Clinic")
        shared_email = f"vc_overlap_{uuid.uuid4().hex[:8]}@example.com"
        clinician = User(
            id=str(uuid.uuid4()),
            email=shared_email,
            display_name="Clin",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clinician.id,
            first_name="Pat",
            last_name="Patient",
            email=shared_email,
        )
        db.add_all([clinic, clinician, patient])
        db.commit()

        token_clinician = create_access_token(
            user_id=clinician.id, email=clinician.email, role="clinician",
            package_id="explorer", clinic_id=clinic.id,
        )
        return {
            "clinic_id": clinic.id,
            "patient_id": patient.id,
            "token_clinician": token_clinician,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_clinician_cannot_create_virtual_care_session_via_email_overlap(
    client: TestClient,
    vc_clin_with_patient_email: dict[str, Any],
) -> None:
    """Pre-fix a clinician with email matching a Patient row could
    create a virtual-care session on behalf of that patient via
    ``_require_patient``. The helper now refuses any non-patient
    (and non-admin) actor with HTTP 403 ``patient_role_required``."""
    resp = client.post(
        "/api/v1/virtual-care/sessions",
        headers=_auth(vc_clin_with_patient_email["token_clinician"]),
        json={"session_type": "telehealth"},
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") == "patient_role_required"
