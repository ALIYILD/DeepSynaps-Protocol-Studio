"""Coaching Digest Delivery Failure Drilldown (DCRO5, 2026-05-02).

Operational drill-down over the DCRO3 dispatched audit row stream
(``resolver_coaching_self_review_digest.dispatched``), filtered to
``delivery_status=failed`` and grouped by ``(channel, error_class)``.

DCRO4 (#402) surfaces the failure rate. DCRO5 (THIS) makes it
actionable — admins click a failure to see exactly which (channel,
error_class) cohort it belongs to, then click through to the Channel
Misconfig Detector (#389) when there is a matching
``caregiver_portal.channel_misconfigured_detected`` row in the same
week + clinic + channel.

Endpoints
=========

* ``GET /api/v1/coaching-digest-delivery-failure-drilldown/summary?window_days=90``
  Per-channel, per-error-class breakdown of failed dispatches with a
  weekly-trend bucket series and a top-5 (channel, error_class)
  leaderboard.
* ``GET /api/v1/coaching-digest-delivery-failure-drilldown/list?channel=&error_class=&start=&end=&page=&page_size=``
  Paginated list of failed dispatched rows with truncated error
  message + the ``has_matching_misconfig_flag`` boolean (true when a
  ``caregiver_portal.channel_misconfigured_detected`` row exists in
  the same ISO week + clinic + channel — the click-through anchor for
  the Channel Misconfig Detector).
* ``GET /api/v1/coaching-digest-delivery-failure-drilldown/audit-events``
  Paginated, scoped audit-event list for the drilldown surface.

All endpoints clinic-scoped. Cross-clinic clinicians/admins get no
visibility into other clinics — every read is bounded by
``actor.clinic_id``. Read-only — there is NO companion worker for
DCRO5; it reuses the existing DCRO3 audit row stream.
"""
from __future__ import annotations

import logging
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
    User,
)


router = APIRouter(
    prefix="/api/v1/coaching-digest-delivery-failure-drilldown",
    tags=["Coaching Digest Delivery Failure Drilldown"],
)
_log = logging.getLogger(__name__)


# Page-level surface for any audit rows emitted from the drill-down UI.
SURFACE = "coaching_digest_delivery_failure_drilldown"

# Source data: the dispatched-row stream emitted by the DCRO3 worker.
DISPATCHED_TARGET_TYPE = "resolver_coaching_self_review_digest"
DISPATCHED_ACTION = f"{DISPATCHED_TARGET_TYPE}.dispatched"

# Channel-misconfig flag stream — used to compute
# ``has_matching_misconfig_flag`` in the failed-list response.
MISCONFIG_TARGET_TYPE = "caregiver_portal"
MISCONFIG_ACTION = f"{MISCONFIG_TARGET_TYPE}.channel_misconfigured_detected"

# Canonical channel set — must match :mod:`app.workers.resolver_coaching_self_review_digest_worker.KNOWN_CHANNELS`.
KNOWN_CHANNELS: tuple[str, ...] = (
    "slack",
    "twilio",
    "sendgrid",
    "pagerduty",
    "email",
)

# Canonical error-class enum surfaced by this drill-down. The first five
# match the heuristic classifier; ``other`` catches anything we cannot
# bucketise so the totals always reconcile.
KNOWN_ERROR_CLASSES: tuple[str, ...] = (
    "auth",
    "rate_limit",
    "channel_left",
    "unreachable",
    "other",
)

FAILED_STATUSES: frozenset[str] = frozenset({"failed", "error", "bounce"})

# Window cap so a hostile client cannot ask for, say, 10000 days and
# OOM us by streaming the entire audit table.
MIN_WINDOW_DAYS = 1
MAX_WINDOW_DAYS = 365
DEFAULT_WINDOW_DAYS = 90

# Pagination caps for the failed-list endpoint.
MIN_PAGE_SIZE = 1
MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50

# Top-N cap for the leaderboard.
TOP_ERROR_CLASSES_N = 5

# Truncate error_message in the failed-list response so a single huge
# stack trace cannot explode the response payload.
ERROR_MESSAGE_TRUNC = 120


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
    """Pull canonical key=value pairs out of an audit-row note.

    Handles both the DCRO3 dispatched-row format (``k=v; k=v; …``) and
    the channel-misconfig detector format (``k=v k=v …`` — space
    separated, no semicolons). We split on either delimiter so the
    misconfig-flag join logic in :func:`list_failed` and the failed
    dispatch parser share one implementation.
    """
    out: dict[str, str] = {}
    if not note:
        return out
    # Normalise both delimiters → newline → split. Splitting on plain
    # whitespace would corrupt note values with spaces in them; a
    # value like ``error_message=auth failed`` is rare in practice but
    # we keep the parser conservative by only splitting on ``;`` and
    # newlines, then a fallback whitespace split for legacy notes that
    # never carry semicolons.
    raw_parts: list[str]
    if ";" in note or "\n" in note:
        raw_parts = []
        for chunk in note.replace("\n", ";").split(";"):
            raw_parts.append(chunk)
    else:
        # Legacy whitespace-separated notes (e.g. the channel-misconfig
        # detector's ``priority=high adapter=… channel=… clinic_id=…``).
        raw_parts = note.split()
    for raw in raw_parts:
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


