"""Tests for app.repositories.home_program_tasks — CRUD contracts (PR 77/N).

Covers:
- insert + get happy path
- get returns None for unknown id
- list_patient_completions scoped by clinician
- list_patient_completions further filtered by patient_id
- empty-result guard when no data
- limit is respected
"""
from __future__ import annotations

from datetime import datetime, timezone


# ── Helpers ───────────────────────────────────────────────────────────────────

CLINICIAN_ID = "actor-clinician-demo"


def _make_patient(db, patient_id: str) -> None:
    """Insert a minimal Patient row (required for FK)."""
    from app.persistence.models import Patient

    if db.get(Patient, patient_id) is None:
        db.add(
            Patient(
                id=patient_id,
                clinician_id=CLINICIAN_ID,
                first_name="Test",
                last_name="Patient",
                status="active",
            )
        )
        db.commit()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_insert_and_get_task_happy_path():
    from app.database import SessionLocal
    from app.repositories.home_program_tasks import (
        get_clinician_home_program_task,
        insert_clinician_home_program_task,
    )

    db = SessionLocal()
    try:
        _make_patient(db, "pt-hpt-a")
        row = insert_clinician_home_program_task(
            db,
            task_id="task-hpt-001",
            server_task_id="srv-task-001",
            patient_id="pt-hpt-a",
            clinician_id=CLINICIAN_ID,
            task_json='{"type":"breathing"}',
            revision=1,
            created_at=_now(),
            updated_at=_now(),
        )
        db.commit()

        assert row.id == "task-hpt-001"
        assert row.server_task_id == "srv-task-001"
        assert row.patient_id == "pt-hpt-a"
        assert row.revision == 1

        fetched = get_clinician_home_program_task(db, "task-hpt-001")
        assert fetched is not None
        assert fetched.task_json == '{"type":"breathing"}'
    finally:
        db.close()


def test_get_unknown_task_returns_none():
    from app.database import SessionLocal
    from app.repositories.home_program_tasks import get_clinician_home_program_task

    db = SessionLocal()
    try:
        result = get_clinician_home_program_task(db, "nonexistent-task-id")
        assert result is None
    finally:
        db.close()


def test_insert_sets_revision_field():
    from app.database import SessionLocal
    from app.repositories.home_program_tasks import (
        get_clinician_home_program_task,
        insert_clinician_home_program_task,
    )

    db = SessionLocal()
    try:
        _make_patient(db, "pt-hpt-b")
        insert_clinician_home_program_task(
            db,
            task_id="task-hpt-rev",
            server_task_id="srv-task-rev",
            patient_id="pt-hpt-b",
            clinician_id=CLINICIAN_ID,
            task_json='{"type":"mindfulness"}',
            revision=5,
            created_at=_now(),
            updated_at=_now(),
        )
        db.commit()

        row = get_clinician_home_program_task(db, "task-hpt-rev")
        assert row is not None
        assert row.revision == 5
    finally:
        db.close()


def test_list_completions_empty_when_none():
    from app.database import SessionLocal
    from app.repositories.home_program_tasks import list_patient_completions_for_clinician

    db = SessionLocal()
    try:
        result = list_patient_completions_for_clinician(
            db, clinician_id="no-such-clinician"
        )
        assert result == []
    finally:
        db.close()


def test_list_completions_returns_records_for_clinician():
    from app.database import SessionLocal
    from app.persistence.models import PatientHomeProgramTaskCompletion
    from app.repositories.home_program_tasks import list_patient_completions_for_clinician

    db = SessionLocal()
    try:
        _make_patient(db, "pt-hpt-c")
        _make_patient(db, "pt-hpt-d")

        for i, patient_id in enumerate(["pt-hpt-c", "pt-hpt-d"]):
            db.add(
                PatientHomeProgramTaskCompletion(
                    server_task_id=f"srv-comp-{i}",
                    patient_id=patient_id,
                    clinician_id=CLINICIAN_ID,
                    completed=True,
                    completed_at=_now(),
                )
            )
        db.commit()

        results = list_patient_completions_for_clinician(
            db, clinician_id=CLINICIAN_ID
        )
        assert len(results) == 2
    finally:
        db.close()


def test_list_completions_filtered_by_patient():
    from app.database import SessionLocal
    from app.persistence.models import PatientHomeProgramTaskCompletion
    from app.repositories.home_program_tasks import list_patient_completions_for_clinician

    db = SessionLocal()
    try:
        _make_patient(db, "pt-hpt-e")
        _make_patient(db, "pt-hpt-f")

        for i, patient_id in enumerate(["pt-hpt-e", "pt-hpt-f"]):
            db.add(
                PatientHomeProgramTaskCompletion(
                    server_task_id=f"srv-fil-{i}",
                    patient_id=patient_id,
                    clinician_id=CLINICIAN_ID,
                    completed=True,
                    completed_at=_now(),
                )
            )
        db.commit()

        results = list_patient_completions_for_clinician(
            db, clinician_id=CLINICIAN_ID, patient_id="pt-hpt-e"
        )
        assert len(results) == 1
        assert results[0].patient_id == "pt-hpt-e"
    finally:
        db.close()


def test_list_completions_limit_respected():
    from app.database import SessionLocal
    from app.persistence.models import PatientHomeProgramTaskCompletion
    from app.repositories.home_program_tasks import list_patient_completions_for_clinician

    db = SessionLocal()
    try:
        _make_patient(db, "pt-hpt-g")
        for i in range(5):
            db.add(
                PatientHomeProgramTaskCompletion(
                    server_task_id=f"srv-lim-{i}",
                    patient_id="pt-hpt-g",
                    clinician_id=CLINICIAN_ID,
                    completed=True,
                    completed_at=_now(),
                )
            )
        db.commit()

        results = list_patient_completions_for_clinician(
            db, clinician_id=CLINICIAN_ID, patient_id="pt-hpt-g", limit=3
        )
        assert len(results) == 3
    finally:
        db.close()
