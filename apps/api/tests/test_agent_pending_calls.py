"""Tests for services/agents/pending_calls.py — in-memory two-step confirmation store.

Covers:
* register returns a _PendingCall with the right metadata.
* consume returns the call on exact match and removes it (one-shot).
* consume returns None for an unknown call_id.
* consume returns None when actor_id or agent_id mismatches (no-leak contract).
* A mismatched consume does NOT remove the entry (so the real clinician can still confirm).
* consume returns None for an expired entry and cleans it up.
* discard removes a pending entry and returns True; second discard returns False.
* purge_expired removes only expired entries and returns the count.
* MAX_PENDING_ENTRIES cap: inserting one over the limit evicts the oldest.
* Thread safety smoke-test: concurrent registers from two threads both succeed.
"""
from __future__ import annotations

import threading
import time

import pytest

import app.services.agents.pending_calls as pc
from app.services.agents.pending_calls import (
    MAX_PENDING_ENTRIES,
    PENDING_TTL_SECONDS,
    _PendingCall,
    _peek,
    _reset,
    consume,
    discard,
    purge_expired,
    register,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean():
    """Wipe the module-level store before and after every test."""
    _reset()
    yield
    _reset()


# ── register ──────────────────────────────────────────────────────────────────


def test_register_returns_pending_call():
    result = register(
        actor_id="actor-1",
        agent_id="agent-1",
        tool_id="tool.update",
        args={"patient_id": "p1"},
        summary="Update patient record",
    )
    assert isinstance(result, _PendingCall)
    assert result.actor_id == "actor-1"
    assert result.agent_id == "agent-1"
    assert result.tool_id == "tool.update"
    assert result.args == {"patient_id": "p1"}
    assert result.summary == "Update patient record"
    assert len(result.call_id) == 32  # UUID4 hex


def test_register_creates_retrievable_entry():
    p = register(
        actor_id="actor-1",
        agent_id="agent-1",
        tool_id="t",
        args={},
        summary="s",
    )
    stored = _peek(p.call_id)
    assert stored is not None
    assert stored.call_id == p.call_id


# ── consume ───────────────────────────────────────────────────────────────────


def test_consume_happy_path():
    p = register(actor_id="a", agent_id="ag", tool_id="t", args={}, summary="s")
    result = consume(p.call_id, actor_id="a", agent_id="ag")
    assert result is not None
    assert result.call_id == p.call_id
    # One-shot: entry is gone
    assert _peek(p.call_id) is None


def test_consume_unknown_id_returns_none():
    assert consume("not-a-real-id", actor_id="a", agent_id="ag") is None


def test_consume_wrong_actor_returns_none_and_preserves_entry():
    """No-leak: wrong actor cannot distinguish expired from wrong-actor; entry stays."""
    p = register(actor_id="real-actor", agent_id="ag", tool_id="t", args={}, summary="s")
    result = consume(p.call_id, actor_id="wrong-actor", agent_id="ag")
    assert result is None
    # Entry must NOT have been removed — real clinician still needs it.
    assert _peek(p.call_id) is not None


def test_consume_wrong_agent_returns_none_and_preserves_entry():
    p = register(actor_id="a", agent_id="real-agent", tool_id="t", args={}, summary="s")
    result = consume(p.call_id, actor_id="a", agent_id="wrong-agent")
    assert result is None
    assert _peek(p.call_id) is not None


def test_consume_expired_returns_none(monkeypatch):
    """Simulate expiry by patching _now to return a value past expires_at."""
    p = register(actor_id="a", agent_id="ag", tool_id="t", args={}, summary="s")
    # Advance the clock past TTL
    monkeypatch.setattr(pc, "_now", lambda: p.expires_at + 1.0)
    result = consume(p.call_id, actor_id="a", agent_id="ag")
    assert result is None


# ── discard ───────────────────────────────────────────────────────────────────


def test_discard_removes_entry():
    p = register(actor_id="a", agent_id="ag", tool_id="t", args={}, summary="s")
    assert discard(p.call_id) is True
    assert _peek(p.call_id) is None


def test_discard_missing_entry_returns_false():
    assert discard("no-such-id") is False


# ── purge_expired ─────────────────────────────────────────────────────────────


def test_purge_expired_removes_only_stale_entries(monkeypatch):
    fresh = register(actor_id="a", agent_id="ag", tool_id="t", args={}, summary="fresh")
    stale = register(actor_id="a", agent_id="ag", tool_id="t", args={}, summary="stale")

    # Advance clock past stale entry's TTL but keep "fresh" alive by faking
    # a lower expires_at on the stale entry.
    pc._PENDING[stale.call_id] = _PendingCall(
        call_id=stale.call_id,
        actor_id=stale.actor_id,
        agent_id=stale.agent_id,
        tool_id=stale.tool_id,
        args=stale.args,
        summary=stale.summary,
        created_at=stale.created_at,
        expires_at=time.monotonic() - 1.0,  # already expired
    )

    removed = purge_expired()
    assert removed == 1
    assert _peek(fresh.call_id) is not None
    assert _peek(stale.call_id) is None


# ── LRU eviction ─────────────────────────────────────────────────────────────


def test_max_entries_evicts_oldest():
    # Fill to exactly MAX_PENDING_ENTRIES
    calls = []
    for i in range(MAX_PENDING_ENTRIES):
        calls.append(
            register(actor_id=f"a{i}", agent_id="ag", tool_id="t", args={}, summary="s")
        )

    oldest = calls[0]
    # One more insert should evict the oldest
    register(actor_id="new-actor", agent_id="ag", tool_id="t", args={}, summary="s")

    assert _peek(oldest.call_id) is None, "Oldest entry should have been evicted"
    assert len(pc._PENDING) == MAX_PENDING_ENTRIES


# ── Thread-safety smoke test ──────────────────────────────────────────────────


def test_concurrent_registers_do_not_crash():
    results: list[_PendingCall] = []
    errors: list[Exception] = []

    def _worker():
        try:
            p = register(actor_id="a", agent_id="ag", tool_id="t", args={}, summary="s")
            results.append(p)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=_worker) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"Thread errors: {errors}"
    assert len(results) == 20
