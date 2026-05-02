"""Channel Auth Drift Resolution Tracker (CSAHP2, 2026-05-02).

Closes the proactive-credential-monitoring loop opened by CSAHP1
(#417). The CSAHP1 worker proactively probes each clinic's configured
adapter credentials and emits ``channel_auth_health_probe.auth_drift_detected``
audit rows BEFORE the next digest dispatch fails — but until this
router shipped, there was no admin-side surface to MARK a drift as
rotated. The worker would re-flag the same drift on every tick (modulo
the 24h cooldown) leaving admins to manually wait for the cooldown to
expire after rotating credentials.

This router mirrors the DCA → DCR loop (#392 → #393):

* Admin marks an ``auth_drift_detected`` row as ``rotated`` (with a
  rotation_method + rotation_note). Emits
  ``channel_auth_health_probe.auth_drift_marked_rotated`` audit row
  tied to the actor.
* The CSAHP1 worker pairs the rotation with the NEXT successful probe
  within 24h to confirm the rotation worked, emitting a
  ``channel_auth_health_probe.auth_drift_resolved_confirmed`` row when
  the cycle closes (the worker hook is registered in
  :mod:`app.workers.channel_auth_health_probe_worker`).

Endpoints
=========

* ``POST /api/v1/channel-auth-drift-resolution/mark-rotated``
  Body: ``{auth_drift_audit_id, rotation_method, rotation_note}``.
  Emits ``channel_auth_health_probe.auth_drift_marked_rotated`` audit
  row whose note carries ``rotator_user_id``, ``clinic_id``,
  ``channel``, ``error_class``, ``rotation_method``, ``rotation_note``,
  and ``source_drift_event_id`` for the join-back.

* ``GET /api/v1/channel-auth-drift-resolution/list?status=open|resolved|pending_confirmation``
  Paginated list. ``open`` = unrotated drift rows; ``resolved`` = rotated
  AND confirmed; ``pending_confirmation`` = rotated but no
  confirmed-row yet.

* ``GET /api/v1/channel-auth-drift-resolution/audit-events``
  Paginated, scoped audit-event list.

Role gate
=========

mark-rotated: ``admin`` only. list / audit-events: ``clinician`` minimum.

Cross-clinic safety
===================

Every endpoint scopes by ``actor.clinic_id``. mark-rotated 404s when
the target ``auth_drift_audit_id`` lives in another clinic — canonical
"hide existence" pattern.
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
from app.persistence.models import AuditEventRecord
from app.workers.channel_auth_health_probe_worker import (
    PROBE_CHANNELS,
    WORKER_SURFACE,
)


router = APIRouter(
    prefix="/api/v1/channel-auth-drift-resolution",
    tags=["Channel Auth Drift Resolution"],
)
_log = logging.getLogger(__name__)


# Page-level + worker-level surface for self-rows (target_type).
SURFACE = "channel_auth_drift_resolution"


# Action constants — pinned so the worker confirmation hook + the test
# suite + this router all reference the same strings.
DRIFT_DETECTED_ACTION = f"{WORKER_SURFACE}.auth_drift_detected"
HEALTHY_ACTION = f"{WORKER_SURFACE}.healthy"
MARKED_ROTATED_ACTION = f"{WORKER_SURFACE}.auth_drift_marked_rotated"
RESOLVED_CONFIRMED_ACTION = f"{WORKER_SURFACE}.auth_drift_resolved_confirmed"


# Allowed rotation_method codes — pinned so the audit trail can analyse
# rotation-method cohort trends without fuzzy-matching free text.
ALLOWED_ROTATION_METHODS: frozenset[str] = frozenset(
    {
        "manual",
        "automated_rotation",
        "key_revoked",
    }
)


# Confirmation grace window — admins have 24h after marking-rotated for
# the next healthy probe to land before the row falls off
# pending_confirmation. Matches the worker's healthy-probe cadence
# (12h interval + 24h cooldown).
CONFIRMATION_GRACE_HOURS = 24


# Look-back window for "open" drift listing. Mirrors the CSAHP1 worker's
# default cooldown so we don't show drifts older than the worker would
# itself re-emit.
OPEN_DRIFT_WINDOW_HOURS = 24 * 30


# Already-rotated guard window. mark-rotated returns 409 when the same
# (clinic, channel) was already marked-rotated within this window — keeps
# admins from spamming the audit trail with duplicate "I rotated again"
# rows for the same drift.
ALREADY_ROTATED_GUARD_HOURS = 24


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_write(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    """Coerce the actor's role to a value the AuditEvent schema accepts."""
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
            role=_safe_audit_role(actor),
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception(
            "channel_auth_drift_resolution audit emit skipped"
        )
    return eid


