"""qEEG records router.

Endpoints
---------
POST  /api/v1/qeeg-records                      Upload / log a qEEG record header
GET   /api/v1/qeeg-records                      List records (filter by patient / course)
GET   /api/v1/qeeg-records/{id}                 Get record detail
PATCH /api/v1/qeeg-records/{id}                 Update summary notes / findings
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
from app.persistence.models import QEEGRecord

router = APIRouter(prefix="/api/v1/qeeg-records", tags=["qEEG Records"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class QEEGRecordCreate(BaseModel):
    patient_id: str
    course_id: Optional[str] = None
    recording_type: str = "resting"       # "resting" | "task" | "sleep" | "ictal"
    recording_date: Optional[str] = None  # YYYY-MM-DD
    equipment: Optional[str] = None       # e.g. "NeuroGuide 19ch", "Emotiv EPOC"
    eyes_condition: Optional[str] = None  # "eyes_open" | "eyes_closed" | "mixed"
    raw_data_ref: Optional[str] = None    # file path / S3 key / URL (opaque)
    summary_notes: Optional[str] = None
    findings: dict = {}                   # free-form JSON findings


class QEEGRecordUpdate(BaseModel):
    summary_notes: Optional[str] = None
    findings: Optional[dict] = None
    raw_data_ref: Optional[str] = None


class QEEGRecordOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    course_id: Optional[str]
    recording_type: str
    recording_date: Optional[str]
    equipment: Optional[str]
    eyes_condition: Optional[str]
    raw_data_ref: Optional[str]
    summary_notes: Optional[str]
    findings: dict
    created_at: str

    @classmethod
    def from_record(cls, r: QEEGRecord) -> "QEEGRecordOut":
        import json
        findings = {}
        if r.findings_json:
            try:
                findings = json.loads(r.findings_json)
            except Exception:
                pass
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            course_id=r.course_id,
            recording_type=r.recording_type,
            recording_date=r.recording_date,
            equipment=r.equipment,
            eyes_condition=r.eyes_condition,
            raw_data_ref=r.raw_data_ref,
            summary_notes=r.summary_notes,
            findings=findings,
            created_at=r.created_at.isoformat(),
        )


class QEEGRecordListResponse(BaseModel):
    items: list[QEEGRecordOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=QEEGRecordOut, status_code=201)
def create_qeeg_record(
    body: QEEGRecordCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGRecordOut:
    import json
    require_minimum_role(actor, "clinician")

    record = QEEGRecord(
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        course_id=body.course_id,
        recording_type=body.recording_type,
        recording_date=body.recording_date,
        equipment=body.equipment,
        eyes_condition=body.eyes_condition,
        raw_data_ref=body.raw_data_ref,
        summary_notes=body.summary_notes,
        findings_json=json.dumps(body.findings) if body.findings else None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return QEEGRecordOut.from_record(record)


@router.get("", response_model=QEEGRecordListResponse)
def list_qeeg_records(
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGRecordListResponse:
    require_minimum_role(actor, "clinician")

    q = db.query(QEEGRecord)
    if actor.role != "admin":
        q = q.filter(QEEGRecord.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(QEEGRecord.patient_id == patient_id)
    if course_id:
        q = q.filter(QEEGRecord.course_id == course_id)

    records = q.order_by(QEEGRecord.created_at.desc()).all()
    items = [QEEGRecordOut.from_record(r) for r in records]
    return QEEGRecordListResponse(items=items, total=len(items))


@router.get("/{record_id}", response_model=QEEGRecordOut)
def get_qeeg_record(
    record_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGRecordOut:
    require_minimum_role(actor, "clinician")
    record = db.query(QEEGRecord).filter_by(id=record_id).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="qEEG record not found.", status_code=404)
    if actor.role != "admin" and record.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="qEEG record not found.", status_code=404)
    return QEEGRecordOut.from_record(record)


@router.patch("/{record_id}", response_model=QEEGRecordOut)
def update_qeeg_record(
    record_id: str,
    body: QEEGRecordUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGRecordOut:
    import json
    require_minimum_role(actor, "clinician")
    record = db.query(QEEGRecord).filter_by(id=record_id).first()
    if record is None or (actor.role != "admin" and record.clinician_id != actor.actor_id):
        raise ApiServiceError(code="not_found", message="qEEG record not found.", status_code=404)

    if body.summary_notes is not None:
        record.summary_notes = body.summary_notes
    if body.findings is not None:
        record.findings_json = json.dumps(body.findings)
    if body.raw_data_ref is not None:
        record.raw_data_ref = body.raw_data_ref

    db.commit()
    db.refresh(record)
    return QEEGRecordOut.from_record(record)
