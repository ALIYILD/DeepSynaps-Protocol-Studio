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


# Per-Caregiver Channel Preference launch-audit (2026-05-01). The set of
# values a caregiver is allowed to put on ``preferred_channel`` — drawn
# from the canonical ADAPTER_CHANNEL taxonomy in oncall_delivery (#384)
# so a future SES adapter (or any new channel) automatically becomes
# legal here without code churn. ``None`` (NULL) is always legal — it
# means "no caregiver-level override; use the clinic chain as-is".
def _valid_preferred_channels() -> set[str]:
    """Return the whitelist of values acceptable on ``preferred_channel``.

    Reads :data:`oncall_delivery.ADAPTER_CHANNEL` lazily so future adapter
    additions take effect without router code changes. The mock channel
    is filtered out — caregivers must not be able to opt themselves into
    the test-only mock dispatch path.
    """
    from app.services.oncall_delivery import ADAPTER_CHANNEL  # noqa: PLC0415

    return {v for v in ADAPTER_CHANNEL.values() if v and v != "mock"}


def _resolve_caregiver_dispatch_chain(
    *,
    preferred_channel: Optional[str],
    clinic_chain: list[str],
) -> list[str]:
    """Resolve the final dispatch chain for a caregiver dispatch.

    Builds ``[caregiver.preferred_channel, *clinic_chain]`` with dedup:
    when the caregiver's preferred adapter is already first in the
    clinic chain we return ``clinic_chain`` unchanged; otherwise we
    insert the preferred adapter at the head and drop any later
    duplicate occurrences of it. NULL ``preferred_channel`` is a no-op —
    we return ``clinic_chain`` verbatim so deploys without per-caregiver
    overrides keep behaving exactly as before.

    The output is always a NEW list so callers can mutate it without
    surprising the caregiver row.
    """
    cleaned_chain: list[str] = [
        str(name).strip().lower()
        for name in (clinic_chain or [])
        if isinstance(name, str) and str(name).strip()
    ]
    if not preferred_channel:
        return list(cleaned_chain)
    p = str(preferred_channel).strip().lower()
    if not p:
        return list(cleaned_chain)
    out: list[str] = [p]
    for name in cleaned_chain:
        if name != p and name not in out:
            out.append(name)
    return out


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
        preferred_channel=None,
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
    # Per-Caregiver Channel Preference launch-audit (2026-05-01). NULL
    # means "no caregiver-level override; use the clinic chain as-is";
    # a non-null value comes from
    # :data:`oncall_delivery.ADAPTER_CHANNEL.values()` (e.g. ``email``,
    # ``sms``, ``slack``, ``pagerduty``).
    preferred_channel: Optional[str] = None
    created_at: str
    updated_at: str
    disclaimers: list[str] = Field(
        default_factory=lambda: list(CAREGIVER_DIGEST_DISCLAIMERS)
    )


# Sentinel that distinguishes "field absent from PUT body" from
# "explicit JSON null" so the caller can clear ``preferred_channel`` by
# posting ``{"preferred_channel": null}`` while leaving the field alone
# by omitting it entirely. Pydantic's default Optional handling collapses
# both cases into ``None``, which would prevent us from clearing the
# override after it is set.
_UNSET = object()


