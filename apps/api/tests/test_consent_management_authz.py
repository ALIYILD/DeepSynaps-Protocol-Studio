"""Regression tests pinning cross-clinic gates on consent management.

Pre-fix the consent-management router had two P0 issues:

* **Cross-clinic IDOR on POST /records** — the handler set
  ``clinician_id = actor.actor_id`` and persisted the new
  ConsentRecord with whatever ``patient_id`` the caller supplied. No
  check that the patient belonged to the actor's clinic. A clinician
  in clinic A could forge consent records on patients in clinic B.

* **Tenant scoping by clinician_id** — list / audit-log /
  compliance-score routes filtered by ``ConsentRecord.clinician_id ==
  actor.actor_id`` for non-admins and skipped the filter entirely for
  admins. The admin-bypass meant a clinic-A admin saw clinic-B
  records.

Post-fix the canonical ``_gate_patient_access`` runs on POST and on
``_get_consent_or_404`` (used by PUT). Tenant-scoped queries join
through ``Patient`` -> ``User.clinic_id`` so admins are also confined
to their own clinic.
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
def two_clinics() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Consent Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Consent Clinic B")
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"con_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"con_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clinic_a, clinic_b, clin_a, clin_b])
        db.flush()
        patient_a = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a.id,
            first_name="A",
            last_name="Patient",
        )
        db.add(patient_a)
        db.commit()

        token_a = create_access_token(
            user_id=clin_a.id, email=clin_a.email, role="clinician",
            package_id="explorer", clinic_id=clinic_a.id,
        )
        token_b = create_access_token(
            user_id=clin_b.id, email=clin_b.email, role="clinician",
            package_id="explorer", clinic_id=clinic_b.id,
        )
        return {
            "patient_a_id": patient_a.id,
            "token_a": token_a,
            "token_b": token_b,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_create_consent_for_other_clinic_patient_blocked(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    """Clinician B (clinic B) MUST NOT be able to create a consent
    record on patient A (clinic A). Pre-fix this was wide open."""
    resp = client.post(
        "/api/v1/consent/records",
        headers=_auth(two_clinics["token_b"]),
        json={
            "patient_id": two_clinics["patient_a_id"],
            "consent_type": "general",
            "signed": True,
        },
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") == "cross_clinic_access_denied"


def test_create_consent_for_own_clinic_patient_succeeds(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    """Owning clinician must still be able to create the consent."""
    resp = client.post(
        "/api/v1/consent/records",
        headers=_auth(two_clinics["token_a"]),
        json={
            "patient_id": two_clinics["patient_a_id"],
            "consent_type": "general",
            "signed": True,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["patient_id"] == two_clinics["patient_a_id"]


def test_list_consent_records_scoped_to_clinic(
    client: TestClient, two_clinics: dict[str, Any]
) -> None:
    """When clinician A creates a consent for their patient, clinician
    B's listing must NOT include it. Pre-fix admins of clinic B could
    see all records — the canonical scoping prevents that too, but
    clinician-vs-clinician is the load-bearing case here."""
    # Seed a consent record as clinician A.
    seed = client.post(
        "/api/v1/consent/records",
        headers=_auth(two_clinics["token_a"]),
        json={
            "patient_id": two_clinics["patient_a_id"],
            "consent_type": "research",
            "signed": True,
        },
    )
    assert seed.status_code == 201, seed.text

    # Clinician B listing the entire records collection must not
    # include any entry for patient A.
    listing = client.get(
        "/api/v1/consent/records",
        headers=_auth(two_clinics["token_b"]),
    )
    assert listing.status_code == 200, listing.text
    body = listing.json()
    patient_ids_seen = {r["patient_id"] for r in body.get("items", [])}
    assert two_clinics["patient_a_id"] not in patient_ids_seen, body
