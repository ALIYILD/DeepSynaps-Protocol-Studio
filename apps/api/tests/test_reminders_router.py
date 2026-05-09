"""Tests for the reminders router (campaigns, outbox, adherence)."""
from __future__ import annotations

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


def test_campaigns_requires_auth():
    """GET /reminders/campaigns must reject unauthenticated requests."""
    r = client.get("/api/v1/reminders/campaigns")
    assert r.status_code == 403


def test_campaigns_empty():
    """Fresh DB returns empty campaigns list."""
    r = client.get("/api/v1/reminders/campaigns", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_create_campaign_and_retrieve():
    """Creating a campaign returns it in the list."""
    r = client.post("/api/v1/reminders/campaigns", headers=CLINICIAN_HDR, json={
        "name": "Weekly Session Reminder",
        "campaign_type": "session",
        "channel": "email",
        "message_template": "Your session is tomorrow at {{time}}.",
        "active": True,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Weekly Session Reminder"
    campaign_id = body["id"]

    r2 = client.get("/api/v1/reminders/campaigns", headers=CLINICIAN_HDR)
    ids = [c["id"] for c in r2.json()["items"]]
    assert campaign_id in ids


def test_update_campaign_toggle_active():
    """PUT campaign can toggle active flag."""
    r = client.post("/api/v1/reminders/campaigns", headers=CLINICIAN_HDR, json={
        "name": "Toggle Test Campaign",
        "campaign_type": "general",
        "channel": "sms",
        "message_template": "Hello!",
        "active": True,
    })
    assert r.status_code == 201
    cid = r.json()["id"]

    r_upd = client.put(f"/api/v1/reminders/campaigns/{cid}", headers=CLINICIAN_HDR, json={
        "active": False,
    })
    assert r_upd.status_code == 200
    assert r_upd.json()["active"] is False


def test_send_message_enqueues():
    """POST /reminders/send enqueues a message with status=queued."""
    r = client.post("/api/v1/reminders/send", headers=CLINICIAN_HDR, json={
        "patient_id": "pat-reminder-001",
        "channel": "email",
        "message_body": "Your appointment is confirmed.",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "queued"
    assert body["patient_id"] == "pat-reminder-001"


def test_outbox_returns_sent_message():
    """After sending, the outbox lists the message."""
    client.post("/api/v1/reminders/send", headers=CLINICIAN_HDR, json={
        "patient_id": "pat-reminder-002",
        "channel": "sms",
        "message_body": "Reminder: medication time.",
    })
    r = client.get("/api/v1/reminders/outbox", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    patient_ids = [m["patient_id"] for m in body["items"]]
    assert "pat-reminder-002" in patient_ids


def test_adherence_empty_patient():
    """Adherence for patient with no messages returns zero delivery rate."""
    r = client.get("/api/v1/reminders/adherence/pat-no-msgs", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["messages_sent"] == 0
    assert body["delivery_rate_pct"] == 0.0


def test_adherence_all_requires_auth():
    """GET /reminders/adherence must require auth."""
    r = client.get("/api/v1/reminders/adherence")
    assert r.status_code == 403
