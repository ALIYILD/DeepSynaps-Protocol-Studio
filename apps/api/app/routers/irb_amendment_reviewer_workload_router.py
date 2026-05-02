"""IRB Amendment Reviewer Workload control plane (IRB-AMD2, 2026-05-02).

Companion router to :mod:`app.services.irb_amendment_reviewer_workload`
and :mod:`app.workers.irb_reviewer_sla_worker`. Exposes the
per-reviewer queue dashboard + SLA-worker control surface that the
frontend "Reviewer workload" sub-section renders inside the
``pgIRBManager`` "Amendments Workflow" tab.

Endpoints
---------

* ``GET  /api/v1/irb-amendment-reviewer-workload/workload`` —
  clinic-scoped reviewer workloads (clinician+).
* ``GET  /api/v1/irb-amendment-reviewer-workload/unassigned-amendments``
  — clinic-scoped list of submitted amendments awaiting reviewer
  assignment (clinician+).
* ``GET  /api/v1/irb-amendment-reviewer-workload/suggest-reviewer``
  — returns the suggested reviewer_user_id for an amendment
  (clinician+).
* ``POST /api/v1/irb-amendment-reviewer-workload/worker/tick`` —
  admin-only one-shot tick scoped to actor's clinic.
* ``GET  /api/v1/irb-amendment-reviewer-workload/worker/status`` —
  clinician+; worker status snapshot.
* ``GET  /api/v1/irb-amendment-reviewer-workload/audit-events`` —
  paginated, scoped audit-event feed.

All endpoints clinic-scoped. Cross-clinic access returns 404 on
patient-data joins (we follow the QEEG IDOR pattern in the
``deepsynaps-qeeg-pdf-export-tenant-gate`` memory).
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
from app.services.irb_amendment_reviewer_workload import (
    SURFACE,
    compute_reviewer_workload,
    find_unassigned_amendments,
    suggest_reviewer_for_amendment,
)
from app.workers.irb_reviewer_sla_worker import (
    BREACH_TARGET_TYPE,
    WORKER_SURFACE,
    env_enabled,
    get_worker,
)


router = APIRouter(
    prefix="/api/v1/irb-amendment-reviewer-workload",
    tags=["IRB Amendment Reviewer Workload"],
)
_log = logging.getLogger(__name__)


WORKLOAD_DISCLAIMERS = [
    "IRB Amendment Reviewer Workload tracks per-reviewer time-in-"
    "reviewer_assigned/under_review for every clinic and emits a "
    "HIGH-priority queue_breach_detected audit row when a reviewer's "
    "queue exceeds the configured thresholds.",
    "Each queue_breach_detected row carries priority=high so the "
    "Clinician Inbox aggregator (#354) routes it without any new "
    "aggregation logic — admins see the breach in their existing "
    "inbox surface.",
    "Worker is honestly default-off — set IRB_REVIEWER_SLA_ENABLED to "
    "start the auto-loop. Admins can manually invoke /worker/tick at "
    "any time regardless of the env flag.",
    "The SLA breach predicate is total_pending >= queue_threshold AND "
    "oldest_pending_age_days >= age_threshold (defaults: 5 / 7d). The "
    "warn (yellow) chip fires at 80% of either threshold.",
    "Auto-assign reviewer routes through "
    "/api/v1/irb-amendment-reviewer-workload/suggest-reviewer then "
    "/api/v1/irb-amendment-workflow/amendments/{id}/assign-reviewer "
    "(IRB-AMD1's existing endpoint). Admins only.",
]


# ── Helpers ────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_write(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _scope_clinic(
    actor: AuthenticatedActor, clinic_id: Optional[str] = None
) -> Optional[str]:
    """Return the clinic id this actor is allowed to read.

    Admins/supervisors/regulators may pass an explicit ``clinic_id``
    override; anyone else is bound to ``actor.clinic_id``.
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
) -> str:
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"{SURFACE}-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if actor.clinic_id:
        note_parts.append(f"clinic_id={actor.clinic_id}")
    if note:
        note_parts.append(note[:480])
    final_note = "; ".join(note_parts) or event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type=SURFACE,
            action=f"{SURFACE}.{event}",
            role=actor.role if actor.role in {"admin", "clinician"} else "clinician",
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _log.exception("irb_amendment_reviewer_workload self-audit skipped")
    return event_id


# ── Schemas ────────────────────────────────────────────────────────────────


