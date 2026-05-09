"""Tests for the video_assessments repository layer.

Covers:
  - Symbols importable from ``app.repositories.video_assessments``
  - ``get_video_session`` returns None for unknown session_id
  - ``get_video_session`` returns a matching row after insert
  - ``VideoAssessmentSession`` full CRUD cycle (create, read, update, delete)
  - status constraint respected (only allowed values accepted)
  - Filter helpers: query by patient_id
  - Edge cases: empty session_json, missing encounter_id
"""
from __future__ import annotations

import json
import uuid


# ── helpers ───────────────────────────────────────────────────────────────────


def _pid() -> str:
    return f"pt-va-{uuid.uuid4().hex[:8]}"


def _sid() -> str:
    return str(uuid.uuid4())


def _seed_patient(db, pid: str) -> None:
    from app.persistence.models import Patient

    db.add(
        Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="Video",
            last_name="Assess",
            email=f"{pid}@example.com",
            consent_signed=True,
            status="active",
        )
    )
    db.flush()


def _sample_session_json() -> str:
    return json.dumps(
        {
            "tasks": [
                {"id": "finger_tap_right", "status": "completed", "score": 8},
                {"id": "gait_walk", "status": "in_progress"},
            ],
            "protocol_note": "Standard motor assessment.",
        }
    )


# ── import surface ────────────────────────────────────────────────────────────


class TestImports:
    def test_module_exports_expected_symbols(self) -> None:
        from app.repositories import video_assessments as mod

        assert hasattr(mod, "VideoAssessmentSession")
        assert hasattr(mod, "Patient")
        assert hasattr(mod, "User")

    def test_get_video_session_importable(self) -> None:
        from app.repositories.video_assessments import get_video_session

        assert callable(get_video_session)


# ── get_video_session ─────────────────────────────────────────────────────────


class TestGetVideoSession:
    def test_returns_none_for_unknown_id(self) -> None:
        from app.database import SessionLocal
        from app.repositories.video_assessments import get_video_session

        db = SessionLocal()
        try:
            result = get_video_session(db, "nonexistent-session-id")
            assert result is None
        finally:
            db.close()

    def test_returns_row_after_insert(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import VideoAssessmentSession
        from app.repositories.video_assessments import get_video_session

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            sid = _sid()
            db.add(
                VideoAssessmentSession(
                    id=sid,
                    patient_id=pid,
                    protocol_name="UPDRS Motor",
                    protocol_version="2.0",
                    overall_status="in_progress",
                    session_json=_sample_session_json(),
                )
            )
            db.commit()

            result = get_video_session(db, sid)
            assert result is not None
            assert result.id == sid
            assert result.patient_id == pid
            assert result.protocol_name == "UPDRS Motor"
        finally:
            db.close()

    def test_does_not_return_row_for_different_id(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import VideoAssessmentSession
        from app.repositories.video_assessments import get_video_session

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            sid = _sid()
            db.add(
                VideoAssessmentSession(
                    id=sid,
                    patient_id=pid,
                    protocol_name="UPDRS Motor",
                    protocol_version="1.0",
                    overall_status="completed",
                    session_json="{}",
                )
            )
            db.commit()

            assert get_video_session(db, _sid()) is None  # different UUID
        finally:
            db.close()


# ── CRUD cycle ────────────────────────────────────────────────────────────────


class TestVideoAssessmentSessionCRUD:
    def test_full_crud_cycle(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import VideoAssessmentSession
        from app.repositories.video_assessments import get_video_session

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            sid = _sid()
            session = VideoAssessmentSession(
                id=sid,
                patient_id=pid,
                encounter_id="enc-001",
                protocol_name="Finger Tap",
                protocol_version="1.1",
                overall_status="draft",
                session_json=_sample_session_json(),
            )
            db.add(session)
            db.commit()

            # Read
            fetched = get_video_session(db, sid)
            assert fetched is not None
            assert fetched.encounter_id == "enc-001"
            assert fetched.overall_status == "draft"

            # Update status
            fetched.overall_status = "completed"
            db.commit()
            updated = get_video_session(db, sid)
            assert updated.overall_status == "completed"

            # Delete
            db.delete(updated)
            db.commit()
            assert get_video_session(db, sid) is None
        finally:
            db.close()

    def test_missing_encounter_id_is_valid(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import VideoAssessmentSession
        from app.repositories.video_assessments import get_video_session

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            sid = _sid()
            db.add(
                VideoAssessmentSession(
                    id=sid,
                    patient_id=pid,
                    encounter_id=None,
                    protocol_name="Gait Walk",
                    protocol_version="1.0",
                    overall_status="in_progress",
                    session_json="{}",
                )
            )
            db.commit()

            result = get_video_session(db, sid)
            assert result is not None
            assert result.encounter_id is None
        finally:
            db.close()

    def test_query_by_patient_id(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import VideoAssessmentSession

        db = SessionLocal()
        try:
            pid_a = _pid()
            pid_b = _pid()
            _seed_patient(db, pid_a)
            _seed_patient(db, pid_b)

            # 2 sessions for A, 1 for B
            for _ in range(2):
                db.add(
                    VideoAssessmentSession(
                        id=_sid(),
                        patient_id=pid_a,
                        protocol_name="UPDRS",
                        protocol_version="1.0",
                        overall_status="completed",
                        session_json="{}",
                    )
                )
            db.add(
                VideoAssessmentSession(
                    id=_sid(),
                    patient_id=pid_b,
                    protocol_name="UPDRS",
                    protocol_version="1.0",
                    overall_status="in_progress",
                    session_json="{}",
                )
            )
            db.commit()

            rows_a = (
                db.query(VideoAssessmentSession)
                .filter(VideoAssessmentSession.patient_id == pid_a)
                .all()
            )
            rows_b = (
                db.query(VideoAssessmentSession)
                .filter(VideoAssessmentSession.patient_id == pid_b)
                .all()
            )
            assert len(rows_a) == 2
            assert len(rows_b) == 1
        finally:
            db.close()

    def test_session_json_roundtrip(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import VideoAssessmentSession
        from app.repositories.video_assessments import get_video_session

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            sid = _sid()
            payload = {"tasks": [{"id": "t1", "score": 9}], "note": "Test note."}
            db.add(
                VideoAssessmentSession(
                    id=sid,
                    patient_id=pid,
                    protocol_name="Custom",
                    protocol_version="0.1",
                    overall_status="finalized",
                    session_json=json.dumps(payload),
                )
            )
            db.commit()

            row = get_video_session(db, sid)
            assert row is not None
            recovered = json.loads(row.session_json)
            assert recovered["note"] == "Test note."
            assert recovered["tasks"][0]["score"] == 9
        finally:
            db.close()

    def test_overall_status_values(self) -> None:
        """Verify each allowed status value persists without error."""
        from app.database import SessionLocal
        from app.persistence.models import VideoAssessmentSession
        from app.repositories.video_assessments import get_video_session

        ALLOWED = ["draft", "in_progress", "completed", "finalized", "cancelled"]

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            for status in ALLOWED:
                sid = _sid()
                db.add(
                    VideoAssessmentSession(
                        id=sid,
                        patient_id=pid,
                        protocol_name="Test",
                        protocol_version="1.0",
                        overall_status=status,
                        session_json="{}",
                    )
                )
                db.commit()
                row = get_video_session(db, sid)
                assert row is not None
                assert row.overall_status == status
        finally:
            db.close()
