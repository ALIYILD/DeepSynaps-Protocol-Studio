from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AnalysisAnnotation
from app.repositories.patients import resolve_patient_clinic_id


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str | None, db: Session) -> None:
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


router = APIRouter(prefix="/api/v1/annotations", tags=["annotations"])


def _load_json(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


class AnnotationCreateIn(BaseModel):
    patient_id: str
    target_type: str = Field(pattern="^(qeeg|mri)$")
    target_id: str
    title: Optional[str] = Field(default=None, max_length=160)
    body: str = Field(min_length=1, max_length=5000)
    anchor_label: Optional[str] = Field(default=None, max_length=120)
    anchor_data: Optional[dict] = None
    visibility: str = Field(default="clinical", pattern="^(clinical)$")


class AnnotationOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    target_type: str
    target_id: str
    title: Optional[str] = None
    body: str
    anchor_label: Optional[str] = None
    anchor_data: Optional[dict] = None
    visibility: str
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: AnalysisAnnotation) -> "AnnotationOut":
        return cls(
            id=row.id,
            patient_id=row.patient_id,
            clinician_id=row.clinician_id,
            target_type=row.target_type,
            target_id=row.target_id,
            title=row.title,
            body=row.body,
            anchor_label=row.anchor_label,
            anchor_data=_load_json(row.anchor_data_json),
            visibility=row.visibility,
            created_at=row.created_at.isoformat() if isinstance(row.created_at, datetime) else str(row.created_at),
            updated_at=row.updated_at.isoformat() if isinstance(row.updated_at, datetime) else str(row.updated_at),
        )


@router.get("", response_model=list[AnnotationOut])
def list_annotations(
    patient_id: str = Query(...),
    target_type: Optional[str] = Query(default=None, pattern="^(qeeg|mri)$"),
    target_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[AnnotationOut]:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    q = db.query(AnalysisAnnotation).filter(AnalysisAnnotation.patient_id == patient_id)
    if target_type:
        q = q.filter(AnalysisAnnotation.target_type == target_type)
    if target_id:
        q = q.filter(AnalysisAnnotation.target_id == target_id)
    rows = q.order_by(AnalysisAnnotation.created_at.desc()).all()
    return [AnnotationOut.from_row(row) for row in rows]


@router.post("", response_model=AnnotationOut, status_code=201)
def create_annotation(
    body: AnnotationCreateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnnotationOut:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, body.patient_id, db)

    row = AnalysisAnnotation(
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        target_type=body.target_type,
        target_id=body.target_id,
        title=(body.title or "").strip() or None,
        body=body.body.strip(),
        anchor_label=(body.anchor_label or "").strip() or None,
        anchor_data_json=json.dumps(body.anchor_data) if body.anchor_data is not None else None,
        visibility=body.visibility,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AnnotationOut.from_row(row)


@router.delete("/{annotation_id}", status_code=204)
def delete_annotation(
    annotation_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")

    row = db.query(AnalysisAnnotation).filter_by(id=annotation_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Annotation not found", status_code=404)
    if row.clinician_id != actor.actor_id:
        raise ApiServiceError(code="forbidden", message="You can only delete your own annotations", status_code=403)
    db.delete(row)
    db.commit()