class ReviewerWorkloadOut(BaseModel):
    reviewer_user_id: str
    display_name: Optional[str] = None
    role: Optional[str] = None
    pending_assigned: int = 0
    pending_under_review: int = 0
    total_pending: int = 0
    oldest_pending_age_days: int = 0
    mean_pending_age_days: float = 0.0
    last_decision_at: Optional[str] = None
    sla_breach: bool = False
    sla_warn: bool = False
    pending_amendment_ids: list[str] = Field(default_factory=list)


class WorkloadListOut(BaseModel):
    items: list[ReviewerWorkloadOut] = Field(default_factory=list)
    clinic_id: Optional[str] = None
    queue_threshold: int = 0
    age_threshold_days: int = 0
    sla_breach_count: int = 0
    sla_warn_count: int = 0
    total_pending: int = 0
    avg_oldest_pending_age_days: float = 0.0
    disclaimers: list[str] = Field(
        default_factory=lambda: list(WORKLOAD_DISCLAIMERS)
    )


class UnassignedAmendmentOut(BaseModel):
    id: str
    protocol_id: str
    title: Optional[str] = None
    submitted_at: Optional[str] = None
    submission_age_days: int = 0
    submitted_by: Optional[str] = None


class UnassignedListOut(BaseModel):
    items: list[UnassignedAmendmentOut] = Field(default_factory=list)
    clinic_id: Optional[str] = None
    total: int = 0


class SuggestReviewerOut(BaseModel):
    amendment_id: str
    suggested_reviewer_user_id: Optional[str] = None
    clinic_id: Optional[str] = None


class WorkerStatusOut(BaseModel):
    clinic_id: Optional[str] = None
    enabled: bool = False
    running: bool = False
    last_tick_at: Optional[str] = None
    next_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    last_tick_reviewers_examined: int = 0
    last_tick_breaches_emitted: int = 0
    last_tick_skipped_cooldown: int = 0
    last_tick_errors: int = 0
    interval_hours: int = 24
    queue_threshold: int = 5
    age_threshold_days: int = 7
    cooldown_hours: int = 23
    disclaimers: list[str] = Field(
        default_factory=lambda: list(WORKLOAD_DISCLAIMERS)
    )


