"""Quality Assurance findings router (launch-audit 2026-04-30).

Endpoints
---------
GET    /api/v1/qa/findings                         List findings (filters)
GET    /api/v1/qa/findings/summary                 Counts + capa-overdue
GET    /api/v1/qa/findings/export.csv              Filter-aware CSV export
GET    /api/v1/qa/findings/export.ndjson           Filter-aware NDJSON export
GET    /api/v1/qa/findings/{finding_id}            Detail
POST   /api/v1/qa/findings                         Create non-conformance
PATCH  /api/v1/qa/findings/{finding_id}            Update fields (severity / owner / status / capa)
POST   /api/v1/qa/findings/{finding_id}/close      Closure with sign-off
POST   /api/v1/qa/findings/{finding_id}/reopen     Reopen — creates a new revision
POST   /api/v1/qa/findings/audit-events            Page-level audit ingestion

Distinct from ``apps/api/app/routers/qa_router.py`` (artifact-level QA scoring
engine — ``/run`` / ``/specs`` / ``/checks``). Both can co-exist under the
``/api/v1/qa`` prefix because the path namespaces don't collide.

Role gate
---------
``clinician`` minimum. Admins see all clinics; clinicians see only findings
that match their own ``clinic_id`` (or that they reported themselves when no
clinic is set).

Cross-surface drill-out
-----------------------
Findings carry ``source_target_type`` (e.g. ``adverse_events``, ``sessions``,
``reports``, ``documents``, ``qeeg``, ``brain_map_planner``) and
``source_target_id`` so the frontend can navigate to the source record. This
is the regulator-credibility loop: every QA finding is anchored in a real
audited surface, never a free-floating note.

Immutability
------------
Closed findings are immutable in-place. ``/reopen`` creates a new
``QualityFindingRevision`` row so the audit trail records every state
transition. CAPA owners are validated against the ``users`` table (they
cannot be free-form strings).
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

from fastapi import APIRouter, Depends, Query, Request, Response
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
from app.persistence.models import QualityFinding, QualityFindingRevision, User


_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qa/findings", tags=["Quality Assurance"])


# Cross-surface targets the QA page can drill into. Keep in sync with
# ``KNOWN_SURFACES`` in ``audit_trail_router`` and ``qeeg_analysis_router``.
KNOWN_SOURCE_TARGETS = {
    "adverse_events",
    "sessions",
    "reports",
    "documents",
    "qeeg",
    "brain_map_planner",
    "session_runner",
    "audit_trail",
    "quality_assurance",
}

ALLOWED_FINDING_TYPES = {
    "non_conformance",
    "sae_followup",
    "documentation_gap",
    "protocol_deviation",
    "capa",
    "observation",
}

ALLOWED_SEVERITIES = {"minor", "major", "critical"}

ALLOWED_STATUSES = {"open", "in_progress", "closed", "reopened"}

# Honest disclaimers always rendered on the page banner so reviewers see the
# regulatory ceiling for this view.
QA_PAGE_DISCLAIMERS = [
    "Quality Assurance findings require timely owner action and clinician sign-off.",
    "CAPA owners and due dates support regulator inspection — keep them current.",
    "Closed findings are immutable; reopen creates a new revision with audit trail.",
]


# ── Pydantic schemas ────────────────────────────────────────────────────────


class FindingOut(BaseModel):
    id: str
    clinic_id: Optional[str] = None
    title: str
    description: str = ""
    finding_type: str
    severity: str
    status: str
    owner_id: Optional[str] = None
    owner_display_name: Optional[str] = None
    capa_text: Optional[str] = None
    capa_due_date: Optional[str] = None
    capa_overdue: bool = False
    source_target_type: Optional[str] = None
    source_target_id: Optional[str] = None
    evidence_links: list[dict[str, str]] = Field(default_factory=list)
    is_demo: bool = False
    created_at: str
    updated_at: str
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    closure_note: Optional[str] = None
    reporter_id: str
    revision_count: int = 0
    payload_hash: Optional[str] = None


class FindingListResponse(BaseModel):
    items: list[FindingOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    disclaimers: list[str] = Field(default_factory=lambda: list(QA_PAGE_DISCLAIMERS))


class FindingSummaryResponse(BaseModel):
    total: int
    open: int
    in_progress: int
    closed: int
    reopened: int
    by_severity: dict[str, int] = Field(default_factory=dict)
    by_finding_type: dict[str, int] = Field(default_factory=dict)
    sae_related: int = 0
    capa_overdue: int = 0
    demo_rows: int = 0
    disclaimers: list[str] = Field(default_factory=lambda: list(QA_PAGE_DISCLAIMERS))


class FindingCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=8000)
    finding_type: str = Field(default="non_conformance")
    severity: str = Field(default="minor")
    owner_id: Optional[str] = Field(default=None, max_length=64)
    capa_text: Optional[str] = Field(default=None, max_length=4000)
    capa_due_date: Optional[str] = Field(default=None, max_length=32)
    source_target_type: Optional[str] = Field(default=None, max_length=32)
    source_target_id: Optional[str] = Field(default=None, max_length=64)
    evidence_links: list[dict[str, str]] = Field(default_factory=list)
    is_demo: bool = False


class FindingPatchIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=8000)
    finding_type: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    owner_id: Optional[str] = Field(default=None, max_length=64)
    capa_text: Optional[str] = Field(default=None, max_length=4000)
    capa_due_date: Optional[str] = Field(default=None, max_length=32)
    source_target_type: Optional[str] = Field(default=None, max_length=32)
    source_target_id: Optional[str] = Field(default=None, max_length=64)
    evidence_links: Optional[list[dict[str, str]]] = None
    note: Optional[str] = Field(default=None, max_length=2000)


class FindingCloseIn(BaseModel):
    note: str = Field(default="", max_length=4000)
    signature: Optional[str] = Field(default=None, max_length=255)


class FindingReopenIn(BaseModel):
    reason: str = Field(default="", max_length=2000)


class QAAuditEventIn(BaseModel):
    event: str = Field(..., max_length=120)
    finding_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=1024)
    using_demo_data: Optional[bool] = False


class QAAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_role(actor: AuthenticatedActor) -> None:
    require_minimum_role(
        actor,
        "clinician",
        warnings=[
            "QA findings visibility is restricted to clinical reviewers and admins.",
        ],
    )


def _apply_clinic_scope(q, actor: AuthenticatedActor):
    """Cross-clinic isolation. Admins see all; clinicians see findings whose
    ``clinic_id`` matches their own *or* whose ``reporter_id`` is themselves
    (covers the demo / no-clinic case where clinic_id is NULL)."""
    if actor.role == "admin":
        return q
    if actor.clinic_id:
        return q.filter(
            or_(
                QualityFinding.clinic_id == actor.clinic_id,
                QualityFinding.reporter_id == actor.actor_id,
            )
        )
    return q.filter(QualityFinding.reporter_id == actor.actor_id)


def _isofmt(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        # SQLite roundtrip strips tzinfo; coerce to UTC honestly.
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _decode_evidence(raw: Optional[str]) -> list[dict[str, str]]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        out: list[dict[str, str]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", ""))[:255]
            target_type = str(item.get("target_type", ""))[:32]
            target_id = str(item.get("target_id", ""))[:64]
            out.append({"label": label, "target_type": target_type, "target_id": target_id})
        return out
    except (ValueError, TypeError):
        return []


def _encode_evidence(links: list[dict[str, str]] | None) -> Optional[str]:
    if not links:
        return None
    sanitized: list[dict[str, str]] = []
    for item in links:
        if not isinstance(item, dict):
            continue
        sanitized.append(
            {
                "label": str(item.get("label", ""))[:255],
                "target_type": str(item.get("target_type", ""))[:32],
                "target_id": str(item.get("target_id", ""))[:64],
            }
        )
    if not sanitized:
        return None
    return json.dumps(sanitized, separators=(",", ":"))


def _capa_overdue(record: QualityFinding) -> bool:
    if record.status == "closed":
        return False
    due = (record.capa_due_date or "").strip()
    if not due:
        return False
    today = datetime.now(timezone.utc).date().isoformat()
    return due < today


def _payload_hash(record: QualityFinding) -> str:
    raw = "|".join(
        [
            record.id or "",
            record.title or "",
            record.finding_type or "",
            record.severity or "",
            record.status or "",
            record.owner_id or "",
            record.capa_text or "",
            record.capa_due_date or "",
            _isofmt(record.created_at) or "",
            _isofmt(record.updated_at) or "",
            _isofmt(record.closed_at) or "",
            record.reporter_id or "",
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _resolve_owner_display(
    db: Session, owner_id: Optional[str]
) -> Optional[str]:
    if not owner_id:
        return None
    user = db.query(User).filter(User.id == owner_id).first()
    if user is None:
        return None
    return user.display_name


def _validate_owner(db: Session, owner_id: Optional[str]) -> Optional[str]:
    """CAPA owners must be real Users — never free-form strings.

    Returns ``owner_id`` unchanged if valid (or None when not supplied).
    Raises 422 when the supplied id does not match any user. This is the
    "no fake CAPA owners" rule from the launch-audit brief.
    """
    if not owner_id:
        return None
    user = db.query(User).filter(User.id == owner_id).first()
    if user is None:
        raise ApiServiceError(
            code="invalid_capa_owner",
            message=f"CAPA owner '{owner_id}' is not a known user.",
            warnings=[
                "Owners must be real users — the QA register cannot accept "
                "free-form strings as accountable owners.",
            ],
            status_code=422,
        )
    return owner_id


def _to_out(record: QualityFinding, *, revision_count: int, owner_display: Optional[str]) -> FindingOut:
    return FindingOut(
        id=record.id,
        clinic_id=record.clinic_id,
        title=record.title or "",
        description=record.description or "",
        finding_type=record.finding_type or "non_conformance",
        severity=record.severity or "minor",
        status=record.status or "open",
        owner_id=record.owner_id,
        owner_display_name=owner_display,
        capa_text=record.capa_text,
        capa_due_date=record.capa_due_date,
        capa_overdue=_capa_overdue(record),
        source_target_type=record.source_target_type,
        source_target_id=record.source_target_id,
        evidence_links=_decode_evidence(record.evidence_links_json),
        is_demo=bool(record.is_demo),
        created_at=_isofmt(record.created_at) or "",
        updated_at=_isofmt(record.updated_at) or "",
        closed_at=_isofmt(record.closed_at),
        closed_by=record.closed_by,
        closure_note=record.closure_note,
        reporter_id=record.reporter_id or "",
        revision_count=revision_count,
        payload_hash=_payload_hash(record),
    )


def _record_revision(
    db: Session,
    *,
    record: QualityFinding,
    actor: AuthenticatedActor,
    action: str,
    note: Optional[str] = None,
) -> None:
    snapshot = {
        "id": record.id,
        "title": record.title,
        "description": record.description,
        "finding_type": record.finding_type,
        "severity": record.severity,
        "status": record.status,
        "owner_id": record.owner_id,
        "capa_text": record.capa_text,
        "capa_due_date": record.capa_due_date,
        "source_target_type": record.source_target_type,
        "source_target_id": record.source_target_id,
        "is_demo": bool(record.is_demo),
        "closed_at": _isofmt(record.closed_at),
        "closed_by": record.closed_by,
        "closure_note": record.closure_note,
    }
    last = (
        db.query(QualityFindingRevision)
        .filter(QualityFindingRevision.finding_id == record.id)
        .order_by(QualityFindingRevision.revision_idx.desc())
        .first()
    )
    next_idx = (last.revision_idx + 1) if last is not None else 0
    db.add(
        QualityFindingRevision(
            finding_id=record.id,
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
            f"quality_assurance-{event}-{actor.actor_id}-{int(now.timestamp())}"
            f"-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type="quality_assurance",
            action=f"quality_assurance.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.debug("QA self-audit skipped", exc_info=True)


def _validate_finding_type(value: Optional[str]) -> str:
    if value is None:
        return "non_conformance"
    v = value.strip().lower()
    if v not in ALLOWED_FINDING_TYPES:
        raise ApiServiceError(
            code="invalid_finding_type",
            message=f"finding_type must be one of: {sorted(ALLOWED_FINDING_TYPES)}",
            status_code=422,
        )
    return v


def _validate_severity(value: Optional[str]) -> str:
    if value is None:
        return "minor"
    v = value.strip().lower()
    if v not in ALLOWED_SEVERITIES:
        raise ApiServiceError(
            code="invalid_severity",
            message=f"severity must be one of: {sorted(ALLOWED_SEVERITIES)}",
            status_code=422,
        )
    return v


def _validate_status(value: Optional[str]) -> str:
    if value is None:
        return "open"
    v = value.strip().lower()
    if v not in ALLOWED_STATUSES:
        raise ApiServiceError(
            code="invalid_status",
            message=f"status must be one of: {sorted(ALLOWED_STATUSES)}",
            status_code=422,
        )
    return v


def _validate_source_target_type(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    v = value.strip().lower()
    if v not in KNOWN_SOURCE_TARGETS:
        raise ApiServiceError(
            code="invalid_source_target_type",
            message=(
                f"source_target_type must be one of: {sorted(KNOWN_SOURCE_TARGETS)}"
            ),
            status_code=422,
        )
    return v


def _apply_filters(
    q,
    *,
    status: Optional[str],
    severity: Optional[str],
    finding_type: Optional[str],
    owner_id: Optional[str],
    since: Optional[str],
    until: Optional[str],
    q_text: Optional[str],
    source_target_type: Optional[str],
    source_target_id: Optional[str],
    capa_overdue_only: bool,
):
    if status:
        s = status.strip().lower()
        if s in ALLOWED_STATUSES:
            q = q.filter(QualityFinding.status == s)
    if severity:
        sv = severity.strip().lower()
        if sv in ALLOWED_SEVERITIES:
            q = q.filter(QualityFinding.severity == sv)
    if finding_type:
        ft = finding_type.strip().lower()
        if ft in ALLOWED_FINDING_TYPES:
            q = q.filter(QualityFinding.finding_type == ft)
    if owner_id:
        q = q.filter(QualityFinding.owner_id == owner_id)
    if since:
        dt = _parse_iso(since)
        if dt is not None:
            q = q.filter(QualityFinding.created_at >= dt)
    if until:
        upper_text = until + "T23:59:59" if "T" not in until else until
        dt = _parse_iso(upper_text)
        if dt is not None:
            q = q.filter(QualityFinding.created_at <= dt)
    if q_text:
        like = f"%{q_text.strip()}%"
        q = q.filter(
            or_(
                QualityFinding.title.like(like),
                QualityFinding.description.like(like),
                QualityFinding.capa_text.like(like),
            )
        )
    if source_target_type:
        q = q.filter(QualityFinding.source_target_type == source_target_type)
    if source_target_id:
        q = q.filter(QualityFinding.source_target_id == source_target_id)
    if capa_overdue_only:
        today = datetime.now(timezone.utc).date().isoformat()
        q = q.filter(
            QualityFinding.capa_due_date.isnot(None),
            QualityFinding.capa_due_date < today,
            QualityFinding.status != "closed",
        )
    return q


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        if "T" not in s:
            return datetime.fromisoformat(s + "T00:00:00+00:00")
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _revision_count(db: Session, finding_id: str) -> int:
    return (
        db.query(QualityFindingRevision)
        .filter(QualityFindingRevision.finding_id == finding_id)
        .count()
    )


# ── GET / (list) ─────────────────────────────────────────────────────────────


@router.get("", response_model=FindingListResponse)
def list_findings(
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    finding_type: Optional[str] = Query(default=None),
    owner_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    source_target_type: Optional[str] = Query(default=None),
    source_target_id: Optional[str] = Query(default=None),
    capa_overdue_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FindingListResponse:
    _gate_role(actor)
    base = _apply_clinic_scope(db.query(QualityFinding), actor)
    filtered = _apply_filters(
        base,
        status=status,
        severity=severity,
        finding_type=finding_type,
        owner_id=owner_id,
        since=since,
        until=until,
        q_text=q,
        source_target_type=source_target_type,
        source_target_id=source_target_id,
        capa_overdue_only=capa_overdue_only,
    )
    total = filtered.count()
    rows = (
        filtered.order_by(QualityFinding.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items: list[FindingOut] = []
    for r in rows:
        items.append(
            _to_out(
                r,
                revision_count=_revision_count(db, r.id),
                owner_display=_resolve_owner_display(db, r.owner_id),
            )
        )

    _self_audit(
        db,
        actor,
        event="list_viewed",
        target_id="list",
        note=(
            f"status={status or '-'} severity={severity or '-'} "
            f"finding_type={finding_type or '-'} q={(q or '-')[:80]} "
            f"limit={limit} offset={offset} total={total}"
        ),
    )

    return FindingListResponse(items=items, total=total, limit=limit, offset=offset)


# ── GET /summary ────────────────────────────────────────────────────────────


@router.get("/summary", response_model=FindingSummaryResponse)
def findings_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FindingSummaryResponse:
    _gate_role(actor)
    rows = _apply_clinic_scope(db.query(QualityFinding), actor).all()
    total = len(rows)
    by_severity: Counter[str] = Counter()
    by_finding_type: Counter[str] = Counter()
    open_ct = in_progress_ct = closed_ct = reopened_ct = 0
    sae_related = 0
    capa_overdue = 0
    demo_rows = 0
    for r in rows:
        by_severity[r.severity or "minor"] += 1
        by_finding_type[r.finding_type or "non_conformance"] += 1
        st = r.status or "open"
        if st == "open":
            open_ct += 1
        elif st == "in_progress":
            in_progress_ct += 1
        elif st == "closed":
            closed_ct += 1
        elif st == "reopened":
            reopened_ct += 1
        if (
            r.finding_type == "sae_followup"
            or (r.source_target_type == "adverse_events")
        ):
            sae_related += 1
        if _capa_overdue(r):
            capa_overdue += 1
        if r.is_demo:
            demo_rows += 1
    return FindingSummaryResponse(
        total=total,
        open=open_ct,
        in_progress=in_progress_ct,
        closed=closed_ct,
        reopened=reopened_ct,
        by_severity=dict(by_severity),
        by_finding_type=dict(by_finding_type),
        sae_related=sae_related,
        capa_overdue=capa_overdue,
        demo_rows=demo_rows,
    )


# ── GET /export.csv ─────────────────────────────────────────────────────────


CSV_COLUMNS = [
    "id",
    "created_at",
    "updated_at",
    "title",
    "finding_type",
    "severity",
    "status",
    "owner_id",
    "owner_display_name",
    "capa_text",
    "capa_due_date",
    "capa_overdue",
    "source_target_type",
    "source_target_id",
    "reporter_id",
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
    severity: Optional[str],
    finding_type: Optional[str],
    owner_id: Optional[str],
    since: Optional[str],
    until: Optional[str],
    q_text: Optional[str],
    source_target_type: Optional[str],
    source_target_id: Optional[str],
    capa_overdue_only: bool,
) -> list[QualityFinding]:
    base = _apply_clinic_scope(db.query(QualityFinding), actor)
    filtered = _apply_filters(
        base,
        status=status,
        severity=severity,
        finding_type=finding_type,
        owner_id=owner_id,
        since=since,
        until=until,
        q_text=q_text,
        source_target_type=source_target_type,
        source_target_id=source_target_id,
        capa_overdue_only=capa_overdue_only,
    )
    return filtered.order_by(QualityFinding.created_at.desc()).limit(10_000).all()


@router.get("/export.csv")
def export_findings_csv(
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    finding_type: Optional[str] = Query(default=None),
    owner_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    source_target_type: Optional[str] = Query(default=None),
    source_target_id: Optional[str] = Query(default=None),
    capa_overdue_only: bool = Query(default=False),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_role(actor)
    rows = _filtered_rows_for_export(
        db,
        actor,
        status=status,
        severity=severity,
        finding_type=finding_type,
        owner_id=owner_id,
        since=since,
        until=until,
        q_text=q,
        source_target_type=source_target_type,
        source_target_id=source_target_id,
        capa_overdue_only=capa_overdue_only,
    )
    has_demo = any(r.is_demo for r in rows)
    buf = io.StringIO()
    if has_demo:
        # "Exports add `# DEMO` prefix when any row is demo." (launch-audit brief)
        buf.write(
            "# DEMO — at least one row in this export is demo data and is "
            "NOT regulator-submittable.\n"
        )
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        owner_display = _resolve_owner_display(db, r.owner_id) or ""
        writer.writerow(
            [
                r.id,
                _isofmt(r.created_at) or "",
                _isofmt(r.updated_at) or "",
                (r.title or "").replace("\n", " "),
                r.finding_type or "",
                r.severity or "",
                r.status or "",
                r.owner_id or "",
                owner_display,
                (r.capa_text or "").replace("\n", " ").replace("\r", " "),
                r.capa_due_date or "",
                int(_capa_overdue(r)),
                r.source_target_type or "",
                r.source_target_id or "",
                r.reporter_id or "",
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
            "Content-Disposition": "attachment; filename=quality_findings.csv",
            "Cache-Control": "no-store",
            "X-QA-Demo-Rows": str(sum(1 for r in rows if r.is_demo)),
        },
    )


@router.get("/export.ndjson")
def export_findings_ndjson(
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    finding_type: Optional[str] = Query(default=None),
    owner_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    source_target_type: Optional[str] = Query(default=None),
    source_target_id: Optional[str] = Query(default=None),
    capa_overdue_only: bool = Query(default=False),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_role(actor)
    rows = _filtered_rows_for_export(
        db,
        actor,
        status=status,
        severity=severity,
        finding_type=finding_type,
        owner_id=owner_id,
        since=since,
        until=until,
        q_text=q,
        source_target_type=source_target_type,
        source_target_id=source_target_id,
        capa_overdue_only=capa_overdue_only,
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
        out = _to_out(
            r,
            revision_count=_revision_count(db, r.id),
            owner_display=_resolve_owner_display(db, r.owner_id),
        )
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
            "Content-Disposition": "attachment; filename=quality_findings.ndjson",
            "Cache-Control": "no-store",
            "X-QA-Demo-Rows": str(demo_rows),
        },
    )


# ── POST / (create) ──────────────────────────────────────────────────────────


@router.post("", response_model=FindingOut, status_code=201)
def create_finding(
    payload: FindingCreateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FindingOut:
    _gate_role(actor)
    finding_type = _validate_finding_type(payload.finding_type)
    severity = _validate_severity(payload.severity)
    source_target_type = _validate_source_target_type(payload.source_target_type)
    owner_id = _validate_owner(db, payload.owner_id)
    record = QualityFinding(
        id=str(uuid.uuid4()),
        clinic_id=actor.clinic_id,
        title=payload.title.strip()[:255],
        description=(payload.description or "").strip(),
        finding_type=finding_type,
        severity=severity,
        status="open",
        owner_id=owner_id,
        capa_text=(payload.capa_text or None),
        capa_due_date=(payload.capa_due_date or None),
        source_target_type=source_target_type,
        source_target_id=(payload.source_target_id or None),
        evidence_links_json=_encode_evidence(payload.evidence_links),
        is_demo=bool(payload.is_demo),
        reporter_id=actor.actor_id,
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
            f"severity={record.severity} type={record.finding_type} "
            + (f"source={record.source_target_type}:{record.source_target_id} " if record.source_target_type else "")
            + ("DEMO" if record.is_demo else "")
        ),
    )
    return _to_out(
        record,
        revision_count=_revision_count(db, record.id),
        owner_display=_resolve_owner_display(db, record.owner_id),
    )


# ── GET /{finding_id} (detail) ───────────────────────────────────────────────


@router.get("/{finding_id}", response_model=FindingOut)
def get_finding(
    finding_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FindingOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(QualityFinding), actor)
        .filter(QualityFinding.id == finding_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="finding_not_found",
            message="QA finding not found or not visible at your role.",
            warnings=["Cross-clinic findings are hidden from non-admin roles."],
            status_code=404,
        )
    _self_audit(
        db,
        actor,
        event="finding_viewed",
        target_id=record.id,
        note=f"status={record.status} severity={record.severity}",
    )
    return _to_out(
        record,
        revision_count=_revision_count(db, record.id),
        owner_display=_resolve_owner_display(db, record.owner_id),
    )


# ── PATCH /{finding_id} ──────────────────────────────────────────────────────


@router.patch("/{finding_id}", response_model=FindingOut)
def patch_finding(
    finding_id: str,
    payload: FindingPatchIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FindingOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(QualityFinding), actor)
        .filter(QualityFinding.id == finding_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="finding_not_found",
            message="QA finding not found or not visible at your role.",
            status_code=404,
        )
    if record.status == "closed":
        raise ApiServiceError(
            code="finding_immutable",
            message=(
                "Closed findings are immutable. Reopen first to record a new "
                "revision with audit trail."
            ),
            status_code=409,
        )
    changed: list[str] = []
    if payload.title is not None:
        record.title = payload.title.strip()[:255]
        changed.append("title")
    if payload.description is not None:
        record.description = payload.description.strip()
        changed.append("description")
    if payload.finding_type is not None:
        record.finding_type = _validate_finding_type(payload.finding_type)
        changed.append("finding_type")
    if payload.severity is not None:
        record.severity = _validate_severity(payload.severity)
        changed.append("severity")
    if payload.status is not None:
        new_status = _validate_status(payload.status)
        if new_status == "closed":
            raise ApiServiceError(
                code="use_close_endpoint",
                message=(
                    "Use POST /api/v1/qa/findings/{id}/close to close a "
                    "finding (requires sign-off note)."
                ),
                status_code=422,
            )
        record.status = new_status
        changed.append("status")
    if payload.owner_id is not None:
        record.owner_id = _validate_owner(db, payload.owner_id) if payload.owner_id else None
        changed.append("owner_id")
    if payload.capa_text is not None:
        record.capa_text = payload.capa_text or None
        changed.append("capa_text")
    if payload.capa_due_date is not None:
        record.capa_due_date = payload.capa_due_date or None
        changed.append("capa_due_date")
    if payload.source_target_type is not None:
        record.source_target_type = _validate_source_target_type(payload.source_target_type)
        changed.append("source_target_type")
    if payload.source_target_id is not None:
        record.source_target_id = payload.source_target_id or None
        changed.append("source_target_id")
    if payload.evidence_links is not None:
        record.evidence_links_json = _encode_evidence(payload.evidence_links)
        changed.append("evidence_links")
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
    return _to_out(
        record,
        revision_count=_revision_count(db, record.id),
        owner_display=_resolve_owner_display(db, record.owner_id),
    )


# ── POST /{finding_id}/close ────────────────────────────────────────────────


@router.post("/{finding_id}/close", response_model=FindingOut)
def close_finding(
    finding_id: str,
    payload: FindingCloseIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FindingOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(QualityFinding), actor)
        .filter(QualityFinding.id == finding_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="finding_not_found",
            message="QA finding not found or not visible at your role.",
            status_code=404,
        )
    if record.status == "closed":
        raise ApiServiceError(
            code="finding_already_closed",
            message="Finding is already closed.",
            status_code=409,
        )
    if not (payload.note or "").strip():
        raise ApiServiceError(
            code="closure_note_required",
            message="A closure note is required when signing off a QA finding.",
            warnings=[
                "Closures without a note cannot be reviewed by a regulator. "
                "Record what corrective action satisfied the finding.",
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
    return _to_out(
        record,
        revision_count=_revision_count(db, record.id),
        owner_display=_resolve_owner_display(db, record.owner_id),
    )


# ── POST /{finding_id}/reopen ───────────────────────────────────────────────


@router.post("/{finding_id}/reopen", response_model=FindingOut)
def reopen_finding(
    finding_id: str,
    payload: FindingReopenIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FindingOut:
    _gate_role(actor)
    record = (
        _apply_clinic_scope(db.query(QualityFinding), actor)
        .filter(QualityFinding.id == finding_id)
        .first()
    )
    if record is None:
        raise ApiServiceError(
            code="finding_not_found",
            message="QA finding not found or not visible at your role.",
            status_code=404,
        )
    if record.status != "closed":
        raise ApiServiceError(
            code="finding_not_closed",
            message="Only closed findings can be reopened.",
            status_code=409,
        )
    if not (payload.reason or "").strip():
        raise ApiServiceError(
            code="reopen_reason_required",
            message="A reason is required to reopen a closed QA finding.",
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
    return _to_out(
        record,
        revision_count=_revision_count(db, record.id),
        owner_display=_resolve_owner_display(db, record.owner_id),
    )


# ── POST /audit-events (page-level audit ingestion) ──────────────────────────


@router.post("/audit-events", response_model=QAAuditEventOut)
def record_qa_audit_event(
    payload: QAAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QAAuditEventOut:
    _gate_role(actor)
    from app.repositories.audit import create_audit_event

    now = datetime.now(timezone.utc)
    event_id = (
        f"quality_assurance-{payload.event}-{actor.actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    target_id = payload.finding_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.finding_id:
        note_parts.append(f"finding={payload.finding_id}")
    if payload.note:
        note_parts.append(payload.note[:500])
    note = "; ".join(note_parts) or payload.event

    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="quality_assurance",
            action=f"quality_assurance.{payload.event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception("QA audit-event persistence failed")
        return QAAuditEventOut(accepted=False, event_id=event_id)
    return QAAuditEventOut(accepted=True, event_id=event_id)
