from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from deepsynaps_core_schema import AuditEvent

from app.persistence.models import AuditEventRecord


def seed_audit_events(session: Session, events: Iterable[AuditEvent]) -> None:
    existing = session.scalar(select(AuditEventRecord.event_id).limit(1))
    if existing is not None:
        return

    session.add_all(
        AuditEventRecord(
            event_id=event.event_id,
            target_id=event.target_id,
            target_type=event.target_type,
            action=event.action,
            role=event.role,
            actor_id=f"seed-{event.role}",
            note=event.note,
            created_at=event.created_at,
        )
        for event in events
    )
    session.commit()


def create_audit_event(
    session: Session,
    *,
    event_id: str,
    target_id: str,
    target_type: str,
    action: str,
    role: str,
    actor_id: str,
    note: str,
    created_at: str,
) -> AuditEvent:
    record = AuditEventRecord(
        event_id=event_id,
        target_id=target_id,
        target_type=target_type,
        action=action,
        role=role,
        actor_id=actor_id,
        note=note,
        created_at=created_at,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _to_schema(record)


def list_audit_events(session: Session) -> list[AuditEvent]:
    records = session.scalars(
        select(AuditEventRecord).order_by(AuditEventRecord.id.desc())
    ).all()
    return [_to_schema(record) for record in records]


def count_audit_events(session: Session) -> int:
    return len(list_audit_events(session))


def _to_schema(record: AuditEventRecord) -> AuditEvent:
    return AuditEvent(
        event_id=record.event_id,
        target_id=record.target_id,
        target_type=record.target_type,
        action=record.action,
        role=record.role,
        note=record.note,
        created_at=record.created_at,
    )
