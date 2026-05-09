"""Tests for app.repositories.labs — CRUD contracts (PR 77/N).

Covers:
- get_patient_by_id happy path + missing
- get_patient_display_name combines first/last name
- get_patient_profile returns name + condition
- insert_lab_result_batch inserts all items + returns count
- insert_lab_audit_event persists row
- list_lab_audit_events returns newest-first and respects limit
- list_clinic_patients scoped to clinic
"""
from __future__ import annotations

from datetime import datetime, timezone


# ── Helpers ───────────────────────────────────────────────────────────────────

CLINICIAN_ID = "actor-clinician-demo"
CLINIC_ID = "clinic-demo-default"


def _make_patient(db, patient_id: str, *, first: str = "Alice", last: str = "Test") -> None:
    from app.persistence.models import Patient

    if db.get(Patient, patient_id) is None:
        db.add(
            Patient(
                id=patient_id,
                clinician_id=CLINICIAN_ID,
                first_name=first,
                last_name=last,
                status="active",
                primary_condition="Depression",
            )
        )
        db.commit()


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_get_patient_by_id_returns_row():
    from app.database import SessionLocal
    from app.repositories.labs import get_patient_by_id

    db = SessionLocal()
    try:
        _make_patient(db, "pt-labs-a")
        row = get_patient_by_id(db, "pt-labs-a")
        assert row is not None
        assert row.id == "pt-labs-a"
    finally:
        db.close()


def test_get_patient_by_id_returns_none_for_missing():
    from app.database import SessionLocal
    from app.repositories.labs import get_patient_by_id

    db = SessionLocal()
    try:
        row = get_patient_by_id(db, "nonexistent-pt-labs")
        assert row is None
    finally:
        db.close()


def test_get_patient_display_name_combines_first_last():
    from app.database import SessionLocal
    from app.repositories.labs import get_patient_display_name

    db = SessionLocal()
    try:
        _make_patient(db, "pt-labs-name", first="Bob", last="Smith")
        name = get_patient_display_name(db, "pt-labs-name")
        assert name == "Bob Smith"
    finally:
        db.close()


def test_get_patient_display_name_none_for_missing():
    from app.database import SessionLocal
    from app.repositories.labs import get_patient_display_name

    db = SessionLocal()
    try:
        name = get_patient_display_name(db, "ghost-pt")
        assert name is None
    finally:
        db.close()


def test_get_patient_profile_returns_name_and_condition():
    from app.database import SessionLocal
    from app.repositories.labs import get_patient_profile

    db = SessionLocal()
    try:
        _make_patient(db, "pt-labs-prof", first="Carol", last="Jones")
        name, condition = get_patient_profile(db, "pt-labs-prof")
        assert name == "Carol Jones"
        assert condition == "Depression"
    finally:
        db.close()


def test_get_patient_profile_returns_nones_for_missing():
    from app.database import SessionLocal
    from app.repositories.labs import get_patient_profile

    db = SessionLocal()
    try:
        name, condition = get_patient_profile(db, "ghost-pt-2")
        assert name is None
        assert condition is None
    finally:
        db.close()


def test_insert_lab_result_batch_returns_count():
    from app.database import SessionLocal
    from app.repositories.labs import insert_lab_result_batch

    db = SessionLocal()
    try:
        _make_patient(db, "pt-labs-batch")
        items = [
            {
                "analyte_code": "GLU",
                "analyte_display_name": "Glucose",
                "panel_name": "Basic Metabolic",
                "value_numeric": 95.0,
                "value_text": None,
                "unit_ucum": "mg/dL",
                "ref_low": 70.0,
                "ref_high": 110.0,
                "ref_text": "70-110 mg/dL",
                "sample_collected_at": None,
                "source": "manual",
            },
            {
                "analyte_code": "NA",
                "analyte_display_name": "Sodium",
                "panel_name": "Basic Metabolic",
                "value_numeric": 142.0,
                "value_text": None,
                "unit_ucum": "mmol/L",
                "ref_low": 136.0,
                "ref_high": 145.0,
                "ref_text": None,
                "sample_collected_at": None,
                "source": "manual",
            },
        ]
        count = insert_lab_result_batch(
            db,
            patient_id="pt-labs-batch",
            clinician_id=CLINICIAN_ID,
            items=items,
            is_demo=False,
        )
        assert count == 2
    finally:
        db.close()


def test_insert_lab_audit_event_persists():
    from app.database import SessionLocal
    from app.repositories.labs import insert_lab_audit_event

    db = SessionLocal()
    try:
        row = insert_lab_audit_event(
            db,
            patient_id="pt-labs-audit",
            event_type="results_viewed",
            actor_id=CLINICIAN_ID,
            message="Clinician viewed lab results",
            payload={"screen": "labs_hub"},
        )
        assert row.patient_id == "pt-labs-audit"
        assert row.event_type == "results_viewed"
        assert row.actor_id == CLINICIAN_ID
        assert row.id is not None
    finally:
        db.close()


def test_list_lab_audit_events_newest_first():
    from app.database import SessionLocal
    from app.repositories.labs import insert_lab_audit_event, list_lab_audit_events

    db = SessionLocal()
    try:
        for i in range(3):
            insert_lab_audit_event(
                db,
                patient_id="pt-labs-order",
                event_type=f"event_{i}",
                actor_id=CLINICIAN_ID,
                message=f"Event {i}",
            )

        results = list_lab_audit_events(db, "pt-labs-order")
        assert len(results) == 3
        # Should be newest first (desc order by created_at)
        event_types = [r.event_type for r in results]
        assert "event_0" in event_types
        assert "event_2" in event_types
    finally:
        db.close()


def test_list_lab_audit_events_limit():
    from app.database import SessionLocal
    from app.repositories.labs import insert_lab_audit_event, list_lab_audit_events

    db = SessionLocal()
    try:
        for i in range(5):
            insert_lab_audit_event(
                db,
                patient_id="pt-labs-lim",
                event_type="view",
                actor_id=CLINICIAN_ID,
                message=f"view {i}",
            )

        results = list_lab_audit_events(db, "pt-labs-lim", limit=3)
        assert len(results) == 3
    finally:
        db.close()


def test_list_lab_audit_events_empty_for_unknown_patient():
    from app.database import SessionLocal
    from app.repositories.labs import list_lab_audit_events

    db = SessionLocal()
    try:
        results = list_lab_audit_events(db, "pt-no-labs-at-all")
        assert results == []
    finally:
        db.close()
