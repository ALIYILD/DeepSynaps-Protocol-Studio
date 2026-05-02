"""Channel Misconfiguration Detector control plane (2026-05-01).

Closes section I rec from the Clinic Caregiver Channel Override launch
audit (#387). Companion router to
:mod:`app.workers.channel_misconfiguration_detector_worker`:

* ``GET  /api/v1/channel-misconfiguration-detector/status`` — clinic-
  scoped status snapshot (running, last_tick_at,
  caregivers_in_clinic, misconfigs_flagged_last_24h, last_error).
  Read by the Care Team Coverage "Caregiver channels" tab.
* ``POST /api/v1/channel-misconfiguration-detector/tick-once`` — admin
  only debug. Runs ONE tick synchronously bounded to the actor's
  clinic and returns the counts the worker would have audited.
* ``POST /api/v1/channel-misconfiguration-detector/audit-events`` —
  page-level audit ingestion under
  ``target_type='channel_misconfiguration_detector'``.

All endpoints clinic-scoped. Cross-clinic clinicians/admins get no
visibility into other clinics — the status endpoint always returns
the actor's own ``clinic_id`` (or ``None`` for unattached actors), and
``tick-once`` is bounded to ``actor.clinic_id`` so a misbehaving admin
cannot probe another clinic's caregivers.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.workers.channel_misconfiguration_detector_worker import (
    WORKER_SURFACE,
    env_cooldown_hours,
    env_enabled,
    env_interval_sec,
    env_staleness_hours,
    get_worker,
)


router = APIRouter(
    prefix="/api/v1/channel-misconfiguration-detector",
    tags=["Channel Misconfiguration Detector"],
)
_log = logging.getLogger(__name__)


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


WORKER_DISCLAIMERS = [
    "Channel-Misconfiguration Detector walks every CaregiverDigestPreference "
    "row once per 24h and emits a HIGH-priority audit row when the caregiver's "
    "preferred channel adapter is unavailable AND no successful delivery has "
    "been observed in the last 24h.",
    "Each flagged row carries priority=high so the Clinician Inbox aggregator "
    "(#354) auto-routes it into the admin's inbox feed without any new "
    "aggregation logic.",
    "Cooldown per (caregiver, clinic) is 24h by default — the worker does not "
    "re-flag the same misconfig within the cooldown window so the admin's "
    "inbox does not fill with duplicate rows on every tick.",
    "Cross-clinic data is hidden from clinicians (404 from /tick-once when the "
    "actor has no clinic_id). The status endpoint always returns the actor's "
    "own clinic_id; an admin cannot probe another clinic's caregivers.",
]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_write(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _scope_clinic(
    actor: AuthenticatedActor, clinic_id: Optional[str]
) -> Optional[str]:
    """Resolve the clinic_id to scope a query to.

    Mirrors the pattern in ``auto_page_worker_router._scope_clinic`` —
    admins / supervisors / regulators may pass an explicit ``clinic_id``;
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
        _log.exception("channel_misconfiguration_detector self-audit skipped")
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
    misconfigs_flagged_last_24h: int = 0
    last_tick_caregivers_scanned: int = 0
    last_tick_misconfigs_flagged: int = 0
    last_tick_errors: int = 0
    interval_sec: int = 86400
    cooldown_hours: int = 24
    staleness_hours: int = 24
    is_demo_view: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(WORKER_DISCLAIMERS)
    )


