"""Audit logging for the DeepTwin 360 dashboard endpoint.

Pattern matches ``home_program_task_audit.py``: a separate DB session so
the audit row survives a request rollback. Single action recorded today:
``deeptwin.dashboard.opened`` whenever a clinician GETs the payload.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.database import SessionLocal
from app.repositories.audit import create_audit_event

DEEPTWIN_DASHBOARD_TARGET_TYPE = "deeptwin_dashboard"
ACTION_DASHBOARD_OPENED = "dt360_opened"  # AuditEventRecord.action is String(32)


def log_dashboard_opened(
    *,
    patient_id: str,
    actor_id: str,
    role: str,
    note: str = "",
) -> None:
    db = SessionLocal()
    try:
        create_audit_event(
            db,
            event_id=str(uuid4()),
            target_id=patient_id[:64],
            target_type=DEEPTWIN_DASHBOARD_TARGET_TYPE,
            action=ACTION_DASHBOARD_OPENED,
            role=(role or "")[:32],
            actor_id=(actor_id or "")[:64],
            note=("deeptwin.dashboard.opened | " + (note or ""))[:8000],
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    finally:
        db.close()
