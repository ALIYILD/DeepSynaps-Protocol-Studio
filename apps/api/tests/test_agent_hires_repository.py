"""Repository-level tests for app.repositories.agent_hires.

Pins CRUD behaviour for the AgentHire table against in-memory SQLite.
All tests rely on the isolated_database autouse fixture from conftest.py
which resets the schema and seeds the demo clinic + users before each test.
"""
from __future__ import annotations


# ── Helpers ──────────────────────────────────────────────────────────────────

_ACTOR = "actor-clinician-demo"
_CLINIC = "clinic-demo-default"
_AGENT_A = "agent-copilot-v1"
_AGENT_B = "agent-summariser-v2"


def _db():
    from app.database import SessionLocal
    return SessionLocal()


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_hire_agent_creates_new_row():
    from app.repositories.agent_hires import get_hire, hire_agent

    db = _db()
    try:
        row = hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A, clinic_id=_CLINIC)
        db.commit()
        assert row.actor_id == _ACTOR
        assert row.agent_id == _AGENT_A
        assert row.status == "active"
        assert row.hired_at is not None

        fetched = get_hire(db, actor_id=_ACTOR, agent_id=_AGENT_A)
        assert fetched is not None
        assert fetched.id == row.id
    finally:
        db.close()


def test_hire_agent_is_idempotent_for_active_hire():
    """Hiring an already-active agent returns the same row without duplication."""
    from app.persistence.models import AgentHire
    from app.repositories.agent_hires import hire_agent

    db = _db()
    try:
        first = hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A, clinic_id=_CLINIC)
        db.commit()
        second = hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A, clinic_id=_CLINIC)
        db.commit()
        assert first.id == second.id
        count = db.query(AgentHire).filter_by(actor_id=_ACTOR, agent_id=_AGENT_A).count()
        assert count == 1
    finally:
        db.close()


def test_unhire_agent_flips_status_to_paused():
    from app.repositories.agent_hires import hire_agent, unhire_agent, get_hire

    db = _db()
    try:
        hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A, clinic_id=_CLINIC)
        db.commit()

        result = unhire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A)
        db.commit()

        assert result is True
        row = get_hire(db, actor_id=_ACTOR, agent_id=_AGENT_A)
        assert row.status == "paused"
    finally:
        db.close()


def test_unhire_nonexistent_agent_returns_false():
    from app.repositories.agent_hires import unhire_agent

    db = _db()
    try:
        result = unhire_agent(db, actor_id=_ACTOR, agent_id="does-not-exist")
        assert result is False
    finally:
        db.close()


def test_rehire_paused_agent_flips_back_to_active():
    from app.repositories.agent_hires import hire_agent, unhire_agent, get_hire

    db = _db()
    try:
        hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A, clinic_id=_CLINIC)
        db.commit()
        unhire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A)
        db.commit()

        # Re-hire should flip back to active
        hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A, clinic_id=_CLINIC)
        db.commit()

        row = get_hire(db, actor_id=_ACTOR, agent_id=_AGENT_A)
        assert row.status == "active"
    finally:
        db.close()


def test_list_hires_for_actor_returns_only_active():
    from app.repositories.agent_hires import hire_agent, unhire_agent, list_hires_for_actor

    db = _db()
    try:
        hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A, clinic_id=_CLINIC)
        hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_B, clinic_id=_CLINIC)
        db.commit()
        unhire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_B)
        db.commit()

        active = list_hires_for_actor(db, actor_id=_ACTOR, status="active")
        assert len(active) == 1
        assert active[0].agent_id == _AGENT_A
    finally:
        db.close()


def test_list_hires_for_actor_empty_when_no_hires():
    from app.repositories.agent_hires import list_hires_for_actor

    db = _db()
    try:
        rows = list_hires_for_actor(db, actor_id="actor-nobody")
        assert rows == []
    finally:
        db.close()


def test_touch_last_used_stamps_timestamp():
    from app.repositories.agent_hires import hire_agent, touch_last_used, get_hire

    db = _db()
    try:
        row = hire_agent(db, actor_id=_ACTOR, agent_id=_AGENT_A, clinic_id=_CLINIC)
        db.commit()
        assert row.last_used_at is None

        touch_last_used(db, actor_id=_ACTOR, agent_id=_AGENT_A)
        db.commit()

        refreshed = get_hire(db, actor_id=_ACTOR, agent_id=_AGENT_A)
        assert refreshed.last_used_at is not None
    finally:
        db.close()


def test_touch_last_used_noop_for_missing_hire():
    """touch_last_used must be silent when no hire row exists."""
    from app.repositories.agent_hires import touch_last_used

    db = _db()
    try:
        # Should not raise
        touch_last_used(db, actor_id=_ACTOR, agent_id="ghost-agent")
    finally:
        db.close()
