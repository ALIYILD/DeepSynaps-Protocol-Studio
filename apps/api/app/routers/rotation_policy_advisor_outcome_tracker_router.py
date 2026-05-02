"""Rotation Policy Advisor Outcome Tracker (CSAHP5, 2026-05-02).

Calibration-accuracy dashboard for the CSAHP4 rotation policy advice
cards. Pairs each ``auth_drift_rotation_policy_advisor.advice_snapshot``
audit row at time T (emitted by the CSAHP5 background snapshot worker)
with the same-key snapshot at ``T + pair_lookahead_days`` (default 14d,
±2d tolerance), classifies the outcome
(``paired_present`` / ``paired_disappeared`` / ``pending`` / ``stale``),
and computes per-advice-code predictive accuracy:

    Did the advice card actually predict that the underlying metric
    would improve — i.e., did the card stop appearing 14 days after
    the clinic acted on it?

If the card disappeared at T+14d, the advice was acted upon AND the
metric improved enough to drop below the rule threshold. The aggregate
``card_disappeared_pct`` is the predictive_accuracy_pct surfaced to
admins.

Endpoints
=========

* ``GET /api/v1/rotation-policy-advisor-outcome-tracker/summary``
  Cohort summary — counts, by-advice-code rollup, by-channel rollup,
  weekly trend buckets.
* ``GET /api/v1/rotation-policy-advisor-outcome-tracker/list``
  Paginated paired-record list with filters.
* ``POST /api/v1/rotation-policy-advisor-outcome-tracker/run-snapshot-now``
  Admin-only — calls ``worker.tick(actor.clinic_id)`` once.
* ``GET /api/v1/rotation-policy-advisor-outcome-tracker/audit-events``
  Paginated audit-event list scoped to clinic + this surface.
* ``POST /api/v1/rotation-policy-advisor-outcome-tracker/audit-events``
  Page-level audit ingestion.

Cross-clinic safety: every endpoint scopes by ``actor.clinic_id``.
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
from app.services.advisor_outcome_pairing import (
    DEFAULT_PAIR_LOOKAHEAD_DAYS,
    DEFAULT_WINDOW_DAYS,
    KNOWN_ADVICE_CODES,
    MAX_WINDOW_DAYS,
    MIN_WINDOW_DAYS,
    OUTCOME_PAIRED_DISAPPEARED,
    OUTCOME_PAIRED_PRESENT,
    OUTCOME_PENDING,
    OUTCOME_STALE,
    AdvisorOutcomeRecord,
    compute_advisor_calibration,
    compute_advisor_calibration_by_channel,
    compute_weekly_trend_buckets,
    pair_advice_with_outcomes,
)
from app.workers.rotation_policy_advisor_snapshot_worker import (
    env_enabled as snapshot_worker_env_enabled,
    get_worker as get_snapshot_worker,
)


router = APIRouter(
    prefix="/api/v1/rotation-policy-advisor-outcome-tracker",
    tags=["Rotation Policy Advisor Outcome Tracker"],
)
_log = logging.getLogger(__name__)


# Page-level surface (target_type) for self-rows.
SURFACE = "rotation_policy_advisor_outcome_tracker"


# ── Helpers ────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_admin(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


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
    if v < 1:
        return 1
    if v > 90:
        return 90
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
        _log.exception("CSAHP5 audit emit skipped")
    return eid


# ── Schemas ────────────────────────────────────────────────────────────────


class CodeAggregateOut(BaseModel):
    total_cards: int = 0
    total_pending: int = 0
    card_disappeared_count: int = 0
    card_disappeared_pct: float = 0.0
    predictive_accuracy_pct: float = 0.0
    mean_re_flag_rate_delta: float = 0.0


class TrendBucketOut(BaseModel):
    week_start: str
    cards_emitted: int = 0
    cards_resolved: int = 0


class SummaryOut(BaseModel):
    window_days: int
    pair_lookahead_days: int
    total_paired_cards: int = 0
    total_pending_cards: int = 0
    total_disappeared_cards: int = 0
    by_advice_code: dict[str, CodeAggregateOut] = Field(default_factory=dict)
    by_channel: dict[str, CodeAggregateOut] = Field(default_factory=dict)
    trend_buckets: list[TrendBucketOut] = Field(default_factory=list)
    worker_enabled: bool = False
    clinic_id: Optional[str] = None


class PairedRecordOut(BaseModel):
    channel: str
    advice_code: str
    severity: str
    snapshot_at: str
    paired_at: Optional[str] = None
    re_flag_rate_pct_t0: float
    re_flag_rate_pct_t1: Optional[float] = None
    re_flag_rate_delta: Optional[float] = None
    confirmed_count_t0: int
    confirmed_count_t1: Optional[int] = None
    confirmed_count_delta: Optional[int] = None
    manual_rotation_share_pct_t0: float
    manual_rotation_share_pct_t1: Optional[float] = None
    manual_rotation_share_delta: Optional[float] = None
    card_disappeared: bool
    outcome: str
    snapshot_event_id: str


class PairedListOut(BaseModel):
    items: list[PairedRecordOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 25
    window_days: int
    pair_lookahead_days: int
    clinic_id: Optional[str] = None


class RunSnapshotNowOut(BaseModel):
    accepted: bool
    clinics_scanned: int
    snapshot_runs: int
    total_advice_cards: int
    skipped_cooldown: int
    errors: int
    elapsed_ms: int
    snapshot_run_audit_event_ids: list[str] = Field(default_factory=list)
    advice_snapshot_audit_event_ids: list[str] = Field(default_factory=list)


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


# ── Aggregation helper ────────────────────────────────────────────────────


def _agg_to_out(d: dict[str, float | int]) -> CodeAggregateOut:
    return CodeAggregateOut(
        total_cards=int(d.get("total_cards", 0) or 0),
        total_pending=int(d.get("total_pending", 0) or 0),
        card_disappeared_count=int(d.get("card_disappeared_count", 0) or 0),
        card_disappeared_pct=float(d.get("card_disappeared_pct", 0.0) or 0.0),
        predictive_accuracy_pct=float(
            d.get("predictive_accuracy_pct", 0.0) or 0.0
        ),
        mean_re_flag_rate_delta=float(
            d.get("mean_re_flag_rate_delta", 0.0) or 0.0
        ),
    )


def _record_to_out(r: AdvisorOutcomeRecord) -> PairedRecordOut:
    return PairedRecordOut(
        channel=r.channel,
        advice_code=r.advice_code,
        severity=r.severity,
        snapshot_at=r.snapshot_at.isoformat(),
        paired_at=r.paired_at.isoformat() if r.paired_at is not None else None,
        re_flag_rate_pct_t0=r.re_flag_rate_pct_t0,
        re_flag_rate_pct_t1=r.re_flag_rate_pct_t1,
        re_flag_rate_delta=r.re_flag_rate_delta,
        confirmed_count_t0=r.confirmed_count_t0,
        confirmed_count_t1=r.confirmed_count_t1,
        confirmed_count_delta=r.confirmed_count_delta,
        manual_rotation_share_pct_t0=r.manual_rotation_share_pct_t0,
        manual_rotation_share_pct_t1=r.manual_rotation_share_pct_t1,
        manual_rotation_share_delta=r.manual_rotation_share_delta,
        card_disappeared=r.card_disappeared,
        outcome=r.outcome,
        snapshot_event_id=r.snapshot_event_id,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/summary", response_model=SummaryOut)
def summary(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS),
    pair_lookahead_days: int = Query(
        default=DEFAULT_PAIR_LOOKAHEAD_DAYS, ge=1, le=90
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SummaryOut:
    """Cohort summary — by-advice-code + by-channel + weekly trend."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    look = _normalize_lookahead(pair_lookahead_days)

    if not cid:
        # Empty clinic — return zeroed structure with all advice codes
        # populated so the frontend renders consistent KPI tiles.
        empty_codes = {
            code: CodeAggregateOut() for code in KNOWN_ADVICE_CODES
        }
        return SummaryOut(
            window_days=w,
            pair_lookahead_days=look,
            total_paired_cards=0,
            total_pending_cards=0,
            total_disappeared_cards=0,
            by_advice_code=empty_codes,
            by_channel={},
            trend_buckets=[],
            worker_enabled=snapshot_worker_env_enabled(),
            clinic_id=None,
        )

    records = pair_advice_with_outcomes(
        db, clinic_id=cid, window_days=w, pair_lookahead_days=look
    )

    by_code_raw = compute_advisor_calibration(records)
    by_channel_raw = compute_advisor_calibration_by_channel(records)
    trend = compute_weekly_trend_buckets(records, window_days=w)

    by_code: dict[str, CodeAggregateOut] = {}
    # Always include all known codes so the UI can render consistent tiles.
    for code in KNOWN_ADVICE_CODES:
        by_code[code] = _agg_to_out(by_code_raw.get(code, {}))
    # Also include any unrecognised codes the worker may emit.
    for code, agg in by_code_raw.items():
        if code not in by_code:
            by_code[code] = _agg_to_out(agg)

    by_channel: dict[str, CodeAggregateOut] = {
        ch: _agg_to_out(agg) for ch, agg in by_channel_raw.items()
    }

    paired_total = sum(
        1 for r in records
        if r.outcome in (OUTCOME_PAIRED_PRESENT, OUTCOME_PAIRED_DISAPPEARED)
    )
    pending_total = sum(
        1 for r in records if r.outcome == OUTCOME_PENDING
    )
    disappeared_total = sum(
        1 for r in records if r.outcome == OUTCOME_PAIRED_DISAPPEARED
    )

    return SummaryOut(
        window_days=w,
        pair_lookahead_days=look,
        total_paired_cards=paired_total,
        total_pending_cards=pending_total,
        total_disappeared_cards=disappeared_total,
        by_advice_code=by_code,
        by_channel=by_channel,
        trend_buckets=[
            TrendBucketOut(
                week_start=str(b["week_start"]),
                cards_emitted=int(b["cards_emitted"]),
                cards_resolved=int(b["cards_resolved"]),
            )
            for b in trend
        ],
        worker_enabled=snapshot_worker_env_enabled(),
        clinic_id=cid,
    )


