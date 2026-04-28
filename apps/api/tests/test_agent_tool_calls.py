"""Tests for Phase 2.5 — constrained LLM tool-calling with two-step
clinician confirmation.

Covers:

* Plain-text LLM reply → returned as-is, no ``pending_tool_call``.
* JSON-on-first-line → ``pending_tool_call`` envelope with call id,
  echoed args, ISO ``expires_at`` in the future.
* Confirming with the right id → tool dispatcher executes; row inserted.
* Confirming with the WRONG actor → "expired or not found" envelope.
* Confirming after TTL has elapsed → expired envelope.
* Confirming twice → second time rejected (consume is one-shot).
* Tool not in agent's allowlist → refusal reply, no pending entry.
* ``sessions.create`` happy / cross-clinic / time-conflict paths.
* ``sessions.cancel`` happy / already-cancelled / cross-clinic /
  unknown-id paths.
* ``notes.approve_draft`` happy / already-approved / cross-clinic /
  wrong-clinician / edits-applied paths.
* Unknown tool id at confirmation time surfaces as a clear error.
"""
from __future__ import annotations

import json as _json
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import (
    ClinicalSession,
    ClinicianMediaNote,
    ClinicianNoteDraft,
    Patient,
)
from app.services.agents import pending_calls, runner as agent_runner
from app.services.agents import tool_dispatcher
from app.services.agents.registry import AGENT_REGISTRY


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_pending() -> None:
    """Each test starts with an empty pending-call store."""
    pending_calls._reset()
    yield
    pending_calls._reset()


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def clinician_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Verified Clinician Demo",
        role="clinician",  # type: ignore[arg-type]
        package_id="clinician_pro",
        clinic_id="clinic-demo-default",
    )


@pytest.fixture
def other_clinician_actor() -> AuthenticatedActor:
    """A second clinician used to prove cross-actor confirmation is denied."""
    return AuthenticatedActor(
        actor_id="actor-other-clinician",
        display_name="Other Clinician",
        role="clinician",  # type: ignore[arg-type]
        package_id="clinician_pro",
        clinic_id="clinic-other",
    )


@pytest.fixture
def seeded_patient(db_session, clinician_actor: AuthenticatedActor) -> Patient:
    """A patient owned by the demo clinician."""
    p = Patient(
        id="pat-tool-call-1",
        clinician_id=clinician_actor.actor_id,
        first_name="Test",
        last_name="Patient",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


@pytest.fixture
def seeded_other_clinic_patient(db_session) -> Patient:
    """A patient owned by a *different* clinician — used for cross-clinic tests."""
    p = Patient(
        id="pat-other-clinic-1",
        clinician_id="actor-other-clinician",
        first_name="Other",
        last_name="Clinic",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def _stub_llm(monkeypatch: pytest.MonkeyPatch, reply: str) -> None:
    monkeypatch.setattr(
        "app.services.chat_service._llm_chat", lambda **k: reply
    )


# ---------------------------------------------------------------------------
# Plain-text vs tool-call parsing
# ---------------------------------------------------------------------------


def test_plain_text_reply_returns_no_pending_tool_call(
    db_session,
    clinician_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_llm(monkeypatch, "Sure, here's a summary.")
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="Hi",
        actor=clinician_actor,
        db=db_session,
    )
    assert result["reply"] == "Sure, here's a summary."
    assert "pending_tool_call" not in result
    assert "tool_call_executed" not in result


def test_first_line_json_returns_pending_tool_call(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    starts_at = "2030-05-15T14:00:00Z"
    llm_reply = (
        '{"tool_call": {"id": "sessions.create", "args": '
        f'{{"patient_id": "{seeded_patient.id}", "starts_at": "{starts_at}"}}, '
        '"summary": "Book on May 15 14:00"}}\n'
        "Approval needed."
    )
    _stub_llm(monkeypatch, llm_reply)

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="Book a session.",
        actor=clinician_actor,
        db=db_session,
    )
    pending = result.get("pending_tool_call")
    assert pending is not None, result
    assert pending["tool_id"] == "sessions.create"
    assert pending["args"]["patient_id"] == seeded_patient.id
    assert pending["args"]["starts_at"] == starts_at
    # Call id is a uuid hex (32 chars).
    assert isinstance(pending["call_id"], str) and len(pending["call_id"]) == 32
    # expires_at must be in the future.
    expires = datetime.fromisoformat(pending["expires_at"])
    assert expires > datetime.now(timezone.utc)
    # Reply carries the LLM's prose-after-JSON, not the JSON itself.
    assert result["reply"] == "Approval needed."


# ---------------------------------------------------------------------------
# Confirmation flow
# ---------------------------------------------------------------------------


def _register_pending_call(
    actor: AuthenticatedActor,
    *,
    agent_id: str = "clinic.reception",
    tool_id: str = "sessions.create",
    args: dict[str, Any] | None = None,
):
    return pending_calls.register(
        actor_id=actor.actor_id,
        agent_id=agent_id,
        tool_id=tool_id,
        args=args or {"patient_id": "pat-tool-call-1", "starts_at": "2030-05-15T14:00:00Z"},
        summary="test summary",
    )


def test_confirming_with_right_id_executes_tool(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    pending = _register_pending_call(clinician_actor)

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="approve",
        actor=clinician_actor,
        db=db_session,
        confirmed_tool_call_id=pending.call_id,
    )
    executed = result.get("tool_call_executed")
    assert executed is not None, result
    assert executed["tool_id"] == "sessions.create"
    assert executed["ok"] is True
    # Underlying row got created.
    rows = (
        db_session.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == seeded_patient.id)
        .all()
    )
    assert len(rows) == 1


def test_confirming_with_wrong_actor_returns_not_found(
    db_session,
    clinician_actor: AuthenticatedActor,
    other_clinician_actor: AuthenticatedActor,
) -> None:
    pending = _register_pending_call(clinician_actor)

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="approve",
        actor=other_clinician_actor,
        db=db_session,
        confirmed_tool_call_id=pending.call_id,
    )
    assert result.get("error") == "pending_call_not_found"
    assert "expired" in result["reply"].lower() or "not found" in result["reply"].lower()
    # Original call is still alive — wrong actor cannot invalidate it.
    assert pending_calls._peek(pending.call_id) is not None


