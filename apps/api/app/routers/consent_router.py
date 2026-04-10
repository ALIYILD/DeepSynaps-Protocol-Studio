"""Consent records router.

Endpoints
---------
POST   /api/v1/consent-records           Create a new consent record
GET    /api/v1/consent-records           List consent records (filter by patient_id)
GET    /api/v1/consent-records/{id}      Get a single consent record
PATCH  /api/v1/consent-records/{id}      Update a consent record (e.g. mark as signed)
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
from app.persistence.models import ConsentRecord

router = APIRouter(prefix="/api/v1/consent-records", tags=["Consent Records"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ConsentCreate(BaseModel):
    patient_id: str
    consent_type: str               # e.g. "general", "off_label", "research"
    modality_slug: Optional[str] = None
    signed: bool = False
    signed_at: Optional[str] = None     # ISO datetime
    document_ref: Optional[str] = None  # URL or file reference
    notes: Optional[str] = None


class ConsentUpdate(BaseModel):
    signed: Optional[bool] = None
    signed_at: Optional[str] = None     # ISO datetime
    document_ref: Optional[str] = None
    notes: Optional[str] = None


class ConsentOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    consent_type: str
    modality_slug: Optional[str]
    signed: bool
    signed_at: Optional[str]
    document_ref: Optional[str]
    notes: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: ConsentRecord) -> "ConsentOut":
        def _dt(v) -> Optional[str]:
            return v.isoformat() if isinstance(v, datetime) else v
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            consent_type=r.consent_type,
            modality_slug=r.modality_slug,
            signed=r.signed,
            signed_at=_dt(r.signed_at),
            document_ref=r.document_ref,
            notes=r.notes,
            created_at=r.created_at.isoformat(),
        )


class ConsentListResponse(BaseModel):
    items: list[ConsentOut]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_consent_or_404(db: Session, consent_id: str, actor: AuthenticatedActor) -> ConsentRecord:
    record = db.query(ConsentRecord).filter_by(id=consent_id).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Consent record not found.", status_code=404)
    if actor.role != "admin" and record.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Consent record not found.", status_code=404)
    return record


def _parse_iso(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value.rstrip("Z"))
    except ValueError:
        return None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=ConsentOut, status_code=201)
def create_consent_record(
    body: ConsentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentOut:
    require_minimum_role(actor, "clinician")

    signed_at: Optional[datetime] = None
    if body.signed_at:
        signed_at = _parse_iso(body.signed_at)
    elif body.signed:
        signed_at = datetime.utcnow()

    record = ConsentRecord(
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        consent_type=body.consent_type.strip(),
        modality_slug=body.modality_slug,
        signed=body.signed,
        signed_at=signed_at,
        document_ref=body.document_ref,
        notes=body.notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return ConsentOut.from_record(record)


@router.get("", response_model=ConsentListResponse)
def list_consent_records(
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentListResponse:
    require_minimum_role(actor, "clinician")

    q = db.query(ConsentRecord)
    if actor.role != "admin":
        q = q.filter(ConsentRecord.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(ConsentRecord.patient_id == patient_id)

    records = q.order_by(ConsentRecord.created_at.desc()).all()
    items = [ConsentOut.from_record(r) for r in records]
    return ConsentListResponse(items=items, total=len(items))


@router.get("/{consent_id}", response_model=ConsentOut)
def get_consent_record(
    consent_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentOut:
    require_minimum_role(actor, "clinician")
    record = _get_consent_or_404(db, consent_id, actor)
    return ConsentOut.from_record(record)


@router.patch("/{consent_id}", response_model=ConsentOut)
def update_consent_record(
    consent_id: str,
    body: ConsentUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConsentOut:
    require_minimum_role(actor, "clinician")
    record = _get_consent_or_404(db, consent_id, actor)

    if body.signed is not None:
        record.signed = body.signed
        # Auto-stamp signed_at when marking as signed if not supplied
        if body.signed and record.signed_at is None and body.signed_at is None:
            record.signed_at = datetime.utcnow()

    if body.signed_at is not None:
        record.signed_at = _parse_iso(body.signed_at)

    if body.document_ref is not None:
        record.document_ref = body.document_ref

    if body.notes is not None:
        record.notes = body.notes

    db.commit()
    db.refresh(record)
    return ConsentOut.from_record(record)
