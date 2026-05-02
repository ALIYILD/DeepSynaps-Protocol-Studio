"""IRB-AMD3: Reviewer Workload Outcome Tracker control plane (2026-05-02).

Companion router to
:mod:`app.services.irb_reviewer_sla_outcome_pairing`. Surfaces the
"did the SLA-breach signal actually nudge behavior?" answer for the
admin / clinician audience. Pairs each
``irb_reviewer_sla.queue_breach_detected`` audit row at time T with
the same reviewer's NEXT ``irb.amendment_decided_*`` audit row, then
classifies the outcome and computes a per-reviewer calibration score.

Endpoints
---------

* ``GET  /api/v1/irb-amendment-reviewer-workload-outcome-tracker/summary``
  Cohort summary — total breaches, outcome counts/percentages, median
  days_to_next_decision, top reviewers (worst calibration first).
* ``GET  /api/v1/irb-amendment-reviewer-workload-outcome-tracker/reviewer-calibration``
  Per-reviewer calibration list with ``min_breaches`` floor.
* ``GET  /api/v1/irb-amendment-reviewer-workload-outcome-tracker/list``
  Paginated paired-record feed with reviewer/outcome filters.
* ``GET  /api/v1/irb-amendment-reviewer-workload-outcome-tracker/audit-events``
  Paginated audit-event feed scoped to clinic + this surface.

All endpoints clinic-scoped. Cross-clinic access returns empty rows.
Mirrors the QEEG IDOR pattern in the ``deepsynaps-qeeg-pdf-export-tenant-gate``
memory.
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
from app.persistence.models import AuditEventRecord, User
from app.services.irb_reviewer_sla_outcome_pairing import (
    DEFAULT_SLA_RESPONSE_DAYS,
    DEFAULT_WINDOW_DAYS,
    MAX_SLA_RESPONSE_DAYS,
    MAX_WINDOW_DAYS,
    MIN_SLA_RESPONSE_DAYS,
    MIN_WINDOW_DAYS,
    OUTCOME_DECIDED_LATE,
    OUTCOME_DECIDED_WITHIN_SLA,
    OUTCOME_PENDING,
    OUTCOME_STILL_PENDING,
    SURFACE,
    ReviewerSLAOutcomeRecord,
    compute_reviewer_calibration,
    median_days_to_next_decision,
    pair_breaches_with_decisions,
)


router = APIRouter(
    prefix="/api/v1/irb-amendment-reviewer-workload-outcome-tracker",
    tags=["IRB Amendment Reviewer Workload Outcome Tracker"],
)
_log = logging.getLogger(__name__)


_OUTCOME_VALUES = {
    OUTCOME_DECIDED_WITHIN_SLA,
    OUTCOME_DECIDED_LATE,
    OUTCOME_STILL_PENDING,
    OUTCOME_PENDING,
}


OUTCOME_TRACKER_DISCLAIMERS = [
    "IRB Amendment Reviewer Workload Outcome Tracker pairs each "
    "irb_reviewer_sla.queue_breach_detected row with the same "
    "reviewer's NEXT irb.amendment_decided_* row, then classifies the "
    "outcome (decided_within_sla / decided_late / still_pending / "
    "pending).",
    "Calibration score per reviewer = (decided_within_sla - "
    "still_pending) / max(total - pending, 1). Pending rows excluded "
    "from the denominator because they haven't had a fair chance to "
    "resolve yet.",
    "Outcome tracking requires the IRB-AMD2 SLA worker to be enabled. "
    "If you see no data, check the IRB_REVIEWER_SLA_ENABLED env flag.",
    "Median days_to_next_decision is the median over decided pairs "
    "only — pending and still_pending breaches are excluded.",
]


# ── Helpers ────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    """Outcome tracker is strictly clinic-scoped. Even admins are bound
    to ``actor.clinic_id`` here so cross-clinic admins cannot read
    another clinic's reviewer behavior signal.
    """
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    if actor.role in {"admin", "clinician"}:
        return actor.role
    return "clinician"


def _normalize_window(value: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return DEFAULT_WINDOW_DAYS
    if v < MIN_WINDOW_DAYS:
        return MIN_WINDOW_DAYS
    if v > MAX_WINDOW_DAYS:
        return MAX_WINDOW_DAYS
    return v


def _normalize_sla_response(value: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return DEFAULT_SLA_RESPONSE_DAYS
    if v < MIN_SLA_RESPONSE_DAYS:
        return MIN_SLA_RESPONSE_DAYS
    if v > MAX_SLA_RESPONSE_DAYS:
        return MAX_SLA_RESPONSE_DAYS
    return v


def _emit_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
) -> str:
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
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
            event_id=eid,
            target_id=str(target_id) or actor.actor_id,
            target_type=SURFACE,
            action=f"{SURFACE}.{event}",
            role=_safe_audit_role(actor),
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _log.exception("IRB-AMD3 audit emit skipped")
    return eid


def _resolve_reviewer_names(
    db: Session, reviewer_ids: list[str]
) -> dict[str, Optional[str]]:
    if not reviewer_ids:
        return {}
    rows = db.query(User).filter(User.id.in_(reviewer_ids)).all()
    return {u.id: getattr(u, "display_name", None) for u in rows}


# ── Schemas ────────────────────────────────────────────────────────────────


class OutcomeCountsOut(BaseModel):
    decided_within_sla: int = 0
    decided_late: int = 0
    still_pending: int = 0
    pending: int = 0


class OutcomePctOut(BaseModel):
    decided_within_sla: float = 0.0
    decided_late: float = 0.0
    still_pending: float = 0.0


class TopReviewerOut(BaseModel):
    reviewer_user_id: str
    reviewer_name: Optional[str] = None
    total_breaches: int = 0
    calibration_score: float = 0.0
    last_breach_at: Optional[str] = None


class SummaryOut(BaseModel):
    window_days: int
    sla_response_days: int
    total_breaches: int = 0
    outcome_counts: OutcomeCountsOut = Field(default_factory=OutcomeCountsOut)
    outcome_pct: OutcomePctOut = Field(default_factory=OutcomePctOut)
    median_days_to_next_decision: Optional[float] = None
    by_reviewer_top: list[TopReviewerOut] = Field(default_factory=list)
    clinic_id: Optional[str] = None
    disclaimers: list[str] = Field(
        default_factory=lambda: list(OUTCOME_TRACKER_DISCLAIMERS)
    )


class ReviewerCalibrationOut(BaseModel):
    reviewer_user_id: str
    reviewer_name: Optional[str] = None
    total_breaches: int = 0
    decided_within_sla_count: int = 0
    decided_late_count: int = 0
    still_pending_count: int = 0
    pending_count: int = 0
    mean_days_to_next_decision: Optional[float] = None
    calibration_score: float = 0.0
    last_breach_at: Optional[str] = None


class ReviewerCalibrationListOut(BaseModel):
    items: list[ReviewerCalibrationOut] = Field(default_factory=list)
    window_days: int
    sla_response_days: int
    min_breaches: int = 1
    clinic_id: Optional[str] = None


class PairedRecordOut(BaseModel):
    breach_audit_id: str
    reviewer_user_id: str
    reviewer_name: Optional[str] = None
    breached_at: str
    pending_count: int = 0
    oldest_age_days: int = 0
    decided_audit_id: Optional[str] = None
    decided_at: Optional[str] = None
    days_to_next_decision: Optional[float] = None
    outcome: str


class PairedListOut(BaseModel):
    items: list[PairedRecordOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 25
    window_days: int
    sla_response_days: int
    clinic_id: Optional[str] = None


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


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/summary", response_model=SummaryOut)
def summary(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS),
    sla_response_days: int = Query(default=DEFAULT_SLA_RESPONSE_DAYS),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SummaryOut:
    """Cohort summary — outcome counts/percentages, median, top
    reviewers (worst calibration first, capped at 5)."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    sla = _normalize_sla_response(sla_response_days)

    if not cid:
        return SummaryOut(
            window_days=w,
            sla_response_days=sla,
            total_breaches=0,
            outcome_counts=OutcomeCountsOut(),
            outcome_pct=OutcomePctOut(),
            median_days_to_next_decision=None,
            by_reviewer_top=[],
            clinic_id=None,
        )

    records = pair_breaches_with_decisions(
        db, cid, window_days=w, sla_response_days=sla
    )

    counts = OutcomeCountsOut(
        decided_within_sla=sum(
            1 for r in records if r.outcome == OUTCOME_DECIDED_WITHIN_SLA
        ),
        decided_late=sum(1 for r in records if r.outcome == OUTCOME_DECIDED_LATE),
        still_pending=sum(
            1 for r in records if r.outcome == OUTCOME_STILL_PENDING
        ),
        pending=sum(1 for r in records if r.outcome == OUTCOME_PENDING),
    )

    # Pct excludes pending from denominator (still within grace).
    denom = (
        counts.decided_within_sla
        + counts.decided_late
        + counts.still_pending
    )
    if denom > 0:
        pct = OutcomePctOut(
            decided_within_sla=round(
                100.0 * counts.decided_within_sla / denom, 1
            ),
            decided_late=round(100.0 * counts.decided_late / denom, 1),
            still_pending=round(100.0 * counts.still_pending / denom, 1),
        )
    else:
        pct = OutcomePctOut()

    median = median_days_to_next_decision(records)

    calibration = compute_reviewer_calibration(records)
    reviewer_ids = list(calibration.keys())
    name_lookup = _resolve_reviewer_names(db, reviewer_ids)

    # Top = worst-calibration reviewers (asc by calibration_score),
    # capped at 5.
    top_sorted = sorted(
        calibration.items(),
        key=lambda kv: (kv[1]["calibration_score"], -kv[1]["total_breaches"]),
    )
    top_items = [
        TopReviewerOut(
            reviewer_user_id=rid,
            reviewer_name=name_lookup.get(rid),
            total_breaches=int(stats["total_breaches"]),
            calibration_score=float(stats["calibration_score"]),
            last_breach_at=stats.get("last_breach_at"),
        )
        for rid, stats in top_sorted[:5]
    ]

    _emit_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=cid or actor.actor_id,
        note=(
            f"window_days={w} sla_response_days={sla} "
            f"total_breaches={len(records)} "
            f"reviewers_with_breaches={len(calibration)}"
        ),
    )

    return SummaryOut(
        window_days=w,
        sla_response_days=sla,
        total_breaches=len(records),
        outcome_counts=counts,
        outcome_pct=pct,
        median_days_to_next_decision=median,
        by_reviewer_top=top_items,
        clinic_id=cid,
    )


