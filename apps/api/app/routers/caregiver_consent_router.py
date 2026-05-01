"""Caregiver Consent Grants launch-audit (2026-05-01).

Closes the caregiver-share loop opened by Patient Digest #376. Patient
Digest records intent + audit when a patient clicks "Share with
caregiver" — but until this PR there was no durable consent table for
downstream "share-with-caregiver" handlers to consult. They had to
return ``delivery_status='queued'`` even when the patient meant "yes,
deliver".

This router introduces the ``caregiver_consent`` surface — a real
``CaregiverConsentGrant`` row keyed (patient, caregiver, granted_at)
with a JSON ``scope`` (digest / messages / reports / wearables) and a
durable revocation transcript via :class:`CaregiverConsentRevision`.

Endpoints
---------
GET  /api/v1/caregiver-consent/grants                List active +
                                                     revoked grants for
                                                     the actor's patient
                                                     row.
GET  /api/v1/caregiver-consent/grants/{id}           One grant.
POST /api/v1/caregiver-consent/grants                Patient grants a
                                                     caregiver access
                                                     (scope JSON).
POST /api/v1/caregiver-consent/grants/{id}/revoke    Patient revokes;
                                                     reason required.
GET  /api/v1/caregiver-consent/grants/by-caregiver   Caregiver sees the
                                                     grants pointed at
                                                     them. Used by the
                                                     Caregiver Portal.
POST /api/v1/caregiver-consent/audit-events          Page-level audit
                                                     ingestion under
                                                     ``target_type=caregiver_consent``.

Role gate
---------
The patient endpoints (``/grants`` / ``/grants/{id}`` / ``/grants``
POST / ``/grants/{id}/revoke``) are patient-only. Cross-role hits
return 404 (never 403/401) so the patient-scope URL existence is
invisible to clinicians and admins. Cross-patient access cannot happen
because the patient row is resolved from ``actor.actor_id`` via the
``Patient.email == User.email`` chain — there is no ``patient_id`` to
forge.

The ``by-caregiver`` endpoint resolves the caregiver from
``actor.actor_id`` and returns ONLY grants that explicitly point at
that caregiver. A patient hitting ``by-caregiver`` legally returns
nothing (their ``actor_id`` is never a caregiver target) without an
error — ``items=[]``.

Patient Digest #376 wire-up
---------------------------
``patient_digest_router.share_with_caregiver`` calls
:func:`has_active_grant` on this surface. If a grant exists with
``scope.digest == True``, the digest endpoint flips
``delivery_status='sent'`` and emits a clinician-visible audit row
recording the full consent provenance (grant_id, granted_at,
caregiver_user_id, scope). If no grant exists, it stays ``queued`` and
returns the message "Caregiver consent not active for digest sharing"
so the patient sees an honest explanation.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    CaregiverConsentGrant,
    CaregiverConsentRevision,
    Patient,
    User,
)


router = APIRouter(prefix="/api/v1/caregiver-consent", tags=["Caregiver Consent"])
_log = logging.getLogger(__name__)


AUDIT_SURFACE = "caregiver_consent"


CAREGIVER_CONSENT_DISCLAIMERS = [
    "A grant is the durable record that you have authorised a specific "
    "caregiver to receive specific classes of clinical artefacts.",
    "Until a grant is active, downstream surfaces (digest / messages "
    "/ reports / wearables) record your intent + audit but do NOT "
    "deliver — delivery_status stays ``queued``.",
    "Revocation never deletes a grant — it stamps a ``revoked_at`` + "
    "``revoked_by_user_id`` + ``revocation_reason`` and the grant row "
    "is immutable thereafter.",
    "Each grant / revoke / scope-edit emits an audit row, and the full "
    "transcript is recorded in ``caregiver_consent_revisions``.",
]


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}
_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}

CANONICAL_SCOPE_KEYS = ("digest", "messages", "reports", "wearables")


# ── Helpers ─────────────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _patient_is_demo(db: Session, patient: Patient | None) -> bool:
    if patient is None:
        return False
    notes = patient.notes or ""
    if notes.startswith("[DEMO]"):
        return True
    try:
        u = db.query(User).filter_by(id=patient.clinician_id).first()
        if u is None or not u.clinic_id:
            return False
        return u.clinic_id in _DEMO_CLINIC_IDS
    except Exception:
        return False


def _resolve_patient_for_actor(
    db: Session, actor: AuthenticatedActor
) -> Patient:
    """Return the Patient row the actor is allowed to act on.

    Patient role only. Cross-role hits return 404. Cross-patient access
    cannot happen because the Patient row is resolved from
    ``actor.actor_id``, not a path / query param.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="not_found",
            message="Patient record not found.",
            status_code=404,
        )
    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        patient = (
            db.query(Patient)
            .filter(Patient.email.in_(list(_DEMO_PATIENT_EMAILS)))
            .first()
        )
    else:
        user = db.query(User).filter_by(id=actor.actor_id).first()
        if user is None or not user.email:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="not_found",
            message="Patient record not found.",
            status_code=404,
        )
    return patient


