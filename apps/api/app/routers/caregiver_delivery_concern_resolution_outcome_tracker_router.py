"""Caregiver Delivery Concern Resolution Outcome Tracker (DCRO1, 2026-05-02).

Calibration accuracy dashboard. Pairs each
``caregiver_portal.delivery_concern_resolved`` row with the NEXT
``caregiver_portal.delivery_concern_threshold_reached`` row for the same
caregiver in the same clinic, classifies the outcome
(``stayed_resolved`` / ``re_flagged_within_30d`` / ``pending``), and
computes per-resolver calibration accuracy:

    Did the admin's "false_positive" call hold up — i.e., was the
    caregiver NOT re-flagged within 30 days?

If the admin marks a caregiver "false_positive" but the DCA worker
re-flags them within 30 days, the admin's call was wrong. Aggregating
this per resolver gives a calibration_accuracy_pct that admins can use
to judge whether a reviewer is over-eager to dismiss flags.

No schema change — pure pairing of existing audit rows.

Endpoints
=========

* ``GET /api/v1/caregiver-delivery-concern-resolution-outcome-tracker/summary?window_days=90``
  Cohort summary — outcome counts + percentages + by-reason rollup +
  median_days_to_re_flag.
* ``GET /api/v1/caregiver-delivery-concern-resolution-outcome-tracker/resolver-calibration?window_days=90&min_resolutions=3``
  Per-resolver calibration table; resolvers with fewer than
  ``min_resolutions`` total resolutions are omitted to avoid noise.
* ``GET /api/v1/caregiver-delivery-concern-resolution-outcome-tracker/audit-events``
  Paginated audit-event list scoped to clinic + this surface.

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
from app.persistence.models import AuditEventRecord, User
from app.services.resolution_outcome_pairing import (
    ALLOWED_REASONS,
    DEFAULT_WINDOW_DAYS,
    OUTCOME_PENDING,
    OUTCOME_REFLAGGED,
    OUTCOME_STAYED,
    OutcomeRecord,
    compute_resolver_calibration,
    median_days_to_re_flag,
    pair_resolutions_with_outcomes,
)


router = APIRouter(
    prefix="/api/v1/caregiver-delivery-concern-resolution-outcome-tracker",
    tags=["Caregiver Delivery Concern Resolution Outcome Tracker"],
)
_log = logging.getLogger(__name__)


# Page-level surface (target_type) for self-rows.
SURFACE = "caregiver_delivery_concern_resolution_outcome_tracker"


MIN_WINDOW_DAYS = 1
MAX_WINDOW_DAYS = 365


# ── Helpers ─────────────────────────────────────────────────────────────────


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
        _log.exception("DCRO1 audit emit skipped")
    return eid


def _resolve_user_names(
    db: Session, user_ids: list[str]
) -> dict[str, User]:
    """Bulk-resolve User rows by id."""
    if not user_ids:
        return {}
    return {
        u.id: u
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    }


def _pretty_name(user: Optional[User]) -> Optional[str]:
    if user is None:
        return None
    return (
        getattr(user, "display_name", None)
        or getattr(user, "email", None)
        or None
    )


# ── Schemas ─────────────────────────────────────────────────────────────────


class OutcomeCountsOut(BaseModel):
    stayed_resolved: int = 0
    re_flagged_within_30d: int = 0
    pending: int = 0


class OutcomePctOut(BaseModel):
    """Percentages of CLASSIFIED outcomes (pending excluded from denominator)."""

    stayed_resolved: float = 0.0
    re_flagged_within_30d: float = 0.0


class ReasonOutcomeOut(BaseModel):
    total: int = 0
    re_flagged: int = 0
    incorrect_pct: float = 0.0


class ByReasonOut(BaseModel):
    concerns_addressed: ReasonOutcomeOut = Field(default_factory=ReasonOutcomeOut)
    false_positive: ReasonOutcomeOut = Field(default_factory=ReasonOutcomeOut)
    caregiver_replaced: ReasonOutcomeOut = Field(default_factory=ReasonOutcomeOut)
    other: ReasonOutcomeOut = Field(default_factory=ReasonOutcomeOut)


class SummaryOut(BaseModel):
    window_days: int
    total_resolutions: int
    outcome_counts: OutcomeCountsOut = Field(default_factory=OutcomeCountsOut)
    outcome_pct: OutcomePctOut = Field(default_factory=OutcomePctOut)
    by_reason: ByReasonOut = Field(default_factory=ByReasonOut)
    median_days_to_re_flag: Optional[float] = None
    clinic_id: Optional[str] = None


class ResolverCalibrationOut(BaseModel):
    resolver_user_id: str
    resolver_name: Optional[str] = None
    total_resolutions: int
    false_positive_calls: int
    false_positive_re_flagged_within_30d: int
    calibration_accuracy_pct: float
    last_resolution_at: Optional[str] = None


class ResolverCalibrationListOut(BaseModel):
    items: list[ResolverCalibrationOut] = Field(default_factory=list)
    window_days: int
    min_resolutions: int
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


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/summary", response_model=SummaryOut)
def summary(
    window_days: int = Query(default=90, ge=1, le=MAX_WINDOW_DAYS),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SummaryOut:
    """Outcome summary — counts, percentages, by-reason rollup, median
    days-to-re-flag."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)

    if not cid:
        return SummaryOut(window_days=w, total_resolutions=0, clinic_id=None)

    records = pair_resolutions_with_outcomes(db, cid, window_days=w)
    counts = {
        OUTCOME_STAYED: 0,
        OUTCOME_REFLAGGED: 0,
        OUTCOME_PENDING: 0,
    }
    by_reason: dict[str, dict[str, int]] = {
        r: {"total": 0, "re_flagged": 0} for r in ALLOWED_REASONS
    }
    for rec in records:
        if rec.outcome in counts:
            counts[rec.outcome] += 1
        if rec.resolution_reason in by_reason:
            by_reason[rec.resolution_reason]["total"] += 1
            if rec.outcome == OUTCOME_REFLAGGED:
                by_reason[rec.resolution_reason]["re_flagged"] += 1

    classified = counts[OUTCOME_STAYED] + counts[OUTCOME_REFLAGGED]
    if classified > 0:
        pct = OutcomePctOut(
            stayed_resolved=round(
                (counts[OUTCOME_STAYED] / classified) * 100.0, 2
            ),
            re_flagged_within_30d=round(
                (counts[OUTCOME_REFLAGGED] / classified) * 100.0, 2
            ),
        )
    else:
        pct = OutcomePctOut()

    by_reason_out: dict[str, ReasonOutcomeOut] = {}
    for r, v in by_reason.items():
        total = v["total"]
        flagged = v["re_flagged"]
        incorrect_pct = (
            round((flagged / total) * 100.0, 2) if total > 0 else 0.0
        )
        by_reason_out[r] = ReasonOutcomeOut(
            total=total, re_flagged=flagged, incorrect_pct=incorrect_pct
        )

    return SummaryOut(
        window_days=w,
        total_resolutions=len(records),
        outcome_counts=OutcomeCountsOut(**counts),
        outcome_pct=pct,
        by_reason=ByReasonOut(**by_reason_out),
        median_days_to_re_flag=median_days_to_re_flag(records),
        clinic_id=cid,
    )


