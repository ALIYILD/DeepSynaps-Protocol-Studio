"""Resolver Coaching Digest Audit Hub (DCRO4, 2026-05-02).

Admin-side cohort dashboard built on the DCRO3 audit trail
(``resolver_coaching_self_review_digest.dispatched`` rows) plus the
``ResolverCoachingDigestPreference`` table. Closes the resolver-side
coaching loop end-to-end:

  DCR1 (#391) measures resolutions →
  DCR2 (#392) cohort-summarises them →
  DCRO1 (#393) pairs them with outcomes →
  DCRO2 (#397) self-corrects per-resolver →
  DCRO3 (#398) nudges resolvers weekly →
  DCRO4 (THIS) — admins see who is opting in, whether digests are
  actually being delivered, and which resolvers are improving.

Endpoints
=========

* ``GET /api/v1/resolver-coaching-digest-audit-hub/summary?window_days=90``
  Returns opt-in stats, dispatch stats by channel, delivery outcomes,
  and weekly trend buckets.
* ``GET /api/v1/resolver-coaching-digest-audit-hub/resolver-trajectory?window_days=90``
  Per opted-in resolver in the actor's clinic, weekly wrong-call
  backlog count over the window with a shrinking/flat/growing
  classification.
* ``GET /api/v1/resolver-coaching-digest-audit-hub/audit-events``
  Paginated, scoped audit-event list for the hub surface.

All endpoints clinic-scoped. Cross-clinic clinicians/admins get no
visibility into other clinics — every preference / dispatch / audit
read is bounded by ``actor.clinic_id``. Read-only — there is NO
companion worker for DCRO4.
"""
from __future__ import annotations

import logging
import statistics
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
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
from app.persistence.models import (
    AuditEventRecord,
    ResolverCoachingDigestPreference,
    User,
)
from app.services.resolution_outcome_pairing import (
    OUTCOME_REFLAGGED,
    pair_resolutions_with_outcomes,
)


router = APIRouter(
    prefix="/api/v1/resolver-coaching-digest-audit-hub",
    tags=["Resolver Coaching Digest Audit Hub"],
)
_log = logging.getLogger(__name__)


# Page-level surface for any audit rows emitted from the hub UI.
SURFACE = "resolver_coaching_digest_audit_hub"

# Source data: the dispatched-row stream emitted by the DCRO3 worker.
DISPATCHED_TARGET_TYPE = "resolver_coaching_self_review_digest"
DISPATCHED_ACTION = f"{DISPATCHED_TARGET_TYPE}.dispatched"

# Canonical channel set — must match :mod:`app.workers.resolver_coaching_self_review_digest_worker.KNOWN_CHANNELS`.
KNOWN_CHANNELS: tuple[str, ...] = (
    "slack",
    "twilio",
    "sendgrid",
    "pagerduty",
    "email",
)

# Statuses we treat as a successful delivery in the success-rate KPI. The
# DCRO3 worker stamps ``delivery_status=delivered`` when an adapter
# confirms delivery and ``delivery_status=queued`` for the no-adapter
# fallback (which means the audit row exists but no real channel
# carried the payload). We treat ``queued`` as delivered for the KPI
# because the regulator transcript still exists; failures are the only
# explicitly bad outcome.
DELIVERED_STATUSES: frozenset[str] = frozenset(
    {"delivered", "sent", "queued", "ok", "success"}
)
FAILED_STATUSES: frozenset[str] = frozenset({"failed", "error", "bounce"})

# Window cap so a hostile client cannot ask for, say, 10000 days and
# OOM us by streaming the entire audit table.
MIN_WINDOW_DAYS = 1
MAX_WINDOW_DAYS = 365
DEFAULT_WINDOW_DAYS = 90

# Cap on the resolver-trajectory list so a 10k-resolver clinic does not
# OOM the response. Hub is read-only and admin-facing; truncation is
# acceptable + documented.
MAX_TRAJECTORY_RESOLVERS = 200


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    if actor.role in {"admin", "clinician", "reviewer"}:
        return actor.role
    return "clinician"


