from __future__ import annotations

import json

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAIReport, User
from app.services.auth_service import create_access_token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_patient_facing_report_excludes_raw_review_handoff(client) -> None:
    db = SessionLocal()
    try:
        clinic = Clinic(id="test_clinic_pf_boundary", name="Patient Boundary Clinic")
        user = User(
            id="test_clinician_pf_boundary",
            email="pf-boundary@example.com",
            display_name="PF Boundary",
            hashed_password="x",
            role="clinician",
            clinic_id=clinic.id,
        )
        patient = Patient(
            id="test_patient_pf_boundary",
            clinician_id=user.id,
            first_name="Boundary",
            last_name="Patient",
        )
        report = QEEGAIReport(
            id="test_report_pf_boundary",
            analysis_id="analysis_pf_boundary",
            patient_id=patient.id,
            clinician_id=user.id,
            report_type="standard",
            report_state="APPROVED",
            patient_facing_report_json=json.dumps(
                {
                    "disclaimer": "This is a research/wellness summary. Please discuss with your clinician.",
                    "executive_summary": "Signals appear to show mild variation.",
                    "findings": [{"region": "frontal", "observation": "Mild frontal variation."}],
                    "protocol_recommendations": [],
                }
            ),
        )
        db.add_all([clinic, user, patient, report])
        db.commit()
    finally:
        db.close()

    token = create_access_token(
        user_id="test_clinician_pf_boundary",
        email="pf-boundary@example.com",
        role="clinician",
        package_id="explorer",
        clinic_id="test_clinic_pf_boundary",
    )

    resp = client.get(
        "/api/v1/qeeg-analysis/reports/test_report_pf_boundary/patient-facing",
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "raw_review_handoff" not in body
    assert "disclaimer" in body
