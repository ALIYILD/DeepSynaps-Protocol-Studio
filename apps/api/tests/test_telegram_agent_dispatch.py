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
from app.services.agents import pending_calls


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
# 4. Agent returns pending_tool_call → dispatcher attaches an inline
#    keyboard so the clinician can approve / reject in-band.
# ---------------------------------------------------------------------------


def test_dispatch_pending_tool_call_returns_inline_keyboard(
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
                "call_id": "a" * 32,
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
    # Quotes the LLM's one-line summary so the clinician knows what
    # they're approving.
    assert "Approve draft d-1 for patient P-7." in body
    assert "Approve or reject below." in body

    kb = out["inline_keyboard"]
    assert isinstance(kb, list) and len(kb) == 1
    row = kb[0]
    assert len(row) == 2
    approve, reject = row
    assert approve["text"].startswith("✅") and "Approve" in approve["text"]
    assert reject["text"].startswith("❌") and "Reject" in reject["text"]
    assert approve["callback_data"] == f"drclaw:apr:{'a' * 32}"
    assert reject["callback_data"] == f"drclaw:rej:{'a' * 32}"
    # callback_data must fit Telegram's 64-byte cap.
    assert len(approve["callback_data"]) <= 64
    assert len(reject["callback_data"]) <= 64
    assert out["pending_call_id"] == "a" * 32


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


# ---------------------------------------------------------------------------
# 8. Callback handling — happy paths + refusals + edit fallback.
#
# These tests drive ``handle_drclaw_callback`` directly (the webhook
# wiring is a single ``if cq:`` branch already covered by
# ``test_webhook_callback_query_routes_to_handler`` further down).
# ---------------------------------------------------------------------------


def _stub_telegram_io(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Replace the outbound Telegram helpers with capture-only stubs.

    Returns a dict of ``{"sends": [...], "edits": [...], "answers": [...]}``
    each call appends to. Lets each test assert the exact payload sent
    without spinning up a real bot.
    """
    captured: dict = {"sends": [], "edits": [], "answers": []}

    def fake_send(**kwargs):
        captured["sends"].append(kwargs)
        return {"ok": True, "message_id": 999}

    def fake_edit(**kwargs):
        captured["edits"].append(kwargs)
        return {"ok": True}

    def fake_answer(**kwargs):
        captured["answers"].append(kwargs)
        return {"ok": True}

    monkeypatch.setattr(tad, "send_message_with_keyboard", fake_send)
    monkeypatch.setattr(tad, "edit_message_text", fake_edit)
    monkeypatch.setattr(tad, "answer_callback_query", fake_answer)
    return captured


def _cq(call_id: str, opcode: str, *, chat_id: int, message_id: int = 77,
        cq_id: str = "cq-1", from_id: int = 5550101) -> dict:
    """Build a minimal Telegram callback_query payload for tests."""
    return {
        "id": cq_id,
        "from": {"id": from_id},
        "data": f"drclaw:{opcode}:{call_id}",
        "message": {
            "message_id": message_id,
            "chat": {"id": chat_id},
        },
    }


def test_handle_callback_approve_invokes_runner_and_edits_message(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Approve tap → runner gets ``confirmed_tool_call_id``, edit posted."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550010)
    captured = _stub_telegram_io(monkeypatch)

    call_id = "b" * 32
    runner_calls: list[dict] = []

    def fake_run_agent(agent, *, message, actor, db, confirmed_tool_call_id=None):
        runner_calls.append(
            {
                "agent_id": agent.id,
                "message": message,
                "actor_id": actor.actor_id,
                "confirmed_tool_call_id": confirmed_tool_call_id,
            }
        )
        return {
            "agent_id": agent.id,
            "reply": "Cancelled session sess-123.",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "tool_call_executed": {
                "tool_id": "sessions.cancel",
                "ok": True,
                "result_preview": "Cancelled session sess-123.",
                "audit_id": "audit-1",
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    tad.handle_drclaw_callback(
        db=db_session,
        bot_kind="clinician",
        callback_query=_cq(call_id, "apr", chat_id=chat_id),
    )

    assert len(runner_calls) == 1
    assert runner_calls[0]["confirmed_tool_call_id"] == call_id
    assert runner_calls[0]["agent_id"] == "clinic.drclaw_telegram"
    assert runner_calls[0]["actor_id"] == "actor-clinician-demo"
    assert runner_calls[0]["message"] == "approve"

    assert len(captured["edits"]) == 1
    edit = captured["edits"][0]
    assert edit["chat_id"] == chat_id
    assert edit["message_id"] == 77
    assert edit["text"].startswith("✓")
    assert "Cancelled session sess-123." in edit["text"]
    assert edit["inline_keyboard"] is None  # buttons removed

    assert captured["sends"] == []  # edit succeeded, no fallback send

    assert len(captured["answers"]) == 1
    assert captured["answers"][0]["callback_query_id"] == "cq-1"
    assert captured["answers"][0]["text"] == "Done"


def test_handle_callback_reject_consumes_pending_and_reports_cancelled(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reject tap → pending call dropped, no run_agent invocation."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550011)
    captured = _stub_telegram_io(monkeypatch)

    # Pre-register a real pending call so the reject path has something
    # to discard.
    pending = pending_calls.register(
        actor_id="actor-clinician-demo",
        agent_id=tad.DRCLAW_AGENT_ID,
        tool_id="sessions.cancel",
        args={"session_id": "sess-123"},
        summary="Cancel session sess-123",
    )

    def boom(*a, **kw):  # pragma: no cover — run_agent must not run on reject
        raise AssertionError("run_agent must NOT run on reject")

    monkeypatch.setattr(tad, "run_agent", boom)

    tad.handle_drclaw_callback(
        db=db_session,
        bot_kind="clinician",
        callback_query=_cq(pending.call_id, "rej", chat_id=chat_id),
    )

    # Pending call removed.
    assert pending_calls._peek(pending.call_id) is None

    # Edit posted with "Cancelled.", no buttons.
    assert len(captured["edits"]) == 1
    edit = captured["edits"][0]
    assert edit["text"] == "Cancelled."
    assert edit["inline_keyboard"] is None

    # Tooltip on the callback ack.
    assert captured["answers"] == [
        {"bot_kind": "clinician", "callback_query_id": "cq-1", "text": "Cancelled"}
    ]


def test_handle_callback_bad_shape_answers_with_error_no_runner(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Malformed callback_data → friendly answer, runner never called."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550012)
    captured = _stub_telegram_io(monkeypatch)

    def boom(*a, **kw):  # pragma: no cover
        raise AssertionError("run_agent must not be called for bad shape")

    monkeypatch.setattr(tad, "run_agent", boom)

    bad_payloads = [
        "garbage",
        "drclaw:nope:" + "a" * 32,    # wrong opcode
        "drclaw:apr:short",            # call_id wrong length
        "drclaw:apr:" + "Z" * 32,      # non-hex
        "other:apr:" + "a" * 32,       # wrong namespace
    ]
    for raw in bad_payloads:
        cq_payload = {
            "id": f"cq-{raw}",
            "from": {"id": 5550101},
            "data": raw,
            "message": {"message_id": 1, "chat": {"id": chat_id}},
        }
        tad.handle_drclaw_callback(
            db=db_session, bot_kind="clinician", callback_query=cq_payload
        )

    # No edits, no fallback sends — bad shape stops before any IO.
    assert captured["edits"] == []
    assert captured["sends"] == []
    # Each bad payload still gets a friendly callback ack.
    assert len(captured["answers"]) == len(bad_payloads)
    for ans in captured["answers"]:
        assert ans["text"] == "Action not recognised."


def test_handle_callback_unlinked_user_polite_refusal(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """callback_query from a chat that's not linked → polite refusal."""
    captured = _stub_telegram_io(monkeypatch)

    def boom(*a, **kw):  # pragma: no cover
        raise AssertionError("run_agent must not be called when unlinked")

    monkeypatch.setattr(tad, "run_agent", boom)

    tad.handle_drclaw_callback(
        db=db_session,
        bot_kind="clinician",
        # No _link_clinician_chat call — chat_id not in TelegramUserChat.
        callback_query=_cq("c" * 32, "apr", chat_id=8675309),
    )

    assert captured["edits"] == []
    assert captured["sends"] == []
    assert len(captured["answers"]) == 1
    assert captured["answers"][0]["text"] == "This account is not linked."


def test_handle_callback_expired_pending_call_reports_expired(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Approve for a call_id that no longer exists → 'expired' message."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550013)
    captured = _stub_telegram_io(monkeypatch)

    # Real runner invocation → pending_calls.consume returns None →
    # runner returns the documented ``pending_call_not_found`` envelope.
    # We don't stub run_agent here so the runner's expiry branch is
    # exercised end-to-end.
    pending_calls._reset()

    tad.handle_drclaw_callback(
        db=db_session,
        bot_kind="clinician",
        callback_query=_cq("d" * 32, "apr", chat_id=chat_id),
    )

    assert len(captured["edits"]) == 1
    assert "expired" in captured["edits"][0]["text"].lower()
    assert captured["edits"][0]["inline_keyboard"] is None
    assert captured["answers"][0]["text"] == "Expired"


def test_handle_callback_edit_failure_falls_back_to_fresh_message(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If edit_message_text returns ok=False, send a fresh message instead."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550014)

    captured: dict = {"sends": [], "edits": [], "answers": []}

    def fake_send(**kwargs):
        captured["sends"].append(kwargs)
        return {"ok": True, "message_id": 1234}

    def fake_edit(**kwargs):
        captured["edits"].append(kwargs)
        return {"ok": False, "error": "message too old"}

    def fake_answer(**kwargs):
        captured["answers"].append(kwargs)
        return {"ok": True}

    monkeypatch.setattr(tad, "send_message_with_keyboard", fake_send)
    monkeypatch.setattr(tad, "edit_message_text", fake_edit)
    monkeypatch.setattr(tad, "answer_callback_query", fake_answer)

    pending = pending_calls.register(
        actor_id="actor-clinician-demo",
        agent_id=tad.DRCLAW_AGENT_ID,
        tool_id="sessions.cancel",
        args={"session_id": "sess-x"},
        summary="Cancel sess-x",
    )

    tad.handle_drclaw_callback(
        db=db_session,
        bot_kind="clinician",
        callback_query=_cq(pending.call_id, "rej", chat_id=chat_id),
    )

    assert len(captured["edits"]) == 1
    assert len(captured["sends"]) == 1
    fallback = captured["sends"][0]
    assert fallback["chat_id"] == chat_id
    assert fallback["text"] == "Cancelled."
    assert fallback["inline_keyboard"] is None
    assert captured["answers"][0]["text"] == "Cancelled"


def test_dispatch_envelope_with_keyboard_round_trip_via_webhook(
    client: TestClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Webhook smoke — pending_tool_call envelope drives keyboard send.

    Asserts the wiring in ``telegram_router._handle_telegram_update``:
    when the dispatcher returns ``inline_keyboard``, the router calls
    ``send_message_with_keyboard`` (not the bare ``send_message``).
    """
    chat_id = _link_clinician_chat(db_session, chat_id=5550020)

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        return {
            "agent_id": agent.id,
            "reply": "ok",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "pending_tool_call": {
                "call_id": "e" * 32,
                "tool_id": "sessions.cancel",
                "args": {"session_id": "sess-1"},
                "summary": "Cancel session sess-1",
                "expires_at": "2099-01-01T00:00:00+00:00",
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    sends: list[dict] = []

    def fake_send_kb(**kwargs):
        sends.append(kwargs)
        return {"ok": True, "message_id": 11}

    monkeypatch.setattr(
        "app.routers.telegram_router.tg.send_message_with_keyboard",
        fake_send_kb,
    )

    # Plain send must NOT be called for a pending_tool_call envelope.
    def boom(*a, **kw):  # pragma: no cover — guard rail
        raise AssertionError(
            "tg.send_message must NOT be called for a pending_tool_call "
            "envelope; expected send_message_with_keyboard."
        )

    monkeypatch.setattr(
        "app.routers.telegram_router.tg.send_message",
        boom,
    )

    resp = client.post(
        "/api/v1/telegram/webhook/clinician",
        json={
            "message": {
                "chat": {"id": chat_id},
                "from": {"id": 5550020},
                "text": "cancel session sess-1",
            }
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    assert len(sends) == 1
    sent = sends[0]
    assert sent["chat_id"] == chat_id
    assert "Cancel session sess-1" in sent["text"]
    kb = sent["inline_keyboard"]
    assert kb[0][0]["callback_data"] == f"drclaw:apr:{'e' * 32}"
    assert kb[0][1]["callback_data"] == f"drclaw:rej:{'e' * 32}"


def test_webhook_callback_query_routes_to_handler(
    client: TestClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Webhook smoke — a callback_query update reaches the handler."""
    _link_clinician_chat(db_session, chat_id=5550030)

    captured: dict = {}

    def fake_handler(*, db, bot_kind, callback_query):
        captured["bot_kind"] = bot_kind
        captured["callback_query"] = callback_query

    monkeypatch.setattr(
        "app.services.telegram_agent_dispatch.handle_drclaw_callback",
        fake_handler,
    )

    payload = {
        "callback_query": {
            "id": "cq-99",
            "from": {"id": 1},
            "data": f"drclaw:apr:{'f' * 32}",
            "message": {"message_id": 1, "chat": {"id": 5550030}},
        }
    }
    resp = client.post(
        "/api/v1/telegram/webhook/clinician", json=payload
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert captured["bot_kind"] == "clinician"
    assert captured["callback_query"]["id"] == "cq-99"
