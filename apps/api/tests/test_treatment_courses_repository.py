"""Repository-level tests for app.repositories.treatment_courses.

Pins CRUD behaviour for TreatmentCourse, ReviewQueueItem, and
DeliveredSessionParameters tables against in-memory SQLite.
All tests rely on the isolated_database autouse fixture from conftest.py
which resets the schema and seeds the demo clinic + users before each test.
"""
from __future__ import annotations

import uuid


# ── Helpers ──────────────────────────────────────────────────────────────────

_CLINICIAN = "actor-clinician-demo"
_CLINIC = "clinic-demo-default"


def _db():
    from app.database import SessionLocal
    return SessionLocal()


def _seed_patient(db, patient_id: str = "pt-tc-001") -> str:
    from app.persistence.models import Patient
    if db.query(Patient).filter_by(id=patient_id).first() is None:
        db.add(Patient(
            id=patient_id,
            clinician_id=_CLINICIAN,
            first_name="Test",
            last_name="Patient",
        ))
        db.commit()
    return patient_id


def _insert_course(db, *, patient_id: str = "pt-tc-001") -> "TreatmentCourse":
    from app.repositories.treatment_courses import insert_treatment_course
    return insert_treatment_course(
        db,
        patient_id=patient_id,
        clinician_id=_CLINICIAN,
        protocol_id="proto-tms-mdd",
        condition_slug="major_depressive_disorder",
        modality_slug="rtms",
        device_slug="magstim",
        phenotype_id=None,
        evidence_grade="A",
        on_label=True,
        planned_sessions_total=20,
        planned_sessions_per_week=5,
        planned_session_duration_minutes=40,
        planned_frequency_hz="10hz",
        planned_intensity="120% RMT",
        coil_placement="F3",
        target_region="dlPFC",
        status="active",
        review_required=False,
        clinician_notes="Test course",
        protocol_json="{}",
    )


# ── TreatmentCourse ───────────────────────────────────────────────────────────


def test_insert_and_get_treatment_course():
    from app.repositories.treatment_courses import get_treatment_course

    db = _db()
    try:
        _seed_patient(db)
        course = _insert_course(db)
        db.commit()

        fetched = get_treatment_course(db, course.id)
        assert fetched is not None
        assert fetched.patient_id == "pt-tc-001"
        assert fetched.modality_slug == "rtms"
    finally:
        db.close()


def test_get_treatment_course_missing_returns_none():
    from app.repositories.treatment_courses import get_treatment_course

    db = _db()
    try:
        assert get_treatment_course(db, "no-such-id") is None
    finally:
        db.close()


def test_list_treatment_courses_by_clinician():
    from app.repositories.treatment_courses import list_treatment_courses

    db = _db()
    try:
        _seed_patient(db)
        _insert_course(db)
        _insert_course(db)
        db.commit()

        rows = list_treatment_courses(db, clinician_id=_CLINICIAN)
        assert len(rows) >= 2
    finally:
        db.close()


def test_list_treatment_courses_filter_by_status():
    from app.repositories.treatment_courses import insert_treatment_course, list_treatment_courses

    db = _db()
    try:
        _seed_patient(db)
        _insert_course(db)  # status="active"
        # Insert a completed course
        insert_treatment_course(
            db,
            patient_id="pt-tc-001",
            clinician_id=_CLINICIAN,
            protocol_id="proto-x",
            condition_slug="anxiety",
            modality_slug="tDCS",
            device_slug=None,
            phenotype_id=None,
            evidence_grade="B",
            on_label=True,
            planned_sessions_total=10,
            planned_sessions_per_week=3,
            planned_session_duration_minutes=30,
            planned_frequency_hz=None,
            planned_intensity=None,
            coil_placement=None,
            target_region=None,
            status="completed",
            review_required=False,
            clinician_notes=None,
            protocol_json="{}",
        )
        db.commit()

        active = list_treatment_courses(db, status="active")
        for r in active:
            assert r.status == "active"

        completed = list_treatment_courses(db, status="completed")
        for r in completed:
            assert r.status == "completed"
    finally:
        db.close()


def test_get_treatment_courses_by_ids():
    from app.repositories.treatment_courses import get_treatment_courses_by_ids

    db = _db()
    try:
        _seed_patient(db)
        c1 = _insert_course(db)
        c2 = _insert_course(db)
        db.commit()

        result = get_treatment_courses_by_ids(db, [c1.id, c2.id])
        assert len(result) == 2
        assert c1.id in result
        assert c2.id in result

        # Empty input returns empty dict
        assert get_treatment_courses_by_ids(db, []) == {}
    finally:
        db.close()