def _coerce_dt(iso: Optional[str]) -> Optional[datetime]:
    """SQLite roundtrips strip tzinfo; coerce to tz-aware UTC."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_dispatch_note(note: str) -> dict[str, str]:
    """Pull canonical key=value pairs out of the dispatched-row note."""
    out: dict[str, str] = {}
    if not note:
        return out
    for raw in note.split(";"):
        part = raw.strip()
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        out[k.strip()] = v.strip()
    return out


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


def _window_cutoff(window_days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=window_days)


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
        f"{SURFACE}-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(target_id) or actor.actor_id,
            target_type=SURFACE,
            action=f"{SURFACE}.{event}",
            role=role or _safe_audit_role(actor),
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception("DCRO4 audit emit skipped")
    return eid


def _query_dispatched_rows(
    db: Session,
    *,
    cid: str,
    cutoff: datetime,
) -> list[AuditEventRecord]:
    """Pull dispatched rows for the clinic in the lookback window.

    Cross-clinic safety: rows are filtered by the canonical
    ``clinic_id={cid}`` substring needle in the row's note, mirroring
    the DCR2 / DCRO3 pattern.
    """
    needle = f"clinic_id={cid}"
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == DISPATCHED_ACTION,
            AuditEventRecord.created_at >= cutoff.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    return [r for r in rows if needle in (r.note or "")]


def _opt_in_stats(db: Session, *, cid: str) -> dict:
    """Total resolvers in clinic + opted-in / opted-out splits.

    Cross-clinic safety: every preference row is filtered by clinic_id
    so a clinic-A admin never sees clinic-B opt-in counts.
    """
    rows = (
        db.query(ResolverCoachingDigestPreference)
        .filter(ResolverCoachingDigestPreference.clinic_id == cid)
        .all()
    )
    total = len(rows)
    opted_in = sum(1 for r in rows if bool(r.opted_in))
    opted_out = total - opted_in
    pct = round((opted_in / total) * 100.0, 2) if total > 0 else 0.0
    return {
        "total_resolvers_in_clinic": total,
        "opted_in": opted_in,
        "opted_out": opted_out,
        "opt_in_pct": pct,
    }


def _dispatch_stats(rows: list[AuditEventRecord]) -> dict:
    """Tally dispatched rows by channel + median per resolver."""
    by_channel: dict[str, int] = {c: 0 for c in KNOWN_CHANNELS}
    per_resolver: dict[str, int] = defaultdict(int)
    total = 0
    for row in rows:
        kv = _parse_dispatch_note(row.note or "")
        ch = (kv.get("channel") or "").strip().lower()
        if ch not in by_channel:
            # Unknown channels are still counted in the total so the
            # admin sees an honest dispatched-vs-by-channel discrepancy
            # instead of silent loss.
            ...
        else:
            by_channel[ch] += 1
        total += 1
        rid = (kv.get("resolver_user_id") or row.target_id or "").strip()
        if rid:
            per_resolver[rid] += 1

    median_per_resolver: Optional[float] = None
    if per_resolver:
        median_per_resolver = round(
            float(statistics.median(per_resolver.values())), 2
        )

    return {
        "total_dispatched": total,
        "by_channel": by_channel,
        "median_dispatches_per_resolver": median_per_resolver,
    }


def _delivery_outcomes(rows: list[AuditEventRecord]) -> dict:
    """Tally delivered vs failed across dispatched rows.

    The DCRO3 worker stamps ``delivery_status=`` in the row note. When
    the audit row is missing the field entirely, we conservatively
    treat it as ``delivered`` (the regulator transcript exists; the
    failure path stamps an explicit failed marker). This matches the
    documented limitation in the DCRO4 spec.
    """
    delivered = 0
    failed = 0
    for row in rows:
        kv = _parse_dispatch_note(row.note or "")
        status = (kv.get("delivery_status") or "delivered").strip().lower()
        if status in FAILED_STATUSES:
            failed += 1
        elif status in DELIVERED_STATUSES:
            delivered += 1
        else:
            # Unknown / unparseable — count as delivered (audit exists)
            # rather than penalising clinics for legacy rows.
            delivered += 1

    total = delivered + failed
    success_rate: Optional[float] = None
    if total > 0:
        success_rate = round((delivered / total) * 100.0, 2)
    return {
        "delivered": delivered,
        "failed": failed,
        "success_rate_pct": success_rate,
    }


def _trend_buckets(
    rows: list[AuditEventRecord], *, window_days: int
) -> list[dict]:
    """Weekly buckets — one bucket per ISO calendar week in the window.

    Each bucket carries:
      * ``week_start`` — Monday of the bucket (UTC ISO timestamp)
      * ``dispatched`` — total rows dispatched that week
      * ``delivered`` — rows whose delivery_status was delivered/queued
      * ``failed`` — rows whose delivery_status was failed
    """
    n_buckets = max(1, (window_days + 6) // 7)
    n_buckets = min(n_buckets, 53)  # cap at one year

    now = datetime.now(timezone.utc)
    buckets: list[dict] = []
    for i in range(n_buckets):
        end = now - timedelta(days=i * 7)
        start = now - timedelta(days=(i + 1) * 7)
        dispatched = 0
        delivered = 0
        failed = 0
        for row in rows:
            ts = _coerce_dt(row.created_at)
            if ts is None:
                continue
            if ts <= start or ts > end:
                continue
            dispatched += 1
            kv = _parse_dispatch_note(row.note or "")
            status = (kv.get("delivery_status") or "delivered").strip().lower()
            if status in FAILED_STATUSES:
                failed += 1
            else:
                delivered += 1
        buckets.append(
            {
                "week_start": start.isoformat(),
                "dispatched": dispatched,
                "delivered": delivered,
                "failed": failed,
            }
        )
    # Oldest first for chart rendering.
    buckets.reverse()
    return buckets


def _classify_trajectory(weekly: list[int]) -> str:
    """Return ``shrinking`` / ``growing`` / ``flat`` for a weekly series.

    Shrinking when the last 4 weeks median is strictly less than the
    first 4 weeks median (and the series has at least 8 weeks).
    Growing when the last 4 weeks median is strictly greater than the
    first 4 weeks median. Otherwise flat. Any series shorter than 8
    weeks is reported as ``flat`` because the signal is too weak.
    """
    if len(weekly) < 8:
        return "flat"
    first4 = weekly[:4]
    last4 = weekly[-4:]
    first_median = statistics.median(first4)
    last_median = statistics.median(last4)
    if last_median < first_median:
        return "shrinking"
    if last_median > first_median:
        return "growing"
    return "flat"


# ── Schemas ─────────────────────────────────────────────────────────────────


class OptInStatsOut(BaseModel):
    total_resolvers_in_clinic: int = 0
    opted_in: int = 0
    opted_out: int = 0
    opt_in_pct: float = 0.0


class ByChannelOut(BaseModel):
    slack: int = 0
    twilio: int = 0
    sendgrid: int = 0
    pagerduty: int = 0
    email: int = 0


class DispatchStatsOut(BaseModel):
    total_dispatched: int = 0
    by_channel: ByChannelOut = Field(default_factory=ByChannelOut)
    median_dispatches_per_resolver: Optional[float] = None


class DeliveryOutcomesOut(BaseModel):
    delivered: int = 0
    failed: int = 0
    success_rate_pct: Optional[float] = None


class TrendBucketOut(BaseModel):
    week_start: str
    dispatched: int = 0
    delivered: int = 0
    failed: int = 0


class SummaryOut(BaseModel):
    window_days: int
    clinic_id: Optional[str] = None
    opt_in_stats: OptInStatsOut = Field(default_factory=OptInStatsOut)
    dispatch_stats: DispatchStatsOut = Field(default_factory=DispatchStatsOut)
    delivery_outcomes: DeliveryOutcomesOut = Field(
        default_factory=DeliveryOutcomesOut
    )
    trend_buckets: list[TrendBucketOut] = Field(default_factory=list)


class WeeklyBacklogPoint(BaseModel):
    week_start: str
    wrong_call_count: int = 0
    self_reviewed: int = 0


class ResolverTrajectoryOut(BaseModel):
    resolver_user_id: str
    resolver_name: Optional[str] = None
    weekly_backlog: list[WeeklyBacklogPoint] = Field(default_factory=list)
    trajectory: str = "flat"
    current_backlog: int = 0


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


@router.get("/summary", response_model=SummaryOut)
def summary(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SummaryOut:
    """Cohort summary — opt-in / dispatch / delivery / weekly trend.

    Cross-clinic safety: every read is bounded by ``actor.clinic_id``.
    Other clinics' preferences and dispatched rows never leak.
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)

    if not cid:
        # Unattached actors get an empty (but well-shaped) response.
        return SummaryOut(
            window_days=w,
            clinic_id=None,
            opt_in_stats=OptInStatsOut(),
            dispatch_stats=DispatchStatsOut(),
            delivery_outcomes=DeliveryOutcomesOut(),
            trend_buckets=[
                TrendBucketOut(**b)
                for b in _trend_buckets([], window_days=w)
            ],
        )

    cutoff = _window_cutoff(w)
    rows = _query_dispatched_rows(db, cid=cid, cutoff=cutoff)

    opt_in = _opt_in_stats(db, cid=cid)
    dispatch = _dispatch_stats(rows)
    delivery = _delivery_outcomes(rows)
    trend = _trend_buckets(rows, window_days=w)

    return SummaryOut(
        window_days=w,
        clinic_id=cid,
        opt_in_stats=OptInStatsOut(**opt_in),
        dispatch_stats=DispatchStatsOut(
            total_dispatched=dispatch["total_dispatched"],
            by_channel=ByChannelOut(**dispatch["by_channel"]),
            median_dispatches_per_resolver=dispatch[
                "median_dispatches_per_resolver"
            ],
        ),
        delivery_outcomes=DeliveryOutcomesOut(**delivery),
        trend_buckets=[TrendBucketOut(**b) for b in trend],
    )


