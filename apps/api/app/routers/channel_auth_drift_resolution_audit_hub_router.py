"""Channel Auth Drift Resolution Audit Hub (CSAHP3, 2026-05-02).

Cohort dashboard built on the audit trail emitted by CSAHP1
(:mod:`app.workers.channel_auth_health_probe_worker` — #417) and CSAHP2
(:mod:`app.routers.channel_auth_drift_resolution_router` — #422).

The proactive credential probe loop is now closed end-to-end, but
admins still need a single read-only dashboard that:

* shows the drift → mark → confirm rotation funnel over a time window
* breaks down rotation method (manual / automated_rotation /
  key_revoked) so admins can see whether the org is moving toward
  automated rotation
* surfaces per-channel mean / median time-to-rotate and time-to-confirm
* surfaces per-channel re-flag rate within 30d (a leading indicator of
  credential storage / policy issues — credential rotation alone does
  not fix systemic leakage / reuse)
* ranks top rotators by count + median time-to-rotate so admins can see
  who is carrying the credential-rotation load and whether their
  rotations stick

Source data: existing ``channel_auth_health_probe.*`` audit rows. No
schema change. No background worker. Read-only analytics surface,
clinician minimum, with strict cross-clinic scoping.

Endpoints
=========

* ``GET /api/v1/channel-auth-drift-resolution-audit-hub/summary?window_days=90``
  — funnel counts + percentages + rotation-method distribution +
  per-channel metrics + weekly trend buckets.
* ``GET /api/v1/channel-auth-drift-resolution-audit-hub/top-rotators?window_days=90&min_rotations=2``
  — top rotators leaderboard.
* ``GET /api/v1/channel-auth-drift-resolution-audit-hub/audit-events``
  — paginated audit-event list scoped to clinic + this surface.
* ``POST /api/v1/channel-auth-drift-resolution-audit-hub/audit-events``
  — page-level audit ingestion.

Cross-clinic safety
-------------------

Every endpoint scopes by ``actor.clinic_id`` and uses the canonical
``clinic_id={cid}`` substring needle to filter audit rows so a clinician
in clinic A never sees rows from clinic B even when the underlying
``audit_event_records`` row would otherwise match on
``target_type``/``action`` alone. Mirrors the DCR2 → DCRO1 pattern
(#392 / #393).
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
from app.services.auth_drift_resolution_pairing import (
    ALLOWED_ROTATION_METHODS,
    DEFAULT_WINDOW_DAYS,
    MAX_WINDOW_DAYS,
    MIN_WINDOW_DAYS,
    build_weekly_trend_buckets,
    compute_channel_metrics,
    compute_rotator_metrics,
    mean_or_none,
    median_or_none,
    pair_drifts_with_resolutions,
    rotation_method_distribution,
)


router = APIRouter(
    prefix="/api/v1/channel-auth-drift-resolution-audit-hub",
    tags=["Channel Auth Drift Resolution Audit Hub"],
)
_log = logging.getLogger(__name__)


# Page-level surface used for self-rows (target_type) on the hub UI.
SURFACE = "channel_auth_drift_resolution_audit_hub"


# Probe channels that the worker covers — used to seed the by-channel
# response with zero rows so the UI always has the same set of keys.
PROBE_CHANNELS: tuple[str, ...] = (
    "slack",
    "sendgrid",
    "twilio",
    "pagerduty",
)


# Top-rotator leaderboard cap. Mirrors the DCR2 top-resolvers cap.
TOP_ROTATORS_CAP = 10


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
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception("CSAHP3 audit emit skipped")
    return eid


def _resolve_user_names(
    db: Session, user_ids: list[str]
) -> dict[str, User]:
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


def _round_pct(numerator: int, denominator: int) -> Optional[float]:
    """Return ``(numerator / denominator) * 100`` as a 2dp float, or
    ``None`` when the denominator is zero (so the UI can render a dash
    instead of a misleading 0%)."""
    if denominator <= 0:
        return None
    return round((numerator / float(denominator)) * 100.0, 2)


# ── Schemas ─────────────────────────────────────────────────────────────────


class RotationFunnelOut(BaseModel):
    detected: int = 0
    marked_rotated: int = 0
    confirmed: int = 0
    re_flagged_within_30d: int = 0


class RotationFunnelPctOut(BaseModel):
    marked_pct: Optional[float] = None
    confirmed_pct: Optional[float] = None
    re_flag_pct: Optional[float] = None


class RotationMethodDistributionOut(BaseModel):
    manual: int = 0
    automated_rotation: int = 0
    key_revoked: int = 0
    other: int = 0


class ByChannelOut(BaseModel):
    drifts: int = 0
    rotated: int = 0
    confirmed: int = 0
    re_flagged_within_30d: int = 0
    mean_time_to_rotate_hours: Optional[float] = None
    median_time_to_rotate_hours: Optional[float] = None
    mean_time_to_confirm_hours: Optional[float] = None
    median_time_to_confirm_hours: Optional[float] = None
    re_flag_rate_pct: Optional[float] = None


class TrendBucketOut(BaseModel):
    week_start: str
    week_end: str
    detected: int
    rotated: int
    re_flagged: int


class SummaryOut(BaseModel):
    window_days: int
    total_drifts: int
    rotation_funnel: RotationFunnelOut = Field(
        default_factory=RotationFunnelOut
    )
    rotation_funnel_pct: RotationFunnelPctOut = Field(
        default_factory=RotationFunnelPctOut
    )
    rotation_method_distribution: RotationMethodDistributionOut = Field(
        default_factory=RotationMethodDistributionOut
    )
    by_channel: dict[str, ByChannelOut] = Field(default_factory=dict)
    trend_buckets: list[TrendBucketOut] = Field(default_factory=list)
    clinic_id: Optional[str] = None
    worker_enabled: Optional[bool] = None


class TopRotatorOut(BaseModel):
    rotator_user_id: str
    rotator_name: Optional[str] = None
    rotations: int
    confirmed_rotations: int
    re_flagged_within_30d: int
    median_time_to_rotate_hours: Optional[float] = None
    re_flag_rate_pct: Optional[float] = None
    last_rotation_at: Optional[str] = None


class TopRotatorsListOut(BaseModel):
    items: list[TopRotatorOut] = Field(default_factory=list)
    window_days: int
    min_rotations: int
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
    window_days: int = Query(
        default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SummaryOut:
    """Return funnel counts + per-channel metrics + trend buckets."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)

    worker_enabled: Optional[bool] = None
    try:
        from app.workers.channel_auth_health_probe_worker import (
            env_enabled as _probe_env_enabled,
        )

        worker_enabled = bool(_probe_env_enabled())
    except Exception:  # pragma: no cover - defensive
        worker_enabled = None

    # Always seed by_channel with the canonical PROBE_CHANNELS keys so
    # the UI's per-channel table can render a row per channel even when
    # the channel has zero drifts in the window.
    seeded_by_channel: dict[str, ByChannelOut] = {
        ch: ByChannelOut() for ch in PROBE_CHANNELS
    }

    if not cid:
        return SummaryOut(
            window_days=w,
            total_drifts=0,
            rotation_funnel=RotationFunnelOut(),
            rotation_funnel_pct=RotationFunnelPctOut(),
            rotation_method_distribution=RotationMethodDistributionOut(),
            by_channel=seeded_by_channel,
            trend_buckets=[
                TrendBucketOut(**b)
                for b in build_weekly_trend_buckets([], window_days=w)
            ],
            clinic_id=None,
            worker_enabled=worker_enabled,
        )

    records = pair_drifts_with_resolutions(db, clinic_id=cid, window_days=w)
    total = len(records)
    rotated = sum(1 for r in records if r.marked_at is not None)
    confirmed = sum(1 for r in records if r.confirmed_at is not None)
    re_flagged = sum(1 for r in records if r.re_flagged_within_30d)

    funnel = RotationFunnelOut(
        detected=total,
        marked_rotated=rotated,
        confirmed=confirmed,
        re_flagged_within_30d=re_flagged,
    )
    funnel_pct = RotationFunnelPctOut(
        marked_pct=_round_pct(rotated, total),
        confirmed_pct=_round_pct(confirmed, rotated),
        re_flag_pct=_round_pct(re_flagged, confirmed),
    )

    method_dist = rotation_method_distribution(records)
    method_out = RotationMethodDistributionOut(
        manual=int(method_dist.get("manual", 0)),
        automated_rotation=int(method_dist.get("automated_rotation", 0)),
        key_revoked=int(method_dist.get("key_revoked", 0)),
        other=int(method_dist.get("other", 0)),
    )

    channel_metrics = compute_channel_metrics(records)
    by_channel: dict[str, ByChannelOut] = dict(seeded_by_channel)
    for ch, m in channel_metrics.items():
        by_channel[ch] = ByChannelOut(
            drifts=m.drifts,
            rotated=m.rotated,
            confirmed=m.confirmed,
            re_flagged_within_30d=m.re_flagged_within_30d,
            mean_time_to_rotate_hours=mean_or_none(m.time_to_rotate_hours),
            median_time_to_rotate_hours=median_or_none(
                m.time_to_rotate_hours
            ),
            mean_time_to_confirm_hours=mean_or_none(
                m.time_to_confirm_hours
            ),
            median_time_to_confirm_hours=median_or_none(
                m.time_to_confirm_hours
            ),
            re_flag_rate_pct=_round_pct(
                m.re_flagged_within_30d, m.confirmed
            ),
        )

    trend = [
        TrendBucketOut(**b)
        for b in build_weekly_trend_buckets(records, window_days=w)
    ]

    return SummaryOut(
        window_days=w,
        total_drifts=total,
        rotation_funnel=funnel,
        rotation_funnel_pct=funnel_pct,
        rotation_method_distribution=method_out,
        by_channel=by_channel,
        trend_buckets=trend,
        clinic_id=cid,
        worker_enabled=worker_enabled,
    )


