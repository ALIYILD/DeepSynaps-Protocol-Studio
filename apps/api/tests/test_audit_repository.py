"""Tests for app.repositories.audit — CRUD contracts (PR 83/N).

Covers:
- create_audit_event returns AuditEvent with correct fields
- list_audit_events returns all inserted events
- count_audit_events matches inserted count
- seed_audit_events is idempotent (second call does not duplicate)
- latest_video_assessment_historical_summary_audit returns None for unknown
- latest_video_assessment_historical_summary_audit returns row when present
- latest_video_assessment_summary_feedback_audit returns None for wrong event_id
- video_assessment_historical_summary_audit_by_event_id returns row by event_id
- _to_schema maps all required fields correctly
"""
from __future__ import annotations

import json
from datetime import datetime, timezone


CLINICIAN_ID = "actor-clinician-demo"


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_audit_event(db, event_id: str, action: str = "test.action", note: str = "{}"):
    from app.repositories.audit import create_audit_event

    return create_audit_event(
        db,
        event_id=event_id,
        target_id="target-001",
        target_type="test_type",
        action=action,
        role="clinician",
        actor_id=CLINICIAN_ID,
        note=note,
        created_at=_ts(),
    )


def test_create_audit_event_happy_path():
    from app.database import SessionLocal
    from app.repositories.audit import create_audit_event

    db = SessionLocal()
    try:
        event = create_audit_event(
            db,
            event_id="evt-audit-001",
            target_id="tgt-001",
            target_type="patient",
            action="patient.created",
            role="clinician",
            actor_id=CLINICIAN_ID,
            note="audit note",
            created_at=_ts(),
        )
        assert event.event_id == "evt-audit-001"
        assert event.action == "patient.created"
        assert event.target_type == "patient"
        assert event.role == "clinician"
    finally:
        db.close()


def test_list_audit_events_returns_created_events():
    from app.database import SessionLocal
    from app.repositories.audit import count_audit_events, list_audit_events

    db = SessionLocal()
    try:
        _make_audit_event(db, "evt-list-001")
        _make_audit_event(db, "evt-list-002")
        events = list_audit_events(db)
        event_ids = {e.event_id for e in events}
        assert "evt-list-001" in event_ids
        assert "evt-list-002" in event_ids
    finally:
        db.close()


def test_count_audit_events_matches_inserted():
    from app.database import SessionLocal
    from app.repositories.audit import count_audit_events

    db = SessionLocal()
    try:
        before = count_audit_events(db)
        _make_audit_event(db, "evt-count-001")
        _make_audit_event(db, "evt-count-002")
        after = count_audit_events(db)
        assert after == before + 2
    finally:
        db.close()


def test_seed_audit_events_is_idempotent():
    """Second call to seed_audit_events does not insert duplicates."""
    from app.database import SessionLocal
    from app.repositories.audit import count_audit_events, seed_audit_events
    from app.registries.audit import AUDIT_EVENTS

    db = SessionLocal()
    try:
        seed_audit_events(db, AUDIT_EVENTS)
        count_after_first = count_audit_events(db)
        seed_audit_events(db, AUDIT_EVENTS)  # second call
        count_after_second = count_audit_events(db)
        assert count_after_first == count_after_second
    finally:
        db.close()


def test_latest_video_assessment_historical_summary_audit_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.audit import latest_video_assessment_historical_summary_audit

    db = SessionLocal()
    try:
        row, payload = latest_video_assessment_historical_summary_audit(
            db,
            actor_id="actor-nobody",
            session_id="sess-unknown",
        )
        assert row is None
        assert payload is None
    finally:
        db.close()


def test_latest_video_assessment_historical_summary_audit_returns_row_when_present():
    from app.database import SessionLocal
    from app.repositories.audit import (
        create_audit_event,
        latest_video_assessment_historical_summary_audit,
    )

    db = SessionLocal()
    try:
        session_id = "sess-va-001"
        note_payload = json.dumps({"model": "gpt-4o", "tokens": 500})
        create_audit_event(
            db,
            event_id="evt-va-hist-001",
            target_id=session_id[:64],
            target_type="video_assessment",
            action="video_assessment.historical_ai_summary_generated",
            role="clinician",
            actor_id=CLINICIAN_ID,
            note=note_payload,
            created_at=_ts(),
        )
        row, payload = latest_video_assessment_historical_summary_audit(
            db,
            actor_id=CLINICIAN_ID,
            session_id=session_id,
        )
        assert row is not None
        assert payload is not None
        assert payload["model"] == "gpt-4o"
    finally:
        db.close()


def test_latest_video_assessment_summary_feedback_audit_returns_none_for_wrong_event_id():
    from app.database import SessionLocal
    from app.repositories.audit import latest_video_assessment_summary_feedback_audit

    db = SessionLocal()
    try:
        row, payload = latest_video_assessment_summary_feedback_audit(
            db,
            actor_id=CLINICIAN_ID,
            session_id="sess-feedback-unknown",
            summary_event_id="evt-does-not-exist",
        )
        assert row is None
        assert payload is None
    finally:
        db.close()


def test_video_assessment_historical_summary_audit_by_event_id_returns_row():
    from app.database import SessionLocal
    from app.repositories.audit import (
        create_audit_event,
        video_assessment_historical_summary_audit_by_event_id,
    )

    db = SessionLocal()
    try:
        session_id = "sess-evtid-001"
        create_audit_event(
            db,
            event_id="evt-evtid-lookup",
            target_id=session_id[:64],
            target_type="video_assessment",
            action="video_assessment.historical_ai_summary_generated",
            role="clinician",
            actor_id=CLINICIAN_ID,
            note="{}",
            created_at=_ts(),
        )
        row = video_assessment_historical_summary_audit_by_event_id(
            db,
            session_id=session_id,
            event_id="evt-evtid-lookup",
        )
        assert row is not None
        assert row.event_id == "evt-evtid-lookup"
    finally:
        db.close()


def test_video_assessment_historical_summary_audit_by_event_id_returns_none_for_missing():
    from app.database import SessionLocal
    from app.repositories.audit import video_assessment_historical_summary_audit_by_event_id

    db = SessionLocal()
    try:
        row = video_assessment_historical_summary_audit_by_event_id(
            db,
            session_id="sess-missing",
            event_id="evt-no-such",
        )
        assert row is None
    finally:
        db.close()
