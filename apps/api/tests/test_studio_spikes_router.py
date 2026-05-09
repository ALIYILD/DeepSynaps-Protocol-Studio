"""Tests for studio_spikes_router — /api/v1/studio/eeg/{id}/spikes/*.

Covers:
- GET /spikes/capabilities requires clinician role (403)
- GET /spikes/capabilities returns 404 for unknown analysis_id
- GET /spikes/capabilities returns defaults dict for known analysis
- POST /spikes/detect requires clinician role
- POST /spikes/detect returns graceful error dict (MNE unavailable / no raw)
- POST /spikes/detect 422 on missing fromSec/toSec
- POST /spikes/average requires clinician role
- POST /spikes/dipole-at-peak requires clinician role
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User
from app.services.auth_service import create_access_token


@pytest.fixture
def spikes_analysis() -> dict:
    """Seed a minimal QEEGAnalysis and return ids + token."""
    with SessionLocal() as db:
        clinic = Clinic(id=str(uuid.uuid4()), name="Spikes Test Clinic")
        user = User(
            id=str(uuid.uuid4()),
            email=f"spk_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Spikes Clinician",
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
            first_name="Spikes",
            last_name="Patient",
        )
        db.add(patient)
        db.flush()
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=user.id,
            file_ref="memory://spikes-test",
            original_filename="spikes.edf",
            recording_duration_sec=120.0,
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


def test_spikes_capabilities_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/studio/eeg/some-id/spikes/capabilities")
    assert resp.status_code in (401, 403)


def test_spikes_capabilities_unknown_analysis_404(
    client: TestClient, spikes_analysis: dict
) -> None:
    resp = client.get(
        "/api/v1/studio/eeg/nonexistent-id/spikes/capabilities",
        headers={"Authorization": f"Bearer {spikes_analysis['token']}"},
    )
    assert resp.status_code == 404


def test_spikes_capabilities_known_analysis(
    client: TestClient, spikes_analysis: dict
) -> None:
    aid = spikes_analysis["analysis_id"]
    token = spikes_analysis["token"]
    resp = client.get(
        f"/api/v1/studio/eeg/{aid}/spikes/capabilities",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysisId"] == aid
    assert "defaults" in body
    assert "ai" in body
    defaults = body["defaults"]
    assert "ampUvMin" in defaults


def test_spikes_detect_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/studio/eeg/some-id/spikes/detect",
        json={"fromSec": 0.0, "toSec": 10.0},
    )
    assert resp.status_code in (401, 403)


def test_spikes_detect_missing_required_fields_422(
    client: TestClient, spikes_analysis: dict
) -> None:
    aid = spikes_analysis["analysis_id"]
    token = spikes_analysis["token"]
    # Missing fromSec and toSec
    resp = client.post(
        f"/api/v1/studio/eeg/{aid}/spikes/detect",
        json={"ampUvMin": 70.0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_spikes_detect_graceful_error(
    client: TestClient, spikes_analysis: dict
) -> None:
    """With no real EDF on disk the pipeline errors gracefully (ok=False)."""
    aid = spikes_analysis["analysis_id"]
    token = spikes_analysis["token"]
    resp = client.post(
        f"/api/v1/studio/eeg/{aid}/spikes/detect",
        json={"fromSec": 0.0, "toSec": 30.0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "analysisId" in body
    assert body["analysisId"] == aid
    # Either ok=True (empty spikes) or ok=False (error) — never a crash
    assert "spikes" in body
    assert isinstance(body["spikes"], list)


def test_spikes_average_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/studio/eeg/some-id/spikes/average",
        json={"peaks": []},
    )
    assert resp.status_code in (401, 403)


def test_spikes_dipole_at_peak_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/studio/eeg/some-id/spikes/dipole-at-peak",
        json={"peakSec": 1.5},
    )
    assert resp.status_code in (401, 403)


def test_spikes_dipole_at_peak_missing_peak_sec_422(
    client: TestClient, spikes_analysis: dict
) -> None:
    aid = spikes_analysis["analysis_id"]
    token = spikes_analysis["token"]
    resp = client.post(
        f"/api/v1/studio/eeg/{aid}/spikes/dipole-at-peak",
        json={},  # missing peakSec
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
