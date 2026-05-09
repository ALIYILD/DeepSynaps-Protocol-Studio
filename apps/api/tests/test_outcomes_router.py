"""Tests for outcomes_router — /api/v1/outcomes.

Pins:
  - unauthenticated requests return 403
  - list returns empty on fresh DB
  - POST creates an outcome record (happy path)
  - /summary/{course_id} returns 404 for unknown course
  - /aggregate returns expected keys
  - /longitudinal returns series dict
  - invalid date range returns 422
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}


def _seed_course(course_id: str = "course-outcomes-001") -> None:
    """Insert a minimal TreatmentCourse row via DB so summary lookups work."""
    from app.database import SessionLocal
    from app.persistence.models import TreatmentCourse
    from datetime import datetime, timezone

    db = SessionLocal()
    try:
        if db.query(TreatmentCourse).filter_by(id=course_id).first() is None:
            db.add(TreatmentCourse(
                id=course_id,
                patient_id="patient-outcomes-001",
                clinician_id="actor-clinician-demo",
                protocol_id="proto-01",
                condition_slug="mdd",
                modality_slug="tDCS",
                device_slug="demo",
                target_region="DLPFC",
                evidence_grade="A",
                on_label=True,
                planned_sessions_total=20,
                planned_sessions_per_week=3,
                planned_session_duration_minutes=30,
                status="active",
                sessions_delivered=0,
                review_required=False,
                updated_at=datetime.now(timezone.utc),
            ))
            db.commit()
    finally:
        db.close()


def test_list_outcomes_requires_auth():
    r = client.get("/api/v1/outcomes")
    assert r.status_code == 403


def test_list_outcomes_empty():
    r = client.get("/api/v1/outcomes", headers=CLINICIAN)
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_create_outcome_happy_path():
    _seed_course()
    r = client.post(
        "/api/v1/outcomes",
        headers=CLINICIAN,
        json={
            "patient_id": "patient-outcomes-001",
            "course_id": "course-outcomes-001",
            "template_id": "PHQ-9",
            "template_title": "Patient Health Questionnaire",
            "score": "14",
            "score_numeric": 14.0,
            "measurement_point": "baseline",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["template_id"] == "PHQ-9"
    assert body["score_numeric"] == 14.0
    assert "id" in body


def test_course_summary_not_found():
    r = client.get("/api/v1/outcomes/summary/no-such-course", headers=CLINICIAN)
    assert r.status_code == 404


def test_course_summary_empty_returns_shape():
    _seed_course("course-outcomes-002")
    r = client.get("/api/v1/outcomes/summary/course-outcomes-002", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["course_id"] == "course-outcomes-002"
    assert "summaries" in body


def test_aggregate_returns_keys():
    r = client.get("/api/v1/outcomes/aggregate", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "courses_with_outcomes" in body
    assert "responders" in body
    assert "responder_rate_pct" in body


def test_longitudinal_returns_series():
    r = client.get("/api/v1/outcomes/longitudinal", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "series" in body
    assert "cohort" in body


def test_longitudinal_invalid_range_returns_422():
    r = client.get(
        "/api/v1/outcomes/longitudinal?from=2026-06-01&to=2026-01-01",
        headers=CLINICIAN,
    )
    assert r.status_code == 422
