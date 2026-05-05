from __future__ import annotations

import json
from datetime import datetime, timezone

from app.database import SessionLocal


def _seed_job(*, job_id: str, status: str, result_s3_key: str | None = None) -> None:
    from app.persistence.models import EegStudioRecording, Patient, QeegAnalysisJob

    db = SessionLocal()
    try:
        # These are seeded in apps/api/tests/conftest.py:
        # - Clinic(id="clinic-demo-default")
        # - User(id="actor-clinician-demo", clinic_id="clinic-demo-default")
        if db.query(Patient).filter_by(id="patient-qeeg105").first() is None:
            db.add(
                Patient(
                    id="patient-qeeg105",
                    clinician_id="actor-clinician-demo",
                    first_name="Qeeg",
                    last_name="105",
                    status="active",
                )
            )
            db.flush()

        if db.query(EegStudioRecording).filter_by(id="recording-qeeg105").first() is None:
            db.add(
                EegStudioRecording(
                    id="recording-qeeg105",
                    patient_id="patient-qeeg105",
                    clinician_id="actor-clinician-demo",
                    recorded_at=datetime.now(timezone.utc),
                    raw_storage_key="s3://bucket/key.edf",
                    duration_sec=10.0,
                    metadata_json="{}",
                )
            )
            db.flush()

        existing = db.query(QeegAnalysisJob).filter_by(id=job_id).first()
        if existing is None:
            db.add(
                QeegAnalysisJob(
                    id=job_id,
                    recording_id="recording-qeeg105",
                    patient_id="patient-qeeg105",
                    analysis_code="relative-spectral-power",
                    params_hash="x" * 64,
                    params_json=json.dumps({"band": "alpha"}),
                    status=status,
                    priority="normal",
                    estimated_runtime_sec=1,
                    started_at=None,
                    completed_at=None,
                    result_s3_key=result_s3_key,
                    error_message=("boom" if status == "failed" else None),
                    created_by="actor-clinician-demo",
                    created_at=datetime.now(timezone.utc),
                )
            )
        else:
            existing.status = status
            existing.result_s3_key = result_s3_key
            existing.error_message = ("boom" if status == "failed" else None)
        db.commit()
    finally:
        db.close()


def test_results_202_when_job_processing(client, auth_headers) -> None:
    _seed_job(job_id="job-processing", status="queued")
    r = client.get(
        "/api/v1/qeeg/jobs/job-processing/results",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["code"] == "job_not_ready"
    assert body["job_id"] == "job-processing"
    assert body["validation_status"] == "not_validated"
    assert body["clinician_review_required"] is True
    assert isinstance(body.get("warnings", []), list)


def test_results_409_when_job_failed(client, auth_headers) -> None:
    _seed_job(job_id="job-failed", status="failed")
    r = client.get(
        "/api/v1/qeeg/jobs/job-failed/results",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 409, r.text
    body = r.json()
    assert body["code"] == "job_not_ready"
    assert body["job_id"] == "job-failed"
    assert body["clinician_review_required"] is True
    assert body["validation_status"] == "not_validated"


def test_results_409_when_job_ready_but_no_results(client, auth_headers) -> None:
    _seed_job(job_id="job-ready-no-results", status="ready", result_s3_key=None)
    r = client.get(
        "/api/v1/qeeg/jobs/job-ready-no-results/results",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 409, r.text
    body = r.json()
    assert body["code"] == "job_not_ready"
    assert body["job_id"] == "job-ready-no-results"