class TickOut(BaseModel):
    accepted: bool = True
    clinic_id: Optional[str] = None
    clinics_scanned: int = 0
    reviewers_examined: int = 0
    breaches_emitted: int = 0
    skipped_cooldown: int = 0
    errors: int = 0
    elapsed_ms: int = 0
    last_error: Optional[str] = None
    breach_audit_event_ids: list[str] = Field(default_factory=list)
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
    items: list[AuditEventOut]
    total: int
    limit: int
    offset: int
    surface: str


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/workload", response_model=WorkloadListOut)
def reviewer_workload(
    clinic_id: Optional[str] = Query(default=None, max_length=80),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkloadListOut:
    """Per-reviewer queue snapshot for the clinic."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    worker = get_worker()
    items = compute_reviewer_workload(
        db,
        cid,
        sla_queue_threshold=worker.queue_threshold,
        sla_age_threshold_days=worker.age_threshold_days,
    )
    breach = sum(1 for it in items if it.sla_breach)
    warn = sum(1 for it in items if it.sla_warn)
    total_pending = sum(it.total_pending for it in items)
    avg_oldest = (
        round(
            sum(it.oldest_pending_age_days for it in items) / len(items), 1
        )
        if items
        else 0.0
    )
    _audit(
        db,
        actor,
        event="workload_viewed",
        target_id=cid or actor.actor_id,
        note=(
            f"reviewer_count={len(items)} sla_breach={breach} "
            f"sla_warn={warn} total_pending={total_pending}"
        ),
    )
    return WorkloadListOut(
        items=[
            ReviewerWorkloadOut(
                reviewer_user_id=it.reviewer_user_id,
                display_name=it.display_name,
                role=it.role,
                pending_assigned=it.pending_assigned,
                pending_under_review=it.pending_under_review,
                total_pending=it.total_pending,
                oldest_pending_age_days=it.oldest_pending_age_days,
                mean_pending_age_days=it.mean_pending_age_days,
                last_decision_at=it.last_decision_at,
                sla_breach=it.sla_breach,
                sla_warn=it.sla_warn,
                pending_amendment_ids=list(it.pending_amendment_ids),
            )
            for it in items
        ],
        clinic_id=cid,
        queue_threshold=int(worker.queue_threshold),
        age_threshold_days=int(worker.age_threshold_days),
        sla_breach_count=breach,
        sla_warn_count=warn,
        total_pending=total_pending,
        avg_oldest_pending_age_days=avg_oldest,
    )


@router.get("/unassigned-amendments", response_model=UnassignedListOut)
def unassigned_amendments(
    clinic_id: Optional[str] = Query(default=None, max_length=80),
    limit: int = Query(default=200, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> UnassignedListOut:
    """List of submitted amendments with no reviewer attached."""
    _gate_read(actor)
    cid = _scope_clinic(actor, clinic_id)
    items = find_unassigned_amendments(db, cid, limit=limit)
    return UnassignedListOut(
        items=[
            UnassignedAmendmentOut(
                id=it.id,
                protocol_id=it.protocol_id,
                title=it.title,
                submitted_at=it.submitted_at,
                submission_age_days=it.submission_age_days,
                submitted_by=it.submitted_by,
            )
            for it in items
        ],
        clinic_id=cid,
        total=len(items),
    )


@router.get("/suggest-reviewer", response_model=SuggestReviewerOut)
def suggest_reviewer(
    amendment_id: str = Query(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SuggestReviewerOut:
    """Return the lowest-pending reviewer in the clinic for the given
    amendment. None when no candidate exists OR when the amendment is
    not visible at the actor's clinic.
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    worker = get_worker()
    suggested = suggest_reviewer_for_amendment(
        db,
        cid,
        amendment_id,
        sla_queue_threshold=worker.queue_threshold,
        sla_age_threshold_days=worker.age_threshold_days,
    )
    return SuggestReviewerOut(
        amendment_id=amendment_id,
        suggested_reviewer_user_id=suggested,
        clinic_id=cid,
    )


@router.post("/worker/tick", response_model=TickOut)
def worker_tick(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TickOut:
    """Admin-only: run ONE SLA check synchronously bounded to the
    actor's clinic.
    """
    _gate_write(actor)
    cid = _scope_clinic(actor)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to run an SLA check.",
            status_code=400,
        )
    worker = get_worker()
    result = worker.tick(db, only_clinic_id=cid)
    eid = _audit(
        db,
        actor,
        event="tick_clicked",
        target_id=cid,
        note=(
            f"reviewers_examined={result.reviewers_examined}; "
            f"breaches_emitted={result.breaches_emitted}; "
            f"skipped_cooldown={result.skipped_cooldown}; "
            f"errors={result.errors}"
        ),
    )
    return TickOut(
        accepted=True,
        clinic_id=cid,
        clinics_scanned=result.clinics_scanned,
        reviewers_examined=result.reviewers_examined,
        breaches_emitted=result.breaches_emitted,
        skipped_cooldown=result.skipped_cooldown,
        errors=result.errors,
        elapsed_ms=result.elapsed_ms,
        last_error=result.last_error,
        breach_audit_event_ids=list(result.breach_audit_event_ids),
        audit_event_id=eid,
    )


@router.get("/worker/status", response_model=WorkerStatusOut)
def worker_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkerStatusOut:
    """Clinician+ worker status snapshot."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    worker = get_worker()
    snap = worker.get_status_dict()
    return WorkerStatusOut(
        clinic_id=cid,
        enabled=bool(snap["enabled"]),
        running=bool(snap["running"]),
        last_tick_at=snap["last_tick_at"],
        next_tick_at=snap["next_tick_at"],
        last_error=snap["last_error"],
        last_error_at=snap["last_error_at"],
        last_tick_reviewers_examined=int(snap["last_tick_reviewers_examined"]),
        last_tick_breaches_emitted=int(snap["last_tick_breaches_emitted"]),
        last_tick_skipped_cooldown=int(snap["last_tick_skipped_cooldown"]),
        last_tick_errors=int(snap["last_tick_errors"]),
        interval_hours=int(snap["interval_hours"]),
        queue_threshold=int(snap["queue_threshold"]),
        age_threshold_days=int(snap["age_threshold_days"]),
        cooldown_hours=int(snap["cooldown_hours"]),
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list.

    Returns rows under the IRB-AMD2 page surface AND the worker
    surface (``irb_reviewer_sla``) AND the breach target type
    (``irb_reviewer``) so the admin frontend can render the full
    SLA-related audit feed in one panel.
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)

    s = (surface or SURFACE).strip().lower()
    if s != SURFACE:
        s = SURFACE

    target_types = {SURFACE, WORKER_SURFACE, BREACH_TARGET_TYPE}
    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.target_type.in_(list(target_types))
    )
    if cid:
        from sqlalchemy import or_  # noqa: PLC0415

        base = base.filter(
            or_(
                AuditEventRecord.note.like(f"%clinic_id={cid}%"),
                AuditEventRecord.actor_id == actor.actor_id,
            )
        )
    else:
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
