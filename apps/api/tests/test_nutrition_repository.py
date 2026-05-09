"""Tests for app.repositories.nutrition — CRUD contracts (PR 77/N).

Covers:
- append_audit inserts row
- insert_diet_log inserts row with correct fields
- insert_supplement inserts row with active flag
- list_audit_rows returns correct rows for patient
- list_audit_rows scoped by clinician (is_admin=False)
- list_audit_rows unscoped for admin (is_admin=True)
- list_audit_rows empty for unknown patient
- list_audit_rows limit respected
"""
from __future__ import annotations


CLINICIAN_ID = "actor-clinician-demo"


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_append_audit_inserts_row():
    from app.database import SessionLocal
    from app.persistence.models import NutritionAnalyzerAudit
    from app.repositories.nutrition import append_audit

    db = SessionLocal()
    try:
        append_audit(
            db,
            patient_id="pt-nut-a",
            clinician_id=CLINICIAN_ID,
            event_type="results_viewed",
            message="Clinician viewed nutrition results",
        )
        db.commit()

        rows = (
            db.query(NutritionAnalyzerAudit)
            .filter_by(patient_id="pt-nut-a")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].event_type == "results_viewed"
        assert rows[0].clinician_id == CLINICIAN_ID
    finally:
        db.close()


def test_insert_diet_log_stores_macros():
    from app.database import SessionLocal
    from app.persistence.models import PatientNutritionDietLog
    from app.repositories.nutrition import insert_diet_log

    db = SessionLocal()
    try:
        insert_diet_log(
            db,
            patient_id="pt-nut-b",
            clinician_id=CLINICIAN_ID,
            log_day="2026-05-01",
            calories_kcal=2000.0,
            protein_g=80.0,
            carbs_g=250.0,
            fat_g=65.0,
            sodium_mg=2300.0,
            fiber_g=25.0,
            notes="Patient reported",
        )
        db.commit()

        rows = (
            db.query(PatientNutritionDietLog)
            .filter_by(patient_id="pt-nut-b")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].log_day == "2026-05-01"
        assert rows[0].calories_kcal == 2000.0
        assert rows[0].protein_g == 80.0
        assert rows[0].notes == "Patient reported"
    finally:
        db.close()


def test_insert_diet_log_nullable_macros():
    """Insert with all optional macros as None — should not raise."""
    from app.database import SessionLocal
    from app.persistence.models import PatientNutritionDietLog
    from app.repositories.nutrition import insert_diet_log

    db = SessionLocal()
    try:
        insert_diet_log(
            db,
            patient_id="pt-nut-nil",
            clinician_id=CLINICIAN_ID,
            log_day="2026-05-02",
        )
        db.commit()

        rows = (
            db.query(PatientNutritionDietLog)
            .filter_by(patient_id="pt-nut-nil")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].calories_kcal is None
    finally:
        db.close()


def test_insert_supplement_active_default():
    from app.database import SessionLocal
    from app.persistence.models import PatientSupplement
    from app.repositories.nutrition import insert_supplement

    db = SessionLocal()
    try:
        insert_supplement(
            db,
            patient_id="pt-nut-c",
            clinician_id=CLINICIAN_ID,
            name="Omega-3",
            dose="1000mg",
            frequency="daily",
        )
        db.commit()

        rows = (
            db.query(PatientSupplement)
            .filter_by(patient_id="pt-nut-c")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].name == "Omega-3"
        assert rows[0].active is True
    finally:
        db.close()


def test_list_audit_rows_returns_patient_rows():
    from app.database import SessionLocal
    from app.repositories.nutrition import append_audit, list_audit_rows

    db = SessionLocal()
    try:
        for event_type in ("view", "annotation", "save"):
            append_audit(
                db,
                patient_id="pt-nut-list",
                clinician_id=CLINICIAN_ID,
                event_type=event_type,
                message=f"event {event_type}",
            )
        db.commit()

        rows = list_audit_rows(
            db,
            patient_id="pt-nut-list",
            actor_id=CLINICIAN_ID,
            is_admin=False,
        )
        assert len(rows) == 3
    finally:
        db.close()


def test_list_audit_rows_scoped_by_clinician():
    """is_admin=False and mismatched actor_id returns empty list."""
    from app.database import SessionLocal
    from app.repositories.nutrition import append_audit, list_audit_rows

    db = SessionLocal()
    try:
        append_audit(
            db,
            patient_id="pt-nut-scope",
            clinician_id=CLINICIAN_ID,
            event_type="view",
            message="view",
        )
        db.commit()

        rows = list_audit_rows(
            db,
            patient_id="pt-nut-scope",
            actor_id="other-clinician",
            is_admin=False,
        )
        assert rows == []
    finally:
        db.close()


def test_list_audit_rows_admin_sees_all():
    """is_admin=True ignores actor_id filter."""
    from app.database import SessionLocal
    from app.repositories.nutrition import append_audit, list_audit_rows

    db = SessionLocal()
    try:
        append_audit(
            db,
            patient_id="pt-nut-admin",
            clinician_id=CLINICIAN_ID,
            event_type="view",
            message="admin view",
        )
        db.commit()

        rows = list_audit_rows(
            db,
            patient_id="pt-nut-admin",
            actor_id="other-clinician",
            is_admin=True,
        )
        assert len(rows) == 1
    finally:
        db.close()


def test_list_audit_rows_empty_for_unknown_patient():
    from app.database import SessionLocal
    from app.repositories.nutrition import list_audit_rows

    db = SessionLocal()
    try:
        rows = list_audit_rows(
            db,
            patient_id="ghost-nut",
            actor_id=CLINICIAN_ID,
            is_admin=True,
        )
        assert rows == []
    finally:
        db.close()


def test_list_audit_rows_limit_respected():
    from app.database import SessionLocal
    from app.repositories.nutrition import append_audit, list_audit_rows

    db = SessionLocal()
    try:
        for i in range(6):
            append_audit(
                db,
                patient_id="pt-nut-lim",
                clinician_id=CLINICIAN_ID,
                event_type="view",
                message=f"view {i}",
            )
        db.commit()

        rows = list_audit_rows(
            db,
            patient_id="pt-nut-lim",
            actor_id=CLINICIAN_ID,
            is_admin=False,
            limit=4,
        )
        assert len(rows) == 4
    finally:
        db.close()
