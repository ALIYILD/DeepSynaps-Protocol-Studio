"""Tests for app.repositories.sessions — ClinicalSession CRUD contracts (PR 83/N).

Covers:
- create_session inserts with expected fields
- get_session returns correct record
- get_session returns None when not owned by clinician
- list_sessions_for_clinician returns all sessions
- list_sessions_for_patient filters by patient_id and clinician_id
- update_session modifies fields
- update_session returns None for unknown id
- delete_session removes record and returns True
- delete_session returns False for unknown id
- check_conflicts detects overlapping session for same clinician
- check_conflicts returns empty list for non-overlapping times
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta


CLINICIAN_ID = "actor-clinician-demo"


def _uid() -> str:
    return f"test-{uuid.uuid4().hex[:8]}"


def _make_patient(db, patient_id: str) -> None:
    from app.persistence.models import Patient

    if db.get(Patient, patient_id) is None:
        db.add(Patient(
            id=patient_id,
            clinician_id=CLINICIAN_ID,
            first_name="Test",
            last_name="Session",
            status="active",
        ))
        db.commit()


def _iso(offset_hours: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=offset_hours)).isoformat()


def test_create_session_happy_path():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-create")
        record = create_session(
            db,
            patient_id="pt-sess-create",
            clinician_id=CLINICIAN_ID,
            scheduled_at=_iso(1),
            duration_minutes=45,
            modality="TMS",
            status="scheduled",
        )
        assert record.patient_id == "pt-sess-create"
        assert record.clinician_id == CLINICIAN_ID
        assert record.duration_minutes == 45
        assert record.modality == "TMS"
        assert record.status == "scheduled"
    finally:
        db.close()


def test_get_session_returns_record():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session, get_session

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-get")
        record = create_session(
            db,
            patient_id="pt-sess-get",
            clinician_id=CLINICIAN_ID,
            scheduled_at=_iso(2),
        )
        found = get_session(db, record.id, CLINICIAN_ID)
        assert found is not None
        assert found.id == record.id
    finally:
        db.close()


def test_get_session_returns_none_for_wrong_clinician():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session, get_session

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-own")
        record = create_session(
            db,
            patient_id="pt-sess-own",
            clinician_id=CLINICIAN_ID,
            scheduled_at=_iso(3),
        )
        found = get_session(db, record.id, "clinician-other")
        assert found is None
    finally:
        db.close()


def test_list_sessions_for_clinician():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session, list_sessions_for_clinician

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-list")
        create_session(db, patient_id="pt-sess-list", clinician_id=CLINICIAN_ID, scheduled_at=_iso(4))
        create_session(db, patient_id="pt-sess-list", clinician_id=CLINICIAN_ID, scheduled_at=_iso(5))
        sessions = list_sessions_for_clinician(db, CLINICIAN_ID)
        assert len(sessions) >= 2
    finally:
        db.close()


def test_list_sessions_for_patient():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session, list_sessions_for_patient

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-pt-list")
        create_session(db, patient_id="pt-sess-pt-list", clinician_id=CLINICIAN_ID, scheduled_at=_iso(6))
        sessions = list_sessions_for_patient(db, "pt-sess-pt-list", CLINICIAN_ID)
        assert all(s.patient_id == "pt-sess-pt-list" for s in sessions)
        assert len(sessions) >= 1
    finally:
        db.close()


def test_update_session_modifies_status():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session, update_session

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-upd")
        record = create_session(
            db,
            patient_id="pt-sess-upd",
            clinician_id=CLINICIAN_ID,
            scheduled_at=_iso(7),
            status="scheduled",
        )
        updated = update_session(db, record.id, CLINICIAN_ID, status="completed")
        assert updated is not None
        assert updated.status == "completed"
    finally:
        db.close()


def test_update_session_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.sessions import update_session

    db = SessionLocal()
    try:
        result = update_session(db, "sess-unknown-xyz", CLINICIAN_ID, status="completed")
        assert result is None
    finally:
        db.close()


def test_delete_session_returns_true():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session, delete_session, get_session

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-del")
        record = create_session(
            db,
            patient_id="pt-sess-del",
            clinician_id=CLINICIAN_ID,
            scheduled_at=_iso(8),
        )
        deleted = delete_session(db, record.id, CLINICIAN_ID)
        assert deleted is True
        assert get_session(db, record.id, CLINICIAN_ID) is None
    finally:
        db.close()


def test_delete_session_returns_false_for_unknown():
    from app.database import SessionLocal
    from app.repositories.sessions import delete_session

    db = SessionLocal()
    try:
        result = delete_session(db, "sess-no-such", CLINICIAN_ID)
        assert result is False
    finally:
        db.close()


def test_check_conflicts_detects_overlap():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session, check_conflicts

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-conflict")
        base_time = (datetime.now(timezone.utc) + timedelta(hours=24)).replace(microsecond=0)
        create_session(
            db,
            patient_id="pt-sess-conflict",
            clinician_id=CLINICIAN_ID,
            scheduled_at=base_time.isoformat(),
            duration_minutes=60,
            status="scheduled",
        )
        # Overlapping session: starts 30 min into the existing one
        overlap_time = (base_time + timedelta(minutes=30)).isoformat()
        conflicts = check_conflicts(
            db,
            clinician_id=CLINICIAN_ID,
            scheduled_at=overlap_time,
            duration_minutes=60,
        )
        assert len(conflicts) >= 1
    finally:
        db.close()


def test_check_conflicts_empty_for_non_overlapping():
    from app.database import SessionLocal
    from app.repositories.sessions import create_session, check_conflicts

    db = SessionLocal()
    try:
        _make_patient(db, "pt-sess-noconflict")
        base_time = (datetime.now(timezone.utc) + timedelta(hours=48)).replace(microsecond=0)
        create_session(
            db,
            patient_id="pt-sess-noconflict",
            clinician_id=CLINICIAN_ID,
            scheduled_at=base_time.isoformat(),
            duration_minutes=60,
            status="scheduled",
        )
        # Starts 3 hours after — no overlap
        non_overlap_time = (base_time + timedelta(hours=3)).isoformat()
        conflicts = check_conflicts(
            db,
            clinician_id=CLINICIAN_ID,
            scheduled_at=non_overlap_time,
            duration_minutes=60,
        )
        assert len(conflicts) == 0
    finally:
        db.close()
