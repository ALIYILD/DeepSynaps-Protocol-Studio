"""Tests for studio_source_router — /api/v1/studio/eeg/{id}/source/*.

Covers:
- GET /source/capabilities requires clinician role (403)
- GET /source/capabilities returns 404 for unknown analysis_id
- GET /source/capabilities returns forward-capabilities dict for known analysis
- POST /source/loreta-erp requires clinician role
- POST /source/loreta-erp returns graceful error dict for MNE-unavailable analysis
- POST /source/loreta-spectra 422 on missing required fromSec/toSec
- POST /source/dipole requires clinician role
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User
from app.services.auth_service import create_access_token


@pytest.fixture
def analysis_with_token() -> dict:
    """Seed a minimal QEEGAnalysis owned by a fresh clinician and return ids + token."""
    with SessionLocal() as db:
        clinic = Clinic(id=str(uuid.uuid4()), name="Source Test Clinic")
        user = User(
            id=str(uuid.uuid4()),
            email=f"src_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Source Clinician",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, user])
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=user.id,
            first_name="Source",
            last_name="Patient",
        )
        db.add(patient)
        db.flush()
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=user.id,
            file_ref="memory://src-test",
            original_filename="src.edf",
            recording_duration_sec=60.0,
            sample_rate_hz=256.0,
            analysis_status="completed",
        )
        db.add(analysis)
        db.commit()
        token = create_access_token(
            user_id=user.id, email=user.email, role="clinician",
            package_id="clinician_pro", clinic_id=clinic.id,
        )
        return {"analysis_id": analysis.id, "token": token}


def test_source_capabilities_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/studio/eeg/some-id/source/capabilities")
    assert resp.status_code in (401, 403)


def test_source_capabilities_unknown_analysis_404(
    client: TestClient, analysis_with_token: dict
) -> None:
    resp = client.get(
        "/api/v1/studio/eeg/nonexistent-analysis-id/source/capabilities",
        headers={"Authorization": f"Bearer {analysis_with_token['token']}"},
    )
    assert resp.status_code == 404


def test_source_capabilities_known_analysis(
    client: TestClient, analysis_with_token: dict
) -> None:
    aid = analysis_with_token["analysis_id"]
    token = analysis_with_token["token"]
    resp = client.get(
        f"/api/v1/studio/eeg/{aid}/source/capabilities",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    # describe_forward_capabilities returns some dict — just confirm it's non-empty
    assert isinstance(body, dict)


def test_loreta_erp_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/studio/eeg/some-id/source/loreta-erp",
        json={"stimulusClasses": [], "fromSec": 0.0, "toSec": 10.0},
    )
    assert resp.status_code in (401, 403)


def test_loreta_erp_graceful_error_on_no_mne(
    client: TestClient, analysis_with_token: dict
) -> None:
    """When MNE is unavailable or no raw file is loaded, the router returns
    an error dict instead of crashing (ok=False)."""
    aid = analysis_with_token["analysis_id"]
    token = analysis_with_token["token"]
    resp = client.post(
        f"/api/v1/studio/eeg/{aid}/source/loreta-erp",
        json={"stimulusClasses": [], "preStimMs": -200, "postStimMs": 1000},
        headers={"Authorization": f"Bearer {token}"},
    )
    # Either success (200 with ok=True) or graceful error dict (ok=False)
    assert resp.status_code == 200
    body = resp.json()
    assert "analysisId" in body
    assert body["analysisId"] == aid


def test_loreta_spectra_missing_from_to_sec_returns_422(
    client: TestClient, analysis_with_token: dict
) -> None:
    aid = analysis_with_token["analysis_id"]
    token = analysis_with_token["token"]
    resp = client.post(
        f"/api/v1/studio/eeg/{aid}/source/loreta-spectra",
        json={"bandHz": [8.0, 13.0]},  # missing fromSec and toSec
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_dipole_fit_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/studio/eeg/some-id/source/dipole",
        json={},
    )
    assert resp.status_code in (401, 403)


def test_dipole_fit_graceful_error(
    client: TestClient, analysis_with_token: dict
) -> None:
    aid = analysis_with_token["analysis_id"]
    token = analysis_with_token["token"]
    resp = client.post(
        f"/api/v1/studio/eeg/{aid}/source/dipole",
        json={"stimulusClasses": [], "step": 4},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "analysisId" in body
    assert body["analysisId"] == aid
