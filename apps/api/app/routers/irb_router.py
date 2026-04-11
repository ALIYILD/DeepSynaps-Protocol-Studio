"""IRB Studies router.

Endpoints
---------
GET  /api/v1/irb/studies                      — list IRB studies
POST /api/v1/irb/studies                      — create study
GET  /api/v1/irb/studies/{id}                 — get study detail
PUT  /api/v1/irb/studies/{id}                 — update study
POST /api/v1/irb/studies/{id}/amend           — request amendment
GET  /api/v1/irb/adverse-events               — list AEs
POST /api/v1/irb/adverse-events               — report new AE
PUT  /api/v1/irb/adverse-events/{id}          — update AE status
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import IRBAdverseEvent, IRBAmendment, IRBStudy

router = APIRouter(prefix="/api/v1/irb", tags=["IRB Studies"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class IRBStudyCreate(BaseModel):
    title: str
    irb_number: Optional[str] = None
    sponsor: Optional[str] = None
    principal_investigator: Optional[str] = None
    phase: Optional[str] = None    # I, II, III, IV, observational
    status: str = "pending"        # pending, approved, active, closed, suspended, withdrawn
    approval_date: Optional[str] = None
    expiry_date: Optional[str] = None
    enrollment_target: Optional[int] = None
    description: Optional[str] = None
    protocol: Optional[dict] = None


class IRBStudyUpdate(BaseModel):
    title: Optional[str] = None
    irb_number: Optional[str] = None
    sponsor: Optional[str] = None
    principal_investigator: Optional[str] = None
    phase: Optional[str] = None
    status: Optional[str] = None
    approval_date: Optional[str] = None
    expiry_date: Optional[str] = None
    enrollment_target: Optional[int] = None
    enrolled_count: Optional[int] = None
    description: Optional[str] = None
    protocol: Optional[dict] = None


class IRBStudyOut(BaseModel):
    id: str
    clinician_id: str
    title: str
    irb_number: Optional[str]
    sponsor: Optional[str]
    principal_investigator: Optional[str]
    phase: Optional[str]
    status: str
    approval_date: Optional[str]
    expiry_date: Optional[str]
    enrollment_target: Optional[int]
    enrolled_count: int
    description: Optional[str]
    protocol: Optional[dict]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: IRBStudy) -> "IRBStudyOut":
        protocol: Optional[dict] = None
        if r.protocol_json:
            try:
                protocol = json.loads(r.protocol_json)
            except Exception:
                pass
        def _dt(v) -> str:
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            title=r.title,
            irb_number=r.irb_number,
            sponsor=r.sponsor,
            principal_investigator=r.principal_investigator,
            phase=r.phase,
            status=r.status,
            approval_date=r.approval_date,
            expiry_date=r.expiry_date,
            enrollment_target=r.enrollment_target,
            enrolled_count=r.enrolled_count,
            description=r.description,
            protocol=protocol,
            created_at=_dt(r.created_at),
            updated_at=_dt(r.updated_at),
        )


class IRBStudyListResponse(BaseModel):
    items: list[IRBStudyOut]
    total: int


class IRBAmendmentCreate(BaseModel):
    amendment_type: str
    description: str


class IRBAmendmentOut(BaseModel):
    id: str
    study_id: str
    clinician_id: str
    amendment_type: str
    description: str
    status: str
    submitted_at: str
    resolved_at: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: IRBAmendment) -> "IRBAmendmentOut":
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            study_id=r.study_id,
            clinician_id=r.clinician_id,
            amendment_type=r.amendment_type,
            description=r.description,
            status=r.status,
            submitted_at=_dt(r.submitted_at),
            resolved_at=_dt(r.resolved_at),
            created_at=_dt(r.created_at),
        )


class IRBAECreate(BaseModel):
    study_id: str
    patient_id: Optional[str] = None
    event_type: str
    severity: str              # mild, moderate, severe, serious, unexpected
    description: str
    relatedness: Optional[str] = None   # unrelated, possibly, probably, definitely
    notes: Optional[str] = None


class IRBAEUpdate(BaseModel):
    status: Optional[str] = None        # open, under_review, closed, reported_to_irb
    relatedness: Optional[str] = None
    notes: Optional[str] = None
    resolved_at: Optional[str] = None


class IRBAEOut(BaseModel):
    id: str
    study_id: str
    patient_id: Optional[str]
    clinician_id: str
    event_type: str
    severity: str
    description: str
    relatedness: Optional[str]
    status: str
    reported_at: str
    resolved_at: Optional[str]
    notes: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: IRBAdverseEvent) -> "IRBAEOut":
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            study_id=r.study_id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            event_type=r.event_type,
            severity=r.severity,
            description=r.description,
            relatedness=r.relatedness,
            status=r.status,
            reported_at=_dt(r.reported_at),
            resolved_at=_dt(r.resolved_at),
            notes=r.notes,
            created_at=_dt(r.created_at),
        )


class IRBAEListResponse(BaseModel):
    items: list[IRBAEOut]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────

_VALID_AE_SEVERITIES = {"mild", "moderate", "severe", "serious", "unexpected"}


def _get_study_or_404(db: Session, study_id: str, actor: AuthenticatedActor) -> IRBStudy:
    study = db.query(IRBStudy).filter_by(id=study_id).first()
    if study is None:
        raise ApiServiceError(code="not_found", message="IRB study not found.", status_code=404)
    if actor.role != "admin" and study.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="IRB study not found.", status_code=404)
    return study


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/studies", response_model=IRBStudyListResponse)
def list_irb_studies(
    status: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBStudyListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(IRBStudy)
    if actor.role != "admin":
        q = q.filter(IRBStudy.clinician_id == actor.actor_id)
    if status:
        q = q.filter(IRBStudy.status == status)
    records = q.order_by(IRBStudy.created_at.desc()).all()
    items = [IRBStudyOut.from_record(r) for r in records]
    return IRBStudyListResponse(items=items, total=len(items))


@router.post("/studies", response_model=IRBStudyOut, status_code=201)
def create_irb_study(
    body: IRBStudyCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBStudyOut:
    require_minimum_role(actor, "clinician")
    study = IRBStudy(
        clinician_id=actor.actor_id,
        title=body.title.strip(),
        irb_number=body.irb_number,
        sponsor=body.sponsor,
        principal_investigator=body.principal_investigator,
        phase=body.phase,
        status=body.status,
        approval_date=body.approval_date,
        expiry_date=body.expiry_date,
        enrollment_target=body.enrollment_target,
        description=body.description,
        protocol_json=json.dumps(body.protocol) if body.protocol else None,
    )
    db.add(study)
    db.commit()
    db.refresh(study)
    return IRBStudyOut.from_record(study)


@router.get("/studies/{study_id}", response_model=IRBStudyOut)
def get_irb_study(
    study_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBStudyOut:
    require_minimum_role(actor, "clinician")
    study = _get_study_or_404(db, study_id, actor)
    return IRBStudyOut.from_record(study)


@router.put("/studies/{study_id}", response_model=IRBStudyOut)
def update_irb_study(
    study_id: str,
    body: IRBStudyUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBStudyOut:
    require_minimum_role(actor, "clinician")
    study = _get_study_or_404(db, study_id, actor)

    if body.title is not None:
        study.title = body.title.strip()
    if body.irb_number is not None:
        study.irb_number = body.irb_number
    if body.sponsor is not None:
        study.sponsor = body.sponsor
    if body.principal_investigator is not None:
        study.principal_investigator = body.principal_investigator
    if body.phase is not None:
        study.phase = body.phase
    if body.status is not None:
        study.status = body.status
    if body.approval_date is not None:
        study.approval_date = body.approval_date
    if body.expiry_date is not None:
        study.expiry_date = body.expiry_date
    if body.enrollment_target is not None:
        study.enrollment_target = body.enrollment_target
    if body.enrolled_count is not None:
        study.enrolled_count = body.enrolled_count
    if body.description is not None:
        study.description = body.description
    if body.protocol is not None:
        study.protocol_json = json.dumps(body.protocol)

    db.commit()
    db.refresh(study)
    return IRBStudyOut.from_record(study)


@router.post("/studies/{study_id}/amend", response_model=IRBAmendmentOut, status_code=201)
def request_amendment(
    study_id: str,
    body: IRBAmendmentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBAmendmentOut:
    require_minimum_role(actor, "clinician")
    _get_study_or_404(db, study_id, actor)  # verify access
    amendment = IRBAmendment(
        study_id=study_id,
        clinician_id=actor.actor_id,
        amendment_type=body.amendment_type.strip(),
        description=body.description.strip(),
        status="submitted",
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(amendment)
    db.commit()
    db.refresh(amendment)
    return IRBAmendmentOut.from_record(amendment)


@router.get("/adverse-events", response_model=IRBAEListResponse)
def list_irb_adverse_events(
    study_id: Optional[str] = Query(default=None),
    patient_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBAEListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(IRBAdverseEvent)
    if actor.role != "admin":
        q = q.filter(IRBAdverseEvent.clinician_id == actor.actor_id)
    if study_id:
        q = q.filter(IRBAdverseEvent.study_id == study_id)
    if patient_id:
        q = q.filter(IRBAdverseEvent.patient_id == patient_id)
    if severity:
        q = q.filter(IRBAdverseEvent.severity == severity.lower())
    if status:
        q = q.filter(IRBAdverseEvent.status == status)
    records = q.order_by(IRBAdverseEvent.reported_at.desc()).all()
    items = [IRBAEOut.from_record(r) for r in records]
    return IRBAEListResponse(items=items, total=len(items))


@router.post("/adverse-events", response_model=IRBAEOut, status_code=201)
def report_irb_adverse_event(
    body: IRBAECreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBAEOut:
    require_minimum_role(actor, "clinician")
    severity = body.severity.strip().lower()
    if severity not in _VALID_AE_SEVERITIES:
        raise ApiServiceError(
            code="invalid_severity",
            message=f"Severity must be one of: {', '.join(sorted(_VALID_AE_SEVERITIES))}.",
            status_code=422,
        )
    ae = IRBAdverseEvent(
        study_id=body.study_id,
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        event_type=body.event_type.strip(),
        severity=severity,
        description=body.description.strip(),
        relatedness=body.relatedness,
        status="open",
        reported_at=datetime.now(timezone.utc),
        notes=body.notes,
    )
    db.add(ae)
    db.commit()
    db.refresh(ae)
    return IRBAEOut.from_record(ae)


@router.put("/adverse-events/{ae_id}", response_model=IRBAEOut)
def update_irb_adverse_event(
    ae_id: str,
    body: IRBAEUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> IRBAEOut:
    require_minimum_role(actor, "clinician")
    ae = db.query(IRBAdverseEvent).filter_by(id=ae_id).first()
    if ae is None:
        raise ApiServiceError(code="not_found", message="Adverse event not found.", status_code=404)
    if actor.role != "admin" and ae.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Adverse event not found.", status_code=404)

    if body.status is not None:
        ae.status = body.status
    if body.relatedness is not None:
        ae.relatedness = body.relatedness
    if body.notes is not None:
        ae.notes = body.notes
    if body.resolved_at is not None:
        try:
            ae.resolved_at = datetime.fromisoformat(body.resolved_at.rstrip("Z"))
        except ValueError:
            pass
    elif body.status in ("closed", "reported_to_irb") and ae.resolved_at is None:
        ae.resolved_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(ae)
    return IRBAEOut.from_record(ae)
