"""Tests for the Virtual Care router (PR 102 set L).

Covers:
  POST  /api/v1/virtual-care/sessions
  GET   /api/v1/virtual-care/sessions/{id}
  PATCH /api/v1/virtual-care/sessions/{id}/start
  PATCH /api/v1/virtual-care/sessions/{id}/end
  POST  /api/v1/virtual-care/sessions/{id}/biometrics
  GET   /api/v1/virtual-care/sessions/{id}/biometrics
  POST  /api/v1/virtual-care/sessions/{id}/voice-analysis
  GET   /api/v1/virtual-care/sessions/{id}/voice-analysis
  POST  /api/v1/virtual-care/sessions/{id}/video-analysis
  GET   /api/v1/virtual-care/sessions/{id}/analysis
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.persistence.models import Patient, User

PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


@pytest.fixture
def patient_user():
    """Seed a User + Patient pair so the patient actor can resolve."""
    db = SessionLocal()
    try:
        user = User(
            id="vc-user-001",
            email="vc-patient@deepsynaps.com",
            display_name="VC Patient",
            hashed_password="x",
            role="patient",
            package_id="explorer",
        )
        db.add(user)
        patient = Patient(
            id="vc-patient-001",
            clinician_id="actor-clinician-demo",
            first_name="VC",
            last_name="Patient",
            email="patient@demo.com",  # matches demo actor lookup
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        yield patient
    finally:
        db.close()


# ── Role gate ────────────────────────────────────────────────────────────────


def test_create_session_requires_patient_role(client: TestClient) -> None:
    """Clinicians must get 403 on patient-scoped virtual-care endpoints."""
    r = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "video"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 403


def test_create_session_unauthenticated_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "video"},
    )
    assert r.status_code == 403


# ── Session CRUD ─────────────────────────────────────────────────────────────


def test_create_session_happy_path(client: TestClient, patient_user) -> None:
    r = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "video"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    assert "session" in body
    assert body["session"]["status"] == "scheduled"
    assert body["session"]["session_type"] == "video"


def test_create_session_invalid_type_422(client: TestClient, patient_user) -> None:
    r = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "smoke_signal"},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


def test_get_session_happy_path(client: TestClient, patient_user) -> None:
    # Create first
    cr = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "voice"},
        headers=PATIENT_HDR,
    )
    assert cr.status_code == 201
    session_id = cr.json()["session"]["id"]

    r = client.get(f"/api/v1/virtual-care/sessions/{session_id}", headers=PATIENT_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["session"]["id"] == session_id
    assert "biometrics_count" in body["session"]


def test_get_session_404_unknown(client: TestClient, patient_user) -> None:
    r = client.get(
        "/api/v1/virtual-care/sessions/nonexistent-session-id",
        headers=PATIENT_HDR,
    )
    assert r.status_code == 404


def test_start_session_transitions_to_active(client: TestClient, patient_user) -> None:
    cr = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "video"},
        headers=PATIENT_HDR,
    )
    session_id = cr.json()["session"]["id"]

    sr = client.patch(
        f"/api/v1/virtual-care/sessions/{session_id}/start",
        headers=PATIENT_HDR,
    )
    assert sr.status_code == 200
    assert sr.json()["session"]["status"] == "active"


def test_end_session_without_prior_start(client: TestClient, patient_user) -> None:
    """Ending a session that was never started (no started_at) should not crash."""
    cr = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "voice"},
        headers=PATIENT_HDR,
    )
    session_id = cr.json()["session"]["id"]

    er = client.patch(
        f"/api/v1/virtual-care/sessions/{session_id}/end",
        headers=PATIENT_HDR,
    )
    # Session with no started_at: duration computation is skipped; status → ended
    assert er.status_code == 200
    assert er.json()["session"]["status"] == "ended"


# ── Biometrics ───────────────────────────────────────────────────────────────


def test_submit_and_list_biometrics(client: TestClient, patient_user) -> None:
    cr = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "video"},
        headers=PATIENT_HDR,
    )
    session_id = cr.json()["session"]["id"]

    r = client.post(
        f"/api/v1/virtual-care/sessions/{session_id}/biometrics",
        json={"source": "wearable", "heart_rate_bpm": 72},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 201
    assert r.json()["biometrics"]["heart_rate_bpm"] == 72

    lr = client.get(
        f"/api/v1/virtual-care/sessions/{session_id}/biometrics",
        headers=PATIENT_HDR,
    )
    assert lr.status_code == 200
    assert len(lr.json()["biometrics"]) >= 1


# ── Voice analysis ───────────────────────────────────────────────────────────


def test_submit_voice_analysis_happy_path(client: TestClient, patient_user) -> None:
    cr = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "video"},
        headers=PATIENT_HDR,
    )
    session_id = cr.json()["session"]["id"]

    r = client.post(
        f"/api/v1/virtual-care/sessions/{session_id}/voice-analysis",
        json={
            "segment_start_sec": 0,
            "segment_end_sec": 30,
            "sentiment": "neutral",
            "stress_level": 20,
        },
        headers=PATIENT_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["voice_analysis"]["sentiment"] == "neutral"


def test_submit_voice_analysis_invalid_sentiment_422(client: TestClient, patient_user) -> None:
    cr = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "video"},
        headers=PATIENT_HDR,
    )
    session_id = cr.json()["session"]["id"]

    r = client.post(
        f"/api/v1/virtual-care/sessions/{session_id}/voice-analysis",
        json={
            "segment_start_sec": 0,
            "segment_end_sec": 10,
            "sentiment": "ecstatic",  # invalid
            "stress_level": 10,
        },
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


# ── Unified analysis ─────────────────────────────────────────────────────────


def test_get_unified_analysis_happy_path(client: TestClient, patient_user) -> None:
    cr = client.post(
        "/api/v1/virtual-care/sessions",
        json={"session_type": "video"},
        headers=PATIENT_HDR,
    )
    session_id = cr.json()["session"]["id"]

    r = client.get(
        f"/api/v1/virtual-care/sessions/{session_id}/analysis",
        headers=PATIENT_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert "session" in body
    assert "latest_biometrics" in body
    assert "voice_analysis" in body
    assert "video_analysis" in body