# ── ReviewQueueItem ───────────────────────────────────────────────────────────


def test_insert_and_get_review_queue_item():
    from app.repositories.treatment_courses import insert_review_queue_item, get_review_queue_item

    db = _db()
    try:
        _seed_patient(db)
        course = _insert_course(db)
        db.commit()

        item = insert_review_queue_item(
            db,
            item_type="course_review",
            target_id=course.id,
            target_type="treatment_course",
            patient_id="pt-tc-001",
            priority="high",
            status="pending",
            created_by=_CLINICIAN,
        )
        db.commit()

        fetched = get_review_queue_item(db, item.id)
        assert fetched is not None
        assert fetched.status == "pending"
        assert fetched.target_id == course.id
    finally:
        db.close()


def test_close_pending_review_items_for_course():
    from datetime import datetime, timezone
    from app.repositories.treatment_courses import (
        insert_review_queue_item,
        close_pending_review_items_for_course,
        get_review_queue_item,
    )

    db = _db()
    try:
        _seed_patient(db)
        course = _insert_course(db)
        db.commit()

        item = insert_review_queue_item(
            db,
            item_type="course_review",
            target_id=course.id,
            target_type="treatment_course",
            patient_id="pt-tc-001",
            priority="normal",
            status="pending",
            created_by=_CLINICIAN,
        )
        db.commit()

        close_pending_review_items_for_course(
            db, course_id=course.id, completed_at=datetime.now(timezone.utc)
        )
        db.commit()

        db.refresh(item)
        assert item.status == "completed"
    finally:
        db.close()


# ── DeliveredSessionParameters ────────────────────────────────────────────────


def test_insert_and_count_delivered_sessions():
    from app.repositories.treatment_courses import (
        insert_delivered_session,
        count_delivered_sessions,
    )

    db = _db()
    try:
        _seed_patient(db)
        course = _insert_course(db)
        db.commit()

        for i in range(3):
            insert_delivered_session(
                db,
                session_id=str(uuid.uuid4()),
                course_id=course.id,
                device_slug="magstim",
                device_serial=f"SN-{i:04d}",
                coil_position="F3",
                frequency_hz="10hz",
                intensity_pct_rmt="120",
                pulses_delivered=3000,
                duration_minutes=40,
                side="left",
                montage=None,
                tech_id=_CLINICIAN,
                tolerance_rating="good",
                interruptions=False,
                interruption_reason=None,
                post_session_notes=None,
                checklist_json=None,
            )
        db.commit()

        assert count_delivered_sessions(db, course.id) == 3
    finally:
        db.close()


def test_get_latest_delivered_session():
    from app.repositories.treatment_courses import (
        insert_delivered_session,
        get_latest_delivered_session,
    )

    db = _db()
    try:
        _seed_patient(db)
        course = _insert_course(db)
        db.commit()

        for _ in range(2):
            insert_delivered_session(
                db,
                session_id=str(uuid.uuid4()),
                course_id=course.id,
                device_slug=None,
                device_serial=None,
                coil_position=None,
                frequency_hz=None,
                intensity_pct_rmt=None,
                pulses_delivered=None,
                duration_minutes=None,
                side=None,
                montage=None,
                tech_id=_CLINICIAN,
                tolerance_rating=None,
                interruptions=False,
                interruption_reason=None,
                post_session_notes=None,
                checklist_json=None,
            )
        db.commit()

        latest = get_latest_delivered_session(db, course.id)
        assert latest is not None
        assert latest.course_id == course.id
    finally:
        db.close()


def test_list_delivered_sessions_for_course():
    from app.repositories.treatment_courses import (
        insert_delivered_session,
        list_delivered_sessions_for_course,
    )

    db = _db()
    try:
        _seed_patient(db)
        course = _insert_course(db)
        db.commit()

        for _ in range(4):
            insert_delivered_session(
                db,
                session_id=str(uuid.uuid4()),
                course_id=course.id,
                device_slug=None,
                device_serial=None,
                coil_position=None,
                frequency_hz=None,
                intensity_pct_rmt=None,
                pulses_delivered=None,
                duration_minutes=None,
                side=None,
                montage=None,
                tech_id=_CLINICIAN,
                tolerance_rating=None,
                interruptions=False,
                interruption_reason=None,
                post_session_notes=None,
                checklist_json=None,
            )
        db.commit()

        rows = list_delivered_sessions_for_course(db, course.id)
        assert len(rows) == 4

        limited = list_delivered_sessions_for_course(db, course.id, limit=2)
        assert len(limited) == 2
    finally:
        db.close()
