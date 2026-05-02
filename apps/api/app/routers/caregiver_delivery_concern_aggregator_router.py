"""Caregiver Delivery Concern Aggregator control plane (2026-05-01).

Closes section I rec from the Channel Misconfiguration Detector launch
audit (#389). Companion router to
:mod:`app.workers.caregiver_delivery_concern_aggregator_worker`:

* ``GET  /api/v1/caregiver-delivery-concern-aggregator/status`` —
  clinic-scoped status snapshot (running, last_tick_at, threshold,
  window_hours, cooldown_hours, caregivers_in_clinic,
  caregivers_flagged_last_24h, last_error). Read by the Care Team
  Coverage "Caregiver channels" tab "Delivery concerns" sub-section.
* ``POST /api/v1/caregiver-delivery-concern-aggregator/tick`` — admin
  one-shot tick scoped to ``actor.clinic_id``. Returns the structured
  flag list + counts.
* ``GET /api/v1/caregiver-delivery-concern-aggregator/audit-events?surface=...``
  — paginated audit-event list scoped to the actor's clinic.
* ``POST /api/v1/caregiver-delivery-concern-aggregator/audit-events`` —
  page-level audit ingestion under
  ``target_type='caregiver_delivery_concern_aggregator'``.

All endpoints clinic-scoped. Cross-clinic clinicians/admins get no
visibility into other clinics — the status endpoint always returns the
actor's own ``clinic_id`` (or ``None`` for unattached actors), and
``tick`` is bounded to ``actor.clinic_id`` so a misbehaving admin
cannot probe another clinic's caregivers.
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
from app.persistence.models import AuditEventRecord
from app.workers.caregiver_delivery_concern_aggregator_worker import (
    FLAG_ACTION,
    PORTAL_SURFACE,
    WORKER_SURFACE,
    env_cooldown_hours,
    env_enabled,
    env_interval_sec,
    env_threshold,
    env_window_hours,
    get_worker,
)


router = APIRouter(
    prefix="/api/v1/caregiver-delivery-concern-aggregator",
    tags=["Caregiver Delivery Concern Aggregator"],
)
_log = logging.getLogger(__name__)


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


WORKER_DISCLAIMERS = [
    "Caregiver Delivery Concern Aggregator walks every delivery-concern "
    "audit row in a rolling 7-day window, groups them by "
    "(caregiver_user_id, clinic_id), and emits a HIGH-priority audit row "
    "when the per-caregiver count meets the configured threshold (default 3).",
    "Each flagged row carries priority=high so the Clinician Inbox aggregator "
    "(#354) auto-routes it into the admin's inbox feed without any new "
    "aggregation logic.",
    "Cooldown per (caregiver, clinic) is 72h by default — the worker does not "
    "re-flag the same caregiver within the cooldown window so the admin's "
    "inbox does not fill with duplicate rows on every tick.",
    "Cross-clinic data is hidden from clinicians (404 from /tick when the "
    "actor has no clinic_id). The status endpoint always returns the actor's "
    "own clinic_id; an admin cannot probe another clinic's caregivers.",
]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_write(actor: AuthenticatedActor) -> None:
    """Tick + admin debug requires ``reviewer`` minimum.

    The user spec mentioned ``quality_reviewer`` and ``clinic_admin``
    but the canonical role hierarchy in this codebase is
    ``guest < patient < technician < reviewer < clinician < admin``.
    We map ``quality_reviewer`` → ``reviewer`` and ``clinic_admin`` →
    ``admin``; both clear ``reviewer`` minimum.
    """
    require_minimum_role(actor, "reviewer")


def _scope_clinic(
    actor: AuthenticatedActor, clinic_id: Optional[str]
) -> Optional[str]:
    """Resolve the clinic_id to scope a query to.

    Mirrors the pattern in
    ``channel_misconfiguration_detector_router._scope_clinic`` — admins
    / supervisors / regulators may pass an explicit ``clinic_id``;
    clinicians always see their own clinic.
    """
    if actor.role in ("admin", "supervisor", "regulator"):
        return (clinic_id or actor.clinic_id) or None
    return actor.clinic_id


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for ``target_type=WORKER_SURFACE``."""
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"{WORKER_SURFACE}-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
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
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception(
            "caregiver_delivery_concern_aggregator self-audit skipped"
        )
    return event_id


