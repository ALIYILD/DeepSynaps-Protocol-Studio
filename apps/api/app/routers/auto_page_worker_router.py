"""Auto-Page Worker control plane / status surface (2026-05-01).

Closes the real-time half of the Care Team Coverage launch loop. Care
Team Coverage (#357) defined the breach predicate + manual page-on-call
endpoint and shipped an honest "Auto-page worker: OFF" badge. Daily
Digest (#366) closed the post-hoc half. This router gives the UI + ops
the control plane for the new background worker:

* ``GET  /api/v1/auto-page-worker/status`` — clinic-scoped status snapshot
  (running, last_tick_at, breaches_pending_now, paged_last_hour,
  errors_last_hour, last_error). Read by the Care Team Coverage page
  every 30s.
* ``POST /api/v1/auto-page-worker/start`` — admin only; flips
  ``escalation_chains.auto_page_enabled=True`` for the actor's clinic
  (wildcard surface). Only enables auto-paging FOR THAT CLINIC; whether
  the worker thread itself is running is governed by
  ``DEEPSYNAPS_AUTO_PAGE_ENABLED=1``.
* ``POST /api/v1/auto-page-worker/stop`` — admin only; flips the same
  field to False.
* ``POST /api/v1/auto-page-worker/tick-once`` — admin only debug.
  Runs ONE tick synchronously bounded to the actor's clinic and returns
  the counts the worker would have audited. Useful for verifying chain
  + roster + SLA wiring without waiting for the next 60s tick.
* ``POST /api/v1/auto-page-worker/audit-events`` — page-level audit
  ingestion under ``target_type='auto_page_worker'``.

All endpoints are clinic-scoped. Cross-clinic clinicians/admins get 404
(we never reveal the existence of another clinic's worker config).

Slack/Twilio/PagerDuty wire-up
------------------------------
Out-of-scope for this PR. The worker writes a regulator-credible audit
row + an ``oncall_pages`` row with ``delivery_status='queued'`` for
every auto-page. PR section F documents the upgrade path: when an
adapter env var lands, the worker's ``_deliver_page`` hook flips the
status to ``sent`` (2xx) or ``failed`` (non-2xx). Until then the row is
honest about "selected, contact loaded, audit row written" not
"delivered to a human".
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
from app.persistence.models import EscalationChain
from app.workers.auto_page_worker import (
    env_cooldown_min,
    env_enabled,
    env_interval_sec,
    get_worker,
)


router = APIRouter(prefix="/api/v1/auto-page-worker", tags=["Auto-Page Worker"])
_log = logging.getLogger(__name__)


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


WORKER_DISCLAIMERS = [
    "Auto-page worker scans SLA breaches every 60s and fires the same "
    "page-oncall handler the manual button uses.",
    "Worker delivery_status='queued' means the audit row + oncall_pages row "
    "were written but the message was not yet handed to Slack/Twilio/PagerDuty. "
    "The worker NEVER reports 'sent' until a real adapter returns 2xx — "
    "see PR section F for the wire-up path.",
    "Idempotency: a breach is paged at most once per cooldown window "
    "(default 15 min). delivery_status='failed' rows are retried.",
    "Cross-clinic data is hidden from clinicians (404). Admins see only their "
    "own clinic's worker config.",
]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_write(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scope_clinic(actor: AuthenticatedActor, clinic_id: Optional[str]) -> Optional[str]:
    """Resolve the clinic_id to scope a query to.

    Mirrors care_team_coverage_router._scope_clinic — admins may pass
    ``clinic_id`` to view another clinic; clinicians always see their own.
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
    """Best-effort audit hook for the ``auto_page_worker`` surface."""
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"auto_page_worker-{event}-{actor.actor_id}"
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
            target_type="auto_page_worker",
            action=f"auto_page_worker.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("auto_page_worker self-audit skipped")
    return event_id


# ── Schemas ─────────────────────────────────────────────────────────────────


class WorkerStatusOut(BaseModel):
    clinic_id: Optional[str] = None
    running: bool = False
    enabled_in_clinic: bool = False
    process_enabled_via_env: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    breaches_pending_now: int = 0
    paged_last_hour: int = 0
    errors_last_hour: int = 0
    last_tick_breaches_found: int = 0
    last_tick_paged: int = 0
    last_tick_clinics_scanned: int = 0
    interval_sec: int = 60
    cooldown_min: int = 15
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(WORKER_DISCLAIMERS))


