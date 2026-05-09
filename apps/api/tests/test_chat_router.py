"""Tests for chat_router — /api/v1/chat/*.

Pins:
  - /public accepts unauthenticated messages and returns a reply
  - /public rejects extra PHI fields (extra=forbid)
  - /clinician requires clinician role
  - /patient requires patient role
  - /agent requires clinician role
  - /sales stores an inquiry (happy-path)
  - /sales rejects too-short messages
  - /wearable-patient requires allowed role
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}
PATIENT = {"Authorization": "Bearer patient-demo-token"}
GUEST = {"Authorization": "Bearer guest-demo-token"}

_MSG = [{"role": "user", "content": "Hello"}]


# ── /public ───────────────────────────────────────────────────────────────────

def test_public_chat_no_auth():
    r = client.post("/api/v1/chat/public", json={"messages": _MSG})
    assert r.status_code == 200
    body = r.json()
    assert "reply" in body


def test_public_chat_returns_reply_string():
    r = client.post("/api/v1/chat/public", json={"messages": _MSG})
    assert isinstance(r.json()["reply"], str)


def test_public_chat_rejects_phi_fields():
    """extra=forbid means patient_id/patient_context are rejected with 422."""
    r = client.post(
        "/api/v1/chat/public",
        json={"messages": _MSG, "patient_id": "some-id"},
    )
    assert r.status_code == 422


# ── /sales ────────────────────────────────────────────────────────────────────

def test_sales_inquiry_happy_path():
    r = client.post(
        "/api/v1/chat/sales",
        json={"name": "Dr Test", "email": "test@example.com", "message": "Hello I am interested"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "inquiry_id" in body


def test_sales_inquiry_too_short_message():
    r = client.post(
        "/api/v1/chat/sales",
        json={"message": "hi"},
    )
    assert r.status_code == 422


# ── /clinician ────────────────────────────────────────────────────────────────

def test_clinician_chat_requires_auth():
    r = client.post("/api/v1/chat/clinician", json={"messages": _MSG})
    assert r.status_code == 403


def test_clinician_chat_requires_clinician_role():
    r = client.post("/api/v1/chat/clinician", headers=PATIENT, json={"messages": _MSG})
    assert r.status_code == 403


def test_clinician_chat_with_clinician_token():
    r = client.post("/api/v1/chat/clinician", headers=CLINICIAN, json={"messages": _MSG})
    assert r.status_code == 200
    assert "reply" in r.json()


# ── /patient ──────────────────────────────────────────────────────────────────

def test_patient_chat_requires_auth():
    r = client.post("/api/v1/chat/patient", json={"messages": _MSG})
    assert r.status_code == 403


def test_patient_chat_with_patient_token():
    r = client.post("/api/v1/chat/patient", headers=PATIENT, json={"messages": _MSG})
    assert r.status_code == 200
    assert "reply" in r.json()


# ── /agent ────────────────────────────────────────────────────────────────────

def test_agent_chat_requires_clinician_role():
    r = client.post("/api/v1/chat/agent", headers=PATIENT, json={"messages": _MSG})
    assert r.status_code == 403


def test_agent_chat_with_clinician_token():
    r = client.post("/api/v1/chat/agent", headers=CLINICIAN, json={"messages": _MSG})
    assert r.status_code == 200
    body = r.json()
    assert "reply" in body
    assert "cited_papers" in body


# ── /wearable-patient ─────────────────────────────────────────────────────────

def test_wearable_patient_requires_auth():
    r = client.post("/api/v1/chat/wearable-patient", json={"messages": _MSG})
    assert r.status_code == 403