def _parse_note_token(note: str, key: str) -> Optional[str]:
    """Return the first ``key=value`` token value from ``note``.

    The CSAHP1 emission format uses space-delimited ``key=value`` tokens
    that can contain spaces in trailing values (notably error_message).
    For these helpers we only parse leading token-style fields like
    ``clinic_id``, ``channel``, ``error_class``, ``priority`` so a
    single-pass split is safe.
    """
    if not note:
        return None
    needle = f"{key}="
    for tok in note.split():
        if tok.startswith(needle):
            return tok.split("=", 1)[1].rstrip(";")
    # Try semicolon-delimited form too (used in self-rows).
    for part in note.split(";"):
        p = part.strip()
        if p.startswith(needle):
            return p.split("=", 1)[1].strip()
    return None


def _drift_row_for_clinic(
    db: Session, *, audit_id: int, clinic_id: str
) -> Optional[AuditEventRecord]:
    """Return the drift row identified by primary-key ``audit_id`` if it
    belongs to ``clinic_id``. Returns ``None`` for cross-clinic / missing.
    """
    row = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.id == audit_id,
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == DRIFT_DETECTED_ACTION,
        )
        .first()
    )
    if row is None:
        return None
    note_clinic = _parse_note_token(row.note or "", "clinic_id") or ""
    if note_clinic != clinic_id:
        return None
    return row


def _last_marked_rotated_for(
    db: Session, *, clinic_id: str, channel: str, since: datetime
) -> Optional[AuditEventRecord]:
    """Most recent ``marked_rotated`` row for (clinic, channel) since cutoff."""
    cutoff = since.isoformat()
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == MARKED_ROTATED_ACTION,
            AuditEventRecord.created_at >= cutoff,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    cid_needle = f"clinic_id={clinic_id}"
    ch_needle = f"channel={channel}"
    for r in rows:
        note = r.note or ""
        if cid_needle in note and ch_needle in note:
            return r
    return None


def _confirmed_row_for_mark(
    db: Session, *, mark_event_id: str
) -> Optional[AuditEventRecord]:
    """Return the resolved_confirmed row that pairs with ``mark_event_id``."""
    needle = f"mark_rotated_event_id={mark_event_id}"
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == RESOLVED_CONFIRMED_ACTION,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    for r in rows:
        if needle in (r.note or ""):
            return r
    return None


# ── Schemas ─────────────────────────────────────────────────────────────────


class MarkRotatedIn(BaseModel):
    auth_drift_audit_id: int = Field(..., gt=0)
    rotation_method: str = Field(..., min_length=1, max_length=64)
    rotation_note: str = Field(..., min_length=10, max_length=500)


class MarkRotatedOut(BaseModel):
    accepted: bool = True
    status: str = "marked_rotated"
    auth_drift_audit_id: int
    clinic_id: Optional[str] = None
    channel: Optional[str] = None
    rotation_method: str
    rotator_user_id: str
    marked_at: str
    audit_event_id: str


class DriftItemOut(BaseModel):
    auth_drift_audit_id: int
    drift_event_id: str
    clinic_id: Optional[str] = None
    channel: Optional[str] = None
    error_class: Optional[str] = None
    error_message: Optional[str] = None
    flagged_at: str
    days_flagged: int = 0
    mark_rotated_event_id: Optional[str] = None
    marked_at: Optional[str] = None
    rotation_method: Optional[str] = None
    rotation_note: Optional[str] = None
    rotator_user_id: Optional[str] = None
    confirmed_event_id: Optional[str] = None
    confirmed_at: Optional[str] = None


