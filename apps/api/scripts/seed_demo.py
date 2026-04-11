"""Demo seed script — creates representative demo data for local development.

Usage (from apps/api directory):
    python scripts/seed_demo.py

Idempotent: skips creation if the demo clinician email already exists.
"""
from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# Ensure apps/api is on the path when run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal, init_database
from app.persistence.models import (
    DeviceSessionLog,
    HomeDeviceAssignment,
    Patient,
    PatientAdherenceEvent,
    TreatmentCourse,
    User,
)

_CLINICIAN_EMAIL = "demo@deepsynaps.com"
_PATIENT_EMAIL = "patient@deepsynaps.com"

# bcrypt hash for "demo2026"
# Generated with: import bcrypt; bcrypt.hashpw(b"demo2026", bcrypt.gensalt()).decode()
_DEMO_PASSWORD_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGrmkzRaZQpWnrCWXuH2PgSXl8C"


def _make_id() -> str:
    return str(uuid.uuid4())


def seed(session) -> None:
    # ── 1. Clinician user ─────────────────────────────────────────────────────
    clinician = session.query(User).filter(User.email == _CLINICIAN_EMAIL).first()
    if clinician is not None:
        print(f"Demo clinician already exists ({_CLINICIAN_EMAIL}). Skipping seed.")
        return

    clinician_id = _make_id()
    clinician = User(
        id=clinician_id,
        email=_CLINICIAN_EMAIL,
        display_name="Dr. Demo Clinician",
        hashed_password=_DEMO_PASSWORD_HASH,
        role="clinician",
        package_id="clinician_pro",
        is_verified=True,
        is_active=True,
    )
    session.add(clinician)
    print(f"Created clinician: {_CLINICIAN_EMAIL}")

    # ── 2. Patient user ───────────────────────────────────────────────────────
    patient_user_id = _make_id()
    patient_user = User(
        id=patient_user_id,
        email=_PATIENT_EMAIL,
        display_name="Demo Patient",
        hashed_password=_DEMO_PASSWORD_HASH,
        role="patient",
        package_id="explorer",
        is_verified=True,
        is_active=True,
    )
    session.add(patient_user)
    print(f"Created patient user: {_PATIENT_EMAIL}")

    # ── 3. Patient record ─────────────────────────────────────────────────────
    patient_id = _make_id()
    patient = Patient(
        id=patient_id,
        clinician_id=clinician_id,
        first_name="Demo",
        last_name="Patient",
        dob="1985-06-15",
        email=_PATIENT_EMAIL,
        phone="+1-555-0100",
        gender="prefer_not_to_say",
        primary_condition="Major Depressive Disorder",
        primary_modality="tDCS",
        consent_signed=True,
        consent_date="2026-01-01",
        status="active",
        notes="Demo patient for development testing.",
    )
    session.add(patient)
    print(f"Created patient record: {patient_id}")

    # ── 4. TreatmentCourse ────────────────────────────────────────────────────
    course_id = _make_id()
    course = TreatmentCourse(
        id=course_id,
        patient_id=patient_id,
        clinician_id=clinician_id,
        protocol_id="tdcs-mdd-dlpfc-anodal",
        condition_slug="major-depressive-disorder",
        modality_slug="tdcs",
        device_slug="starstim-home",
        target_region="DLPFC",
        evidence_grade="A",
        on_label=True,
        planned_sessions_total=20,
        planned_sessions_per_week=5,
        planned_session_duration_minutes=30,
        status="active",
        sessions_delivered=3,
        review_required=False,
    )
    session.add(course)
    print(f"Created TreatmentCourse: {course_id}")

    # ── 5. HomeDeviceAssignment ────────────────────────────────────────────────
    now = datetime.utcnow()
    assignment_id = _make_id()
    assignment = HomeDeviceAssignment(
        id=assignment_id,
        patient_id=patient_id,
        course_id=course_id,
        assigned_by=clinician_id,
        device_name="Fisher Wallace Stimulator",
        device_model="FW-100",
        device_category="CES",
        parameters_json=(
            '{"intensity_ma": 1, "frequency_hz": "15-500Hz", '
            '"duration_min": 20, "electrode_placement": "bilateral mastoid"}'
        ),
        instructions_text=(
            "Use every morning after waking up. Apply electrodes to both sides of "
            "your head per the diagram provided. Duration: 20 minutes per session. "
            "Contact the clinic immediately if you experience unusual symptoms."
        ),
        session_frequency_per_week=5,
        planned_total_sessions=20,
        status="active",
        created_at=now - timedelta(days=14),
        updated_at=now - timedelta(days=14),
    )
    session.add(assignment)
    print(f"Created HomeDeviceAssignment: {assignment_id}")

    # ── 6. DeviceSessionLog entries (5) ───────────────────────────────────────
    session_data = [
        # (days_ago, completed, tolerance, mood_before, mood_after, side_effects)
        (12, True,  4, 3, 4, None),
        (10, True,  4, 3, 4, None),
        (8,  True,  3, 2, 3, "Mild tingling at electrode sites."),
        (6,  True,  3, 3, 4, None),
        (4,  True,  4, 3, 5, None),
    ]
    for i, (days_ago, completed, tolerance, mood_b, mood_a, side_eff) in enumerate(session_data):
        log_date = (now - timedelta(days=days_ago)).date()
        log = DeviceSessionLog(
            id=_make_id(),
            assignment_id=assignment_id,
            patient_id=patient_id,
            course_id=course_id,
            session_date=log_date.isoformat(),
            logged_at=now - timedelta(days=days_ago),
            duration_minutes=20,
            completed=completed,
            actual_intensity="1mA",
            electrode_placement="bilateral mastoid",
            side_effects_during=side_eff,
            tolerance_rating=tolerance,
            mood_before=mood_b,
            mood_after=mood_a,
            notes=f"Session {i + 1} — self-reported.",
            status="reviewed" if i < 3 else "pending_review",
            reviewed_by=clinician_id if i < 3 else None,
            reviewed_at=now - timedelta(days=days_ago - 1) if i < 3 else None,
            created_at=now - timedelta(days=days_ago),
        )
        session.add(log)
    print("Created 5 DeviceSessionLog entries.")

    # ── 7. PatientAdherenceEvent entries (2) ──────────────────────────────────
    events = [
        {
            "event_type": "side_effect",
            "severity": "low",
            "report_date": (now - timedelta(days=8)).date().isoformat(),
            "body": "Mild tingling sensation during session 3. Resolved within minutes.",
            "status": "acknowledged",
            "acknowledged_by": clinician_id,
            "acknowledged_at": now - timedelta(days=7),
            "resolution_note": "Expected low-level side effect. Patient advised to continue.",
        },
        {
            "event_type": "positive_feedback",
            "severity": None,
            "report_date": (now - timedelta(days=4)).date().isoformat(),
            "body": "Feeling more energetic and less low in mood after last two sessions.",
            "status": "open",
            "acknowledged_by": None,
            "acknowledged_at": None,
            "resolution_note": None,
        },
    ]
    for ev_data in events:
        ev = PatientAdherenceEvent(
            id=_make_id(),
            patient_id=patient_id,
            assignment_id=assignment_id,
            course_id=course_id,
            event_type=ev_data["event_type"],
            severity=ev_data["severity"],
            report_date=ev_data["report_date"],
            body=ev_data["body"],
            structured_json="{}",
            status=ev_data["status"],
            acknowledged_by=ev_data["acknowledged_by"],
            acknowledged_at=ev_data["acknowledged_at"],
            resolution_note=ev_data["resolution_note"],
            created_at=now - timedelta(days=4),
        )
        session.add(ev)
    print("Created 2 PatientAdherenceEvent entries.")

    session.commit()
    print("\nDemo seed complete.")
    print(f"  Clinician login : {_CLINICIAN_EMAIL}  /  demo2026")
    print(f"  Patient login   : {_PATIENT_EMAIL}  /  demo2026")


def main() -> None:
    init_database()
    db = SessionLocal()
    try:
        seed(db)
    except Exception as exc:
        db.rollback()
        print(f"Seed failed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
