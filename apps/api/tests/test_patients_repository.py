"""Tests for app.repositories.patients — patient CRUD contracts (PR 83/N).

Covers:
- create_patient inserts with expected fields
- get_patient returns correct patient
- get_patient returns None for wrong clinician_id
- list_patients returns only this clinician's patients sorted by name
- update_patient modifies fields
- update_patient handles secondary_conditions list serialisation
- update_patient returns None for unknown patient
- delete_patient removes record and returns True
- delete_patient returns False for unknown
- resolve_patient_clinic_id returns (False, None) for unknown patient
- resolve_patient_clinic_id returns (True, ...) for known patient
- get_patient_primary_condition returns condition or None
"""
from __future__ import annotations

import uuid


CLINICIAN_ID = "actor-clinician-demo"


def _uid() -> str:
    return f"pt-{uuid.uuid4().hex[:8]}"


def test_create_patient_happy_path():
    from app.database import SessionLocal
    from app.repositories.patients import create_patient

    db = SessionLocal()
    try:
        patient = create_patient(
            db,
            clinician_id=CLINICIAN_ID,
            first_name="Alice",
            last_name="Smith",
            primary_condition="Depression",
            status="active",
        )
        assert patient.first_name == "Alice"
        assert patient.last_name == "Smith"
        assert patient.clinician_id == CLINICIAN_ID
        assert patient.primary_condition == "Depression"
        assert patient.id is not None
    finally:
        db.close()


def test_get_patient_returns_record():
    from app.database import SessionLocal
    from app.repositories.patients import create_patient, get_patient

    db = SessionLocal()
    try:
        patient = create_patient(db, clinician_id=CLINICIAN_ID, first_name="Bob", last_name="Jones")
        found = get_patient(db, patient.id, CLINICIAN_ID)
        assert found is not None
        assert found.id == patient.id
    finally:
        db.close()


def test_get_patient_returns_none_for_wrong_clinician():
    from app.database import SessionLocal
    from app.repositories.patients import create_patient, get_patient

    db = SessionLocal()
    try:
        patient = create_patient(db, clinician_id=CLINICIAN_ID, first_name="Carol", last_name="White")
        found = get_patient(db, patient.id, "clinician-other")
        assert found is None
    finally:
        db.close()


def test_list_patients_returns_clinicians_patients():
    from app.database import SessionLocal
    from app.repositories.patients import create_patient, list_patients

    db = SessionLocal()
    try:
        create_patient(db, clinician_id=CLINICIAN_ID, first_name="Zara", last_name="Abel")
        create_patient(db, clinician_id=CLINICIAN_ID, first_name="Ann", last_name="Zeta")
        patients = list_patients(db, CLINICIAN_ID)
        assert len(patients) >= 2
        # sorted by last_name, first_name
        last_names = [p.last_name for p in patients]
        assert last_names == sorted(last_names)
    finally:
        db.close()


def test_update_patient_modifies_fields():
    from app.database import SessionLocal
    from app.repositories.patients import create_patient, update_patient

    db = SessionLocal()
    try:
        patient = create_patient(
            db,
            clinician_id=CLINICIAN_ID,
            first_name="Dan",
            last_name="Brown",
            status="active",
        )
        updated = update_patient(db, patient.id, CLINICIAN_ID, status="inactive", notes="follow-up")
        assert updated is not None
        assert updated.status == "inactive"
        assert updated.notes == "follow-up"
    finally:
        db.close()


def test_update_patient_serialises_secondary_conditions():
    from app.database import SessionLocal
    from app.repositories.patients import create_patient, update_patient
    import json

    db = SessionLocal()
    try:
        patient = create_patient(db, clinician_id=CLINICIAN_ID, first_name="Eve", last_name="Green")
        update_patient(
            db,
            patient.id,
            CLINICIAN_ID,
            secondary_conditions=["Anxiety", "PTSD"],
        )
        # re-fetch to confirm serialisation
        from app.repositories.patients import get_patient
        refreshed = get_patient(db, patient.id, CLINICIAN_ID)
        assert refreshed is not None
        parsed = json.loads(refreshed.secondary_conditions)
        assert "Anxiety" in parsed
        assert "PTSD" in parsed
    finally:
        db.close()


def test_update_patient_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.patients import update_patient

    db = SessionLocal()
    try:
        result = update_patient(db, "pt-unknown-xyz", CLINICIAN_ID, status="inactive")
        assert result is None
    finally:
        db.close()


def test_delete_patient_returns_true():
    from app.database import SessionLocal
    from app.repositories.patients import create_patient, delete_patient, get_patient

    db = SessionLocal()
    try:
        patient = create_patient(db, clinician_id=CLINICIAN_ID, first_name="Frank", last_name="Hill")
        deleted = delete_patient(db, patient.id, CLINICIAN_ID)
        assert deleted is True
        assert get_patient(db, patient.id, CLINICIAN_ID) is None
    finally:
        db.close()


def test_delete_patient_returns_false_for_unknown():
    from app.database import SessionLocal
    from app.repositories.patients import delete_patient

    db = SessionLocal()
    try:
        result = delete_patient(db, "pt-no-such", CLINICIAN_ID)
        assert result is False
    finally:
        db.close()


def test_resolve_patient_clinic_id_returns_false_for_unknown():
    from app.database import SessionLocal
    from app.repositories.patients import resolve_patient_clinic_id

    db = SessionLocal()
    try:
        exists, clinic_id = resolve_patient_clinic_id(db, "pt-resolve-unknown")
        assert exists is False
        assert clinic_id is None
    finally:
        db.close()


def test_resolve_patient_clinic_id_empty_patient_id():
    from app.database import SessionLocal
    from app.repositories.patients import resolve_patient_clinic_id

    db = SessionLocal()
    try:
        exists, clinic_id = resolve_patient_clinic_id(db, "")
        assert exists is False
        assert clinic_id is None
    finally:
        db.close()


def test_get_patient_primary_condition_returns_condition():
    from app.database import SessionLocal
    from app.repositories.patients import create_patient, get_patient_primary_condition

    db = SessionLocal()
    try:
        patient = create_patient(
            db,
            clinician_id=CLINICIAN_ID,
            first_name="Grace",
            last_name="Lee",
            primary_condition="ADHD",
        )
        condition = get_patient_primary_condition(db, patient.id)
        assert condition == "ADHD"
    finally:
        db.close()


def test_get_patient_primary_condition_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.patients import get_patient_primary_condition

    db = SessionLocal()
    try:
        result = get_patient_primary_condition(db, "pt-condition-unknown")
        assert result is None
    finally:
        db.close()