class DigestPreferenceIn(BaseModel):
    enabled: Optional[bool] = None
    frequency: Optional[str] = Field(default=None, max_length=16)
    time_of_day: Optional[str] = Field(default=None, max_length=8)
    # Per-Caregiver Channel Preference launch-audit (2026-05-01).
    # ``None`` is meaningful here (clear the override) so we use a custom
    # sentinel default to distinguish absent from explicit-null. The
    # validator coerces the raw value into one of:
    #   * "" / None  → ``None`` (clear the override)
    #   * a known channel from :data:`ADAPTER_CHANNEL.values()` → that value
    #   * anything else → 422
    preferred_channel: Optional[str] = Field(default=_UNSET, max_length=16)  # type: ignore[arg-type]

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

    @field_validator("preferred_channel")
    @classmethod
    def _validate_preferred_channel(cls, v):  # type: ignore[no-untyped-def]
        # Sentinel passes through unchanged → "field omitted from body".
        if v is _UNSET:
            return v
        if v is None:
            return None
        if not isinstance(v, str):
            raise ValueError("preferred_channel must be a string or null")
        v = v.strip().lower()
        if not v:
            return None
        valid = _valid_preferred_channels()
        if v not in valid:
            raise ValueError(
                f"preferred_channel must be one of {sorted(valid)} or null"
            )
        return v


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
        preferred_channel=getattr(row, "preferred_channel", None),
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
        from app.services.oncall_delivery import (  # noqa: PLC0415
            build_delivery_audit_note as _build_note_consent,
        )
        ev_id = _audit_portal(
            db,
            actor,
            event="email_digest_sent",
            target_id=actor.actor_id,
            note=_build_note_consent(
                unread_count=unread_count,
                recipient=recipient_email,
                delivery_status="queued",
                adapter_name=None,
                external_id=None,
                grant_id=None,
                delivery_note="no_active_grant_with_digest_scope",
                trigger="send_now",
                extra={
                    "consent_required": "true",
                    "reason": "no_active_grant_with_digest_scope",
                },
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
        from app.services.oncall_delivery import (  # noqa: PLC0415
            build_delivery_audit_note as _build_note_no_unread,
        )
        ev_id = _audit_portal(
            db,
            actor,
            event="email_digest_sent",
            target_id=actor.actor_id,
            note=_build_note_no_unread(
                unread_count=0,
                recipient=recipient_email,
                delivery_status="queued",
                adapter_name=None,
                external_id=None,
                grant_id=grant.id,
                delivery_note="no_unread_notifications",
                trigger="send_now",
                extra={"reason": "no_unread_notifications"},
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
        build_caregiver_digest_service,
        build_default_service,
        build_delivery_audit_note,
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

    # Per-Caregiver Channel Preference launch-audit (2026-05-01). Resolve
    # the caregiver's preferred adapter (channel chip → adapter name —
    # the channel chip taxonomy in ADAPTER_CHANNEL is bidirectional for
    # the four canonical adapters: email↔sendgrid, sms↔twilio,
    # slack↔slack, pagerduty↔pagerduty). When set, prepend it to the
    # clinic chain with dedup.
    pref_row = _get_or_create_preference(db, actor.actor_id)
    preferred_channel_value = getattr(pref_row, "preferred_channel", None)

    try:
        # Prefer the caregiver-digest chain (SendGrid + loud-signal
        # secondaries by default — the EscalationPolicy can override the
        # order per-clinic via surface='caregiver_digest'). Fall back to
        # the legacy email-only chain when the caregiver-digest builder
        # returns zero enabled adapters AND mock-mode is off, so the
        # caller still sees an honest ``queued`` instead of a silent
        # drop.
        service = build_caregiver_digest_service(clinic_id=None, db=db)
        # Apply the per-caregiver override on top of the resolved chain
        # (the policy's clinic chain plus any surface override). The
        # helper builds ``[caregiver_preferred, *clinic_chain]`` with
        # dedup. We rebuild the adapter list from the new order so the
        # dispatch loop tries the preferred channel first.
        if preferred_channel_value:
            from app.services.oncall_delivery import (  # noqa: PLC0415
                _build_adapters_for_order,
                _channel_to_adapter_name,
            )
            current_order = [
                getattr(a, "name", a.__class__.__name__.lower())
                for a in service.adapters
            ]
            preferred_adapter_name = _channel_to_adapter_name(
                preferred_channel_value
            )
            new_order = _resolve_caregiver_dispatch_chain(
                preferred_channel=preferred_adapter_name,
                clinic_chain=current_order,
            )
            rebuilt = _build_adapters_for_order(new_order)
            if rebuilt:
                service.adapters = rebuilt
        if (
            not service.get_enabled_adapters()
            and not is_mock_mode_enabled()
        ):
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
            note=build_delivery_audit_note(
                unread_count=unread_count,
                recipient=recipient_email,
                delivery_status="failed",
                adapter_name=None,
                external_id=None,
                grant_id=grant.id,
                delivery_note=f"delivery_service_raised: {exc.__class__.__name__}",
                trigger="send_now",
                extra={"error": exc.__class__.__name__},
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
        note=build_delivery_audit_note(
            unread_count=unread_count,
            recipient=recipient_email,
            delivery_status=delivery_status,
            adapter_name=adapter_name,
            external_id=external_id,
            grant_id=grant.id,
            delivery_note=delivery_note,
            trigger="send_now",
            extra={
                # Per-Caregiver Channel Preference launch-audit
                # (2026-05-01). Always emit the key, even when the
                # caregiver has no override, so the regulator transcript
                # can replay the resolved chain unambiguously.
                "caregiver_preferred_channel": (
                    preferred_channel_value or "null"
                ),
            },
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
    # Per-Caregiver Channel Preference launch-audit (2026-05-01). The
    # sentinel default lets a caller clear the override by posting an
    # explicit ``null`` while still leaving the field alone if it is
    # absent from the body. The validator already gated unknown values
    # against ``ADAPTER_CHANNEL.values()`` so the row write is safe.
    if body.preferred_channel is not _UNSET:
        new_pc = body.preferred_channel  # validated to None | known channel
        old_pc = getattr(row, "preferred_channel", None)
        if (old_pc or None) != (new_pc or None):
            changes.append(
                f"preferred_channel:{old_pc or 'null'}->{new_pc or 'null'}"
            )
            row.preferred_channel = new_pc

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


# ── Clinic Caregiver Channel Override launch-audit (2026-05-01) ─────────────
#
# Closes section I rec from the Per-Caregiver Channel Preference launch
# audit (#386): clinic admin needs a surface to (a) see every caregiver
# override in their clinic, (b) override misconfigured ones (e.g.
# caregiver picked SMS but clinic has no Twilio creds), and (c) the
# patient/caregiver UI gets an honest "Will dispatch via {channel}"
# preview before send.


def _gate_admin_write(actor: AuthenticatedActor) -> None:
    """Admin-only guard for the clinic-preference write endpoints."""
    from app.auth import require_minimum_role  # noqa: PLC0415

    require_minimum_role(actor, "admin")


def _gate_clinician_read(actor: AuthenticatedActor) -> None:
    """Clinician-minimum guard for clinic-preference read endpoints."""
    from app.auth import require_minimum_role  # noqa: PLC0415

    require_minimum_role(actor, "clinician")


def _is_admin_scope(actor: AuthenticatedActor) -> bool:
    return actor.role in ("admin", "supervisor", "regulator")


def _resolve_clinic_chain_for_caregiver(
    db: Session,
    *,
    clinic_id: Optional[str],
) -> list[str]:
    """Resolve the clinic-side dispatch chain for caregiver digest.

    Mirrors :func:`build_caregiver_digest_service`'s order resolution
    without instantiating adapters — we just need the ordered chain for
    preview purposes. Falls back to the canonical caregiver-digest chain
    when no per-clinic policy is configured.
    """
    from app.services.oncall_delivery import (  # noqa: PLC0415
        DEFAULT_ADAPTER_ORDER,
        OncallDeliveryService,
    )

    surface = "caregiver_digest"
    order = OncallDeliveryService._resolve_dispatch_order(clinic_id, surface, db)
    default_chain = [
        getattr(cls, "name", cls.__name__.lower())
        for cls in DEFAULT_ADAPTER_ORDER
    ]
    if order == default_chain:
        # No clinic policy AND no surface override — use the
        # caregiver-digest default (same as ``build_caregiver_digest_service``).
        order = ["sendgrid", "slack", "twilio", "pagerduty"]
    return order


def _adapter_enabled_map(db: Session, *, clinic_id: Optional[str]) -> dict[str, bool]:
    """Return a name→enabled map for every registered adapter.

    Reads from :meth:`OncallDeliveryService.describe_adapters` so the
    truth-source for "is this adapter actually configured" stays single.
    Mock mode (``DEEPSYNAPS_DELIVERY_MOCK=1``) flips every adapter to
    ``enabled=True`` from the caller's perspective so the preview is
    honest in demo / CI deploys.
    """
    from app.services.oncall_delivery import (  # noqa: PLC0415
        OncallDeliveryService,
        is_mock_mode_enabled,
    )

    service = OncallDeliveryService(clinic_id=clinic_id)
    rows = service.describe_adapters()
    out = {row["name"]: bool(row["enabled"]) for row in rows}
    if is_mock_mode_enabled():
        # Mock mode short-circuits dispatch in the service so every
        # registered adapter is effectively reachable. Reflect that here
        # so the preview banner renders the caregiver's preferred channel
        # instead of pretending it is misconfigured.
        for k in list(out.keys()):
            out[k] = True
    return out


def _resolve_dispatch_preview(
    db: Session,
    *,
    caregiver_user_id: str,
    clinic_id: Optional[str],
) -> dict:
    """Compute the dispatch-preview payload for a single caregiver.

    Returns a dict with::

        resolved_chain          [adapter_name, ...]            # caregiver_pref + clinic_chain dedup
        will_dispatch_via       email|sms|slack|pagerduty|-    # first ENABLED chip in resolved_chain
        will_dispatch_adapter   sendgrid|twilio|...|None       # adapter-name parallel
        honored_caregiver_preference   bool                    # caregiver pref's adapter is enabled
        clinic_chain            [adapter_name, ...]
        caregiver_preferred_channel    chip|None
        caregiver_preferred_adapter    adapter_name|None
        adapter_available       {adapter_name: bool}
        is_mock_mode            bool

    The output is intentionally adapter-name-keyed (sendgrid / twilio /
    slack / pagerduty); the channel chip (email / sms / ...) is exposed
    via ``will_dispatch_via`` so the UI doesn't have to maintain its own
    adapter→chip mapping. ``honored_caregiver_preference`` is False when
    the caregiver picked a channel whose adapter is NOT enabled — exactly
    the misconfigured-SMS-without-Twilio scenario.
    """
    from app.services.oncall_delivery import (  # noqa: PLC0415
        adapter_channel,
        is_mock_mode_enabled,
        _channel_to_adapter_name,
    )

    pref_row = (
        db.query(CaregiverDigestPreference)
        .filter(CaregiverDigestPreference.caregiver_user_id == caregiver_user_id)
        .first()
    )
    preferred_chip = (
        getattr(pref_row, "preferred_channel", None) if pref_row is not None else None
    )
    preferred_adapter = _channel_to_adapter_name(preferred_chip)

    clinic_chain = _resolve_clinic_chain_for_caregiver(db, clinic_id=clinic_id)
    resolved_chain = _resolve_caregiver_dispatch_chain(
        preferred_channel=preferred_adapter,
        clinic_chain=clinic_chain,
    )

    adapter_avail = _adapter_enabled_map(db, clinic_id=clinic_id)
    will_adapter: Optional[str] = None
    for name in resolved_chain:
        if adapter_avail.get(name, False):
            will_adapter = name
            break
    will_chip = adapter_channel(will_adapter) if will_adapter else "-"
    honored = (
        bool(preferred_adapter)
        and adapter_avail.get(preferred_adapter or "", False)
        and resolved_chain[:1] == [preferred_adapter]
        and will_adapter == preferred_adapter
    )
    if not preferred_adapter:
        # No caregiver-side override → "honored" is vacuously True (the
        # clinic chain runs as the admin configured it). The UI uses this
        # to pick the green vs. amber banner colour, so we report True
        # only when a preference exists AND it survived to dispatch.
        honored = False
    return {
        "resolved_chain": list(resolved_chain),
        "will_dispatch_via": will_chip,
        "will_dispatch_adapter": will_adapter,
        "honored_caregiver_preference": honored,
        "clinic_chain": list(clinic_chain),
        "caregiver_preferred_channel": preferred_chip,
        "caregiver_preferred_adapter": preferred_adapter,
        "adapter_available": adapter_avail,
        "is_mock_mode": is_mock_mode_enabled(),
    }


def _list_clinic_caregivers(
    db: Session, *, clinic_id: str
) -> list[CaregiverDigestPreference]:
    """List every CaregiverDigestPreference whose caregiver belongs to ``clinic_id``.

    Joins CaregiverDigestPreference → User on caregiver_user_id == user.id
    and filters by user.clinic_id. Cross-clinic rows are excluded — the
    caller relies on this for IDOR safety.
    """
    rows = (
        db.query(CaregiverDigestPreference, User)
        .join(User, User.id == CaregiverDigestPreference.caregiver_user_id)
        .filter(User.clinic_id == clinic_id)
        .order_by(CaregiverDigestPreference.updated_at.desc())
        .all()
    )
    out: list[CaregiverDigestPreference] = []
    for pref, _user in rows:
        out.append(pref)
    return out


# ── Schemas: clinic-side ────────────────────────────────────────────────────


class ClinicCaregiverPreferenceRow(BaseModel):
    caregiver_user_id: str
    caregiver_email: Optional[str] = None
    caregiver_display_name: Optional[str] = None
    enabled: bool
    frequency: str
    time_of_day: str
    last_sent_at: Optional[str] = None
    preferred_channel: Optional[str] = None
    resolved_chain: list[str] = Field(default_factory=list)
    will_dispatch_via: str = "-"
    will_dispatch_adapter: Optional[str] = None
    honored_caregiver_preference: bool = False
    clinic_chain: list[str] = Field(default_factory=list)
    adapter_available: dict[str, bool] = Field(default_factory=dict)
    is_misconfigured: bool = False  # caregiver picked a channel whose adapter is disabled
    updated_at: str


class ClinicCaregiverPreferencesOut(BaseModel):
    clinic_id: Optional[str] = None
    items: list[ClinicCaregiverPreferenceRow] = Field(default_factory=list)
    is_mock_mode: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(CAREGIVER_DIGEST_DISCLAIMERS)
    )


class ClinicAdminOverrideIn(BaseModel):
    note: str = Field(..., min_length=1, max_length=512)


class ClinicAdminOverrideOut(BaseModel):
    accepted: bool = True
    caregiver_user_id: str
    previous_preferred_channel: Optional[str] = None
    new_preferred_channel: Optional[str] = None
    audit_event_id: str


class PreviewDispatchOut(BaseModel):
    caregiver_user_id: str
    resolved_chain: list[str] = Field(default_factory=list)
    will_dispatch_via: str = "-"
    will_dispatch_adapter: Optional[str] = None
    honored_caregiver_preference: bool = False
    clinic_chain: list[str] = Field(default_factory=list)
    caregiver_preferred_channel: Optional[str] = None
    caregiver_preferred_adapter: Optional[str] = None
    adapter_available: dict[str, bool] = Field(default_factory=dict)
    is_mock_mode: bool = False
    audit_event_id: Optional[str] = None


# ── Endpoints: clinic-side ──────────────────────────────────────────────────


@router.get(
    "/clinic-preferences",
    response_model=ClinicCaregiverPreferencesOut,
)
def list_clinic_preferences(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ClinicCaregiverPreferencesOut:
    """Admin / clinician read: list every caregiver preference in this clinic.

    Returns one row per caregiver (User.clinic_id == actor.clinic_id) with
    the resolved dispatch chain + honesty flag (``is_misconfigured`` is
    True when the caregiver picked a channel whose adapter is disabled).

    Cross-clinic safety: rows are filtered by joining on User.clinic_id;
    no cross-clinic CaregiverDigestPreference can be returned.
    """
    _gate_clinician_read(actor)
    cid = actor.clinic_id
    if not cid:
        # Actor has no clinic_id (e.g. unattached admin). Return empty.
        return ClinicCaregiverPreferencesOut(clinic_id=None, items=[])

    rows = _list_clinic_caregivers(db, clinic_id=cid)
    user_lookup: dict[str, User] = {
        u.id: u
        for u in db.query(User)
        .filter(User.id.in_([r.caregiver_user_id for r in rows] or [""]))
        .all()
    }

    from app.services.oncall_delivery import is_mock_mode_enabled  # noqa: PLC0415

    items: list[ClinicCaregiverPreferenceRow] = []
    for r in rows:
        preview = _resolve_dispatch_preview(
            db, caregiver_user_id=r.caregiver_user_id, clinic_id=cid
        )
        u = user_lookup.get(r.caregiver_user_id)
        is_misc = bool(
            preview["caregiver_preferred_adapter"]
            and not preview["adapter_available"].get(
                preview["caregiver_preferred_adapter"] or "", False
            )
        )
        items.append(
            ClinicCaregiverPreferenceRow(
                caregiver_user_id=r.caregiver_user_id,
                caregiver_email=getattr(u, "email", None),
                caregiver_display_name=getattr(u, "display_name", None),
                enabled=bool(r.enabled),
                frequency=r.frequency,
                time_of_day=r.time_of_day,
                last_sent_at=r.last_sent_at,
                preferred_channel=getattr(r, "preferred_channel", None),
                resolved_chain=preview["resolved_chain"],
                will_dispatch_via=preview["will_dispatch_via"],
                will_dispatch_adapter=preview["will_dispatch_adapter"],
                honored_caregiver_preference=preview["honored_caregiver_preference"],
                clinic_chain=preview["clinic_chain"],
                adapter_available=preview["adapter_available"],
                is_misconfigured=is_misc,
                updated_at=r.updated_at,
            )
        )

    _audit_portal(
        db,
        actor,
        event="clinic_preferences_view",
        target_id=cid,
        note=f"clinic={cid}; rows={len(items)}",
    )

    return ClinicCaregiverPreferencesOut(
        clinic_id=cid,
        items=items,
        is_mock_mode=is_mock_mode_enabled(),
    )


@router.post(
    "/clinic-preferences/{caregiver_user_id}/admin-override",
    response_model=ClinicAdminOverrideOut,
)
def admin_override_caregiver_channel(
    caregiver_user_id: str,
    body: ClinicAdminOverrideIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ClinicAdminOverrideOut:
    """Admin-only: pin a caregiver back to the clinic chain.

    Sets ``preferred_channel=null`` so subsequent dispatches use the
    clinic chain as configured. Emits ``caregiver_portal.admin_override_channel``
    with the admin's note. Cross-clinic 404 — admin can only override
    caregivers in their own clinic.
    """
    _gate_admin_write(actor)
    cid = actor.clinic_id
    if not cid:
        raise ApiServiceError(
            code="forbidden",
            message="Admin actor has no clinic_id; cannot override caregiver preferences.",
            status_code=403,
        )

    # IDOR gate: caregiver must belong to admin's clinic.
    target_user = db.query(User).filter_by(id=caregiver_user_id).first()
    if target_user is None or target_user.clinic_id != cid:
        raise ApiServiceError(
            code="not_found",
            message="Caregiver not found in this clinic.",
            status_code=404,
        )

    pref = _get_or_create_preference(db, caregiver_user_id)
    previous = getattr(pref, "preferred_channel", None)

    pref.preferred_channel = None
    pref.updated_at = _now_iso()
    try:
        db.commit()
        db.refresh(pref)
    except Exception:  # pragma: no cover — defensive
        db.rollback()
        raise

    note = (
        f"caregiver={caregiver_user_id}; "
        f"old={previous or 'null'}->new=null; "
        f"reason={body.note[:240]}"
    )
    ev_id = _audit_portal(
        db,
        actor,
        event="admin_override_channel",
        target_id=caregiver_user_id,
        note=note,
    )

    return ClinicAdminOverrideOut(
        caregiver_user_id=caregiver_user_id,
        previous_preferred_channel=previous,
        new_preferred_channel=None,
        audit_event_id=ev_id,
    )


@router.get("/preview-dispatch", response_model=PreviewDispatchOut)
def preview_dispatch(
    caregiver_user_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PreviewDispatchOut:
    """Return the resolved dispatch chain + first-enabled adapter.

    * Caregiver-side actor (no ``caregiver_user_id`` query) → preview their
      OWN dispatch chain. Always allowed (any non-guest role) — the
      caregiver views their own preference.
    * Admin / clinician with ``caregiver_user_id`` query → preview that
      caregiver's chain, scoped to ``actor.clinic_id``. Cross-clinic 404.

    Emits ``caregiver_portal.preview_dispatch_viewed`` so the regulator
    transcript joins every UI render of the banner to the resolved chain
    that was shown.
    """
    _gate_caregiver_actor(actor)

    if caregiver_user_id and caregiver_user_id != actor.actor_id:
        # Caller is asking about ANOTHER user. Must be clinician+ AND
        # share clinic_id with the target.
        if not _is_admin_scope(actor) and actor.role != "clinician":
            raise ApiServiceError(
                code="forbidden",
                message="Only clinicians and admins can preview another caregiver.",
                status_code=403,
            )
        cid = actor.clinic_id
        target = db.query(User).filter_by(id=caregiver_user_id).first()
        if target is None or not cid or target.clinic_id != cid:
            raise ApiServiceError(
                code="not_found",
                message="Caregiver not found in this clinic.",
                status_code=404,
            )
        target_user_id = caregiver_user_id
        clinic_id_for_preview: Optional[str] = cid
    else:
        # Actor-side preview.
        target_user_id = actor.actor_id
        clinic_id_for_preview = actor.clinic_id

    preview = _resolve_dispatch_preview(
        db,
        caregiver_user_id=target_user_id,
        clinic_id=clinic_id_for_preview,
    )

    ev_id = _audit_portal(
        db,
        actor,
        event="preview_dispatch_viewed",
        target_id=target_user_id,
        note=(
            f"caregiver={target_user_id}; "
            f"resolved={','.join(preview['resolved_chain'])[:200]}; "
            f"will_dispatch_via={preview['will_dispatch_via']}; "
            f"honored={'1' if preview['honored_caregiver_preference'] else '0'}"
        ),
    )

    return PreviewDispatchOut(
        caregiver_user_id=target_user_id,
        resolved_chain=preview["resolved_chain"],
        will_dispatch_via=preview["will_dispatch_via"],
        will_dispatch_adapter=preview["will_dispatch_adapter"],
        honored_caregiver_preference=preview["honored_caregiver_preference"],
        clinic_chain=preview["clinic_chain"],
        caregiver_preferred_channel=preview["caregiver_preferred_channel"],
        caregiver_preferred_adapter=preview["caregiver_preferred_adapter"],
        adapter_available=preview["adapter_available"],
        is_mock_mode=preview["is_mock_mode"],
        audit_event_id=ev_id,
    )


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
    "_resolve_caregiver_dispatch_chain",
    "_resolve_clinic_chain_for_caregiver",
    "_resolve_dispatch_preview",
    "_adapter_enabled_map",
]
