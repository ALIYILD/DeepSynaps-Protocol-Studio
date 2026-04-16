from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import FormDefinition

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

# ── Helpers ────────────────────────────────────────────────────────────────────

_DOC_FORM_TYPE = "document"


def _meta_from_record(r: FormDefinition) -> dict:
    """Decode the metadata stored in questions_json."""
    try:
        return json.loads(r.questions_json or "{}")
    except Exception:
        return {}


def _record_to_out(r: FormDefinition) -> "DocumentOut":
    meta = _meta_from_record(r)
    return DocumentOut(
        id=r.id,
        title=r.title,
        doc_type=meta.get("doc_type", "clinical"),
        patient_id=meta.get("patient_id"),
        clinician_id=r.clinician_id,
        status=r.status,
        notes=meta.get("notes"),
        file_ref=meta.get("file_ref"),
        signed_at=meta.get("signed_at"),
        template_id=meta.get("template_id"),
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


# ── Schemas ────────────────────────────────────────────────────────────────────

class DocumentCreate(BaseModel):
    title: str
    doc_type: str = "clinical"          # intake|consent|clinical|uploaded|generated
    patient_id: Optional[str] = None
    template_id: Optional[str] = None
    status: str = "pending"             # pending|signed|uploaded|completed
    notes: Optional[str] = None
    file_ref: Optional[str] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    file_ref: Optional[str] = None
    signed_at: Optional[str] = None     # ISO datetime string


class DocumentOut(BaseModel):
    id: str
    title: str
    doc_type: str
    patient_id: Optional[str]
    clinician_id: str
    status: str
    notes: Optional[str]
    file_ref: Optional[str]
    signed_at: Optional[str]
    template_id: Optional[str]
    created_at: str
    updated_at: str


class DocumentListResponse(BaseModel):
    items: list[DocumentOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=DocumentListResponse)
def list_documents(
    patient_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentListResponse:
    """List documents for the authenticated clinician, optionally filtered by patient."""
    require_minimum_role(actor, "clinician")
    stmt = select(FormDefinition).where(
        FormDefinition.clinician_id == actor.actor_id,
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    rows = session.scalars(stmt).all()

    items = [_record_to_out(r) for r in rows]

    if patient_id:
        items = [i for i in items if i.patient_id == patient_id]

    return DocumentListResponse(items=items, total=len(items))


@router.post("", response_model=DocumentOut, status_code=201)
def create_document(
    body: DocumentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentOut:
    """Create a new document record."""
    require_minimum_role(actor, "clinician")

    meta = {
        "doc_type": body.doc_type,
        "patient_id": body.patient_id,
        "template_id": body.template_id,
        "notes": body.notes,
        "file_ref": body.file_ref,
        "signed_at": None,
    }

    record = FormDefinition(
        clinician_id=actor.actor_id,
        title=body.title,
        form_type=_DOC_FORM_TYPE,
        questions_json=json.dumps(meta),
        status=body.status,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(
    doc_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentOut:
    """Retrieve a single document by ID."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(FormDefinition).where(
            FormDefinition.id == doc_id,
            FormDefinition.clinician_id == actor.actor_id,
            FormDefinition.form_type == _DOC_FORM_TYPE,
        )
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Document not found.", status_code=404)
    return _record_to_out(record)


@router.patch("/{doc_id}", response_model=DocumentOut)
def update_document(
    doc_id: str,
    body: DocumentUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentOut:
    """Update a document's status, notes, signed_at, or file_ref."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(FormDefinition).where(
            FormDefinition.id == doc_id,
            FormDefinition.clinician_id == actor.actor_id,
            FormDefinition.form_type == _DOC_FORM_TYPE,
        )
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Document not found.", status_code=404)

    meta = _meta_from_record(record)

    if body.title is not None:
        record.title = body.title
    if body.status is not None:
        record.status = body.status
    if body.notes is not None:
        meta["notes"] = body.notes
    if body.file_ref is not None:
        meta["file_ref"] = body.file_ref
    if body.signed_at is not None:
        meta["signed_at"] = body.signed_at

    record.questions_json = json.dumps(meta)
    record.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    """Delete a document record."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(FormDefinition).where(
            FormDefinition.id == doc_id,
            FormDefinition.clinician_id == actor.actor_id,
            FormDefinition.form_type == _DOC_FORM_TYPE,
        )
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Document not found.", status_code=404)
    session.delete(record)
    session.commit()


# ── Patient-scoped sub-resource ────────────────────────────────────────────────

patient_docs_router = APIRouter(prefix="/api/v1/patients", tags=["documents"])


@patient_docs_router.get("/{patient_id}/documents", response_model=DocumentListResponse)
def list_patient_documents(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentListResponse:
    """List documents for a specific patient (clinician access only)."""
    require_minimum_role(actor, "clinician")
    rows = session.scalars(
        select(FormDefinition).where(
            FormDefinition.clinician_id == actor.actor_id,
            FormDefinition.form_type == _DOC_FORM_TYPE,
        )
    ).all()

    items = [_record_to_out(r) for r in rows]
    items = [i for i in items if i.patient_id == patient_id]
    return DocumentListResponse(items=items, total=len(items))