@router.get(
    "/resolver-calibration", response_model=ResolverCalibrationListOut
)
def resolver_calibration(
    window_days: int = Query(default=90, ge=1, le=MAX_WINDOW_DAYS),
    min_resolutions: int = Query(default=3, ge=1, le=1000),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ResolverCalibrationListOut:
    """Per-resolver calibration accuracy. Resolvers with fewer than
    ``min_resolutions`` total resolutions in the window are omitted to
    avoid noisy single-call leaderboards."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    mr = max(1, int(min_resolutions or 1))

    if not cid:
        return ResolverCalibrationListOut(
            items=[],
            window_days=w,
            min_resolutions=mr,
            clinic_id=None,
        )

    records = pair_resolutions_with_outcomes(db, cid, window_days=w)
    calibrations = compute_resolver_calibration(records)

    eligible = [
        c for c in calibrations.values() if c.total_resolutions >= mr
    ]
    # Bulk-load resolver names.
    user_map = _resolve_user_names(db, [c.resolver_user_id for c in eligible])

    # Sort: most-resolutions first, then highest accuracy as a tiebreaker.
    eligible.sort(
        key=lambda c: (-c.total_resolutions, -c.calibration_accuracy_pct, c.resolver_user_id)
    )

    items = [
        ResolverCalibrationOut(
            resolver_user_id=c.resolver_user_id,
            resolver_name=_pretty_name(user_map.get(c.resolver_user_id)),
            total_resolutions=c.total_resolutions,
            false_positive_calls=c.false_positive_calls,
            false_positive_re_flagged_within_30d=c.false_positive_re_flagged_within_30d,
            calibration_accuracy_pct=c.calibration_accuracy_pct,
            last_resolution_at=(
                c.last_resolution_at.isoformat()
                if c.last_resolution_at is not None
                else None
            ),
        )
        for c in eligible
    ]

    return ResolverCalibrationListOut(
        items=items,
        window_days=w,
        min_resolutions=mr,
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
    ``target_type='caregiver_delivery_concern_resolution_outcome_tracker'``."""
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
