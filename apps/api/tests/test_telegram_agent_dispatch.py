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
    # they're approving. With MarkdownV2 escaping, the dash and dots in
    # the summary text are backslash-escaped before being spliced into
    # the template. The trailing literal "." after "below" is also
    # escaped because "." is reserved in MarkdownV2.
    assert "Approve draft d\\-1 for patient P\\-7\\." in body
    assert "Approve or reject below\\." in body
    # Pending-tool envelope is sent as MarkdownV2 so the LLM-authored
    # summary keeps its formatting (bold patient names, italic times).
    assert out["parse_mode"] == "MarkdownV2"

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
    # Result preview is escaped — dash is reserved in MarkdownV2.
    assert "draft d\\-1 approved" in out["reply_text"]
    assert out["parse_mode"] == "MarkdownV2"


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
    # Result preview is escaped: dash and dot are MarkdownV2 reserved.
    assert "Cancelled session sess\\-123\\." in edit["text"]
    assert edit["inline_keyboard"] is None  # buttons removed
    assert edit["parse_mode"] == "MarkdownV2"

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
    # Summary is escaped (dash reserved in MarkdownV2).
    assert "Cancel session sess\\-1" in sent["text"]
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


# ---------------------------------------------------------------------------
# 9. MarkdownV2 — escape helper, parse_mode plumbing, and 400-fallback.
#
# These tests target the upgrade from plain Telegram text to MarkdownV2:
# replies render with bold patient names, italic timestamps, monospace
# IDs, and bullet lists. The escape helper is exhaustively covered; the
# dispatcher / callback handler are checked for parse_mode plumbing; and
# the IO-layer fallback (Telegram 400 → retry without parse_mode) is
# verified at the bot helper level so a malformed MarkdownV2 payload
# never silently drops the clinician's reply.
# ---------------------------------------------------------------------------


def test_escape_markdown_v2_escapes_all_18_reserved_characters() -> None:
    """All 18 reserved characters get a leading backslash, others pass through."""
    from app.services.telegram_service import escape_markdown_v2

    # Round-trip a representative example from the spec.
    assert escape_markdown_v2("Hello (world).") == "Hello \\(world\\)\\."

    # Every reserved character must be individually escaped.
    for ch in "_*[]()~`>#+-=|{}.!":
        assert escape_markdown_v2(ch) == f"\\{ch}", ch

    # Non-reserved characters are untouched (letters, digits, spaces,
    # apostrophes, colons, slashes — all common in clinician replies).
    assert escape_markdown_v2("abc 123 :/'") == "abc 123 :/'"
    assert escape_markdown_v2("") == ""


def test_dispatch_no_link_refusal_is_plain_text() -> None:
    """Auth refusals stay plain text — they include URLs that would
    require extra escaping if rendered as MarkdownV2 and the formatting
    adds no value to a "please run /link" prompt."""
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        out = tad.dispatch_clinician_message(
            db=s,
            telegram_user_id=42,
            telegram_chat_id=42,
            message_text="hi",
        )
    finally:
        s.close()
    assert out["ok"] is False
    # parse_mode key is present and explicitly None — the router must
    # not pass MarkdownV2 for refusal envelopes.
    assert out["parse_mode"] is None


def test_dispatch_package_refusal_is_plain_text(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Package-gate refusal: parse_mode is None so the upgrade prompt
    isn't fed through MarkdownV2 (avoids accidental escapes on the
    user-facing copy)."""
    user = db_session.query(User).filter_by(id="actor-clinician-demo").one()
    user.package_id = "explorer"
    db_session.commit()
    chat_id = _link_clinician_chat(db_session, chat_id=5550140)

    monkeypatch.setattr(
        tad, "run_agent",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("gated")),
    )

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=1,
        telegram_chat_id=chat_id,
        message_text="hi",
    )
    assert out["ok"] is False
    assert out["parse_mode"] is None


def test_dispatch_plain_reply_envelope_is_markdown_v2(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """LLM-authored plain replies are returned as MarkdownV2 untouched
    — the system prompt asks the LLM to escape user-supplied substrings
    on its own; re-escaping here would mangle bold / italic markers."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550141)

    formatted = "*Dr Smith* — _2pm_, see `pat-1`"

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        return {
            "agent_id": agent.id,
            "reply": formatted,
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=1,
        telegram_chat_id=chat_id,
        message_text="who's next?",
    )
    assert out["ok"] is True
    assert out["parse_mode"] == "MarkdownV2"
    # Reply is passed through verbatim (after .strip()) — the LLM owns
    # all escaping inside the formatted text.
    assert out["reply_text"] == formatted