class WorkerStartStopOut(BaseModel):
    accepted: bool = True
    clinic_id: Optional[str] = None
    enabled_in_clinic: bool = False
    surfaces_changed: int = 0
    audit_event_id: str


class TickOnceOut(BaseModel):
    accepted: bool = True
    clinic_id: Optional[str] = None
    clinics_scanned: int = 0
    breaches_found: int = 0
    paged: int = 0
    skipped_cooldown: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    paged_audit_event_ids: list[str] = Field(default_factory=list)
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
    """Clinic-scoped worker status snapshot.

    Read by the Care Team Coverage page every 30s. Combines the in-memory
    worker status (running flag, last tick timestamp, last error) with
    clinic-scoped DB counts (breaches_pending_now, paged_last_hour,
    enabled_in_clinic).
    """
    _gate_read(actor)
    cid = _scope_clinic(actor, None)
    worker = get_worker()
    if not cid:
        s = worker.get_status()
        return WorkerStatusOut(
            clinic_id=None,
            running=bool(s.running),
            enabled_in_clinic=False,
            process_enabled_via_env=env_enabled(),
            last_tick_at=s.last_tick_at,
            last_error=s.last_error,
            last_error_at=s.last_error_at,
            breaches_pending_now=0,
            paged_last_hour=0,
            errors_last_hour=int(s.errors_last_hour),
            last_tick_breaches_found=int(s.last_tick_breaches_found),
            last_tick_paged=int(s.last_tick_paged),
            last_tick_clinics_scanned=int(s.last_tick_clinics_scanned),
            interval_sec=env_interval_sec(),
            cooldown_min=env_cooldown_min(),
        )
    snap = worker.get_status_for_clinic(db, cid)
    is_demo = cid in _DEMO_CLINIC_IDS
    _audit(
        db, actor,
        event="status_viewed",
        target_id=cid,
        note=(
            f"running={int(snap['running'])}; "
            f"enabled_in_clinic={int(snap['enabled_in_clinic'])}; "
            f"pending={snap['breaches_pending_now']}; "
            f"paged_last_hour={snap['paged_last_hour']}"
        ),
        using_demo_data=is_demo,
    )
    return WorkerStatusOut(
        clinic_id=cid,
        running=snap["running"],
        enabled_in_clinic=snap["enabled_in_clinic"],
        process_enabled_via_env=env_enabled(),
        last_tick_at=snap["last_tick_at"],
        last_error=snap["last_error"],
        last_error_at=snap["last_error_at"],
        breaches_pending_now=int(snap["breaches_pending_now"]),
        paged_last_hour=int(snap["paged_last_hour"]),
        errors_last_hour=int(snap["errors_last_hour"]),
        last_tick_breaches_found=int(snap["last_tick_breaches_found"]),
        last_tick_paged=int(snap["last_tick_paged"]),
        last_tick_clinics_scanned=int(snap["last_tick_clinics_scanned"]),
        interval_sec=int(snap["interval_sec"]),
        cooldown_min=int(snap["cooldown_min"]),
        is_demo_view=is_demo,
    )


def _flip_clinic_auto_page(
    db: Session, actor: AuthenticatedActor, *, enable: bool
) -> tuple[Optional[str], int]:
    """Flip ``escalation_chains.auto_page_enabled`` for every chain row in
    the actor's clinic.

    Returns (clinic_id, surfaces_changed). When the clinic has no chain
    rows at all, we synthesise a wildcard ``surface='*'`` row so the
    "enable" path actually does something. The "disable" path on a
    no-row clinic is a no-op (returns 0 surfaces changed).
    """
    cid = _scope_clinic(actor, None)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to flip the auto-page worker.",
            status_code=400,
        )
    rows = (
        db.query(EscalationChain)
        .filter(EscalationChain.clinic_id == cid)
        .all()
    )
    changed = 0
    if not rows and enable:
        # Synthesise a clinic-wide wildcard chain so "enable" is honest.
        now = _now_iso()
        synth = EscalationChain(
            id=f"chain-{uuid.uuid4().hex[:12]}",
            clinic_id=cid,
            surface="*",
            primary_user_id=None,
            backup_user_id=None,
            director_user_id=None,
            auto_page_enabled=True,
            note="Synthesised by auto-page worker /start endpoint",
            updated_by=actor.actor_id,
            created_at=now,
            updated_at=now,
        )
        db.add(synth)
        db.commit()
        return cid, 1
    for r in rows:
        target = bool(enable)
        if bool(r.auto_page_enabled) != target:
            r.auto_page_enabled = target
            r.updated_at = _now_iso()
            r.updated_by = actor.actor_id
            changed += 1
    if changed:
        db.commit()
    return cid, changed