# ── Schemas ─────────────────────────────────────────────────────────────────


class WorkerStatusOut(BaseModel):
    clinic_id: Optional[str] = None
    running: bool = False
    process_enabled_via_env: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    caregivers_in_clinic: int = 0
    caregivers_flagged_last_24h: int = 0
    last_tick_concerns_scanned: int = 0
    last_tick_caregivers_flagged: int = 0
    last_tick_errors: int = 0
    interval_sec: int = 3600
    threshold: int = 3
    window_hours: int = 168
    cooldown_hours: int = 72
    is_demo_view: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(WORKER_DISCLAIMERS)
    )


class FlaggedCaregiverOut(BaseModel):
    caregiver_user_id: str
    clinic_id: Optional[str] = None
    concern_count: int
    window_hours: int
    threshold: int
    flag_event_id: str


class TickOut(BaseModel):
    accepted: bool = True
    clinic_id: Optional[str] = None
    concerns_scanned: int = 0
    caregivers_evaluated: int = 0
    caregivers_flagged: int = 0
    skipped_cooldown: int = 0
    skipped_below_threshold: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    flagged_caregiver_ids: list[str] = Field(default_factory=list)
    flagged_audit_event_ids: list[str] = Field(default_factory=list)
    flagged: list[FlaggedCaregiverOut] = Field(default_factory=list)
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


class WorkerAuditIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    target_id: Optional[str] = Field(default=None, max_length=128)
    using_demo_data: Optional[bool] = False


class WorkerAuditOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/status", response_model=WorkerStatusOut)
def worker_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerStatusOut:
    """Clinic-scoped worker status snapshot."""
    _gate_read(actor)
    cid = _scope_clinic(actor, None)
    worker = get_worker()
    snap = worker.get_status_for_clinic(db, cid)
    is_demo = bool(cid and cid in _DEMO_CLINIC_IDS)
    if cid:
        _audit(
            db, actor,
            event="status_viewed",
            target_id=cid,
            note=(
                f"running={int(snap['running'])}; "
                f"caregivers={snap['caregivers_in_clinic']}; "
                f"flagged_24h={snap['caregivers_flagged_last_24h']}"
            ),
            using_demo_data=is_demo,
        )
    return WorkerStatusOut(
        clinic_id=cid,
        running=snap["running"],
        process_enabled_via_env=env_enabled(),
        last_tick_at=snap["last_tick_at"],
        last_error=snap["last_error"],
        last_error_at=snap["last_error_at"],
        caregivers_in_clinic=int(snap["caregivers_in_clinic"]),
        caregivers_flagged_last_24h=int(snap["caregivers_flagged_last_24h"]),
        last_tick_concerns_scanned=int(snap["last_tick_concerns_scanned"]),
        last_tick_caregivers_flagged=int(snap["last_tick_caregivers_flagged"]),
        last_tick_errors=int(snap["last_tick_errors"]),
        interval_sec=int(snap["interval_sec"]),
        threshold=int(snap["threshold"]),
        window_hours=int(snap["window_hours"]),
        cooldown_hours=int(snap["cooldown_hours"]),
        is_demo_view=is_demo,
    )


