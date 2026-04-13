"""Lightweight audit logging for home program task sync/conflict actions (separate DB session)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.database import SessionLocal
from app.repositories.audit import create_audit_event

HOME_PROGRAM_TARGET_TYPE = "home_program_task"

# action must fit AuditEventRecord.action String(32)
ACTION_SYNC_CONFLICT = "hp_sync_conflict"
ACTION_FORCE_OVERWRITE = "hp_force_overwrite"
ACTION_TAKE_SERVER = "hp_take_server"
ACTION_RETRY_SUCCESS = "hp_retry_ok"
ACTION_CREATE_REPLAY = "hp_create_replay"
# Deprecated path: PUT created a row that did not exist (prefer POST /api/v1/home-program-tasks).
ACTION_LEGACY_PUT_CREATE = "hp_legacy_put_create"


def log_home_program_audit(
    *,
    server_task_id: str,
    external_task_id: str,
    action: str,
    actor_id: str,
    role: str,
    note: str,
) -> None:
    """Persist one audit row; uses its own session so it survives request rollback on errors."""
    db = SessionLocal()
    try:
        create_audit_event(
            db,
            event_id=str(uuid4()),
            target_id=server_task_id[:64],
            target_type=HOME_PROGRAM_TARGET_TYPE,
            action=action[:32],
            role=role[:32],
            actor_id=actor_id[:64],
            note=f"{note} | external_id={external_task_id}"[:8000],
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    finally:
        db.close()
