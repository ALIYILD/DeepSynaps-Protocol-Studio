"""Utility functions for reading/writing data_quality_flags on AssessmentRecord.

Each flag shape: {kind, severity, source, note, created_at}.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.database import SessionLocal
from app.persistence.models import AssessmentRecord


def add_flag(
    record_id: str,
    *,
    kind: str,
    severity: str,
    source: str,
    note: str,
) -> None:
    """Append one flag to assessment_records.data_quality_flags."""
    db = SessionLocal()
    try:
        record = db.query(AssessmentRecord).filter_by(id=record_id).one()
        flags = list(record.data_quality_flags or [])
        flags.append({
            "kind": kind,
            "severity": severity,
            "source": source,
            "note": note,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        record.data_quality_flags = flags
        db.commit()
    finally:
        db.close()


def clear_flags(record_id: str, *, kind: Optional[str] = None) -> None:
    """Remove flags from assessment_records.data_quality_flags.

    If kind is given, removes only flags matching that kind.
    If kind is None, clears all flags.
    """
    db = SessionLocal()
    try:
        record = db.query(AssessmentRecord).filter_by(id=record_id).one()
        if kind is None:
            record.data_quality_flags = []
        else:
            record.data_quality_flags = [
                f for f in (record.data_quality_flags or [])
                if f.get("kind") != kind
            ]
        db.commit()
    finally:
        db.close()
