"""End-to-end smoke test for the qEEG Clinical Intelligence Workbench workflow.

Exercises the full happy path:
  1. Create patient + qEEG record
  2. Upload / analyze qEEG
  3. Safety cockpit + red flags
  4. Generate AI report (triggers claim governance + per-finding records)
  5. Transition report through review states
  6. Sign report
  7. Patient-facing report
  8. BIDS export (gated)
  9. Timeline

Run with:
    pytest tests/test_qeeg_workflow_smoke.py -v

Requires: DEEPSYNAPS_APP_ENV=test, full backend dependencies.
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def clinician_token(client: TestClient) -> str:
    """Create a test clinician and return their JWT."""
    from app.services.auth_service import create_access_token

    return create_access_token(
        user_id="test_clinician_1",
        email="test@example.com",
        role="clinician",
        package_id="explorer",
        clinic_id="test_clinic_1",
    )


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestQEEGWorkflowSmoke:
    """Full qEEG Clinical Workbench smoke test."""

    def test_full_workflow(self, client: TestClient, clinician_token: str) -> None:
        from app.persistence.models import Clinic, Patient, QEEGAnalysis, User

        async def _fake_generate_ai_report(**kwargs):
            return {
                "data": {
                    "executive_summary": "Observed frontal-central variation. Decision-support only.",
                    "findings": [
                        {
                            "region": "frontal",
                            "band": "theta",
                            "observation": "Mild frontal theta elevation was observed [1].",
                            "citations": [1],
                        }
                    ],
                    "band_analysis": {},
                    "key_biomarkers": {},
                    "condition_correlations": [],
                    "protocol_recommendations": [
                        {
                            "modality": "neurofeedback",
                            "target": "Cz",
                            "rationale": "Protocol consideration based on observed theta pattern.",
                            "evidence_level": "B",
                        }
                    ],
                    "clinical_flags": [],
                    "confidence_level": "moderate",
                    "disclaimer": "For research/wellness reference only.",
                    "raw_review_handoff": {
                        "cleaning_version_id": "cv-smoke-1",
                        "review_status": "reviewed",
                        "bad_channels": ["Fp1"],
                        "rejected_segments": [{"start_sec": 12.5, "duration_sec": 1.0}],
                        "medication_confounds": ["stimulant"],
                    },
                },
                "literature_refs": [
                    {
                        "n": 1,
                        "title": "Sample qEEG reference",
                        "authors": ["DeepSynaps"],
                        "year": 2024,
                        "journal": "Clin Neurophysiol",
                        "url": "https://pubmed.ncbi.nlm.nih.gov/30000001/",
                    }
                ],
                "model_used": "test-qeeg-smoke",
                "prompt_hash": "smoke-hash",
            }

        db = SessionLocal()

        # Seed clinic + clinician user + patient
        clinic = Clinic(id="test_clinic_1", name="Test Clinic")
        db.add(clinic)
        user = User(
            id="test_clinician_1",
            email="test@example.com",
            display_name="Test Clinician",
            hashed_password="not_a_real_hash",
            role="clinician",
            clinic_id="test_clinic_1",
        )
        db.add(user)
        patient = Patient(
            id="test_patient_1",
            clinician_id="test_clinician_1",
            first_name="Test",
            last_name="Patient",
            dob="1990-01-15",
        )
        db.add(patient)
        db.commit()

        # 1. Create qEEG analysis
        analysis = QEEGAnalysis(
            id="test_analysis_1",
            patient_id=patient.id,
            clinician_id="test_clinician_1",
            analysis_status="completed",
            recording_duration_sec=300.0,
            sample_rate_hz=256.0,
            channel_count=19,
            eyes_condition="closed",
            channels_json=json.dumps(
                ["Fp1","Fp2","F7","F3","Fz","F4","F8","T3","C3","Cz","C4","T4","T5","P3","Pz","P4","T6","O1","O2"]
            ),
            band_powers_json=json.dumps({"bands": {"alpha": {"channels": {"Cz": {}}}}}),
            artifact_rejection_json=json.dumps({"epochs_total": 100, "epochs_kept": 95}),
            quality_metrics_json=json.dumps({"bad_channels": []}),
            pipeline_version="v2.1",
        )
        db.add(analysis)
        db.commit()

        headers = _auth_headers(clinician_token)

        # 2. Safety cockpit
        r = client.get(f"/api/v1/qeeg-analysis/{analysis.id}/safety-cockpit", headers=headers)
        assert r.status_code == 200
        cockpit = r.json()
        assert cockpit["overall_status"] == "VALID_FOR_REVIEW"

        # 3. Red flags
        r = client.get(f"/api/v1/qeeg-analysis/{analysis.id}/red-flags", headers=headers)
        assert r.status_code == 200
        flags = r.json()
        assert "flags" in flags

        # 4. Normative model card
        r = client.get(f"/api/v1/qeeg-analysis/{analysis.id}/normative-model-card", headers=headers)
        assert r.status_code == 200
        card = r.json()
        assert "zscore_method" in card

        with mock.patch(
            "app.services.qeeg_ai_interpreter.generate_ai_report",
            side_effect=_fake_generate_ai_report,
        ):
            # 5. Generate AI report
            report_payload = {
                "report_type": "standard",
                "patient_context": "Test patient context.",
            }
            r = client.post(
                f"/api/v1/qeeg-analysis/{analysis.id}/ai-report",
                json=report_payload,
                headers=headers,
            )
            assert r.status_code == 201, r.text
            report = r.json()
            assert report["report_state"] == "DRAFT_AI"
            assert report["claim_governance"] is not None
            report_id = report["id"]

            # 6. Protocol fit
            r = client.post(f"/api/v1/qeeg-analysis/{analysis.id}/protocol-fit", headers=headers)
            assert r.status_code == 200
            fit = r.json()
            assert "pattern_summary" in fit

            # 7. Transition to NEEDS_REVIEW
            r = client.post(
                f"/api/v1/qeeg-analysis/reports/{report_id}/transition",
                json={"action": "NEEDS_REVIEW", "note": "Ready for review"},
                headers=headers,
            )
            assert r.status_code == 200
            assert r.json()["report_state"] == "NEEDS_REVIEW"

            # 8. Transition to APPROVED
            r = client.post(
                f"/api/v1/qeeg-analysis/reports/{report_id}/transition",
                json={"action": "APPROVED", "note": "Looks good"},
                headers=headers,
            )
            assert r.status_code == 200
            assert r.json()["report_state"] == "APPROVED"

            # 9. Sign report
            r = client.post(f"/api/v1/qeeg-analysis/reports/{report_id}/sign", headers=headers)
            assert r.status_code == 200
            assert r.json()["signed_by"] == "test_clinician_1"

            # 10. Patient-facing report (now allowed because approved + signed)
            r = client.get(f"/api/v1/qeeg-analysis/reports/{report_id}/patient-facing", headers=headers)
            assert r.status_code == 200
            pfr = r.json()
            assert "disclaimer" in pfr
            assert "raw_review_handoff" not in pfr
            assert "medication_confounds" not in json.dumps(pfr)

            # 11. BIDS export (gated — should succeed now)
            r = client.post(f"/api/v1/qeeg-analysis/{analysis.id}/export-bids", headers=headers)
            assert r.status_code == 200
            assert r.headers["content-type"] == "application/zip"
            archive = zipfile.ZipFile(io.BytesIO(r.content))
            names = archive.namelist()
            raw_handoff_name = next(name for name in names if name.endswith("_desc-raw_review_handoff.json"))
            ai_report_name = next(name for name in names if name.endswith("_desc-ai_report.json"))
            patient_report_name = next(name for name in names if name.endswith("_desc-patient_report.json"))
            raw_handoff = json.loads(archive.read(raw_handoff_name))
            ai_report_export = json.loads(archive.read(ai_report_name))
            patient_report_export = json.loads(archive.read(patient_report_name))
            assert raw_handoff["bad_channels"] == ["Fp1"]
            assert ai_report_export["ai_narrative"]["raw_review_handoff"]["bad_channels"] == ["Fp1"]
            assert "raw_review_handoff" not in patient_report_export
            assert "medication_confounds" not in json.dumps(patient_report_export)

            # 12. Timeline
            r = client.get(f"/api/v1/qeeg-analysis/patient/{patient.id}/timeline", headers=headers)
            assert r.status_code == 200
            timeline = r.json()
            assert isinstance(timeline, list)
            assert any(e["event_type"] == "qeeg_baseline" for e in timeline)

        db.close()

    def test_patient_facing_report_blocked_before_approval(self, client: TestClient, clinician_token: str) -> None:
        """Patient-facing report must be blocked until report is approved."""
        from app.persistence.models import Clinic, Patient, QEEGAnalysis, QEEGAIReport, User

        db = SessionLocal()
        clinic = Clinic(id="test_clinic_1", name="Test Clinic")
        db.add(clinic)
        user = User(
            id="test_clinician_1",
            email="test@example.com",
            display_name="Test Clinician",
            hashed_password="not_a_real_hash",
            role="clinician",
            clinic_id="test_clinic_1",
        )
        db.add(user)
        patient = Patient(id="test_patient_2", clinician_id="test_clinician_1", first_name="Test", last_name="Patient")
        db.add(patient)
        db.commit()

        report = QEEGAIReport(
            id="test_report_2",
            analysis_id="test_analysis_2",
            patient_id=patient.id,
            clinician_id="test_clinician_1",
            report_type="standard",
            report_state="DRAFT_AI",
            patient_facing_report_json=json.dumps({"content": {"executive_summary": "Test"}}),
        )
        db.add(report)
        db.commit()

        headers = _auth_headers(clinician_token)
        r = client.get(f"/api/v1/qeeg-analysis/reports/{report.id}/patient-facing", headers=headers)
        assert r.status_code == 403
        assert "not_approved" in r.json()["code"]
        db.close()

    def test_bids_export_blocked_before_sign(self, client: TestClient, clinician_token: str) -> None:
        """BIDS export must be blocked until report is signed."""
        from app.persistence.models import Clinic, Patient, QEEGAnalysis, QEEGAIReport, User

        db = SessionLocal()
        clinic = Clinic(id="test_clinic_1", name="Test Clinic")
        db.add(clinic)
        user = User(
            id="test_clinician_1",
            email="test@example.com",
            display_name="Test Clinician",
            hashed_password="not_a_real_hash",
            role="clinician",
            clinic_id="test_clinic_1",
        )
        db.add(user)
        patient = Patient(id="test_patient_3", clinician_id="test_clinician_1", first_name="Test", last_name="Patient")
        db.add(patient)
        analysis = QEEGAnalysis(
            id="test_analysis_3",
            patient_id=patient.id,
            clinician_id="test_clinician_1",
            analysis_status="completed",
            recording_duration_sec=300.0,
            sample_rate_hz=256.0,
            channel_count=19,
            eyes_condition="closed",
            channels_json=json.dumps(
                ["Fp1","Fp2","F7","F3","Fz","F4","F8","T3","C3","Cz","C4","T4","T5","P3","Pz","P4","T6","O1","O2"]
            ),
            band_powers_json=json.dumps({"bands": {}}),
            artifact_rejection_json=json.dumps({"epochs_total": 100, "epochs_kept": 95}),
            quality_metrics_json=json.dumps({"bad_channels": []}),
            pipeline_version="v2.1",
        )
        db.add(analysis)
        report = QEEGAIReport(
            id="test_report_3",
            analysis_id=analysis.id,
            patient_id=patient.id,
            clinician_id="test_clinician_1",
            report_type="standard",
            report_state="APPROVED",
            signed_by=None,
        )
        db.add(report)
        db.commit()

        headers = _auth_headers(clinician_token)
        r = client.post(f"/api/v1/qeeg-analysis/{analysis.id}/export-bids", headers=headers)
        assert r.status_code == 403
        assert "export_not_allowed" in r.json()["code"]
        db.close()

    def test_bids_export_blocked_when_no_saved_report(self, client: TestClient, clinician_token: str) -> None:
        from app.persistence.models import Clinic, Patient, QEEGAnalysis, User

        db = SessionLocal()
        clinic = Clinic(id="test_clinic_1", name="Test Clinic")
        db.add(clinic)
        user = User(
            id="test_clinician_1",
            email="test@example.com",
            display_name="Test Clinician",
            hashed_password="not_a_real_hash",
            role="clinician",
            clinic_id="test_clinic_1",
        )
        db.add(user)
        patient = Patient(id="test_patient_4", clinician_id="test_clinician_1", first_name="Test", last_name="Patient")
        db.add(patient)
        analysis = QEEGAnalysis(
            id="test_analysis_4",
            patient_id=patient.id,
            clinician_id="test_clinician_1",
            analysis_status="completed",
            recording_duration_sec=300.0,
            sample_rate_hz=256.0,
            channel_count=19,
            eyes_condition="closed",
            channels_json=json.dumps(
                ["Fp1","Fp2","F7","F3","Fz","F4","F8","T3","C3","Cz","C4","T4","T5","P3","Pz","P4","T6","O1","O2"]
            ),
            band_powers_json=json.dumps({"bands": {}}),
            artifact_rejection_json=json.dumps({"epochs_total": 100, "epochs_kept": 95}),
            quality_metrics_json=json.dumps({"bad_channels": []}),
            pipeline_version="v2.1",
        )
        db.add(analysis)
        db.commit()

        headers = _auth_headers(clinician_token)
        r = client.post(f"/api/v1/qeeg-analysis/{analysis.id}/export-bids", headers=headers)
        assert r.status_code == 403
        assert "export_not_allowed" in r.json()["code"]
        db.close()
