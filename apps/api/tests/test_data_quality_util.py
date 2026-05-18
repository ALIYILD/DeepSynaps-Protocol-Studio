"""TDD tests for data_quality service (issue #1011).

Run before implementing the service to confirm RED state, then GREEN after.
"""
from __future__ import annotations

import uuid

import pytest

from app.database import SessionLocal
from app.persistence.models import AssessmentRecord, Patient


def _make_patient(db) -> str:
    pid = str(uuid.uuid4())
    db.add(Patient(
        id=pid,
        clinician_id="actor-clinician-demo",
        first_name="Test",
        last_name="Patient",
    ))
    db.flush()
    return pid


def _make_record(db, patient_id: str) -> str:
    rid = str(uuid.uuid4())
    db.add(AssessmentRecord(
        id=rid,
        patient_id=patient_id,
        clinician_id="actor-clinician-demo",
        template_id="phq9",
        template_title="PHQ-9",
        data_json="{}",
    ))
    db.flush()
    return rid


def test_add_flag_single_entry():
    """add_flag on a fresh record → flags array has one entry with the right shape."""
    from app.services.data_quality import add_flag

    db = SessionLocal()
    try:
        pid = _make_patient(db)
        rid = _make_record(db, pid)
        db.commit()

        add_flag(rid, kind="completeness", severity="warning", source="agent", note="Missing DOB")

        db.expire_all()
        record = db.query(AssessmentRecord).filter_by(id=rid).one()
        flags = record.data_quality_flags
        assert isinstance(flags, list)
        assert len(flags) == 1
        f = flags[0]
        assert f["kind"] == "completeness"
        assert f["severity"] == "warning"
        assert f["source"] == "agent"
        assert f["note"] == "Missing DOB"
        assert "created_at" in f
    finally:
        db.close()


def test_add_flag_twice_different_kinds():
    """add_flag twice with different kind → array of two, both present."""
    from app.services.data_quality import add_flag

    db = SessionLocal()
    try:
        pid = _make_patient(db)
        rid = _make_record(db, pid)
        db.commit()

        add_flag(rid, kind="completeness", severity="warning", source="agent", note="Missing DOB")
        add_flag(rid, kind="outlier", severity="error", source="pipeline", note="Score out of range")

        db.expire_all()
        record = db.query(AssessmentRecord).filter_by(id=rid).one()
        flags = record.data_quality_flags
        assert len(flags) == 2
        kinds = {f["kind"] for f in flags}
        assert kinds == {"completeness", "outlier"}
    finally:
        db.close()


def test_clear_flags_by_kind():
    """clear_flags(kind='completeness') removes only that kind, leaves others."""
    from app.services.data_quality import add_flag, clear_flags

    db = SessionLocal()
    try:
        pid = _make_patient(db)
        rid = _make_record(db, pid)
        db.commit()

        add_flag(rid, kind="completeness", severity="warning", source="agent", note="Missing DOB")
        add_flag(rid, kind="outlier", severity="error", source="pipeline", note="Score out of range")

        clear_flags(rid, kind="completeness")

        db.expire_all()
        record = db.query(AssessmentRecord).filter_by(id=rid).one()
        flags = record.data_quality_flags
        assert len(flags) == 1
        assert flags[0]["kind"] == "outlier"
    finally:
        db.close()


def test_clear_flags_all():
    """clear_flags(kind=None) removes all flags."""
    from app.services.data_quality import add_flag, clear_flags

    db = SessionLocal()
    try:
        pid = _make_patient(db)
        rid = _make_record(db, pid)
        db.commit()

        add_flag(rid, kind="completeness", severity="warning", source="agent", note="x")
        add_flag(rid, kind="outlier", severity="error", source="pipeline", note="y")

        clear_flags(rid)

        db.expire_all()
        record = db.query(AssessmentRecord).filter_by(id=rid).one()
        assert record.data_quality_flags == []
    finally:
        db.close()