def _normalise_scope(raw: Optional[dict]) -> dict:
    """Coerce caller-supplied scope into a canonical dict of bool flags.

    Unknown keys are tolerated (forward-compatible) but ignored by the
    downstream gate. Missing canonical keys default to False.
    """
    out: dict = {k: False for k in CANONICAL_SCOPE_KEYS}
    if isinstance(raw, dict):
        for k, v in raw.items():
            if isinstance(k, str):
                out[k] = bool(v)
    return out


def _scope_to_text(scope: dict) -> str:
    return json.dumps(scope, sort_keys=True)


def _scope_from_text(s: Optional[str]) -> dict:
    if not s:
        return {k: False for k in CANONICAL_SCOPE_KEYS}
    try:
        parsed = json.loads(s)
        if isinstance(parsed, dict):
            return _normalise_scope(parsed)
    except (TypeError, ValueError):
        pass
    return {k: False for k in CANONICAL_SCOPE_KEYS}


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the ``caregiver_consent`` surface.

    Never raises — audit must never block the UI.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"{AUDIT_SURFACE}-{event}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if using_demo_data:
        note_parts.append("DEMO")
    if note:
        note_parts.append(note[:500])
    final_note = "; ".join(note_parts) or event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type=AUDIT_SURFACE,
            action=f"{AUDIT_SURFACE}.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("caregiver_consent self-audit skipped")
    return event_id


def has_active_grant(
    db: Session,
    *,
    patient_id: str,
    caregiver_user_id: str,
    scope_key: str,
) -> Optional[CaregiverConsentGrant]:
    """Return the active grant matching (patient, caregiver, scope_key)
    if one exists, else None.

    Used by Patient Digest #376 share-caregiver to flip delivery_status
    from ``queued`` → ``sent`` honestly. ``scope_key`` must be one of
    :data:`CANONICAL_SCOPE_KEYS`.
    """
    if scope_key not in CANONICAL_SCOPE_KEYS:
        return None
    rows = (
        db.query(CaregiverConsentGrant)
        .filter(
            CaregiverConsentGrant.patient_id == patient_id,
            CaregiverConsentGrant.caregiver_user_id == caregiver_user_id,
            CaregiverConsentGrant.revoked_at.is_(None),
        )
        .all()
    )
    for g in rows:
        scope = _scope_from_text(g.scope)
        if scope.get(scope_key):
            return g
    return None


# ── Schemas ─────────────────────────────────────────────────────────────────


class GrantOut(BaseModel):
    id: str
    patient_id: str
    caregiver_user_id: str
    caregiver_email: Optional[str] = None
    caregiver_display_name: Optional[str] = None
    granted_at: str
    granted_by_user_id: str
    revoked_at: Optional[str] = None
    revoked_by_user_id: Optional[str] = None
    revocation_reason: Optional[str] = None
    scope: dict = Field(default_factory=dict)
    note: Optional[str] = None
    is_active: bool = True
    created_at: str
    updated_at: str


class GrantListOut(BaseModel):
    items: list[GrantOut] = Field(default_factory=list)
    patient_id: str = ""
    is_demo: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(CAREGIVER_CONSENT_DISCLAIMERS)
    )


class GrantCreateIn(BaseModel):
    caregiver_user_id: str = Field(..., min_length=1, max_length=64)
    scope: dict = Field(default_factory=dict)
    note: Optional[str] = Field(default=None, max_length=480)


class GrantRevokeIn(BaseModel):
    reason: str = Field(..., min_length=1, max_length=480)


class CaregiverGrantsListOut(BaseModel):
    items: list[GrantOut] = Field(default_factory=list)
    caregiver_user_id: str
    disclaimers: list[str] = Field(
        default_factory=lambda: list(CAREGIVER_CONSENT_DISCLAIMERS)
    )


class ConsentAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    target_id: Optional[str] = Field(default=None, max_length=128)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class ConsentAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Serialisers ─────────────────────────────────────────────────────────────


def _serialise_grant(db: Session, g: CaregiverConsentGrant) -> GrantOut:
    cg = db.query(User).filter_by(id=g.caregiver_user_id).first()
    return GrantOut(
        id=g.id,
        patient_id=g.patient_id,
        caregiver_user_id=g.caregiver_user_id,
        caregiver_email=getattr(cg, "email", None) if cg else None,
        caregiver_display_name=getattr(cg, "display_name", None) if cg else None,
        granted_at=g.granted_at,
        granted_by_user_id=g.granted_by_user_id,
        revoked_at=g.revoked_at,
        revoked_by_user_id=g.revoked_by_user_id,
        revocation_reason=g.revocation_reason,
        scope=_scope_from_text(g.scope),
        note=g.note,
        is_active=g.revoked_at is None,
        created_at=g.created_at,
        updated_at=g.updated_at,
    )


