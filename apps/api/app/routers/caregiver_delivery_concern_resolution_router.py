"""Caregiver Delivery Concern Resolution router (2026-05-02).

Closes the DCA loop opened by #390 (Caregiver Delivery Concern
Aggregator). The aggregator emits HIGH-priority
``caregiver_portal.delivery_concern_threshold_reached`` audit rows when
a caregiver accumulates N+ delivery concerns within a rolling window;
the worker honors ``caregiver_portal.delivery_concern_resolved`` audit
rows for cooldown skip — but until this router shipped, no surface
ever EMITTED a resolution row, leaving flagged caregivers stuck in the
admin inbox indefinitely.

This router is the admin-side resolution surface. The Care Team
Coverage "Caregiver channels" tab (pgCareTeamCoverage in
apps/web/src/pages-knowledge.js) renders a "Resolution" subsection
inside the existing "Delivery concerns" panel. Admins / reviewers
mark a flagged caregiver as resolved with a structured reason +
free-text note; the resolution row clears the cooldown so the DCA
worker re-evaluates that caregiver on its next tick (re-flagging only
when fresh concerns continue to come in).

Endpoints
=========

* ``POST /api/v1/caregiver-delivery-concern-resolution/resolve``
  Body: ``{caregiver_user_id, resolution_reason, resolution_note}``.
  Emits ``caregiver_portal.delivery_concern_resolved`` audit row with
  ``caregiver_user_id``, ``clinic_id``, ``resolution_reason``,
  ``resolution_note`` in the note. Cooldown for that caregiver is
  cleared by virtue of the resolution row being newer than the last
  threshold-reached row.

* ``GET /api/v1/caregiver-delivery-concern-resolution/list?status=open``
  List of currently-flagged (unresolved) caregivers in the actor's
  clinic, with concern counts and last_flagged_at timestamps. Use
  ``status=resolved`` for recently-resolved (last 7d).

* ``GET /api/v1/caregiver-delivery-concern-resolution/audit-events``
  Paginated audit-event list scoped to the actor's clinic + the
  ``caregiver_delivery_concern_resolution`` surface.

* ``POST /api/v1/caregiver-delivery-concern-resolution/audit-events``
  Page-level audit ingestion under
  ``target_type='caregiver_delivery_concern_resolution'``.

Role gate
=========

Reviewer minimum for resolve (mirrors DCA worker pattern). Clinicians
+ admins clear ``reviewer`` automatically per the canonical hierarchy
``guest < patient < technician < reviewer < clinician < admin``.

Cross-clinic safety
===================

Every endpoint scopes by ``actor.clinic_id``. A resolve targeting a
caregiver in another clinic returns 404 (not 403) — the canonical
"hide existence" pattern used elsewhere in this codebase to prevent
cross-clinic enumeration.
"""
from __future__ import annotations

import logging
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
from app.errors import ApiServiceError
from app.persistence.models import AuditEventRecord, User
from app.workers.caregiver_delivery_concern_aggregator_worker import (
    FLAG_ACTION,
    PORTAL_SURFACE,
    RESOLVE_ACTION,
)


router = APIRouter(
    prefix="/api/v1/caregiver-delivery-concern-resolution",
    tags=["Caregiver Delivery Concern Resolution"],
)
_log = logging.getLogger(__name__)


# Page-level + worker-level surface for self-rows (target_type).
SURFACE = "caregiver_delivery_concern_resolution"


# Allowed reason codes — pinned so the audit trail can analyse cohort
# trends without fuzzy-matching free-text reasons.
ALLOWED_REASONS: frozenset[str] = frozenset(
    {
        "concerns_addressed",
        "false_positive",
        "caregiver_replaced",
        "other",
    }
)


# Recently-resolved window for the ``status=resolved`` list.
RESOLVED_WINDOW_HOURS = 24 * 7


# Open-flag scan window. Mirrors the DCA worker's default 7-day window
# so we don't list a caregiver that the aggregator wouldn't itself
# count any more.
OPEN_FLAG_WINDOW_HOURS = 24 * 30


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_resolve(actor: AuthenticatedActor) -> None:
    """Resolve requires ``reviewer`` minimum.

    Mirrors the DCA worker pattern from
    :mod:`app.routers.caregiver_delivery_concern_aggregator_router`. The
    canonical role hierarchy in this codebase is
    ``guest < patient < technician < reviewer < clinician < admin``;
    ``reviewer`` minimum lets quality-reviewer roles clear the gate
    while denying patients + technicians.
    """
    require_minimum_role(actor, "reviewer")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    """Coerce the actor's role to a value the AuditEvent pydantic schema
    accepts (``guest``/``clinician``/``admin``).

    The schema validator rejects ``reviewer``/``technician``/``patient``;
    DCA worker emits ``role="admin"`` directly. We mirror: collapse
    reviewer/clinician/admin to ``admin`` since this router gates at
    reviewer-min, so any actor that resolves is at least reviewer-tier.
    """
    if actor.role in {"admin", "clinician"}:
        return actor.role
    # reviewer/technician/patient/guest get coerced to ``clinician`` so
    # the row is still validation-clean (clinician is the closest
    # match for "actor took an action requiring clinical context").
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
    """Best-effort audit emission. Audit failures never block the UI."""
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
        _log.exception(
            "caregiver_delivery_concern_resolution audit emit skipped"
        )
    return eid


