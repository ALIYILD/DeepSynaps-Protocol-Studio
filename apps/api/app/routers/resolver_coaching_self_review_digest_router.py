"""Resolver Coaching Self-Review Digest control plane (DCRO3, 2026-05-02).

Closes section I rec from the Resolver Coaching Inbox (DCRO2, #397).
Companion router to
:mod:`app.workers.resolver_coaching_self_review_digest_worker`:

* ``GET    /api/v1/resolver-coaching-self-review-digest/my-preference``
  Resolver reads their OWN preference row (creates a default
  ``opted_in=False`` row when none exists). Admin can READ another
  resolver's row via ``?resolver_user_id=`` (admin-gated).
* ``PUT    /api/v1/resolver-coaching-self-review-digest/my-preference``
  Resolver updates their OWN preference row only. Admins CANNOT edit
  on behalf of resolvers (privacy gate — coaching preferences are a
  resolver-led self-correction artifact).
* ``GET    /api/v1/resolver-coaching-self-review-digest/status``
  Worker status snapshot + ENABLED env flag. Clinician minimum.
* ``POST   /api/v1/resolver-coaching-self-review-digest/tick``
  Admin-only synchronous one-shot tick, scoped to actor's clinic.
  Optional ``{resolver_user_id: int}`` further bounds to a single
  resolver. Cross-clinic 404.
* ``GET    /api/v1/resolver-coaching-self-review-digest/audit-events``
  Paginated, scoped to actor's clinic. Clinician minimum.

All endpoints clinic-scoped. Cross-clinic clinicians/admins get no
visibility into other clinics — every preference / tick / audit-events
read is bounded by ``actor.clinic_id``.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AuditEventRecord,
    ResolverCoachingDigestPreference,
)
from app.workers.resolver_coaching_self_review_digest_worker import (
    DISPATCH_ACTION,
    KNOWN_CHANNELS,
    WORKER_SURFACE,
    env_cooldown_hours,
    env_enabled,
    env_interval_hours,
    env_min_wrong_calls,
    get_worker,
)


router = APIRouter(
    prefix="/api/v1/resolver-coaching-self-review-digest",
    tags=["Resolver Coaching Self-Review Digest"],
)
_log = logging.getLogger(__name__)


WORKER_DISCLAIMERS = [
    "Resolver Coaching Self-Review Digest is OPT-IN. Default off both at the "
    "system level (RESOLVER_COACHING_DIGEST_ENABLED=False) and at the "
    "per-resolver level (ResolverCoachingDigestPreference.opted_in=False).",
    "Cooldown per (resolver, clinic) is 144h (6 days) by default — the "
    "worker does not re-dispatch the same resolver within the cooldown "
    "window, preventing weekly-overlap dispatch when the cron drifts.",
    "Channel resolution chain: 1) resolver's preference.preferred_channel; "
    "2) clinic EscalationPolicy.dispatch_order[0]; 3) email fallback. "
    "All three layers are defensive — any DB / JSON failure quietly falls "
    "back to email.",
    "Cross-clinic data is hidden from clinicians and admins — the tick "
    "endpoint is bounded to actor.clinic_id and every preference read "
    "rejects clinic mismatches with 404.",
    "Audit row priority is INFO (not high) — this is a self-improvement "
    "nudge, not an alert. The Clinician Inbox HIGH-priority predicate "
    "explicitly skips dispatched rows.",
]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_my_pref(actor: AuthenticatedActor) -> None:
    """Read/write own preference: any logged-in user is fine.

    The endpoint hard-scopes to ``actor.actor_id`` so a guest token can
    technically reach the route but only ever touches their own (empty)
    row. We keep the role floor at ``patient`` so an unauthenticated
    request still 401s.
    """
    require_minimum_role(actor, "patient")


def _gate_status(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_admin(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    if actor.role in {"admin", "clinician", "reviewer"}:
        return actor.role
    return "reviewer"


def _emit_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
    role: Optional[str] = None,
) -> str:
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{WORKER_SURFACE}-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(target_id) or actor.actor_id,
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.{event}",
            role=role or _safe_audit_role(actor),
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception("DCRO3 audit emit skipped")
    return eid


def _validate_channel(channel: Optional[str]) -> Optional[str]:
    """Return the canonical channel string or raise 422.

    ``None`` / ``""`` / ``"auto"`` all map to ``None`` (use chain).
    """
    if channel is None:
        return None
    c = str(channel).strip().lower()
    if c in {"", "auto", "null", "none"}:
        return None
    if c not in KNOWN_CHANNELS:
        raise ApiServiceError(
            code="invalid_channel",
            message=(
                "preferred_channel must be one of "
                f"{sorted(KNOWN_CHANNELS)} or 'auto'/null."
            ),
            status_code=422,
        )
    return c


def _get_or_create_pref(
    db: Session,
    *,
    resolver_user_id: str,
    clinic_id: str,
) -> ResolverCoachingDigestPreference:
    """Return the (resolver, clinic) preference row, creating a default
    ``opted_in=False`` row when none exists.

    The default row is the honest "I haven't opted in" representation
    — the GET endpoint always returns SOMETHING so the UI can render
    the toggle in its true state without a 404 round-trip.
    """
    row = (
        db.query(ResolverCoachingDigestPreference)
        .filter(
            ResolverCoachingDigestPreference.resolver_user_id == resolver_user_id,
            ResolverCoachingDigestPreference.clinic_id == clinic_id,
        )
        .one_or_none()
    )
    if row is not None:
        return row
    now = datetime.now(timezone.utc).isoformat()
    new_id = (
        f"rcdpref-{resolver_user_id}-"
        f"{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:6]}"
    )[:64]
    row = ResolverCoachingDigestPreference(
        id=new_id,
        resolver_user_id=resolver_user_id,
        clinic_id=clinic_id,
        opted_in=False,
        preferred_channel=None,
        last_dispatched_at=None,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except Exception:  # pragma: no cover - defensive
        db.rollback()
    return row


# ── Schemas ─────────────────────────────────────────────────────────────────


class PreferenceOut(BaseModel):
    resolver_user_id: str
    clinic_id: str
    opted_in: bool = False
    preferred_channel: Optional[str] = None
    last_dispatched_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Honest worker-state hint so the UI can render the
    # "Worker is currently disabled at the system level" disclaimer.
    worker_enabled_via_env: bool = False


class PreferenceUpdateIn(BaseModel):
    opted_in: bool = Field(..., description="Resolver's own opt-in flag")
    preferred_channel: Optional[str] = Field(
        default=None,
        description=(
            "One of slack / twilio / sendgrid / pagerduty / email, OR "
            "'auto' / null to inherit the clinic EscalationPolicy chain."
        ),
    )


class WorkerStatusOut(BaseModel):
    clinic_id: Optional[str] = None
    running: bool = False
    enabled: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    opted_in_resolvers_in_clinic: int = 0
    digests_dispatched_last_7d: int = 0
    last_tick_resolvers_scanned: int = 0
    last_tick_digests_dispatched: int = 0
    last_tick_errors: int = 0
    interval_hours: int = 168
    cooldown_hours: int = 144
    min_wrong_calls: int = 1
    disclaimers: list[str] = Field(
        default_factory=lambda: list(WORKER_DISCLAIMERS)
    )


class TickIn(BaseModel):
    resolver_user_id: Optional[str] = Field(
        default=None,
        description="Optional — restrict the tick to a single resolver in actor's clinic.",
    )


class TickOut(BaseModel):
    accepted: bool = True
    clinic_id: Optional[str] = None
    resolvers_scanned: int = 0
    digests_dispatched: int = 0
    skipped_opted_out: int = 0
    skipped_cooldown: int = 0
    skipped_below_threshold: int = 0
    skipped_all_self_reviewed: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    dispatched_resolver_ids: list[str] = Field(default_factory=list)
    dispatched_audit_event_ids: list[str] = Field(default_factory=list)
    audit_event_id: str


class AuditEventOut(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: str
    actor_id: str
    note: str
    created_at: str


class AuditEventsListOut(BaseModel):
    items: list[AuditEventOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    surface: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/my-preference", response_model=PreferenceOut)
def get_my_preference(
    resolver_user_id: Optional[str] = Query(default=None, max_length=128),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PreferenceOut:
    """Return the calling resolver's preference row.

    Privacy / admin notes:

    * Default behaviour: returns the calling resolver's OWN row,
      creating a default ``opted_in=False`` row when none exists.
    * Admins MAY pass ``?resolver_user_id=...`` to READ another
      resolver's row in the same clinic. Admins CANNOT pass it to a
      PUT — the write endpoint is hard-scoped to ``actor.actor_id``.
    """
    _gate_my_pref(actor)
    cid = _scope_clinic(actor)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Resolver must belong to a clinic to manage digest preferences.",
            status_code=400,
        )

    target_resolver = actor.actor_id
    if resolver_user_id and resolver_user_id != actor.actor_id:
        # Admin override — read-only path. Anyone else gets 403.
        _gate_admin(actor)
        target_resolver = resolver_user_id

    row = _get_or_create_pref(
        db, resolver_user_id=target_resolver, clinic_id=cid
    )

    return PreferenceOut(
        resolver_user_id=row.resolver_user_id,
        clinic_id=row.clinic_id,
        opted_in=bool(row.opted_in),
        preferred_channel=row.preferred_channel,
        last_dispatched_at=row.last_dispatched_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        worker_enabled_via_env=env_enabled(),
    )


@router.put("/my-preference", response_model=PreferenceOut)
def update_my_preference(
    body: PreferenceUpdateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PreferenceOut:
    """Update the calling resolver's OWN preference row.

    Privacy gate: admins cannot edit on behalf of resolvers — this
    endpoint is hard-scoped to ``actor.actor_id``. There is no
    ``?resolver_user_id=`` override here (deliberate; coaching
    preferences are a resolver-led self-correction artifact).
    """
    _gate_my_pref(actor)
    cid = _scope_clinic(actor)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Resolver must belong to a clinic to manage digest preferences.",
            status_code=400,
        )

    channel = _validate_channel(body.preferred_channel)

    row = _get_or_create_pref(
        db, resolver_user_id=actor.actor_id, clinic_id=cid
    )
    row.opted_in = bool(body.opted_in)
    row.preferred_channel = channel
    now = datetime.now(timezone.utc).isoformat()
    row.updated_at = now
    try:
        db.commit()
        db.refresh(row)
    except Exception:  # pragma: no cover - defensive
        db.rollback()

    _emit_audit(
        db,
        actor,
        event="preference_updated",
        target_id=actor.actor_id,
        note=(
            f"clinic_id={cid}; "
            f"resolver_user_id={actor.actor_id}; "
            f"opted_in={'yes' if row.opted_in else 'no'}; "
            f"preferred_channel={row.preferred_channel or 'auto'}"
        ),
    )

    return PreferenceOut(
        resolver_user_id=row.resolver_user_id,
        clinic_id=row.clinic_id,
        opted_in=bool(row.opted_in),
        preferred_channel=row.preferred_channel,
        last_dispatched_at=row.last_dispatched_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        worker_enabled_via_env=env_enabled(),
    )


@router.get("/status", response_model=WorkerStatusOut)
def worker_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerStatusOut:
    """Clinic-scoped worker status snapshot. Clinician minimum."""
    _gate_status(actor)
    cid = _scope_clinic(actor)
    worker = get_worker()
    snap = worker.get_status_for_clinic(db, cid)
    return WorkerStatusOut(
        clinic_id=cid,
        running=bool(snap["running"]),
        enabled=bool(snap["enabled"]),
        last_tick_at=snap["last_tick_at"],
        last_error=snap["last_error"],
        last_error_at=snap["last_error_at"],
        opted_in_resolvers_in_clinic=int(snap["opted_in_resolvers_in_clinic"]),
        digests_dispatched_last_7d=int(snap["digests_dispatched_last_7d"]),
        last_tick_resolvers_scanned=int(snap["last_tick_resolvers_scanned"]),
        last_tick_digests_dispatched=int(snap["last_tick_digests_dispatched"]),
        last_tick_errors=int(snap["last_tick_errors"]),
        interval_hours=int(snap["interval_hours"]),
        cooldown_hours=int(snap["cooldown_hours"]),
        min_wrong_calls=int(snap["min_wrong_calls"]),
    )


@router.post("/tick", response_model=TickOut)
def worker_tick(
    body: Optional[TickIn] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TickOut:
    """Admin-only one-shot tick, scoped to actor's clinic.

    Optional body ``{resolver_user_id}`` further bounds to a single
    resolver in that clinic. Cross-clinic 404: when the body's
    ``resolver_user_id`` does not have a preference row in the actor's
    clinic, the tick returns ``404`` (canonical hide-existence pattern).

    Note that the worker's tick path runs even when
    ``RESOLVER_COACHING_DIGEST_ENABLED=False`` — the env flag only
    gates the auto-scheduled loop, not the admin's manual invocation.
    """
    _gate_admin(actor)
    cid = _scope_clinic(actor)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to run a digest tick.",
            status_code=400,
        )

    only_resolver = None
    if body is not None and body.resolver_user_id:
        only_resolver = str(body.resolver_user_id).strip()
        # Cross-clinic 404: the resolver must have a preference row in
        # the actor's clinic for the tick to be meaningful. Hide the
        # existence of cross-clinic resolvers behind a 404.
        row = (
            db.query(ResolverCoachingDigestPreference)
            .filter(
                ResolverCoachingDigestPreference.resolver_user_id == only_resolver,
                ResolverCoachingDigestPreference.clinic_id == cid,
            )
            .one_or_none()
        )
        if row is None:
            raise ApiServiceError(
                code="not_found",
                message="Resolver preference row not found in this clinic.",
                status_code=404,
            )

    worker = get_worker()
    result = worker.tick(
        db,
        only_clinic_id=cid,
        only_resolver_user_id=only_resolver,
    )
    eid = _emit_audit(
        db,
        actor,
        event="tick_clicked",
        target_id=cid,
        note=(
            f"clinic_id={cid}; "
            f"resolvers_scanned={result.resolvers_scanned}; "
            f"digests_dispatched={result.digests_dispatched}; "
            f"only_resolver={only_resolver or '-'}; "
            f"errors={result.errors}"
        ),
    )
    return TickOut(
        accepted=True,
        clinic_id=cid,
        resolvers_scanned=result.resolvers_scanned,
        digests_dispatched=result.digests_dispatched,
        skipped_opted_out=result.skipped_opted_out,
        skipped_cooldown=result.skipped_cooldown,
        skipped_below_threshold=result.skipped_below_threshold,
        skipped_all_self_reviewed=result.skipped_all_self_reviewed,
        errors=result.errors,
        elapsed_ms=result.elapsed_ms,
        last_error=result.last_error,
        dispatched_resolver_ids=list(result.dispatched_resolver_ids),
        dispatched_audit_event_ids=list(result.dispatched_audit_event_ids),
        audit_event_id=eid,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=WORKER_SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Paginated audit-event list, scoped to actor's clinic.

    Cross-clinic safety: rows are filtered by the canonical
    ``clinic_id={cid}`` substring needle so cross-clinic dispatched /
    tick rows never leak. Worker-emitted tick rows whose target_id is
    ``"all"`` are excluded when an actor has a clinic_id (the umbrella
    rows belong to the worker process, not to a specific clinic).
    """
    _gate_status(actor)
    cid = _scope_clinic(actor)

    s = (surface or WORKER_SURFACE).strip().lower()
    if s != WORKER_SURFACE:
        s = WORKER_SURFACE

    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.target_type == s,
    )

    if cid:
        # Only include rows whose note carries the actor's clinic_id
        # OR whose target_id matches actor's clinic_id directly. We
        # apply this filter in Python because the substring needle in
        # the note column doesn't translate to a clean SQL LIKE
        # (clinic_id can collide with subsequent k=v fragments).
        rows = base.order_by(AuditEventRecord.id.desc()).all()
        needle = f"clinic_id={cid}"
        scoped = [
            r for r in rows
            if needle in (r.note or "") or (r.target_id == cid)
        ]
        total = len(scoped)
        page = scoped[offset : offset + limit]
        items = [
            AuditEventOut(
                event_id=r.event_id,
                target_id=r.target_id or "",
                target_type=r.target_type or "",
                action=r.action or "",
                role=r.role or "",
                actor_id=r.actor_id or "",
                note=r.note or "",
                created_at=r.created_at or "",
            )
            for r in page
        ]
        return AuditEventsListOut(
            items=items, total=total, limit=limit, offset=offset, surface=s
        )

    # No clinic — return empty so unattached actors can't probe.
    return AuditEventsListOut(
        items=[], total=0, limit=limit, offset=offset, surface=s
    )


__all__ = [
    "router",
    "DISPATCH_ACTION",
    "WORKER_DISCLAIMERS",
]