def test_confirming_after_expiry_returns_not_found(
    db_session,
    clinician_actor: AuthenticatedActor,
) -> None:
    pending = _register_pending_call(clinician_actor)
    # Force expiry by mutating the stored entry — the dataclass is frozen
    # so we replace it in the dict.
    expired = pending.__class__(
        call_id=pending.call_id,
        actor_id=pending.actor_id,
        agent_id=pending.agent_id,
        tool_id=pending.tool_id,
        args=pending.args,
        summary=pending.summary,
        created_at=pending.created_at - 10_000,
        expires_at=pending.expires_at - 10_000,
    )
    pending_calls._PENDING[pending.call_id] = expired

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="approve",
        actor=clinician_actor,
        db=db_session,
        confirmed_tool_call_id=pending.call_id,
    )
    assert result.get("error") == "pending_call_not_found"
    # Expired entry must have been swept.
    assert pending_calls._peek(pending.call_id) is None


def test_confirming_twice_only_works_once(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    pending = _register_pending_call(clinician_actor)

    first = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="approve",
        actor=clinician_actor,
        db=db_session,
        confirmed_tool_call_id=pending.call_id,
    )
    assert first.get("tool_call_executed", {}).get("ok") is True

    second = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="approve",
        actor=clinician_actor,
        db=db_session,
        confirmed_tool_call_id=pending.call_id,
    )
    assert second.get("error") == "pending_call_not_found"


def test_reject_message_drops_pending_call(
    db_session,
    clinician_actor: AuthenticatedActor,
) -> None:
    pending = _register_pending_call(clinician_actor)
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="reject",
        actor=clinician_actor,
        db=db_session,
        confirmed_tool_call_id=pending.call_id,
    )
    assert result["reply"] == "OK, cancelled."
    assert pending_calls._peek(pending.call_id) is None


# ---------------------------------------------------------------------------
# Allowlist / refusal
# ---------------------------------------------------------------------------


def test_tool_call_for_tool_not_in_allowlist_is_refused(
    db_session,
    clinician_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # ``clinic.reporting`` does NOT carry sessions.create in its allowlist.
    # Asking the LLM to fire it must be refused without registering anything.
    llm_reply = (
        '{"tool_call": {"id": "sessions.create", "args": {"patient_id": "p1", '
        '"starts_at": "2030-05-15T14:00:00Z"}, "summary": "x"}}\n'
        "rationale"
    )
    _stub_llm(monkeypatch, llm_reply)
    # Use the admin actor so the reporting agent's role gate isn't the issue.
    admin = AuthenticatedActor(
        actor_id="actor-admin-demo",
        display_name="Admin Demo User",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id="clinic-demo-default",
    )
    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reporting"],
        message="please book",
        actor=admin,
        db=db_session,
    )
    assert "pending_tool_call" not in result
    assert "can't do that" in result["reply"].lower() or "not in" in result["reply"].lower()
    # Nothing registered.
    assert not pending_calls._PENDING