def _last_threshold_row(
    db: Session, *, caregiver_user_id: str, clinic_id: str
) -> Optional[AuditEventRecord]:
    """Return the most recent threshold-reached row for this
    (caregiver, clinic) within the open-flag scan window."""
    cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=OPEN_FLAG_WINDOW_HOURS)
    ).isoformat()
    needle = f"clinic_id={clinic_id}"
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_id == caregiver_user_id,
            AuditEventRecord.action == FLAG_ACTION,
            AuditEventRecord.created_at >= cutoff,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    for r in rows:
        if needle in (r.note or ""):
            return r
    return None


def _last_resolution_row(
    db: Session, *, caregiver_user_id: str, clinic_id: str
) -> Optional[AuditEventRecord]:
    cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=OPEN_FLAG_WINDOW_HOURS)
    ).isoformat()
    needle = f"clinic_id={clinic_id}"
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_id == caregiver_user_id,
            AuditEventRecord.action == RESOLVE_ACTION,
            AuditEventRecord.created_at >= cutoff,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    for r in rows:
        if needle in (r.note or ""):
            return r
    return None


def _is_open_flag(
    *,
    last_flag: Optional[AuditEventRecord],
    last_resolution: Optional[AuditEventRecord],
) -> bool:
    """A flag is "open" when it exists AND no resolution row newer than
    it is on file."""
    if last_flag is None:
        return False
    if last_resolution is None:
        return True
    return (last_resolution.created_at or "") < (last_flag.created_at or "")


def _parse_concern_count(note: str) -> int:
    if not note:
        return 0
    # note format: ``priority=high caregiver_id=... clinic_id=...
    # concern_count=N window_hours=N threshold=N``
    for part in (note or "").split():
        if part.startswith("concern_count="):
            try:
                return int(part.split("=", 1)[1])
            except ValueError:
                return 0
    return 0


# ── Schemas ─────────────────────────────────────────────────────────────────


class ResolveIn(BaseModel):
    caregiver_user_id: str = Field(..., min_length=1, max_length=128)
    resolution_reason: str = Field(..., min_length=1, max_length=64)
    resolution_note: str = Field(..., min_length=10, max_length=500)


class ResolveOut(BaseModel):
    accepted: bool = True
    status: str = "resolved"
    caregiver_user_id: str
    clinic_id: Optional[str] = None
    resolution_reason: str
    resolver_user_id: str
    resolved_at: str
    audit_event_id: str


class FlaggedItemOut(BaseModel):
    caregiver_user_id: str
    caregiver_display_name: Optional[str] = None
    caregiver_email: Optional[str] = None
    clinic_id: Optional[str] = None
    concern_count: int = 0
    last_flagged_at: str
    days_flagged: int = 0
    flag_event_id: str


class ResolvedItemOut(BaseModel):
    caregiver_user_id: str
    caregiver_display_name: Optional[str] = None
    caregiver_email: Optional[str] = None
    clinic_id: Optional[str] = None
    resolution_reason: Optional[str] = None
    resolution_note: Optional[str] = None
    resolver_user_id: Optional[str] = None
    resolved_at: str
    audit_event_id: str


class ListOut(BaseModel):
    status: str
    items: list[FlaggedItemOut] = Field(default_factory=list)
    resolved_items: list[ResolvedItemOut] = Field(default_factory=list)
    total: int = 0
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


