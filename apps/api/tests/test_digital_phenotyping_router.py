"""Tests for Digital Phenotyping Analyzer router (auth, consent persistence)."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import DigitalPhenotypingAudit, DigitalPhenotypingPatientState


@pytest.fixture()
def client():
    from app.main import app

    return TestClient(app)


@pytest.fixture
def clinician_headers(client: TestClient) -> dict[str, str]:
    uid = uuid.uuid4().hex[:12]
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"dpa_router_clinician_{uid}@example.com",
            "display_name": "DPA Router Test",
            "password": "TestPass123!",
            "role": "clinician",
        },
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def patient_id(client: TestClient, clinician_headers: dict[str, str]) -> str:
    uid = uuid.uuid4().hex[:12]
    resp = client.post(
        "/api/v1/patients",
        json={
            "first_name": "DPA",
            "last_name": "Patient",
            "dob": "1991-06-01",
            "gender": "F",
            "email": f"dpa_patient_{uid}@example.com",
            "primary_condition": "MDD",
        },
        headers=clinician_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_digital_phenotyping_get_requires_auth(client: TestClient):
    res = client.get("/api/v1/digital-phenotyping/analyzer/patient/some-patient-id")
    assert res.status_code == 401


def test_digital_phenotyping_audit_requires_auth(client: TestClient):
    res = client.get("/api/v1/digital-phenotyping/analyzer/patient/some-patient-id/audit")
    assert res.status_code == 401


def test_digital_phenotyping_consent_persisted(
    client: TestClient,
    clinician_headers: dict[str, str],
    patient_id: str,
) -> None:
    """POST consent merges domains; GET reflects withheld domains."""
    h = clinician_headers
    pid = patient_id

    res = client.post(
        f"/api/v1/digital-phenotyping/analyzer/patient/{pid}/consent",
        json={
            "domains": {"screen_use": False, "location_mobility": False},
            "consent_scope_version": "2026.04",
        },
        headers=h,
    )
    assert res.status_code == 200, res.text

    out = client.get(f"/api/v1/digital-phenotyping/analyzer/patient/{pid}", headers=h)
    assert out.status_code == 200, out.text
    data = out.json()
    assert data["consent_state"]["domains_enabled"]["screen_use"] is False
    snap = data["snapshot"]["screen_time_pattern"]
    assert snap.get("value") is None

    db = SessionLocal()
    try:
        st = db.query(DigitalPhenotypingPatientState).filter_by(patient_id=pid).first()
        assert st is not None
        aud = db.query(DigitalPhenotypingAudit).filter_by(patient_id=pid).all()
        assert len(aud) >= 2
    finally:
        db.close()
