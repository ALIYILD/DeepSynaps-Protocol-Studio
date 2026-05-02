"""Caregiver Delivery Concern Resolution Audit Hub (DCR2, 2026-05-02).

Cohort dashboard built on the DCR1 audit trail: distribution of
resolution reasons (``concerns_addressed``, ``false_positive``,
``caregiver_replaced``, ``other``) over time so admins can:

* Calibrate the DCA threshold — high ``false_positive`` rate → raise.
* Invest in delivery infrastructure when ``caregiver_replaced`` spikes.
* Spot trend changes per clinic.

Source data is the existing
``caregiver_portal.delivery_concern_resolved`` audit rows emitted by the
DCR1 router (#391). No schema change. No background worker. Read-only
analytics surface — clinician minimum.

Endpoints
=========

* ``GET /api/v1/caregiver-delivery-concern-resolution-audit-hub/summary?window_days=30``
  Cohort summary — totals, percentages, trend buckets, top resolvers,
  median time-to-resolve.
* ``GET /api/v1/caregiver-delivery-concern-resolution-audit-hub/list`` —
  paginated list of resolved rows with caregiver name, resolver name,
  reason, truncated note, timestamp.
* ``GET /api/v1/caregiver-delivery-concern-resolution-audit-hub/audit-events``
  — paginated audit-event list scoped to clinic + surface.

Cross-clinic safety: every endpoint scopes by ``actor.clinic_id``. All
audit-row matching uses the canonical ``clinic_id={cid}`` substring
needle so a clinician in clinic A never sees rows from clinic B even
when the underlying ``audit_event_records`` row would otherwise match
on ``target_type``/``action`` alone.
"""
from __future__ import annotations

import logging
import statistics
import uuid
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
from app.persistence.models import AuditEventRecord, User


router = APIRouter(
    prefix="/api/v1/caregiver-delivery-concern-resolution-audit-hub",
    tags=["Caregiver Delivery Concern Resolution Audit Hub"],
)
_log = logging.getLogger(__name__)


# Surface used for page-level audit events emitted from the hub UI.
SURFACE = "caregiver_delivery_concern_resolution_audit_hub"

# Canonical actions emitted by the DCR1 surface and the DCA worker.
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"
FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"

# Reason codes mirror :mod:`caregiver_delivery_concern_resolution_router`.
ALLOWED_REASONS: tuple[str, ...] = (
    "concerns_addressed",
    "false_positive",
    "caregiver_replaced",
    "other",
)

# Window cap so a hostile client cannot ask for, say, 10000 days and OOM
# us by streaming the entire audit table.
MIN_WINDOW_DAYS = 1
MAX_WINDOW_DAYS = 365
DEFAULT_WINDOW_DAYS = 30


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    if actor.role in {"admin", "clinician"}:
        return actor.role
    return "clinician"


def _coerce_dt(iso: Optional[str]) -> Optional[datetime]:
    """SQLite roundtrips strip tzinfo; coerce to tz-aware UTC."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except Exception:  # pragma: no cover
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_resolution_note(note: str) -> dict[str, str]:
    """Pull canonical key=value pairs out of the resolved-row note."""
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
        _log.exception("DCR2 audit emit skipped")
    return eid


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


def _query_resolved_rows(
    db: Session,
    *,
    cid: str,
    cutoff: datetime,
    end: Optional[datetime] = None,
) -> list[AuditEventRecord]:
    """Return resolved rows for a clinic in (cutoff, end]. Limit-bounded
    by the window itself — we never streaming-load more than ~365d of
    one clinic's resolutions in one go."""
    needle = f"clinic_id={cid}"
    q = db.query(AuditEventRecord).filter(
        AuditEventRecord.action == RESOLVE_ACTION,
        AuditEventRecord.created_at >= cutoff.isoformat(),
    )
    if end is not None:
        q = q.filter(AuditEventRecord.created_at <= end.isoformat())
    rows = q.order_by(AuditEventRecord.created_at.desc()).all()
    return [r for r in rows if needle in (r.note or "")]


