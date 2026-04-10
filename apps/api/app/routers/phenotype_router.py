"""Phenotype assignments router.

Endpoints
---------
POST   /api/v1/phenotype-assignments           Create a new phenotype assignment
GET    /api/v1/phenotype-assignments           List assignments (filter by patient_id)
DELETE /api/v1/phenotype-assignments/{id}      Delete an assignment (ownership check)
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import PhenotypeAssignment

router = APIRouter(prefix="/api/v1/phenotype-assignments", tags=["Phenotype Assignments"])


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


# ── Validation helpers ─────────────────────────────────────────────────────────

_VALID_CONFIDENCES = {"high", "moderate", "low"}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=PhenotypeAssignmentOut, status_code=201)
def create_phenotype_assignment(
    body: PhenotypeAssignmentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PhenotypeAssignmentOut:
    require_minimum_role(actor, "clinician")

    if body.confidence is not None and body.confidence.lower() not in _VALID_CONFIDENCES:
        raise ApiServiceError(
            code="invalid_confidence",
            message=f"Confidence must be one of: {', '.join(sorted(_VALID_CONFIDENCES))}.",
            status_code=422,
        )

    assigned_at = datetime.utcnow()
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
    return PhenotypeAssignmentOut.from_record(record)


@router.get("", response_model=PhenotypeAssignmentListResponse)
def list_phenotype_assignments(
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PhenotypeAssignmentListResponse:
    require_minimum_role(actor, "clinician")

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

    db.delete(record)
    db.commit()
