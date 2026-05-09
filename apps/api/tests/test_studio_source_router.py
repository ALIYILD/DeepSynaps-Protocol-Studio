"""Tests for studio_source_router — /api/v1/studio/eeg source-localisation endpoints (M10).

All three compute endpoints (loreta-erp, loreta-spectra, dipole) catch exceptions
and return {"ok": False, ...} rather than raising, so we test that contract
as well. The capabilities endpoint is purely data and needs no mocking.
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
        clinic = Clinic(id=str(uuid.uuid4()), name="Source Test Clinic")
        clin = User(
            id=str(uuid.uuid4()),
            email=f"src_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Source Clinician",
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
            first_name="S",
            last_name="Rc",
        )
        db.add(patient)
        db.flush()
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=clin.id,
            file_ref="memory://source-test",
            original_filename="rec.edf",
            file_size_bytes=1024,
            recording_duration_sec=60.0,
            sample_rate_hz=256.0,
            channel_count=2,
            channels_json='["Fp1","Cz"]',
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
# Tests: capabilities
# ---------------------------------------------------------------------------

def test_source_capabilities_ok(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    from app.source.forward import describe_forward_capabilities
    with patch("app.source.forward.describe_forward_capabilities", return_value={"mesh": "fsaverage"}):
        r = client.get(f"/api/v1/studio/eeg/{aid}/source/capabilities", headers=_auth(analysis_ctx))
    assert r.status_code == 200


def test_source_capabilities_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.get(f"/api/v1/studio/eeg/{aid}/source/capabilities")
    assert r.status_code in (401, 403)


def test_source_capabilities_not_found(client: TestClient, analysis_ctx) -> None:
    r = client.get(
        "/api/v1/studio/eeg/no-such-analysis/source/capabilities",
        headers=_auth(analysis_ctx),
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tests: loreta-erp (compute endpoint — exception path → ok:False)
# ---------------------------------------------------------------------------

def test_loreta_erp_graceful_error_on_missing_mne(client: TestClient, analysis_ctx) -> None:
    """When MNE is unavailable, the endpoint returns ok:False rather than 500."""
    aid = analysis_ctx["analysis_id"]
    from app.routers import studio_source_router

    with patch.object(studio_source_router, "_require_mne", side_effect=RuntimeError("mne not installed")):
        r = client.post(
            f"/api/v1/studio/eeg/{aid}/source/loreta-erp",
            headers=_auth(analysis_ctx),
            json={"stimulusClasses": [], "preStimMs": -200, "postStimMs": 800,
                  "baselineFromMs": -200, "baselineToMs": 0},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["analysisId"] == aid


def test_loreta_erp_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/source/loreta-erp",
        json={"stimulusClasses": [], "preStimMs": -200, "postStimMs": 800,
              "baselineFromMs": -200, "baselineToMs": 0},
    )
    assert r.status_code in (401, 403)


def test_loreta_erp_not_found(client: TestClient, analysis_ctx) -> None:
    r = client.post(
        "/api/v1/studio/eeg/ghost-id/source/loreta-erp",
        headers=_auth(analysis_ctx),
        json={"stimulusClasses": [], "preStimMs": -200, "postStimMs": 800,
              "baselineFromMs": -200, "baselineToMs": 0},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tests: loreta-spectra
# ---------------------------------------------------------------------------

def test_loreta_spectra_graceful_error(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    from app.routers import studio_source_router

    with patch.object(studio_source_router, "_require_mne", side_effect=RuntimeError("no mne")):
        r = client.post(
            f"/api/v1/studio/eeg/{aid}/source/loreta-spectra",
            headers=_auth(analysis_ctx),
            json={"stimulusClasses": [], "preStimMs": -200, "postStimMs": 800,
                  "baselineFromMs": -200, "baselineToMs": 0,
                  "bandHz": [8, 13], "fromSec": 0.0, "toSec": 10.0},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False


def test_loreta_spectra_validation_error_missing_required(client: TestClient, analysis_ctx) -> None:
    """fromSec and toSec are required; omitting them triggers 422."""
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/source/loreta-spectra",
        headers=_auth(analysis_ctx),
        json={"stimulusClasses": []},  # missing fromSec/toSec
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Tests: dipole
# ---------------------------------------------------------------------------

def test_dipole_graceful_error(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    from app.routers import studio_source_router

    with patch.object(studio_source_router, "_require_mne", side_effect=RuntimeError("no mne")):
        r = client.post(
            f"/api/v1/studio/eeg/{aid}/source/dipole",
            headers=_auth(analysis_ctx),
            json={"stimulusClasses": [], "preStimMs": -200, "postStimMs": 800,
                  "baselineFromMs": -200, "baselineToMs": 0},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["analysisId"] == aid


def test_dipole_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/source/dipole",
        json={"stimulusClasses": [], "preStimMs": -200, "postStimMs": 800,
              "baselineFromMs": -200, "baselineToMs": 0},
    )
    assert r.status_code in (401, 403)