class TickOnceOut(BaseModel):
    accepted: bool = True
    clinic_id: Optional[str] = None
    caregivers_scanned: int = 0
    misconfigs_flagged: int = 0
    skipped_cooldown: int = 0
    skipped_no_preference: int = 0
    skipped_adapter_ok: int = 0
    skipped_recent_delivery: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    flagged_caregiver_ids: list[str] = Field(default_factory=list)
    flagged_audit_event_ids: list[str] = Field(default_factory=list)
    audit_event_id: str


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
    if not cid:
        s = worker.get_status()
        return WorkerStatusOut(
            clinic_id=None,
            running=bool(s.running),
            process_enabled_via_env=env_enabled(),
            last_tick_at=s.last_tick_at,
            last_error=s.last_error,
            last_error_at=s.last_error_at,
            caregivers_in_clinic=0,
            misconfigs_flagged_last_24h=int(s.misconfigs_flagged_last_24h),
            last_tick_caregivers_scanned=int(s.last_tick_caregivers_scanned),
            last_tick_misconfigs_flagged=int(s.last_tick_misconfigs_flagged),
            last_tick_errors=int(s.last_tick_errors),
            interval_sec=env_interval_sec(),
            cooldown_hours=env_cooldown_hours(),
            staleness_hours=env_staleness_hours(),
        )
    snap = worker.get_status_for_clinic(db, cid)
    is_demo = cid in _DEMO_CLINIC_IDS
    _audit(
        db, actor,
        event="status_viewed",
        target_id=cid,
        note=(
            f"running={int(snap['running'])}; "
            f"caregivers={snap['caregivers_in_clinic']}; "
            f"flagged_24h={snap['misconfigs_flagged_last_24h']}"
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
        misconfigs_flagged_last_24h=int(snap["misconfigs_flagged_last_24h"]),
        last_tick_caregivers_scanned=int(snap["last_tick_caregivers_scanned"]),
        last_tick_misconfigs_flagged=int(snap["last_tick_misconfigs_flagged"]),
        last_tick_errors=int(snap["last_tick_errors"]),
        interval_sec=int(snap["interval_sec"]),
        cooldown_hours=int(snap["cooldown_hours"]),
        staleness_hours=int(snap["staleness_hours"]),
        is_demo_view=is_demo,
    )


@router.post("/tick-once", response_model=TickOnceOut)
def worker_tick_once(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TickOnceOut:
    """Admin-only debug: run ONE worker tick synchronously, bounded to
    the actor's clinic.

    Returns the counts the worker would have audited. Useful for
    verifying caregiver preferences + adapter wiring without waiting
    for the next 24h cron tick.
    """
    _gate_write(actor)
    cid = _scope_clinic(actor, None)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to run a detector tick.",
            status_code=400,
        )
    worker = get_worker()
    result = worker.tick(db, only_clinic_id=cid)
    is_demo = cid in _DEMO_CLINIC_IDS
    eid = _audit(
        db, actor,
        event="tick_once_clicked",
        target_id=cid,
        note=(
            f"caregivers_scanned={result.caregivers_scanned}; "
            f"misconfigs_flagged={result.misconfigs_flagged}; "
            f"skipped_cooldown={result.skipped_cooldown}; "
            f"errors={result.errors}"
        ),
        using_demo_data=is_demo,
    )
    return TickOnceOut(
        accepted=True,
        clinic_id=cid,
        caregivers_scanned=result.caregivers_scanned,
        misconfigs_flagged=result.misconfigs_flagged,
        skipped_cooldown=result.skipped_cooldown,
        skipped_no_preference=result.skipped_no_preference,
        skipped_adapter_ok=result.skipped_adapter_ok,
        skipped_recent_delivery=result.skipped_recent_delivery,
        errors=result.errors,
        elapsed_ms=result.elapsed_ms,
        last_error=result.last_error,
        flagged_caregiver_ids=list(result.flagged_caregiver_ids),
        flagged_audit_event_ids=list(result.flagged_audit_event_ids),
        audit_event_id=eid,
    )


@router.post("/audit-events", response_model=WorkerAuditOut)
def post_audit_event(
    body: WorkerAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerAuditOut:
    """Page-level audit ingestion under
    ``target_type='channel_misconfiguration_detector'``.

    Common events: ``view``, ``polling_tick``, ``status_viewed``,
    ``run_now_clicked``, ``filter_changed``, ``demo_banner_shown``.
    """
    _gate_read(actor)
    target = body.target_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
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
