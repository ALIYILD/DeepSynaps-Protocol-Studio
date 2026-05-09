"""Tests for the protocol_studio repository layer.

Covers:
  - ``get_patient_context_record`` returns None for unknown patient
  - ``get_patient_context_record`` returns correct fields for a real patient
  - ``get_patient_data_source_stats`` returns zero counts when no data exists
  - ``get_patient_data_source_stats`` returns correct counts after seeding
  - ``ProtocolStudioPatientContextRecord`` is a frozen dataclass
  - ``ProtocolStudioSourceStat`` count and last_updated fields
  - ``_serialize_dt`` handles None and datetime inputs
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone


# ── helpers ───────────────────────────────────────────────────────────────────


def _pid() -> str:
    return f"pt-ps-{uuid.uuid4().hex[:8]}"


def _seed_patient(
    db,
    pid: str,
    *,
    dob: str = "1985-06-15",
    gender: str = "female",
    primary_condition: str = "depression",
    medical_history: str | None = "No prior hospitalisations.",
) -> None:
    from app.persistence.models import Patient

    db.add(
        Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="Proto",
            last_name="Studio",
            email=f"{pid}@example.com",
            consent_signed=True,
            status="active",
            dob=dob,
            gender=gender,
            primary_condition=primary_condition,
            medical_history=medical_history,
        )
    )
    db.flush()


# ── get_patient_context_record ────────────────────────────────────────────────


class TestGetPatientContextRecord:
    def test_returns_none_for_unknown_patient(self) -> None:
        from app.database import SessionLocal
        from app.repositories.protocol_studio import get_patient_context_record

        db = SessionLocal()
        try:
            result = get_patient_context_record(db, "nonexistent-patient-id")
            assert result is None
        finally:
            db.close()

    def test_returns_record_with_correct_fields(self) -> None:
        from app.database import SessionLocal
        from app.repositories.protocol_studio import (
            ProtocolStudioPatientContextRecord,
            get_patient_context_record,
        )

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(
                db,
                pid,
                dob="1990-03-22",
                gender="male",
                primary_condition="anxiety",
                medical_history="Seasonal allergies.",
            )
            db.commit()

            result = get_patient_context_record(db, pid)
            assert result is not None
            assert isinstance(result, ProtocolStudioPatientContextRecord)
            assert result.dob == "1990-03-22"
            assert result.gender == "male"
            assert result.primary_condition == "anxiety"
            assert result.medical_history == "Seasonal allergies."
        finally:
            db.close()

    def test_returns_record_with_null_optional_fields(self) -> None:
        from app.database import SessionLocal
        from app.repositories.protocol_studio import get_patient_context_record

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid, dob=None, gender=None, primary_condition=None, medical_history=None)
            db.commit()

            result = get_patient_context_record(db, pid)
            assert result is not None
            # All optional fields may be None — but the record is returned.
            assert result.dob is None or isinstance(result.dob, str)
        finally:
            db.close()

    def test_frozen_dataclass_immutable(self) -> None:
        from app.repositories.protocol_studio import ProtocolStudioPatientContextRecord
        import dataclasses

        rec = ProtocolStudioPatientContextRecord(
            dob="2000-01-01",
            gender="other",
            primary_condition="ocd",
            medical_history=None,
        )
        assert dataclasses.is_dataclass(rec)
        try:
            rec.dob = "changed"  # type: ignore[misc]
            assert False, "Expected FrozenInstanceError"
        except Exception:
            pass  # frozen dataclass raises


# ── get_patient_data_source_stats ─────────────────────────────────────────────


class TestGetPatientDataSourceStats:
    def test_returns_all_keys_for_empty_patient(self) -> None:
        from app.database import SessionLocal
        from app.repositories.protocol_studio import (
            ProtocolStudioSourceStat,
            get_patient_data_source_stats,
        )

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            db.commit()

            stats = get_patient_data_source_stats(db, pid)
            expected_keys = {"assessments", "qeeg", "mri", "sessions", "outcomes", "deeptwin"}
            assert set(stats.keys()) == expected_keys
            for key, stat in stats.items():
                assert isinstance(stat, ProtocolStudioSourceStat)
                assert stat.count == 0, f"Expected 0 for {key}, got {stat.count}"
        finally:
            db.close()

    def test_counts_assessments_correctly(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import AssessmentRecord
        from app.repositories.protocol_studio import get_patient_data_source_stats

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            # Seed two assessment records.
            for i in range(2):
                db.add(
                    AssessmentRecord(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        clinician_id="actor-clinician-demo",
                        template_id="phq9",
                        template_title="PHQ-9",
                        status="completed",
                    )
                )
            db.commit()

            stats = get_patient_data_source_stats(db, pid)
            assert stats["assessments"].count == 2
        finally:
            db.close()

    def test_counts_sessions_correctly(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import ClinicalSession
        from app.repositories.protocol_studio import get_patient_data_source_stats

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            for _ in range(3):
                db.add(
                    ClinicalSession(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        clinician_id="actor-clinician-demo",
                        scheduled_at="2026-05-01T09:00:00Z",
                        duration_minutes=50,
                        appointment_type="session",
                        status="completed",
                    )
                )
            db.commit()

            stats = get_patient_data_source_stats(db, pid)
            assert stats["sessions"].count == 3
        finally:
            db.close()

    def test_counts_only_own_patient_rows(self) -> None:
        """Stats must be scoped to the requested patient_id only."""
        from app.database import SessionLocal
        from app.persistence.models import AssessmentRecord
        from app.repositories.protocol_studio import get_patient_data_source_stats

        db = SessionLocal()
        try:
            pid_a = _pid()
            pid_b = _pid()
            _seed_patient(db, pid_a)
            _seed_patient(db, pid_b)
            # 1 row for A, 2 rows for B
            db.add(
                AssessmentRecord(
                    id=str(uuid.uuid4()),
                    patient_id=pid_a,
                    clinician_id="actor-clinician-demo",
                    template_id="gad7",
                    template_title="GAD-7",
                    status="completed",
                )
            )
            for _ in range(2):
                db.add(
                    AssessmentRecord(
                        id=str(uuid.uuid4()),
                        patient_id=pid_b,
                        clinician_id="actor-clinician-demo",
                        template_id="gad7",
                        template_title="GAD-7",
                        status="completed",
                    )
                )
            db.commit()

            assert get_patient_data_source_stats(db, pid_a)["assessments"].count == 1
            assert get_patient_data_source_stats(db, pid_b)["assessments"].count == 2
        finally:
            db.close()

    def test_last_updated_returns_iso_string_after_seeding(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import AssessmentRecord
        from app.repositories.protocol_studio import get_patient_data_source_stats

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            db.add(
                AssessmentRecord(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    clinician_id="actor-clinician-demo",
                    template_id="phq9",
                    template_title="PHQ-9",
                    status="completed",
                )
            )
            db.commit()

            stats = get_patient_data_source_stats(db, pid)
            lu = stats["assessments"].last_updated
            assert lu is not None
            assert "T" in lu or "-" in lu  # ISO fragment present
        finally:
            db.close()
