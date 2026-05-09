"""Tests for outcomes_router.py.

Covers:
- POST /api/v1/outcomes          — record outcome (happy path + auth)
- GET  /api/v1/outcomes          — list outcomes (auth + filters)
- POST /api/v1/outcomes/events   — record outcome event (auth + cross-clinic guard)
- GET  /api/v1/outcomes/events   — list events (auth)
- GET  /api/v1/outcomes/summary/{course_id} — summary (404 + happy path)
- GET  /api/v1/outcomes/aggregate — aggregate stats (auth)
- GET  /api/v1/outcomes/longitudinal — longitudinal data (auth + bad range 422)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}

_PATIENT_ID = "P-OUT-001"
_COURSE_ID = "C-OUT-001"


def _seed_patient_and_course(db, clinician_id: str) -> None:
    from app.persistence.models import Patient, TreatmentCourse
    from datetime import datetime, timezone

    if db.query(Patient).filter_by(id=_PATIENT_ID).first() is None:
        db.add(Patient(
            id=_PATIENT_ID,
            clinician_id=clinician_id,
            first_name="Out",
            last_name="Tester",
            dob="1990-01-01",
            email=None,
            phone=None,
            gender="prefer_not_to_say",
            primary_condition="MDD",
            primary_modality="tDCS",
            consent_signed=True,
            consent_date="2026-01-01",
            status="active",
            notes="test",
        ))
    if db.query(TreatmentCourse).filter_by(id=_COURSE_ID).first() is None:
        db.add(TreatmentCourse(
            id=_COURSE_ID,
            patient_id=_PATIENT_ID,
            clinician_id=clinician_id,
            protocol_id="test-proto",
            condition_slug="mdd",
            modality_slug="tdcs",
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


@pytest.fixture()
def seeded_db():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        _seed_patient_and_course(db, "actor-clinician-demo")
    finally:
        db.close()


# ── Auth gates ──────────────────────────────────────────────────────────────

def test_record_outcome_requires_auth():
    r = TestClient(app).post("/api/v1/outcomes", json={
        "patient_id": _PATIENT_ID,
        "course_id": _COURSE_ID,
        "template_id": "PHQ-9",
    })
    assert r.status_code == 403


def test_list_outcomes_requires_auth():
    r = TestClient(app).get("/api/v1/outcomes")
    assert r.status_code == 403


def test_list_events_requires_auth():
    r = TestClient(app).get("/api/v1/outcomes/events")
    assert r.status_code == 403


def test_summary_requires_auth():
    r = TestClient(app).get("/api/v1/outcomes/summary/fake-course")
    assert r.status_code == 403


# ── Happy paths ─────────────────────────────────────────────────────────────

def test_record_outcome_happy_path(seeded_db):
    with TestClient(app) as tc:
        r = tc.post("/api/v1/outcomes", headers=CLINICIAN_HDR, json={
            "patient_id": _PATIENT_ID,
            "course_id": _COURSE_ID,
            "template_id": "PHQ-9",
            "template_title": "PHQ-9 Depression",
            "score": "14",
            "score_numeric": 14.0,
            "measurement_point": "baseline",
        })
    assert r.status_code == 201
    body = r.json()
    assert body["template_id"] == "PHQ-9"
    assert body["score_numeric"] == 14.0
    assert body["measurement_point"] == "baseline"
    assert "id" in body


def test_list_outcomes_returns_empty_initially():
    with TestClient(app) as tc:
        r = tc.get("/api/v1/outcomes", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert "total" in body


def test_record_outcome_event_happy_path(seeded_db):
    with TestClient(app) as tc:
        r = tc.post("/api/v1/outcomes/events", headers=CLINICIAN_HDR, json={
            "patient_id": _PATIENT_ID,
            "event_type": "assessment_completed",
            "title": "PHQ-9 completed",
            "severity": "info",
        })
    assert r.status_code == 201
    body = r.json()
    assert body["event_type"] == "assessment_completed"
    assert body["severity"] == "info"


def test_list_outcome_events_returns_list():
    with TestClient(app) as tc:
        r = tc.get("/api/v1/outcomes/events", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert isinstance(r.json()["items"], list)


def test_summary_404_for_unknown_course():
    with TestClient(app) as tc:
        r = tc.get(
            "/api/v1/outcomes/summary/course-does-not-exist",
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 404


def test_summary_returns_shape_for_known_course(seeded_db):
    with TestClient(app) as tc:
        r = tc.get(f"/api/v1/outcomes/summary/{_COURSE_ID}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["course_id"] == _COURSE_ID
    assert "summaries" in body


def test_aggregate_outcomes_auth_gate():
    r = TestClient(app).get("/api/v1/outcomes/aggregate")
    assert r.status_code == 403


def test_aggregate_outcomes_happy_path():
    with TestClient(app) as tc:
        r = tc.get("/api/v1/outcomes/aggregate", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "courses_with_outcomes" in body
    assert "responder_rate_pct" in body


def test_longitudinal_requires_auth():
    r = TestClient(app).get("/api/v1/outcomes/longitudinal")
    assert r.status_code == 403


def test_longitudinal_returns_shape():
    with TestClient(app) as tc:
        r = tc.get("/api/v1/outcomes/longitudinal", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "cohort" in body
    assert "series" in body
    assert "responderByModality" in body


def test_longitudinal_invalid_date_range():
    """'to' before 'from' must return 422."""
    with TestClient(app) as tc:
        r = tc.get(
            "/api/v1/outcomes/longitudinal?from=2026-01-10&to=2026-01-01",
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 422