def _build_trend_buckets(
    rows: list[AuditEventRecord],
    *,
    window_days: int,
) -> list[dict]:
    """Daily buckets for window<=7d, weekly otherwise (capped at 12 buckets)."""
    if window_days <= 7:
        bucket_days = 1
        n_buckets = max(window_days, 1)
    else:
        bucket_days = 7
        n_buckets = max(1, min(12, (window_days + bucket_days - 1) // bucket_days))

    now = datetime.now(timezone.utc)
    buckets: list[dict] = []
    for i in range(n_buckets):
        start = now - timedelta(days=(i + 1) * bucket_days)
        end = now - timedelta(days=i * bucket_days)
        by_reason = {r: 0 for r in ALLOWED_REASONS}
        count = 0
        for row in rows:
            ts = _coerce_dt(row.created_at)
            if ts is None:
                continue
            if ts <= start or ts > end:
                continue
            count += 1
            kv = _parse_resolution_note(row.note or "")
            reason = (kv.get("resolution_reason") or "other").strip().lower()
            if reason not in by_reason:
                reason = "other"
            by_reason[reason] += 1
        buckets.append(
            {
                "bucket_start": start.isoformat(),
                "bucket_end": end.isoformat(),
                "count": count,
                "by_reason": by_reason,
            }
        )
    # Oldest first for chart rendering.
    buckets.reverse()
    return buckets


def _median_time_to_resolve_hours(
    db: Session,
    *,
    cid: str,
    resolved_rows: list[AuditEventRecord],
) -> Optional[float]:
    """For each resolved row, look back for the matching most-recent
    threshold_reached row for that caregiver in the same clinic and take
    the difference. Median in hours over all paired rows."""
    if not resolved_rows:
        return None
    needle = f"clinic_id={cid}"
    deltas_hours: list[float] = []
    # Cache flag rows per caregiver to avoid N queries on hot caregivers.
    flag_cache: dict[str, list[AuditEventRecord]] = {}

    for row in resolved_rows:
        cg_id = (row.target_id or "").strip()
        if not cg_id:
            continue
        if cg_id not in flag_cache:
            flag_cache[cg_id] = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == FLAG_ACTION,
                    AuditEventRecord.target_id == cg_id,
                )
                .order_by(AuditEventRecord.created_at.desc())
                .all()
            )
        resolved_at = _coerce_dt(row.created_at)
        if resolved_at is None:
            continue
        # First flag row strictly older than this resolution row + matching clinic.
        match: Optional[AuditEventRecord] = None
        for fr in flag_cache[cg_id]:
            if needle not in (fr.note or ""):
                continue
            f_dt = _coerce_dt(fr.created_at)
            if f_dt is None:
                continue
            if f_dt <= resolved_at:
                match = fr
                break
        if match is None:
            continue
        f_dt = _coerce_dt(match.created_at)
        if f_dt is None:
            continue
        delta_h = (resolved_at - f_dt).total_seconds() / 3600.0
        if delta_h < 0:
            continue
        deltas_hours.append(delta_h)

    if not deltas_hours:
        return None
    return round(statistics.median(deltas_hours), 2)


# ── Schemas ─────────────────────────────────────────────────────────────────


class ReasonBreakdown(BaseModel):
    concerns_addressed: int = 0
    false_positive: int = 0
    caregiver_replaced: int = 0
    other: int = 0


class ReasonBreakdownPct(BaseModel):
    concerns_addressed: float = 0.0
    false_positive: float = 0.0
    caregiver_replaced: float = 0.0
    other: float = 0.0


class TopResolverOut(BaseModel):
    resolver_user_id: str
    resolver_name: Optional[str] = None
    count: int


class TrendBucketOut(BaseModel):
    bucket_start: str
    bucket_end: str
    count: int
    by_reason: ReasonBreakdown


class SummaryOut(BaseModel):
    window_days: int
    total_resolved: int
    by_reason: ReasonBreakdown
    by_reason_pct: ReasonBreakdownPct
    median_time_to_resolve_hours: Optional[float] = None
    top_resolvers: list[TopResolverOut] = Field(default_factory=list)
    trend_buckets: list[TrendBucketOut] = Field(default_factory=list)
    clinic_id: Optional[str] = None


class ResolvedRowOut(BaseModel):
    audit_event_id: str
    caregiver_user_id: str
    caregiver_display_name: Optional[str] = None
    caregiver_email: Optional[str] = None
    resolver_user_id: Optional[str] = None
    resolver_name: Optional[str] = None
    resolution_reason: Optional[str] = None
    resolution_note_short: Optional[str] = None
    resolved_at: str


