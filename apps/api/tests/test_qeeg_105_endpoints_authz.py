from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.persistence.models import Clinic, EegStudioRecording, Patient, User


def _seed_clinic_and_clinician(db: Session, *, clinic_id: str, user_id: str) -> None:
    if db.query(Clinic).filter_by(id=clinic_id).first() is None:
        db.add(Clinic(id=clinic_id, name=f"Clinic {clinic_id}"))
        db.flush()
    if db.query(User).filter_by(id=user_id).first() is None:
        db.add(
            User(
                id=user_id,
                email=f"{user_id}@example.com",
                display_name=f"{user_id} User",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )
        db.flush()


def _seed_patient_with_owner(db: Session, *, patient_id: str, clinician_id: str) -> None:
    if db.query(Patient).filter_by(id=patient_id).first() is None:
        db.add(
            Patient(
                id=patient_id,
                clinician_id=clinician_id,
                first_name="Test",
                last_name="Patient",
                status="active",
            )
        )
        db.flush()


def _seed_recording(db: Session, *, recording_id: str, patient_id: str, clinician_id: str) -> None:
    if db.query(EegStudioRecording).filter_by(id=recording_id).first() is None:
        db.add(
            EegStudioRecording(
                id=recording_id,
                patient_id=patient_id,
                clinician_id=clinician_id,
                recorded_at=datetime.now(timezone.utc),
                raw_storage_key="s3://bucket/key.edf",
                duration_sec=10.0,
                metadata_json="{}",
            )
        )
        db.flush()


def test_qeeg_105_catalog_requires_clinician_role(client, auth_headers) -> None:
    # Guest cannot even read the catalog.
    r = client.get("/api/v1/qeeg/analyses", headers=auth_headers["guest"])
    assert r.status_code == 403

    # Clinician can.
    r = client.get("/api/v1/qeeg/analyses", headers=auth_headers["clinician"])
    assert r.status_code == 200


def test_qeeg_105_run_requires_recording_owner_and_hides_cross_clinic(client, auth_headers) -> None:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # Seed a second clinic and a patient owned by another clinician.
        _seed_clinic_and_clinician(db, clinic_id="clinic-other", user_id="actor-clinician-other")
        _seed_patient_with_owner(db, patient_id="patient-other", clinician_id="actor-clinician-other")
        _seed_recording(
            db,
            recording_id="recording-other",
            patient_id="patient-other",
            clinician_id="actor-clinician-other",
        )
        db.commit()
    finally:
        db.close()

    # Actor is in clinic-demo-default per tests/conftest.py.
    r = client.post(
        "/api/v1/qeeg/analyses/alpha_peak/run",
        headers=auth_headers["clinician"],
        json={"recording_id": "recording-other", "params": {}},
    )
    # Must not leak that the recording exists across clinics.
    assert r.status_code == 404


def test_qeeg_105_job_endpoints_require_clinician_role(client, auth_headers) -> None:
    # Unknown job id; still must require clinician role first.
    r = client.get("/api/v1/qeeg/jobs/job-does-not-exist", headers=auth_headers["guest"])
    assert r.status_code == 403

    r = client.get("/api/v1/qeeg/jobs/job-does-not-exist/results", headers=auth_headers["guest"])
    assert r.status_code == 403

    r = client.get("/api/v1/qeeg/jobs/job-does-not-exist", headers=auth_headers["clinician"])
    assert r.status_code == 404

    r = client.get("/api/v1/qeeg/jobs/job-does-not-exist/results", headers=auth_headers["clinician"])
    assert r.status_code == 404

