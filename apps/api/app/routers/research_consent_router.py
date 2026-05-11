"""Research-use Consent router (Slice B — Data Console pipeline).

Backs the patient-profile "Research Consent" card on both surfaces:

* Clinical hubs (clinician / clinic_admin / admin) — view status,
  view history, grant on behalf of the patient (e.g. captured on an
  in-clinic consent form), revoke.
* Patient portal — the patient sees the same card and can grant /
  revoke their own consent. A patient does NOT need clinician approval
  to revoke; once revoked, Slice C export filters honour the
  ``revoked_at`` timestamp immediately.

Slice C will JOIN on the active consent + the per-row timestamps to
decide which de-identified rows are eligible for research export. See
``services.research_consent_service`` for the canonical rules.

Endpoints
---------
GET  /api/v1/research-consent/patients/{patient_id}/active
GET  /api/v1/research-consent/patients/{patient_id}/history
POST /api/v1/research-consent/patients/{patient_id}/grant
POST /api/v1/research-consent/patients/{patient_id}/revoke
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.patients import resolve_patient_clinic_id
from app.repositories.research_consent import (
    get_patient_by_emails_any,
    get_patient_by_email,
    get_user_by_id,
)
from app.services.research_consent_service import (
    DEFAULT_SCOPE,
    ResearchConsentError,
    get_active_consent,
    grant_consent,
    list_consent_history,
    revoke_consent,
)


router = APIRouter(
    prefix="/api/v1/research-consent",
    tags=["research-consent"],
)
_log = logging.getLogger(__name__)


# Roles whose actor_id is a clinic-staff User row. A patient acting on
# their own consent uses a separate self-resolution path (no patient_id
# forge possible because we match by email).
_STAFF_ROLES = {"clinician", "reviewer", "technician", "admin", "supervisor"}

_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}


# ── Schemas ──────────────────────────────────────────────────────────────────


# core-schema-exempt: router-local projection of ResearchConsent ORM row; not reused outside this router (Slice C will receive the same shape over the wire but does not import this class)
class ResearchConsentOut(BaseModel):
    id: str
    patient_id: str
    clinic_id: str
    granted: bool
    granted_at: Optional[str] = None
    granted_by_actor_id: Optional[str] = None
    granted_by_role: Optional[str] = None
    scope: str
    revoked_at: Optional[str] = None
    revoked_by_actor_id: Optional[str] = None
    revoked_by_role: Optional[str] = None
    revocation_reason: Optional[str] = None
    is_active: bool
    created_at: str
    updated_at: str


# core-schema-exempt: thin envelope for GET /active; not reused outside this router
class ActiveConsentResponse(BaseModel):
    patient_id: str
    has_active_consent: bool
    consent: Optional[ResearchConsentOut] = None


# core-schema-exempt: thin list envelope for GET /history; not reused outside this router
class ConsentHistoryResponse(BaseModel):
    patient_id: str
    items: list[ResearchConsentOut] = Field(default_factory=list)
    total: int = 0


# core-schema-exempt: minimal router-local POST /grant body; not reused outside this router
class GrantConsentIn(BaseModel):
    scope: Optional[str] = Field(default=DEFAULT_SCOPE, max_length=64)


# core-schema-exempt: minimal router-local POST /revoke body; not reused outside this router
class RevokeConsentIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=480)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    # Datetime may be tz-naive (SQLite strip) — assume UTC and emit
    # ISO-8601 with explicit Z so downstream JS / Slice C never
    # ambiguously parses local time.
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.isoformat()


def _serialise(consent) -> ResearchConsentOut:
    return ResearchConsentOut(
        id=consent.id,
        patient_id=consent.patient_id,
        clinic_id=consent.clinic_id,
        granted=bool(consent.granted),
        granted_at=_iso(consent.granted_at),
        granted_by_actor_id=consent.granted_by_actor_id,
        granted_by_role=consent.granted_by_role,
        scope=consent.scope,
        revoked_at=_iso(consent.revoked_at),
        revoked_by_actor_id=consent.revoked_by_actor_id,
        revoked_by_role=consent.revoked_by_role,
        revocation_reason=consent.revocation_reason,
        is_active=consent.revoked_at is None,
        created_at=_iso(consent.created_at) or "",
        updated_at=_iso(consent.updated_at) or "",
    )


def _resolve_patient_for_patient_actor(db: Session, actor: AuthenticatedActor):
    """Resolve the Patient row a patient-role actor is allowed to act on.

    A patient actor never accepts a path ``patient_id`` to scope by — we
    derive the row from ``actor.actor_id`` so a token leak can only ever
    burn the one patient bound to that User row.
    """
    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        patient = get_patient_by_emails_any(db, list(_DEMO_PATIENT_EMAILS))
    else:
        user = get_user_by_id(db, actor.actor_id)
        if user is None or not user.email:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        patient = get_patient_by_email(db, user.email)
    if patient is None:
        raise ApiServiceError(
            code="not_found",
            message="Patient record not found.",
            status_code=404,
        )
    return patient


def _gate_access(
    db: Session, actor: AuthenticatedActor, patient_id: str
) -> None:
    """Enforce role + cross-clinic access for a staff actor.

    Patient-role actors are NOT routed through this helper — they use
    :func:`_resolve_patient_for_patient_actor` so the path-supplied
    ``patient_id`` must equal the one resolved from their User row.
    """
    if actor.role == "guest":
        raise ApiServiceError(
            code="cross_clinic_access_denied",
            message="Guest actors cannot access research-consent data.",
            status_code=403,
        )
    if actor.role not in _STAFF_ROLES:
        # Defensive — a non-guest, non-patient, non-staff role hitting a
        # staff-only branch should be a 403 not a 500.
        raise ApiServiceError(
            code="insufficient_role",
            message="This action requires clinical-staff role.",
            status_code=403,
        )
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )
    require_patient_owner(actor, clinic_id)


def _resolve_acting_patient_id(
    db: Session, actor: AuthenticatedActor, path_patient_id: str
) -> str:
    """Resolve the patient_id the actor is allowed to operate on.

    * Patient role: resolve from ``actor.actor_id`` and confirm the path
      ``patient_id`` matches. A patient cannot grant / revoke on behalf
      of any other patient.
    * Staff role: gate by cross-clinic ownership of ``path_patient_id``.
    """
    if actor.role == "patient":
        patient = _resolve_patient_for_patient_actor(db, actor)
        if path_patient_id != patient.id:
            # Surface 404 (not 403) so the existence of an out-of-scope
            # patient is not revealed to a patient token.
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        return patient.id
    _gate_access(db, actor, path_patient_id)
    return path_patient_id


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get(
    "/patients/{patient_id}/active",
    response_model=ActiveConsentResponse,
    summary="Get the patient's active research consent (or null).",
)
def get_active(
    patient_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ActiveConsentResponse:
    effective_id = _resolve_acting_patient_id(db, actor, patient_id)
    active = get_active_consent(db, effective_id)
    return ActiveConsentResponse(
        patient_id=effective_id,
        has_active_consent=active is not None,
        consent=_serialise(active) if active is not None else None,
    )


@router.get(
    "/patients/{patient_id}/history",
    response_model=ConsentHistoryResponse,
    summary="Audit-style history of grant/revoke events for the patient.",
)
def get_history(
    patient_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentHistoryResponse:
    effective_id = _resolve_acting_patient_id(db, actor, patient_id)
    rows = list_consent_history(db, effective_id)
    return ConsentHistoryResponse(
        patient_id=effective_id,
        items=[_serialise(r) for r in rows],
        total=len(rows),
    )


@router.post(
    "/patients/{patient_id}/grant",
    response_model=ResearchConsentOut,
    summary="Grant research-use consent (idempotent if already active).",
)
def grant(
    body: GrantConsentIn,
    patient_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ResearchConsentOut:
    effective_id = _resolve_acting_patient_id(db, actor, patient_id)
    try:
        consent = grant_consent(
            db,
            patient_id=effective_id,
            actor_user_id=actor.actor_id,
            actor_role=actor.role,
            scope=(body.scope or DEFAULT_SCOPE),
        )
    except ResearchConsentError as exc:
        raise ApiServiceError(
            code=exc.code, message=exc.message, status_code=exc.status_code
        ) from exc
    return _serialise(consent)


@router.post(
    "/patients/{patient_id}/revoke",
    response_model=ResearchConsentOut,
    summary="Revoke the patient's active research consent.",
)
def revoke(
    body: RevokeConsentIn,
    patient_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ResearchConsentOut:
    effective_id = _resolve_acting_patient_id(db, actor, patient_id)
    try:
        consent = revoke_consent(
            db,
            patient_id=effective_id,
            actor_user_id=actor.actor_id,
            actor_role=actor.role,
            reason=body.reason,
        )
    except ResearchConsentError as exc:
        raise ApiServiceError(
            code=exc.code, message=exc.message, status_code=exc.status_code
        ) from exc
    return _serialise(consent)
