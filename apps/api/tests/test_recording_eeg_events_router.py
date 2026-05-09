"""Tests for recording_eeg_events_router.py.

Covers:
- Auth: unauthenticated request rejected (403)
- GET /{id}/events returns empty list for unknown analysis
- POST /{id}/events creates event (201)
- GET /{id}/events returns created event
- PATCH /{id}/events/{eid} updates event
- DELETE /{id}/events/{eid} removes event (204)
- PATCH / DELETE unknown event returns 404
- GET /{id}/trials returns empty list for unknown analysis
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User
from app.services.auth_service import create_access_token


@pytest.fixture
def analysis_with_auth(client: TestClient):
    """Seed a minimal QEEGAnalysis and return (analysis_id, auth_headers)."""
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="EEG Events Clinic")
        db.add(clinic)
        db.flush()
        clin = User(
            id=str(uuid.uuid4()),
            email=f"eeg_evts_{uuid.uuid4().hex[:6]}@example.com",
            display_name="EEG Clinician",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add(clin)
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin.id,
            first_name="Ev",
            last_name="Patient",
        )
        db.add(patient)
        db.flush()
        analysis_id = str(uuid.uuid4())
        analysis = QEEGAnalysis(
            id=analysis_id,
            patient_id=patient.id,
            clinician_id=clin.id,
            file_ref="memory://eeg-events-test",
            original_filename="events.edf",
            file_size_bytes=1024,
            recording_duration_sec=60.0,
            sample_rate_hz=256.0,
            channel_count=8,
            channels_json='["Fp1","Fp2","F3","F4","C3","C4","P3","P4"]',
            recording_date="2026-01-15",
            analysis_status="completed",
        )
        db.add(analysis)
        db.commit()

        token = create_access_token(
            user_id=clin.id,
            email=clin.email,
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
    finally:
        db.close()

    # Use the locally captured analysis_id string (not from the detached ORM object)
    return {"analysis_id": analysis_id, "headers": {"Authorization": f"Bearer {token}"}}


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_list_events_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/recordings/eeg/some-id/events")
    assert r.status_code == 403


def test_list_trials_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/recordings/eeg/some-id/trials")
    assert r.status_code == 403


# ── Events CRUD ──────────────────────────────────────────────────────────────

def test_list_events_empty(client: TestClient, analysis_with_auth: dict) -> None:
    aid = analysis_with_auth["analysis_id"]
    hdrs = analysis_with_auth["headers"]
    r = client.get(f"/api/v1/recordings/eeg/{aid}/events", headers=hdrs)
    assert r.status_code == 200
    body = r.json()
    assert body["analysisId"] == aid
    assert body["events"] == []
    assert isinstance(body["fragments"], list)


def test_create_event_201(client: TestClient, analysis_with_auth: dict) -> None:
    aid = analysis_with_auth["analysis_id"]
    hdrs = analysis_with_auth["headers"]
    # type must be one of: label, fragment, artifact, spike
    r = client.post(
        f"/api/v1/recordings/eeg/{aid}/events",
        json={"type": "label", "fromSec": 1.0, "toSec": 2.5},
        headers=hdrs,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["ok"] is True
    ev = body["event"]
    assert ev["type"] == "label"


def test_list_events_after_create(client: TestClient, analysis_with_auth: dict) -> None:
    aid = analysis_with_auth["analysis_id"]
    hdrs = analysis_with_auth["headers"]
    client.post(
        f"/api/v1/recordings/eeg/{aid}/events",
        json={"type": "artifact", "fromSec": 0.5, "toSec": 1.0, "text": "blink"},
        headers=hdrs,
    )
    r = client.get(f"/api/v1/recordings/eeg/{aid}/events", headers=hdrs)
    assert r.status_code == 200
    assert len(r.json()["events"]) == 1


def test_patch_event(client: TestClient, analysis_with_auth: dict) -> None:
    aid = analysis_with_auth["analysis_id"]
    hdrs = analysis_with_auth["headers"]
    create_r = client.post(
        f"/api/v1/recordings/eeg/{aid}/events",
        json={"type": "label", "fromSec": 0.0, "toSec": 1.0, "text": "original"},
        headers=hdrs,
    )
    assert create_r.status_code == 201
    ev_id = create_r.json()["event"]["id"]

    patch_r = client.patch(
        f"/api/v1/recordings/eeg/{aid}/events/{ev_id}",
        json={"text": "updated"},
        headers=hdrs,
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["event"]["text"] == "updated"


def test_patch_unknown_event_returns_404(client: TestClient, analysis_with_auth: dict) -> None:
    aid = analysis_with_auth["analysis_id"]
    hdrs = analysis_with_auth["headers"]
    r = client.patch(
        f"/api/v1/recordings/eeg/{aid}/events/nonexistent-id",
        json={"text": "x"},
        headers=hdrs,
    )
    assert r.status_code == 404


def test_delete_event(client: TestClient, analysis_with_auth: dict) -> None:
    aid = analysis_with_auth["analysis_id"]
    hdrs = analysis_with_auth["headers"]
    create_r = client.post(
        f"/api/v1/recordings/eeg/{aid}/events",
        json={"type": "spike", "fromSec": 0.0, "toSec": 0.5},
        headers=hdrs,
    )
    assert create_r.status_code == 201
    ev_id = create_r.json()["event"]["id"]

    del_r = client.delete(f"/api/v1/recordings/eeg/{aid}/events/{ev_id}", headers=hdrs)
    assert del_r.status_code == 204

    list_r = client.get(f"/api/v1/recordings/eeg/{aid}/events", headers=hdrs)
    assert list_r.json()["events"] == []


def test_delete_unknown_event_returns_404(client: TestClient, analysis_with_auth: dict) -> None:
    aid = analysis_with_auth["analysis_id"]
    hdrs = analysis_with_auth["headers"]
    r = client.delete(f"/api/v1/recordings/eeg/{aid}/events/no-such-id", headers=hdrs)
    assert r.status_code == 404


# ── Trials ────────────────────────────────────────────────────────────────────

def test_list_trials_empty(client: TestClient, analysis_with_auth: dict) -> None:
    aid = analysis_with_auth["analysis_id"]
    hdrs = analysis_with_auth["headers"]
    r = client.get(f"/api/v1/recordings/eeg/{aid}/trials", headers=hdrs)
    assert r.status_code == 200
    body = r.json()
    assert body["analysisId"] == aid
    assert body["trials"] == []
