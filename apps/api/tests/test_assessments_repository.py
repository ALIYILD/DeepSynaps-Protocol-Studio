"""Repository-level tests for app.repositories.assessments.

Pins CRUD behaviour for AssessmentRecord table against in-memory SQLite.
All tests rely on the isolated_database autouse fixture from conftest.py.
"""
from __future__ import annotations


# ── Helpers ──────────────────────────────────────────────────────────────────

_CLINICIAN = "actor-clinician-demo"
_PATIENT = "pt-assess-001"
_PATIENT_B = "pt-assess-002"


def _db():
    from app.database import SessionLocal
    return SessionLocal()


def _seed_patient(db, patient_id: str = _PATIENT) -> str:
    from app.persistence.models import Patient
    if db.query(Patient).filter_by(id=patient_id).first() is None:
        db.add(Patient(
            id=patient_id,
            clinician_id=_CLINICIAN,
            first_name="Assess",
            last_name="Tester",
        ))
        db.commit()
    return patient_id


def _create(db, *, patient_id: str = _PATIENT, template_id: str = "phq9", status: str = "draft"):
    from app.repositories.assessments import create_assessment
    return create_assessment(
        db,
        clinician_id=_CLINICIAN,
        template_id=template_id,
        template_title="PHQ-9",
        patient_id=patient_id,
        data={"q1": 1, "q2": 2},
        status=status,
    )


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_create_and_get_assessment():
    from app.repositories.assessments import get_assessment

    db = _db()
    try:
        _seed_patient(db)
        record = _create(db)

        fetched = get_assessment(db, record.id, _CLINICIAN)
        assert fetched is not None
        assert fetched.template_id == "phq9"
        assert fetched.status == "draft"
        assert fetched.clinician_id == _CLINICIAN
    finally:
        db.close()


def test_get_assessment_wrong_clinician_returns_none():
    from app.repositories.assessments import get_assessment

    db = _db()
    try:
        _seed_patient(db)
        record = _create(db)

        result = get_assessment(db, record.id, "other-clinician")
        assert result is None
    finally:
        db.close()


def test_list_assessments_for_clinician():
    from app.repositories.assessments import list_assessments_for_clinician

    db = _db()
    try:
        _seed_patient(db)
        _create(db)
        _create(db, template_id="gad7")

        rows = list_assessments_for_clinician(db, _CLINICIAN)
        assert len(rows) >= 2
        template_ids = {r.template_id for r in rows}
        assert "phq9" in template_ids
        assert "gad7" in template_ids
    finally:
        db.close()


def test_list_assessments_for_patient():
    from app.repositories.assessments import list_assessments_for_patient

    db = _db()
    try:
        _seed_patient(db)
        _seed_patient(db, patient_id=_PATIENT_B)
        _create(db, patient_id=_PATIENT)
        _create(db, patient_id=_PATIENT_B)

        rows_a = list_assessments_for_patient(db, _PATIENT, _CLINICIAN)
        assert all(r.patient_id == _PATIENT for r in rows_a)
        assert len(rows_a) == 1
    finally:
        db.close()


def test_update_assessment_status():
    from app.repositories.assessments import update_assessment

    db = _db()
    try:
        _seed_patient(db)
        record = _create(db)

        updated = update_assessment(db, record.id, _CLINICIAN, status="completed")
        assert updated is not None
        assert updated.status == "completed"
        # completed_at auto-stamped by repository
        assert updated.completed_at is not None
    finally:
        db.close()


def test_update_assessment_score():
    from app.repositories.assessments import update_assessment

    db = _db()
    try:
        _seed_patient(db)
        record = _create(db)

        updated = update_assessment(
            db, record.id, _CLINICIAN,
            score="15",
            score_numeric=15.0,
            severity="moderate",
        )
        assert updated.score == "15"
        assert updated.score_numeric == 15.0
        assert updated.severity == "moderate"
    finally:
        db.close()


def test_update_assessment_ai_summary_stamps_timestamp():
    from app.repositories.assessments import update_assessment

    db = _db()
    try:
        _seed_patient(db)
        record = _create(db)

        updated = update_assessment(
            db, record.id, _CLINICIAN,
            ai_summary="Patient shows moderate depression.",
            ai_model="gpt-4o",
            ai_confidence=0.87,
        )
        assert updated.ai_summary is not None
        assert updated.ai_generated_at is not None
    finally:
        db.close()


def test_delete_assessment():
    from app.repositories.assessments import delete_assessment, get_assessment

    db = _db()
    try:
        _seed_patient(db)
        record = _create(db)

        result = delete_assessment(db, record.id, _CLINICIAN)
        assert result is True

        assert get_assessment(db, record.id, _CLINICIAN) is None
    finally:
        db.close()


def test_delete_assessment_wrong_clinician_returns_false():
    from app.repositories.assessments import delete_assessment

    db = _db()
    try:
        _seed_patient(db)
        record = _create(db)

        result = delete_assessment(db, record.id, "wrong-clinician")
        assert result is False
    finally:
        db.close()


def test_list_prior_completed_for_template():
    from app.repositories.assessments import list_prior_completed_for_template, update_assessment

    db = _db()
    try:
        _seed_patient(db)
        r1 = _create(db)
        r2 = _create(db)
        r3 = _create(db)
        # Mark r2 and r3 as completed
        update_assessment(db, r2.id, _CLINICIAN, status="completed")
        update_assessment(db, r3.id, _CLINICIAN, status="completed")

        priors = list_prior_completed_for_template(
            db,
            patient_id=_PATIENT,
            template_id="phq9",
            exclude_assessment_id=r1.id,
            limit=3,
        )
        prior_ids = {p.id for p in priors}
        assert r2.id in prior_ids
        assert r3.id in prior_ids
        assert r1.id not in prior_ids
    finally:
        db.close()


def test_get_patient_for_assessment_router():
    from app.repositories.assessments import get_patient_for_assessment_router

    db = _db()
    try:
        _seed_patient(db)

        patient = get_patient_for_assessment_router(db, _PATIENT)
        assert patient is not None
        assert patient.id == _PATIENT

        missing = get_patient_for_assessment_router(db, "no-such-patient")
        assert missing is None
    finally:
        db.close()
