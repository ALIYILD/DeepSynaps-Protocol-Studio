"""Tests for the qEEG Analyzer launch-audit endpoints (2026-04-30).

Covers:
  * GET /api/v1/qeeg-analysis/{id}/export-csv — real CSV envelope
  * POST /api/v1/qeeg-analysis/audit-events    — page-level audit ingestion

Run with:
    pytest tests/test_qeeg_launch_audit.py -v
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def clinician_token(client: TestClient) -> str:
    from app.services.auth_service import create_access_token

    return create_access_token(
        user_id="test_clinician_audit",
        email="audit@example.com",
        role="clinician",
        package_id="explorer",
        clinic_id="test_clinic_audit",
    )


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _seed_analysis_with_band_powers() -> str:
    from app.persistence.models import Clinic, Patient, QEEGAnalysis, User

    db = SessionLocal()
    if not db.query(Clinic).filter_by(id="test_clinic_audit").first():
        db.add(Clinic(id="test_clinic_audit", name="Audit Test Clinic"))
    if not db.query(User).filter_by(id="test_clinician_audit").first():
        db.add(User(
            id="test_clinician_audit",
            email="audit@example.com",
            display_name="Audit Tester",
            hashed_password="not_real",
            role="clinician",
            clinic_id="test_clinic_audit",
        ))
    if not db.query(Patient).filter_by(id="test_patient_audit").first():
        db.add(Patient(
            id="test_patient_audit",
            clinician_id="test_clinician_audit",
            first_name="Audit",
            last_name="Patient",
            dob="1985-06-01",
        ))
    db.commit()

    analysis_id = "test_analysis_audit"
    if not db.query(QEEGAnalysis).filter_by(id=analysis_id).first():
        db.add(QEEGAnalysis(
            id=analysis_id,
            patient_id="test_patient_audit",
            clinician_id="test_clinician_audit",
            analysis_status="completed",
            recording_duration_sec=300.0,
            sample_rate_hz=256.0,
            channel_count=2,
            eyes_condition="closed",
            channels_json=json.dumps(["Cz", "Pz"]),
            band_powers_json=json.dumps({
                "bands": {
                    "alpha": {"channels": {
                        "Cz": {"relative_pct": 28.4},
                        "Pz": {"relative_pct": 31.7},
                    }},
                    "theta": {"channels": {
                        "Cz": {"relative_pct": 14.1},
                        "Pz": {"relative_pct": 12.8},
                    }},
                },
            }),
            normative_deviations_json=json.dumps({
                "Cz": {"alpha": 0.4, "theta": -0.6},
                "Pz": {"alpha": 1.2, "theta": -1.1},
            }),
            artifact_rejection_json=json.dumps({"epochs_total": 100, "epochs_kept": 96}),
            quality_metrics_json=json.dumps({"bad_channels": []}),
            pipeline_version="v2.1",
        ))
        db.commit()
    db.close()
    return analysis_id


class TestExportCSV:
    def test_csv_returns_real_band_powers_and_zscores(
        self, client: TestClient, clinician_token: str
    ) -> None:
        analysis_id = _seed_analysis_with_band_powers()
        r = client.get(
            f"/api/v1/qeeg-analysis/{analysis_id}/export-csv",
            headers=_auth_headers(clinician_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["analysis_id"] == analysis_id
        assert body["rows"] == 2  # Cz, Pz
        assert body["demo"] is False
        # CSV must contain channel + bands + z-score columns
        csv = body["csv"]
        first_line = csv.splitlines()[0]
        assert "channel" in first_line
        assert "alpha" in first_line and "theta" in first_line
        assert "alpha_zscore" in first_line and "theta_zscore" in first_line
        # Check a real value is present (not faked)
        assert "28.4" in csv or "31.7" in csv

    def test_csv_404_for_missing_analysis(
        self, client: TestClient, clinician_token: str
    ) -> None:
        r = client.get(
            "/api/v1/qeeg-analysis/nonexistent_id_xyz/export-csv",
            headers=_auth_headers(clinician_token),
        )
        assert r.status_code == 404


class TestAuditEvents:
    def test_audit_event_accepted(
        self, client: TestClient, clinician_token: str
    ) -> None:
        r = client.post(
            "/api/v1/qeeg-analysis/audit-events",
            json={"event": "analyzer_loaded", "using_demo_data": True},
            headers=_auth_headers(clinician_token),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("qeeg-analyzer_loaded-")

    def test_audit_event_with_analysis_id(
        self, client: TestClient, clinician_token: str
    ) -> None:
        analysis_id = _seed_analysis_with_band_powers()
        r = client.post(
            "/api/v1/qeeg-analysis/audit-events",
            json={
                "event": "export_csv",
                "analysis_id": analysis_id,
                "patient_id": "test_patient_audit",
                "note": "bands=5",
            },
            headers=_auth_headers(clinician_token),
        )
        assert r.status_code == 200
        assert r.json()["accepted"] is True

    def test_audit_event_rejects_unauth(self, client: TestClient) -> None:
        # No auth → 401/403 (auth gate). Best to assert ≠ 200 since the exact
        # status depends on the auth middleware.
        r = client.post(
            "/api/v1/qeeg-analysis/audit-events",
            json={"event": "analyzer_loaded"},
        )
        assert r.status_code != 200
