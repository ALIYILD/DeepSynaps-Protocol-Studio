"""Tests for :mod:`app.services.telegram_agent_dispatch`.

Covers the seam that wires the clinician Telegram bot into the DrClaw
Doctor agent runner. The runner itself (and its package gate at the
``/api/v1/agents`` HTTP layer) has its own unit tests; this module
focuses on the dispatcher's contract:

* unlinked Telegram chats are refused with a friendly link prompt,
* free clinicians (no Pro/Enterprise package) are refused with a friendly
  upgrade prompt before any LLM call happens,
* well-formed agent envelopes (plain reply, ``pending_tool_call``,
  ``tool_call_executed``) collapse to the expected Telegram strings,
* slash-commands stay owned by the existing webhook handler and never
  reach the agent dispatcher.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import TelegramUserChat, User
from app.services import telegram_agent_dispatch as tad


# ---------------------------------------------------------------------------
# Shared LLM stub — keeps the module DB-only and provider-independent.
# Individual tests override the runner directly when they need to assert
# pending_tool_call / tool_call_executed envelopes.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.chat_service._llm_chat",
        lambda **kwargs: "Hello from agent.",
    )


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _link_clinician_chat(
    db_session,
    *,
    user_id: str = "actor-clinician-demo",
    chat_id: int = 5550001,
    bot_kind: str = "clinician",
) -> int:
    """Helper — bind a Telegram chat_id to the seeded clinician user.

    Returns the chat_id back so callers can chain it into the dispatcher.
    """
    db_session.add(
        TelegramUserChat(
            user_id=user_id,
            chat_id=str(chat_id),
            bot_kind=bot_kind,
        )
    )
    db_session.commit()
    return chat_id


# ---------------------------------------------------------------------------
# 1. No linked account → refused with friendly link prompt.
# ---------------------------------------------------------------------------


def test_dispatch_no_linked_account_returns_link_prompt(db_session) -> None:
    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=42,
        telegram_chat_id=42,
        message_text="hello?",
    )
    assert out["ok"] is False
    assert out["reason"] == "no_linked_account"
    assert "isn't linked" in out["reply_text"]
    assert "/link" in out["reply_text"]


# ---------------------------------------------------------------------------
# 2. Linked clinician + entitled package → run_agent invoked, reply
#    flows back verbatim. Patches `run_agent` so we can assert the
#    arguments AND avoid depending on the LLM/tool dispatcher internals.
# ---------------------------------------------------------------------------


def test_dispatch_linked_clinician_invokes_runner_and_returns_reply(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    chat_id = _link_clinician_chat(db_session)

    captured: dict = {}

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        captured["agent_id"] = agent.id
        captured["message"] = message
        captured["actor_id"] = actor.actor_id
        captured["actor_role"] = actor.role
        captured["actor_package"] = actor.package_id
        return {
            "agent_id": agent.id,
            "reply": "Sure — here's your queue.",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=999,
        telegram_chat_id=chat_id,
        message_text="What's on my list today?",
    )

    assert out["ok"] is True
    assert out["reply_text"] == "Sure — here's your queue."
    assert captured["agent_id"] == "clinic.drclaw_telegram"
    assert captured["message"] == "What's on my list today?"
    assert captured["actor_id"] == "actor-clinician-demo"
    assert captured["actor_role"] == "clinician"
    assert captured["actor_package"] == "clinician_pro"


# ---------------------------------------------------------------------------
# 3. Linked clinician but free / wrong package → refused before LLM call.
# ---------------------------------------------------------------------------


def test_dispatch_linked_clinician_wrong_package_refused(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Demote the seeded clinician to the free tier.
    user = db_session.query(User).filter_by(id="actor-clinician-demo").one()
    user.package_id = "explorer"
    db_session.commit()
    chat_id = _link_clinician_chat(db_session)

    # Hard-fail if the dispatcher reaches the runner — the package gate
    # MUST short-circuit first.
    def boom(*a, **k):  # pragma: no cover — guard rail
        raise AssertionError("run_agent must not be called when package gated")

    monkeypatch.setattr(tad, "run_agent", boom)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=1,
        telegram_chat_id=chat_id,
        message_text="hi",
    )
    assert out["ok"] is False
    assert out["reason"] == "package_not_allowed"
    assert "Pro or Enterprise" in out["reply_text"]


# ---------------------------------------------------------------------------
# 4. Agent returns pending_tool_call → reply tells clinician to switch
#    to the web app and quotes the agent's summary line.
# ---------------------------------------------------------------------------


def test_dispatch_pending_tool_call_routes_to_web_app(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    chat_id = _link_clinician_chat(db_session, chat_id=5550002)

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        return {
            "agent_id": agent.id,
            "reply": "Awaiting your approval.",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "pending_tool_call": {
                "call_id": "call-abc",
                "tool_id": "notes.approve_draft",
                "args": {"draft_id": "d-1"},
                "summary": "Approve draft d-1 for patient P-7.",
                "expires_at": "2099-01-01T00:00:00+00:00",
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=2,
        telegram_chat_id=chat_id,
        message_text="approve the draft for P-7",
    )
    assert out["ok"] is True
    body = out["reply_text"]
    assert "open the DeepSynaps app" in body
    assert tad.WEB_APP_URL in body
    assert "Approve draft d-1 for patient P-7." in body


# ---------------------------------------------------------------------------
# 5. Agent returns tool_call_executed ok=True → reply prefixed with "✓".
# ---------------------------------------------------------------------------


def test_dispatch_tool_call_executed_ok_prefixes_check(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    chat_id = _link_clinician_chat(db_session, chat_id=5550003)

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        return {
            "agent_id": agent.id,
            "reply": "ok",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "tool_call_executed": {
                "tool_id": "notes.approve_draft",
                "ok": True,
                "result_preview": "draft d-1 approved",
                "audit_id": "audit-1",
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=3,
        telegram_chat_id=chat_id,
        message_text="confirm",
    )
    assert out["ok"] is True
    assert out["reply_text"].startswith("✓")
    assert "draft d-1 approved" in out["reply_text"]


def test_dispatch_tool_call_executed_failure_prefixes_cross(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    chat_id = _link_clinician_chat(db_session, chat_id=5550004)

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        return {
            "agent_id": agent.id,
            "reply": "",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "tool_call_executed": {
                "tool_id": "notes.approve_draft",
                "ok": False,
                "result_preview": "permission denied",
                "audit_id": None,
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=4,
        telegram_chat_id=chat_id,
        message_text="confirm",
    )
    assert out["reply_text"].startswith("✗")
    assert "permission denied" in out["reply_text"]


# ---------------------------------------------------------------------------
# 6. Agent returns plain reply → returned verbatim (after strip).
# ---------------------------------------------------------------------------


def test_dispatch_plain_reply_returned_verbatim(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    chat_id = _link_clinician_chat(db_session, chat_id=5550005)

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        return {
            "agent_id": agent.id,
            "reply": "  You have 3 sessions today.\n",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=5,
        telegram_chat_id=chat_id,
        message_text="anything today?",
    )
    assert out["ok"] is True
    assert out["reply_text"] == "You have 3 sessions today."


# ---------------------------------------------------------------------------
# 7. Slash-commands NOT routed through agent — webhook handler still owns
#    them. End-to-end through the FastAPI route to assert the dispatcher
#    is never invoked for /start, LINK <code>, CONFIRM, CANCEL, /help.
# ---------------------------------------------------------------------------


def test_webhook_slash_commands_bypass_agent_dispatcher(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Webhook smoke — slash + word commands never reach the agent."""
    # Booby-trap: any call into the dispatcher fails the test loudly.
    def boom(**kwargs):  # pragma: no cover — guard rail
        raise AssertionError(
            "dispatch_clinician_message must not be called for slash "
            f"commands; got {kwargs!r}"
        )

    monkeypatch.setattr(
        "app.services.telegram_agent_dispatch.dispatch_clinician_message",
        boom,
    )
    # The router imports the dispatcher lazily (inside the handler); also
    # patch the qualified name the router will resolve at call time.
    monkeypatch.setattr(
        "app.routers.telegram_router.tg.send_message",
        lambda *a, **k: True,
    )

    chat_id = 9999001
    for text in ("/start", "/help", "help", "CONFIRM", "CANCEL"):
        resp = client.post(
            "/api/v1/telegram/webhook/clinician",
            json={"message": {"chat": {"id": chat_id}, "text": text}},
        )
        # All slash / word commands return ``{"ok": True}`` and never
        # touch the agent dispatcher.
        assert resp.status_code == 200, (text, resp.text)
        assert resp.json() == {"ok": True}, (text, resp.json())