@router.get("/top-rotators", response_model=TopRotatorsListOut)
def top_rotators(
    window_days: int = Query(
        default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS
    ),
    min_rotations: int = Query(default=2, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TopRotatorsListOut:
    """Return top rotators ranked by rotation count, then by user id."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    if not cid:
        return TopRotatorsListOut(
            items=[],
            window_days=w,
            min_rotations=min_rotations,
            clinic_id=None,
        )

    records = pair_drifts_with_resolutions(db, clinic_id=cid, window_days=w)
    rotators = compute_rotator_metrics(
        records, min_rotations=min_rotations
    )
    capped = rotators[:TOP_ROTATORS_CAP]
    user_ids = [r.rotator_user_id for r in capped]
    user_map = _resolve_user_names(db, user_ids)

    items: list[TopRotatorOut] = []
    for m in capped:
        items.append(
            TopRotatorOut(
                rotator_user_id=m.rotator_user_id,
                rotator_name=_pretty_name(user_map.get(m.rotator_user_id)),
                rotations=m.rotations,
                confirmed_rotations=m.confirmed_rotations,
                re_flagged_within_30d=m.re_flagged_within_30d,
                median_time_to_rotate_hours=m.median_time_to_rotate_hours,
                re_flag_rate_pct=_round_pct(
                    m.re_flagged_within_30d, m.confirmed_rotations
                ),
                last_rotation_at=(
                    m.last_rotation_at.isoformat()
                    if m.last_rotation_at is not None
                    else None
                ),
            )
        )

    return TopRotatorsListOut(
        items=items,
        window_days=w,
        min_rotations=min_rotations,
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


@router.post("/audit-events", response_model=PageAuditOut)
def post_audit_event(
    body: PageAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PageAuditOut:
    """Page-level audit ingestion under
    ``target_type='channel_auth_drift_resolution_audit_hub'``."""
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
