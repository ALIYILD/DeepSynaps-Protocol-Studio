"""Caregiver Email Digest launch-audit (2026-05-01).

Closes the bidirectional notification loop end-to-end: Caregiver Portal
in-app badge (#379) + email / Slack / SMS push (THIS PR). Daily roll-up
dispatch of unread caregiver notifications using the on-call delivery
adapters (#373) in mock mode unless real env vars are set.

Pattern matches Daily Digest #366 + Patient Digest #376 ``send-email``
flow, scoped to ``actor.user_id`` (caregiver-side). Uses
``caregiver_consent.scope.digest`` flag as the consent gate — a
caregiver only receives a digest when AT LEAST one of the grants
pointed at them carries ``scope.digest=True``.

Endpoints
---------
GET  /api/v1/caregiver-consent/email-digest/preview
                                    Preview the digest the caregiver
                                    would receive (today's unread
                                    notifications + scope-allowed
                                    grants).
POST /api/v1/caregiver-consent/email-digest/send-now
                                    Manual trigger; dispatches via
                                    oncall-delivery in mock mode
                                    unless real env vars are set;
                                    emits audit
                                    ``caregiver_portal.email_digest_sent``.
GET  /api/v1/caregiver-consent/email-digest/preferences
                                    Caregiver preference (enabled,
                                    frequency, time-of-day).
PUT  /api/v1/caregiver-consent/email-digest/preferences
                                    Set preferences; emits audit
                                    ``caregiver_portal.email_digest_preferences_changed``.
POST /api/v1/caregiver-consent/email-digest/audit-events
                                    Page audit ingestion under
                                    ``target_type=caregiver_email_digest_worker``.

Role gate
---------
Reachable by any non-guest role (consistent with the rest of the
caregiver portal surfaces). The endpoints scope STRICTLY to
``actor.actor_id`` (caregiver-side). A clinician / patient / admin who
is not a caregiver target legitimately sees ``items=[]`` from preview
and a ``preferences`` row of their own. Cross-caregiver access is
impossible because every read / write is keyed on ``actor.actor_id`` —
there is no caregiver_user_id query/path param to forge.

Honest delivery status
----------------------
``send-now`` returns ``status='sent'`` only when the on-call delivery
service confirms a 2xx from a real adapter OR the explicit
``DEEPSYNAPS_DELIVERY_MOCK=1`` flag is set. Otherwise it returns
``status='queued'`` with a note explaining why (no adapters enabled,
consent missing, no unread notifications). The audit row records the
intent + recipient verbatim either way.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AuditEventRecord,
    CaregiverConsentGrant,
    CaregiverDigestPreference,
    User,
)


router = APIRouter(
    prefix="/api/v1/caregiver-consent/email-digest",
    tags=["Caregiver Email Digest"],
)
_log = logging.getLogger(__name__)


# Page-level audit surface for the email digest. Distinct from
# ``caregiver_email_digest_worker`` (the worker's per-tick surface) so
# ``caregiver_portal.email_digest_*`` events stay attributed to the
# caregiver-side portal action and the worker's tick rows stay clean.
PORTAL_SURFACE = "caregiver_portal"
WORKER_SURFACE = "caregiver_email_digest_worker"


CAREGIVER_DIGEST_DISCLAIMERS = [
    "Daily digest dispatches a roll-up of unread caregiver notifications "
    "via the on-call delivery adapters. Until a real adapter is wired up, "
    "delivery_status='queued' OR 'sent' (when DEEPSYNAPS_DELIVERY_MOCK=1).",
    "Digest dispatch requires at least one active caregiver consent grant "
    "with ``scope.digest=True`` pointed at this caregiver. Without such a "
    "grant the digest stays queued and the audit row records consent_required=true.",
    "Preferences default to disabled. The caregiver opts in by setting "
    "``enabled=true`` + a frequency (daily / weekly) + time-of-day. The worker "
    "honours a 24h per-caregiver cooldown to prevent duplicate dispatch.",
    "Each send-now / preferences change emits an audit row under "
    "``target_type=caregiver_portal`` so the regulator transcript joins "
    "every dispatch attempt to the caregiver's preference state.",
]


VALID_FREQUENCIES = {"daily", "weekly"}


# ── Helpers ─────────────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gate_caregiver_actor(actor: AuthenticatedActor) -> None:
    """Email-digest is reachable by any non-guest role.

    Guests get 403 (consistent with caregiver portal). A clinician /
    patient / admin who is not a caregiver target legitimately sees
    empty preview + their own preference row.
    """
    if actor.role == "guest":
        raise ApiServiceError(
            code="forbidden",
            message="Guests cannot use the caregiver email digest.",
            status_code=403,
        )


def _audit_portal(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
) -> str:
    """Best-effort audit hook under ``target_type='caregiver_portal'``.

    Mirrors the helper in ``caregiver_consent_router._audit_portal``.
    Never raises — audit must never block the UI.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"{PORTAL_SURFACE}-{event}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    final_note = note[:1024] if note else event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type=PORTAL_SURFACE,
            action=f"{PORTAL_SURFACE}.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("caregiver_email_digest portal-audit skipped")
    return event_id


