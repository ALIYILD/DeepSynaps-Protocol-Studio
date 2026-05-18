"""Research-use consent — repository helpers (Slice B of Data Console).

Companion to :class:`app.persistence.models.ResearchConsent`. Routers
MUST use these helpers (no inline ORM queries) so the router-lint job
stays green — see CLAUDE.md memory ``deepsynaps-router-schema-lint``.

Service-layer rules + audit live in
``app.services.research_consent_service``; this module is the thin
data-access seam.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ..persistence.models import Patient, ResearchConsent, User


def get_patient_by_id(session: Session, patient_id: str) -> Optional[Patient]:
    return session.query(Patient).filter(Patient.id == patient_id).first()


def list_patients_for_research_preflight(
    session: Session, limit: int = 200
) -> list[Patient]:
    return session.query(Patient).limit(limit).all()


def get_user_by_id(session: Session, user_id: str) -> Optional[User]:
    return session.query(User).filter(User.id == user_id).first()


def get_patient_by_email(session: Session, email: str) -> Optional[Patient]:
    return session.query(Patient).filter(Patient.email == email).first()


def get_patient_by_emails_any(
    session: Session, emails: list[str]
) -> Optional[Patient]:
    if not emails:
        return None
    return (
        session.query(Patient).filter(Patient.email.in_(list(emails))).first()
    )


def get_consent_by_id(
    session: Session, consent_id: str
) -> Optional[ResearchConsent]:
    return (
        session.query(ResearchConsent)
        .filter(ResearchConsent.id == consent_id)
        .first()
    )
