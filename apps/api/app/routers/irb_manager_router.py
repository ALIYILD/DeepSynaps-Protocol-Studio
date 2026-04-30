"""IRB Manager protocol register router (launch-audit 2026-04-30).

Endpoints
---------
GET    /api/v1/irb/protocols                          List protocols (filters)
GET    /api/v1/irb/protocols/summary                  Top counts (active/pending/closed/amendments_due)
GET    /api/v1/irb/protocols/export.csv               Filter-aware CSV export (DEMO prefix)
GET    /api/v1/irb/protocols/export.ndjson            Filter-aware NDJSON export (DEMO meta line)
GET    /api/v1/irb/protocols/{id}                     Detail (with amendment history)
POST   /api/v1/irb/protocols                          Create — PI must be a real ``User``
PATCH  /api/v1/irb/protocols/{id}                     Update mutable fields (closed → 409)
POST   /api/v1/irb/protocols/{id}/amendments          Log an amendment (reason required)
POST   /api/v1/irb/protocols/{id}/close               Close with sign-off note
POST   /api/v1/irb/protocols/{id}/reopen              Reopen — creates a new revision
POST   /api/v1/irb/protocols/audit-events             Page-level audit ingestion

Distinct from ``apps/api/app/routers/irb_router.py`` (legacy ``/api/v1/irb/
studies`` surface). Both can co-exist under ``/api/v1/irb`` because the path
namespaces don't collide. The legacy ``irb_studies`` table is preserved for
back-compat — this router introduces ``irb_protocols`` (+ amendments +
revisions) as the canonical regulator-credible register.

Role gate
---------
``clinician`` minimum. Admins see all clinics; clinicians see only protocols
that match their own ``clinic_id`` (or that they created when no clinic is
set, covering demo / no-clinic flows).

Cross-surface drill-out
-----------------------
Protocols carry ``protocol_code``, ``id``, and the PI link via ``pi_user_id``
so the frontend can navigate to: enrolled patients (patients-hub filtered by
protocol_id), consent docs (documents-hub filtered by source_target), and
adverse events (adverse-events filtered by protocol_id).

Immutability
------------
Closed protocols are immutable in-place. ``/reopen`` creates a new
``IRBProtocolRevision`` row so the audit trail records every state
transition. Amendments require a non-empty ``reason``. PI must be a real
``User`` — free-form strings are rejected with 422.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    IRBProtocol,
    IRBProtocolAmendment,
    IRBProtocolRevision,
    User,
)


_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/irb/protocols", tags=["IRB Manager"])


# ── Constants ───────────────────────────────────────────────────────────────


ALLOWED_PHASES = {
    "i",
    "ii",
    "iii",
    "iv",
    "observational",
    "pilot",
    "feasibility",
    "registry",
}

ALLOWED_STATUSES = {"pending", "active", "suspended", "closed", "reopened"}

ALLOWED_RISK_LEVELS = {"minimal", "greater_than_minimal"}

ALLOWED_AMENDMENT_TYPES = {
    "protocol_change",
    "consent_update",
    "personnel_change",
    "enrollment_expansion",
    "site_addition",
    "safety_update",
    "other",
}


IRB_MANAGER_DISCLAIMERS = [
    "IRB-approved protocols are subject to ongoing monitoring and timely amendment review.",
    "Closed protocols are immutable in-place; reopen creates a new revision with audit trail.",
    "Principal Investigators must be real users — free-form names are rejected.",
    "Demo rows are clearly marked and are NOT regulator-submittable.",
]


# ── Pydantic schemas ────────────────────────────────────────────────────────


class AmendmentOut(BaseModel):
    id: str
    protocol_id: str
    amendment_type: str
    description: str
    reason: str
    submitted_by: str
    submitted_at: str
    status: str
    consent_version_after: Optional[str] = None


class ProtocolOut(BaseModel):
    id: str
    clinic_id: Optional[str] = None
    protocol_code: Optional[str] = None
    title: str
    description: str = ""
    irb_board: Optional[str] = None
    irb_number: Optional[str] = None
    sponsor: Optional[str] = None
    pi_user_id: str
    pi_display_name: Optional[str] = None
    phase: Optional[str] = None
    status: str
    risk_level: Optional[str] = None
    approval_date: Optional[str] = None
    expiry_date: Optional[str] = None
    enrollment_target: Optional[int] = None
    enrolled_count: int = 0
    consent_version: Optional[str] = None
    amendments_count: int = 0
    revision_count: int = 0
    is_demo: bool = False
    created_at: str
    updated_at: str
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    closure_note: Optional[str] = None
    created_by: str
    payload_hash: Optional[str] = None


class ProtocolDetailOut(ProtocolOut):
    amendments: list[AmendmentOut] = Field(default_factory=list)


class ProtocolListResponse(BaseModel):
    items: list[ProtocolOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    disclaimers: list[str] = Field(default_factory=lambda: list(IRB_MANAGER_DISCLAIMERS))


class ProtocolSummaryResponse(BaseModel):
    total: int
    active: int
    pending: int
    suspended: int
    closed: int
    reopened: int
    by_phase: dict[str, int] = Field(default_factory=dict)
    by_risk_level: dict[str, int] = Field(default_factory=dict)
    amendments_due: int = 0  # protocols with expiry within 60 days and not closed
    expiring_within_30d: int = 0
    expired: int = 0
    demo_rows: int = 0
    disclaimers: list[str] = Field(default_factory=lambda: list(IRB_MANAGER_DISCLAIMERS))


class ProtocolCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str = Field(default="", max_length=8000)
    protocol_code: Optional[str] = Field(default=None, max_length=64)
    irb_board: Optional[str] = Field(default=None, max_length=255)
    irb_number: Optional[str] = Field(default=None, max_length=120)
    sponsor: Optional[str] = Field(default=None, max_length=255)
    pi_user_id: str = Field(..., min_length=1, max_length=64)
    phase: Optional[str] = None
    status: str = Field(default="pending")
    risk_level: Optional[str] = None
    approval_date: Optional[str] = Field(default=None, max_length=20)
    expiry_date: Optional[str] = Field(default=None, max_length=20)
    enrollment_target: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    consent_version: Optional[str] = Field(default=None, max_length=40)
    is_demo: bool = False


class ProtocolPatchIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=512)
    description: Optional[str] = Field(default=None, max_length=8000)
    protocol_code: Optional[str] = Field(default=None, max_length=64)
    irb_board: Optional[str] = Field(default=None, max_length=255)
    irb_number: Optional[str] = Field(default=None, max_length=120)
    sponsor: Optional[str] = Field(default=None, max_length=255)
    pi_user_id: Optional[str] = Field(default=None, max_length=64)
    phase: Optional[str] = None
    status: Optional[str] = None
    risk_level: Optional[str] = None
    approval_date: Optional[str] = Field(default=None, max_length=20)
    expiry_date: Optional[str] = Field(default=None, max_length=20)
    enrollment_target: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    enrolled_count: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    consent_version: Optional[str] = Field(default=None, max_length=40)
    note: Optional[str] = Field(default=None, max_length=2000)


class AmendmentIn(BaseModel):
    amendment_type: str = Field(..., min_length=1, max_length=60)
    description: str = Field(..., min_length=1, max_length=4000)
    reason: str = Field(..., min_length=1, max_length=4000)
    consent_version_after: Optional[str] = Field(default=None, max_length=40)


class CloseIn(BaseModel):
    note: str = Field(default="", max_length=4000)


class ReopenIn(BaseModel):
    reason: str = Field(default="", max_length=2000)


class IRBAuditEventIn(BaseModel):
    event: str = Field(..., max_length=120)
    protocol_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=1024)
    using_demo_data: Optional[bool] = False


class IRBAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_role(actor: AuthenticatedActor) -> None:
    require_minimum_role(
        actor,
        "clinician",
        warnings=[
            "IRB protocol register visibility is restricted to clinical reviewers and admins.",
        ],
    )


def _apply_clinic_scope(q, actor: AuthenticatedActor):
    """Cross-clinic isolation. Admins see all; clinicians see protocols whose
    ``clinic_id`` matches their own *or* that they created when no clinic is
    attached (demo / no-clinic case)."""
    if actor.role == "admin":
        return q
    if actor.clinic_id:
        return q.filter(
            or_(
                IRBProtocol.clinic_id == actor.clinic_id,
                IRBProtocol.created_by == actor.actor_id,
            )
        )
    return q.filter(IRBProtocol.created_by == actor.actor_id)


def _isofmt(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        # SQLite roundtrip strips tzinfo; coerce to UTC honestly.
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        if "T" not in s:
            return datetime.fromisoformat(s + "T00:00:00+00:00")
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _payload_hash(record: IRBProtocol) -> str:
    raw = "|".join(
        [
            record.id or "",
            record.title or "",
            record.protocol_code or "",
            record.irb_number or "",
            record.pi_user_id or "",
            record.phase or "",
            record.status or "",
            record.risk_level or "",
            record.approval_date or "",
            record.expiry_date or "",
            record.consent_version or "",
            _isofmt(record.created_at) or "",
            _isofmt(record.updated_at) or "",
            _isofmt(record.closed_at) or "",
            record.created_by or "",
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _resolve_pi_display(db: Session, pi_user_id: Optional[str]) -> Optional[str]:
    if not pi_user_id:
        return None
    user = db.query(User).filter(User.id == pi_user_id).first()
    if user is None:
        return None
    return user.display_name


def _validate_pi(db: Session, pi_user_id: Optional[str]) -> str:
    """PI must be a real ``User``. Free-form strings rejected with 422.

    Raises 422 when the supplied id does not match any user.
    """
    if not pi_user_id:
        raise ApiServiceError(
            code="invalid_pi",
            message="A Principal Investigator user_id is required.",
            status_code=422,
        )
    user = db.query(User).filter(User.id == pi_user_id).first()
    if user is None:
        raise ApiServiceError(
            code="invalid_pi",
            message=f"Principal Investigator '{pi_user_id}' is not a known user.",
            warnings=[
                "PIs must be real users — the IRB protocol register cannot accept "
                "free-form strings as accountable investigators.",
            ],
            status_code=422,
        )
    return pi_user_id


def _validate_phase(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    v = value.strip().lower()
    if v not in ALLOWED_PHASES:
        raise ApiServiceError(
            code="invalid_phase",
            message=f"phase must be one of: {sorted(ALLOWED_PHASES)}",
            status_code=422,
        )
    return v


def _validate_status(value: Optional[str]) -> str:
    if value is None or value == "":
        return "pending"
    v = value.strip().lower()
    if v not in ALLOWED_STATUSES:
        raise ApiServiceError(
            code="invalid_status",
            message=f"status must be one of: {sorted(ALLOWED_STATUSES)}",
            status_code=422,
        )
    return v


def _validate_risk_level(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    v = value.strip().lower()
    if v not in ALLOWED_RISK_LEVELS:
        raise ApiServiceError(
            code="invalid_risk_level",
            message=f"risk_level must be one of: {sorted(ALLOWED_RISK_LEVELS)}",
            status_code=422,
        )
    return v


def _validate_amendment_type(value: Optional[str]) -> str:
    if not value:
        raise ApiServiceError(
            code="invalid_amendment_type",
            message="amendment_type is required.",
            status_code=422,
        )
    v = value.strip().lower()
    if v not in ALLOWED_AMENDMENT_TYPES:
        raise ApiServiceError(
            code="invalid_amendment_type",
            message=f"amendment_type must be one of: {sorted(ALLOWED_AMENDMENT_TYPES)}",
            status_code=422,
        )
    return v


def _amendments_count(db: Session, protocol_id: str) -> int:
    return (
        db.query(IRBProtocolAmendment)
        .filter(IRBProtocolAmendment.protocol_id == protocol_id)
        .count()
    )


def _revision_count(db: Session, protocol_id: str) -> int:
    return (
        db.query(IRBProtocolRevision)
        .filter(IRBProtocolRevision.protocol_id == protocol_id)
        .count()
    )


def _to_out(
    record: IRBProtocol,
    *,
    db: Session,
) -> ProtocolOut:
    return ProtocolOut(
        id=record.id,
        clinic_id=record.clinic_id,
        protocol_code=record.protocol_code,
        title=record.title or "",
        description=record.description or "",
        irb_board=record.irb_board,
        irb_number=record.irb_number,
        sponsor=record.sponsor,
        pi_user_id=record.pi_user_id or "",
        pi_display_name=_resolve_pi_display(db, record.pi_user_id),
        phase=record.phase,
        status=record.status or "pending",
        risk_level=record.risk_level,
        approval_date=record.approval_date,
        expiry_date=record.expiry_date,
        enrollment_target=record.enrollment_target,
        enrolled_count=record.enrolled_count or 0,
        consent_version=record.consent_version,
        amendments_count=_amendments_count(db, record.id),
        revision_count=_revision_count(db, record.id),
        is_demo=bool(record.is_demo),
        created_at=_isofmt(record.created_at) or "",
        updated_at=_isofmt(record.updated_at) or "",
        closed_at=_isofmt(record.closed_at),
        closed_by=record.closed_by,
        closure_note=record.closure_note,
        created_by=record.created_by or "",
        payload_hash=_payload_hash(record),
    )


def _amendment_out(record: IRBProtocolAmendment) -> AmendmentOut:
    return AmendmentOut(
        id=record.id,
        protocol_id=record.protocol_id,
        amendment_type=record.amendment_type,
        description=record.description or "",
        reason=record.reason or "",
        submitted_by=record.submitted_by or "",
        submitted_at=_isofmt(record.submitted_at) or "",
        status=record.status or "submitted",
        consent_version_after=record.consent_version_after,
    )


def _record_revision(
    db: Session,
    *,
    record: IRBProtocol,
    actor: AuthenticatedActor,
    action: str,
    note: Optional[str] = None,
) -> None:
    snapshot = {
        "id": record.id,
        "title": record.title,
        "protocol_code": record.protocol_code,
        "irb_board": record.irb_board,
        "irb_number": record.irb_number,
        "pi_user_id": record.pi_user_id,
        "phase": record.phase,
        "status": record.status,
        "risk_level": record.risk_level,
        "approval_date": record.approval_date,
        "expiry_date": record.expiry_date,
        "enrollment_target": record.enrollment_target,
        "enrolled_count": record.enrolled_count,
        "consent_version": record.consent_version,
        "is_demo": bool(record.is_demo),
        "closed_at": _isofmt(record.closed_at),
        "closed_by": record.closed_by,
        "closure_note": record.closure_note,
    }
    last = (
        db.query(IRBProtocolRevision)
        .filter(IRBProtocolRevision.protocol_id == record.id)
        .order_by(IRBProtocolRevision.revision_idx.desc())
        .first()
    )
    next_idx = (last.revision_idx + 1) if last is not None else 0
    db.add(
        IRBProtocolRevision(
            protocol_id=record.id,
            revision_idx=next_idx,
            action=action,
            snapshot_json=json.dumps(snapshot, separators=(",", ":")),
            actor_id=actor.actor_id,
            actor_role=actor.role,
            note=(note or "")[:2000] or None,
        )
    )


def _self_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
) -> None:
    """Best-effort audit hook — must never block the UI."""
    try:
        from app.repositories.audit import create_audit_event

        now = datetime.now(timezone.utc)
        event_id = (
            f"irb_manager-{event}-{actor.actor_id}-{int(now.timestamp())}"
            f"-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type="irb_manager",
            action=f"irb_manager.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.debug("IRB manager self-audit skipped", exc_info=True)


def _apply_filters(
    q,
    *,
    status: Optional[str],
    phase: Optional[str],
    risk_level: Optional[str],
    pi_user_id: Optional[str],
    since: Optional[str],
    until: Optional[str],
    q_text: Optional[str],
):
    if status:
        s = status.strip().lower()
        if s in ALLOWED_STATUSES:
            q = q.filter(IRBProtocol.status == s)
    if phase:
        p = phase.strip().lower()
        if p in ALLOWED_PHASES:
            q = q.filter(IRBProtocol.phase == p)
    if risk_level:
        rl = risk_level.strip().lower()
        if rl in ALLOWED_RISK_LEVELS:
            q = q.filter(IRBProtocol.risk_level == rl)
    if pi_user_id:
        q = q.filter(IRBProtocol.pi_user_id == pi_user_id)
    if since:
        dt = _parse_iso(since)
        if dt is not None:
            q = q.filter(IRBProtocol.created_at >= dt)
    if until:
        upper_text = until + "T23:59:59" if "T" not in until else until
        dt = _parse_iso(upper_text)
        if dt is not None:
            q = q.filter(IRBProtocol.created_at <= dt)
    if q_text:
        like = f"%{q_text.strip()}%"
        q = q.filter(
            or_(
                IRBProtocol.title.like(like),
                IRBProtocol.description.like(like),
                IRBProtocol.protocol_code.like(like),
                IRBProtocol.irb_number.like(like),
            )
        )
    return q


# ── GET / (list) ─────────────────────────────────────────────────────────────


@router.get("", response_model=ProtocolListResponse)
def list_protocols(
    status: Optional[str] = Query(default=None),
    phase: Optional[str] = Query(default=None),
    risk_level: Optional[str] = Query(default=None),
    pi_user_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolListResponse:
    _gate_role(actor)
    base = _apply_clinic_scope(db.query(IRBProtocol), actor)
    filtered = _apply_filters(
        base,
        status=status,
        phase=phase,
        risk_level=risk_level,
        pi_user_id=pi_user_id,
        since=since,
        until=until,
        q_text=q,
    )
    total = filtered.count()
    rows = (
        filtered.order_by(IRBProtocol.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [_to_out(r, db=db) for r in rows]

    _self_audit(
        db,
        actor,
        event="list_viewed",
        target_id="list",
        note=(
            f"status={status or '-'} phase={phase or '-'} risk={risk_level or '-'} "
            f"pi={pi_user_id or '-'} q={(q or '-')[:80]} "
            f"limit={limit} offset={offset} total={total}"
        ),
    )
    return ProtocolListResponse(items=items, total=total, limit=limit, offset=offset)


# ── GET /summary ────────────────────────────────────────────────────────────


@router.get("/summary", response_model=ProtocolSummaryResponse)
def protocols_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolSummaryResponse:
    _gate_role(actor)
    rows = _apply_clinic_scope(db.query(IRBProtocol), actor).all()
    total = len(rows)
    by_phase: Counter[str] = Counter()
    by_risk: Counter[str] = Counter()
    open_active = pending = suspended = closed = reopened = 0
    amendments_due = 0
    expiring_30d = 0
    expired = 0
    demo_rows = 0
    today = datetime.now(timezone.utc).date()
    for r in rows:
        st = r.status or "pending"
        if st == "active":
            open_active += 1
        elif st == "pending":
            pending += 1
        elif st == "suspended":
            suspended += 1
        elif st == "closed":
            closed += 1
        elif st == "reopened":
            reopened += 1
        if r.phase:
            by_phase[r.phase] += 1
        if r.risk_level:
            by_risk[r.risk_level] += 1
        if r.expiry_date and r.status != "closed":
            try:
                exp = datetime.fromisoformat(r.expiry_date).date()
            except ValueError:
                exp = None
            if exp is not None:
                delta = (exp - today).days
                if delta < 0:
                    expired += 1
                elif delta <= 30:
                    expiring_30d += 1
                if delta <= 60:
                    amendments_due += 1
        if r.is_demo:
            demo_rows += 1
    return ProtocolSummaryResponse(
        total=total,
        active=open_active,
        pending=pending,
        suspended=suspended,
        closed=closed,
        reopened=reopened,
        by_phase=dict(by_phase),
        by_risk_level=dict(by_risk),
        amendments_due=amendments_due,
        expiring_within_30d=expiring_30d,
        expired=expired,
        demo_rows=demo_rows,
    )


# ── Exports ─────────────────────────────────────────────────────────────────


CSV_COLUMNS = [
    "id",
    "created_at",
    "updated_at",
    "protocol_code",
    "title",
    "irb_board",
    "irb_number",
    "sponsor",
    "pi_user_id",
    "pi_display_name",
    "phase",
    "status",
    "risk_level",
    "approval_date",
    "expiry_date",
    "enrollment_target",
    "enrolled_count",
    "consent_version",
    "amendments_count",
    "revision_count",
    "closed_at",
    "closed_by",
    "is_demo",
    "payload_hash",
]


def _filtered_rows_for_export(
    db: Session,
    actor: AuthenticatedActor,
    *,
    status: Optional[str],
    phase: Optional[str],
    risk_level: Optional[str],
    pi_user_id: Optional[str],
    since: Optional[str],
    until: Optional[str],
    q_text: Optional[str],
) -> list[IRBProtocol]:
    base = _apply_clinic_scope(db.query(IRBProtocol), actor)
    filtered = _apply_filters(
        base,
        status=status,
        phase=phase,
        risk_level=risk_level,
        pi_user_id=pi_user_id,
        since=since,
        until=until,
        q_text=q_text,
    )
    return filtered.order_by(IRBProtocol.created_at.desc()).limit(10_000).all()


@router.get("/export.csv")
def export_protocols_csv(
    status: Optional[str] = Query(default=None),
    phase: Optional[str] = Query(default=None),
    risk_level: Optional[str] = Query(default=None),
    pi_user_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_role(actor)
    rows = _filtered_rows_for_export(
        db,
        actor,
        status=status,
        phase=phase,
        risk_level=risk_level,
        pi_user_id=pi_user_id,
        since=since,
        until=until,
        q_text=q,
    )
    has_demo = any(r.is_demo for r in rows)
    buf = io.StringIO()
    if has_demo:
        # Exports add `# DEMO` prefix when any row is demo.
        buf.write(
            "# DEMO — at least one row in this export is demo data and is "
            "NOT regulator-submittable.\n"
        )
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        pi_display = _resolve_pi_display(db, r.pi_user_id) or ""
        writer.writerow(
            [
                r.id,
                _isofmt(r.created_at) or "",
                _isofmt(r.updated_at) or "",
                r.protocol_code or "",
                (r.title or "").replace("\n", " "),
                (r.irb_board or "").replace("\n", " "),
                r.irb_number or "",
                (r.sponsor or "").replace("\n", " "),
                r.pi_user_id or "",
                pi_display,
                r.phase or "",
                r.status or "",
                r.risk_level or "",
                r.approval_date or "",
                r.expiry_date or "",
                r.enrollment_target if r.enrollment_target is not None else "",
                r.enrolled_count or 0,
                r.consent_version or "",
                _amendments_count(db, r.id),
                _revision_count(db, r.id),
                _isofmt(r.closed_at) or "",
                r.closed_by or "",
                int(bool(r.is_demo)),
                _payload_hash(r),
            ]
        )
    _self_audit(
        db,
        actor,
        event="export_csv",
        target_id="list",
        note=f"rows={len(rows)} demo_rows={sum(1 for r in rows if r.is_demo)}",
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=irb_protocols.csv",
            "Cache-Control": "no-store",
            "X-IRB-Demo-Rows": str(sum(1 for r in rows if r.is_demo)),
        },
    )


@router.get("/export.ndjson")
def export_protocols_ndjson(
    status: Optional[str] = Query(default=None),
    phase: Optional[str] = Query(default=None),
    risk_level: Optional[str] = Query(default=None),
    pi_user_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_role(actor)
    rows = _filtered_rows_for_export(
        db,
        actor,
        status=status,
        phase=phase,
        risk_level=risk_level,
        pi_user_id=pi_user_id,
        since=since,
        until=until,
        q_text=q,
    )
    has_demo = any(r.is_demo for r in rows)
    lines: list[str] = []
    if has_demo:
        lines.append(
            json.dumps(
                {
                    "_meta": "DEMO",
                    "warning": (
                        "At least one row in this export is demo data and is "
                        "NOT regulator-submittable."
                    ),
                },
                separators=(",", ":"),
            )
        )
    demo_rows = 0
    for r in rows:
        out = _to_out(r, db=db)
        if out.is_demo:
            demo_rows += 1
        lines.append(json.dumps(out.model_dump(), separators=(",", ":")))
    body = "\n".join(lines) + ("\n" if lines else "")
    _self_audit(
        db,
        actor,
        event="export_ndjson",
        target_id="list",
        note=f"rows={len(rows)} demo_rows={demo_rows}",
    )
    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": "attachment; filename=irb_protocols.ndjson",
            "Cache-Control": "no-store",
            "X-IRB-Demo-Rows": str(demo_rows),
        },
    )


# ── POST / (create) ──────────────────────────────────────────────────────────


@router.post("", response_model=ProtocolOut, status_code=201)
def create_protocol(
    payload: ProtocolCreateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolOut:
    _gate_role(actor)
    pi_user_id = _validate_pi(db, payload.pi_user_id)
    phase = _validate_phase(payload.phase)
    status = _validate_status(payload.status)
    risk_level = _validate_risk_level(payload.risk_level)
    record = IRBProtocol(
        id=str(uuid.uuid4()),
        clinic_id=actor.clinic_id,
        protocol_code=(payload.protocol_code or None),
        title=payload.title.strip()[:512],
        description=(payload.description or "").strip(),
        irb_board=(payload.irb_board or None),
        irb_number=(payload.irb_number or None),
        sponsor=(payload.sponsor or None),
        pi_user_id=pi_user_id,
        phase=phase,
        status=status,
        risk_level=risk_level,
        approval_date=(payload.approval_date or None),
        expiry_date=(payload.expiry_date or None),
        enrollment_target=payload.enrollment_target,
        enrolled_count=0,
        consent_version=(payload.consent_version or None),
        is_demo=bool(payload.is_demo),
        created_by=actor.actor_id,
    )
    db.add(record)
    db.flush()
    _record_revision(db, record=record, actor=actor, action="create")
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="created",
        target_id=record.id,
        note=(
            f"phase={record.phase or '-'} status={record.status} "
            f"pi={record.pi_user_id} "
            + ("DEMO" if record.is_demo else "")
        ).strip(),
    )
    return _to_out(record, db=db)


# ── GET /{id} (detail) ──────────────────────────────────────────────────────


@router.get("/{protocol_id}", response_model=ProtocolDetailOut)
def get_protocol(
    protocol_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolDetailOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(IRBProtocol), actor)
        .filter(IRBProtocol.id == protocol_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="protocol_not_found",
            message="IRB protocol not found or not visible at your role.",
            warnings=["Cross-clinic protocols are hidden from non-admin roles."],
            status_code=404,
        )
    base = _to_out(record, db=db)
    amendments = (
        db.query(IRBProtocolAmendment)
        .filter(IRBProtocolAmendment.protocol_id == record.id)
        .order_by(IRBProtocolAmendment.submitted_at.desc())
        .all()
    )
    _self_audit(
        db,
        actor,
        event="protocol_viewed",
        target_id=record.id,
        note=f"status={record.status} phase={record.phase or '-'}",
    )
    return ProtocolDetailOut(
        **base.model_dump(),
        amendments=[_amendment_out(a) for a in amendments],
    )


# ── PATCH /{id} ─────────────────────────────────────────────────────────────


@router.patch("/{protocol_id}", response_model=ProtocolOut)
def patch_protocol(
    protocol_id: str,
    payload: ProtocolPatchIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(IRBProtocol), actor)
        .filter(IRBProtocol.id == protocol_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="protocol_not_found",
            message="IRB protocol not found or not visible at your role.",
            status_code=404,
        )
    if record.status == "closed":
        raise ApiServiceError(
            code="protocol_immutable",
            message=(
                "Closed protocols are immutable. Reopen first to record a new "
                "revision with audit trail."
            ),
            status_code=409,
        )
    changed: list[str] = []
    if payload.title is not None:
        record.title = payload.title.strip()[:512]
        changed.append("title")
    if payload.description is not None:
        record.description = payload.description.strip()
        changed.append("description")
    if payload.protocol_code is not None:
        record.protocol_code = payload.protocol_code or None
        changed.append("protocol_code")
    if payload.irb_board is not None:
        record.irb_board = payload.irb_board or None
        changed.append("irb_board")
    if payload.irb_number is not None:
        record.irb_number = payload.irb_number or None
        changed.append("irb_number")
    if payload.sponsor is not None:
        record.sponsor = payload.sponsor or None
        changed.append("sponsor")
    if payload.pi_user_id is not None:
        record.pi_user_id = _validate_pi(db, payload.pi_user_id)
        changed.append("pi_user_id")
    if payload.phase is not None:
        record.phase = _validate_phase(payload.phase)
        changed.append("phase")
    if payload.status is not None:
        new_status = _validate_status(payload.status)
        if new_status == "closed":
            raise ApiServiceError(
                code="use_close_endpoint",
                message=(
                    "Use POST /api/v1/irb/protocols/{id}/close to close a "
                    "protocol (requires sign-off note)."
                ),
                status_code=422,
            )
        record.status = new_status
        changed.append("status")
    if payload.risk_level is not None:
        record.risk_level = _validate_risk_level(payload.risk_level)
        changed.append("risk_level")
    if payload.approval_date is not None:
        record.approval_date = payload.approval_date or None
        changed.append("approval_date")
    if payload.expiry_date is not None:
        record.expiry_date = payload.expiry_date or None
        changed.append("expiry_date")
    if payload.enrollment_target is not None:
        record.enrollment_target = payload.enrollment_target
        changed.append("enrollment_target")
    if payload.enrolled_count is not None:
        record.enrolled_count = payload.enrolled_count
        changed.append("enrolled_count")
    if payload.consent_version is not None:
        record.consent_version = payload.consent_version or None
        changed.append("consent_version")
    if not changed:
        raise ApiServiceError(
            code="empty_patch",
            message="No fields supplied for update.",
            status_code=422,
        )
    _record_revision(
        db,
        record=record,
        actor=actor,
        action="update",
        note=(payload.note or None) or ",".join(changed),
    )
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="updated",
        target_id=record.id,
        note=f"changed={','.join(changed)}",
    )
    return _to_out(record, db=db)


# ── POST /{id}/amendments ───────────────────────────────────────────────────


@router.post("/{protocol_id}/amendments", response_model=AmendmentOut, status_code=201)
def create_amendment(
    protocol_id: str,
    payload: AmendmentIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(IRBProtocol), actor)
        .filter(IRBProtocol.id == protocol_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="protocol_not_found",
            message="IRB protocol not found or not visible at your role.",
            status_code=404,
        )
    if record.status == "closed":
        raise ApiServiceError(
            code="protocol_immutable",
            message="Closed protocols cannot accept new amendments. Reopen first.",
            status_code=409,
        )
    amendment_type = _validate_amendment_type(payload.amendment_type)
    reason = (payload.reason or "").strip()
    if not reason:
        raise ApiServiceError(
            code="amendment_reason_required",
            message="An amendment reason is required to maintain regulator audit trail.",
            status_code=422,
        )
    description = (payload.description or "").strip()
    if not description:
        raise ApiServiceError(
            code="amendment_description_required",
            message="An amendment description is required.",
            status_code=422,
        )
    amendment = IRBProtocolAmendment(
        id=str(uuid.uuid4()),
        protocol_id=record.id,
        amendment_type=amendment_type,
        description=description[:4000],
        reason=reason[:4000],
        submitted_by=actor.actor_id,
        status="submitted",
        consent_version_after=(payload.consent_version_after or None),
    )
    db.add(amendment)
    if payload.consent_version_after:
        record.consent_version = payload.consent_version_after.strip()[:40]
    _record_revision(
        db,
        record=record,
        actor=actor,
        action="amendment",
        note=f"type={amendment_type}; reason={reason[:200]}",
    )
    db.commit()
    db.refresh(amendment)
    _self_audit(
        db,
        actor,
        event="amended",
        target_id=record.id,
        note=f"amendment_id={amendment.id} type={amendment_type}",
    )
    return _amendment_out(amendment)


# ── POST /{id}/close ────────────────────────────────────────────────────────


@router.post("/{protocol_id}/close", response_model=ProtocolOut)
def close_protocol(
    protocol_id: str,
    payload: CloseIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(IRBProtocol), actor)
        .filter(IRBProtocol.id == protocol_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="protocol_not_found",
            message="IRB protocol not found or not visible at your role.",
            status_code=404,
        )
    if record.status == "closed":
        raise ApiServiceError(
            code="protocol_already_closed",
            message="Protocol is already closed.",
            status_code=409,
        )
    if not (payload.note or "").strip():
        raise ApiServiceError(
            code="closure_note_required",
            message="A closure note is required when signing off an IRB protocol.",
            warnings=[
                "Closures without a note cannot be reviewed by a regulator. "
                "Record what closed the protocol (study end, suspension, withdrawal).",
            ],
            status_code=422,
        )
    record.status = "closed"
    record.closed_at = datetime.now(timezone.utc)
    record.closed_by = actor.actor_id
    record.closure_note = (payload.note or "").strip()[:4000]
    _record_revision(
        db,
        record=record,
        actor=actor,
        action="close",
        note=record.closure_note,
    )
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="closed",
        target_id=record.id,
        note=f"signed_by={actor.actor_id}",
    )
    return _to_out(record, db=db)


# ── POST /{id}/reopen ───────────────────────────────────────────────────────


@router.post("/{protocol_id}/reopen", response_model=ProtocolOut)
def reopen_protocol(
    protocol_id: str,
    payload: ReopenIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(IRBProtocol), actor)
        .filter(IRBProtocol.id == protocol_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="protocol_not_found",
            message="IRB protocol not found or not visible at your role.",
            status_code=404,
        )
    if record.status != "closed":
        raise ApiServiceError(
            code="protocol_not_closed",
            message="Only closed protocols can be reopened.",
            status_code=409,
        )
    if not (payload.reason or "").strip():
        raise ApiServiceError(
            code="reopen_reason_required",
            message="A reason is required to reopen a closed IRB protocol.",
            status_code=422,
        )
    # Preserve closure metadata in the revision history; clear in-memory so
    # the live row reflects "reopened" (a regulator can still see the prior
    # closure via revisions).
    record.status = "reopened"
    record.closed_at = None
    record.closed_by = None
    record.closure_note = None
    _record_revision(
        db,
        record=record,
        actor=actor,
        action="reopen",
        note=(payload.reason or "").strip()[:2000],
    )
    db.commit()
    db.refresh(record)
    _self_audit(
        db,
        actor,
        event="reopened",
        target_id=record.id,
        note=(payload.reason or "")[:200],
    )
    return _to_out(record, db=db)


# ── POST /audit-events (page-level audit ingestion) ─────────────────────────


@router.post("/audit-events", response_model=IRBAuditEventOut)
def record_irb_audit_event(
    payload: IRBAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBAuditEventOut:
    _gate_role(actor)
    from app.repositories.audit import create_audit_event

    now = datetime.now(timezone.utc)
    event_id = (
        f"irb_manager-{payload.event}-{actor.actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    target_id = payload.protocol_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.protocol_id:
        note_parts.append(f"protocol={payload.protocol_id}")
    if payload.note:
        note_parts.append(payload.note[:500])
    note = "; ".join(note_parts) or payload.event

    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="irb_manager",
            action=f"irb_manager.{payload.event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception("IRB manager audit-event persistence failed")
        return IRBAuditEventOut(accepted=False, event_id=event_id)
    return IRBAuditEventOut(accepted=True, event_id=event_id)
