"""Nutrition analyzer router — auth, IDOR-ish gate, GET JSON shape."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, NutritionAnalyzerAudit, Patient, PatientSupplement, User


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
        "evidence_pack",
        "ai_interpretation",
        "audit_events",
    ):
        assert key in data
    assert data["diet"]["provenance"] == "no_logs_default"
    assert data["diet"]["logging_coverage_pct"] == 0.0
    assert all(card["provenance"] != "stub" for card in data["snapshot"])
    assert all(item.get("provenance") != "stub" for item in data["recommendations"])
    assert all(item.get("provenance") != "stub" for item in data["ai_interpretation"])


def test_clinician_get_audit_list(client: TestClient, nutrition_setup: dict[str, Any]) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.get(f"/api/v1/nutrition/analyzer/patient/{pid}/audit", headers=hdr)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "items" in data and "total" in data
    assert data["items"] == []


def test_diet_log_rejects_invalid_log_day(client: TestClient, nutrition_setup: dict[str, Any]) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.post(
        f"/api/v1/nutrition/analyzer/patient/{pid}/diet-log",
        headers=hdr,
        json={"log_day": "07/04/2026"},
    )
    assert resp.status_code == 422, resp.text
    assert "ISO date" in resp.json()["message"]


def test_supplement_rejects_invalid_started_at(client: TestClient, nutrition_setup: dict[str, Any]) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.post(
        f"/api/v1/nutrition/analyzer/patient/{pid}/supplement",
        headers=hdr,
        json={"name": "Vitamin D", "started_at": "tomorrow-ish"},
    )
    assert resp.status_code == 422, resp.text
    assert "ISO date or datetime" in resp.json()["message"]


def test_supplement_rejects_overlong_name(client: TestClient, nutrition_setup: dict[str, Any]) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.post(
        f"/api/v1/nutrition/analyzer/patient/{pid}/supplement",
        headers=hdr,
        json={"name": "N" * 256},
    )
    assert resp.status_code == 422, resp.text
    assert "255 characters or fewer" in resp.json()["message"]


def test_supplement_rejects_overlong_dose(client: TestClient, nutrition_setup: dict[str, Any]) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.post(
        f"/api/v1/nutrition/analyzer/patient/{pid}/supplement",
        headers=hdr,
        json={"name": "Vitamin D", "dose": "D" * 121},
    )
    assert resp.status_code == 422, resp.text
    assert "120 characters or fewer" in resp.json()["message"]


def test_supplement_rejects_overlong_frequency(client: TestClient, nutrition_setup: dict[str, Any]) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.post(
        f"/api/v1/nutrition/analyzer/patient/{pid}/supplement",
        headers=hdr,
        json={"name": "Vitamin D", "frequency": "F" * 121},
    )
    assert resp.status_code == 422, resp.text
    assert "120 characters or fewer" in resp.json()["message"]


def test_supplement_trims_optional_text_fields_before_persist(
    client: TestClient, nutrition_setup: dict[str, Any],
) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.post(
        f"/api/v1/nutrition/analyzer/patient/{pid}/supplement",
        headers=hdr,
        json={
            "name": "  Vitamin D  ",
            "dose": "  2000 IU  ",
            "frequency": "  daily  ",
            "notes": "  after breakfast  ",
            "started_at": " 2026-05-06 ",
        },
    )
    assert resp.status_code == 200, resp.text

    db: Session = SessionLocal()
    try:
        row = (
            db.query(PatientSupplement)
            .filter(PatientSupplement.patient_id == pid)
            .order_by(PatientSupplement.created_at.desc())
            .first()
        )
        assert row is not None
        assert row.name == "Vitamin D"
        assert row.dose == "2000 IU"
        assert row.frequency == "daily"
        assert row.notes == "after breakfast"
        assert row.started_at == "2026-05-06"
    finally:
        db.close()


def test_supplement_normalizes_offset_datetime_started_at_before_persist(
    client: TestClient, nutrition_setup: dict[str, Any],
) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    resp = client.post(
        f"/api/v1/nutrition/analyzer/patient/{pid}/supplement",
        headers=hdr,
        json={
            "name": "Vitamin D",
            "started_at": " 2026-05-06T09:30:00+02:00 ",
        },
    )
    assert resp.status_code == 200, resp.text

    db: Session = SessionLocal()
    try:
        row = (
            db.query(PatientSupplement)
            .filter(PatientSupplement.patient_id == pid)
            .order_by(PatientSupplement.created_at.desc())
            .first()
        )
        assert row is not None
        assert row.started_at == "2026-05-06T07:30:00Z"
    finally:
        db.close()


def test_review_note_persists_full_trimmed_message(
    client: TestClient, nutrition_setup: dict[str, Any]
) -> None:
    pid = nutrition_setup["patient_id"]
    hdr = {"Authorization": f"Bearer {nutrition_setup['token_a']}"}
    note = "  " + ("A" * 4505) + "  "
    resp = client.post(
        f"/api/v1/nutrition/analyzer/patient/{pid}/review-note",
        headers=hdr,
        json={"note": note},
    )
    assert resp.status_code == 200, resp.text

    db: Session = SessionLocal()
    try:
        row = (
            db.query(NutritionAnalyzerAudit)
            .filter(
                NutritionAnalyzerAudit.patient_id == pid,
                NutritionAnalyzerAudit.event_type == "review_note",
            )
            .order_by(NutritionAnalyzerAudit.created_at.desc())
            .first()
        )
        assert row is not None
        assert row.message == ("A" * 4505)
    finally:
        db.close()
