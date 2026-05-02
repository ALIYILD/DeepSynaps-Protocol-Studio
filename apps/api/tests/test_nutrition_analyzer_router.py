"""Nutrition analyzer router — auth, IDOR-ish gate, GET JSON shape."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User


def _mint_token(user_id: str, role: str, clinic_id: str | None) -> str:
    from app.services.auth_service import create_access_token

    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


def _seed(db: Session) -> dict[str, Any]:
    clinic_a = Clinic(id=str(uuid.uuid4()), name="Nutrition Clinic A")
    clinic_b = Clinic(id=str(uuid.uuid4()), name="Nutrition Clinic B")
    db.add_all([clinic_a, clinic_b])
    db.flush()

    clin_a = User(
        id=str(uuid.uuid4()),
        email=f"nut_clin_a_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Clin A",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_a.id,
    )
    clin_b = User(
        id=str(uuid.uuid4()),
        email=f"nut_clin_b_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Clin B",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_b.id,
    )
    db.add_all([clin_a, clin_b])
    db.flush()

    patient = Patient(
        id=str(uuid.uuid4()),
        clinician_id=clin_a.id,
        first_name="Nut",
        last_name="Patient",
    )
    db.add(patient)
    db.commit()

    return {
        "patient_id": patient.id,
        "token_a": _mint_token(clin_a.id, "clinician", clinic_a.id),
        "token_b": _mint_token(clin_b.id, "clinician", clinic_b.id),
    }


@pytest.fixture
def nutrition_setup(client: TestClient) -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        return _seed(db)
    finally:
        db.close()


def test_guest_blocked(client: TestClient, nutrition_setup: dict[str, Any]) -> None:
    pid = nutrition_setup["patient_id"]
    resp = client.get(
        f"/api/v1/nutrition/analyzer/patient/{pid}",
        headers={"Authorization": "Bearer guest-demo-token"},
    )
    assert resp.status_code in (401, 403), resp.text


def test_cross_clinic_clinician_forbidden(
    client: TestClient, nutrition_setup: dict[str, Any]
) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_b']}"}
    resp = client.get(f"/api/v1/nutrition/analyzer/patient/{pid}", headers=hdr)
    assert resp.status_code == 403, resp.text


def test_clinician_get_payload_shape(client: TestClient, nutrition_setup: dict[str, Any]) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.get(f"/api/v1/nutrition/analyzer/patient/{pid}", headers=hdr)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["patient_id"] == pid
    for key in (
        "computation_id",
        "data_as_of",
        "snapshot",
        "diet",
        "supplements",
        "biomarker_links",
        "recommendations",
        "audit_events",
    ):
        assert key in data
