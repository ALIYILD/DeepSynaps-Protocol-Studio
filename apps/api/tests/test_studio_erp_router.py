"""Smoke tests for Studio ERP compute (M9)."""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

pytest.importorskip("mne")

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User
from app.routers import studio_erp_router
from app.services.auth_service import create_access_token


@pytest.fixture
def analysis_ctx() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="ERP Test Clinic")
        clin = User(
            id=str(uuid.uuid4()),
            email=f"erp_{uuid.uuid4().hex[:8]}@example.com",
            display_name="ERP",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clin])
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin.id,
            first_name="P",
            last_name="Test",
        )
        db.add(patient)
        db.flush()
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=clin.id,
            file_ref="memory://erp-test",
            original_filename="recording.edf",
            file_size_bytes=2048,
            recording_duration_sec=120.0,
            sample_rate_hz=256.0,
            channel_count=3,
            channels_json='["Fp1","Fp2","Cz"]',
            recording_date="2026-05-05",
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
            package_id="explorer",
            clinic_id=clin.clinic_id,
        )
        return {"analysis_id": analysis.id, "token_a": token}
    finally:
        db.close()


def _synthetic_raw():
    import mne
    import numpy as np

    info = mne.create_info(ch_names=["Fp1", "Fp2", "Cz"], sfreq=256, ch_types="eeg")
    data = np.zeros((3, 256 * 30), dtype=np.float64)
    data += np.random.default_rng(0).normal(0, 5e-6, data.shape)
    return mne.io.RawArray(data, info)


def _fake_trials():
    out = []
    t = 1.0
    for i in range(40):
        out.append(
            {
                "id": f"t{i}",
                "class": "TGT",
                "onsetSec": t,
                "included": True,
            }
        )
        t += 0.5
    return out


def test_erp_compute_returns_200(client: TestClient, analysis_ctx: dict[str, Any]) -> None:
    aid = analysis_ctx["analysis_id"]
    hdr = {"Authorization": f"Bearer {analysis_ctx['token_a']}"}

    with (
        patch.object(studio_erp_router, "load_raw_for_analysis", return_value=_synthetic_raw()),
        patch.object(studio_erp_router, "get_trials_for_analysis", return_value=_fake_trials()),
    ):
        resp = client.post(
            f"/api/v1/studio/eeg/{aid}/erp/compute",
            headers=hdr,
            json={
                "stim_classes": ["TGT"],
                "pre_stim_ms": -200,
                "post_stim_ms": 800,
                "baseline_correction": "mean",
            },
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "waveforms" in body
    assert "trials" in body
    assert isinstance(body["waveforms"], list)
    assert isinstance(body["trials"], list)


def test_erp_trials_list(client: TestClient, analysis_ctx: dict[str, Any]) -> None:
    aid = analysis_ctx["analysis_id"]
    hdr = {"Authorization": f"Bearer {analysis_ctx['token_a']}"}
    with patch.object(studio_erp_router, "get_trials_for_analysis", return_value=_fake_trials()):
        r = client.get(f"/api/v1/studio/eeg/{aid}/erp/trials", headers=hdr)
    assert r.status_code == 200
    assert "trials" in r.json()
