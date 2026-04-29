"""Regression test for risk_stratification_router clinic-scope on the
``/api/v1/risk/clinic/summary`` dashboard.

Pre-fix the summary filtered ``Patient.clinician_id == actor.actor_id``,
which dropped same-clinic colleagues' patients from the at-risk
dashboard. A covering clinician staring at the RED-level list saw none
of their teammate's patients; admin saw only their own panel even
though they're cross-clinic by design. Post-fix the query joins through
``User.clinic_id`` so covering clinicians see clinic-mates' patients,
and admin gets the full cross-clinic surface.
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
def two_clinics_with_patient() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Risk Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Risk Clinic B")
        clin_a1 = User(
            id=str(uuid.uuid4()),
            email=f"r_a1_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A1",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_a2 = User(
            id=str(uuid.uuid4()),
            email=f"r_a2_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A2",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"r_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        admin = User(
            id=str(uuid.uuid4()),
            email=f"r_admin_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Admin",
            hashed_password="x",
            role="admin",
            package_id="explorer",
            clinic_id=None,
        )
        db.add_all([clinic_a, clinic_b, clin_a1, clin_a2, clin_b, admin])
        db.flush()

        patient_a = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a1.id,
            first_name="A",
            last_name="Patient",
            status="active",
        )
        db.add(patient_a)
        db.commit()

        def _tok(user: User) -> str:
            return create_access_token(
                user_id=user.id, email=user.email, role=user.role,
                package_id="explorer", clinic_id=user.clinic_id,
            )
        return {
            "patient_id": patient_a.id,
            "token_a1": _tok(clin_a1),
            "token_a2": _tok(clin_a2),
            "token_b": _tok(clin_b),
            "token_admin": _tok(admin),
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_summary_visible_to_same_clinic_colleague(
    client: TestClient, two_clinics_with_patient: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/risk/clinic/summary",
        headers=_auth(two_clinics_with_patient["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    pids = [p["patient_id"] for p in resp.json()["patients"]]
    assert two_clinics_with_patient["patient_id"] in pids


def test_summary_hides_other_clinics_patients(
    client: TestClient, two_clinics_with_patient: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/risk/clinic/summary",
        headers=_auth(two_clinics_with_patient["token_b"]),
    )
    assert resp.status_code == 200, resp.text
    pids = [p["patient_id"] for p in resp.json()["patients"]]
    assert two_clinics_with_patient["patient_id"] not in pids


def test_summary_admin_sees_all_clinics(
    client: TestClient, two_clinics_with_patient: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/risk/clinic/summary",
        headers=_auth(two_clinics_with_patient["token_admin"]),
    )
    assert resp.status_code == 200, resp.text
    pids = [p["patient_id"] for p in resp.json()["patients"]]
    assert two_clinics_with_patient["patient_id"] in pids
