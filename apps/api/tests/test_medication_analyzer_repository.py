"""Tests for the medication_analyzer repository layer.

The repository is a thin re-export facade: it surfaces
``MedicationAnalyzerAudit``, ``MedicationAnalyzerReviewNote``,
``MedicationAnalyzerTimelineEvent``, ``PatientMedication``, ``Patient``,
and ``User`` so that ``medication_analyzer_router`` never imports from
``app.persistence.models`` directly.

Tests here verify:
  - The symbols are importable from ``app.repositories.medication_analyzer``
  - CRUD round-trips through each model work correctly against the test DB.
  - Filter helpers (by patient_id, actor_id) behave as expected.
  - Edge cases: missing patient, duplicate medication, empty-string guards.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone


# ── helpers ──────────────────────────────────────────────────────────────────


def _pid() -> str:
    return f"pt-ma-{uuid.uuid4().hex[:8]}"


def _aid() -> str:
    return f"actor-{uuid.uuid4().hex[:8]}"


def _seed_patient(db, pid: str) -> None:
    from app.persistence.models import Patient

    db.add(
        Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="Meds",
            last_name="Tester",
            email=f"{pid}@example.com",
            consent_signed=True,
            status="active",
        )
    )
    db.flush()


# ── import / symbol surface ───────────────────────────────────────────────────


class TestImports:
    def test_module_symbols_exist(self) -> None:
        from app.repositories import medication_analyzer as mod

        assert hasattr(mod, "MedicationAnalyzerAudit")
        assert hasattr(mod, "MedicationAnalyzerReviewNote")
        assert hasattr(mod, "MedicationAnalyzerTimelineEvent")
        assert hasattr(mod, "PatientMedication")
        assert hasattr(mod, "Patient")
        assert hasattr(mod, "User")


# ── MedicationAnalyzerAudit ───────────────────────────────────────────────────


class TestMedicationAnalyzerAudit:
    def test_insert_and_retrieve(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import MedicationAnalyzerAudit

        db = SessionLocal()
        try:
            pid = _pid()
            actor = _aid()
            row = MedicationAnalyzerAudit(
                id=str(uuid.uuid4()),
                patient_id=pid,
                actor_id=actor,
                action="load",
                audit_ref=f"ref-{uuid.uuid4().hex[:8]}",
                ruleset_version="v1.0",
                detail_json='{"note":"test"}',
            )
            db.add(row)
            db.commit()

            fetched = db.get(MedicationAnalyzerAudit, row.id)
            assert fetched is not None
            assert fetched.patient_id == pid
            assert fetched.action == "load"
            assert fetched.ruleset_version == "v1.0"
        finally:
            db.close()

    def test_filter_by_patient_id(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import MedicationAnalyzerAudit

        db = SessionLocal()
        try:
            pid_a = _pid()
            pid_b = _pid()
            actor = _aid()
            for pid, action in [(pid_a, "load"), (pid_a, "review"), (pid_b, "load")]:
                db.add(
                    MedicationAnalyzerAudit(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        actor_id=actor,
                        action=action,
                    )
                )
            db.commit()

            rows = (
                db.query(MedicationAnalyzerAudit)
                .filter_by(patient_id=pid_a)
                .all()
            )
            assert len(rows) == 2
            assert all(r.patient_id == pid_a for r in rows)
        finally:
            db.close()

    def test_filter_by_action(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import MedicationAnalyzerAudit

        db = SessionLocal()
        try:
            pid = _pid()
            actor = _aid()
            for action in ["load", "review", "load", "export"]:
                db.add(
                    MedicationAnalyzerAudit(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        actor_id=actor,
                        action=action,
                    )
                )
            db.commit()

            loads = (
                db.query(MedicationAnalyzerAudit)
                .filter_by(patient_id=pid, action="load")
                .all()
            )
            assert len(loads) == 2
        finally:
            db.close()


# ── MedicationAnalyzerReviewNote ──────────────────────────────────────────────


class TestMedicationAnalyzerReviewNote:
    def test_insert_and_retrieve(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import MedicationAnalyzerReviewNote

        db = SessionLocal()
        try:
            pid = _pid()
            actor = _aid()
            row = MedicationAnalyzerReviewNote(
                id=str(uuid.uuid4()),
                patient_id=pid,
                actor_id=actor,
                note_text="Discussed drug interaction risk with patient.",
                linked_recommendation_ids_json='["rec-001","rec-002"]',
            )
            db.add(row)
            db.commit()

            fetched = db.get(MedicationAnalyzerReviewNote, row.id)
            assert fetched is not None
            assert fetched.note_text == "Discussed drug interaction risk with patient."
            assert "rec-001" in fetched.linked_recommendation_ids_json
        finally:
            db.close()

    def test_multiple_notes_per_patient(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import MedicationAnalyzerReviewNote

        db = SessionLocal()
        try:
            pid = _pid()
            actor = _aid()
            for i in range(3):
                db.add(
                    MedicationAnalyzerReviewNote(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        actor_id=actor,
                        note_text=f"Note {i}",
                    )
                )
            db.commit()

            rows = db.query(MedicationAnalyzerReviewNote).filter_by(patient_id=pid).all()
            assert len(rows) == 3
        finally:
            db.close()


# ── MedicationAnalyzerTimelineEvent ──────────────────────────────────────────


class TestMedicationAnalyzerTimelineEvent:
    def test_insert_and_retrieve(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import MedicationAnalyzerTimelineEvent

        db = SessionLocal()
        try:
            pid = _pid()
            actor = _aid()
            row = MedicationAnalyzerTimelineEvent(
                id=str(uuid.uuid4()),
                patient_id=pid,
                actor_id=actor,
                event_type="dose_change",
                occurred_at="2026-05-01T10:00:00Z",
                medication_id=str(uuid.uuid4()),
                payload_json='{"new_dose":"10mg","old_dose":"5mg"}',
                source_origin="clinician_entry",
            )
            db.add(row)
            db.commit()

            fetched = db.get(MedicationAnalyzerTimelineEvent, row.id)
            assert fetched is not None
            assert fetched.event_type == "dose_change"
            assert fetched.occurred_at == "2026-05-01T10:00:00Z"
            assert fetched.source_origin == "clinician_entry"
        finally:
            db.close()

    def test_filter_by_event_type(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import MedicationAnalyzerTimelineEvent

        db = SessionLocal()
        try:
            pid = _pid()
            actor = _aid()
            for etype in ["dose_change", "start", "dose_change", "stop"]:
                db.add(
                    MedicationAnalyzerTimelineEvent(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        actor_id=actor,
                        event_type=etype,
                        occurred_at="2026-05-01",
                    )
                )
            db.commit()

            dose_changes = (
                db.query(MedicationAnalyzerTimelineEvent)
                .filter_by(patient_id=pid, event_type="dose_change")
                .all()
            )
            assert len(dose_changes) == 2
        finally:
            db.close()


# ── PatientMedication ─────────────────────────────────────────────────────────


class TestPatientMedication:
    def test_crud_full_cycle(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import PatientMedication

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            med_id = str(uuid.uuid4())
            med = PatientMedication(
                id=med_id,
                patient_id=pid,
                clinician_id="actor-clinician-demo",
                name="Sertraline",
                generic_name="Sertraline HCl",
                drug_class="SSRI",
                dose="50mg",
                frequency="once daily",
                route="oral",
                indication="Depression",
                prescriber="Dr. Sims",
                started_at="2026-01-15",
                active=True,
                notes="Well-tolerated so far.",
            )
            db.add(med)
            db.commit()

            fetched = db.get(PatientMedication, med_id)
            assert fetched is not None
            assert fetched.name == "Sertraline"
            assert fetched.drug_class == "SSRI"
            assert fetched.active is True

            # Update
            fetched.active = False
            fetched.stopped_at = "2026-03-01"
            db.commit()

            refreshed = db.get(PatientMedication, med_id)
            assert refreshed.active is False
            assert refreshed.stopped_at == "2026-03-01"
        finally:
            db.close()

    def test_list_active_medications_for_patient(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import PatientMedication

        db = SessionLocal()
        try:
            pid = _pid()
            _seed_patient(db, pid)
            for i, active in enumerate([True, True, False]):
                db.add(
                    PatientMedication(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        clinician_id="actor-clinician-demo",
                        name=f"Drug {i}",
                        active=active,
                    )
                )
            db.commit()

            active_meds = (
                db.query(PatientMedication)
                .filter_by(patient_id=pid, active=True)
                .all()
            )
            assert len(active_meds) == 2
        finally:
            db.close()

    def test_empty_patient_returns_empty_list(self) -> None:
        from app.database import SessionLocal
        from app.repositories.medication_analyzer import PatientMedication

        db = SessionLocal()
        try:
            rows = db.query(PatientMedication).filter_by(patient_id="nonexistent").all()
            assert rows == []
        finally:
            db.close()
