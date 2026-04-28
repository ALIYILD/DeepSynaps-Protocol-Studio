"""In-memory store for pending two-step agent tool-call confirmations.

Phase 2.5 confirmation flow stores a short-lived record of every write
tool call the LLM has *requested* but the clinician has not yet *approved*.
The clinician's second ``/run`` call carries a ``confirmed_tool_call_id``
that we look up here, validate, and execute via the tool dispatcher.

Design notes
------------
* In-memory only — pending calls are scoped to a single Fly machine.
  Worst case after a restart is the clinician re-confirms; the LLM
  output is fully reproducible and the cost is one extra round-trip.
  Phase 3 of this is Redis-backed.
* TTL of 5 minutes (:data:`PENDING_TTL_SECONDS`). Anything older is
  treated as "expired or not found" — same response, deliberately
  ambiguous so we don't leak existence to other actors.
* Each :func:`consume` is one-shot: a successful lookup removes the
  entry. Replay attempts get the same expired/not-found envelope.
* Capped at :data:`MAX_PENDING_ENTRIES` with a simple LRU evict on
  insert so a misbehaving agent cannot exhaust process memory.
* All access is guarded by a module-level lock — FastAPI's threaded
  event loop and pytest's TestClient both can drive concurrent
  insert/consume from multiple threads.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any

#: Time-to-live for any pending tool call, in seconds. After this the
#: entry is considered expired and :func:`consume` returns ``None``.
PENDING_TTL_SECONDS: float = 5 * 60.0

#: Maximum number of entries retained at once. When the cap is hit the
#: oldest (smallest ``created_at``) is evicted before insert.
MAX_PENDING_ENTRIES: int = 1000


@dataclass(frozen=True)
class _PendingCall:
    """One pending tool call awaiting clinician confirmation."""

    call_id: str
    actor_id: str
    agent_id: str
    tool_id: str
    args: dict[str, Any]
    summary: str
    created_at: float
    expires_at: float


_PENDING: dict[str, _PendingCall] = {}
_LOCK = threading.Lock()


def _now() -> float:
    return time.monotonic()


def _evict_oldest_locked() -> None:
    """Remove the oldest entry. Caller must already hold ``_LOCK``."""
    if not _PENDING:
        return
    oldest_id = min(_PENDING, key=lambda cid: _PENDING[cid].created_at)
    _PENDING.pop(oldest_id, None)


def purge_expired() -> int:
    """Drop any entries whose :attr:`_PendingCall.expires_at` is in the past.

    Returns the number of entries removed. Callers usually rely on the
    lazy cleanup performed by :func:`consume` and :func:`register`; this
    helper exists for tests and admin tooling.
    """
    now = _now()
    removed = 0
    with _LOCK:
        for cid in [cid for cid, p in _PENDING.items() if p.expires_at <= now]:
            _PENDING.pop(cid, None)
            removed += 1
    return removed


def register(
    *,
    actor_id: str,
    agent_id: str,
    tool_id: str,
    args: dict[str, Any],
    summary: str,
) -> _PendingCall:
    """Register a new pending tool call and return the stored record.

    The returned :class:`_PendingCall` carries the freshly minted
    ``call_id`` (a UUID4 hex) and the absolute ``expires_at`` (seconds
    since the monotonic epoch — only meaningful relative to other
    timestamps from this module).
    """
    now = _now()
    call_id = uuid.uuid4().hex
    pending = _PendingCall(
        call_id=call_id,
        actor_id=actor_id,
        agent_id=agent_id,
        tool_id=tool_id,
        args=dict(args),
        summary=summary,
        created_at=now,
        expires_at=now + PENDING_TTL_SECONDS,
    )
    with _LOCK:
        # Lazy expiry sweep — keeps memory bounded without a background
        # task. Cheap because the dict is capped at MAX_PENDING_ENTRIES.
        for cid in [cid for cid, p in _PENDING.items() if p.expires_at <= now]:
            _PENDING.pop(cid, None)
        if len(_PENDING) >= MAX_PENDING_ENTRIES:
            _evict_oldest_locked()
        _PENDING[call_id] = pending
    return pending


def consume(
    call_id: str, *, actor_id: str, agent_id: str
) -> _PendingCall | None:
    """Look up and remove a pending call.

    Returns the stored :class:`_PendingCall` only when the entry exists,
    has not expired, AND the actor + agent ids match the original
    registration. Otherwise returns ``None`` (deliberately ambiguous so
    a wrong-actor confirmation cannot be distinguished from an expired
    one — same observable response, no leakage).

    The entry is removed on every successful lookup — confirmation is
    one-shot so a duplicate or replayed approval cannot fire the write.
    """
    now = _now()
    with _LOCK:
        pending = _PENDING.get(call_id)
        if pending is None:
            return None
        if pending.expires_at <= now:
            _PENDING.pop(call_id, None)
            return None
        if pending.actor_id != actor_id or pending.agent_id != agent_id:
            # Do NOT remove the entry — that would let a wrong actor
            # invalidate a legitimate clinician's pending call.
            return None
        # Authorised match — consume.
        _PENDING.pop(call_id, None)
        return pending


def discard(call_id: str) -> bool:
    """Best-effort drop of ``call_id`` regardless of actor.

    Used by the reject path so a clinician's "no, cancel" cleanly
    removes the pending entry. Returns ``True`` if anything was removed.
    """
    with _LOCK:
        return _PENDING.pop(call_id, None) is not None


def _peek(call_id: str) -> _PendingCall | None:
    """Test-only helper — read without consuming or expiring."""
    with _LOCK:
        return _PENDING.get(call_id)


def _reset() -> None:
    """Test-only helper — drop every entry."""
    with _LOCK:
        _PENDING.clear()


__all__ = [
    "MAX_PENDING_ENTRIES",
    "PENDING_TTL_SECONDS",
    "_PendingCall",
    "consume",
    "discard",
    "purge_expired",
    "register",
]
