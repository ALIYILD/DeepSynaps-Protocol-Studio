"""QEEG-ANN2: qEEG Annotation Resolution Outcome Tracker control plane.

Companion router to
:mod:`app.services.qeeg_annotation_outcome_pairing`. Surfaces the
"are clinicians actually closing out the flags they raised on Brain
Map reports?" answer.

Endpoints
---------

* ``GET /api/v1/qeeg-annotation-outcome-tracker/summary``
* ``GET /api/v1/qeeg-annotation-outcome-tracker/clinician-creator-summary``
* ``GET /api/v1/qeeg-annotation-outcome-tracker/resolver-latency-summary``
* ``GET /api/v1/qeeg-annotation-outcome-tracker/backlog``
* ``GET /api/v1/qeeg-annotation-outcome-tracker/audit-events``

Cross-clinic safety
-------------------

All endpoints clinic-scoped to ``actor.clinic_id``. Cross-clinic
access returns an empty payload (404 is reserved for unknown ID
paths; this surface has only collection endpoints).

Backlog body redaction
----------------------

The ``/backlog`` endpoint truncates body to 200 chars, AND if
``_gate_patient_access`` denies on a particular patient it redacts
the body for that row to ``"[redacted: cross-clinic]"``. In practice
this never fires because the records are already clinic-scoped, but
it's a defence-in-depth pattern from
``deepsynaps-qeeg-pdf-export-tenant-gate`` memory.
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
    require_patient_owner,
)
from app.database import get_db_session
from app.persistence.models import AuditEventRecord, User
from app.repositories.patients import resolve_patient_clinic_id
from app.services.qeeg_annotation_outcome_pairing import (
    DEFAULT_SLA_DAYS,
    DEFAULT_WINDOW_DAYS,
    MAX_SLA_DAYS,
    MAX_WINDOW_DAYS,
    MIN_SLA_DAYS,
    MIN_WINDOW_DAYS,
    OUTCOME_RESOLVED_LATE,
    OUTCOME_RESOLVED_WITHIN_SLA,
    OUTCOME_STILL_OPEN_GRACE,
    OUTCOME_STILL_OPEN_OVERDUE,
    SURFACE,
    compute_clinician_outcome_summary,
    compute_flag_type_breakdown,
    compute_resolver_latency_summary,
    compute_trend_buckets,
    evidence_gap_open_overdue_count,
    median_days_to_resolve,
    p90_days_to_resolve,
    pair_creates_with_resolutions,
)


router = APIRouter(
    prefix="/api/v1/qeeg-annotation-outcome-tracker",
    tags=["qEEG Annotation Outcome Tracker"],
)
_log = logging.getLogger(__name__)


OUTCOME_TRACKER_DISCLAIMERS = [
    "qEEG Annotation Outcome Tracker pairs each QEEGReportAnnotation "
    "row's created_at with its resolved_at (or absence) and classifies "
    "the outcome (resolved_within_sla / resolved_late / "
    "still_open_overdue / still_open_grace).",
    "Median + p90 days_to_resolve are computed over decided pairs "
    "(resolved_within_sla + resolved_late) only — open rows are "
    "excluded from the latency summary because they have not yet "
    "resolved.",
    "evidence_gap_open_overdue_count surfaces FDA-questioned findings "
    "(per deepsynaps-qeeg-evidence-gaps memory) that have aged past "
    "the SLA window without resolution.",
    "outcome_pct excludes still_open_grace from the denominator (rows "
    "still within the SLA window — fair-chance principle).",
    "Backlog is a snapshot of still_open_overdue rows; click-through "
    "navigates to the Brain Map report so the clinician can resolve "
    "the annotation in-context.",
]


BODY_TRUNC_LEN = 200
REDACTED_BODY = "[redacted: cross-clinic]"


_BACKLOG_PAGE_SIZE_MAX = 100


# ── Helpers ────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
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


def _normalize_sla(value: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return DEFAULT_SLA_DAYS
    if v < MIN_SLA_DAYS:
        return MIN_SLA_DAYS
    if v > MAX_SLA_DAYS:
        return MAX_SLA_DAYS
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
        f"{SURFACE}-{event}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
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
        _log.exception("QEEG-ANN2 audit emit skipped")
    return eid


def _resolve_user_names(
    db: Session, user_ids: list[str]
) -> dict[str, Optional[str]]:
    if not user_ids:
        return {}
    rows = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: getattr(u, "display_name", None) for u in rows}


def _redact_for_patient(
    actor: AuthenticatedActor, patient_id: str, db: Session
) -> bool:
    """Return ``True`` if the body must be redacted (gate denies).

    Records returned from :func:`pair_creates_with_resolutions` are
    already clinic-scoped, but this is a belt-and-braces extra check
    per ``deepsynaps-qeeg-pdf-export-tenant-gate`` memory.
    """
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        return False
    try:
        require_patient_owner(actor, clinic_id)
    except Exception:
        return True
    return False


def _truncate_body(body: Optional[str]) -> Optional[str]:
    if body is None:
        return None
    s = str(body)
    if len(s) <= BODY_TRUNC_LEN:
        return s
    return s[:BODY_TRUNC_LEN] + "…"


# ── Schemas ────────────────────────────────────────────────────────────────


class OutcomeCountsOut(BaseModel):
    resolved_within_sla: int = 0
    resolved_late: int = 0
    still_open_overdue: int = 0
    still_open_grace: int = 0


class OutcomePctOut(BaseModel):
    resolved_within_sla: float = 0.0
    resolved_late: float = 0.0
    still_open_overdue: float = 0.0


class FlagTypeStatsOut(BaseModel):
    total: int = 0
    resolved_within_sla: int = 0
    resolved_late: int = 0
    still_open_overdue: int = 0
    still_open_grace: int = 0
    median_days_to_resolve: Optional[float] = None


class TrendBucketOut(BaseModel):
    week_start: str
    created: int = 0
    resolved: int = 0
    abandoned: int = 0


class SummaryOut(BaseModel):
    window_days: int
    sla_days: int
    total_annotations: int = 0
    outcome_counts: OutcomeCountsOut = Field(default_factory=OutcomeCountsOut)
    outcome_pct: OutcomePctOut = Field(default_factory=OutcomePctOut)
    median_days_to_resolve: Optional[float] = None
    p90_days_to_resolve: Optional[float] = None
    by_flag_type: dict[str, FlagTypeStatsOut] = Field(default_factory=dict)
    evidence_gap_open_overdue_count: int = 0
    trend_buckets: list[TrendBucketOut] = Field(default_factory=list)
    clinic_id: Optional[str] = None
    disclaimers: list[str] = Field(
        default_factory=lambda: list(OUTCOME_TRACKER_DISCLAIMERS)
    )


class ClinicianCreatorRowOut(BaseModel):
    creator_user_id: str
    creator_name: Optional[str] = None
    total_created: int = 0
    resolved_within_sla_count: int = 0
    resolved_late_count: int = 0
    still_open_overdue_count: int = 0
    still_open_grace_count: int = 0
    median_days_to_resolve: Optional[float] = None
    last_created_at: Optional[str] = None


class ClinicianCreatorSummaryOut(BaseModel):
    items: list[ClinicianCreatorRowOut] = Field(default_factory=list)
    window_days: int
    min_created: int = 2
    clinic_id: Optional[str] = None


class ResolverLatencyRowOut(BaseModel):
    resolver_user_id: str
    resolver_name: Optional[str] = None
    total_resolved: int = 0
    median_days_to_resolve: Optional[float] = None
    p90_days_to_resolve: Optional[float] = None
    last_resolved_at: Optional[str] = None


class ResolverLatencySummaryOut(BaseModel):
    items: list[ResolverLatencyRowOut] = Field(default_factory=list)
    window_days: int
    min_resolved: int = 2
    clinic_id: Optional[str] = None


class BacklogRowOut(BaseModel):
    annotation_id: str
    creator_user_id: str
    creator_name: Optional[str] = None
    created_at: str
    days_open: float
    kind: str
    flag_type: Optional[str] = None
    report_id: str
    patient_id: str
    body: Optional[str] = None


class BacklogListOut(BaseModel):
    items: list[BacklogRowOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 25
    include_grace: bool = False
    window_days: int
    sla_days: int
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
    sla_days: int = Query(default=DEFAULT_SLA_DAYS),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SummaryOut:
    """Cohort summary with outcome counts/pct, latency, evidence-gap
    overdue surfacing, by-flag-type breakdown, weekly trend."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    sla = _normalize_sla(sla_days)

    if not cid:
        return SummaryOut(
            window_days=w, sla_days=sla, total_annotations=0, clinic_id=None
        )

    records = pair_creates_with_resolutions(
        db, cid, window_days=w, sla_days=sla
    )

    counts = OutcomeCountsOut(
        resolved_within_sla=sum(
            1 for r in records if r.outcome == OUTCOME_RESOLVED_WITHIN_SLA
        ),
        resolved_late=sum(
            1 for r in records if r.outcome == OUTCOME_RESOLVED_LATE
        ),
        still_open_overdue=sum(
            1 for r in records if r.outcome == OUTCOME_STILL_OPEN_OVERDUE
        ),
        still_open_grace=sum(
            1 for r in records if r.outcome == OUTCOME_STILL_OPEN_GRACE
        ),
    )
    # Pct excludes grace (still within SLA — fair-chance principle).
    denom = (
        counts.resolved_within_sla
        + counts.resolved_late
        + counts.still_open_overdue
    )
    if denom > 0:
        pct = OutcomePctOut(
            resolved_within_sla=round(
                100.0 * counts.resolved_within_sla / denom, 1
            ),
            resolved_late=round(100.0 * counts.resolved_late / denom, 1),
            still_open_overdue=round(
                100.0 * counts.still_open_overdue / denom, 1
            ),
        )
    else:
        pct = OutcomePctOut()

    median = median_days_to_resolve(records)
    p90 = p90_days_to_resolve(records)

    flag_breakdown = compute_flag_type_breakdown(records)
    by_flag_out = {
        ft: FlagTypeStatsOut(
            total=int(b.get("total", 0)),
            resolved_within_sla=int(b.get(OUTCOME_RESOLVED_WITHIN_SLA, 0)),
            resolved_late=int(b.get(OUTCOME_RESOLVED_LATE, 0)),
            still_open_overdue=int(b.get(OUTCOME_STILL_OPEN_OVERDUE, 0)),
            still_open_grace=int(b.get(OUTCOME_STILL_OPEN_GRACE, 0)),
            median_days_to_resolve=b.get("median_days_to_resolve"),
        )
        for ft, b in flag_breakdown.items()
    }

    eg_overdue = evidence_gap_open_overdue_count(records)
    trend = compute_trend_buckets(records, window_days=w)

    _emit_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=cid or actor.actor_id,
        note=(
            f"window_days={w} sla_days={sla} "
            f"total={len(records)} "
            f"evidence_gap_overdue={eg_overdue}"
        ),
    )

    return SummaryOut(
        window_days=w,
        sla_days=sla,
        total_annotations=len(records),
        outcome_counts=counts,
        outcome_pct=pct,
        median_days_to_resolve=median,
        p90_days_to_resolve=p90,
        by_flag_type=by_flag_out,
        evidence_gap_open_overdue_count=eg_overdue,
        trend_buckets=[TrendBucketOut(**b) for b in trend],
        clinic_id=cid,
    )


