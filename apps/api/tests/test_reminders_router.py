"""Tests for /api/v1/reminders (Reminder Campaigns).

Covers:
- GET /campaigns — auth gate, empty list
- POST /campaigns — happy path create, 201
- PUT /campaigns/{id} — update name + active toggle
- GET /outbox — auth gate, empty list
- POST /send — enqueue a message, 201
- GET /adherence/{patient_id} — zero-message baseline
- GET /adherence — all patients, empty
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.persistence.models import Patient

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_BASE = "/api/v1/reminders"


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _seed_patient() -> str:
    """Seed a Patient in the demo clinic for routes that gate on existence."""
    db = SessionLocal()
    try:
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id="actor-clinician-demo",
            first_name="Reminder",
            last_name="Test",
            email=f"reminder-{uuid.uuid4().hex[:8]}@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        return patient.id
    finally:
        db.close()


# ── Campaigns ────────────────────────────────────────────────────────────────

def test_list_campaigns_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/campaigns")
    assert r.status_code == 403


def test_list_campaigns_empty(client: TestClient) -> None:
    r = client.get(f"{_BASE}/campaigns", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_create_campaign_happy_path(client: TestClient) -> None:
    payload = {
        "name": "Session Reminder",
        "campaign_type": "session",
        "channel": "email",
        "message_template": "Your session is tomorrow.",
    }
    r = client.post(f"{_BASE}/campaigns", json=payload, headers=_CLINICIAN)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Session Reminder"
    assert body["campaign_type"] == "session"
    assert body["channel"] == "email"
    assert body["active"] is True
    assert "id" in body


def test_create_campaign_appears_in_list(client: TestClient) -> None:
    client.post(
        f"{_BASE}/campaigns",
        json={"name": "Medication Reminder", "campaign_type": "medication"},
        headers=_CLINICIAN,
    )
    r = client.get(f"{_BASE}/campaigns", headers=_CLINICIAN)
    assert r.status_code == 200
    names = [c["name"] for c in r.json()["items"]]
    assert "Medication Reminder" in names


def test_update_campaign_name_and_active(client: TestClient) -> None:
    cr = client.post(
        f"{_BASE}/campaigns",
        json={"name": "Old Name", "campaign_type": "general"},
        headers=_CLINICIAN,
    )
    assert cr.status_code == 201
    cid = cr.json()["id"]
    ur = client.put(
        f"{_BASE}/campaigns/{cid}",
        json={"name": "New Name", "active": False},
        headers=_CLINICIAN,
    )
    assert ur.status_code == 200
    body = ur.json()
    assert body["name"] == "New Name"
    assert body["active"] is False


def test_update_nonexistent_campaign_returns_404(client: TestClient) -> None:
    r = client.put(
        f"{_BASE}/campaigns/does-not-exist",
        json={"name": "Ghost"},
        headers=_CLINICIAN,
    )
    assert r.status_code == 404


# ── Outbox ───────────────────────────────────────────────────────────────────

def test_list_outbox_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/outbox")
    assert r.status_code == 403


def test_list_outbox_empty(client: TestClient) -> None:
    r = client.get(f"{_BASE}/outbox", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []


def test_send_message_enqueues_with_status_queued(client: TestClient) -> None:
    patient_id = _seed_patient()
    payload = {
        "patient_id": patient_id,
        "channel": "email",
        "message_body": "Please attend your session tomorrow.",
    }
    r = client.post(f"{_BASE}/send", json=payload, headers=_CLINICIAN)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "queued"
    assert body["patient_id"] == patient_id
    assert body["channel"] == "email"
    assert "id" in body


def test_send_message_requires_auth(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/send",
        json={"patient_id": "p1", "channel": "email", "message_body": "Hi"},
    )
    assert r.status_code == 403


# ── Adherence ────────────────────────────────────────────────────────────────

def test_get_patient_adherence_no_messages(client: TestClient) -> None:
    patient_id = _seed_patient()
    r = client.get(f"{_BASE}/adherence/{patient_id}", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["patient_id"] == patient_id
    assert body["messages_sent"] == 0
    assert body["messages_delivered"] == 0
    assert body["delivery_rate_pct"] == 0.0


def test_get_all_adherence_empty(client: TestClient) -> None:
    r = client.get(f"{_BASE}/adherence", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
