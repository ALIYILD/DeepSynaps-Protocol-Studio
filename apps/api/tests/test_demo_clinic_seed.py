from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.repositories.sessions import check_conflicts
from app.services.demo_clinic_seed import seed_demo_clinic


def test_seed_demo_clinic_creates_synthetic_schedule() -> None:
    db: Session = SessionLocal()
    try:
        out = seed_demo_clinic(db)
        # First run should create data in a clean test DB.
        assert out["sessions"] >= 10
        assert out["patients"] >= 6
        assert out["rooms"] >= 1
        assert out["devices"] >= 1

        # Second run should no-op (idempotent).
        out2 = seed_demo_clinic(db)
        assert out2 == {"rooms": 0, "devices": 0, "patients": 0, "sessions": 0}
    finally:
        db.close()


def test_seed_demo_clinic_includes_conflict_pair() -> None:
    db: Session = SessionLocal()
    try:
        seed_demo_clinic(db)
        # The seed intentionally creates an overlap pair on Thursday 11:00 and 11:15
        # in the current week window. Recompute that anchor deterministically.
        now = datetime.now(timezone.utc).replace(microsecond=0)
        anchor = now.replace(hour=12, minute=0, second=0)
        monday = anchor - timedelta(days=anchor.weekday())  # Mon=0
        thursday = (monday + timedelta(days=3)).date().isoformat()
        conflicts = check_conflicts(
            db,
            clinician_id="actor-clinician-demo",
            scheduled_at=thursday + "T11:15:00",
            duration_minutes=30,
            room_id="demo-room-a",
            device_id="demo-device-tdcs",
            exclude_id=None,
        )
        assert len(conflicts) >= 1
    finally:
        db.close()

