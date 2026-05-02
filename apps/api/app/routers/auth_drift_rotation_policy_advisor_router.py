"""Auth Drift Rotation Policy Advisor router (CSAHP4, 2026-05-02).

Read-only advisor surface that consumes the leading-indicator signals
already exposed by CSAHP3
(:mod:`app.routers.channel_auth_drift_resolution_audit_hub_router` —
#424). Surfaces heuristic recommendation cards when a clinic's
per-channel re-flag rate, manual-rotation share, or auth-error-class
share crosses an actionable threshold.

Endpoints
=========

* ``GET /api/v1/auth-drift-rotation-policy-advisor/advice?window_days=90``
  — list of advice cards.
* ``GET /api/v1/auth-drift-rotation-policy-advisor/audit-events``
  — paginated audit-event list scoped to clinic + this surface.
* ``POST /api/v1/auth-drift-rotation-policy-advisor/audit-events``
  — page-level audit ingestion.

Cross-clinic safety
-------------------

Every endpoint scopes by ``actor.clinic_id`` and inherits the
``clinic_id={cid}`` substring needle from
:func:`compute_rotation_advice` (which calls CSAHP3's
``pair_drifts_with_resolutions``) so a clinician in clinic A never
sees rows from clinic B even when the underlying audit row would
otherwise match on ``target_type`` / ``action`` alone.

No DB writes outside the page-level audit-event ingestion. No new
schema. No background worker. Mirrors the CSAHP3 / DCRO5 read-only
advisor pattern.
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
from app.services.auth_drift_resolution_pairing import (
    DEFAULT_WINDOW_DAYS,
    MAX_WINDOW_DAYS,
)
from app.services.rotation_policy_advisor import (
    ADVISOR_CHANNELS,
    AUTH_DOMINANT_MIN_DRIFTS,
    AUTH_DOMINANT_PCT_THRESHOLD,
    MANUAL_REFLAG_PCT_THRESHOLD,
    MANUAL_SHARE_PCT_THRESHOLD,
    REFLAG_HIGH_MIN_CONFIRMED,
    REFLAG_HIGH_PCT_THRESHOLD,
    compute_rotation_advice,
)


router = APIRouter(
    prefix="/api/v1/auth-drift-rotation-policy-advisor",
    tags=["Auth Drift Rotation Policy Advisor"],
)
_log = logging.getLogger(__name__)


# Page-level surface used for self-rows (target_type) on the advisor UI.
SURFACE = "auth_drift_rotation_policy_advisor"


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    if actor.role in {"admin", "clinician"}:
        return actor.role
    return "clinician"


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
        _log.exception("CSAHP4 audit emit skipped")
    return eid


# ── Schemas ─────────────────────────────────────────────────────────────────


class AdviceCardOut(BaseModel):
    channel: str
    severity: str
    advice_code: str
    title: str
    body: str
    supporting_metrics: dict[str, float] = Field(default_factory=dict)


class AdviceListOut(BaseModel):
    window_days: int
    generated_at: str
    advice_cards: list[AdviceCardOut] = Field(default_factory=list)
    total_advice_cards: int = 0
    channels_with_advice: list[str] = Field(default_factory=list)
    clinic_id: Optional[str] = None
    thresholds: dict[str, float] = Field(default_factory=dict)


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


@router.get("/advice", response_model=AdviceListOut)
def list_advice(
    window_days: int = Query(
        default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdviceListOut:
    """Return rotation policy advice cards for the actor's clinic.

    Each card carries ``channel``, ``severity`` (``high`` or
    ``medium``), ``advice_code`` (``REFLAG_HIGH``, ``MANUAL_REFLAG``,
    or ``AUTH_DOMINANT``), a human-readable ``title`` + ``body``, and
    ``supporting_metrics`` containing the numeric inputs
    (``re_flag_rate_pct``, ``confirmed_count``,
    ``manual_rotation_share_pct``, ``auth_error_class_share_pct``,
    ``total_drifts``, ``rotations``).
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)

    thresholds: dict[str, float] = {
        "reflag_high_pct": REFLAG_HIGH_PCT_THRESHOLD,
        "reflag_high_min_confirmed": float(REFLAG_HIGH_MIN_CONFIRMED),
        "manual_share_pct": MANUAL_SHARE_PCT_THRESHOLD,
        "manual_reflag_pct": MANUAL_REFLAG_PCT_THRESHOLD,
        "auth_dominant_pct": AUTH_DOMINANT_PCT_THRESHOLD,
        "auth_dominant_min_drifts": float(AUTH_DOMINANT_MIN_DRIFTS),
    }

    if not cid:
        return AdviceListOut(
            window_days=int(window_days),
            generated_at=datetime.now(timezone.utc).isoformat(),
            advice_cards=[],
            total_advice_cards=0,
            channels_with_advice=[],
            clinic_id=None,
            thresholds=thresholds,
        )

    cards = compute_rotation_advice(
        db, clinic_id=cid, window_days=int(window_days)
    )
    out_cards: list[AdviceCardOut] = []
    seen_channels: list[str] = []
    seen_set: set[str] = set()
    for c in cards:
        out_cards.append(
            AdviceCardOut(
                channel=c.channel,
                severity=c.severity,
                advice_code=c.advice_code,
                title=c.title,
                body=c.body,
                supporting_metrics={
                    k: float(v) for k, v in (c.supporting_metrics or {}).items()
                },
            )
        )
        if c.channel not in seen_set:
            seen_set.add(c.channel)
            seen_channels.append(c.channel)

    generated_at = (
        cards[0].generated_at.isoformat()
        if cards and cards[0].generated_at is not None
        else datetime.now(timezone.utc).isoformat()
    )
    return AdviceListOut(
        window_days=int(window_days),
        generated_at=generated_at,
        advice_cards=out_cards,
        total_advice_cards=len(out_cards),
        channels_with_advice=seen_channels,
        clinic_id=cid,
        thresholds=thresholds,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list for the advisor surface."""
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
    ``target_type='auth_drift_rotation_policy_advisor'``."""
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


# Re-export ``ADVISOR_CHANNELS`` for tests / linters that need to know
# what channels this surface evaluates without importing the service.
__all__ = ["router", "SURFACE", "ADVISOR_CHANNELS"]