@router.get(
    "/clinician-creator-summary",
    response_model=ClinicianCreatorSummaryOut,
)
def clinician_creator_summary(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS),
    sla_days: int = Query(default=DEFAULT_SLA_DAYS),
    min_created: int = Query(default=2, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ClinicianCreatorSummaryOut:
    """Per-creator (clinician who raised flags) summary."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    sla = _normalize_sla(sla_days)

    if not cid:
        return ClinicianCreatorSummaryOut(
            items=[], window_days=w, min_created=min_created, clinic_id=None
        )

    records = pair_creates_with_resolutions(
        db, cid, window_days=w, sla_days=sla
    )
    grouped = compute_clinician_outcome_summary(records)
    filtered = {
        uid: stats
        for uid, stats in grouped.items()
        if int(stats["total_created"]) >= min_created
    }
    name_lookup = _resolve_user_names(db, list(filtered.keys()))

    items_sorted = sorted(
        filtered.items(),
        key=lambda kv: (-int(kv[1]["total_created"]), kv[0]),
    )
    items = [
        ClinicianCreatorRowOut(
            creator_user_id=uid,
            creator_name=name_lookup.get(uid),
            total_created=int(stats["total_created"]),
            resolved_within_sla_count=int(stats["resolved_within_sla_count"]),
            resolved_late_count=int(stats["resolved_late_count"]),
            still_open_overdue_count=int(stats["still_open_overdue_count"]),
            still_open_grace_count=int(stats["still_open_grace_count"]),
            median_days_to_resolve=stats.get("median_days_to_resolve"),
            last_created_at=stats.get("last_created_at"),
        )
        for uid, stats in items_sorted
    ]
    return ClinicianCreatorSummaryOut(
        items=items, window_days=w, min_created=min_created, clinic_id=cid
    )


@router.get(
    "/resolver-latency-summary", response_model=ResolverLatencySummaryOut
)
def resolver_latency_summary(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS),
    sla_days: int = Query(default=DEFAULT_SLA_DAYS),
    min_resolved: int = Query(default=2, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ResolverLatencySummaryOut:
    """Per-resolver latency summary (median + p90)."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    sla = _normalize_sla(sla_days)

    if not cid:
        return ResolverLatencySummaryOut(
            items=[], window_days=w, min_resolved=min_resolved, clinic_id=None
        )

    records = pair_creates_with_resolutions(
        db, cid, window_days=w, sla_days=sla
    )
    grouped = compute_resolver_latency_summary(records)
    filtered = {
        uid: stats
        for uid, stats in grouped.items()
        if int(stats["total_resolved"]) >= min_resolved
    }
    name_lookup = _resolve_user_names(db, list(filtered.keys()))

    # Sort by median_days_to_resolve asc (fastest resolver first).
    items_sorted = sorted(
        filtered.items(),
        key=lambda kv: (
            kv[1].get("median_days_to_resolve") or 0,
            -int(kv[1]["total_resolved"]),
        ),
    )
    items = [
        ResolverLatencyRowOut(
            resolver_user_id=uid,
            resolver_name=name_lookup.get(uid),
            total_resolved=int(stats["total_resolved"]),
            median_days_to_resolve=stats.get("median_days_to_resolve"),
            p90_days_to_resolve=stats.get("p90_days_to_resolve"),
            last_resolved_at=stats.get("last_resolved_at"),
        )
        for uid, stats in items_sorted
    ]
    return ResolverLatencySummaryOut(
        items=items, window_days=w, min_resolved=min_resolved, clinic_id=cid
    )


@router.get("/backlog", response_model=BacklogListOut)
def backlog(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS),
    sla_days: int = Query(default=DEFAULT_SLA_DAYS),
    include_grace: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=_BACKLOG_PAGE_SIZE_MAX),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> BacklogListOut:
    """Paginated backlog of still_open_overdue annotations.

    With ``include_grace=true`` also surfaces still_open_grace rows so
    the clinician can see what's about to age out. Body is truncated to
    ``BODY_TRUNC_LEN`` chars; if the patient gate denies for a
    particular row (defence-in-depth) the body is replaced with
    ``REDACTED_BODY``.
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    sla = _normalize_sla(sla_days)

    if not cid:
        return BacklogListOut(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            include_grace=include_grace,
            window_days=w,
            sla_days=sla,
            clinic_id=None,
        )

    records = pair_creates_with_resolutions(
        db, cid, window_days=w, sla_days=sla
    )
    if include_grace:
        open_records = [
            r
            for r in records
            if r.outcome
            in (OUTCOME_STILL_OPEN_OVERDUE, OUTCOME_STILL_OPEN_GRACE)
        ]
    else:
        open_records = [
            r for r in records if r.outcome == OUTCOME_STILL_OPEN_OVERDUE
        ]

    # Most-overdue first (largest days_open at top).
    open_records.sort(key=lambda r: r.days_open, reverse=True)

    total = len(open_records)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = open_records[start:end]

    name_lookup = _resolve_user_names(
        db, list({r.creator_user_id for r in page_items if r.creator_user_id})
    )

    out_items: list[BacklogRowOut] = []
    for r in page_items:
        body_out: Optional[str]
        if _redact_for_patient(actor, r.patient_id, db):
            body_out = REDACTED_BODY
        else:
            body_out = _truncate_body(r.body)
        out_items.append(
            BacklogRowOut(
                annotation_id=r.annotation_id,
                creator_user_id=r.creator_user_id,
                creator_name=name_lookup.get(r.creator_user_id),
                created_at=r.created_at.isoformat(),
                days_open=r.days_open,
                kind=r.kind,
                flag_type=r.flag_type,
                report_id=r.report_id,
                patient_id=r.patient_id,
                body=body_out,
            )
        )

    return BacklogListOut(
        items=out_items,
        total=total,
        page=page,
        page_size=page_size,
        include_grace=include_grace,
        window_days=w,
        sla_days=sla,
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
    """Clinic-scoped audit-event list for the QEEG-ANN2 surface."""
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
