"""Thin audit helper for agent-brain query events.

Wraps the existing `app.repositories.audit.create_audit_event` so providers
that declare `requires_audit=true` can emit a single line of provenance.

The router calls `record_query` *before* delegating to the provider so that
even a provider that raises an exception leaves a trail.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

_log = logging.getLogger(__name__)


def record_query(
    *,
    session: Optional[Session],
    actor_id: str,
    actor_role: str,
    provider_name: str,
    target_id: str,
    note: str,
) -> str:
    """Emit an audit event for a provider query. Returns the event id.

    Best-effort: if the audit repository raises (e.g. DB unavailable in a test
    that didn't seed it), we log the failure and return a synthetic event id so
    the caller can still attach the id to the response. We never fail the
    user's query because the audit write failed — that would mask the call AND
    deny service. Instead the failure is logged for the SOC/SIEM pipeline.
    """
    event_id = f"agent-brain-{uuid.uuid4().hex[:16]}"
    if session is None:
        return event_id

    try:
        from app.repositories.audit import create_audit_event

        create_audit_event(
            session,
            event_id=event_id,
            target_id=target_id or "agent-brain",
            target_type="agent_brain_query",
            action="agent_brain_query",
            role=actor_role,
            actor_id=actor_id,
            note=f"{provider_name}: {note[:240]}",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:  # pragma: no cover - defensive logging path
        _log.warning(
            "agent_brain_audit_write_failed",
            extra={
                "event": "agent_brain_audit_write_failed",
                "provider": provider_name,
                "actor_id": actor_id,
                "error": f"{type(exc).__name__}: {exc}",
            },
        )

    return event_id
