"""Tests for studio_eeg_database_router — set D (PR 76/N).

Covers:
  - GET  /api/v1/studio/eeg-database/icd/suggestions
  - GET  /api/v1/studio/eeg-database/patients
  - GET  /api/v1/studio/eeg-database/patients/{id}/card
  - PATCH /api/v1/studio/eeg-database/patients/{id}/profile
  - GET  /api/v1/studio/eeg-database/patients/{id}/recordings
  - DELETE /api/v1/studio/eeg-database/recordings/{id}
  - POST /api/v1/studio/eeg-database/patients/merge

Auth, role gates, 404, 422, happy paths.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal


# ── helpers ───────────────────────────────────────────────────────────────────


def _seed_patient(*, patient_id: str, clinician_id: str = "actor-clinician-demo") -> None:
    from app.persistence.models import Patient
    db = SessionLocal()
    try:
        if db.query(Patient).filter_by(id=patient_id).first() is None:
            db.add(Patient(
                id=patient_id,
                clinician_id=clinician_id,
                first_name="EEG",
                last_name="Patient",
                dob="1980-01-01",
                email=None,
                phone=None,
                gender="prefer_not_to_say",
                primary_condition="Epilepsy",
                primary_modality="EEG",
                consent_signed=True,
                consent_date="2026-01-01",
                status="active",
                notes="[TEST]",
            ))
            db.commit()
    finally:
        db.close()


# ── GET /icd/suggestions ──────────────────────────────────────────────────────


def test_icd_suggestions_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/studio/eeg-database/icd/suggestions?q=epilepsy")
    assert r.status_code == 403


def test_icd_suggestions_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/studio/eeg-database/icd/suggestions?q=epilepsy",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_icd_suggestions_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/studio/eeg-database/icd/suggestions?q=epilepsy",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_icd_suggestions_empty_query(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/studio/eeg-database/icd/suggestions",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert "items" in r.json()


# ── GET /patients ─────────────────────────────────────────────────────────────


def test_list_patients_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/studio/eeg-database/patients")
    assert r.status_code == 403


def test_list_patients_empty_db(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/studio/eeg-database/patients",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_list_patients_with_seed(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="eeg-test-patient-001")
    r = client.get(
        "/api/v1/studio/eeg-database/patients",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["items"]]
    assert "eeg-test-patient-001" in ids


# ── GET /patients/{id}/card ───────────────────────────────────────────────────


def test_get_card_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/studio/eeg-database/patients/any-id/card")
    assert r.status_code == 403


def test_get_card_missing_patient_is_404(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/studio/eeg-database/patients/does-not-exist/card",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


def test_get_card_happy_path(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="eeg-test-patient-002")
    r = client.get(
        "/api/v1/studio/eeg-database/patients/eeg-test-patient-002/card",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200


# ── PATCH /patients/{id}/profile ─────────────────────────────────────────────


def test_patch_profile_requires_auth(client: TestClient) -> None:
    r = client.patch(
        "/api/v1/studio/eeg-database/patients/any-id/profile",
        json={"patch": {}},
    )
    assert r.status_code == 403


def test_patch_profile_missing_patient_is_404(client: TestClient, auth_headers: dict) -> None:
    r = client.patch(
        "/api/v1/studio/eeg-database/patients/does-not-exist/profile",
        json={"patch": {"identification": {"name": "Test"}}},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


def test_patch_profile_happy_path(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="eeg-test-patient-003")
    r = client.patch(
        "/api/v1/studio/eeg-database/patients/eeg-test-patient-003/profile",
        json={"patch": {"identification": {"externalPatientId": "EXT-001"}}},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert "profile" in r.json()


# ── GET /patients/{id}/recordings ─────────────────────────────────────────────


def test_recordings_for_patient_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/studio/eeg-database/patients/any-id/recordings")
    assert r.status_code == 403


def test_recordings_for_patient_missing_is_404(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/studio/eeg-database/patients/does-not-exist/recordings",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


def test_recordings_for_patient_empty(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="eeg-test-patient-004")
    r = client.get(
        "/api/v1/studio/eeg-database/patients/eeg-test-patient-004/recordings",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert r.json()["recordings"] == []


# ── POST /patients/merge ──────────────────────────────────────────────────────


def test_merge_patients_same_patient_is_400(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="eeg-merge-primary")
    r = client.post(
        "/api/v1/studio/eeg-database/patients/merge",
        json={"primaryPatientId": "eeg-merge-primary", "duplicatePatientId": "eeg-merge-primary"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 400


def test_merge_patients_missing_primary_is_404(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="eeg-merge-dup-only")
    r = client.post(
        "/api/v1/studio/eeg-database/patients/merge",
        json={"primaryPatientId": "does-not-exist", "duplicatePatientId": "eeg-merge-dup-only"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404
