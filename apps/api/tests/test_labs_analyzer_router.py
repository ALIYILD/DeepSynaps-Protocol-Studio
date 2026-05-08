"""Labs analyzer router — auth, IDOR, payload shape."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import PatientLabResult
from app.persistence.models import Clinic, Patient, User
from app.services.auth_service import create_access_token


def _mint_token(user_id: str, role: str, clinic_id: str | None) -> str:
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed(db: Session) -> dict[str, Any]:
    clinic_a = Clinic(id=str(uuid.uuid4()), name="Labs Clinic A")
    clinic_b = Clinic(id=str(uuid.uuid4()), name="Labs Clinic B")
    db.add_all([clinic_a, clinic_b])
    db.flush()

    clin_a = User(
        id=str(uuid.uuid4()),
        email=f"lab_clin_a_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Clin A",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_a.id,
    )
    clin_b = User(
        id=str(uuid.uuid4()),
        email=f"lab_clin_b_{uuid.uuid4().hex[:6]}@example.com",
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
        first_name="Lab",
        last_name="Patient",
    )
    db.add(patient)
    db.commit()

    return {
        "clinic_a_id": clinic_a.id,
        "clinic_b_id": clinic_b.id,
        "clin_a_id": clin_a.id,
        "clin_b_id": clin_b.id,
        "patient_id": patient.id,
        "token_a": _mint_token(clin_a.id, "clinician", clinic_a.id),
        "token_b": _mint_token(clin_b.id, "clinician", clinic_b.id),
    }


@pytest.fixture
def labs_setup(client: TestClient) -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        return _seed(db)
    finally:
        db.close()


def test_guest_blocked_from_labs_payload(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    resp = client.get(
        f"/api/v1/labs/analyzer/patient/{pid}",
        headers={"Authorization": "Bearer guest-demo-token"},
    )
    assert resp.status_code in (401, 403), resp.text


def test_clinician_b_cannot_read_clinician_a_patient(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    resp = client.get(
        f"/api/v1/labs/analyzer/patient/{pid}",
        headers=_auth(labs_setup["token_b"]),
    )
    assert resp.status_code == 403, resp.text


def test_labs_payload_shape(client: TestClient, labs_setup: dict[str, Any]) -> None:
    pid = labs_setup["patient_id"]
    resp = client.get(
        f"/api/v1/labs/analyzer/patient/{pid}",
        headers=_auth(labs_setup["token_a"]),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # PR #457 frontend contract (simple top-level shape)
    assert data["patient_id"] == pid
    assert "captured_at" in data
    assert "panels" in data and isinstance(data["panels"], list)
    assert "flags" in data and isinstance(data["flags"], list)
    # Rich payload retained as additive fields
    assert "lab_snapshot" in data
    assert "domain_summaries" in data
    assert "results" in data
    assert isinstance(data["results"], list)


def test_recompute_and_audit(client: TestClient, labs_setup: dict[str, Any]) -> None:
    pid = labs_setup["patient_id"]
    headers = _auth(labs_setup["token_a"])
    r1 = client.post(
        f"/api/v1/labs/analyzer/patient/{pid}/recompute",
        headers=headers,
        json={"reason": "manual"},
    )
    assert r1.status_code == 200, r1.text
    r2 = client.get(f"/api/v1/labs/analyzer/patient/{pid}/audit", headers=headers)
    assert r2.status_code == 200, r2.text
    audit = r2.json()
    assert audit["patient_id"] == pid
    assert isinstance(audit["items"], list)
    # Audit items now match PR #457 frontend shape:
    # { id, kind, actor, message, created_at }
    kinds = {i["kind"] for i in audit["items"]}
    assert "recompute" in kinds
    for item in audit["items"]:
        assert {"id", "kind", "actor", "message", "created_at"}.issubset(item.keys())


def test_labs_clinic_summary_visible_to_same_clinic(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/labs/analyzer/clinic/summary",
        headers=_auth(labs_setup["token_a"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    patient_ids = {p["patient_id"] for p in body["patients"]}
    assert labs_setup["patient_id"] in patient_ids


def test_labs_clinic_summary_hides_other_clinic(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/labs/analyzer/clinic/summary",
        headers=_auth(labs_setup["token_b"]),
    )
    assert resp.status_code == 200, resp.text
    patient_ids = {p["patient_id"] for p in resp.json()["patients"]}
    assert labs_setup["patient_id"] not in patient_ids


def test_labs_result_insert_accepts_valid_iso_sample_time(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    resp = client.post(
        f"/api/v1/labs/analyzer/patient/{pid}/results",
        headers=_auth(labs_setup["token_a"]),
        json={
            "analyte": "Vitamin D",
            "value": 31.2,
            "unit": "ng/mL",
            "sample_collected_at": "2026-05-06T09:30:00Z",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["inserted"] == 1
    assert body["kind"] == "result-add"


def test_labs_result_insert_rejects_invalid_sample_time(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    resp = client.post(
        f"/api/v1/labs/analyzer/patient/{pid}/results",
        headers=_auth(labs_setup["token_a"]),
        json={
            "analyte": "Vitamin D",
            "value": 31.2,
            "unit": "ng/mL",
            "sample_collected_at": "not-a-date",
        },
    )
    assert resp.status_code == 422, resp.text
    assert "sample_collected_at" in resp.text


def test_labs_result_insert_trims_optional_strings_before_persist(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    resp = client.post(
        f"/api/v1/labs/analyzer/patient/{pid}/results",
        headers=_auth(labs_setup["token_a"]),
        json={
            "analyte": "Vitamin D",
            "value": 31.2,
            "unit": "   ",
            "panel": "   ",
            "value_text": "   borderline low   ",
            "ref_text": "   monitor trend   ",
            "source": "   ",
        },
    )
    assert resp.status_code == 200, resp.text

    db = SessionLocal()
    try:
        row = (
            db.query(PatientLabResult)
            .filter(PatientLabResult.patient_id == pid)
            .order_by(PatientLabResult.created_at.desc())
            .first()
        )
        assert row is not None
        assert row.panel_name is None
        assert row.unit_ucum is None
        assert row.value_text == "borderline low"
        assert row.ref_text == "monitor trend"
        assert row.source == "manual"
    finally:
        db.close()


def test_labs_result_insert_blank_analyte_code_falls_back_to_display_slug(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    resp = client.post(
        f"/api/v1/labs/analyzer/patient/{pid}/results",
        headers=_auth(labs_setup["token_a"]),
        json={
            "analyte_code": "   ",
            "analyte_display_name": "Vitamin B12",
            "value_numeric": 412,
            "unit_ucum": "pg/mL",
        },
    )
    assert resp.status_code == 200, resp.text

    db = SessionLocal()
    try:
        row = (
            db.query(PatientLabResult)
            .filter(PatientLabResult.patient_id == pid)
            .order_by(PatientLabResult.created_at.desc())
            .first()
        )
        assert row is not None
        assert row.analyte_code == "vitamin_b12"
        assert row.analyte_display_name == "Vitamin B12"
    finally:
        db.close()


def test_labs_result_insert_normalizes_source_to_lowercase(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    resp = client.post(
        f"/api/v1/labs/analyzer/patient/{pid}/results",
        headers=_auth(labs_setup["token_a"]),
        json={
            "analyte": "Ferritin",
            "value": 84,
            "unit": "ng/mL",
            "source": "  Vendor_API  ",
        },
    )
    assert resp.status_code == 200, resp.text

    db = SessionLocal()
    try:
        row = (
            db.query(PatientLabResult)
            .filter(PatientLabResult.patient_id == pid)
            .order_by(PatientLabResult.created_at.desc())
            .first()
        )
        assert row is not None
        assert row.source == "vendor_api"
    finally:
        db.close()


def test_labs_result_insert_rejects_overlong_source(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    resp = client.post(
        f"/api/v1/labs/analyzer/patient/{pid}/results",
        headers=_auth(labs_setup["token_a"]),
        json={
            "analyte": "Ferritin",
            "value": 84,
            "unit": "ng/mL",
            "source": "vendor_api_label_that_exceeds_32_chars",
        },
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "source must be 32 characters or fewer"


def test_labs_result_insert_rejects_overlong_optional_metadata_fields(
    client: TestClient, labs_setup: dict[str, Any]
) -> None:
    pid = labs_setup["patient_id"]
    cases = [
        (
            {
                "analyte": "Ferritin",
                "value": 84,
                "panel": "P" * 256,
            },
            "panel_name must be 255 characters or fewer",
        ),
        (
            {
                "analyte": "Ferritin",
                "value_text": "V" * 256,
            },
            "value_text must be 255 characters or fewer",
        ),
        (
            {
                "analyte": "Ferritin",
                "unit": "U" * 65,
            },
            "unit_ucum must be 64 characters or fewer",
        ),
        (
            {
                "analyte": "Ferritin",
                "ref_text": "R" * 256,
            },
            "ref_text must be 255 characters or fewer",
        ),
    ]

    for payload, expected in cases:
        resp = client.post(
            f"/api/v1/labs/analyzer/patient/{pid}/results",
            headers=_auth(labs_setup["token_a"]),
            json=payload,
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == expected