# ── Endpoints (patient-scoped) ──────────────────────────────────────────────


@router.get("/grants", response_model=GrantListOut)
def list_grants(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> GrantListOut:
    """List all caregiver consent grants for the actor's patient row.

    Includes both active and revoked grants — the regulator transcript
    must show the full history. Order by granted_at desc.
    """
    patient = _resolve_patient_for_actor(db, actor)
    rows = (
        db.query(CaregiverConsentGrant)
        .filter(CaregiverConsentGrant.patient_id == patient.id)
        .order_by(CaregiverConsentGrant.granted_at.desc())
        .all()
    )
    items = [_serialise_grant(db, g) for g in rows]
    is_demo = _patient_is_demo(db, patient)

    _audit(
        db, actor,
        event="grants_listed",
        target_id=patient.id,
        note=f"count={len(items)}",
        using_demo_data=is_demo,
    )

    return GrantListOut(
        items=items, patient_id=patient.id, is_demo=is_demo,
    )


@router.get("/grants/by-caregiver", response_model=CaregiverGrantsListOut)
def list_grants_by_caregiver(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CaregiverGrantsListOut:
    """List grants pointed at the actor as caregiver.

    Used by the Caregiver Portal so caregivers see what they have been
    authorised to receive without ever needing the patient's identity.

    Anyone except a guest can call this; the result is filtered by the
    actor's own ``actor_id`` so a clinician / admin / patient who is
    not a caregiver target gets ``items=[]`` (legitimately empty).
    """
    if actor.role == "guest":
        raise ApiServiceError(
            code="forbidden",
            message="Guests cannot list caregiver grants.",
            status_code=403,
        )
    rows = (
        db.query(CaregiverConsentGrant)
        .filter(CaregiverConsentGrant.caregiver_user_id == actor.actor_id)
        .order_by(CaregiverConsentGrant.granted_at.desc())
        .all()
    )
    items = [_serialise_grant(db, g) for g in rows]
    _audit(
        db, actor,
        event="by_caregiver_listed",
        target_id=actor.actor_id,
        note=f"count={len(items)}",
    )
    return CaregiverGrantsListOut(
        items=items, caregiver_user_id=actor.actor_id,
    )


@router.get("/grants/{grant_id}", response_model=GrantOut)
def get_grant(
    grant_id: str = Path(..., max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> GrantOut:
    """Return one grant — only if it belongs to the actor's patient row."""
    patient = _resolve_patient_for_actor(db, actor)
    g = db.query(CaregiverConsentGrant).filter_by(id=grant_id).first()
    if g is None or g.patient_id != patient.id:
        raise ApiServiceError(
            code="not_found",
            message="Grant not found.",
            status_code=404,
        )
    _audit(
        db, actor,
        event="grant_viewed",
        target_id=g.id,
        note=f"caregiver={g.caregiver_user_id}",
        using_demo_data=_patient_is_demo(db, patient),
    )
    return _serialise_grant(db, g)


@router.post("/grants", response_model=GrantOut)
def create_grant(
    body: GrantCreateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> GrantOut:
    """Patient grants a caregiver access.

    Idempotent on (patient, caregiver, active grant): if there is
    already an active grant pointed at the same caregiver, the existing
    grant's scope is updated (and a ``scope_edit`` revision row is
    appended). Otherwise a new grant row is created and a ``create``
    revision row is appended.
    """
    patient = _resolve_patient_for_actor(db, actor)
    caregiver = db.query(User).filter_by(id=body.caregiver_user_id).first()
    if caregiver is None:
        raise ApiServiceError(
            code="not_found",
            message="Caregiver recipient not found.",
            status_code=404,
        )

    scope = _normalise_scope(body.scope)
    scope_text = _scope_to_text(scope)
    now = _now_iso()

    existing = (
        db.query(CaregiverConsentGrant)
        .filter(
            CaregiverConsentGrant.patient_id == patient.id,
            CaregiverConsentGrant.caregiver_user_id == body.caregiver_user_id,
            CaregiverConsentGrant.revoked_at.is_(None),
        )
        .first()
    )

    if existing is not None:
        prior_scope_text = existing.scope or _scope_to_text(
            {k: False for k in CANONICAL_SCOPE_KEYS}
        )
        existing.scope = scope_text
        existing.note = body.note or existing.note
        existing.updated_at = now
        revision = CaregiverConsentRevision(
            id=f"ccr-{uuid.uuid4().hex[:14]}",
            grant_id=existing.id,
            patient_id=patient.id,
            caregiver_user_id=body.caregiver_user_id,
            action="scope_edit",
            scope_before=prior_scope_text,
            scope_after=scope_text,
            actor_user_id=actor.actor_id,
            reason=body.note,
            created_at=now,
        )
        db.add(revision)
        db.commit()
        db.refresh(existing)
        grant = existing
        action_event = "grant_updated"
    else:
        grant = CaregiverConsentGrant(
            id=f"ccg-{uuid.uuid4().hex[:14]}",
            patient_id=patient.id,
            caregiver_user_id=body.caregiver_user_id,
            granted_at=now,
            granted_by_user_id=actor.actor_id,
            revoked_at=None,
            revoked_by_user_id=None,
            revocation_reason=None,
            scope=scope_text,
            note=body.note,
            created_at=now,
            updated_at=now,
        )
        db.add(grant)
        db.flush()
        revision = CaregiverConsentRevision(
            id=f"ccr-{uuid.uuid4().hex[:14]}",
            grant_id=grant.id,
            patient_id=patient.id,
            caregiver_user_id=body.caregiver_user_id,
            action="create",
            scope_before=None,
            scope_after=scope_text,
            actor_user_id=actor.actor_id,
            reason=body.note,
            created_at=now,
        )
        db.add(revision)
        db.commit()
        db.refresh(grant)
        action_event = "grant_created"

    is_demo = _patient_is_demo(db, patient)
    _audit(
        db, actor,
        event=action_event,
        target_id=grant.id,
        note=(
            f"caregiver={body.caregiver_user_id}; "
            f"scope={scope_text}"
        ),
        using_demo_data=is_demo,
    )
    return _serialise_grant(db, grant)


@router.post("/grants/{grant_id}/revoke", response_model=GrantOut)
def revoke_grant(
    body: GrantRevokeIn,
    grant_id: str = Path(..., max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> GrantOut:
    """Revoke a grant. Reason is required; the grant becomes immutable."""
    patient = _resolve_patient_for_actor(db, actor)
    g = db.query(CaregiverConsentGrant).filter_by(id=grant_id).first()
    if g is None or g.patient_id != patient.id:
        raise ApiServiceError(
            code="not_found",
            message="Grant not found.",
            status_code=404,
        )
    if g.revoked_at is not None:
        raise ApiServiceError(
            code="conflict",
            message="Grant is already revoked.",
            status_code=409,
        )

    now = _now_iso()
    prior_scope_text = g.scope
    g.revoked_at = now
    g.revoked_by_user_id = actor.actor_id
    g.revocation_reason = body.reason
    g.updated_at = now

    revision = CaregiverConsentRevision(
        id=f"ccr-{uuid.uuid4().hex[:14]}",
        grant_id=g.id,
        patient_id=patient.id,
        caregiver_user_id=g.caregiver_user_id,
        action="revoke",
        scope_before=prior_scope_text,
        scope_after=prior_scope_text,
        actor_user_id=actor.actor_id,
        reason=body.reason,
        created_at=now,
    )
    db.add(revision)
    db.commit()
    db.refresh(g)

    is_demo = _patient_is_demo(db, patient)
    _audit(
        db, actor,
        event="grant_revoked",
        target_id=g.id,
        note=(
            f"caregiver={g.caregiver_user_id}; "
            f"reason={body.reason[:120]}"
        ),
        using_demo_data=is_demo,
    )
    return _serialise_grant(db, g)


# ── Audit ingestion ─────────────────────────────────────────────────────────


@router.post("/audit-events", response_model=ConsentAuditEventOut)
def post_audit_event(
    body: ConsentAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentAuditEventOut:
    """Page-level audit ingestion for the caregiver-consent surface.

    Common events: ``view`` (page mount), ``filter_changed``,
    ``grant_form_opened``, ``revoke_form_opened``, ``demo_banner_shown``.
    Mutation events (``grant_created`` / ``grant_updated`` /
    ``grant_revoked``) are emitted by the dedicated endpoints above.

    Patients can post audit events about their own consent activity.
    Caregivers can post audit events too (they have a legitimate page
    showing their own grants). Admins / guests are denied with 403.
    """
    if actor.role not in ("patient", "clinician"):
        raise ApiServiceError(
            code="forbidden",
            message=(
                "Only patient or caregiver/clinician roles can post "
                "caregiver_consent audit events."
            ),
            status_code=403,
        )
    target_id = body.target_id or actor.actor_id
    note_parts: list[str] = []
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    using_demo = bool(body.using_demo_data)
    if actor.role == "patient":
        try:
            patient = _resolve_patient_for_actor(db, actor)
            using_demo = using_demo or _patient_is_demo(db, patient)
        except ApiServiceError:
            pass

    event_id = _audit(
        db, actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=using_demo,
    )
    return ConsentAuditEventOut(accepted=True, event_id=event_id)
