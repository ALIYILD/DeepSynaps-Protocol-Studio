"""Movement Analyzer router — auth and payload smoke tests."""
from __future__ import annotations

import uuid

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


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed(db: Session) -> dict:
    clinic_a = Clinic(id=str(uuid.uuid4()), name="Mov Clinic A")
    clinic_b = Clinic(id=str(uuid.uuid4()), name="Mov Clinic B")
    db.add_all([clinic_a, clinic_b])
    db.flush()

    clin_a = User(
        id=str(uuid.uuid4()),
        email=f"mov_clin_a_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Clin A",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_a.id,
    )
    clin_b = User(
        id=str(uuid.uuid4()),
        email=f"mov_clin_b_{uuid.uuid4().hex[:6]}@example.com",
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
        first_name="Walk",
        last_name="Test",
    )
    db.add(patient)
    db.commit()

    return {
        "patient_id": patient.id,
        "token_a": _mint_token(clin_a.id, "clinician", clinic_a.id),
        "token_b": _mint_token(clin_b.id, "clinician", clinic_b.id),
    }


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def seeded():
    db = SessionLocal()
    try:
        yield _seed(db)
    finally:
        db.close()


def test_movement_analyzer_guest_blocked(client: TestClient, seeded: dict):
    r = client.get(f"/api/v1/movement/analyzer/patient/{seeded['patient_id']}")
    assert r.status_code == 401


def test_movement_analyzer_owner_gets_payload(client: TestClient, seeded: dict):
    r = client.get(
        f"/api/v1/movement/analyzer/patient/{seeded['patient_id']}",
        headers=_auth(seeded["token_a"]),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["patient_id"] == seeded["patient_id"]
    assert "snapshot" in data
    assert "clinical_disclaimer" in data
    assert data.get("schema_version") == "1"
    assert "cross_modal_context" in data
    assert isinstance(data["cross_modal_context"], dict)


def test_movement_analyzer_idor_other_clinic(client: TestClient, seeded: dict):
    r = client.get(
        f"/api/v1/movement/analyzer/patient/{seeded['patient_id']}",
        headers=_auth(seeded["token_b"]),
    )
    assert r.status_code == 403


def test_movement_annotation_audit(client: TestClient, seeded: dict):
    pid = seeded["patient_id"]
    h = _auth(seeded["token_a"])
    note = "Motor exam deferred — follow up next visit."
    r = client.post(
        f"/api/v1/movement/analyzer/patient/{pid}/annotation",
        headers=h,
        json={"note": note},
    )
    assert r.status_code == 200
    aud = client.get(f"/api/v1/movement/analyzer/patient/{pid}/audit", headers=h)
    assert aud.status_code == 200
    items = aud.json().get("items") or []
    assert any((it.get("action") == "annotate") for it in items)
