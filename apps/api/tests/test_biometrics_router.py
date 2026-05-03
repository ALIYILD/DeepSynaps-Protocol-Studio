"""Tests for /api/biometrics — DB-backed analytics and sync."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User, WearableDailySummary
from app.services.auth_service import create_access_token


@pytest.fixture
def clinic_and_patient() -> dict[str, str]:
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Bio Cl")
        clin = User(
            id=str(uuid.uuid4()),
            email=f"bio_clin_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Bio Clin",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clin])
        db.flush()
        p = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin.id,
            first_name="Bio",
            last_name="Patient",
            email=f"bio_pt_{uuid.uuid4().hex[:8]}@example.com",
        )
        db.add(p)
        db.commit()
        return {"clinic_id": clinic.id, "clinician_id": clin.id, "patient_id": p.id}
    finally:
        db.close()


def _clinician_headers(clinician_id: str) -> dict[str, str]:
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(id=clinician_id).first()
        clinic_id = u.clinic_id if u else None
        email = u.email if u else "x@example.com"
    finally:
        db.close()
    token = create_access_token(
        clinician_id, email, "clinician", "explorer", clinic_id
    )
    return {"Authorization": f"Bearer {token}"}


class TestBiometricsAuth:
    def test_guest_summary_401(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/biometrics/summary", headers=auth_headers["guest"])
        assert r.status_code == 401

    def test_clinician_requires_patient_id(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/biometrics/summary", headers=auth_headers["clinician"])
        assert r.status_code == 400
        assert "patient_id" in r.json().get("message", "").lower() or "patient_id" in str(
            r.json()
        ).lower()


class TestBiometricsData:
    def test_summary_and_correlation(
        self, client: TestClient, clinic_and_patient: dict[str, str]
    ) -> None:
        pid = clinic_and_patient["patient_id"]
        clin_id = clinic_and_patient["clinician_id"]
        headers = _clinician_headers(clin_id)

        db = SessionLocal()
        try:
            today = datetime.now(timezone.utc).date().isoformat()
            db.add(
                WearableDailySummary(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    source="apple_health",
                    date=today,
                    hrv_ms=40.0,
                    sleep_duration_h=7.0,
                    steps=5000,
                )
            )
            db.add(
                WearableDailySummary(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    source="apple_health",
                    date="2026-01-01",
                    hrv_ms=45.0,
                    sleep_duration_h=7.5,
                    steps=6000,
                )
            )
            db.add(
                WearableDailySummary(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    source="apple_health",
                    date="2026-02-01",
                    hrv_ms=50.0,
                    sleep_duration_h=8.0,
                    steps=7000,
                )
            )
            db.commit()
        finally:
            db.close()

        s = client.get(f"/api/biometrics/summary?patient_id={pid}&days=365", headers=headers)
        assert s.status_code == 200
        body = s.json()
        assert body["patient_id"] == pid
        assert body["daily_summary_rows"] >= 2

        c = client.get(f"/api/biometrics/correlations?patient_id={pid}&days=365", headers=headers)
        assert c.status_code == 200
        cj = c.json()
        assert "matrix" in cj
        assert "disclaimer" in cj

    def test_sync_observation(
        self, client: TestClient, clinic_and_patient: dict[str, str]
    ) -> None:
        pid = clinic_and_patient["patient_id"]
        clin_id = clinic_and_patient["clinician_id"]
        headers = _clinician_headers(clin_id)
        ts = datetime.now(timezone.utc).isoformat()
        r = client.post(
            "/api/biometrics/sync",
            headers=headers,
            json={
                "patient_id": pid,
                "provider": "apple_health",
                "batch": [
                    {
                        "source": "apple_health",
                        "metric_type": "heart_rate",
                        "value": 72.0,
                        "unit": "bpm",
                        "observed_at": ts,
                    }
                ],
            },
        )
        assert r.status_code == 200
        j = r.json()
        assert j["created_observations"] == 1
        assert j["patient_id"] == pid
