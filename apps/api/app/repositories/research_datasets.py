"""Repository helpers for research dataset router flows."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.persistence.models import Patient


def list_patient_sample(
    session: Session, *, limit: int = 200
) -> list[Patient]:
    """Return a bounded patient sample for dataset preflight checks."""
    return session.query(Patient).limit(limit).all()
