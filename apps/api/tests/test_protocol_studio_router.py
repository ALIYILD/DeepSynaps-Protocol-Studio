from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User


def _seed_two_clinics_with_patient() -> dict[str, str]:
    """Seed two clinics + two clinicians + one patient (clinic A)."""
    db = SessionLocal()
    try:
        clinic_a = Clinic(id="clinic-ps-a", name="PS Clinic A")
        clinic_b = Clinic(id="clinic-ps-b", name="PS Clinic B")
        db.add_all([clinic_a, clinic_b])
        db.flush()

        clinician_a = User(
            id="actor-ps-clin-a",
            email="clin_a@example.com",
            display_name="Clin A",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_a.id,
        )
        clinician_b = User(
            id="actor-ps-clin-b",
            email="clin_b@example.com",
            display_name="Clin B",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_b.id,
        )
        db.add_all([clinician_a, clinician_b])
        db.flush()

        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clinician_a.id,
            first_name="Pat",
            last_name="A",
            dob="2000-01-01",
            gender="female",
            primary_condition="mdd",
            status="active",
            consent_signed=True,
            consent_date="2026-01-01",
        )
        db.add(patient)
        db.commit()
        return {"patient_id": patient.id, "clinician_a": clinician_a.id, "clinician_b": clinician_b.id}
    finally:
        db.close()


def test_protocol_studio_evidence_health_structured(client: TestClient, auth_headers: dict) -> None:
    res = client.get("/api/v1/protocol-studio/evidence/health", headers=auth_headers["clinician"])
    assert res.status_code == 200
    body = res.json()
    assert set(body.keys()) >= {
        "local_evidence_available",
        "local_count",
        "live_literature_available",
        "vector_search_available",
        "fallback_mode",
        "last_checked",
        "safe_user_message",
    }
    assert body["fallback_mode"] in ("local_only", "keyword_fallback", "unavailable")


def test_protocol_studio_evidence_search_unavailable_is_honest(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    # Force evidence unavailable so we never "fake papers".
    monkeypatch.setenv("EVIDENCE_DB_PATH", "/tmp/does-not-exist-evidence.db")
    res = client.get("/api/v1/protocol-studio/evidence/search?q=tms", headers=auth_headers["clinician"])
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "unavailable"
    assert body["results"] == []


def test_protocol_catalog_has_required_safety_fields(client: TestClient, auth_headers: dict) -> None:
    res = client.get("/api/v1/protocol-studio/protocols?limit=10", headers=auth_headers["clinician"])
    assert res.status_code == 200
    data = res.json()
    assert "items" in data and "total" in data
    for item in data["items"]:
        assert item["clinician_review_required"] is True
        assert item["not_autonomous_prescription"] is True
        # Off-label must carry a warning.
        if item["off_label"] is True:
            assert item["off_label_warning"]


def test_patient_context_requires_auth(client: TestClient) -> None:
    res = client.get("/api/v1/protocol-studio/patients/pt-does-not-matter/context")
    # unauthenticated -> actor is guest -> clinician role required
    assert res.status_code in (401, 403)


def test_patient_context_cross_clinic_blocked(client: TestClient) -> None:
    seeded = _seed_two_clinics_with_patient()

    # Forge a clinician token by reusing demo token mechanism: in test env, demo
    # actor's clinic_id is pulled from DB if user row exists. We can seed the
    # demo clinician into clinic B for this test.
    db = SessionLocal()
    try:
        demo = db.query(User).filter_by(id="actor-clinician-demo").first()
        assert demo is not None
        demo.clinic_id = "clinic-ps-b"
        db.commit()
    finally:
        db.close()

    res = client.get(
        f"/api/v1/protocol-studio/patients/{seeded['patient_id']}/context",
        headers={"Authorization": "Bearer clinician-demo-token"},
    )
    assert res.status_code == 403
    body = res.json()
    assert body.get("code") == "cross_clinic_access_denied"

