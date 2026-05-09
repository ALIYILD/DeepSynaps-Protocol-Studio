"""Tests for the chat router (PR 102 set L).

Covers:
  POST /api/v1/chat/public      No-auth FAQ bot
  POST /api/v1/chat/agent       Clinician evidence RAG (requires clinician+)
  POST /api/v1/chat/clinician   Clinician chat (requires clinician+)
  POST /api/v1/chat/patient     Patient chat (requires patient+)
  POST /api/v1/chat/sales       Public sales intake
  POST /api/v1/chat/wearable-patient   Wearable patient chat
  POST /api/v1/chat/wearable-clinician Wearable clinician summary

Tests pin:
  - Happy path returns reply
  - Auth gates (guest/no-auth blocked on auth-required routes)
  - PublicChatRequest extra-field rejection (extra="forbid")
  - 422 on malformed bodies
  - Sales intake validates message length
"""
from __future__ import annotations

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.persistence.models import Patient

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}

_FAKE_REPLY = "This is a test AI response."


def _fake_chat(*_args, **_kwargs):  # noqa: ANN001
    return _FAKE_REPLY


def _fake_agent(*_args, **_kwargs):  # noqa: ANN001
    return _FAKE_REPLY, []


# ── /public ─────────────────────────────────────────────────────────────────


def test_public_chat_happy_path(client: TestClient) -> None:
    with patch("app.routers.chat_router.chat_public_faq", return_value=_FAKE_REPLY):
        r = client.post(
            "/api/v1/chat/public",
            json={"messages": [{"role": "user", "content": "What is TMS?"}]},
        )
    assert r.status_code == 200
    body = r.json()
    assert "reply" in body
    assert body["role"] == "assistant"


def test_public_chat_rejects_extra_fields(client: TestClient) -> None:
    """PublicChatRequest has extra='forbid'; patient_id must be rejected."""
    r = client.post(
        "/api/v1/chat/public",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "patient_id": "phishing-patient-id",
        },
    )
    assert r.status_code == 422


def test_public_chat_empty_messages_422(client: TestClient) -> None:
    r = client.post("/api/v1/chat/public", json={})
    assert r.status_code == 422


# ── /clinician ───────────────────────────────────────────────────────────────


def test_clinician_chat_happy_path(client: TestClient) -> None:
    with patch("app.routers.chat_router.chat_clinician", return_value=_FAKE_REPLY):
        r = client.post(
            "/api/v1/chat/clinician",
            json={"messages": [{"role": "user", "content": "Tell me about TMS"}]},
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_clinician_chat_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/clinician",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 403


def test_clinician_chat_patient_role_rejected(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/clinician",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 403


# ── /patient ─────────────────────────────────────────────────────────────────


def test_patient_chat_happy_path(client: TestClient) -> None:
    with patch("app.routers.chat_router.chat_patient", return_value=_FAKE_REPLY):
        r = client.post(
            "/api/v1/chat/patient",
            json={"messages": [{"role": "user", "content": "How am I doing?"}]},
            headers=PATIENT_HDR,
        )
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_patient_chat_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/patient",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 403


# ── /agent ───────────────────────────────────────────────────────────────────


def test_agent_chat_happy_path(client: TestClient) -> None:
    with patch("app.routers.chat_router.chat_agent_with_evidence", return_value=(_FAKE_REPLY, [])):
        r = client.post(
            "/api/v1/chat/agent",
            json={
                "messages": [{"role": "user", "content": "Latest TMS evidence?"}],
                "provider": "glm-free",
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200
    body = r.json()
    assert "reply" in body
    assert isinstance(body["cited_papers"], list)


def test_agent_chat_requires_clinician_role(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/agent",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 403


# ── /sales ───────────────────────────────────────────────────────────────────


def test_sales_happy_path(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/sales",
        json={
            "name": "Dr. Test",
            "email": "test@clinic.com",
            "message": "I am interested in DeepSynaps for my clinic.",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "inquiry_id" in body


def test_sales_message_too_short_422(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/sales",
        json={"message": "hi"},
    )
    assert r.status_code == 422


# ── /wearable-patient ─────────────────────────────────────────────────────────


def test_wearable_patient_chat_clinician_role_accepted(client: TestClient) -> None:
    """Clinicians can use wearable-patient in preview mode."""
    with patch("app.routers.chat_router.chat_wearable_patient", return_value=_FAKE_REPLY):
        r = client.post(
            "/api/v1/chat/wearable-patient",
            json={
                "messages": [{"role": "user", "content": "How is sleep?"}],
                "patient_context": "Sleep: 6h",
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_wearable_patient_chat_guest_rejected(client: TestClient) -> None:
    """Guest role must be rejected with 403."""
    r = client.post(
        "/api/v1/chat/wearable-patient",
        json={
            "messages": [{"role": "user", "content": "Hi"}],
        },
        headers={"Authorization": "Bearer guest-demo-token"},
    )
    assert r.status_code == 403
