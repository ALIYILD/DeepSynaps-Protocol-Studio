"""Rotation Policy Advisor Threshold Adoption Outcome Tracker
(CSAHP7, 2026-05-02).

Pair each ``auth_drift_rotation_policy_advisor.threshold_adopted``
audit row at time T with the same ``(advice_code, threshold_key)``
pair's measured **predictive accuracy** at ``T+30d`` (post-adoption)
versus the **baseline accuracy** at ``T`` (pre-adoption).

Closes the meta-loop on the meta-loop:

* CSAHP4 (#428) emits heuristic advice cards from hardcoded thresholds.
* CSAHP5 (#434) measures predictive accuracy per advice code.
* CSAHP6 (#438) lets admins adopt new thresholds when replay shows
  improved accuracy.
* CSAHP7 (this router) measures whether adopted thresholds actually
  delivered the promised improvement in production.

Endpoints
=========

* ``GET /api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/summary``
  Cohort summary — outcome counts, by-advice-code rollup, weekly trend.
* ``GET /api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/adopter-calibration``
  Per-adopter calibration table.
* ``GET /api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/list``
  Paginated paired-record list.
* ``GET /api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/audit-events``
  Page-level audit event listing scoped to the surface.
* ``POST /api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker/audit-events``
  Page-level audit ingestion.

Cross-clinic safety: every endpoint scopes by ``actor.clinic_id`` and
the underlying pairing service filters audit rows by
``clinic_id={cid}`` substring needle.
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
from app.persistence.models import AuditEventRecord
from app.services.threshold_adoption_outcome_pairing import (
    DEFAULT_PAIR_LOOKAHEAD_DAYS,
    DEFAULT_WINDOW_DAYS,
    MAX_PAIR_LOOKAHEAD_DAYS,
    MAX_WINDOW_DAYS,
    MIN_PAIR_LOOKAHEAD_DAYS,
    MIN_WINDOW_DAYS,
    OUTCOME_FLAT,
    OUTCOME_IMPROVED,
    OUTCOME_INSUFFICIENT_DATA,
    OUTCOME_PENDING,
    OUTCOME_REGRESSED,
    AdoptionOutcomeRecord,
    compute_adopter_calibration,
    compute_by_advice_code,
    compute_median_accuracy_delta,
    compute_outcome_counts,
    compute_outcome_pct,
    compute_weekly_trend_buckets,
    pair_adoptions_with_outcomes,
)


router = APIRouter(
    prefix="/api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker",
    tags=["Rotation Policy Advisor Threshold Adoption Outcome Tracker"],
)
_log = logging.getLogger(__name__)


# Page-level surface (target_type) for self-rows.
SURFACE = "rotation_policy_advisor_threshold_adoption_outcome_tracker"


# ── Helpers ────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    if actor.role in {"admin", "clinician"}:
        return actor.role
    return "clinician"


def _normalize_window(window_days: int) -> int:
    if window_days is None:
        return DEFAULT_WINDOW_DAYS
    try:
        w = int(window_days)
    except Exception:
        return DEFAULT_WINDOW_DAYS
    if w < MIN_WINDOW_DAYS:
        return MIN_WINDOW_DAYS
    if w > MAX_WINDOW_DAYS:
        return MAX_WINDOW_DAYS
    return w


def _normalize_lookahead(look: int) -> int:
    try:
        v = int(look)
    except Exception:
        return DEFAULT_PAIR_LOOKAHEAD_DAYS
    if v < MIN_PAIR_LOOKAHEAD_DAYS:
        return MIN_PAIR_LOOKAHEAD_DAYS
    if v > MAX_PAIR_LOOKAHEAD_DAYS:
        return MAX_PAIR_LOOKAHEAD_DAYS
    return v


def _emit_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    target_type: str,
    action: str,
    note: str,
    role: Optional[str] = None,
) -> str:
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{target_type}-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(target_id) or actor.actor_id,
            target_type=target_type,
            action=action,
            role=role or _safe_audit_role(actor),
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _log.exception("CSAHP7 audit emit skipped")
    return eid


# ── Schemas ────────────────────────────────────────────────────────────────


class CodeAggregateOut(BaseModel):
    total_adoptions: int = 0
    improved_count: int = 0
    regressed_count: int = 0
    flat_count: int = 0
    pending_count: int = 0
    insufficient_count: int = 0
    mean_accuracy_delta: float = 0.0


class TrendBucketOut(BaseModel):
    week_start: str
    improved: int = 0
    regressed: int = 0


class OutcomeCountsOut(BaseModel):
    improved: int = 0
    regressed: int = 0
    flat: int = 0
    pending: int = 0
    insufficient_data: int = 0


class OutcomePctOut(BaseModel):
    improved: float = 0.0
    regressed: float = 0.0
    flat: float = 0.0


class SummaryOut(BaseModel):
    window_days: int
    pair_lookahead_days: int
    total_adoptions: int = 0
    outcome_counts: OutcomeCountsOut = Field(default_factory=OutcomeCountsOut)
    outcome_pct: OutcomePctOut = Field(default_factory=OutcomePctOut)
    by_advice_code: dict[str, CodeAggregateOut] = Field(default_factory=dict)
    median_accuracy_delta: Optional[float] = None
    trend_buckets: list[TrendBucketOut] = Field(default_factory=list)
    clinic_id: Optional[str] = None


class AdopterCalibrationOut(BaseModel):
    adopter_user_id: str
    total_adoptions: int = 0
    improved_count: int = 0
    regressed_count: int = 0
    flat_count: int = 0
    pending_count: int = 0
    insufficient_count: int = 0
    improved_pct: float = 0.0
    regressed_pct: float = 0.0
    mean_accuracy_delta: float = 0.0
    calibration_score: float = 0.0


class AdopterCalibrationListOut(BaseModel):
    items: list[AdopterCalibrationOut] = Field(default_factory=list)
    total: int = 0
    window_days: int
    min_adoptions: int = 1
    clinic_id: Optional[str] = None


class AdoptionRecordOut(BaseModel):
    adoption_event_id: str
    advice_code: str
    threshold_key: str
    previous_value: Optional[float] = None
    new_value: float
    adopter_user_id: str
    justification: str
    adopted_at: str
    baseline_accuracy_pct: Optional[float] = None
    post_adoption_accuracy_pct: Optional[float] = None
    accuracy_delta: Optional[float] = None
    baseline_sample_size: int = 0
    post_adoption_sample_size: int = 0
    outcome: str


class AdoptionListOut(BaseModel):
    items: list[AdoptionRecordOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 25
    window_days: int
    pair_lookahead_days: int
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


class PageAuditIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    target_id: Optional[str] = Field(default=None, max_length=128)


class PageAuditOut(BaseModel):
    accepted: bool
    event_id: str


# ── Conversions ────────────────────────────────────────────────────────────


def _record_to_out(r: AdoptionOutcomeRecord) -> AdoptionRecordOut:
    return AdoptionRecordOut(
        adoption_event_id=r.adoption_event_id,
        advice_code=r.advice_code,
        threshold_key=r.threshold_key,
        previous_value=r.previous_value,
        new_value=r.new_value,
        adopter_user_id=r.adopter_user_id,
        justification=r.justification,
        adopted_at=r.adopted_at.isoformat(),
        baseline_accuracy_pct=r.baseline_accuracy_pct,
        post_adoption_accuracy_pct=r.post_adoption_accuracy_pct,
        accuracy_delta=r.accuracy_delta,
        baseline_sample_size=r.baseline_sample_size,
        post_adoption_sample_size=r.post_adoption_sample_size,
        outcome=r.outcome,
    )


def _agg_to_out(d: dict[str, float | int]) -> CodeAggregateOut:
    return CodeAggregateOut(
        total_adoptions=int(d.get("total_adoptions", 0) or 0),
        improved_count=int(d.get("improved_count", 0) or 0),
        regressed_count=int(d.get("regressed_count", 0) or 0),
        flat_count=int(d.get("flat_count", 0) or 0),
        pending_count=int(d.get("pending_count", 0) or 0),
        insufficient_count=int(d.get("insufficient_count", 0) or 0),
        mean_accuracy_delta=float(d.get("mean_accuracy_delta", 0.0) or 0.0),
    )


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/summary", response_model=SummaryOut)
def summary(
    window_days: int = Query(
        default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS
    ),
    pair_lookahead_days: int = Query(
        default=DEFAULT_PAIR_LOOKAHEAD_DAYS,
        ge=1,
        le=MAX_PAIR_LOOKAHEAD_DAYS,
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SummaryOut:
    """Cohort summary — outcome counts, by-advice-code rollup, weekly
    trend, median accuracy delta."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    look = _normalize_lookahead(pair_lookahead_days)

    if not cid:
        return SummaryOut(
            window_days=w,
            pair_lookahead_days=look,
            total_adoptions=0,
            outcome_counts=OutcomeCountsOut(),
            outcome_pct=OutcomePctOut(),
            by_advice_code={},
            median_accuracy_delta=None,
            trend_buckets=[],
            clinic_id=None,
        )

    records = pair_adoptions_with_outcomes(
        db, clinic_id=cid, window_days=w, pair_lookahead_days=look
    )

    counts_raw = compute_outcome_counts(records)
    pct_raw = compute_outcome_pct(counts_raw)
    by_code_raw = compute_by_advice_code(records)
    median_delta = compute_median_accuracy_delta(records)
    trend = compute_weekly_trend_buckets(records, window_days=w)

    by_code: dict[str, CodeAggregateOut] = {
        code: _agg_to_out(agg) for code, agg in by_code_raw.items()
    }

    return SummaryOut(
        window_days=w,
        pair_lookahead_days=look,
        total_adoptions=len(records),
        outcome_counts=OutcomeCountsOut(
            improved=counts_raw.get(OUTCOME_IMPROVED, 0),
            regressed=counts_raw.get(OUTCOME_REGRESSED, 0),
            flat=counts_raw.get(OUTCOME_FLAT, 0),
            pending=counts_raw.get(OUTCOME_PENDING, 0),
            insufficient_data=counts_raw.get(OUTCOME_INSUFFICIENT_DATA, 0),
        ),
        outcome_pct=OutcomePctOut(
            improved=float(pct_raw.get(OUTCOME_IMPROVED, 0.0)),
            regressed=float(pct_raw.get(OUTCOME_REGRESSED, 0.0)),
            flat=float(pct_raw.get(OUTCOME_FLAT, 0.0)),
        ),
        by_advice_code=by_code,
        median_accuracy_delta=median_delta,
        trend_buckets=[
            TrendBucketOut(
                week_start=str(b["week_start"]),
                improved=int(b["improved"]),
                regressed=int(b["regressed"]),
            )
            for b in trend
        ],
        clinic_id=cid,
    )


