"""Repository-level tests for app.repositories.treatment_sessions
and app.repositories.video_assessments.

Pins CRUD behaviour for ClinicalSession and VideoAssessmentSession tables
against in-memory SQLite.
All tests rely on the isolated_database autouse fixture from conftest.py.
"""
from __future__ import annotations

import uuid


_CLINICIAN = "actor-clinician-demo"
_CLINIC = "clinic-demo-default"


def _db():
    from app.database import SessionLocal
    return SessionLocal()


def _seed_patient(db, patient_id: str = "pt-ts-001") -> str:
    from app.persistence.models import Patient
    if db.query(Patient).filter_by(id=patient_id).first() is None:
        db.add(Patient(
            id=patient_id,
            clinician_id=_CLINICIAN,
            first_name="Session",
            last_name="Tester",
        ))
        db.commit()
    return patient_id


# ── ClinicalSession ───────────────────────────────────────────────────────────


def test_get_clinical_session_returns_row():
    from app.persistence.models import ClinicalSession
    from app.repositories.treatment_sessions import get_clinical_session

    db = _db()
    try:
        _seed_patient(db)
        sid = str(uuid.uuid4())
        db.add(ClinicalSession(
            id=sid,
            patient_id="pt-ts-001",
            clinician_id=_CLINICIAN,
            scheduled_at="2026-06-01T10:00:00",
            status="scheduled",
        ))
        db.commit()

        fetched = get_clinical_session(db, sid)
        assert fetched is not None
        assert fetched.id == sid
        assert fetched.status == "scheduled"
    finally:
        db.close()


def test_get_clinical_session_missing_returns_none():
    from app.repositories.treatment_sessions import get_clinical_session

    db = _db()
    try:
        result = get_clinical_session(db, "no-such-session-id")
        assert result is None
    finally:
        db.close()


def test_clinical_session_status_lifecycle():
    """Check that status transitions can be persisted directly on the model."""
    from app.persistence.models import ClinicalSession
    from app.repositories.treatment_sessions import get_clinical_session

    db = _db()
    try:
        _seed_patient(db)
        sid = str(uuid.uuid4())
        sess = ClinicalSession(
            id=sid,
            patient_id="pt-ts-001",
            clinician_id=_CLINICIAN,
            scheduled_at="2026-06-01T11:00:00",
            status="scheduled",
        )
        db.add(sess)
        db.commit()

        sess.status = "completed"
        db.commit()

        updated = get_clinical_session(db, sid)
        assert updated.status == "completed"
    finally:
        db.close()


def test_multiple_sessions_for_patient():
    from app.persistence.models import ClinicalSession

    db = _db()
    try:
        _seed_patient(db)
        for i in range(3):
            db.add(ClinicalSession(
                id=str(uuid.uuid4()),
                patient_id="pt-ts-001",
                clinician_id=_CLINICIAN,
                scheduled_at=f"2026-07-0{i+1}T10:00:00",
                status="completed",
            ))
        db.commit()

        count = db.query(ClinicalSession).filter_by(patient_id="pt-ts-001").count()
        assert count == 3
    finally:
        db.close()


# ── VideoAssessmentSession ────────────────────────────────────────────────────


def _seed_video_session(db, session_id: str, patient_id: str = "pt-ts-001") -> None:
    from app.persistence.models import VideoAssessmentSession
    db.add(VideoAssessmentSession(
        id=session_id,
        patient_id=patient_id,
        protocol_name="Motor Assessment v1",
        protocol_version="1.0",
        overall_status="in_progress",
        session_json="{}",
    ))
    db.commit()


def test_get_video_session_returns_row():
    from app.repositories.video_assessments import get_video_session

    db = _db()
    try:
        _seed_patient(db)
        vid = str(uuid.uuid4())
        _seed_video_session(db, vid)

        fetched = get_video_session(db, vid)
        assert fetched is not None
        assert fetched.id == vid
        assert fetched.protocol_name == "Motor Assessment v1"
    finally:
        db.close()


def test_get_video_session_missing_returns_none():
    from app.repositories.video_assessments import get_video_session

    db = _db()
    try:
        result = get_video_session(db, "ghost-video-session")
        assert result is None
    finally:
        db.close()


def test_video_session_status_update():
    from app.repositories.video_assessments import get_video_session

    db = _db()
    try:
        _seed_patient(db)
        vid = str(uuid.uuid4())
        _seed_video_session(db, vid)

        row = get_video_session(db, vid)
        row.overall_status = "completed"
        db.commit()

        updated = get_video_session(db, vid)
        assert updated.overall_status == "completed"
    finally:
        db.close()
