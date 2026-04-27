from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, MriAnalysis, OutcomeSeries, Patient, QEEGAnalysis, User


def _ensure_demo_clinician_in_clinic() -> None:
    """Seed Clinic + User keyed on the demo clinician actor_id so the
    cross-clinic ownership gate (added in the audit) finds a real clinic_id."""
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id="actor-clinician-demo").first()
        if existing is not None and existing.clinic_id:
            return
        clinic_id = "clinic-annotations-demo"
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="Annotations Demo Clinic"))
            db.flush()
        if existing is None:
            db.add(
                User(
                    id="actor-clinician-demo",
                    email="demo_clin_annotations@example.com",
                    display_name="Verified Clinician Demo",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id=clinic_id,
                )
            )
        else:
            existing.clinic_id = clinic_id
        db.commit()
    finally:
        db.close()


def _seed_patient(email: str = "patient@deepsynaps.com") -> str:
    _ensure_demo_clinician_in_clinic()
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-summary-001",
            clinician_id="actor-clinician-demo",
            first_name="Pat",
            last_name="Ient",
            email=email,
            status="active",
        )
        db.add(patient)
        db.commit()
        return patient.id
    finally:
        db.close()


def test_annotations_round_trip_for_clinician(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient("annotations@example.com")

    create_resp = client.post(
        "/api/v1/annotations",
        headers=auth_headers["clinician"],
        json={
            "patient_id": patient_id,
            "target_type": "qeeg",
            "target_id": "qeeg-analysis-1",
            "title": "Frontal review",
            "body": "Check frontal theta shift against symptoms.",
            "anchor_label": "Compare tab",
            "anchor_data": {"analysis_id": "qeeg-analysis-1"},
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["target_type"] == "qeeg"
    assert created["anchor_data"]["analysis_id"] == "qeeg-analysis-1"

    list_resp = client.get(
        f"/api/v1/annotations?patient_id={patient_id}&target_type=qeeg&target_id=qeeg-analysis-1",
        headers=auth_headers["clinician"],
    )
    assert list_resp.status_code == 200, list_resp.text
    rows = list_resp.json()
    assert len(rows) == 1
    assert rows[0]["title"] == "Frontal review"

    delete_resp = client.delete(
        f"/api/v1/annotations/{created['id']}",
        headers=auth_headers["clinician"],
    )
    assert delete_resp.status_code == 204, delete_resp.text


def test_qeeg_compare_response_includes_enriched_fields(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient("qeegcompare@example.com")
    db = SessionLocal()
    try:
        baseline = QEEGAnalysis(
            id="qeeg-base-001",
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            analysis_status="completed",
            analyzed_at=datetime.now(timezone.utc) - timedelta(days=30),
            band_powers_json=json.dumps({
                "bands": {
                    "theta": {"channels": {"Fz": {"relative_pct": 18.0}, "Cz": {"relative_pct": 16.0}}},
                    "beta": {"channels": {"Fz": {"relative_pct": 9.0}, "Cz": {"relative_pct": 10.0}}},
                    "delta": {"channels": {"Fz": {"relative_pct": 8.0}}},
                    "alpha": {"channels": {"Fz": {"relative_pct": 22.0}}},
                }
            }),
        )
        followup = QEEGAnalysis(
            id="qeeg-fu-001",
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            analysis_status="completed",
            analyzed_at=datetime.now(timezone.utc),
            band_powers_json=json.dumps({
                "bands": {
                    "theta": {"channels": {"Fz": {"relative_pct": 12.0}, "Cz": {"relative_pct": 13.0}}},
                    "beta": {"channels": {"Fz": {"relative_pct": 11.0}, "Cz": {"relative_pct": 11.0}}},
                    "delta": {"channels": {"Fz": {"relative_pct": 6.0}}},
                    "alpha": {"channels": {"Fz": {"relative_pct": 25.0}}},
                }
            }),
        )
        db.add(baseline)
        db.add(followup)
        db.commit()
    finally:
        db.close()

    resp = client.post(
        "/api/v1/qeeg-analysis/compare",
        headers=auth_headers["clinician"],
        json={"baseline_id": "qeeg-base-001", "followup_id": "qeeg-fu-001"},
    )
    assert resp.status_code == 201, resp.text
    payload = resp.json()
    assert payload["baseline_band_powers"]["bands"]["theta"]["channels"]["Fz"]["relative_pct"] == 18.0
    assert "theta_beta_ratio" in payload["ratio_changes"]
    assert payload["rci_summary"]["label"] in {"meaningful improvement", "largely stable", "possible worsening"}
    assert isinstance(payload["highlighted_changes"], list)


def test_patient_portal_summary_returns_safe_read_only_blocks(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient()
    db = SessionLocal()
    try:
        db.add(QEEGAnalysis(
            id="portal-qeeg-001",
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            analysis_status="completed",
            analyzed_at=datetime.now(timezone.utc),
            quality_metrics_json=json.dumps({"n_epochs_retained": 42}),
            flagged_conditions=json.dumps(["review"]),
        ))
        db.add(MriAnalysis(
            analysis_id="portal-mri-001",
            patient_id=patient_id,
            state="SUCCESS",
            qc_json=json.dumps({"passed": True}),
            structural_json=json.dumps({"brain_age": {"predicted_age_years": 50.0}}),
            stim_targets_json=json.dumps([{"id": "left-dlpfc"}]),
        ))
        db.add(OutcomeSeries(
            id="outcome-001",
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            course_id="course-1",
            template_id="phq-9",
            template_title="PHQ-9",
            measurement_point="week_2",
            score="11",
            score_numeric=11.0,
            administered_at=datetime.now(timezone.utc),
        ))
        db.commit()
    finally:
        db.close()

    resp = client.get("/api/v1/patient-portal/summary", headers=auth_headers["patient"])
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["latest_qeeg"]["headline"].startswith("Your latest brainwave review")
    assert "clinician" in payload["latest_mri"]["summary"].lower()
    assert payload["outcomes_snapshot"][0]["label"] == "PHQ-9"
