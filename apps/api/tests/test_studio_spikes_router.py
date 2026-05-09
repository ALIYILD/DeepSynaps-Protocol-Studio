"""Tests for studio_spikes_router — /api/v1/studio/eeg spike endpoints (M11).

Endpoints catch all exceptions and return {"ok": False, ...} so we pin that
contract, plus auth and 404 behaviour.
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User
from app.services.auth_service import create_access_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def analysis_ctx():
    db = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Spikes Test Clinic")
        clin = User(
            id=str(uuid.uuid4()),
            email=f"spk_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Spikes Clinician",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clin])
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin.id,
            first_name="Sp",
            last_name="Ike",
        )
        db.add(patient)
        db.flush()
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=clin.id,
            file_ref="memory://spikes-test",
            original_filename="rec.edf",
            file_size_bytes=1024,
            recording_duration_sec=120.0,
            sample_rate_hz=256.0,
            channel_count=3,
            channels_json='["Fp1","Fp2","Cz"]',
            recording_date="2026-01-01",
            eyes_condition="closed",
            equipment="demo",
            analysis_status="completed",
        )
        db.add(analysis)
        db.commit()
        token = create_access_token(
            user_id=clin.id,
            email=clin.email,
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clin.clinic_id,
        )
        return {"analysis_id": analysis.id, "token": token}
    finally:
        db.close()


def _auth(ctx):
    return {"Authorization": f"Bearer {ctx['token']}"}


# ---------------------------------------------------------------------------
# Tests: spikes/capabilities
# ---------------------------------------------------------------------------

def test_spikes_capabilities_ok(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.get(f"/api/v1/studio/eeg/{aid}/spikes/capabilities", headers=_auth(analysis_ctx))
    assert r.status_code == 200
    body = r.json()
    assert body["analysisId"] == aid
    assert "defaults" in body
    assert "ai" in body


def test_spikes_capabilities_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.get(f"/api/v1/studio/eeg/{aid}/spikes/capabilities")
    assert r.status_code in (401, 403)


def test_spikes_capabilities_not_found(client: TestClient, analysis_ctx) -> None:
    r = client.get(
        "/api/v1/studio/eeg/no-such-id/spikes/capabilities",
        headers=_auth(analysis_ctx),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tests: spikes/detect
# ---------------------------------------------------------------------------

def test_spikes_detect_graceful_on_mne_missing(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    from app.routers import studio_spikes_router

    with patch.object(studio_spikes_router, "_require_mne", side_effect=RuntimeError("mne unavailable")):
        r = client.post(
            f"/api/v1/studio/eeg/{aid}/spikes/detect",
            headers=_auth(analysis_ctx),
            json={"fromSec": 0.0, "toSec": 10.0},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["analysisId"] == aid
    assert "spikes" in body


def test_spikes_detect_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/spikes/detect",
        json={"fromSec": 0.0, "toSec": 10.0},
    )
    assert r.status_code in (401, 403)


def test_spikes_detect_validation_error_missing_required(client: TestClient, analysis_ctx) -> None:
    """fromSec and toSec are required; omitting returns 422."""
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/spikes/detect",
        headers=_auth(analysis_ctx),
        json={},
    )
    assert r.status_code == 422


def test_spikes_detect_not_found(client: TestClient, analysis_ctx) -> None:
    r = client.post(
        "/api/v1/studio/eeg/ghost/spikes/detect",
        headers=_auth(analysis_ctx),
        json={"fromSec": 0.0, "toSec": 5.0},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tests: spikes/average
# ---------------------------------------------------------------------------

def test_spikes_average_graceful_error(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    from app.routers import studio_spikes_router

    with patch.object(studio_spikes_router, "_require_mne", side_effect=RuntimeError("no mne")):
        r = client.post(
            f"/api/v1/studio/eeg/{aid}/spikes/average",
            headers=_auth(analysis_ctx),
            json={"peaks": [{"peakSec": 1.0, "channel": "Fp1"}]},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["analysisId"] == aid


def test_spikes_average_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/spikes/average",
        json={"peaks": []},
    )
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Tests: spikes/dipole-at-peak
# ---------------------------------------------------------------------------

def test_spikes_dipole_at_peak_graceful_error(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    from app.routers import studio_spikes_router

    with patch.object(studio_spikes_router, "_require_mne", side_effect=RuntimeError("no mne")):
        r = client.post(
            f"/api/v1/studio/eeg/{aid}/spikes/dipole-at-peak",
            headers=_auth(analysis_ctx),
            json={"peakSec": 1.5},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["analysisId"] == aid


def test_spikes_dipole_at_peak_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/spikes/dipole-at-peak",
        json={"peakSec": 1.5},
    )
    assert r.status_code in (401, 403)


def test_spikes_dipole_at_peak_validation_missing_required(client: TestClient, analysis_ctx) -> None:
    """peakSec is required."""
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/spikes/dipole-at-peak",
        headers=_auth(analysis_ctx),
        json={},
    )
    assert r.status_code == 422