@router.get("/adopter-calibration", response_model=AdopterCalibrationListOut)
def adopter_calibration(
    window_days: int = Query(
        default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS
    ),
    pair_lookahead_days: int = Query(
        default=DEFAULT_PAIR_LOOKAHEAD_DAYS,
        ge=1,
        le=MAX_PAIR_LOOKAHEAD_DAYS,
    ),
    min_adoptions: int = Query(default=2, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdopterCalibrationListOut:
    """Per-adopter calibration table. Filters out adopters below the
    ``min_adoptions`` threshold so a single adoption doesn't drive the
    score either way. Sorted by ``calibration_score`` descending."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    look = _normalize_lookahead(pair_lookahead_days)

    if not cid:
        return AdopterCalibrationListOut(
            items=[],
            total=0,
            window_days=w,
            min_adoptions=min_adoptions,
            clinic_id=None,
        )

    records = pair_adoptions_with_outcomes(
        db, clinic_id=cid, window_days=w, pair_lookahead_days=look
    )
    cal = compute_adopter_calibration(records)

    items: list[AdopterCalibrationOut] = []
    for rid, slot in cal.items():
        total = int(slot.get("total_adoptions", 0) or 0)
        if total < min_adoptions:
            continue
        items.append(
            AdopterCalibrationOut(
                adopter_user_id=rid,
                total_adoptions=total,
                improved_count=int(slot.get("improved_count", 0) or 0),
                regressed_count=int(slot.get("regressed_count", 0) or 0),
                flat_count=int(slot.get("flat_count", 0) or 0),
                pending_count=int(slot.get("pending_count", 0) or 0),
                insufficient_count=int(
                    slot.get("insufficient_count", 0) or 0
                ),
                improved_pct=float(slot.get("improved_pct", 0.0) or 0.0),
                regressed_pct=float(slot.get("regressed_pct", 0.0) or 0.0),
                mean_accuracy_delta=float(
                    slot.get("mean_accuracy_delta", 0.0) or 0.0
                ),
                calibration_score=float(
                    slot.get("calibration_score", 0.0) or 0.0
                ),
            )
        )
    items.sort(key=lambda x: x.calibration_score, reverse=True)

    return AdopterCalibrationListOut(
        items=items,
        total=len(items),
        window_days=w,
        min_adoptions=min_adoptions,
        clinic_id=cid,
    )


@router.get("/list", response_model=AdoptionListOut)
def list_adoptions(
    window_days: int = Query(
        default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS
    ),
    pair_lookahead_days: int = Query(
        default=DEFAULT_PAIR_LOOKAHEAD_DAYS,
        ge=1,
        le=MAX_PAIR_LOOKAHEAD_DAYS,
    ),
    advice_code: Optional[str] = Query(default=None, max_length=64),
    outcome: Optional[str] = Query(default=None, max_length=32),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdoptionListOut:
    """Paginated list of paired (adoption → outcome) records."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    look = _normalize_lookahead(pair_lookahead_days)

    if not cid:
        return AdoptionListOut(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            window_days=w,
            pair_lookahead_days=look,
            clinic_id=None,
        )

    records = pair_adoptions_with_outcomes(
        db, clinic_id=cid, window_days=w, pair_lookahead_days=look
    )

    if advice_code:
        ac = advice_code.strip().upper()
        records = [r for r in records if r.advice_code == ac]
    if outcome:
        oc = outcome.strip().lower()
        records = [r for r in records if r.outcome == oc]

    records.sort(key=lambda r: r.adopted_at, reverse=True)

    total = len(records)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = records[start:end]

    return AdoptionListOut(
        items=[_record_to_out(r) for r in page_items],
        total=total,
        page=page,
        page_size=page_size,
        window_days=w,
        pair_lookahead_days=look,
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
    """Clinic-scoped paginated audit-event list for the threshold
    adoption outcome tracker surface."""
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


@router.post("/audit-events", response_model=PageAuditOut)
def post_audit_event(
    body: PageAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PageAuditOut:
    """Page-level audit ingestion under
    ``target_type='rotation_policy_advisor_threshold_adoption_outcome_tracker'``."""
    _gate_read(actor)
    target = body.target_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if actor.clinic_id:
        note_parts.append(f"clinic_id={actor.clinic_id}")
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    eid = _emit_audit(
        db,
        actor,
        event=body.event,
        target_id=target,
        target_type=SURFACE,
        action=f"{SURFACE}.{body.event}",
        note=note,
    )
    return PageAuditOut(accepted=True, event_id=eid)


__all__ = ["router", "SURFACE"]
