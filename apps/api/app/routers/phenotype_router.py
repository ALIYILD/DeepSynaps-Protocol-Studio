"""Phenotype assignments router.

Endpoints
---------
POST   /api/v1/phenotype-assignments           Create a new phenotype assignment
GET    /api/v1/phenotype-assignments           List assignments (filter by patient_id)
DELETE /api/v1/phenotype-assignments/{id}      Delete an assignment (ownership check)
GET    /api/v1/phenotype-assignments/audit-events   List UI / workflow audit rows (append-only log)
POST   /api/v1/phenotype-assignments/audit-events   Record page-level events (view, export, navigation)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AuditEventRecord, PhenotypeAssignment
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id

router = APIRouter(prefix="/api/v1/phenotype-assignments", tags=["Phenotype Assignments"])

SURFACE = "phenotype_analyzer"


# ── Schemas ────────────────────────────────────────────────────────────────────

class PhenotypeAssignmentCreate(BaseModel):
    patient_id: str
    phenotype_id: str
    phenotype_name: str
    domain: Optional[str] = None
    rationale: Optional[str] = None
    qeeg_supported: bool = False
    confidence: Optional[str] = None   # "high" | "moderate" | "low"
    assigned_at: Optional[str] = None  # ISO datetime; defaults to now


class PhenotypeAssignmentOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    phenotype_id: str
    phenotype_name: str
    domain: Optional[str]
    rationale: Optional[str]
    qeeg_supported: bool
    confidence: Optional[str]
    assigned_at: str
    created_at: str

    @classmethod
    def from_record(cls, r: PhenotypeAssignment) -> "PhenotypeAssignmentOut":
        def _dt(v) -> str:
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            phenotype_id=r.phenotype_id,
            phenotype_name=r.phenotype_name,
            domain=r.domain,
            rationale=r.rationale,
            qeeg_supported=r.qeeg_supported,
            confidence=r.confidence,
            assigned_at=_dt(r.assigned_at),
            created_at=_dt(r.created_at),
        )


class PhenotypeAssignmentListResponse(BaseModel):
    items: list[PhenotypeAssignmentOut]
    total: int


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class PhenotypeAuditEventOut(BaseModel):
    event_id: str
    action: str
    actor_id: str
    role: str
    patient_id: str
    note: str
    created_at: str


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class PhenotypeAuditListResponse(BaseModel):
    items: list[PhenotypeAuditEventOut]
    total: int
    limit: int
    offset: int


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class PhenotypeAuditEventIn(BaseModel):
    """Page-level audit ingestion — decision-support navigation / export only."""

    event: str = Field(..., max_length=64, description="e.g. workspace_view, export_summary, open_linked_module")
    patient_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=480)
    using_demo_data: bool = False


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class PhenotypeAuditEventAck(BaseModel):
    accepted: bool = True
    event_id: str


# ── Validation helpers ─────────────────────────────────────────────────────────

_VALID_CONFIDENCES = {"high", "moderate", "low"}


def _gate_patient_scoped(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _emit_phenotype_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    action: str,
    patient_id: str,
    assignment_id: Optional[str] = None,
    phenotype_id: Optional[str] = None,
    extra_note: Optional[str] = None,
) -> str:
    event_id = str(uuid.uuid4())
    ts = datetime.now(timezone.utc).isoformat()
    parts: list[str] = [f"patient_id={patient_id}", f"surface={SURFACE}"]
    if assignment_id:
        parts.append(f"assignment_id={assignment_id}")
    if phenotype_id:
        parts.append(f"phenotype_id={phenotype_id}")
    if actor.clinic_id:
        parts.append(f"clinic_id={actor.clinic_id}")
    if extra_note:
        parts.append(extra_note[:400])
    note = "; ".join(parts)
    create_audit_event(
        session=db,
        event_id=event_id,
        target_id=patient_id,
        target_type=SURFACE,
        action=action[:32],
        role=actor.role,
        actor_id=actor.actor_id,
        note=note,
        created_at=ts,
    )
    return event_id


# ── Endpoints ──────────────────────────────────────────────────────────────────
# Static paths (`/audit-events`) must be registered before `/{assignment_id}`.

@router.get("/audit-events", response_model=PhenotypeAuditListResponse)
def list_phenotype_audit_events(
    patient_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PhenotypeAuditListResponse:
    require_minimum_role(actor, "clinician")

    if patient_id:
        _gate_patient_scoped(actor, patient_id, db)

    base = db.query(AuditEventRecord).filter(AuditEventRecord.target_type == SURFACE)
    if patient_id:
        base = base.filter(AuditEventRecord.target_id == patient_id)
    elif actor.role != "admin" and actor.clinic_id:
        cid = actor.clinic_id
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
        base.order_by(AuditEventRecord.id.desc()).offset(offset).limit(limit).all()
    )
    items = [
        PhenotypeAuditEventOut(
            event_id=r.event_id,
            action=r.action or "",
            actor_id=r.actor_id or "",
            role=r.role or "",
            patient_id=r.target_id or "",
            note=r.note or "",
            created_at=r.created_at or "",
        )
        for r in rows
    ]
    return PhenotypeAuditListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/audit-events", response_model=PhenotypeAuditEventAck)
def post_phenotype_audit_event(
    body: PhenotypeAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PhenotypeAuditEventAck:
    require_minimum_role(actor, "clinician")

    if body.patient_id:
        _gate_patient_scoped(actor, body.patient_id, db)

    target_pid = body.patient_id or actor.actor_id
    extra = body.note or ""
    if body.using_demo_data:
        extra = (extra + "; demo_mode=1").strip("; ")
    eid = _emit_phenotype_audit(
        db,
        actor,
        action=body.event[:32],
        patient_id=target_pid,
        extra_note=extra or None,
    )
    return PhenotypeAuditEventAck(accepted=True, event_id=eid)


@router.post("", response_model=PhenotypeAssignmentOut, status_code=201)
def create_phenotype_assignment(
    body: PhenotypeAssignmentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PhenotypeAssignmentOut:
    require_minimum_role(actor, "clinician")

    _gate_patient_scoped(actor, body.patient_id, db)

    if body.confidence is not None and body.confidence.lower() not in _VALID_CONFIDENCES:
        raise ApiServiceError(
            code="invalid_confidence",
            message=f"Confidence must be one of: {', '.join(sorted(_VALID_CONFIDENCES))}.",
            status_code=422,
        )

    assigned_at = datetime.now(timezone.utc)
    if body.assigned_at:
        try:
            assigned_at = datetime.fromisoformat(body.assigned_at.rstrip("Z"))
        except ValueError:
            pass

    record = PhenotypeAssignment(
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        phenotype_id=body.phenotype_id,
        phenotype_name=body.phenotype_name.strip(),
        domain=body.domain,
        rationale=body.rationale,
        qeeg_supported=body.qeeg_supported,
        confidence=body.confidence.lower() if body.confidence else None,
        assigned_at=assigned_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    try:
        _emit_phenotype_audit(
            db,
            actor,
            action="assignment_created",
            patient_id=body.patient_id,
            assignment_id=record.id,
            phenotype_id=body.phenotype_id,
        )
    except Exception:
        pass  # audit must not roll back a committed assignment
    return PhenotypeAssignmentOut.from_record(record)


@router.get("", response_model=PhenotypeAssignmentListResponse)
def list_phenotype_assignments(
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PhenotypeAssignmentListResponse:
    require_minimum_role(actor, "clinician")

    if patient_id:
        _gate_patient_scoped(actor, patient_id, db)

    q = db.query(PhenotypeAssignment)
    if actor.role != "admin":
        q = q.filter(PhenotypeAssignment.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(PhenotypeAssignment.patient_id == patient_id)

    records = q.order_by(PhenotypeAssignment.assigned_at.desc()).all()
    items = [PhenotypeAssignmentOut.from_record(r) for r in records]
    return PhenotypeAssignmentListResponse(items=items, total=len(items))


@router.delete("/{assignment_id}", status_code=204)
def delete_phenotype_assignment(
    assignment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")

    record = db.query(PhenotypeAssignment).filter_by(id=assignment_id).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Phenotype assignment not found.", status_code=404)
    if actor.role != "admin" and record.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Phenotype assignment not found.", status_code=404)

    _gate_patient_scoped(actor, record.patient_id, db)

    pid = record.patient_id
    aid = record.id
    pheno_id = record.phenotype_id
    db.delete(record)
    db.commit()
    try:
        _emit_phenotype_audit(
            db,
            actor,
            action="assignment_removed",
            patient_id=pid,
            assignment_id=aid,
            phenotype_id=pheno_id,
        )
    except Exception:
        pass  # deletion stands even if audit insert fails