@router.get("/resolver-trajectory", response_model=list[ResolverTrajectoryOut])
def resolver_trajectory(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[ResolverTrajectoryOut]:
    """Per opted-in resolver in actor's clinic, weekly wrong-call backlog.

    Reuses :func:`pair_resolutions_with_outcomes` from DCRO1 to pull
    ``re_flagged_within_30d`` outcomes (the canonical wrong-call
    definition) and bucketises by ISO week. Only resolvers whose
    preference row is ``opted_in=True`` in the actor's clinic are
    included.

    Cross-clinic safety: opt-in rows are filtered by clinic_id; outcome
    pairing is also clinic-scoped via ``pair_resolutions_with_outcomes``.
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)

    if not cid:
        return []

    # Opted-in resolvers in the clinic.
    pref_rows = (
        db.query(ResolverCoachingDigestPreference)
        .filter(
            ResolverCoachingDigestPreference.clinic_id == cid,
            ResolverCoachingDigestPreference.opted_in.is_(True),
        )
        .all()
    )
    opted_in_ids = [r.resolver_user_id for r in pref_rows][
        :MAX_TRAJECTORY_RESOLVERS
    ]
    if not opted_in_ids:
        return []

    # Bulk-load names for header rendering.
    user_map: dict[str, User] = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(opted_in_ids)).all()
    }

    # Pair resolutions with outcomes (clinic-scoped, window-bounded).
    outcomes = pair_resolutions_with_outcomes(
        db, clinic_id=cid, window_days=w
    )

    # Bucket wrong-fp calls per resolver by ISO week. We pre-compute the
    # bucket boundaries up-front so empty resolvers still get a full
    # series of zero-counts (so the sparkline always renders).
    n_buckets = max(1, (w + 6) // 7)
    n_buckets = min(n_buckets, 53)
    now = datetime.now(timezone.utc)

    bucket_starts: list[datetime] = []
    bucket_ends: list[datetime] = []
    for i in range(n_buckets - 1, -1, -1):  # oldest-first
        end = now - timedelta(days=i * 7)
        start = now - timedelta(days=(i + 1) * 7)
        bucket_starts.append(start)
        bucket_ends.append(end)

    # Per-resolver counts. Only include re_flagged_within_30d outcomes
    # (the canonical wrong-call definition that DCRO2 inbox surfaces).
    per_resolver_buckets: dict[str, list[int]] = {
        rid: [0] * n_buckets for rid in opted_in_ids
    }
    for out in outcomes:
        if out.outcome != OUTCOME_REFLAGGED:
            continue
        rid = out.resolver_user_id
        if rid not in per_resolver_buckets:
            continue
        ts = out.resolved_at
        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        for idx in range(n_buckets):
            if ts > bucket_starts[idx] and ts <= bucket_ends[idx]:
                per_resolver_buckets[rid][idx] += 1
                break

    # Self-reviewed counts per (resolver, week) — reuse the DCRO2
    # ``self_review_note_filed`` audit row stream.
    cutoff = _window_cutoff(w)
    needle = f"clinic_id={cid}"
    self_review_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action
            == "resolver_coaching_inbox.self_review_note_filed",
            AuditEventRecord.created_at >= cutoff.isoformat(),
        )
        .all()
    )
    self_review_rows = [
        r for r in self_review_rows if needle in (r.note or "")
    ]
    per_resolver_review_buckets: dict[str, list[int]] = {
        rid: [0] * n_buckets for rid in opted_in_ids
    }
    for row in self_review_rows:
        rid = (row.actor_id or "").strip()
        if rid not in per_resolver_review_buckets:
            continue
        ts = _coerce_dt(row.created_at)
        if ts is None:
            continue
        for idx in range(n_buckets):
            if ts > bucket_starts[idx] and ts <= bucket_ends[idx]:
                per_resolver_review_buckets[rid][idx] += 1
                break

    out_list: list[ResolverTrajectoryOut] = []
    for rid in opted_in_ids:
        weekly = per_resolver_buckets[rid]
        weekly_review = per_resolver_review_buckets[rid]
        traj = _classify_trajectory(weekly)
        current_backlog = weekly[-1] if weekly else 0
        u = user_map.get(rid)
        name = (
            getattr(u, "display_name", None)
            or getattr(u, "email", None)
            or rid
            if u
            else rid
        )
        out_list.append(
            ResolverTrajectoryOut(
                resolver_user_id=rid,
                resolver_name=name,
                weekly_backlog=[
                    WeeklyBacklogPoint(
                        week_start=bucket_starts[i].isoformat(),
                        wrong_call_count=weekly[i],
                        self_reviewed=weekly_review[i],
                    )
                    for i in range(n_buckets)
                ],
                trajectory=traj,
                current_backlog=current_backlog,
            )
        )
    return out_list


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list for the hub surface."""
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


class PageAuditIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    target_id: Optional[str] = Field(default=None, max_length=128)


class PageAuditOut(BaseModel):
    accepted: bool
    event_id: str


@router.post("/audit-events", response_model=PageAuditOut)
def post_audit_event(
    body: PageAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PageAuditOut:
    """Page-level audit ingestion under
    ``target_type='resolver_coaching_digest_audit_hub'``.
    """
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
        note=note,
    )
    return PageAuditOut(accepted=True, event_id=eid)


__all__ = [
    "router",
    "SURFACE",
    "DISPATCHED_TARGET_TYPE",
    "DISPATCHED_ACTION",
    "KNOWN_CHANNELS",
    "DELIVERED_STATUSES",
    "FAILED_STATUSES",
]