class ListOut(BaseModel):
    items: list[ResolvedRowOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 25
    clinic_id: Optional[str] = None
    reason: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None


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
    """Cohort summary — totals + percentages + trend buckets + top
    resolvers + median time-to-resolve."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    if not cid:
        return SummaryOut(
            window_days=w,
            total_resolved=0,
            by_reason=ReasonBreakdown(),
            by_reason_pct=ReasonBreakdownPct(),
            median_time_to_resolve_hours=None,
            top_resolvers=[],
            trend_buckets=_to_trend_models(_build_trend_buckets([], window_days=w)),
            clinic_id=None,
        )

    cutoff = _window_cutoff(w)
    rows = _query_resolved_rows(db, cid=cid, cutoff=cutoff)

    by_reason = {r: 0 for r in ALLOWED_REASONS}
    resolver_counts: dict[str, int] = {}
    for row in rows:
        kv = _parse_resolution_note(row.note or "")
        reason = (kv.get("resolution_reason") or "other").strip().lower()
        if reason not in by_reason:
            reason = "other"
        by_reason[reason] += 1
        resolver_id = (kv.get("resolver_user_id") or row.actor_id or "").strip()
        if resolver_id:
            resolver_counts[resolver_id] = resolver_counts.get(resolver_id, 0) + 1

    total = len(rows)
    by_reason_pct: dict[str, float] = {r: 0.0 for r in ALLOWED_REASONS}
    if total > 0:
        for r in ALLOWED_REASONS:
            by_reason_pct[r] = round((by_reason[r] / total) * 100.0, 2)

    # Top 5 resolvers — bulk-load names.
    sorted_resolvers = sorted(
        resolver_counts.items(), key=lambda kv: (-kv[1], kv[0])
    )[:5]
    resolver_ids = [rid for rid, _ in sorted_resolvers]
    user_map: dict[str, User] = {}
    if resolver_ids:
        user_map = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(resolver_ids)).all()
        }
    top_resolvers = [
        TopResolverOut(
            resolver_user_id=rid,
            resolver_name=(
                getattr(user_map.get(rid), "display_name", None)
                or getattr(user_map.get(rid), "email", None)
                or None
            ),
            count=cnt,
        )
        for rid, cnt in sorted_resolvers
    ]

    median_h = _median_time_to_resolve_hours(db, cid=cid, resolved_rows=rows)
    trend = _build_trend_buckets(rows, window_days=w)

    return SummaryOut(
        window_days=w,
        total_resolved=total,
        by_reason=ReasonBreakdown(**by_reason),
        by_reason_pct=ReasonBreakdownPct(**by_reason_pct),
        median_time_to_resolve_hours=median_h,
        top_resolvers=top_resolvers,
        trend_buckets=_to_trend_models(trend),
        clinic_id=cid,
    )


def _to_trend_models(buckets: list[dict]) -> list[TrendBucketOut]:
    out: list[TrendBucketOut] = []
    for b in buckets:
        out.append(
            TrendBucketOut(
                bucket_start=b["bucket_start"],
                bucket_end=b["bucket_end"],
                count=b["count"],
                by_reason=ReasonBreakdown(**b["by_reason"]),
            )
        )
    return out


@router.get("/list", response_model=ListOut)
def list_resolved(
    reason: Optional[str] = Query(default=None, max_length=64),
    start: Optional[str] = Query(default=None, max_length=40),
    end: Optional[str] = Query(default=None, max_length=40),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=25, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ListOut:
    """Paginated list of resolved rows with caregiver + resolver display
    names. ``reason`` filters; ``start`` / ``end`` are ISO timestamps
    that bound the result window."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    if not cid:
        return ListOut(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            clinic_id=None,
            reason=reason,
            start=start,
            end=end,
        )

    # Default window — same semantic as summary (30 days) so a caller
    # without start/end gets a stable cohort. The MAX_WINDOW_DAYS ceiling
    # keeps memory bounded.
    cutoff = _coerce_dt(start) or _window_cutoff(MAX_WINDOW_DAYS)
    end_dt = _coerce_dt(end)
    rows = _query_resolved_rows(db, cid=cid, cutoff=cutoff, end=end_dt)

    # Reason filter (post-query because reason lives in the note text).
    reason_lc = (reason or "").strip().lower() or None
    if reason_lc:
        if reason_lc not in ALLOWED_REASONS:
            return ListOut(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                clinic_id=cid,
                reason=reason_lc,
                start=start,
                end=end,
            )

    # Pre-extract reason per row, drop mismatches.
    enriched: list[tuple[AuditEventRecord, dict[str, str]]] = []
    for row in rows:
        kv = _parse_resolution_note(row.note or "")
        if reason_lc:
            r = (kv.get("resolution_reason") or "other").strip().lower()
            if r != reason_lc:
                continue
        enriched.append((row, kv))

    total = len(enriched)
    # Bulk-load caregiver + resolver users for the rendered page only.
    page_start = (page - 1) * page_size
    page_end = page_start + page_size
    page_rows = enriched[page_start:page_end]

    user_ids: set[str] = set()
    for row, kv in page_rows:
        if row.target_id:
            user_ids.add(row.target_id)
        rid = (kv.get("resolver_user_id") or row.actor_id or "").strip()
        if rid:
            user_ids.add(rid)
    user_map: dict[str, User] = {}
    if user_ids:
        user_map = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(list(user_ids))).all()
        }

    items: list[ResolvedRowOut] = []
    for row, kv in page_rows:
        cg = user_map.get(row.target_id or "")
        rid = (kv.get("resolver_user_id") or row.actor_id or "").strip()
        rv = user_map.get(rid)
        rnote = kv.get("resolution_note") or ""
        rnote_short = (rnote[:77] + "…") if len(rnote) > 80 else rnote
        items.append(
            ResolvedRowOut(
                audit_event_id=row.event_id,
                caregiver_user_id=row.target_id or "",
                caregiver_display_name=(
                    getattr(cg, "display_name", None) if cg else None
                ),
                caregiver_email=(getattr(cg, "email", None) if cg else None),
                resolver_user_id=rid or None,
                resolver_name=(
                    getattr(rv, "display_name", None)
                    or getattr(rv, "email", None)
                    if rv
                    else None
                ),
                resolution_reason=(
                    (kv.get("resolution_reason") or "other").strip().lower()
                ),
                resolution_note_short=rnote_short or None,
                resolved_at=row.created_at or "",
            )
        )

    return ListOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        clinic_id=cid,
        reason=reason_lc,
        start=start,
        end=end,
    )


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
    ``target_type='caregiver_delivery_concern_resolution_audit_hub'``."""
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
