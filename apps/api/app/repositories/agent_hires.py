"""Per-clinician AI Agent hire roster — repository helpers.

Companion to :class:`app.persistence.models.AgentHire`. Routers MUST
use these helpers (no inline ORM queries) so the router-lint job stays
green — see CLAUDE.md memory ``deepsynaps-router-schema-lint``.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..persistence.models import AgentHire


def get_hire(
    session: Session, *, actor_id: str, agent_id: str
) -> Optional[AgentHire]:
    return session.execute(
        select(AgentHire)
        .where(AgentHire.actor_id == actor_id)
        .where(AgentHire.agent_id == agent_id)
    ).scalar_one_or_none()


def list_hires_for_actor(
    session: Session, *, actor_id: str, status: str = "active"
) -> list[AgentHire]:
    return list(
        session.execute(
            select(AgentHire)
            .where(AgentHire.actor_id == actor_id)
            .where(AgentHire.status == status)
            .order_by(AgentHire.last_used_at.desc().nullslast(), AgentHire.hired_at.desc())
        ).scalars()
    )


def hire_agent(
    session: Session,
    *,
    actor_id: str,
    agent_id: str,
    clinic_id: Optional[str],
) -> AgentHire:
    """Idempotent hire. If a row exists (any status) flip it back to active."""
    existing = get_hire(session, actor_id=actor_id, agent_id=agent_id)
    now = datetime.now(timezone.utc)
    if existing is not None:
        if existing.status != "active":
            existing.status = "active"
            existing.hired_at = now
            session.flush()
        return existing
    row = AgentHire(
        actor_id=actor_id,
        agent_id=agent_id,
        clinic_id=clinic_id,
        status="active",
        hired_at=now,
    )
    session.add(row)
    session.flush()
    return row


def unhire_agent(
    session: Session, *, actor_id: str, agent_id: str
) -> bool:
    """Soft-delete by flipping status to ``paused``. Returns True if a row was
    flipped, False if no active hire existed."""
    existing = get_hire(session, actor_id=actor_id, agent_id=agent_id)
    if existing is None or existing.status != "active":
        return False
    existing.status = "paused"
    session.flush()
    return True


def touch_last_used(
    session: Session, *, actor_id: str, agent_id: str
) -> None:
    """Stamp ``last_used_at`` on the hire row, if one exists. Best-effort —
    failures are silently ignored so a missing hire never breaks an agent
    run."""
    existing = get_hire(session, actor_id=actor_id, agent_id=agent_id)
    if existing is None:
        return
    existing.last_used_at = datetime.now(timezone.utc)
    session.flush()