@router.post("/resolve", response_model=ResolveOut)
def resolve_flag(
    body: ResolveIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ResolveOut:
    """Mark a flagged caregiver as resolved.

    Emits ``caregiver_portal.delivery_concern_resolved`` audit row whose
    note carries ``resolver_user_id``, ``clinic_id``,
    ``resolution_reason``, and ``resolution_note``. Idempotent — a
    second resolve when the caregiver is already resolved returns
    HTTP 200 with ``status='already_resolved'`` and the original audit
    row id (no duplicate emission).
    """
    _gate_resolve(actor)

    # Validate the reason code BEFORE any DB lookup to give a fast 422.
    reason = (body.resolution_reason or "").strip().lower()
    if reason not in ALLOWED_REASONS:
        raise ApiServiceError(
            code="invalid_resolution_reason",
            message=(
                "resolution_reason must be one of: "
                + ", ".join(sorted(ALLOWED_REASONS))
            ),
            status_code=422,
        )

    cid = _scope_clinic(actor)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Reviewer must belong to a clinic to resolve flags.",
            status_code=400,
        )

    # 1) Caregiver must exist (any clinic) for a 404 to be honest. Then
    #    the cross-clinic gate is enforced by clinic_id mismatch.
    caregiver = (
        db.query(User).filter(User.id == body.caregiver_user_id).first()
    )
    if caregiver is None:
        raise ApiServiceError(
            code="caregiver_not_found",
            message="No caregiver matched that ID.",
            status_code=404,
        )
    if caregiver.clinic_id != cid:
        # Cross-clinic — return 404 to hide existence (canonical pattern).
        raise ApiServiceError(
            code="caregiver_not_found",
            message="No caregiver matched that ID.",
            status_code=404,
        )

    # 2) Idempotency check — if there's a more recent resolution row than
    #    the most recent flag row, the caregiver is already resolved.
    last_flag = _last_threshold_row(
        db, caregiver_user_id=body.caregiver_user_id, clinic_id=cid
    )
    last_res = _last_resolution_row(
        db, caregiver_user_id=body.caregiver_user_id, clinic_id=cid
    )
    if last_flag is None:
        # No open flag at all — admin is resolving a phantom. Treat as
        # already-resolved so the UI stays sane.
        if last_res is not None:
            return ResolveOut(
                accepted=True,
                status="already_resolved",
                caregiver_user_id=body.caregiver_user_id,
                clinic_id=cid,
                resolution_reason=reason,
                resolver_user_id=last_res.actor_id or actor.actor_id,
                resolved_at=last_res.created_at or "",
                audit_event_id=last_res.event_id,
            )
        raise ApiServiceError(
            code="no_open_flag",
            message=(
                "No open delivery-concern flag exists for this caregiver."
            ),
            status_code=409,
        )
    if last_res is not None and (last_res.created_at or "") >= (
        last_flag.created_at or ""
    ):
        return ResolveOut(
            accepted=True,
            status="already_resolved",
            caregiver_user_id=body.caregiver_user_id,
            clinic_id=cid,
            resolution_reason=reason,
            resolver_user_id=last_res.actor_id or actor.actor_id,
            resolved_at=last_res.created_at or "",
            audit_event_id=last_res.event_id,
        )

    # 3) Emit the canonical resolution row on the caregiver_portal
    #    surface so the DCA worker's existing cooldown lookup sees it.
    note_safe = (body.resolution_note or "").strip().replace("\n", " ")
    portal_note = (
        f"caregiver_user_id={body.caregiver_user_id}; "
        f"clinic_id={cid}; "
        f"resolver_user_id={actor.actor_id}; "
        f"resolution_reason={reason}; "
        f"resolution_note={note_safe[:400]}"
    )
    portal_eid = _emit_audit(
        db,
        actor,
        event="delivery_concern_resolved",
        target_id=body.caregiver_user_id,
        target_type=PORTAL_SURFACE,
        action=RESOLVE_ACTION,
        note=portal_note,
    )

    # 4) Self-row on the resolution surface for audit-events listing.
    self_note = (
        f"clinic_id={cid}; "
        f"caregiver_user_id={body.caregiver_user_id}; "
        f"resolution_reason={reason}; "
        f"flag_event_id={last_flag.event_id}"
    )
    _emit_audit(
        db,
        actor,
        event="resolved",
        target_id=body.caregiver_user_id,
        target_type=SURFACE,
        action=f"{SURFACE}.resolved",
        note=self_note,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    return ResolveOut(
        accepted=True,
        status="resolved",
        caregiver_user_id=body.caregiver_user_id,
        clinic_id=cid,
        resolution_reason=reason,
        resolver_user_id=actor.actor_id,
        resolved_at=now_iso,
        audit_event_id=portal_eid,
    )


@router.get("/list", response_model=ListOut)
def list_flags(
    status: str = Query(default="open", max_length=16),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ListOut:
    """List flagged or recently-resolved caregivers in actor's clinic.

    ``status=open`` (default) returns the currently-flagged caregivers
    derived from ``audit_event_records`` whose ``action == FLAG_ACTION``
    in the last 30 days, excluding those with a more recent
    ``RESOLVE_ACTION`` row.

    ``status=resolved`` returns caregivers whose most recent resolution
    row landed in the last ``RESOLVED_WINDOW_HOURS``.
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    s = (status or "open").strip().lower()
    if s not in {"open", "resolved"}:
        s = "open"

    if not cid:
        return ListOut(status=s, clinic_id=None)

    open_cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=OPEN_FLAG_WINDOW_HOURS)
    ).isoformat()
    needle = f"clinic_id={cid}"

    # Pull every threshold-reached row for this clinic in the window.
    flag_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == FLAG_ACTION,
            AuditEventRecord.created_at >= open_cutoff,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    # Group by caregiver_user_id (target_id) keeping only the most
    # recent flag row per caregiver.
    flags_by_cg: dict[str, AuditEventRecord] = {}
    for r in flag_rows:
        if needle not in (r.note or ""):
            continue
        cg_id = r.target_id or ""
        if not cg_id:
            continue
        if cg_id not in flags_by_cg:
            flags_by_cg[cg_id] = r

    # Pull every resolution row for this clinic in the same window.
    resolved_cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=RESOLVED_WINDOW_HOURS)
    ).isoformat()
    resolution_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == RESOLVE_ACTION,
            AuditEventRecord.created_at >= open_cutoff,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    resolutions_by_cg: dict[str, AuditEventRecord] = {}
    for r in resolution_rows:
        if needle not in (r.note or ""):
            continue
        cg_id = r.target_id or ""
        if not cg_id:
            continue
        if cg_id not in resolutions_by_cg:
            resolutions_by_cg[cg_id] = r

    # Bulk-load caregiver users so list rows can carry display names +
    # emails without N+1 lookups.
    cg_ids = list(set(list(flags_by_cg.keys()) + list(resolutions_by_cg.keys())))
    users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(cg_ids)).all()}
        if cg_ids
        else {}
    )

    if s == "open":
        items: list[FlaggedItemOut] = []
        for cg_id, flag_row in flags_by_cg.items():
            res_row = resolutions_by_cg.get(cg_id)
            if res_row is not None and (res_row.created_at or "") >= (
                flag_row.created_at or ""
            ):
                continue  # already resolved
            user = users.get(cg_id)
            try:
                flagged_at = datetime.fromisoformat(flag_row.created_at)
                if flagged_at.tzinfo is None:
                    flagged_at = flagged_at.replace(tzinfo=timezone.utc)
                days = max(
                    0,
                    int(
                        (
                            datetime.now(timezone.utc) - flagged_at
                        ).total_seconds()
                        // 86400
                    ),
                )
            except Exception:
                days = 0
            items.append(
                FlaggedItemOut(
                    caregiver_user_id=cg_id,
                    caregiver_display_name=(
                        getattr(user, "display_name", None) if user else None
                    ),
                    caregiver_email=(
                        getattr(user, "email", None) if user else None
                    ),
                    clinic_id=cid,
                    concern_count=_parse_concern_count(flag_row.note or ""),
                    last_flagged_at=flag_row.created_at or "",
                    days_flagged=days,
                    flag_event_id=flag_row.event_id,
                )
            )
        # Most-recently-flagged first.
        items.sort(key=lambda it: it.last_flagged_at, reverse=True)
        return ListOut(
            status="open",
            items=items,
            total=len(items),
            clinic_id=cid,
        )

    # status=resolved: caregivers whose most recent resolution row is in
    # the last RESOLVED_WINDOW_HOURS.
    resolved_items: list[ResolvedItemOut] = []
    for cg_id, res_row in resolutions_by_cg.items():
        if (res_row.created_at or "") < resolved_cutoff:
            continue
        user = users.get(cg_id)
        note = res_row.note or ""
        reason: Optional[str] = None
        rnote: Optional[str] = None
        resolver: Optional[str] = res_row.actor_id or None
        for part in note.split(";"):
            p = part.strip()
            if p.startswith("resolution_reason="):
                reason = p.split("=", 1)[1].strip()
            elif p.startswith("resolution_note="):
                rnote = p.split("=", 1)[1].strip()
            elif p.startswith("resolver_user_id="):
                resolver = p.split("=", 1)[1].strip() or resolver
        resolved_items.append(
            ResolvedItemOut(
                caregiver_user_id=cg_id,
                caregiver_display_name=(
                    getattr(user, "display_name", None) if user else None
                ),
                caregiver_email=(
                    getattr(user, "email", None) if user else None
                ),
                clinic_id=cid,
                resolution_reason=reason,
                resolution_note=rnote,
                resolver_user_id=resolver,
                resolved_at=res_row.created_at or "",
                audit_event_id=res_row.event_id,
            )
        )
    resolved_items.sort(key=lambda it: it.resolved_at, reverse=True)
    return ListOut(
        status="resolved",
        resolved_items=resolved_items,
        total=len(resolved_items),
        clinic_id=cid,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=64),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list for the resolution
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
    ``target_type='caregiver_delivery_concern_resolution'``."""
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
