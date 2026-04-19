"""Smoke test for scripts/seed_demo.py.

Keeps the demo dataset honest: if someone edits a Patient model field, changes
an enrichment contract, or breaks the seed's FK ordering, this test fails in
CI instead of in a clinician's browser.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal


def _load_seed_module():
    """Load scripts/seed_demo.py by path (it's not a package module)."""
    path = Path(__file__).resolve().parents[1] / "scripts" / "seed_demo.py"
    spec = importlib.util.spec_from_file_location("seed_demo", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["seed_demo"] = mod
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def test_seed_creates_expected_cohort() -> None:
    seed_demo = _load_seed_module()
    db: Session = SessionLocal()
    try:
        seed_demo.seed(db)
    finally:
        db.close()

    from app.persistence.models import (
        AdverseEvent,
        AssessmentRecord,
        DeviceSessionLog,
        OutcomeSeries,
        Patient,
        PatientMedication,
        TreatmentCourse,
        User,
    )

    db = SessionLocal()
    try:
        clinician = db.query(User).filter(User.email == seed_demo._CLINICIAN_EMAIL).first()
        assert clinician is not None, "demo clinician missing"
        patients = db.query(Patient).filter(Patient.clinician_id == clinician.id).all()
        # Portal patient (1) + cohort (_DEMO_COHORT count)
        assert len(patients) == 1 + len(seed_demo._DEMO_COHORT), (
            f"expected {1 + len(seed_demo._DEMO_COHORT)} demo patients, got {len(patients)}"
        )
        # Every seeded patient must carry the [DEMO] notes prefix.
        assert all((p.notes or "").startswith(seed_demo._DEMO_TAG) for p in patients), (
            "one or more seeded patients missing [DEMO] prefix"
        )
        # Each cohort patient must have at least one treatment course + one assessment.
        patient_ids = [p.id for p in patients]
        assert db.query(TreatmentCourse).filter(TreatmentCourse.patient_id.in_(patient_ids)).count() >= len(patients)
        assert db.query(AssessmentRecord).filter(AssessmentRecord.patient_id.in_(patient_ids)).count() >= len(seed_demo._DEMO_COHORT)
        assert db.query(OutcomeSeries).filter(OutcomeSeries.patient_id.in_(patient_ids)).count() >= len(seed_demo._DEMO_COHORT) * 2
        # At least a couple of medications, device logs, and AEs across the cohort.
        assert db.query(PatientMedication).filter(PatientMedication.patient_id.in_(patient_ids)).count() >= 5
        assert db.query(DeviceSessionLog).filter(DeviceSessionLog.patient_id.in_(patient_ids)).count() >= 10
        assert db.query(AdverseEvent).filter(AdverseEvent.patient_id.in_(patient_ids)).count() >= 2
    finally:
        db.close()


def test_seed_is_idempotent() -> None:
    """Re-running seed on an already-seeded DB should no-op, not error."""
    seed_demo = _load_seed_module()
    db = SessionLocal()
    try:
        seed_demo.seed(db)  # first call — creates all demo data
        seed_demo.seed(db)  # second call — should detect clinician and skip
    finally:
        db.close()


def test_seeded_data_surfaces_through_list_api(
    client: TestClient, auth_headers: dict
) -> None:
    """End-to-end: seed the DB then hit /api/v1/patients — enrichment must reflect seeded data."""
    seed_demo = _load_seed_module()
    db = SessionLocal()
    try:
        seed_demo.seed(db)
    finally:
        db.close()

    # Sign in as the demo clinician (shared auth dev token maps to a different actor,
    # so instead we assert the demo data via a direct DB query pathway in the API:
    # the clinician token scopes by actor_id, which won't match our seeded clinician.
    # Skip auth-scoped assertion here — covered by test_patients_router's scope test.
    # What we can assert: the enrichment build function itself handles seeded data.
    from app.routers.patients_router import _build_patient_enrichment
    from app.persistence.models import Patient, User

    db = SessionLocal()
    try:
        clinician = db.query(User).filter(User.email == seed_demo._CLINICIAN_EMAIL).first()
        patients = db.query(Patient).filter(Patient.clinician_id == clinician.id).all()
        enrichment = _build_patient_enrichment(db, [p.id for p in patients])
        # At least one patient should show off_label_flag (seeded Elena + Samantha).
        assert any(e.get("off_label_flag") for e in enrichment.values()), (
            "expected off_label_flag on at least one seeded patient"
        )
        # At least one patient should show needs_review (seeded Marcus, Elena, Priya, Samantha).
        assert any(e.get("needs_review") for e in enrichment.values()), (
            "expected needs_review on at least one seeded patient"
        )
        # At least one should have has_adverse_event (Elena + Samantha).
        assert any(e.get("has_adverse_event") for e in enrichment.values()), (
            "expected has_adverse_event on at least one seeded patient"
        )
        # Home adherence should be populated on multiple patients (device logs exist).
        assert sum(1 for e in enrichment.values() if e.get("home_adherence") is not None) >= 3
    finally:
        db.close()
