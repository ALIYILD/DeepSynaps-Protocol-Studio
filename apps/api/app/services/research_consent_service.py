"""Research-use consent service (Slice B — Data Console pipeline).

Source of truth for "may this patient's de-identified data be used for
research?". The ``research_consents`` table is append-only:

* Grant: insert a new row with ``granted=True``, ``granted_at`` stamped
  UTC, ``revoked_at IS NULL``.
* Revoke: stamp ``revoked_at`` + ``revoked_by_*`` (+ optional reason) on
  the existing active row. Do NOT delete.
* Re-grant after revoke: insert a fresh row (new ``granted_at``); the
  partial unique index guarantees no overlap.

Slice C joins on (granted_at, revoked_at) to decide which patient rows
were created during an active grant window — see the model docstring
for the canonical filter.

Tz handling
-----------
Per ``deepsynaps-sqlite-tz-naive`` memory: SQLite strips tzinfo on
roundtrip. All timestamps stored / compared here are coerced to
tz-aware UTC at the boundary via :func:`_ensure_utc`.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import Patient, ResearchConsent, User
from app.repositories.audit import create_audit_event


_log = logging.getLogger(__name__)


AUDIT_TARGET_TYPE = "research_consent"
ACTION_GRANT = "research_consent_grant"
ACTION_REVOKE = "research_consent_revoke"

DEFAULT_SCOPE = "anonymized_research"


class ResearchConsentError(Exception):
    """Service-layer error (e.g. revoke called without an active consent).

    Carries an HTTP status code so the router can map cleanly to a 4xx
    response.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str = "research_consent_error",
        status_code: int = 400,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Coerce a possibly tz-naive datetime to tz-aware UTC.

    SQLite drops tzinfo on roundtrip; comparing the result against
    ``datetime.now(timezone.utc)`` raises ``TypeError``. Callers MUST
    funnel every read through this helper before comparing.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _resolve_patient_clinic_id(
    session: Session, patient_id: str
) -> Optional[str]:
    """Return the clinic_id that owns ``patient_id``, or None.

    Patients link to clinics indirectly: ``patients.clinician_id`` →
    ``users.id`` → ``users.clinic_id``. The clinic_id is denormalised
    onto every research_consent row so Slice C can filter by clinic
    without re-joining at export time.
    """
    patient = session.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None or not patient.clinician_id:
        return None
    user = session.query(User).filter(User.id == patient.clinician_id).first()
    return user.clinic_id if user is not None else None