def test_dispatch_pending_envelope_template_uses_explicit_escape(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Static pending-tool template: ``⚠️ {summary}\\n\\nApprove or
    reject below.`` — summary AND trailing dot must be escaped."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550142)

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        return {
            "agent_id": agent.id,
            "reply": "Awaiting approval.",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "pending_tool_call": {
                "call_id": "a" * 32,
                "tool_id": "sessions.book",
                "args": {},
                "summary": "Book Dr Smith's 2pm",
                "expires_at": "2099-01-01T00:00:00+00:00",
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=1,
        telegram_chat_id=chat_id,
        message_text="book Dr Smith's 2pm",
    )
    # Summary "Book Dr Smith's 2pm" has no reserved characters — passes
    # through verbatim. The trailing literal "." is reserved → escaped.
    assert out["reply_text"] == (
        "⚠️ Book Dr Smith's 2pm\n\nApprove or reject below\\."
    )
    assert out["parse_mode"] == "MarkdownV2"


def test_dispatch_tool_executed_escapes_dash_in_preview(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Result-preview escaping: ``"Booked: pat-1 at 14:00"`` →
    ``"✓ Booked: pat\\-1 at 14:00"`` (dash escaped, colons not reserved)."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550143)

    def fake_run_agent(agent, *, message, actor, db, **kwargs):
        return {
            "agent_id": agent.id,
            "reply": "ok",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "tool_call_executed": {
                "tool_id": "sessions.book",
                "ok": True,
                "result_preview": "Booked: pat-1 at 14:00",
                "audit_id": "audit-1",
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    out = tad.dispatch_clinician_message(
        db=db_session,
        telegram_user_id=1,
        telegram_chat_id=chat_id,
        message_text="confirm",
    )
    assert out["reply_text"] == "✓ Booked: pat\\-1 at 14:00"
    assert out["parse_mode"] == "MarkdownV2"


def test_handle_callback_approve_passes_parse_mode_markdown_v2(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Callback approve → edit_message_text receives parse_mode='MarkdownV2'
    AND the result_preview is escaped."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550150)
    captured = _stub_telegram_io(monkeypatch)

    def fake_run_agent(agent, *, message, actor, db, confirmed_tool_call_id=None):
        return {
            "agent_id": agent.id,
            "reply": "ok",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "tool_call_executed": {
                "tool_id": "sessions.cancel",
                "ok": True,
                "result_preview": "Cancelled sess-9 (P-2).",
                "audit_id": "audit-1",
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    tad.handle_drclaw_callback(
        db=db_session,
        bot_kind="clinician",
        callback_query=_cq("b" * 32, "apr", chat_id=chat_id),
    )

    assert len(captured["edits"]) == 1
    edit = captured["edits"][0]
    assert edit["parse_mode"] == "MarkdownV2"
    # All MarkdownV2-reserved characters in the preview are escaped.
    assert edit["text"] == "✓ Cancelled sess\\-9 \\(P\\-2\\)\\."


def test_handle_callback_reject_static_text_no_parse_mode(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reject's static "Cancelled." string is sent as plain text — there
    is no MarkdownV2 content and rendering it under MarkdownV2 would
    require escaping the trailing dot just to display "Cancelled." which
    adds no value."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550151)
    captured = _stub_telegram_io(monkeypatch)

    pending = pending_calls.register(
        actor_id="actor-clinician-demo",
        agent_id=tad.DRCLAW_AGENT_ID,
        tool_id="sessions.cancel",
        args={},
        summary="Cancel sess-x",
    )

    tad.handle_drclaw_callback(
        db=db_session,
        bot_kind="clinician",
        callback_query=_cq(pending.call_id, "rej", chat_id=chat_id),
    )

    assert len(captured["edits"]) == 1
    edit = captured["edits"][0]
    # parse_mode passed through as None — Telegram renders as plain text.
    assert edit.get("parse_mode") is None
    assert edit["text"] == "Cancelled."


def test_telegram_service_send_falls_back_to_plain_text_on_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mock the Telegram bot SDK directly: first call (with parse_mode)
    raises a Telegram 400 "can't parse entities", second call (no
    parse_mode) succeeds. The helper must report success."""
    from app.services import telegram_service as ts

    monkeypatch.setattr(
        ts, "_token_for_kind", lambda bot_kind: "fake-token"
    )

    calls: list[dict] = []

    class FakeBot:
        async def send_message(self, **kwargs):
            calls.append(kwargs)
            if "parse_mode" in kwargs:
                raise RuntimeError("Bad Request: can't parse entities at byte 13")
            return type("Sent", (), {"message_id": 42})()

    monkeypatch.setattr(ts, "_make_bot", lambda token: FakeBot())

    out = ts.send_message_with_keyboard(
        bot_kind="clinician",
        chat_id=123,
        text="*unbalanced",
        parse_mode="MarkdownV2",
    )
    assert out["ok"] is True
    assert out.get("fallback") is True
    assert out["message_id"] == 42

    # Two calls: first with parse_mode, second without.
    assert len(calls) == 2
    assert calls[0].get("parse_mode") == "MarkdownV2"
    assert "parse_mode" not in calls[1]


def test_telegram_service_send_double_400_returns_failure_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If both the MarkdownV2 send AND the plain-text retry fail, the
    helper returns ``{"ok": False, ...}`` instead of raising — the
    webhook must not crash."""
    from app.services import telegram_service as ts

    monkeypatch.setattr(
        ts, "_token_for_kind", lambda bot_kind: "fake-token"
    )

    calls: list[dict] = []

    class FakeBot:
        async def send_message(self, **kwargs):
            calls.append(kwargs)
            raise RuntimeError("Bad Request: can't parse entities")

    monkeypatch.setattr(ts, "_make_bot", lambda token: FakeBot())

    out = ts.send_message_with_keyboard(
        bot_kind="clinician",
        chat_id=123,
        text="*unbalanced",
        parse_mode="MarkdownV2",
    )
    assert out["ok"] is False
    assert "error" in out
    # No raise, despite both attempts failing.
    assert len(calls) == 2


def test_telegram_service_edit_falls_back_to_plain_text_on_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same retry contract for edit_message_text: first attempt with
    MarkdownV2 raises a parse error, second without parse_mode wins."""
    from app.services import telegram_service as ts

    monkeypatch.setattr(
        ts, "_token_for_kind", lambda bot_kind: "fake-token"
    )

    calls: list[dict] = []

    class FakeBot:
        async def edit_message_text(self, **kwargs):
            calls.append(kwargs)
            if "parse_mode" in kwargs:
                raise RuntimeError("Bad Request: can't parse entities")
            return None

    monkeypatch.setattr(ts, "_make_bot", lambda token: FakeBot())

    out = ts.edit_message_text(
        bot_kind="clinician",
        chat_id=123,
        message_id=99,
        text="*unbalanced",
        parse_mode="MarkdownV2",
    )
    assert out["ok"] is True
    assert out.get("fallback") is True
    assert len(calls) == 2
    assert calls[0].get("parse_mode") == "MarkdownV2"
    assert "parse_mode" not in calls[1]


def test_telegram_service_no_fallback_when_parse_mode_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A failure on a plain-text send (no parse_mode) does NOT trigger
    the fallback path — the failure is final and reported as-is."""
    from app.services import telegram_service as ts

    monkeypatch.setattr(
        ts, "_token_for_kind", lambda bot_kind: "fake-token"
    )

    calls: list[dict] = []

    class FakeBot:
        async def send_message(self, **kwargs):
            calls.append(kwargs)
            raise RuntimeError("network error")

    monkeypatch.setattr(ts, "_make_bot", lambda token: FakeBot())

    out = ts.send_message_with_keyboard(
        bot_kind="clinician",
        chat_id=123,
        text="hello",
        parse_mode=None,
    )
    assert out["ok"] is False
    # Only one attempt — fallback only fires when a parse_mode was set.
    assert len(calls) == 1


def test_drclaw_system_prompt_documents_markdown_v2() -> None:
    """The DrClaw system prompt must teach the LLM to emit MarkdownV2 —
    otherwise the LLM keeps producing plain text and the parse_mode
    upgrade is silent. A surgical regression guard so a future prompt
    rewrite doesn't accidentally drop the formatting contract."""
    from app.services.agents.registry import _DRCLAW_TELEGRAM_SYSTEM_PROMPT

    prompt = _DRCLAW_TELEGRAM_SYSTEM_PROMPT
    assert "MarkdownV2" in prompt
    assert "*bold*" in prompt
    assert "_italic_" in prompt
    assert "`monospace`" in prompt
    # The literal escape rule must be in the prompt — the dispatcher
    # trusts the LLM to emit pre-escaped text.
    assert "_*[]()~`>#+-=|{}.!" in prompt


def test_callback_query_smoke_still_works_after_markdown_upgrade(
    client: TestClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """End-to-end smoke: a callback_query approval still resolves with
    the new MarkdownV2 plumbing in place. Mirrors the existing webhook
    smoke but asserts parse_mode reaches the IO layer."""
    chat_id = _link_clinician_chat(db_session, chat_id=5550160)

    def fake_run_agent(agent, *, message, actor, db, confirmed_tool_call_id=None):
        return {
            "agent_id": agent.id,
            "reply": "ok",
            "schema_id": "deepsynaps.agents.run/v1",
            "safety_footer": "decision-support, not autonomous diagnosis",
            "context_used": [],
            "tool_call_executed": {
                "tool_id": "sessions.cancel",
                "ok": True,
                "result_preview": "Cancelled sess-7.",
                "audit_id": "audit-1",
            },
        }

    monkeypatch.setattr(tad, "run_agent", fake_run_agent)

    edits: list[dict] = []
    answers: list[dict] = []

    def fake_edit(**kw):
        edits.append(kw)
        return {"ok": True}

    def fake_answer(**kw):
        answers.append(kw)
        return {"ok": True}

    monkeypatch.setattr(tad, "edit_message_text", fake_edit)
    monkeypatch.setattr(tad, "answer_callback_query", fake_answer)

    payload = {
        "callback_query": {
            "id": "cq-md",
            "from": {"id": 7},
            "data": f"drclaw:apr:{'b' * 32}",
            "message": {"message_id": 5, "chat": {"id": chat_id}},
        }
    }
    resp = client.post(
        "/api/v1/telegram/webhook/clinician", json=payload
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    assert len(edits) == 1
    assert edits[0]["parse_mode"] == "MarkdownV2"
    assert edits[0]["text"] == "✓ Cancelled sess\\-7\\."
    assert len(answers) == 1
    assert answers[0]["text"] == "Done"