@router.get("/list", response_model=PairedListOut)
def list_paired(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS),
    pair_lookahead_days: int = Query(
        default=DEFAULT_PAIR_LOOKAHEAD_DAYS, ge=1, le=90
    ),
    advice_code: Optional[str] = Query(default=None, max_length=64),
    channel: Optional[str] = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PairedListOut:
    """Paginated list of paired records."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    look = _normalize_lookahead(pair_lookahead_days)

    if not cid:
        return PairedListOut(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            window_days=w,
            pair_lookahead_days=look,
            clinic_id=None,
        )

    records = pair_advice_with_outcomes(
        db, clinic_id=cid, window_days=w, pair_lookahead_days=look
    )

    # Filter.
    if advice_code:
        ac = advice_code.strip().upper()
        records = [r for r in records if r.advice_code == ac]
    if channel:
        ch = channel.strip().lower()
        records = [r for r in records if r.channel == ch]

    # Sort: most recent first.
    records.sort(key=lambda r: r.snapshot_at, reverse=True)

    total = len(records)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = records[start:end]

    return PairedListOut(
        items=[_record_to_out(r) for r in page_items],
        total=total,
        page=page,
        page_size=page_size,
        window_days=w,
        pair_lookahead_days=look,
        clinic_id=cid,
    )


@router.post("/run-snapshot-now", response_model=RunSnapshotNowOut)
def run_snapshot_now(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RunSnapshotNowOut:
    """Admin-only — call the snapshot worker once for the actor's
    clinic.

    Cross-clinic safe: the worker is invoked with
    ``only_clinic_id=actor.clinic_id``.
    """
    _gate_admin(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)

    worker = get_snapshot_worker()
    result = worker.tick(
        db, only_clinic_id=cid, window_days=w
    )

    # Page-level audit row for the manual run-now click.
    _emit_audit(
        db,
        actor,
        event="run_snapshot_now",
        target_id=str(cid or actor.actor_id),
        target_type=SURFACE,
        action=f"{SURFACE}.run_snapshot_now",
        note=(
            f"clinic_id={cid or 'null'} "
            f"clinics_scanned={result.clinics_scanned} "
            f"total_advice_cards={result.total_advice_cards} "
            f"snapshot_runs={result.snapshot_runs} "
            f"errors={result.errors}"
        ),
    )

    return RunSnapshotNowOut(
        accepted=True,
        clinics_scanned=result.clinics_scanned,
        snapshot_runs=result.snapshot_runs,
        total_advice_cards=result.total_advice_cards,
        skipped_cooldown=result.skipped_cooldown,
        errors=result.errors,
        elapsed_ms=result.elapsed_ms,
        snapshot_run_audit_event_ids=list(
            result.snapshot_run_audit_event_ids
        ),
        advice_snapshot_audit_event_ids=list(
            result.advice_snapshot_audit_event_ids
        ),
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list for the outcome-tracker
    surface."""
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
    ``target_type='rotation_policy_advisor_outcome_tracker'``."""
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
