"""IRB Amendment Workflow router (IRB-AMD1, 2026-05-02).

Real-world clinical trials hit amendment cycles every 4-6 weeks; the
existing IRB Manager amendment endpoint logs a single 3-state row
(submitted | approved | rejected). This router introduces the full
regulator-credible lifecycle:

draft → submitted → reviewer_assigned → under_review →
    approved | rejected | revisions_requested → effective

Plus a reg-binder ZIP export bundling protocol + amendments + audit
trail for offline regulator review.

Endpoints
---------

* ``POST   /api/v1/irb-amendment-workflow/amendments``                   — create draft (clinician+)
* ``POST   /api/v1/irb-amendment-workflow/amendments/{id}/submit``       — clinician+ (creator/admin)
* ``POST   /api/v1/irb-amendment-workflow/amendments/{id}/assign-reviewer`` — admin
* ``POST   /api/v1/irb-amendment-workflow/amendments/{id}/start-review`` — assigned reviewer
* ``POST   /api/v1/irb-amendment-workflow/amendments/{id}/decide``       — assigned reviewer
* ``POST   /api/v1/irb-amendment-workflow/amendments/{id}/mark-effective`` — admin
* ``POST   /api/v1/irb-amendment-workflow/amendments/{id}/revert-to-draft`` — creator/admin
* ``GET    /api/v1/irb-amendment-workflow/amendments``                   — list w/ filter
* ``GET    /api/v1/irb-amendment-workflow/amendments/{id}``              — detail + diff
* ``GET    /api/v1/irb-amendment-workflow/amendments/{id}/audit-trail``  — full lifecycle audit
* ``GET    /api/v1/irb-amendment-workflow/protocols/{id}/reg-binder.zip``  — admin/PI; ZIP
* ``GET    /api/v1/irb-amendment-workflow/audit-events``                 — paginated surface feed
* ``POST   /api/v1/irb-amendment-workflow/audit-events``                 — page-level audit ingest

Cross-clinic safety: every endpoint scopes by ``actor.clinic_id`` and
returns 404 on cross-clinic access (matching the QEEG IDOR pattern in
the ``deepsynaps-qeeg-pdf-export-tenant-gate`` memory).
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AuditEventRecord,
    IRBProtocol,
    IRBProtocolAmendment,
    User,
)
from app.services.irb_amendment_diff import (
    TRACKED_FIELDS,
    compute_amendment_diff,
)
from app.services.irb_amendment_workflow import (
    ALL_STATUSES,
    DECISIONS,
    STATUS_DRAFT,
    SURFACE,
    assign_reviewer as _svc_assign,
    decide_amendment as _svc_decide,
    mark_effective as _svc_mark_effective,
    revert_to_draft as _svc_revert,
    start_review as _svc_start_review,
    submit_amendment as _svc_submit,
    _emit_audit,
    _load_amendment,
    _now,
)
from app.services.irb_reg_binder_export import (
    build_reg_binder,
    reg_binder_filename,
)


_log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/irb-amendment-workflow",
    tags=["IRB Amendment Workflow"],
)


# ── Schemas ────────────────────────────────────────────────────────────────


class AmendmentCreateIn(BaseModel):
    parent_protocol_id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=512)
    summary: Optional[str] = Field(default=None, max_length=8000)
    intervention_description: Optional[str] = Field(default=None, max_length=8000)
    eligibility_criteria: Optional[str] = Field(default=None, max_length=8000)
    primary_outcome: Optional[str] = Field(default=None, max_length=4000)
    safety_monitoring: Optional[str] = Field(default=None, max_length=4000)
    study_arms: Optional[list[dict]] = Field(default=None)
    inclusion_criteria: Optional[list[str]] = Field(default=None)
    exclusion_criteria: Optional[list[str]] = Field(default=None)
    amendment_type: str = Field(default="protocol_change", min_length=1, max_length=60)
    reason: str = Field(..., min_length=1, max_length=4000)
    description: Optional[str] = Field(default=None, max_length=4000)


class AssignReviewerIn(BaseModel):
    reviewer_user_id: str = Field(..., min_length=1, max_length=64)


class DecideIn(BaseModel):
    decision: str = Field(..., min_length=1, max_length=32)
    review_note: str = Field(..., min_length=10, max_length=2000)


class FieldDiffOut(BaseModel):
    field: str
    old_value: object | None = None
    new_value: object | None = None
    change_type: str


class AmendmentOut(BaseModel):
    id: str
    protocol_id: str
    version: int
    status: str
    amendment_type: str
    description: Optional[str] = None
    reason: Optional[str] = None
    created_by_user_id: Optional[str] = None
    submitted_by: Optional[str] = None
    assigned_reviewer_user_id: Optional[str] = None
    submitted_at: Optional[str] = None
    reviewed_at: Optional[str] = None
    effective_at: Optional[str] = None
    review_decision_note: Optional[str] = None
    consent_version_after: Optional[str] = None


class AmendmentDetailOut(AmendmentOut):
    payload: dict = Field(default_factory=dict)
    diff: list[FieldDiffOut] = Field(default_factory=list)


class AmendmentListOut(BaseModel):
    items: list[AmendmentOut] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50


class AuditTrailRowOut(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: str
    actor_id: str
    note: str
    created_at: str


class AuditTrailOut(BaseModel):
    items: list[AuditTrailRowOut] = Field(default_factory=list)
    total: int = 0


class AuditEventsListOut(BaseModel):
    items: list[AuditTrailRowOut] = Field(default_factory=list)
    total: int = 0
    limit: int = 50
    offset: int = 0
    surface: str = SURFACE


class PageAuditIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    target_id: Optional[str] = Field(default=None, max_length=128)
    note: Optional[str] = Field(default=None, max_length=512)


class PageAuditOut(BaseModel):
    accepted: bool
    event_id: str


# ── Helpers ────────────────────────────────────────────────────────────────


def _isofmt(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _amendment_to_out(amd: IRBProtocolAmendment) -> AmendmentOut:
    return AmendmentOut(
        id=amd.id,
        protocol_id=amd.protocol_id,
        version=int(amd.version or 1),
        status=amd.status or STATUS_DRAFT,
        amendment_type=amd.amendment_type or "",
        description=amd.description,
        reason=amd.reason,
        created_by_user_id=amd.created_by_user_id or amd.submitted_by,
        submitted_by=amd.submitted_by,
        assigned_reviewer_user_id=amd.assigned_reviewer_user_id,
        submitted_at=_isofmt(amd.submitted_at),
        reviewed_at=_isofmt(amd.reviewed_at),
        effective_at=_isofmt(amd.effective_at),
        review_decision_note=amd.review_decision_note,
        consent_version_after=amd.consent_version_after,
    )


def _amendment_to_detail(amd: IRBProtocolAmendment, parent: IRBProtocol) -> AmendmentDetailOut:
    base = _amendment_to_out(amd)
    try:
        payload = json.loads(amd.payload_json or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}
    diffs = compute_amendment_diff(parent, payload)
    return AmendmentDetailOut(
        **base.model_dump(),
        payload=payload,
        diff=[
            FieldDiffOut(
                field=d.field,
                old_value=d.old_value,
                new_value=d.new_value,
                change_type=d.change_type,
            )
            for d in diffs
        ],
    )


def _audit_to_out(row: AuditEventRecord) -> AuditTrailRowOut:
    return AuditTrailRowOut(
        event_id=row.event_id,
        target_id=row.target_id,
        target_type=row.target_type,
        action=row.action,
        role=row.role,
        actor_id=row.actor_id,
        note=row.note or "",
        created_at=row.created_at or "",
    )


def _scope_protocol(
    db: Session, protocol_id: str, actor: AuthenticatedActor
) -> IRBProtocol:
    proto = (
        db.query(IRBProtocol).filter(IRBProtocol.id == protocol_id).first()
    )
    if proto is None:
        raise ApiServiceError(
            code="protocol_not_found",
            message="Parent protocol not found or not visible at your role.",
            status_code=404,
        )
    if actor.role != "admin":
        if proto.clinic_id and actor.clinic_id and proto.clinic_id != actor.clinic_id:
            raise ApiServiceError(
                code="protocol_not_found",
                message="Parent protocol not found or not visible at your role.",
                status_code=404,
            )
        if proto.clinic_id and not actor.clinic_id:
            raise ApiServiceError(
                code="protocol_not_found",
                message="Parent protocol not found or not visible at your role.",
                status_code=404,
            )
    return proto


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/amendments", response_model=AmendmentDetailOut, status_code=201)
def create_draft_amendment(
    payload: AmendmentCreateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentDetailOut:
    """Create a draft amendment. Clinician+. Computes diff vs parent."""
    require_minimum_role(actor, "clinician")
    parent = _scope_protocol(db, payload.parent_protocol_id, actor)

    # Build the JSON payload — only the tracked fields surface in the
    # diff. The rest (amendment_type/reason/description) remain on
    # their dedicated columns.
    payload_dict: dict = {}
    for f in TRACKED_FIELDS:
        v = getattr(payload, f, None)
        if v is not None:
            payload_dict[f] = v

    # Highest existing version for this protocol — start at 1.
    last_version = (
        db.query(IRBProtocolAmendment.version)
        .filter(IRBProtocolAmendment.protocol_id == parent.id)
        .order_by(IRBProtocolAmendment.version.desc())
        .first()
    )
    next_version = ((last_version[0] if last_version and last_version[0] else 0) or 0) + 1

    diff = compute_amendment_diff(parent, payload_dict)

    amd = IRBProtocolAmendment(
        id=str(uuid.uuid4()),
        protocol_id=parent.id,
        amendment_type=(payload.amendment_type or "protocol_change").lower()[:60],
        description=(payload.description or payload.title)[:4000],
        reason=payload.reason.strip()[:4000],
        submitted_by=actor.actor_id,
        status=STATUS_DRAFT,
        consent_version_after=None,
        assigned_reviewer_user_id=None,
        reviewed_at=None,
        effective_at=None,
        review_decision_note=None,
        amendment_diff_json=json.dumps([d.to_dict() for d in diff]),
        version=next_version,
        created_by_user_id=actor.actor_id,
        payload_json=json.dumps(payload_dict),
    )
    db.add(amd)
    db.commit()
    db.refresh(amd)
    _emit_audit(
        db,
        actor,
        amendment=amd,
        action_verb="created",
        from_status=None,
        to_status=STATUS_DRAFT,
    )
    return _amendment_to_detail(amd, parent)


@router.post("/amendments/{amendment_id}/submit", response_model=AmendmentOut)
def submit_amendment_endpoint(
    amendment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentOut:
    amd = _svc_submit(db, amendment_id, actor)
    return _amendment_to_out(amd)


@router.post(
    "/amendments/{amendment_id}/assign-reviewer", response_model=AmendmentOut
)
def assign_reviewer_endpoint(
    amendment_id: str,
    payload: AssignReviewerIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentOut:
    amd = _svc_assign(db, amendment_id, payload.reviewer_user_id, actor)
    return _amendment_to_out(amd)


@router.post("/amendments/{amendment_id}/start-review", response_model=AmendmentOut)
def start_review_endpoint(
    amendment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentOut:
    amd = _svc_start_review(db, amendment_id, actor)
    return _amendment_to_out(amd)


@router.post("/amendments/{amendment_id}/decide", response_model=AmendmentOut)
def decide_endpoint(
    amendment_id: str,
    payload: DecideIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentOut:
    amd = _svc_decide(db, amendment_id, payload.decision, payload.review_note, actor)
    return _amendment_to_out(amd)


@router.post(
    "/amendments/{amendment_id}/mark-effective", response_model=AmendmentOut
)
def mark_effective_endpoint(
    amendment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentOut:
    amd, _proto = _svc_mark_effective(db, amendment_id, actor)
    return _amendment_to_out(amd)


@router.post(
    "/amendments/{amendment_id}/revert-to-draft", response_model=AmendmentOut
)
def revert_endpoint(
    amendment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentOut:
    amd = _svc_revert(db, amendment_id, actor)
    return _amendment_to_out(amd)


@router.get("/amendments", response_model=AmendmentListOut)
def list_amendments(
    protocol_id: Optional[str] = Query(default=None, max_length=64),
    status: Optional[str] = Query(default=None, max_length=32),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentListOut:
    require_minimum_role(actor, "clinician")
    q = db.query(IRBProtocolAmendment)
    if protocol_id:
        q = q.filter(IRBProtocolAmendment.protocol_id == protocol_id)
    if status:
        if status not in ALL_STATUSES:
            raise ApiServiceError(
                code="invalid_status_filter",
                message=f"status must be one of {sorted(ALL_STATUSES)}",
                status_code=422,
            )
        q = q.filter(IRBProtocolAmendment.status == status)
    # Cross-clinic isolation: join visibility through parent clinic_id.
    if actor.role != "admin":
        # Build a sub-query of visible protocol ids.
        proto_q = db.query(IRBProtocol.id)
        if actor.clinic_id:
            proto_q = proto_q.filter(IRBProtocol.clinic_id == actor.clinic_id)
        else:
            proto_q = proto_q.filter(IRBProtocol.clinic_id.is_(None))
        visible_ids = [r[0] for r in proto_q.all()]
        if not visible_ids:
            return AmendmentListOut(items=[], total=0, page=page, page_size=page_size)
        q = q.filter(IRBProtocolAmendment.protocol_id.in_(visible_ids))

    total = q.count()
    rows = (
        q.order_by(IRBProtocolAmendment.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return AmendmentListOut(
        items=[_amendment_to_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/amendments/{amendment_id}", response_model=AmendmentDetailOut
)
def get_amendment_detail(
    amendment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AmendmentDetailOut:
    require_minimum_role(actor, "clinician")
    amd, parent = _load_amendment(db, amendment_id, actor)
    return _amendment_to_detail(amd, parent)


@router.get(
    "/amendments/{amendment_id}/audit-trail", response_model=AuditTrailOut
)
def amendment_audit_trail(
    amendment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditTrailOut:
    require_minimum_role(actor, "clinician")
    amd, _parent = _load_amendment(db, amendment_id, actor)
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == "irb_amendment",
            AuditEventRecord.target_id == amd.id,
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    return AuditTrailOut(
        items=[_audit_to_out(r) for r in rows],
        total=len(rows),
    )


@router.get("/protocols/{protocol_id}/reg-binder.zip")
def download_reg_binder(
    protocol_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """Bundle protocol + amendments + audit trail as a ZIP. Admin/PI only."""
    # Admin or PI on the protocol can download.
    require_minimum_role(actor, "clinician")
    proto = _scope_protocol(db, protocol_id, actor)
    if actor.role != "admin":
        # PI gate: actor must be the protocol's PI.
        if proto.pi_user_id != actor.actor_id:
            raise ApiServiceError(
                code="forbidden_reg_binder",
                message="Only an admin or the protocol PI can download the reg-binder.",
                status_code=403,
            )

    # Pass clinic_id=None when admin to bypass clinic gate inside the
    # service; otherwise pass actor's clinic_id (already validated by
    # _scope_protocol).
    cid = None if actor.role == "admin" else actor.clinic_id
    blob = build_reg_binder(db, protocol_id, cid)

    # Best-effort audit ping.
    try:
        from app.repositories.audit import create_audit_event  # noqa: PLC0415

        now = datetime.now(timezone.utc)
        eid = (
            f"{SURFACE}-reg_binder_downloaded-{proto.id}"
            f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=eid,
            target_id=proto.id,
            target_type=SURFACE,
            action=f"{SURFACE}.reg_binder_downloaded",
            role=actor.role if actor.role in {"admin", "clinician"} else "clinician",
            actor_id=actor.actor_id,
            note=(
                f"clinic_id={actor.clinic_id or '-'} protocol_id={proto.id} "
                f"version={proto.version or 1} bytes={len(blob)}"
            )[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _log.exception("reg-binder audit emit failed")

    return Response(
        content=blob,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{reg_binder_filename(proto)}"'
            ),
            "Cache-Control": "no-store",
        },
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def audit_events(
    surface: str = Query(default=SURFACE),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    require_minimum_role(actor, "clinician")
    target_types = {SURFACE, "irb_amendment"}
    if surface in target_types:
        q = db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type == surface
        )
    else:
        q = db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(target_types)
        )
    total = q.count()
    rows = (
        q.order_by(AuditEventRecord.id.desc()).offset(offset).limit(limit).all()
    )
    return AuditEventsListOut(
        items=[_audit_to_out(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
        surface=surface,
    )


@router.post("/audit-events", response_model=PageAuditOut)
def post_audit_event(
    payload: PageAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PageAuditOut:
    require_minimum_role(actor, "clinician")
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{SURFACE}-{payload.event}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    target_id = payload.target_id or actor.clinic_id or actor.actor_id
    note = (
        f"clinic_id={actor.clinic_id or '-'} event={payload.event} "
        f"note={(payload.note or '')[:300]}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(target_id),
            target_type=SURFACE,
            action=f"{SURFACE}.{payload.event}",
            role=actor.role if actor.role in {"admin", "clinician"} else "clinician",
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _log.exception("IRB-AMD1 page-level audit failed")
        return PageAuditOut(accepted=False, event_id=eid)
    return PageAuditOut(accepted=True, event_id=eid)
