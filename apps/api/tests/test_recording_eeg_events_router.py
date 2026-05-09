"""Tests for recording_eeg_events_router — /api/v1/recordings/eeg/{id}/*.

Covers:
- GET /events requires clinician role (403)
- GET /events returns empty list for known analysis
- POST /events creates an event (201)
- POST /events 422 on missing required from_sec/to_sec
- PATCH /events/{event_id} updates an event
- DELETE /events/{event_id} removes event
- GET /trials returns empty list for known analysis
- POST /trials/sync requires clinician role
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User
from app.services.auth_service import create_access_token


@pytest.fixture
def eeg_events_analysis() -> dict:
    """Seed a minimal QEEGAnalysis and return ids + token."""
    with SessionLocal() as db:
        clinic = Clinic(id=str(uuid.uuid4()), name="Events Test Clinic")
        user = User(
            id=str(uuid.uuid4()),
            email=f"ev_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Events Clinician",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, user])
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=user.id,
            first_name="Events",
            last_name="Patient",
        )
        db.add(patient)
        db.flush()
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=user.id,
            file_ref="memory://events-test",
            original_filename="events.edf",
            recording_duration_sec=120.0,
            sample_rate_hz=256.0,
            analysis_status="completed",
        )
        db.add(analysis)
        db.commit()
        token = create_access_token(
            user_id=user.id, email=user.email, role="clinician",
            package_id="clinician_pro", clinic_id=clinic.id,
        )
        return {"analysis_id": analysis.id, "token": token}


def test_list_events_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/recordings/eeg/some-id/events")
    assert resp.status_code in (401, 403)


def test_list_events_unknown_analysis_404(
    client: TestClient, eeg_events_analysis: dict
) -> None:
    resp = client.get(
        "/api/v1/recordings/eeg/nonexistent-id/events",
        headers={"Authorization": f"Bearer {eeg_events_analysis['token']}"},
    )
    assert resp.status_code == 404


def test_list_events_empty_initially(
    client: TestClient, eeg_events_analysis: dict
) -> None:
    aid = eeg_events_analysis["analysis_id"]
    token = eeg_events_analysis["token"]
    resp = client.get(
        f"/api/v1/recordings/eeg/{aid}/events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysisId"] == aid
    assert isinstance(body["events"], list)
    assert isinstance(body["fragments"], list)


def test_create_event_happy_path(
    client: TestClient, eeg_events_analysis: dict
) -> None:
    aid = eeg_events_analysis["analysis_id"]
    token = eeg_events_analysis["token"]
    payload = {
        "type": "label",
        "fromSec": 5.0,
        "toSec": 10.0,
        "text": "Eyes opened",
    }
    resp = client.post(
        f"/api/v1/recordings/eeg/{aid}/events",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["event"]["type"] == "label"
    assert "id" in body["event"]


def test_create_event_missing_from_sec_422(
    client: TestClient, eeg_events_analysis: dict
) -> None:
    aid = eeg_events_analysis["analysis_id"]
    token = eeg_events_analysis["token"]
    resp = client.post(
        f"/api/v1/recordings/eeg/{aid}/events",
        json={"type": "marker"},  # missing fromSec, toSec
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_event_lifecycle_create_patch_delete(
    client: TestClient, eeg_events_analysis: dict
) -> None:
    aid = eeg_events_analysis["analysis_id"]
    token = eeg_events_analysis["token"]
    auth = {"Authorization": f"Bearer {token}"}

    # Create
    create_resp = client.post(
        f"/api/v1/recordings/eeg/{aid}/events",
        json={"type": "artifact", "fromSec": 20.0, "toSec": 25.0, "text": "Eye blink"},
        headers=auth,
    )
    assert create_resp.status_code == 201
    event_id = create_resp.json()["event"]["id"]

    # Patch
    patch_resp = client.patch(
        f"/api/v1/recordings/eeg/{aid}/events/{event_id}",
        json={"text": "Eye blink artifact"},
        headers=auth,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["event"]["text"] == "Eye blink artifact"

    # Delete
    del_resp = client.delete(
        f"/api/v1/recordings/eeg/{aid}/events/{event_id}",
        headers=auth,
    )
    assert del_resp.status_code == 204

    # Confirm gone
    list_resp = client.get(
        f"/api/v1/recordings/eeg/{aid}/events",
        headers=auth,
    )
    ids = [e["id"] for e in list_resp.json()["events"]]
    assert event_id not in ids


def test_list_trials_empty_initially(
    client: TestClient, eeg_events_analysis: dict
) -> None:
    aid = eeg_events_analysis["analysis_id"]
    token = eeg_events_analysis["token"]
    resp = client.get(
        f"/api/v1/recordings/eeg/{aid}/trials",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysisId"] == aid
    assert isinstance(body["trials"], list)


def test_sync_trials_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/recordings/eeg/some-id/trials/sync",
        json={"deltaMs": 10.0},
    )
    assert resp.status_code in (401, 403)