# ---------------------------------------------------------------------------
# sessions.create — happy / cross-clinic / conflict
# ---------------------------------------------------------------------------


def test_sessions_create_happy_path(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    out = tool_dispatcher.execute(
        "sessions.create",
        {
            "patient_id": seeded_patient.id,
            "starts_at": "2030-06-01T10:00:00Z",
            "duration_minutes": 60,
            "type": "session",
        },
        clinician_actor,
        db_session,
    )
    assert out["ok"] is True
    assert seeded_patient.id in out["result"]
    assert "audit_extra" in out and "session_id" in out["audit_extra"]
    rows = (
        db_session.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == seeded_patient.id)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].clinician_id == clinician_actor.actor_id


def test_sessions_create_rejects_cross_clinic_patient(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_other_clinic_patient: Patient,
) -> None:
    out = tool_dispatcher.execute(
        "sessions.create",
        {
            "patient_id": seeded_other_clinic_patient.id,
            "starts_at": "2030-06-01T10:00:00Z",
        },
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert "across clinics" in out["result"].lower() or "not found" in out["result"].lower()


def test_sessions_create_returns_conflict_when_overlap(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    starts_at = "2030-06-01T10:00:00Z"
    # First book — should succeed.
    out_a = tool_dispatcher.execute(
        "sessions.create",
        {
            "patient_id": seeded_patient.id,
            "starts_at": starts_at,
            "duration_minutes": 60,
        },
        clinician_actor,
        db_session,
    )
    assert out_a["ok"] is True

    # Second book at the same start — must conflict.
    out_b = tool_dispatcher.execute(
        "sessions.create",
        {
            "patient_id": seeded_patient.id,
            "starts_at": starts_at,
            "duration_minutes": 60,
        },
        clinician_actor,
        db_session,
    )
    assert out_b["ok"] is False
    assert "conflict" in out_b["result"].lower()


# ---------------------------------------------------------------------------
# Unknown tool / invalid args
# ---------------------------------------------------------------------------


def test_unknown_tool_id_at_confirmation_surfaces_clear_error(
    db_session,
    clinician_actor: AuthenticatedActor,
) -> None:
    with pytest.raises(tool_dispatcher.UnknownTool):
        tool_dispatcher.execute(
            "does.not.exist", {}, clinician_actor, db_session
        )


def test_invalid_args_raise_invalid_args(
    db_session,
    clinician_actor: AuthenticatedActor,
) -> None:
    with pytest.raises(tool_dispatcher.InvalidArgs):
        tool_dispatcher.execute(
            "sessions.create",
            {"patient_id": "", "starts_at": "not-a-date"},
            clinician_actor,
            db_session,
        )


# ---------------------------------------------------------------------------
# End-to-end via HTTP — first call returns pending, second confirms
# ---------------------------------------------------------------------------


def test_two_step_flow_via_http(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Seed a patient owned by the demo clinician so the dispatcher can book.
    db_session.add(
        Patient(
            id="pat-http-1",
            clinician_id="actor-clinician-demo",
            first_name="HTTP",
            last_name="Patient",
        )
    )
    db_session.commit()

    starts_at = "2030-07-01T09:30:00Z"
    llm_reply = (
        '{"tool_call": {"id": "sessions.create", "args": '
        f'{{"patient_id": "pat-http-1", "starts_at": "{starts_at}"}}, '
        '"summary": "Book pat-http-1 on Jul 1 09:30"}}\n'
        "Please confirm."
    )
    monkeypatch.setattr(
        "app.services.chat_service._llm_chat", lambda **k: llm_reply
    )

    resp = client.post(
        "/api/v1/agents/clinic.reception/run",
        json={"message": "Book that slot please"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    pending = body["pending_tool_call"]
    assert pending is not None
    assert pending["tool_id"] == "sessions.create"

    # Confirmation call.
    resp2 = client.post(
        "/api/v1/agents/clinic.reception/run",
        json={
            "message": "approve",
            "confirmed_tool_call_id": pending["call_id"],
        },
        headers=auth_headers["clinician"],
    )
    assert resp2.status_code == 200, resp2.text
    body2 = resp2.json()
    executed = body2["tool_call_executed"]
    assert executed is not None
    assert executed["ok"] is True
    assert executed["tool_id"] == "sessions.create"


def test_app_main_imports_cleanly() -> None:
    # Sanity check from the spec's definition-of-done: the app must still
    # import after the wiring lands.
    from app.main import app  # noqa: F401


# ---------------------------------------------------------------------------
# sessions.cancel — happy / already-cancelled / cross-clinic / not-found
# ---------------------------------------------------------------------------


def _seed_session(
    db,
    *,
    session_id: str,
    patient_id: str,
    clinician_id: str,
    status: str = "scheduled",
    starts_at: str = "2030-08-15T09:00:00+00:00",
) -> ClinicalSession:
    row = ClinicalSession(
        id=session_id,
        patient_id=patient_id,
        clinician_id=clinician_id,
        scheduled_at=starts_at,
        duration_minutes=60,
        appointment_type="session",
        status=status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_sessions_cancel_happy_path(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    sess = _seed_session(
        db_session,
        session_id="sess-cancel-happy",
        patient_id=seeded_patient.id,
        clinician_id=clinician_actor.actor_id,
        status="scheduled",
    )
    out = tool_dispatcher.execute(
        "sessions.cancel",
        {"session_id": sess.id, "reason": "patient requested reschedule"},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is True, out
    assert sess.id in out["result"]
    assert out["audit_extra"]["session_id"] == sess.id
    assert out["audit_extra"]["reason"] == "patient requested reschedule"

    db_session.refresh(sess)
    assert sess.status == "cancelled"
    assert sess.cancel_reason == "patient requested reschedule"
    assert sess.cancelled_at is not None


def test_sessions_cancel_refuses_already_cancelled(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    sess = _seed_session(
        db_session,
        session_id="sess-cancel-already",
        patient_id=seeded_patient.id,
        clinician_id=clinician_actor.actor_id,
        status="cancelled",
    )
    out = tool_dispatcher.execute(
        "sessions.cancel",
        {"session_id": sess.id},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert "not active" in out["result"].lower()
    assert "cancelled" in out["result"].lower()


def test_sessions_cancel_refuses_completed(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    sess = _seed_session(
        db_session,
        session_id="sess-cancel-completed",
        patient_id=seeded_patient.id,
        clinician_id=clinician_actor.actor_id,
        status="completed",
    )
    out = tool_dispatcher.execute(
        "sessions.cancel",
        {"session_id": sess.id},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert "not active" in out["result"].lower()


def test_sessions_cancel_rejects_cross_clinic_patient(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_other_clinic_patient: Patient,
) -> None:
    # Session owned by a different clinician, patient owned by a
    # different clinician — the demo actor must not be able to cancel.
    _seed_session(
        db_session,
        session_id="sess-cancel-cross-clinic",
        patient_id=seeded_other_clinic_patient.id,
        clinician_id="actor-other-clinician",
        status="scheduled",
    )
    out = tool_dispatcher.execute(
        "sessions.cancel",
        {"session_id": "sess-cancel-cross-clinic"},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert (
        "across clinics" in out["result"].lower()
        or "not found" in out["result"].lower()
    )

    # And the row must still be live (status unchanged) — defence in depth.
    row = db_session.query(ClinicalSession).filter_by(
        id="sess-cancel-cross-clinic"
    ).first()
    assert row is not None
    assert row.status == "scheduled"


def test_sessions_cancel_invalid_session_id(
    db_session,
    clinician_actor: AuthenticatedActor,
) -> None:
    out = tool_dispatcher.execute(
        "sessions.cancel",
        {"session_id": "sess-does-not-exist"},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert "not found" in out["result"].lower()


# ---------------------------------------------------------------------------
# notes.approve_draft — happy / already-approved / cross-clinic /
# wrong-clinician / edits applied
# ---------------------------------------------------------------------------


def _seed_note_and_draft(
    db,
    *,
    note_id: str,
    draft_id: str,
    patient_id: str,
    clinician_id: str,
    draft_status: str = "generated",
    note_status: str = "draft_generated",
    session_note: str | None = "Initial AI-generated note body.",
) -> tuple[ClinicianMediaNote, ClinicianNoteDraft]:
    note = ClinicianMediaNote(
        id=note_id,
        patient_id=patient_id,
        clinician_id=clinician_id,
        note_type="post_session",
        media_type="text",
        text_content="raw clinician text",
        status=note_status,
    )
    draft = ClinicianNoteDraft(
        id=draft_id,
        note_id=note_id,
        generated_by="agent-test",
        prompt_hash="0" * 64,
        session_note=session_note,
        status=draft_status,
    )
    db.add(note)
    db.add(draft)
    db.commit()
    db.refresh(note)
    db.refresh(draft)
    return note, draft


def test_notes_approve_draft_happy_path(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    _, draft = _seed_note_and_draft(
        db_session,
        note_id="note-approve-happy",
        draft_id="draft-approve-happy",
        patient_id=seeded_patient.id,
        clinician_id=clinician_actor.actor_id,
    )
    out = tool_dispatcher.execute(
        "notes.approve_draft",
        {"draft_id": draft.id},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is True, out
    assert draft.id in out["result"]
    assert out["audit_extra"]["draft_id"] == draft.id
    assert out["audit_extra"]["note_id"] == "note-approve-happy"

    db_session.refresh(draft)
    assert draft.status == "approved"
    assert draft.approved_by == clinician_actor.actor_id
    assert draft.approved_at is not None


def test_notes_approve_draft_refuses_already_approved(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    _, draft = _seed_note_and_draft(
        db_session,
        note_id="note-approve-already",
        draft_id="draft-approve-already",
        patient_id=seeded_patient.id,
        clinician_id=clinician_actor.actor_id,
        draft_status="approved",
    )
    out = tool_dispatcher.execute(
        "notes.approve_draft",
        {"draft_id": draft.id},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert "already approved" in out["result"].lower()


def test_notes_approve_draft_rejects_cross_clinic_patient(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_other_clinic_patient: Patient,
) -> None:
    # Note belongs to a patient in another clinic — refuse even though
    # the draft id is otherwise valid.
    _, draft = _seed_note_and_draft(
        db_session,
        note_id="note-approve-cross-clinic",
        draft_id="draft-approve-cross-clinic",
        patient_id=seeded_other_clinic_patient.id,
        clinician_id="actor-other-clinician",
    )
    out = tool_dispatcher.execute(
        "notes.approve_draft",
        {"draft_id": draft.id},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert (
        "across clinics" in out["result"].lower()
        or "not found" in out["result"].lower()
    )

    db_session.refresh(draft)
    assert draft.status == "generated"
    assert draft.approved_at is None


def test_notes_approve_draft_rejects_wrong_clinician(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    # The patient belongs to ``clinician_actor``, but the note was
    # written by a *different* clinician on the same roster. The agent
    # must refuse — only the original clinician may approve via the bot.
    _, draft = _seed_note_and_draft(
        db_session,
        note_id="note-approve-wrong-clin",
        draft_id="draft-approve-wrong-clin",
        patient_id=seeded_patient.id,
        clinician_id="some-other-clinician-on-same-roster",
    )
    out = tool_dispatcher.execute(
        "notes.approve_draft",
        {"draft_id": draft.id},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert "original clinician" in out["result"].lower()

    db_session.refresh(draft)
    assert draft.status == "generated"


def test_notes_approve_draft_invalid_draft_id(
    db_session,
    clinician_actor: AuthenticatedActor,
) -> None:
    out = tool_dispatcher.execute(
        "notes.approve_draft",
        {"draft_id": "draft-does-not-exist"},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is False
    assert "not found" in out["result"].lower()


def test_notes_approve_draft_applies_edits(
    db_session,
    clinician_actor: AuthenticatedActor,
    seeded_patient: Patient,
) -> None:
    _, draft = _seed_note_and_draft(
        db_session,
        note_id="note-approve-edits",
        draft_id="draft-approve-edits",
        patient_id=seeded_patient.id,
        clinician_id=clinician_actor.actor_id,
        session_note="Original draft body — should be replaced.",
    )
    new_body = "Clinician-edited body via agent."
    out = tool_dispatcher.execute(
        "notes.approve_draft",
        {"draft_id": draft.id, "edits": new_body},
        clinician_actor,
        db_session,
    )
    assert out["ok"] is True, out

    db_session.refresh(draft)
    assert draft.session_note == new_body
    assert draft.status == "approved"
    assert draft.approved_by == clinician_actor.actor_id
