from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.repositories.audit import create_audit_event

SURFACE = "qeeg_105"


def record_qeeg_105_audit_event(
    db: Session,
    *,
    actor: AuthenticatedActor,
    event: str,
    target_id: str,
    metadata: Optional[dict[str, Any]] = None,
) -> str:
    """Append-only audit row for QEEG-105 endpoints.

    Uses the shared `audit_events` table so clinic admins can review QEEG-105
    access in the global audit trail.
    """
    now = datetime.now(timezone.utc)
    event_id = f"{SURFACE}-{event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"

    note = ""
    if metadata:
        parts: list[str] = []
        for k in sorted(metadata.keys()):
            v = metadata.get(k)
            if v is None:
                continue
            parts.append(f"{k}={v}")
        note = "; ".join(parts)[:1024]
    if not note:
        note = event

    create_audit_event(
        db,
        event_id=event_id,
        target_id=str(target_id)[:64],
        target_type=SURFACE,
        action=f"{SURFACE}.{event}"[:32],  # AuditEventRecord.action is String(32)
        role=actor.role,
        actor_id=actor.actor_id,
        note=note,
        created_at=now.isoformat(),
    )
    return event_id