def _audit(
    session: Session,
    *,
    action: str,
    consent: ResearchConsent,
    actor_user_id: str,
    actor_role: str,
    note: str = "",
) -> None:
    """Best-effort PHI audit hook — must never block the consent write.

    Emits a row in ``audit_events`` with target_type=research_consent so
    the regulator transcript can be filtered cleanly.
    """
    try:
        now = datetime.now(timezone.utc)
        event_id = (
            f"research_consent-{action}-{actor_user_id}-"
            f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            session,
            event_id=event_id,
            target_id=consent.patient_id,
            target_type=AUDIT_TARGET_TYPE,
            action=action,
            role=actor_role,
            actor_id=actor_user_id,
            note=(note or f"{action} consent_id={consent.id}")[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("research_consent audit skipped")


def get_active_consent(
    session: Session, patient_id: str
) -> Optional[ResearchConsent]:
    """Return the patient's ACTIVE consent row, or None.

    "Active" = ``revoked_at IS NULL``. The partial unique index
    ``ix_research_consents_active_per_patient`` guarantees at most one.
    """
    return (
        session.query(ResearchConsent)
        .filter(
            ResearchConsent.patient_id == patient_id,
            ResearchConsent.revoked_at.is_(None),
        )
        .order_by(ResearchConsent.granted_at.desc().nullslast())
        .first()
    )


def list_consent_history(
    session: Session, patient_id: str
) -> list[ResearchConsent]:
    """Return every consent row for the patient, newest grant first.

    Drives the patient profile "View history" timeline modal.
    """
    rows = (
        session.query(ResearchConsent)
        .filter(ResearchConsent.patient_id == patient_id)
        .order_by(ResearchConsent.created_at.desc())
        .all()
    )
    return list(rows)


def grant_consent(
    session: Session,
    patient_id: str,
    actor_user_id: str,
    actor_role: str,
    scope: str = DEFAULT_SCOPE,
) -> ResearchConsent:
    """Grant research-use consent for the patient.

    Idempotent: if an active consent already exists, returns it without
    inserting. Otherwise inserts a fresh row stamped ``granted=True`` +
    ``granted_at=now(utc)`` and emits a ``research_consent_grant`` audit.

    Raises
    ------
    ResearchConsentError
        If the patient row cannot be resolved to an owning clinic.
    """
    existing = get_active_consent(session, patient_id)
    if existing is not None:
        return existing

    clinic_id = _resolve_patient_clinic_id(session, patient_id)
    if not clinic_id:
        raise ResearchConsentError(
            "Patient is not bound to a clinic; cannot grant research consent.",
            code="patient_clinic_unresolved",
            status_code=400,
        )

    now = datetime.now(timezone.utc)
    consent = ResearchConsent(
        id=f"rc_{uuid.uuid4().hex[:12]}",
        patient_id=patient_id,
        clinic_id=clinic_id,
        granted=True,
        granted_at=now,
        granted_by_actor_id=actor_user_id,
        granted_by_role=actor_role,
        scope=(scope or DEFAULT_SCOPE).strip() or DEFAULT_SCOPE,
        created_at=now,
        updated_at=now,
    )
    session.add(consent)
    session.commit()
    session.refresh(consent)

    _audit(
        session,
        action=ACTION_GRANT,
        consent=consent,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        note=f"scope={consent.scope}",
    )
    return consent


def revoke_consent(
    session: Session,
    patient_id: str,
    actor_user_id: str,
    actor_role: str,
    reason: Optional[str] = None,
) -> ResearchConsent:
    """Revoke the patient's active research consent.

    Stamps ``revoked_at`` (UTC), ``revoked_by_actor_id``,
    ``revoked_by_role``, and the optional ``revocation_reason`` on the
    existing active row. The row is preserved — Slice C uses the
    timestamps to decide window membership.

    Raises
    ------
    ResearchConsentError
        If no active consent exists for the patient (HTTP 400).
    """
    active = get_active_consent(session, patient_id)
    if active is None:
        raise ResearchConsentError(
            "No active research consent to revoke.",
            code="no_active_consent",
            status_code=400,
        )

    now = datetime.now(timezone.utc)
    active.revoked_at = now
    active.revoked_by_actor_id = actor_user_id
    active.revoked_by_role = actor_role
    if reason is not None:
        # Strip + cap to a reasonable size; Text() has no DB limit but the
        # router caps input via pydantic Field(max_length=...).
        active.revocation_reason = reason.strip() or None
    active.updated_at = now
    session.commit()
    session.refresh(active)

    _audit(
        session,
        action=ACTION_REVOKE,
        consent=active,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        note=(reason or "")[:480] or "revoked",
    )
    return active


def get_consent_status_for_patients(
    session: Session, patient_ids: list[str]
) -> dict[str, bool]:
    """Bulk-lookup helper for Slice C: ``{patient_id: True|False}``.

    True iff the patient has an active research consent row. Unknown
    patient ids map to False (no row → no consent).
    """
    if not patient_ids:
        return {}
    rows = (
        session.query(ResearchConsent.patient_id)
        .filter(
            ResearchConsent.patient_id.in_(list(patient_ids)),
            ResearchConsent.revoked_at.is_(None),
        )
        .all()
    )
    active_ids = {r[0] for r in rows}
    return {pid: (pid in active_ids) for pid in patient_ids}
