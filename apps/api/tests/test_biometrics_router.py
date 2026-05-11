"""Regression tests for biometrics_router POST /api/biometrics/sync.

P0 fix: the pre-resolution consent block at lines 107-120 referenced `patient_id`
before assignment, causing a NameError on every request. After the fix, the route
resolves patient_id via resolve_analytics_patient_id (which enforces
require_patient_owner internally) before calling require_ai_analysis_consent with
the correct kwargs.

Tests cover:
1. Cross-clinic clinician gets 403 (not 500) when posting biometrics for a patient
   belonging to a different clinic.
2. Unauthenticated requests get 401 (not 500).
3. Clinician posting for a non-existent patient_id gets 404 (not 500).
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User
from app.services.auth_service import create_access_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def two_clinics_with_patient() -> dict[str, Any]:
    """Create two clinics, one patient in clinic A, return tokens for both clinics."""
    db = SessionLocal()
    try:
        clinic_a_id = str(uuid.uuid4())
        clinic_b_id = str(uuid.uuid4())
        clinic_a = Clinic(id=clinic_a_id, name=f"Bio Clinic A {uuid.uuid4().hex[:6]}")
        clinic_b = Clinic(id=clinic_b_id, name=f"Bio Clinic B {uuid.uuid4().hex[:6]}")

        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"bio_clin_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Bio Clinician A",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_a_id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"bio_clin_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Bio Clinician B",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_b_id,
        )
        db.add_all([clinic_a, clinic_b, clin_a, clin_b])
        db.flush()

        patient_a = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a.id,
            first_name="Bio",
            last_name="PatientA",
        )
        db.add(patient_a)
        db.commit()

        token_a = create_access_token(
            user_id=clin_a.id,
            email=clin_a.email,
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_a_id,
        )
        token_b = create_access_token(
            user_id=clin_b.id,
            email=clin_b.email,
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_b_id,
        )
        return {
            "patient_id": patient_a.id,
            "token_a": token_a,  # same-clinic clinician
            "token_b": token_b,  # cross-clinic clinician
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


_MINIMAL_SYNC_BODY = {
    "provider": "oura",
    "batch": [],
    "run_clinical_flag_checks": False,
}


# ---------------------------------------------------------------------------
# Cross-clinic gate — the P0 regression
# ---------------------------------------------------------------------------

def test_cross_clinic_sync_returns_403_not_500(
    client: TestClient, two_clinics_with_patient: dict[str, Any]
) -> None:
    """A Clinic-B clinician posting biometrics for a Clinic-A patient must get
    403 (cross-clinic ownership denied), NOT 500 (NameError / uncaught exception).

    This is the P0 regression: before the fix, every POST /sync raised NameError
    because patient_id was referenced before assignment."""
    resp = client.post(
        "/api/biometrics/sync",
        json={**_MINIMAL_SYNC_BODY, "patient_id": two_clinics_with_patient["patient_id"]},
        headers=_auth(two_clinics_with_patient["token_b"]),
    )
    assert resp.status_code == 403, (
        f"Expected 403 for cross-clinic sync, got {resp.status_code}: {resp.text}"
    )


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------

def test_unauthenticated_sync_returns_401(client: TestClient) -> None:
    """No auth header must return 401, not 500."""
    resp = client.post("/api/biometrics/sync", json=_MINIMAL_SYNC_BODY)
    assert resp.status_code == 401, (
        f"Expected 401 for unauthenticated sync, got {resp.status_code}: {resp.text}"
    )


def test_nonexistent_patient_returns_404(
    client: TestClient, two_clinics_with_patient: dict[str, Any]
) -> None:
    """Posting biometrics for a patient_id that doesn't exist returns 404, not 500."""
    resp = client.post(
        "/api/biometrics/sync",
        json={**_MINIMAL_SYNC_BODY, "patient_id": str(uuid.uuid4())},
        headers=_auth(two_clinics_with_patient["token_a"]),
    )
    assert resp.status_code == 404, (
        f"Expected 404 for non-existent patient, got {resp.status_code}: {resp.text}"
    )