def _audit_worker(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
) -> str:
    """Best-effort audit hook under ``target_type='caregiver_email_digest_worker'``.

    Used by the page-level audit ingestion endpoint and the worker's
    per-tick rows. Never raises.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"{WORKER_SURFACE}-{event}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    final_note = note[:1024] if note else event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("caregiver_email_digest worker-audit skipped")
    return event_id


def _get_or_create_preference(
    db: Session, caregiver_user_id: str
) -> CaregiverDigestPreference:
    """Return the actor's preference row, creating a default if absent.

    Defaults: ``enabled=False``, ``frequency='daily'``, ``time_of_day='08:00'``.
    """
    row = (
        db.query(CaregiverDigestPreference)
        .filter(CaregiverDigestPreference.caregiver_user_id == caregiver_user_id)
        .first()
    )
    if row is not None:
        return row
    now = _now_iso()
    row = CaregiverDigestPreference(
        id=f"cdp-{uuid.uuid4().hex[:16]}",
        caregiver_user_id=caregiver_user_id,
        enabled=False,
        frequency="daily",
        time_of_day="08:00",
        last_sent_at=None,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except Exception:  # pragma: no cover — defensive on unique-violation race
        db.rollback()
        row = (
            db.query(CaregiverDigestPreference)
            .filter(CaregiverDigestPreference.caregiver_user_id == caregiver_user_id)
            .first()
        )
    return row


def _has_digest_consent_grant(
    db: Session, caregiver_user_id: str
) -> Optional[CaregiverConsentGrant]:
    """Return the first active grant pointed at the caregiver carrying
    ``scope.digest=True``, else None.

    Reuses the canonical scope helper from the caregiver_consent_router
    so the truth-source for "active digest consent" stays single.
    """
    from app.routers.caregiver_consent_router import _scope_from_text  # noqa: PLC0415

    rows = (
        db.query(CaregiverConsentGrant)
        .filter(
            CaregiverConsentGrant.caregiver_user_id == caregiver_user_id,
            CaregiverConsentGrant.revoked_at.is_(None),
        )
        .all()
    )
    for g in rows:
        scope = _scope_from_text(g.scope)
        if scope.get("digest"):
            return g
    return None


def _build_preview_for_actor(
    db: Session, actor: AuthenticatedActor
) -> dict:
    """Build the digest preview payload for the actor.

    Returns a dict with ``unread_count`` (int) and ``items`` (list) of
    notification summaries the worker would dispatch. Reuses the
    Caregiver Notification Hub feed builder so the preview matches what
    the in-app badge surfaces.
    """
    from app.routers.caregiver_consent_router import (  # noqa: PLC0415
        _build_notification_index,
    )

    items, _read_ids, _grants = _build_notification_index(db, actor)
    unread = [n for n in items if not n.is_read]
    return {
        "unread_count": len(unread),
        "items": [
            {
                "id": n.id,
                "type": n.type,
                "summary": n.summary,
                "created_at": n.created_at,
                "surface": n.surface,
                "grant_id": n.grant_id,
            }
            for n in unread[:50]
        ],
    }


# ── Schemas ─────────────────────────────────────────────────────────────────


class DigestPreviewItemOut(BaseModel):
    id: str
    type: str
    summary: str
    created_at: str
    surface: str
    grant_id: Optional[str] = None


class DigestPreviewOut(BaseModel):
    caregiver_user_id: str
    unread_count: int
    items: list[DigestPreviewItemOut] = Field(default_factory=list)
    consent_active: bool = False
    is_demo: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(CAREGIVER_DIGEST_DISCLAIMERS)
    )


class DigestSendNowOut(BaseModel):
    accepted: bool = True
    delivery_status: str  # "sent" | "queued" | "failed"
    adapter: Optional[str] = None
    external_id: Optional[str] = None
    audit_event_id: str
    consent_required: bool = False
    unread_count: int = 0
    note: str = ""


class DigestPreferenceOut(BaseModel):
    caregiver_user_id: str
    enabled: bool
    frequency: str
    time_of_day: str
    last_sent_at: Optional[str] = None
    created_at: str
    updated_at: str
    disclaimers: list[str] = Field(
        default_factory=lambda: list(CAREGIVER_DIGEST_DISCLAIMERS)
    )


class DigestPreferenceIn(BaseModel):
    enabled: Optional[bool] = None
    frequency: Optional[str] = Field(default=None, max_length=16)
    time_of_day: Optional[str] = Field(default=None, max_length=8)

    @field_validator("frequency")
    @classmethod
    def _validate_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in VALID_FREQUENCIES:
            raise ValueError(
                f"frequency must be one of {sorted(VALID_FREQUENCIES)}"
            )
        return v

    @field_validator("time_of_day")
    @classmethod
    def _validate_time_of_day(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        # Accept HH:MM in 24h format. Be tolerant — the UI clamps but
        # surface honest errors when callers post junk.
        parts = v.split(":")
        if len(parts) != 2:
            raise ValueError("time_of_day must be HH:MM (24h)")
        try:
            h = int(parts[0])
            m = int(parts[1])
        except ValueError as exc:
            raise ValueError("time_of_day must be HH:MM (24h)") from exc
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError("time_of_day must be HH:MM (24h)")
        return f"{h:02d}:{m:02d}"


class DigestAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    target_id: Optional[str] = Field(default=None, max_length=128)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class DigestAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


def _serialise_preference(row: CaregiverDigestPreference) -> DigestPreferenceOut:
    return DigestPreferenceOut(
        caregiver_user_id=row.caregiver_user_id,
        enabled=bool(row.enabled),
        frequency=row.frequency,
        time_of_day=row.time_of_day,
        last_sent_at=row.last_sent_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/preview", response_model=DigestPreviewOut)
def preview(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestPreviewOut:
    """Preview the digest the caregiver would receive (today's unread).

    Pulls from the same notification feed as the in-app badge so the UI
    can show "you would receive N notifications". Reports
    ``consent_active`` so the UI can render an honest "Consent missing"
    banner when the caregiver has no grant with ``scope.digest=True``.
    """
    _gate_caregiver_actor(actor)
    pv = _build_preview_for_actor(db, actor)
    grant = _has_digest_consent_grant(db, actor.actor_id)

    _audit_portal(
        db,
        actor,
        event="email_digest_view",
        target_id=actor.actor_id,
        note=(
            f"unread={pv['unread_count']}; "
            f"consent_active={'1' if grant is not None else '0'}"
        ),
    )

    return DigestPreviewOut(
        caregiver_user_id=actor.actor_id,
        unread_count=pv["unread_count"],
        items=[DigestPreviewItemOut(**it) for it in pv["items"]],
        consent_active=grant is not None,
    )


@router.post("/send-now", response_model=DigestSendNowOut)
def send_now(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestSendNowOut:
    """Manually trigger a digest dispatch.

    Honest delivery status:

    * ``DEEPSYNAPS_DELIVERY_MOCK=1`` → ``sent`` via the mock adapter.
    * Real adapter env vars set + 2xx response → ``sent`` with the
      adapter name + external id.
    * No consent grant with ``scope.digest=True`` → ``queued`` with
      ``consent_required=True`` (intent + recipient still audited).
    * No unread notifications → ``queued`` with note explaining the
      no-op so the audit row records intent without spamming the
      adapter.
    * No adapters enabled and no mock flag → ``queued`` with note
      ``no_adapters_enabled``.
    """
    _gate_caregiver_actor(actor)

    pv = _build_preview_for_actor(db, actor)
    unread_count = pv["unread_count"]

    # Resolve the actor's email + display name for the page body. Fall
    # back to actor.actor_id when the User row is not findable so the
    # adapter still has something to identify the recipient by.
    user_row = db.query(User).filter_by(id=actor.actor_id).first()
    recipient_email = (getattr(user_row, "email", None) or "") or None
    recipient_name = (
        getattr(user_row, "display_name", None) or actor.display_name
    )

    grant = _has_digest_consent_grant(db, actor.actor_id)

    # Consent gate first — if no grant carries scope.digest=True, refuse
    # to dispatch but record the intent verbatim. The caller still gets
    # an accepted=True response so the UI can render an honest "consent
    # missing" notice keyed off ``consent_required`` instead of a 4xx.
    if grant is None:
        note = "consent_required=true; reason=no_active_grant_with_digest_scope"
        ev_id = _audit_portal(
            db,
            actor,
            event="email_digest_sent",
            target_id=actor.actor_id,
            note=(
                f"unread={unread_count}; recipient={recipient_email or '-'}; "
                f"delivery_status=queued; {note}"
            ),
        )
        return DigestSendNowOut(
            delivery_status="queued",
            audit_event_id=ev_id,
            consent_required=True,
            unread_count=unread_count,
            note=(
                "Caregiver consent not active for digest dispatch. The audit "
                "row records intent + recipient; delivery stays queued until "
                "the patient grants ``scope.digest=True``."
            ),
        )

    # No-op dispatch when there are no unread notifications. The audit
    # row records the no-op so reviewers can correlate "user clicked send
    # but nothing was actually dispatched".
    if unread_count == 0:
        ev_id = _audit_portal(
            db,
            actor,
            event="email_digest_sent",
            target_id=actor.actor_id,
            note=(
                f"unread=0; recipient={recipient_email or '-'}; "
                f"delivery_status=queued; reason=no_unread_notifications; "
                f"grant_id={grant.id}"
            ),
        )
        return DigestSendNowOut(
            delivery_status="queued",
            audit_event_id=ev_id,
            consent_required=False,
            unread_count=0,
            note=(
                "No unread notifications to dispatch. The audit row records "
                "the no-op; nothing was handed to the delivery adapter."
            ),
        )

    # Dispatch via the on-call delivery service in mock mode (or real,
    # when the env vars are set). The clinic_id is intentionally unset —
    # caregiver dispatch is a per-user concern, not per-clinic.
    from app.services.oncall_delivery import (  # noqa: PLC0415
        PageMessage,
        build_default_service,
        build_email_digest_service,
        is_mock_mode_enabled,
    )

    body = (
        f"[Caregiver Digest] {unread_count} unread notification"
        f"{'s' if unread_count != 1 else ''} for "
        f"{recipient_name or 'caregiver'}. "
        f"Top: {(pv['items'][0]['summary'] if pv['items'] else '-')[:120]}"
    )
    message = PageMessage(
        clinic_id="caregiver-digest",
        surface="caregiver_email_digest",
        audit_event_id=f"caregiver-digest-{actor.actor_id}",
        body=body,
        severity="low",
        recipient_display_name=recipient_name,
        recipient_email=recipient_email,
        recipient_phone=None,
    )

    try:
        # Prefer the email-channel chain (SendGrid first when env vars
        # are set). Fall back to the loud-signal default chain if the
        # email chain has zero enabled adapters AND mock-mode is off, so
        # the caller still sees an honest ``queued`` instead of a silent
        # drop.
        service = build_email_digest_service()
        if (
            not service.get_enabled_adapters()
            and not is_mock_mode_enabled()
        ):
            service = build_default_service(clinic_id=None)
        result = service.send(message)
    except Exception as exc:  # pragma: no cover — defensive
        ev_id = _audit_portal(
            db,
            actor,
            event="email_digest_sent",
            target_id=actor.actor_id,
            note=(
                f"unread={unread_count}; recipient={recipient_email or '-'}; "
                f"delivery_status=failed; "
                f"error={exc.__class__.__name__}"
            ),
        )
        return DigestSendNowOut(
            delivery_status="failed",
            audit_event_id=ev_id,
            consent_required=False,
            unread_count=unread_count,
            note=f"delivery_service_raised: {exc.__class__.__name__}",
        )

    delivery_status = result.status  # "sent" | "queued" | "failed"
    adapter_name = result.adapter
    external_id = result.external_id
    delivery_note = (result.note or "")[:240]

    # Stamp last_sent_at on the preference row when the dispatch
    # actually went out, so the worker's 24h cooldown is honoured even
    # for manual sends.
    if delivery_status == "sent":
        pref = _get_or_create_preference(db, actor.actor_id)
        pref.last_sent_at = _now_iso()
        pref.updated_at = pref.last_sent_at
        try:
            db.commit()
        except Exception:  # pragma: no cover — defensive
            db.rollback()

    ev_id = _audit_portal(
        db,
        actor,
        event="email_digest_sent",
        target_id=actor.actor_id,
        note=(
            f"unread={unread_count}; recipient={recipient_email or '-'}; "
            f"delivery_status={delivery_status}; "
            f"adapter={adapter_name or '-'}; "
            f"external_id={external_id or '-'}; "
            f"grant_id={grant.id}; "
            f"delivery_note={delivery_note}"
        ),
    )

    return DigestSendNowOut(
        delivery_status=delivery_status,
        adapter=adapter_name,
        external_id=external_id,
        audit_event_id=ev_id,
        consent_required=False,
        unread_count=unread_count,
        note=delivery_note or f"dispatch via {adapter_name or 'no_adapter'}",
    )


@router.get("/preferences", response_model=DigestPreferenceOut)
def get_preferences(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestPreferenceOut:
    """Return the caregiver's digest preference row.

    Auto-creates a default disabled row on first read so the UI can
    bind to a stable shape without a separate "create" flow.
    """
    _gate_caregiver_actor(actor)
    row = _get_or_create_preference(db, actor.actor_id)
    return _serialise_preference(row)


@router.put("/preferences", response_model=DigestPreferenceOut)
def put_preferences(
    body: DigestPreferenceIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestPreferenceOut:
    """Update the caregiver's digest preference.

    Only the fields the caller sends are updated; missing fields keep
    their existing values. Emits ``caregiver_portal.email_digest_preferences_changed``.
    """
    _gate_caregiver_actor(actor)
    row = _get_or_create_preference(db, actor.actor_id)

    changes: list[str] = []
    if body.enabled is not None and bool(row.enabled) != bool(body.enabled):
        changes.append(f"enabled:{int(bool(row.enabled))}->{int(bool(body.enabled))}")
        row.enabled = bool(body.enabled)
    if body.frequency is not None and row.frequency != body.frequency:
        changes.append(f"frequency:{row.frequency}->{body.frequency}")
        row.frequency = body.frequency
    if body.time_of_day is not None and row.time_of_day != body.time_of_day:
        changes.append(f"time_of_day:{row.time_of_day}->{body.time_of_day}")
        row.time_of_day = body.time_of_day

    row.updated_at = _now_iso()
    try:
        db.commit()
        db.refresh(row)
    except Exception:  # pragma: no cover — defensive
        db.rollback()
        raise

    _audit_portal(
        db,
        actor,
        event="email_digest_preferences_changed",
        target_id=actor.actor_id,
        note=(
            "; ".join(changes) if changes else "no_changes"
        ),
    )
    return _serialise_preference(row)


@router.post("/audit-events", response_model=DigestAuditEventOut)
def post_audit_event(
    body: DigestAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestAuditEventOut:
    """Page-level audit ingestion under
    ``target_type='caregiver_email_digest_worker'``.

    Common events: ``view``, ``preview_loaded``, ``send_now_clicked``,
    ``preferences_form_opened``, ``frequency_changed_ui``,
    ``time_of_day_changed_ui``, ``demo_banner_shown``. Mutation events
    (``email_digest_sent`` / ``email_digest_preferences_changed``) are
    emitted by the dedicated endpoints under ``caregiver_portal``.
    """
    _gate_caregiver_actor(actor)
    note_parts: list[str] = []
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    if body.using_demo_data:
        note_parts.append("DEMO")
    note = "; ".join(note_parts) or body.event
    target_id = body.target_id or actor.actor_id
    event_id = _audit_worker(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
    )
    return DigestAuditEventOut(accepted=True, event_id=event_id)


__all__ = [
    "router",
    "PORTAL_SURFACE",
    "WORKER_SURFACE",
    "VALID_FREQUENCIES",
    "_get_or_create_preference",
    "_has_digest_consent_grant",
    "_build_preview_for_actor",
]
