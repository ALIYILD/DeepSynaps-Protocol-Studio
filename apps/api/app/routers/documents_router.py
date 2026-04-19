from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import FormDefinition
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

# ── Helpers ────────────────────────────────────────────────────────────────────

_DOC_FORM_TYPE = "document"
_DOC_UPLOAD_MAX_BYTES = 20 * 1024 * 1024  # 20 MB
_DOC_UPLOAD_ALLOWED = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
}


def _docs_storage_root() -> Path:
    """Storage directory for uploaded document blobs. Created on demand."""
    base = Path(get_settings().media_storage_root) / "documents"
    base.mkdir(parents=True, exist_ok=True)
    return base


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


# ── Upload / download ─────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    doc_type: str = Form(default="uploaded"),
    patient_id: Optional[str] = Form(default=None),
    notes: Optional[str] = Form(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentOut:
    """Upload a document file (multipart) and create a record pointing at it.

    Bytes land under `{media_storage_root}/documents/{doc_id}.{ext}`. The file
    ref on the record is the storage-relative path so reads don't need to know
    the absolute disk layout.
    """
    require_minimum_role(actor, "clinician")

    if file.content_type and file.content_type not in _DOC_UPLOAD_ALLOWED:
        raise ApiServiceError(
            code="invalid_file_type",
            message=f"File type '{file.content_type}' is not allowed.",
            status_code=422,
        )

    file_bytes = await file.read()
    if len(file_bytes) > _DOC_UPLOAD_MAX_BYTES:
        raise ApiServiceError(
            code="file_too_large",
            message=f"Upload exceeds maximum size of {_DOC_UPLOAD_MAX_BYTES} bytes.",
            status_code=422,
        )
    if not file_bytes:
        raise ApiServiceError(
            code="empty_file",
            message="Uploaded file is empty.",
            status_code=422,
        )

    doc_id = str(uuid.uuid4())
    original_name = file.filename or "document"
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else "bin"
    # Guard against path-traversal in the extension.
    if not ext.isalnum() or len(ext) > 8:
        ext = "bin"

    storage_path = _docs_storage_root() / f"{doc_id}.{ext}"
    try:
        storage_path.write_bytes(file_bytes)
    except OSError as exc:
        raise ApiServiceError(
            code="storage_error",
            message=f"Failed to persist upload: {exc}",
            status_code=500,
        )

    file_ref = f"documents/{doc_id}.{ext}"
    resolved_title = (title or "").strip() or original_name

    meta = {
        "doc_type": doc_type,
        "patient_id": patient_id,
        "template_id": None,
        "notes": notes,
        "file_ref": file_ref,
        "file_name": original_name,
        "file_size": len(file_bytes),
        "file_mime": file.content_type,
        "signed_at": None,
    }

    record = FormDefinition(
        id=doc_id,
        clinician_id=actor.actor_id,
        title=resolved_title,
        form_type=_DOC_FORM_TYPE,
        questions_json=json.dumps(meta),
        status="uploaded",
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _record_to_out(record)


@router.get("/{doc_id}/download")
def download_document(
    doc_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
):
    """Stream a previously uploaded document file."""
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
    file_ref = meta.get("file_ref")
    if not file_ref:
        raise ApiServiceError(
            code="no_file",
            message="This document has no uploaded file attached.",
            status_code=404,
        )
    settings_root = Path(get_settings().media_storage_root).resolve()
    target = (settings_root / file_ref).resolve()
    # Defence-in-depth: refuse paths outside the storage root.
    if not str(target).startswith(str(settings_root) + os.sep):
        raise ApiServiceError(
            code="invalid_path",
            message="Rejected out-of-root file reference.",
            status_code=400,
        )
    if not target.is_file():
        raise ApiServiceError(
            code="file_missing",
            message="Stored file is no longer present on disk.",
            status_code=410,
        )
    return FileResponse(
        path=str(target),
        media_type=meta.get("file_mime") or "application/octet-stream",
        filename=meta.get("file_name") or record.title,
    )


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