@router.post("/tick", response_model=TickOut)
def worker_tick(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TickOut:
    """Admin / quality-reviewer one-shot debug: run ONE worker tick
    synchronously, bounded to the actor's clinic.

    Returns the counts the worker would have audited plus the structured
    flag list. Useful for verifying delivery-concern aggregation without
    waiting for the next cron tick.
    """
    _gate_write(actor)
    cid = _scope_clinic(actor, None)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Reviewer must belong to a clinic to run an aggregator tick.",
            status_code=400,
        )
    worker = get_worker()
    # _scope_clinic always coerces to actor.clinic_id for non-admin/super
    # roles, and for admin we use the actor.clinic_id (no override path
    # exposed) so the scan stays bounded to the actor's clinic even if a
    # different clinic_id were ever wired in via a future query param.
    result = worker.tick(db, only_clinic_id=cid)
    is_demo = cid in _DEMO_CLINIC_IDS
    eid = _audit(
        db, actor,
        event="tick_clicked",
        target_id=cid,
        note=(
            f"concerns_scanned={result.concerns_scanned}; "
            f"caregivers_flagged={result.caregivers_flagged}; "
            f"skipped_cooldown={result.skipped_cooldown}; "
            f"skipped_below_threshold={result.skipped_below_threshold}; "
            f"errors={result.errors}"
        ),
        using_demo_data=is_demo,
    )
    return TickOut(
        accepted=True,
        clinic_id=cid,
        concerns_scanned=result.concerns_scanned,
        caregivers_evaluated=result.caregivers_evaluated,
        caregivers_flagged=result.caregivers_flagged,
        skipped_cooldown=result.skipped_cooldown,
        skipped_below_threshold=result.skipped_below_threshold,
        errors=result.errors,
        elapsed_ms=result.elapsed_ms,
        last_error=result.last_error,
        flagged_caregiver_ids=list(result.flagged_caregiver_ids),
        flagged_audit_event_ids=list(result.flagged_audit_event_ids),
        flagged=[
            FlaggedCaregiverOut(
                caregiver_user_id=fc.caregiver_user_id,
                clinic_id=fc.clinic_id,
                concern_count=fc.concern_count,
                window_hours=fc.window_hours,
                threshold=fc.threshold,
                flag_event_id=fc.flag_event_id,
            )
            for fc in result.flagged
        ],
        audit_event_id=eid,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=WORKER_SURFACE, max_length=64),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list.

    Honours both the worker surface (per-tick rows) and the per-flag
    portal surface. Clinicians see only their own actor's rows; admins
    see clinic-wide rows that carry the actor's clinic_id in the note.
    """
    _gate_read(actor)
    cid = _scope_clinic(actor, None)

    # Whitelist surface to avoid arbitrary user-supplied strings flowing
    # straight into the SQL filter.
    s = (surface or WORKER_SURFACE).strip().lower()
    if s not in {WORKER_SURFACE, PORTAL_SURFACE}:
        s = WORKER_SURFACE

    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.target_type == s
    )
    # When filtering the portal surface, scope to caregiver-side delivery
    # concern rows only — the portal surface is shared by lots of
    # caregiver actions and we only want the threshold-reached + resolved
    # rows in this list.
    if s == PORTAL_SURFACE:
        base = base.filter(
            AuditEventRecord.action.in_(
                [
                    FLAG_ACTION,
                    "caregiver_portal.delivery_concern_resolved",
                ]
            )
        )

    if cid:
        # Clinic-scope: rows whose note carries clinic_id={cid}. Worker-
        # side rows always carry the marker; page-level events from
        # ``_audit`` carry it via the audit-events POST handler when the
        # caller embeds it in the note. Self-rows from this actor are
        # also included as a fallback (admin debug clicks may not embed
        # the clinic marker every time).
        from sqlalchemy import or_  # noqa: PLC0415

        base = base.filter(
            or_(
                AuditEventRecord.note.like(f"%clinic_id={cid}%"),
                AuditEventRecord.actor_id == actor.actor_id,
                AuditEventRecord.target_id == cid,
            )
        )
    else:
        # Unattached actors only see their own self-events.
        base = base.filter(AuditEventRecord.actor_id == actor.actor_id)

    total = base.count()
    rows = (
        base.order_by(AuditEventRecord.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
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
        for r in rows
    ]
    return AuditEventsListOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        surface=s,
    )


@router.post("/audit-events", response_model=WorkerAuditOut)
def post_audit_event(
    body: WorkerAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerAuditOut:
    """Page-level audit ingestion under
    ``target_type='caregiver_delivery_concern_aggregator'``.

    Common events: ``view``, ``polling_tick``, ``status_viewed``,
    ``run_now_clicked``, ``filter_changed``, ``demo_banner_shown``.
    """
    _gate_read(actor)
    target = body.target_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    # Always embed clinic_id when known so the GET /audit-events
    # clinic-scope filter can find rows posted from the page.
    if actor.clinic_id:
        note_parts.append(f"clinic_id={actor.clinic_id}")
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    eid = _audit(
        db, actor,
        event=body.event,
        target_id=target,
        note=note,
        using_demo_data=bool(body.using_demo_data),
    )
    return WorkerAuditOut(accepted=True, event_id=eid)
