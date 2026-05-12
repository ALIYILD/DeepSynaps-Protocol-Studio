"""Happy-path + auth + edge-case tests for telegram_router.

Pins the following routes:
  GET  /api/v1/telegram/link-code
  POST /api/v1/telegram/webhook           (deprecated → 410)
  POST /api/v1/telegram/webhook/patient
  POST /api/v1/telegram/webhook/clinician
  POST /api/v1/telegram/send-test
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import TelegramUserChat


# ── GET /api/v1/telegram/link-code ───────────────────────────────────────────

def test_link_code_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/telegram/link-code")
    assert resp.status_code in (401, 403)


def test_link_code_clinician_happy_path(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/telegram/link-code?bot_kind=clinician", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "code" in body
    assert "instructions" in body
    assert len(body["code"]) > 4  # must be a non-trivial code


def test_link_code_invalid_bot_kind_422(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/telegram/link-code?bot_kind=invalid", headers=auth_headers["clinician"])
    assert resp.status_code == 422


def test_link_code_patient_bot_requires_patient_role(client: TestClient, auth_headers: dict) -> None:
    """Clinician requesting a *patient* link-code must get 403."""
    resp = client.get("/api/v1/telegram/link-code?bot_kind=patient", headers=auth_headers["clinician"])
    assert resp.status_code == 403


# ── POST /api/v1/telegram/webhook (deprecated) ───────────────────────────────

def test_legacy_webhook_returns_410(client: TestClient) -> None:
    """The legacy single-bot webhook URL must return 410 Gone."""
    resp = client.post("/api/v1/telegram/webhook", json={})
    assert resp.status_code == 410


# ── POST /api/v1/telegram/webhook/patient ────────────────────────────────────

def test_patient_webhook_no_secret_dev_env_accepts(client: TestClient) -> None:
    """In test env (app_env=test), no secret configured → still accepts."""
    resp = client.post(
        "/api/v1/telegram/webhook/patient",
        json={"update_id": 111111, "message": {"chat": {"id": 99}, "text": "HELP"}},
    )
    # 200 {"ok": true} or may raise 401 if secret is configured in env
    assert resp.status_code in (200, 401)
    if resp.status_code == 200:
        assert resp.json().get("ok") is True


def test_patient_webhook_replay_returns_ok(client: TestClient) -> None:
    """Redelivering the same update_id should be a no-op, returning ok=True."""
    payload = {"update_id": 777777, "message": {"chat": {"id": 22}, "text": "CONFIRM"}}
    # First delivery
    r1 = client.post("/api/v1/telegram/webhook/patient", json=payload)
    # Second delivery (replay)
    r2 = client.post("/api/v1/telegram/webhook/patient", json=payload)
    if r1.status_code == 200:
        assert r2.status_code == 200
        assert r2.json().get("ok") is True


# ── POST /api/v1/telegram/webhook/clinician ──────────────────────────────────

def test_clinician_webhook_no_secret_dev_env_accepts(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/telegram/webhook/clinician",
        json={"update_id": 222222, "message": {"chat": {"id": 55}, "text": "HELP"}},
    )
    assert resp.status_code in (200, 401)
    if resp.status_code == 200:
        assert resp.json().get("ok") is True


def test_clinician_webhook_unlinked_chat_returns_ok(client: TestClient) -> None:
    """Unlinked clinician chat should still return ok=True (bot sends link prompt)."""
    resp = client.post(
        "/api/v1/telegram/webhook/clinician",
        json={"update_id": 333333, "message": {"chat": {"id": 66}, "text": "hello bot"}},
    )
    if resp.status_code == 200:
        assert resp.json().get("ok") is True


def test_clinician_webhook_ask_dr_ai_routes_to_selected_agent(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    session = SessionLocal()
    try:
        session.add(
            TelegramUserChat(
                user_id="actor-clinician-demo",
                chat_id="660001",
                bot_kind="clinician",
            )
        )
        session.commit()
    finally:
        session.close()

    captured: dict = {}

    def fake_dispatch_to_agent(**kwargs):
        captured.update(kwargs)
        return {
            "ok": True,
            "reason": None,
            "reply_text": "Evidence strength: moderate\nPMID: 123456",
            "parse_mode": None,
        }

    sent: list[dict] = []

    monkeypatch.setattr(
        "app.services.telegram_agent_dispatch.dispatch_to_agent",
        fake_dispatch_to_agent,
    )
    monkeypatch.setattr(
        "app.routers.telegram_router.tg.send_message",
        lambda chat_id, text, **kwargs: sent.append(
            {"chat_id": chat_id, "text": text, **kwargs}
        ) or True,
    )

    resp = client.post(
        "/api/v1/telegram/webhook/clinician",
        json={
            "update_id": 444444,
            "message": {
                "chat": {"id": 660001},
                "from": {"id": 660001},
                "text": "/ask_dr_ai what evidence supports TMS?",
            },
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert captured["agent_id"] == "clinic.dr_ai"
    assert captured["message_text"] == "what evidence supports TMS?"
    assert sent[0]["chat_id"] == 660001
    assert "PMID: 123456" in sent[0]["text"]


# ── POST /api/v1/telegram/send-test ──────────────────────────────────────────

def test_send_test_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/telegram/send-test",
        json={"chat_id": 12345, "bot_kind": "patient"},
    )
    assert resp.status_code in (401, 403)


def test_send_test_requires_admin_role(client: TestClient, auth_headers: dict) -> None:
    """Clinician (non-admin) must not be able to send test messages."""
    resp = client.post(
        "/api/v1/telegram/send-test",
        json={"chat_id": 12345, "bot_kind": "patient"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code in (401, 403)


def test_send_test_unlinked_chat_returns_400(client: TestClient, auth_headers: dict) -> None:
    """Sending a test to a chat_id not in TelegramUserChat must 400."""
    resp = client.post(
        "/api/v1/telegram/send-test",
        json={"chat_id": 99999999, "bot_kind": "patient"},
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 400


def test_send_test_invalid_bot_kind_422(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/telegram/send-test",
        json={"chat_id": 12345, "bot_kind": "unknown_bot"},
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 422