def _classify_error(
    error_class_field: Optional[str], error_message: Optional[str]
) -> str:
    """Return the canonical error_class for a failed row.

    Prefers the explicit ``error_class=`` key in the dispatched-row
    note. Falls back to a heuristic over ``error_message`` so legacy
    rows that pre-date the explicit key still bucket into the right
    cohort. Anything we cannot classify lands in ``other`` so the totals
    always reconcile against the per-channel ``failed`` count.
    """
    raw = (error_class_field or "").strip().lower()
    if raw in KNOWN_ERROR_CLASSES:
        return raw

    msg = (error_message or "").lower()
    if not msg:
        return "other"
    # Order matters: rate-limit before unreachable because "rate" can
    # co-occur with "503" in legacy logs and the cohort author cares
    # more about throttling than transient outage.
    if "auth" in msg or "401" in msg or "403" in msg:
        return "auth"
    if "rate" in msg or "429" in msg or "throttl" in msg:
        return "rate_limit"
    if "channel_not_found" in msg or "channel_left" in msg:
        return "channel_left"
    if "unreachable" in msg or "503" in msg or "timeout" in msg:
        return "unreachable"
    return "other"


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
        _log.exception("DCRO5 audit emit skipped")
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
    the DCR2 / DCRO3 / DCRO4 pattern.
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


def _query_misconfig_rows(
    db: Session,
    *,
    cid: str,
    cutoff: datetime,
) -> list[AuditEventRecord]:
    """Pull channel-misconfig rows for the clinic in the lookback window.

    Used to compute ``has_matching_misconfig_flag`` per failed row.
    Cross-clinic safe via the canonical ``clinic_id={cid}`` needle.
    """
    needle = f"clinic_id={cid}"
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == MISCONFIG_ACTION,
            AuditEventRecord.created_at >= cutoff.isoformat(),
        )
        .all()
    )
    return [r for r in rows if needle in (r.note or "")]


def _iso_week_key(ts: datetime) -> tuple[int, int]:
    """ISO-year + ISO-week tuple, used as the (channel, week) join key."""
    iso = ts.isocalendar()
    return (int(iso[0]), int(iso[1]))


def _row_failed(row: AuditEventRecord) -> bool:
    """Check whether a dispatched row is in a failed delivery state."""
    kv = _parse_dispatch_note(row.note or "")
    status = (kv.get("delivery_status") or "").strip().lower()
    return status in FAILED_STATUSES


# ── Schemas ─────────────────────────────────────────────────────────────────


class ErrorClassBreakdown(BaseModel):
    auth: int = 0
    rate_limit: int = 0
    channel_left: int = 0
    unreachable: int = 0
    other: int = 0


class ChannelBreakdown(BaseModel):
    failed: int = 0
    by_error_class: ErrorClassBreakdown = Field(
        default_factory=ErrorClassBreakdown
    )


class TopErrorClassEntry(BaseModel):
    channel: str
    error_class: str
    count: int


class TrendBucketOut(BaseModel):
    week_start: str
    failed: int = 0


class SummaryOut(BaseModel):
    window_days: int
    total_failed: int = 0
    total_dispatched: int = 0
    failure_rate_pct: Optional[float] = None
    by_channel: dict[str, ChannelBreakdown] = Field(default_factory=dict)
    top_error_classes: list[TopErrorClassEntry] = Field(default_factory=list)
    trend_buckets: list[TrendBucketOut] = Field(default_factory=list)


class FailedListItemOut(BaseModel):
    event_id: str
    resolver_user_id: str
    resolver_name: Optional[str] = None
    channel: str
    error_class: str
    error_message: Optional[str] = None
    dispatched_at: Optional[str] = None
    has_matching_misconfig_flag: bool = False