class ListOut(BaseModel):
    status: str
    items: list[DriftItemOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
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


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.post("/mark-rotated", response_model=MarkRotatedOut)
def mark_rotated(
    body: MarkRotatedIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> MarkRotatedOut:
    """Mark an ``auth_drift_detected`` row as rotated.

    Emits ``channel_auth_health_probe.auth_drift_marked_rotated`` audit
    row whose note carries ``rotator_user_id``, ``clinic_id``,
    ``channel``, ``error_class``, ``rotation_method``, ``rotation_note``,
    and ``source_drift_event_id``. The CSAHP1 worker confirmation hook
    consumes this row to short-circuit the next healthy probe and emit
    a ``auth_drift_resolved_confirmed`` row.

    Returns 404 when the drift_audit_id targets another clinic (canonical
    hide-existence pattern). Returns 409 when the same (clinic, channel)
    was already marked-rotated in the last 24h.
    """
    _gate_write(actor)

    method = (body.rotation_method or "").strip().lower()
    if method not in ALLOWED_ROTATION_METHODS:
        raise ApiServiceError(
            code="invalid_rotation_method",
            message=(
                "rotation_method must be one of: "
                + ", ".join(sorted(ALLOWED_ROTATION_METHODS))
            ),
            status_code=422,
        )

    cid = _scope_clinic(actor)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to mark a drift rotated.",
            status_code=400,
        )

    drift = _drift_row_for_clinic(
        db, audit_id=body.auth_drift_audit_id, clinic_id=cid
    )
    if drift is None:
        raise ApiServiceError(
            code="auth_drift_not_found",
            message="No auth_drift_detected row matched that ID.",
            status_code=404,
        )

    channel = _parse_note_token(drift.note or "", "channel") or ""
    error_class = _parse_note_token(drift.note or "", "error_class") or ""

    if not channel or channel not in PROBE_CHANNELS:
        raise ApiServiceError(
            code="invalid_drift_row",
            message="Drift row is missing a recognised channel token.",
            status_code=409,
        )

    # 409 guard — if the same (clinic, channel) was marked-rotated
    # within the last ALREADY_ROTATED_GUARD_HOURS, refuse to emit a
    # duplicate row.
    cutoff = datetime.now(timezone.utc) - timedelta(
        hours=ALREADY_ROTATED_GUARD_HOURS
    )
    recent_mark = _last_marked_rotated_for(
        db, clinic_id=cid, channel=channel, since=cutoff
    )
    if recent_mark is not None:
        raise ApiServiceError(
            code="already_rotated_recently",
            message=(
                "This channel was already marked rotated within the last "
                f"{ALREADY_ROTATED_GUARD_HOURS}h. Wait for the next probe "
                "to confirm the previous rotation before marking again."
            ),
            status_code=409,
        )

    note_safe = (body.rotation_note or "").strip().replace("\n", " ")[:400]
    worker_note = (
        f"priority=info "
        f"clinic_id={cid} "
        f"channel={channel} "
        f"error_class={error_class or 'unknown'} "
        f"rotator_user_id={actor.actor_id} "
        f"rotation_method={method} "
        f"source_drift_event_id={drift.event_id} "
        f"rotation_note={note_safe}"
    )
    worker_eid = _emit_audit(
        db,
        actor,
        event="auth_drift_marked_rotated",
        target_id=str(cid),
        target_type=WORKER_SURFACE,
        action=MARKED_ROTATED_ACTION,
        note=worker_note,
    )

    self_note = (
        f"clinic_id={cid}; "
        f"channel={channel}; "
        f"rotation_method={method}; "
        f"source_drift_audit_id={body.auth_drift_audit_id}; "
        f"source_drift_event_id={drift.event_id}; "
        f"worker_event_id={worker_eid}"
    )
    _emit_audit(
        db,
        actor,
        event="marked_rotated",
        target_id=str(body.auth_drift_audit_id),
        target_type=SURFACE,
        action=f"{SURFACE}.marked_rotated",
        note=self_note,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    return MarkRotatedOut(
        accepted=True,
        status="marked_rotated",
        auth_drift_audit_id=body.auth_drift_audit_id,
        clinic_id=cid,
        channel=channel,
        rotation_method=method,
        rotator_user_id=actor.actor_id,
        marked_at=now_iso,
        audit_event_id=worker_eid,
    )


@router.get("/list", response_model=ListOut)
def list_drifts(
    status: str = Query(default="open", max_length=24),
    channel: Optional[str] = Query(default=None, max_length=32),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ListOut:
    """List drift rows by resolution status.

    ``status=open`` — drifts not yet marked-rotated AND with no newer
    confirmed-row.
    ``status=resolved`` — drifts marked-rotated AND followed by a
    confirmed-row within the grace window.
    ``status=pending_confirmation`` — drifts marked-rotated but no
    confirmed-row landed yet (still inside the 24h grace).
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    s = (status or "open").strip().lower()
    if s not in {"open", "resolved", "pending_confirmation"}:
        s = "open"

    if not cid:
        return ListOut(
            status=s, page=page, page_size=page_size, clinic_id=None
        )

    open_cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=OPEN_DRIFT_WINDOW_HOURS)
    ).isoformat()
    cid_needle = f"clinic_id={cid}"
    ch_filter = (channel or "").strip().lower() or None
    if ch_filter and ch_filter not in PROBE_CHANNELS:
        ch_filter = None

    drift_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == DRIFT_DETECTED_ACTION,
            AuditEventRecord.created_at >= open_cutoff,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    drift_rows = [r for r in drift_rows if cid_needle in (r.note or "")]
    if ch_filter:
        drift_rows = [
            r for r in drift_rows
            if f"channel={ch_filter}" in (r.note or "")
        ]

    mark_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == MARKED_ROTATED_ACTION,
            AuditEventRecord.created_at >= open_cutoff,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    mark_rows = [r for r in mark_rows if cid_needle in (r.note or "")]

    confirmed_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == WORKER_SURFACE,
            AuditEventRecord.action == RESOLVED_CONFIRMED_ACTION,
            AuditEventRecord.created_at >= open_cutoff,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .all()
    )
    confirmed_rows = [
        r for r in confirmed_rows if cid_needle in (r.note or "")
    ]

    # Index by source_drift_event_id so we can pair drifts with their
    # corresponding mark/confirmed rows.
    marks_by_drift: dict[str, AuditEventRecord] = {}
    for m in mark_rows:
        src = _parse_note_token(m.note or "", "source_drift_event_id")
        if src and src not in marks_by_drift:
            marks_by_drift[src] = m
    confirms_by_mark: dict[str, AuditEventRecord] = {}
    for c in confirmed_rows:
        src = _parse_note_token(c.note or "", "mark_rotated_event_id")
        if src and src not in confirms_by_mark:
            confirms_by_mark[src] = c

    items: list[DriftItemOut] = []
    now = datetime.now(timezone.utc)
    for d in drift_rows:
        d_note = d.note or ""
        d_channel = _parse_note_token(d_note, "channel") or ""
        d_err_class = _parse_note_token(d_note, "error_class") or ""
        # error_message is variable-length trailing; pull from the index
        # of the literal token.
        d_err_msg = ""
        idx = d_note.find("error_message=")
        if idx >= 0:
            d_err_msg = d_note[idx + len("error_message="):].strip()[:200]
        try:
            flagged_at = datetime.fromisoformat(d.created_at)
            if flagged_at.tzinfo is None:
                flagged_at = flagged_at.replace(tzinfo=timezone.utc)
            days = max(
                0, int((now - flagged_at).total_seconds() // 86400)
            )
        except Exception:
            days = 0

        m = marks_by_drift.get(d.event_id)
        c = None
        m_event_id = None
        marked_at = None
        rot_method = None
        rot_note = None
        rotator = None
        confirmed_event_id = None
        confirmed_at = None

        if m is not None:
            m_event_id = m.event_id
            marked_at = m.created_at
            rot_method = _parse_note_token(m.note or "", "rotation_method")
            rotator = _parse_note_token(m.note or "", "rotator_user_id")
            n_idx = (m.note or "").find("rotation_note=")
            if n_idx >= 0:
                rot_note = (m.note or "")[n_idx + len("rotation_note="):].strip()[:300]
            c = confirms_by_mark.get(m.event_id)
            if c is not None:
                confirmed_event_id = c.event_id
                confirmed_at = c.created_at

        # Status filter.
        if s == "open":
            if m is not None:
                continue
        elif s == "resolved":
            if m is None or c is None:
                continue
        else:  # pending_confirmation
            if m is None or c is not None:
                continue
            # Drop pending rows past the grace window — they fall back to
            # the open list once a fresh drift re-flags.
            try:
                m_at = datetime.fromisoformat(m.created_at)
                if m_at.tzinfo is None:
                    m_at = m_at.replace(tzinfo=timezone.utc)
                if now - m_at > timedelta(hours=CONFIRMATION_GRACE_HOURS):
                    continue
            except Exception:
                pass

        items.append(
            DriftItemOut(
                auth_drift_audit_id=int(d.id or 0),
                drift_event_id=d.event_id,
                clinic_id=cid,
                channel=d_channel or None,
                error_class=d_err_class or None,
                error_message=d_err_msg or None,
                flagged_at=d.created_at or "",
                days_flagged=days,
                mark_rotated_event_id=m_event_id,
                marked_at=marked_at,
                rotation_method=rot_method,
                rotation_note=rot_note,
                rotator_user_id=rotator,
                confirmed_event_id=confirmed_event_id,
                confirmed_at=confirmed_at,
            )
        )

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    items_page = items[start:end]
    return ListOut(
        status=s,
        items=items_page,
        total=total,
        page=page,
        page_size=page_size,
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
    """Clinic-scoped paginated audit-event list."""
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
