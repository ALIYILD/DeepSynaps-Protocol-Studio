"""Tests for Medication Analyzer API (``/api/v1/medications/analyzer``)."""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Patient, PatientMedication
from app.routers import medication_analyzer_router as mar_mod


@pytest.fixture(autouse=True)
def _clear_analyzer_stores() -> None:
    mar_mod._ANALYZER_AUDIT.clear()
    mar_mod._REVIEW_NOTES.clear()
    yield
    mar_mod._ANALYZER_AUDIT.clear()
    mar_mod._REVIEW_NOTES.clear()


def _seed_patient_and_meds(patient_id: str | None = None) -> str:
    pid = patient_id or str(uuid.uuid4())
    db = SessionLocal()
    try:
        db.add(
            Patient(
                id=pid,
                clinician_id="actor-clinician-demo",
                first_name="Med",
                last_name="AnalyzerTest",
                email=f"medtest-{pid[:8]}@example.com",
                consent_signed=True,
                status="active",
            )
        )
        db.add(
            PatientMedication(
                patient_id=pid,
                clinician_id="actor-clinician-demo",
                name="sertraline",
                generic_name="sertraline",
                drug_class="ssri",
                dose="50 mg",
                frequency="daily",
                route="oral",
                indication="MDD",
                active=True,
                started_at="2025-01-01",
            )
        )
        db.add(
            PatientMedication(
                patient_id=pid,
                clinician_id="actor-clinician-demo",
                name="tramadol",
                generic_name="tramadol",
                drug_class="opioid analgesic",
                dose="50 mg",
                frequency="prn",
                route="oral",
                active=True,
                started_at="2025-02-01",
            )
        )
        db.commit()
    finally:
        db.close()
    return pid


def test_analyzer_get_requires_auth(client: TestClient) -> None:
    r = client.get(f"/api/v1/medications/analyzer/patient/{uuid.uuid4()}")
    assert r.status_code == 401


def test_analyzer_payload_contains_schema_and_snapshot(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    r = client.get(
        f"/api/v1/medications/analyzer/patient/{pid}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["schema_version"] == "1.0"
    assert data["patient_id"] == pid
    assert "snapshot" in data
    assert data["snapshot"]["polypharmacy"]["active_count"] == 2
    assert len(data["safety_alerts"]) >= 1
    assert any(a.get("category") == "drug_drug" for a in data["safety_alerts"])


def test_analyzer_review_note_and_audit(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    note = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/review-note",
        headers=auth_headers["clinician"],
        json={"note_text": "Reviewed interactions — chart verified.", "linked_recommendation_ids": []},
    )
    assert note.status_code == 200, note.text
    body = note.json()
    assert body.get("note_id")

    aud = client.get(
        f"/api/v1/medications/analyzer/patient/{pid}/audit",
        headers=auth_headers["clinician"],
    )
    assert aud.status_code == 200
    entries = aud.json().get("entries", [])
    assert any(e.get("action") == "review_note" for e in entries)


def test_analyzer_recompute(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    r = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/recompute",
        headers=auth_headers["clinician"],
        json={"force": True},
    )
    assert r.status_code == 200
    assert r.json().get("status") == "complete"