@router.post("/start", response_model=WorkerStartStopOut)
def worker_start(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerStartStopOut:
    """Admin-only: enable auto-paging for every escalation chain row in
    the actor's clinic.

    If no chain rows exist for the clinic we synthesise a wildcard
    ``surface='*'`` row so this endpoint always changes the observable
    state (no silent fakes). The worker thread itself is governed by
    ``DEEPSYNAPS_AUTO_PAGE_ENABLED=1`` — flipping the per-clinic flag
    does nothing on a deploy where the worker process is dormant.
    """
    _gate_write(actor)
    cid, changed = _flip_clinic_auto_page(db, actor, enable=True)
    is_demo = cid in _DEMO_CLINIC_IDS if cid else False
    eid = _audit(
        db, actor,
        event="start_clicked",
        target_id=cid or actor.actor_id,
        note=f"surfaces_changed={changed}",
        using_demo_data=is_demo,
    )
    return WorkerStartStopOut(
        accepted=True,
        clinic_id=cid,
        enabled_in_clinic=True,
        surfaces_changed=changed,
        audit_event_id=eid,
    )


@router.post("/stop", response_model=WorkerStartStopOut)
def worker_stop(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerStartStopOut:
    """Admin-only: disable auto-paging for every escalation chain row in
    the actor's clinic.

    Idempotent — calling this on a clinic that already has all chains
    disabled is a no-op (returns ``surfaces_changed=0``). The page-level
    audit row is still emitted so regulators see the click.
    """
    _gate_write(actor)
    cid, changed = _flip_clinic_auto_page(db, actor, enable=False)
    is_demo = cid in _DEMO_CLINIC_IDS if cid else False
    eid = _audit(
        db, actor,
        event="stop_clicked",
        target_id=cid or actor.actor_id,
        note=f"surfaces_changed={changed}",
        using_demo_data=is_demo,
    )
    return WorkerStartStopOut(
        accepted=True,
        clinic_id=cid,
        enabled_in_clinic=False,
        surfaces_changed=changed,
        audit_event_id=eid,
    )


@router.post("/tick-once", response_model=TickOnceOut)
def worker_tick_once(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TickOnceOut:
    """Admin-only debug: run ONE worker tick synchronously, bounded to the
    actor's clinic.

    Returns the counts the worker would have audited. Useful for
    verifying chain + roster + SLA wiring without waiting for the next
    60s scheduled tick. The synchronous tick still emits an audit row
    under ``target_type='auto_page_worker'`` so the regulator transcript
    sees ALL ticks (cron + admin-triggered) the same way.
    """
    _gate_write(actor)
    cid = _scope_clinic(actor, None)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to run a tick.",
            status_code=400,
        )
    worker = get_worker()
    # Use the request-scoped session so test fixtures + the inner page-impl
    # see the same in-memory rows. Worker tick will commit per page; that
    # is fine because the per-page commit path already commits inside
    # _record_oncall_page.
    result = worker.tick(db, only_clinic_id=cid)

    is_demo = cid in _DEMO_CLINIC_IDS
    eid = _audit(
        db, actor,
        event="tick_once_clicked",
        target_id=cid,
        note=(
            f"breaches_found={result.breaches_found}; "
            f"paged={result.paged}; "
            f"skipped_cooldown={result.skipped_cooldown}; "
            f"errors={result.errors}"
        ),
        using_demo_data=is_demo,
    )
    return TickOnceOut(
        accepted=True,
        clinic_id=cid,
        clinics_scanned=result.clinics_scanned,
        breaches_found=result.breaches_found,
        paged=result.paged,
        skipped_cooldown=result.skipped_cooldown,
        errors=result.errors,
        elapsed_ms=result.elapsed_ms,
        last_error=result.last_error,
        paged_audit_event_ids=list(result.paged_audit_event_ids),
        audit_event_id=eid,
    )


@router.post("/audit-events", response_model=WorkerAuditOut)
def post_audit_event(
    body: WorkerAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerAuditOut:
    """Page-level audit ingestion under ``target_type='auto_page_worker'``.

    The Care Team Coverage page emits a ``view`` ping at mount and a
    ``polling_tick`` ping every 30s so the regulator audit trail sees
    every minute the on-call clinician kept the worker page open.
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