class FailedListOut(BaseModel):
    items: list[FailedListItemOut] = Field(default_factory=list)
    total: int
    page: int
    page_size: int


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
    """Per-channel, per-error-class breakdown of failed dispatches.

    Cross-clinic safety: every read is bounded by ``actor.clinic_id``.
    Failure rate is ``null`` when ``total_dispatched=0`` (no div-by-zero).
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)

    if not cid:
        # Unattached actors get an empty (but well-shaped) response so
        # the UI can render the no-data state without null-checking.
        return SummaryOut(
            window_days=w,
            total_failed=0,
            total_dispatched=0,
            failure_rate_pct=None,
            by_channel={
                ch: ChannelBreakdown() for ch in KNOWN_CHANNELS
            },
            top_error_classes=[],
            trend_buckets=_empty_trend_buckets(w),
        )

    cutoff = _window_cutoff(w)
    rows = _query_dispatched_rows(db, cid=cid, cutoff=cutoff)

    total_dispatched = len(rows)
    failed_rows = [r for r in rows if _row_failed(r)]
    total_failed = len(failed_rows)

    # Per-channel + per-error-class tally. Pre-seed the dict with the
    # canonical channel set so the response shape is stable even when
    # a clinic has zero failures of a given channel — UI cards must
    # always render.
    by_channel: dict[str, ChannelBreakdown] = {
        ch: ChannelBreakdown() for ch in KNOWN_CHANNELS
    }
    pair_counts: dict[tuple[str, str], int] = defaultdict(int)
    for r in failed_rows:
        kv = _parse_dispatch_note(r.note or "")
        ch = (kv.get("channel") or "").strip().lower()
        if ch not in by_channel:
            ch = "other"  # bucket unknown channels into a synthetic key
            if ch not in by_channel:
                by_channel[ch] = ChannelBreakdown()
        ec = _classify_error(kv.get("error_class"), kv.get("error_message"))
        by_channel[ch].failed += 1
        cur = by_channel[ch].by_error_class
        setattr(cur, ec, getattr(cur, ec, 0) + 1)
        pair_counts[(ch, ec)] += 1

    # Top-N (channel, error_class) leaderboard, sorted by count desc
    # then by (channel, error_class) for stable ordering on ties.
    sorted_pairs = sorted(
        pair_counts.items(),
        key=lambda kv: (-kv[1], kv[0][0], kv[0][1]),
    )
    top = [
        TopErrorClassEntry(channel=p[0][0], error_class=p[0][1], count=p[1])
        for p in sorted_pairs[:TOP_ERROR_CLASSES_N]
    ]

    # Failure rate — null when nothing was dispatched (avoids 0/0).
    rate: Optional[float] = None
    if total_dispatched > 0:
        rate = round((total_failed / total_dispatched) * 100.0, 2)

    trend = _trend_buckets(failed_rows, window_days=w)

    return SummaryOut(
        window_days=w,
        total_failed=total_failed,
        total_dispatched=total_dispatched,
        failure_rate_pct=rate,
        by_channel=by_channel,
        top_error_classes=top,
        trend_buckets=trend,
    )


def _empty_trend_buckets(window_days: int) -> list[TrendBucketOut]:
    n_buckets = max(1, (window_days + 6) // 7)
    n_buckets = min(n_buckets, 53)
    now = datetime.now(timezone.utc)
    out: list[TrendBucketOut] = []
    for i in range(n_buckets - 1, -1, -1):
        start = now - timedelta(days=(i + 1) * 7)
        out.append(TrendBucketOut(week_start=start.isoformat(), failed=0))
    return out


def _trend_buckets(
    failed_rows: list[AuditEventRecord], *, window_days: int
) -> list[TrendBucketOut]:
    """Weekly buckets — one bucket per ISO calendar week in the window."""
    n_buckets = max(1, (window_days + 6) // 7)
    n_buckets = min(n_buckets, 53)

    now = datetime.now(timezone.utc)
    buckets: list[TrendBucketOut] = []
    for i in range(n_buckets - 1, -1, -1):
        end = now - timedelta(days=i * 7)
        start = now - timedelta(days=(i + 1) * 7)
        count = 0
        for row in failed_rows:
            ts = _coerce_dt(row.created_at)
            if ts is None:
                continue
            if ts <= start or ts > end:
                continue
            count += 1
        buckets.append(
            TrendBucketOut(week_start=start.isoformat(), failed=count)
        )
    return buckets


@router.get("/list", response_model=FailedListOut)
def list_failed(
    channel: Optional[str] = Query(default=None, max_length=32),
    error_class: Optional[str] = Query(default=None, max_length=32),
    start: Optional[str] = Query(default=None, max_length=64),
    end: Optional[str] = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=MIN_PAGE_SIZE, le=MAX_PAGE_SIZE),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FailedListOut:
    """Paginated list of failed dispatched rows.

    Each item carries ``has_matching_misconfig_flag`` — true when a
    ``caregiver_portal.channel_misconfigured_detected`` row exists in
    the same ISO week + clinic + channel. That boolean is the
    click-through anchor in the UI: clicking the badge navigates to
    the Channel Misconfig Detector view (the existing Care Team
    Coverage caregiver-channels tab).
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    if not cid:
        return FailedListOut(items=[], total=0, page=page, page_size=page_size)

    # Establish the lookback window. Default to MAX_WINDOW_DAYS so the
    # caller's filter (start/end) does the trimming when supplied.
    cutoff = _window_cutoff(MAX_WINDOW_DAYS)
    rows = _query_dispatched_rows(db, cid=cid, cutoff=cutoff)
    failed = [r for r in rows if _row_failed(r)]

    # Filter pass: channel / error_class / start / end.
    ch_norm = (channel or "").strip().lower() or None
    ec_norm = (error_class or "").strip().lower() or None
    start_dt = _coerce_dt(start)
    end_dt = _coerce_dt(end)

    enriched: list[tuple[AuditEventRecord, dict, str, str]] = []
    for r in failed:
        kv = _parse_dispatch_note(r.note or "")
        row_ch = (kv.get("channel") or "").strip().lower() or "other"
        row_ec = _classify_error(
            kv.get("error_class"), kv.get("error_message")
        )
        if ch_norm and row_ch != ch_norm:
            continue
        if ec_norm and row_ec != ec_norm:
            continue
        ts = _coerce_dt(r.created_at)
        if start_dt is not None and (ts is None or ts < start_dt):
            continue
        if end_dt is not None and (ts is None or ts > end_dt):
            continue
        enriched.append((r, kv, row_ch, row_ec))

    total = len(enriched)
    # Newest first — operationally the admin almost always wants the
    # most-recent failure on top.
    enriched.sort(
        key=lambda t: (t[0].created_at or ""), reverse=True
    )

    # Pagination.
    p = max(1, int(page))
    ps = max(MIN_PAGE_SIZE, min(MAX_PAGE_SIZE, int(page_size)))
    offset = (p - 1) * ps
    page_slice = enriched[offset : offset + ps]

    # Look up resolver display names in bulk for header rendering.
    resolver_ids = {
        (e[1].get("resolver_user_id") or e[0].target_id or "").strip()
        for e in page_slice
    }
    resolver_ids.discard("")
    user_map: dict[str, User] = {}
    if resolver_ids:
        user_map = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(resolver_ids)).all()
        }

    # Build the (channel, ISO-week) lookup over channel-misconfig rows
    # so each failed item can be marked with ``has_matching_misconfig_flag``
    # in O(N) time without a per-row DB hit.
    misconfig_rows = _query_misconfig_rows(db, cid=cid, cutoff=cutoff)
    misconfig_index: set[tuple[str, int, int]] = set()
    for mr in misconfig_rows:
        kv = _parse_dispatch_note(mr.note or "")
        # The detector emits the channel as ``preferred_channel=`` in
        # its row note. Fall back to ``channel=`` for forward-compat.
        mch = (
            (kv.get("preferred_channel") or kv.get("channel") or "")
            .strip()
            .lower()
        )
        if not mch:
            continue
        ts = _coerce_dt(mr.created_at)
        if ts is None:
            continue
        wk = _iso_week_key(ts)
        misconfig_index.add((mch, wk[0], wk[1]))

    items: list[FailedListItemOut] = []
    for r, kv, row_ch, row_ec in page_slice:
        rid = (kv.get("resolver_user_id") or r.target_id or "").strip()
        u = user_map.get(rid)
        name = (
            getattr(u, "display_name", None)
            or getattr(u, "email", None)
            or rid
        ) if u else rid
        # Prefer the explicit ``error_message=`` field; fall back to
        # the entire row note so legacy rows still surface something.
        em_raw = (kv.get("error_message") or r.note or "").strip()
        em_trunc = em_raw[:ERROR_MESSAGE_TRUNC] if em_raw else None

        ts = _coerce_dt(r.created_at)
        match = False
        if ts is not None:
            wk = _iso_week_key(ts)
            match = (row_ch, wk[0], wk[1]) in misconfig_index

        items.append(
            FailedListItemOut(
                event_id=r.event_id or "",
                resolver_user_id=rid,
                resolver_name=name or rid,
                channel=row_ch,
                error_class=row_ec,
                error_message=em_trunc,
                dispatched_at=r.created_at,
                has_matching_misconfig_flag=match,
            )
        )

    return FailedListOut(
        items=items,
        total=total,
        page=p,
        page_size=ps,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list for the drilldown surface."""
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
    ``target_type='coaching_digest_delivery_failure_drilldown'``.
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
    "MISCONFIG_TARGET_TYPE",
    "MISCONFIG_ACTION",
    "KNOWN_CHANNELS",
    "KNOWN_ERROR_CLASSES",
    "FAILED_STATUSES",
]
