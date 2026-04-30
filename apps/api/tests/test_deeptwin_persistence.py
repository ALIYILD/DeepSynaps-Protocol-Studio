"""Tests for DeepTwin persistence and review endpoints (migration 063)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _seed_patient(patient_id: str = "dt-test-patient-001"):
    """Ensure a test patient exists in the demo clinic."""
    from app.database import SessionLocal
    from app.persistence.models import Clinic, Patient, User
    db = SessionLocal()
    try:
        clinic_id = "clinic-demo-default"
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="Demo Clinic"))
            db.flush()
        if db.query(User).filter_by(id="actor-clinician-demo").first() is None:
            db.add(User(
                id="actor-clinician-demo",
                email="demo_clinician@example.com",
                display_name="Verified Clinician Demo",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=clinic_id,
            ))
            db.flush()
        if db.query(Patient).filter_by(id=patient_id).first() is None:
            db.add(Patient(
                id=patient_id,
                clinician_id="actor-clinician-demo",
                first_name="Test",
                last_name="Patient",
            ))
            db.commit()
    finally:
        db.close()


class TestDataSourcesEndpoint:
    def test_data_sources_empty_patient(self, auth_headers):
        _seed_patient("dt-test-patient-001")
        resp = client.get(
            "/api/v1/deeptwin/patients/dt-test-patient-001/data-sources",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["patient_id"] == "dt-test-patient-001"
        assert data["completeness_score"] == 0.0
        for src in data["sources"].values():
            assert src["available"] is False
            assert src["count"] == 0

    def test_data_sources_with_assessments(self, auth_headers):
        patient_id = "dt-test-patient-002"
        _seed_patient(patient_id)
        from app.database import SessionLocal
        from app.persistence.models import AssessmentRecord
        db = SessionLocal()
        try:
            db.add(AssessmentRecord(
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                template_id="phq-9",
                template_title="PHQ-9",
                data_json='{"score": 12}',
            ))
            db.commit()
        finally:
            db.close()
        resp = client.get(
            f"/api/v1/deeptwin/patients/{patient_id}/data-sources",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sources"]["assessments"]["available"] is True
        assert data["sources"]["assessments"]["count"] == 1
        assert data["completeness_score"] > 0


class TestAnalysisRuns:
    def test_create_and_list(self, auth_headers):
        patient_id = "dt-test-patient-003"
        _seed_patient(patient_id)
        resp = client.post(
            f"/api/v1/deeptwin/patients/{patient_id}/analysis-runs",
            headers=auth_headers["clinician"],
            json={"analysis_type": "correlation", "confidence": 0.72, "model_name": "tribe-v1"},
        )
        assert resp.status_code == 200
        run = resp.json()
        assert run["patient_id"] == patient_id
        assert run["analysis_type"] == "correlation"
        assert run["confidence"] == 0.72
        assert run["status"] == "completed"
        assert run["reviewed_at"] is None

        resp = client.get(
            f"/api/v1/deeptwin/patients/{patient_id}/analysis-runs",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        runs = resp.json()
        assert len(runs) == 1
        assert runs[0]["id"] == run["id"]

    def test_review_analysis_run(self, auth_headers):
        patient_id = "dt-test-patient-004"
        _seed_patient(patient_id)
        create_resp = client.post(
            f"/api/v1/deeptwin/patients/{patient_id}/analysis-runs",
            headers=auth_headers["clinician"],
            json={"analysis_type": "prediction"},
        )
        run_id = create_resp.json()["id"]
        resp = client.post(
            f"/api/v1/deeptwin/analysis-runs/{run_id}/review",
            headers=auth_headers["clinician"],
            json={},
        )
        assert resp.status_code == 200
        reviewed = resp.json()
        assert reviewed["reviewed_at"] is not None
        assert reviewed["reviewed_by"] == "actor-clinician-demo"


class TestSimulationRuns:
    def test_create_and_list(self, auth_headers):
        patient_id = "dt-test-patient-005"
        _seed_patient(patient_id)
        resp = client.post(
            f"/api/v1/deeptwin/patients/{patient_id}/simulation-runs",
            headers=auth_headers["clinician"],
            json={"confidence": 0.55, "limitations": "Demo limitation"},
        )
        assert resp.status_code == 200
        run = resp.json()
        assert run["patient_id"] == patient_id
        assert run["clinician_review_required"] is True
        assert run["reviewed_at"] is None

        resp = client.get(
            f"/api/v1/deeptwin/patients/{patient_id}/simulation-runs",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        runs = resp.json()
        assert len(runs) == 1

    def test_review_simulation_run(self, auth_headers):
        patient_id = "dt-test-patient-006"
        _seed_patient(patient_id)
        create_resp = client.post(
            f"/api/v1/deeptwin/patients/{patient_id}/simulation-runs",
            headers=auth_headers["clinician"],
            json={},
        )
        run_id = create_resp.json()["id"]
        resp = client.post(
            f"/api/v1/deeptwin/simulation-runs/{run_id}/review",
            headers=auth_headers["clinician"],
            json={},
        )
        assert resp.status_code == 200
        reviewed = resp.json()
        assert reviewed["reviewed_at"] is not None
        assert reviewed["reviewed_by"] == "actor-clinician-demo"


class TestClinicianNotes:
    def test_create_and_list(self, auth_headers):
        patient_id = "dt-test-patient-007"
        _seed_patient(patient_id)
        resp = client.post(
            f"/api/v1/deeptwin/patients/{patient_id}/clinician-notes",
            headers=auth_headers["clinician"],
            json={"note_text": "Patient responded well to first session."},
        )
        assert resp.status_code == 200
        note = resp.json()
        assert note["note_text"] == "Patient responded well to first session."
        assert note["clinician_id"] == "actor-clinician-demo"

        resp = client.get(
            f"/api/v1/deeptwin/patients/{patient_id}/clinician-notes",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        notes = resp.json()
        assert len(notes) == 1
        assert notes[0]["id"] == note["id"]


class TestAccessControl:
    def test_non_clinician_blocked(self, auth_headers):
        _seed_patient("dt-test-patient-008")
        resp = client.get(
            "/api/v1/deeptwin/patients/dt-test-patient-008/data-sources",
            headers=auth_headers["patient"],
        )
        assert resp.status_code in (403, 401)

    def test_other_clinic_blocked(self, auth_headers):
        from app.database import SessionLocal
        from app.persistence.models import Clinic, Patient, User
        db = SessionLocal()
        try:
            other_clinic = "other-clinic-dt"
            if db.query(Clinic).filter_by(id=other_clinic).first() is None:
                db.add(Clinic(id=other_clinic, name="Other"))
                db.flush()
            if db.query(User).filter_by(id="actor-other-clinic").first() is None:
                db.add(User(
                    id="actor-other-clinic",
                    email="other@example.com",
                    display_name="Other Clinician",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id=other_clinic,
                ))
                db.flush()
            if db.query(Patient).filter_by(id="other-patient-dt").first() is None:
                db.add(Patient(id="other-patient-dt", clinician_id="actor-other-clinic", first_name="O", last_name="ther"))
                db.commit()
        finally:
            db.close()
        resp = client.get(
            "/api/v1/deeptwin/patients/other-patient-dt/data-sources",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code in (403, 404)