@router.get(
    "/reviewer-calibration", response_model=ReviewerCalibrationListOut
)
def reviewer_calibration(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS),
    sla_response_days: int = Query(default=DEFAULT_SLA_RESPONSE_DAYS),
    min_breaches: int = Query(default=2, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReviewerCalibrationListOut:
    """Per-reviewer calibration with min-breach floor."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    sla = _normalize_sla_response(sla_response_days)

    if not cid:
        return ReviewerCalibrationListOut(
            items=[],
            window_days=w,
            sla_response_days=sla,
            min_breaches=min_breaches,
            clinic_id=None,
        )

    records = pair_breaches_with_decisions(
        db, cid, window_days=w, sla_response_days=sla
    )
    calibration = compute_reviewer_calibration(records)

    # Apply min-breaches floor.
    filtered = {
        rid: stats
        for rid, stats in calibration.items()
        if int(stats["total_breaches"]) >= min_breaches
    }
    name_lookup = _resolve_reviewer_names(db, list(filtered.keys()))

    items_sorted = sorted(
        filtered.items(),
        key=lambda kv: (kv[1]["calibration_score"], -kv[1]["total_breaches"]),
    )
    items = [
        ReviewerCalibrationOut(
            reviewer_user_id=rid,
            reviewer_name=name_lookup.get(rid),
            total_breaches=int(stats["total_breaches"]),
            decided_within_sla_count=int(stats["decided_within_sla_count"]),
            decided_late_count=int(stats["decided_late_count"]),
            still_pending_count=int(stats["still_pending_count"]),
            pending_count=int(stats["pending_count"]),
            mean_days_to_next_decision=stats.get("mean_days_to_next_decision"),
            calibration_score=float(stats["calibration_score"]),
            last_breach_at=stats.get("last_breach_at"),
        )
        for rid, stats in items_sorted
    ]

    return ReviewerCalibrationListOut(
        items=items,
        window_days=w,
        sla_response_days=sla,
        min_breaches=min_breaches,
        clinic_id=cid,
    )


@router.get("/list", response_model=PairedListOut)
def list_paired(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS),
    sla_response_days: int = Query(default=DEFAULT_SLA_RESPONSE_DAYS),
    reviewer_user_id: Optional[str] = Query(default=None, max_length=64),
    outcome: Optional[str] = Query(default=None, max_length=32),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PairedListOut:
    """Paginated paired (breach → decision) record list with filters."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    sla = _normalize_sla_response(sla_response_days)

    if not cid:
        return PairedListOut(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            window_days=w,
            sla_response_days=sla,
            clinic_id=None,
        )

    records = pair_breaches_with_decisions(
        db, cid, window_days=w, sla_response_days=sla
    )

    if reviewer_user_id:
        rid = reviewer_user_id.strip()
        records = [r for r in records if r.reviewer_user_id == rid]
    if outcome:
        oc = outcome.strip().lower()
        if oc in _OUTCOME_VALUES:
            records = [r for r in records if r.outcome == oc]

    # Most recent first.
    records.sort(key=lambda r: r.breached_at, reverse=True)

    total = len(records)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = records[start:end]

    name_lookup = _resolve_reviewer_names(
        db, list({r.reviewer_user_id for r in page_items})
    )

    return PairedListOut(
        items=[
            PairedRecordOut(
                breach_audit_id=r.breach_audit_id,
                reviewer_user_id=r.reviewer_user_id,
                reviewer_name=name_lookup.get(r.reviewer_user_id),
                breached_at=r.breached_at.isoformat(),
                pending_count=r.pending_count,
                oldest_age_days=r.oldest_age_days,
                decided_audit_id=r.decided_audit_id,
                decided_at=r.decided_at.isoformat() if r.decided_at else None,
                days_to_next_decision=r.days_to_next_decision,
                outcome=r.outcome,
            )
            for r in page_items
        ],
        total=total,
        page=page,
        page_size=page_size,
        window_days=w,
        sla_response_days=sla,
        clinic_id=cid,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list for the IRB-AMD3 surface."""
    _gate_read(actor)
    cid = _scope_clinic(actor)

    s = (surface or SURFACE).strip().lower()
    if s != SURFACE:
        s = SURFACE

    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.target_type == s
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


__all__ = ["router", "SURFACE"]
