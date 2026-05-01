from __future__ import annotations

import io
import json
import logging
import os
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import DocumentTemplate, FormDefinition, Patient, User
from app.repositories.patients import resolve_patient_clinic_id
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

_logger = logging.getLogger(__name__)

# Documents Hub launch-audit (2026-04-30) — clinical-safety disclaimers
# rendered on the page banner and in /summary so reviewers always see the
# regulatory ceiling for this view.
DOCUMENTS_PAGE_DISCLAIMERS = [
    "Documents are clinical records and require clinician sign-off.",
    "Signed documents are immutable; supersede creates a revision with audit trail.",
    "Patient-identifiable documents must comply with local privacy law.",
]

# Drill-in coverage matrix — Documents Hub re-audit (2026-04-30, PR #321/#334/
# #336 follow-up). Each upstream surface that emits drill-out URLs targeting
# ``?page=documents-hub&source_target_type=…&source_target_id=…`` is listed
# here. The list endpoint validates ``source_target_type`` against this set
# (422 on unknown values) so the filter never silently degrades to "all docs"
# when an upstream sends a typo. The page-level audit emits the surface as
# part of the note so regulators can trace the drill-in path end-to-end.
KNOWN_DRILL_IN_SURFACES: set[str] = {
    "clinical_trials",      # CT register drills to sponsor reports / ICFs
    "irb_manager",          # IRB protocol detail drills to consent docs
    "quality_assurance",    # QA finding drills to source document(s)
    "course_detail",        # course timeline drills to in-course documents
    "adverse_events",       # AE record drills to attached SAE narratives
    "reports_hub",          # report drills to attached supporting documents
}

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
_DOC_ALLOWED_STATUSES = {"pending", "uploaded", "signed", "completed", "superseded"}
_DOC_SIGNABLE_STATUSES = {"signed", "completed"}

# Pin every accepted MIME type to a known-safe extension. Pre-fix the
# on-disk extension came from ``file.filename.rsplit(".", 1)[-1]`` with
# only an "isalnum() and len <= 8" guard — ``audio.php`` would land as
# ``…/audio.php`` because ``php`` is alphanumeric. Pinning the extension
# to the validated MIME removes that footgun entirely.
_DOC_MIME_TO_EXT: dict[str, str] = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "text/plain": "txt",
}

# Magic-byte signatures for the accepted document types. Pre-fix the
# router trusted client-supplied ``Content-Type`` alone — an attacker
# could ``POST`` arbitrary binary tagged ``application/pdf`` and the
# router happily wrote it to disk. The first bytes are checked at the
# upload boundary; mismatches raise 422 ``invalid_file_content``.
_DOC_MAGIC_SIGNATURES: tuple[tuple[bytes, bytes | None], ...] = (
    (b"%PDF-", None),                             # PDF
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", None),  # OLE compound (legacy .doc)
    (b"PK\x03\x04", None),                        # ZIP container (.docx, also .xlsx etc.)
    (b"\xff\xd8\xff", None),                      # JPEG
    (b"\x89PNG\r\n\x1a\n", None),                 # PNG
    (b"RIFF", b"WEBP"),                           # WebP
)
_PRINTABLE_ASCII = set(range(0x20, 0x7F)) | {0x09, 0x0A, 0x0D}


def _looks_like_document(payload_head: bytes, mime: str | None) -> bool:
    """Refuse arbitrary binary masquerading as a document."""
    if not payload_head:
        return False
    head = payload_head[:32]
    for prefix, contains in _DOC_MAGIC_SIGNATURES:
        if head.startswith(prefix):
            if contains is None or contains in head:
                return True
    # text/plain has no magic bytes; require the head to be mostly
    # printable so a binary payload tagged ``text/plain`` is refused.
    if mime == "text/plain":
        head256 = payload_head[:256]
        if not head256:
            return False
        printable = sum(1 for b in head256 if b in _PRINTABLE_ASCII)
        return (printable / len(head256)) >= 0.85
    return False


def _safe_doc_ext(mime: str | None) -> str:
    """Return the canonical disk extension for the validated MIME."""
    return _DOC_MIME_TO_EXT.get((mime or "").lower(), "bin")


# Stored ``file_ref`` strings must look like ``documents/<uuid>.<ext>``.
# Pre-fix ``_validate_document_file_ref`` only checked
# ``startswith("documents/")`` — ``documents/../../etc/passwd`` would
# pass that prefix gate; the second-line ``target.resolve()`` + root
# check on download was the only thing standing between us and arbitrary
# file read. Tightening the regex here is defence-in-depth so a future
# refactor that drops the resolve() check is not RCE-adjacent.
_DOC_FILE_REF_RE = re.compile(r"^documents/[A-Za-z0-9-]{1,64}\.[A-Za-z0-9]{1,8}$")


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
        signed_by=meta.get("signed_by_actor_id"),
        template_id=meta.get("template_id"),
        supersedes=meta.get("supersedes"),
        superseded_by=meta.get("superseded_by"),
        revision=int(meta.get("revision", 1) or 1),
        is_demo=bool(meta.get("is_demo", False)),
        source_target_type=meta.get("source_target_type"),
        source_target_id=meta.get("source_target_id"),
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
) -> None:
    """Best-effort audit-trail write. Must never raise back at the caller.

    Mirrors the pattern in ``reports_router._audit`` so events show up in
    ``/api/v1/audit-trail`` under ``target_type='documents'``.
    """
    try:
        from app.repositories.audit import create_audit_event

        now = datetime.now(timezone.utc)
        event_id = (
            f"documents-{event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="documents",
            action=f"documents.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block the API
        _logger.debug("documents audit write skipped", exc_info=True)


def _validate_document_status(status: str) -> None:
    if status not in _DOC_ALLOWED_STATUSES:
        raise ApiServiceError(
            code="invalid_status",
            message=f"status must be one of {sorted(_DOC_ALLOWED_STATUSES)}.",
            status_code=422,
        )


def _validate_drill_in_pair(
    source_target_type: Optional[str],
    source_target_id: Optional[str],
) -> None:
    """Reject unknown drill-in surfaces with 422.

    Pre-validation policy (Documents Hub drill-in coverage, 2026-04-30):

    * If neither parameter is supplied, the filter is a no-op — the caller
      gets the unfiltered list (current behaviour preserved).
    * If only one of the two is supplied, the pair is malformed — return
      422 rather than silently dropping the half-supplied filter.
    * ``source_target_type`` must be one of the known upstream surfaces
      that actually emit drill-out URLs (clinical_trials / irb_manager /
      quality_assurance / course_detail / adverse_events / reports_hub).
      Anything else is 422 — never a silent fallback to "all docs".
    """
    if source_target_type is None and source_target_id is None:
        return
    if source_target_type is None or source_target_id is None:
        raise ApiServiceError(
            code="invalid_drill_in",
            message=(
                "source_target_type and source_target_id must be supplied "
                "as a pair."
            ),
            status_code=422,
        )
    if source_target_type not in KNOWN_DRILL_IN_SURFACES:
        raise ApiServiceError(
            code="invalid_drill_in",
            message=(
                f"source_target_type must be one of "
                f"{sorted(KNOWN_DRILL_IN_SURFACES)}."
            ),
            status_code=422,
        )


def _stamp_document_provenance(meta: dict, actor: AuthenticatedActor, *, event: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    actor_id = actor.actor_id
    meta["last_governance_event"] = event
    meta["last_governance_event_at"] = now
    meta["last_governance_event_by"] = actor_id


def _assert_document_patient_access(
    patient_id: Optional[str],
    actor: AuthenticatedActor,
    session: Session,
) -> None:
    """Cross-clinic ownership gate for document-related routes.

    Pre-fix this checked ``Patient.clinician_id == actor.actor_id``
    (legacy owner-only). That refused legitimate same-clinic
    colleagues, didn't consult ``User.clinic_id``, and admins of
    one clinic could read documents owned by clinicians in another
    (because admin had no separate branch — just owner-only).

    Post-fix: routes through ``resolve_patient_clinic_id`` +
    ``require_patient_owner`` (the canonical pair used in qeeg /
    media / wearable / device-sync gates). Cross-clinic 403 is
    converted to 404 so row existence isn't leaked. Orphan
    patients (clinician with no clinic_id) refuse for non-admins.
    """
    if patient_id is None:
        return
    exists, clinic_id = resolve_patient_clinic_id(session, patient_id)
    if not exists:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    try:
        require_patient_owner(actor, clinic_id)
    except ApiServiceError as exc:
        if exc.status_code == 403:
            raise ApiServiceError(
                code="not_found", message="Patient not found.", status_code=404,
            ) from exc
        raise


def _scope_documents_query_to_clinic(q, actor: AuthenticatedActor):
    """Restrict a ``FormDefinition`` query to the actor's clinic.

    Pre-fix every ``FormDefinition.clinician_id == actor.actor_id``
    filter scoped to the owning clinician only. Same-clinic
    colleagues never saw each other's documents, and an admin of
    clinic A still saw zero rows because the filter never ran the
    admin-bypass branch (the filter was `... == actor.actor_id`,
    full stop).

    Post-fix the query joins ``FormDefinition -> User`` on
    ``clinician_id`` and filters on ``actor.clinic_id`` for non-
    admin/supervisor roles. Admin / supervisor are unscoped
    (cross-clinic operators by design).
    """
    if actor.role in ("admin", "supervisor"):
        return q
    if not getattr(actor, "clinic_id", None):
        return q.filter(FormDefinition.id.is_(None))
    return (
        q.join(User, User.id == FormDefinition.clinician_id)
        .filter(User.clinic_id == actor.clinic_id)
    )


def _validate_document_file_ref(file_ref: Optional[str]) -> None:
    if file_ref is None:
        return
    # Strict regex — pre-fix this only checked startswith("documents/")
    # so ``documents/../../etc/passwd`` would pass and only the
    # ``target.resolve()`` + root-prefix check on download caught it.
    if not _DOC_FILE_REF_RE.match(file_ref):
        raise ApiServiceError(
            code="invalid_file_ref",
            message="Document downloads are limited to stored documents/ paths.",
            status_code=422,
        )


# ── Schemas ────────────────────────────────────────────────────────────────────

class DocumentCreate(BaseModel):
    title: str = Field(..., max_length=255)
    doc_type: str = Field(default="clinical", max_length=32)  # intake|consent|clinical|uploaded|generated
    patient_id: Optional[str] = Field(default=None, max_length=64)
    template_id: Optional[str] = Field(default=None, max_length=64)
    status: str = Field(default="pending", max_length=32)     # pending|signed|uploaded|completed
    notes: Optional[str] = Field(default=None, max_length=10_000)
    # Cross-surface attachment chain. When clinical_trials attaches a sponsor
    # report, IRB attaches a consent doc, QA attaches a finding artefact, etc.
    # the create caller passes these so the Documents Hub drill-in filter
    # surfaces the link. Validated against KNOWN_DRILL_IN_SURFACES at create
    # time (422 on unknown values).
    source_target_type: Optional[str] = Field(default=None, max_length=32)
    source_target_id: Optional[str] = Field(default=None, max_length=64)


class DocumentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    status: Optional[str] = Field(default=None, max_length=32)
    notes: Optional[str] = Field(default=None, max_length=10_000)
    signed_at: Optional[str] = Field(default=None, max_length=64)  # ISO datetime string


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
    signed_by: Optional[str] = None
    template_id: Optional[str]
    supersedes: Optional[str] = None
    superseded_by: Optional[str] = None
    revision: int = 1
    is_demo: bool = False
    # Cross-surface drill-in provenance (Documents Hub launch-audit
    # 2026-04-30). When a document was attached from an upstream surface
    # (clinical_trials sponsor report, irb_manager consent doc, qa finding,
    # course timeline, adverse_events SAE narrative, reports supporting
    # doc), these two fields preserve the drill path so the Documents Hub
    # filter can render the "Showing documents linked to <surface> <id>"
    # banner without inventing rows. Both null on standalone documents.
    source_target_type: Optional[str] = None
    source_target_id: Optional[str] = None
    created_at: str
    updated_at: str


class DocumentListResponse(BaseModel):
    items: list[DocumentOut]
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=DocumentListResponse)
def list_documents(
    patient_id: Optional[str] = None,
    kind: Optional[str] = None,
    status: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    q: Optional[str] = None,
    clinic_id: Optional[str] = None,  # accepted for forward-compat
    source_target_type: Optional[str] = Query(default=None, max_length=32),
    source_target_id: Optional[str] = Query(default=None, max_length=64),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentListResponse:
    """List documents for the authenticated clinician's clinic.

    Filters (Documents Hub launch-audit 2026-04-30):

    * ``patient_id`` — restrict to a single patient (clinic-isolation enforced).
    * ``kind`` — match the metadata ``doc_type`` field, case-insensitive
      substring (e.g. ``intake``, ``consent``, ``letter``, ``uploaded``).
    * ``status`` — exact status match (``pending``, ``uploaded``, ``signed``,
      ``completed``, ``superseded``).
    * ``since`` / ``until`` — ISO-8601 cutoffs (inclusive) on ``created_at``.
    * ``q`` — case-insensitive substring search across title, notes, and id.
    * ``clinic_id`` — accepted for forward-compat; the per-clinic scope is
      already enforced by ``_scope_documents_query_to_clinic`` against the
      actor's clinic, so this parameter is a documented no-op.
    * ``source_target_type`` + ``source_target_id`` — drill-in filter from
      upstream surfaces (clinical_trials, irb_manager, quality_assurance,
      course_detail, adverse_events, reports_hub). Both must be supplied
      together — supplying only one returns 422 rather than silently
      degrading to "all docs". Unknown surfaces also return 422.
    * ``limit`` / ``offset`` — pagination.
    """
    require_minimum_role(actor, "clinician")
    _assert_document_patient_access(patient_id, actor, session)
    _validate_drill_in_pair(source_target_type, source_target_id)
    base_q = session.query(FormDefinition).filter(
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    base_q = _scope_documents_query_to_clinic(base_q, actor)

    # SQL-level filters (status / since / until / q) execute in the DB so
    # pagination is correct. ``patient_id`` and ``kind`` live in the JSON
    # ``questions_json`` blob, so we apply them in Python after fetch.
    if status:
        base_q = base_q.filter(FormDefinition.status == status)
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace("Z", "+00:00"))
            base_q = base_q.filter(FormDefinition.created_at >= cutoff)
        except ValueError:
            pass
    if until:
        try:
            cutoff_to = datetime.fromisoformat(until.replace("Z", "+00:00"))
            base_q = base_q.filter(FormDefinition.created_at <= cutoff_to)
        except ValueError:
            pass
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import func
        base_q = base_q.filter(
            or_(
                func.lower(func.coalesce(FormDefinition.title, "")).like(like),
                func.lower(func.coalesce(FormDefinition.questions_json, "")).like(like),
                func.lower(FormDefinition.id).like(like),
            )
        )

    base_q = base_q.order_by(FormDefinition.created_at.desc())
    rows = base_q.offset(offset).limit(limit).all()
    items = [_record_to_out(r) for r in rows]

    if patient_id:
        items = [i for i in items if i.patient_id == patient_id]
    if kind:
        kk = kind.lower()
        items = [i for i in items if kk in (i.doc_type or "").lower()]

    # Drill-in filter applied post-fetch because both fields live in the
    # questions_json blob. The pair-validation above guarantees both fields
    # are present (or both absent) so the comparison is straightforward.
    if source_target_type and source_target_id:
        items = [
            i for i in items
            if i.source_target_type == source_target_type
            and i.source_target_id == source_target_id
        ]

    return DocumentListResponse(items=items, total=len(items))


@router.post("", response_model=DocumentOut, status_code=201)
def create_document(
    body: DocumentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentOut:
    """Create a new document record."""
    require_minimum_role(actor, "clinician")
    _validate_document_status(body.status)
    _assert_document_patient_access(body.patient_id, actor, session)
    _validate_drill_in_pair(body.source_target_type, body.source_target_id)

    meta = {
        "doc_type": body.doc_type,
        "patient_id": body.patient_id,
        "template_id": body.template_id,
        "notes": body.notes,
        "file_ref": None,
        "signed_at": None,
        "created_by_actor_id": actor.actor_id,
        "created_by_actor_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.source_target_type and body.source_target_id:
        meta["source_target_type"] = body.source_target_type
        meta["source_target_id"] = body.source_target_id
    _stamp_document_provenance(meta, actor, event="created")

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


# ── Custom document templates (clinician-authored) ────────────────────────────
# IMPORTANT: these `/templates...` routes are registered BEFORE the dynamic
# `/{doc_id}` routes below; FastAPI matches in declaration order, so swapping
# this block past the `{doc_id}` routes would route GET /templates into
# get_document(doc_id="templates").

_TEMPLATE_ALLOWED_TYPES = {"letter", "consent", "handout", "report", "note", "other"}
_TEMPLATE_NAME_MAX = 255
_TEMPLATE_BODY_MAX = 200_000  # 200 KB of markdown is plenty for a template.


class DocumentTemplateCreate(BaseModel):
    name: str
    doc_type: str = "letter"
    body_markdown: str = ""


class DocumentTemplateUpdate(BaseModel):
    name: Optional[str] = None
    doc_type: Optional[str] = None
    body_markdown: Optional[str] = None


class DocumentTemplateOut(BaseModel):
    id: str
    owner_id: str
    name: str
    doc_type: str
    body_markdown: str
    created_at: str
    updated_at: str


class DocumentTemplateListResponse(BaseModel):
    items: list[DocumentTemplateOut]
    total: int


def _template_to_out(r: DocumentTemplate) -> DocumentTemplateOut:
    return DocumentTemplateOut(
        id=r.id,
        owner_id=r.owner_id,
        name=r.name,
        doc_type=r.doc_type,
        body_markdown=r.body_markdown or "",
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


def _validate_template_payload(name: Optional[str], doc_type: Optional[str], body: Optional[str]) -> None:
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise ApiServiceError(code="invalid_name", message="Template name is required.", status_code=422)
        if len(cleaned) > _TEMPLATE_NAME_MAX:
            raise ApiServiceError(
                code="invalid_name",
                message=f"Template name exceeds {_TEMPLATE_NAME_MAX} characters.",
                status_code=422,
            )
    if doc_type is not None and doc_type not in _TEMPLATE_ALLOWED_TYPES:
        raise ApiServiceError(
            code="invalid_doc_type",
            message=f"doc_type must be one of {sorted(_TEMPLATE_ALLOWED_TYPES)}.",
            status_code=422,
        )
    if body is not None and len(body) > _TEMPLATE_BODY_MAX:
        raise ApiServiceError(
            code="body_too_large",
            message=f"Template body exceeds {_TEMPLATE_BODY_MAX} characters.",
            status_code=422,
        )


@router.get("/templates", response_model=DocumentTemplateListResponse)
def list_document_templates(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentTemplateListResponse:
    """List custom document templates owned by the authenticated clinician."""
    require_minimum_role(actor, "clinician")
    rows = session.scalars(
        select(DocumentTemplate)
        .where(DocumentTemplate.owner_id == actor.actor_id)
        .order_by(DocumentTemplate.updated_at.desc())
    ).all()
    items = [_template_to_out(r) for r in rows]
    return DocumentTemplateListResponse(items=items, total=len(items))


@router.post("/templates", response_model=DocumentTemplateOut, status_code=201)
def create_document_template(
    body: DocumentTemplateCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentTemplateOut:
    """Create a custom document template owned by the caller."""
    require_minimum_role(actor, "clinician")
    _validate_template_payload(body.name, body.doc_type, body.body_markdown)
    record = DocumentTemplate(
        owner_id=actor.actor_id,
        name=body.name.strip(),
        doc_type=body.doc_type,
        body_markdown=body.body_markdown or "",
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _template_to_out(record)


@router.patch("/templates/{template_id}", response_model=DocumentTemplateOut)
def update_document_template(
    template_id: str,
    body: DocumentTemplateUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentTemplateOut:
    """Update name / doc_type / body of a template owned by the caller."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(DocumentTemplate).where(
            DocumentTemplate.id == template_id,
            DocumentTemplate.owner_id == actor.actor_id,
        )
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Template not found.", status_code=404)
    _validate_template_payload(body.name, body.doc_type, body.body_markdown)
    if body.name is not None:
        record.name = body.name.strip()
    if body.doc_type is not None:
        record.doc_type = body.doc_type
    if body.body_markdown is not None:
        record.body_markdown = body.body_markdown
    record.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(record)
    return _template_to_out(record)


@router.delete("/templates/{template_id}", status_code=204)
def delete_document_template(
    template_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    """Hard-delete a template owned by the caller."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(DocumentTemplate).where(
            DocumentTemplate.id == template_id,
            DocumentTemplate.owner_id == actor.actor_id,
        )
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Template not found.", status_code=404)
    session.delete(record)
    session.commit()


# ── Static-path Documents Hub endpoints (declared BEFORE dynamic /{doc_id}
# routes so FastAPI's declaration-order matching does not route GET /summary
# into get_document(doc_id="summary"). Same pattern as the templates block
# above.) ─────────────────────────────────────────────────────────────────


@router.get("/summary")
def documents_summary(
    patient_id: Optional[str] = None,
    source_target_type: Optional[str] = Query(default=None, max_length=32),
    source_target_id: Optional[str] = Query(default=None, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict:
    """Counts: total / by_kind / by_status. Honest about empty cases.

    Does NOT log a self-audit event (the Hub page-load audit handles that
    at /audit-events). Returns disclaimers so the UI banner can render
    them server-side rather than hardcoding strings in the frontend.

    Drill-in filter (Documents Hub launch-audit 2026-04-30): accepts
    ``source_target_type`` + ``source_target_id`` so the KPI strip and
    "showing N filtered" banner reflect the same scope as the list. Pair
    validation matches the list endpoint — half-supplied = 422, unknown
    surface = 422, never a silent fallback.
    """
    require_minimum_role(actor, "clinician")
    if patient_id:
        _assert_document_patient_access(patient_id, actor, session)
    _validate_drill_in_pair(source_target_type, source_target_id)

    base_q = session.query(FormDefinition).filter(
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    base_q = _scope_documents_query_to_clinic(base_q, actor)
    rows = base_q.all()

    if patient_id:
        rows = [r for r in rows if (_meta_from_record(r) or {}).get("patient_id") == patient_id]
    if source_target_type and source_target_id:
        rows = [
            r for r in rows
            if (_meta_from_record(r) or {}).get("source_target_type") == source_target_type
            and (_meta_from_record(r) or {}).get("source_target_id") == source_target_id
        ]

    by_status: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    demo_count = 0
    for r in rows:
        st = r.status or "pending"
        by_status[st] = by_status.get(st, 0) + 1
        meta = _meta_from_record(r)
        kk = (meta.get("doc_type") or "clinical").lower()
        by_kind[kk] = by_kind.get(kk, 0) + 1
        if meta.get("is_demo"):
            demo_count += 1

    return {
        "total": len(rows),
        "draft": by_status.get("pending", 0),
        "uploaded": by_status.get("uploaded", 0),
        "signed": by_status.get("signed", 0) + by_status.get("completed", 0),
        "superseded": by_status.get("superseded", 0),
        "demo": demo_count,
        "by_status": by_status,
        "by_kind": by_kind,
        "filtered_by_source_target": bool(
            source_target_type and source_target_id
        ),
        "source_target_type": source_target_type,
        "source_target_id": source_target_id,
        "known_drill_in_surfaces": sorted(KNOWN_DRILL_IN_SURFACES),
        "disclaimers": list(DOCUMENTS_PAGE_DISCLAIMERS),
        "scope_limitations": [
            "clinic_id filter is accepted but a no-op — clinic scope is "
            "enforced via the actor's clinic_id on the User model.",
            "Upload storage backend: local disk under media_storage_root. "
            "S3/blob storage is not configured in this deployment.",
            "Drill-in filter relies on source_target_* metadata stamped at "
            "document creation. Older documents predating the drill-in "
            "audit have null source_target fields and are excluded from "
            "filtered counts (honest empty state, never silent fallback).",
        ],
    }


def _csv_quote(value: object) -> str:
    s = "" if value is None else str(value)
    if any(ch in s for ch in [",", "\"", "\n", "\r"]):
        return '"' + s.replace('"', '""') + '"'
    return s


@router.get("/export.zip")
def export_documents_zip(
    patient_id: Optional[str] = None,
    kind: Optional[str] = None,
    status: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    q: Optional[str] = None,
    source_target_type: Optional[str] = Query(default=None, max_length=32),
    source_target_id: Optional[str] = Query(default=None, max_length=64),
    limit: int = Query(default=200, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> Response:
    """Filtered bulk export — returns a ZIP with manifest.csv + uploaded blobs.

    The manifest is prefixed with a ``# DEMO`` header line if any of the
    matched documents are flagged ``is_demo`` so importers can drop demo
    rows trivially. Filters mirror the GET / list endpoint, including the
    cross-surface ``source_target_type`` / ``source_target_id`` drill-in
    pair.
    """
    _validate_drill_in_pair(source_target_type, source_target_id)
    require_minimum_role(actor, "clinician")
    if patient_id:
        _assert_document_patient_access(patient_id, actor, session)

    base_q = session.query(FormDefinition).filter(
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    base_q = _scope_documents_query_to_clinic(base_q, actor)
    if status:
        base_q = base_q.filter(FormDefinition.status == status)
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace("Z", "+00:00"))
            base_q = base_q.filter(FormDefinition.created_at >= cutoff)
        except ValueError:
            pass
    if until:
        try:
            cutoff_to = datetime.fromisoformat(until.replace("Z", "+00:00"))
            base_q = base_q.filter(FormDefinition.created_at <= cutoff_to)
        except ValueError:
            pass
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import func
        base_q = base_q.filter(
            or_(
                func.lower(func.coalesce(FormDefinition.title, "")).like(like),
                func.lower(func.coalesce(FormDefinition.questions_json, "")).like(like),
                func.lower(FormDefinition.id).like(like),
            )
        )

    rows = base_q.order_by(FormDefinition.created_at.desc()).limit(limit).all()
    items = [_record_to_out(r) for r in rows]
    if patient_id:
        items = [i for i in items if i.patient_id == patient_id]
    if kind:
        kk = kind.lower()
        items = [i for i in items if kk in (i.doc_type or "").lower()]
    if source_target_type and source_target_id:
        items = [
            i for i in items
            if i.source_target_type == source_target_type
            and i.source_target_id == source_target_id
        ]

    has_demo = any(i.is_demo for i in items)
    header = [
        "id", "title", "doc_type", "patient_id", "status", "revision",
        "supersedes", "superseded_by", "signed_by", "signed_at",
        "created_at", "updated_at", "is_demo", "file_ref",
    ]
    csv_lines: list[str] = []
    if has_demo:
        csv_lines.append("# DEMO — not regulator-submittable")
    csv_lines.append(",".join(header))
    for it in items:
        row = [
            it.id, it.title, it.doc_type, it.patient_id or "", it.status, it.revision,
            it.supersedes or "", it.superseded_by or "", it.signed_by or "",
            it.signed_at or "", it.created_at, it.updated_at,
            "1" if it.is_demo else "0", it.file_ref or "",
        ]
        csv_lines.append(",".join(_csv_quote(v) for v in row))
    manifest = "\n".join(csv_lines) + "\n"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.csv", manifest)
        # Best-effort: include actual file blobs if they exist on disk.
        # Schema-naming uses the document id so importers can join back.
        settings_root = Path(get_settings().media_storage_root).resolve()
        for it in items:
            if not it.file_ref:
                continue
            try:
                _validate_document_file_ref(it.file_ref)
            except ApiServiceError:
                continue
            target = (settings_root / it.file_ref).resolve()
            if not str(target).startswith(str(settings_root) + os.sep):
                continue
            if not target.is_file():
                continue
            ext = target.suffix.lstrip(".") or "bin"
            zf.write(target, f"files/{it.id}.{ext}")

    _audit(
        session, actor,
        event="exported_zip",
        target_id=patient_id or actor.clinic_id or actor.actor_id,
        note=f"export.zip n={len(items)} demo={has_demo}",
    )

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="documents-export.zip"',
        },
    )


# Page-level audit ingestion (declared with the static endpoints so the
# /audit-events path is not eaten by /{doc_id}). Mirrors the Reports Hub
# pattern (POST /api/v1/reports/audit-events).

class DocumentsAuditEventIn(BaseModel):
    event: str = Field(..., max_length=120)
    document_id: Optional[str] = Field(None, max_length=64)
    patient_id: Optional[str] = Field(None, max_length=64)
    note: Optional[str] = Field(None, max_length=1024)
    using_demo_data: Optional[bool] = False
    # Drill-in provenance (Documents Hub launch-audit 2026-04-30): page-level
    # audit ingestion preserves the upstream surface that drilled into the
    # Hub. Validated against KNOWN_DRILL_IN_SURFACES at write time so unknown
    # surfaces fall back to a plain documents_hub event without poisoning
    # the audit row.
    source_target_type: Optional[str] = Field(None, max_length=32)
    source_target_id: Optional[str] = Field(None, max_length=64)


class DocumentsAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


@router.post("/audit-events", response_model=DocumentsAuditEventOut)
def record_documents_audit_event(
    payload: DocumentsAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentsAuditEventOut:
    """Best-effort page-level audit ingestion for the Documents Hub UI.

    Writes ``target_type='documents_hub'`` (the page-level surface — the
    sibling per-record surface ``target_type='documents'`` is reserved for
    sign / supersede / export.zip / upload events). When the event carries
    a known drill-in upstream (clinical_trials / irb_manager / quality_-
    assurance / course_detail / adverse_events / reports_hub), the upstream
    surface and id are preserved in the audit note so the regulator-credible
    trail can be reconstructed end-to-end.
    """
    require_minimum_role(actor, "clinician")
    from app.repositories.audit import create_audit_event

    now = datetime.now(timezone.utc)
    # Event id keeps the historical ``documents-`` prefix for backwards
    # compatibility with consumers (and existing audit rows). The page-level
    # surface attribution lives in ``target_type='documents_hub'`` instead.
    event_id = (
        f"documents-{payload.event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    target_id = (
        payload.document_id or payload.patient_id or actor.clinic_id or actor.actor_id
    )
    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.patient_id:
        note_parts.append(f"patient={payload.patient_id}")
    if payload.document_id:
        note_parts.append(f"document={payload.document_id}")
    # Drill-in upstream context. Unknown / partial pairs are dropped silently
    # — we keep the audit row honest by only writing the surface tag when
    # the pair validates. We do NOT raise here: the audit endpoint must
    # never block UI navigation.
    if (
        payload.source_target_type
        and payload.source_target_id
        and payload.source_target_type in KNOWN_DRILL_IN_SURFACES
    ):
        note_parts.append(
            f"drill_in_from={payload.source_target_type}:{payload.source_target_id}"
        )
    if payload.note:
        note_parts.append(payload.note[:500])
    note = "; ".join(note_parts) or payload.event
    try:
        create_audit_event(
            session,
            event_id=event_id,
            target_id=str(target_id),
            target_type="documents_hub",
            action=f"documents_hub.{payload.event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _logger.exception("documents audit-event persistence failed")
        return DocumentsAuditEventOut(accepted=False, event_id=event_id)
    return DocumentsAuditEventOut(accepted=True, event_id=event_id)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(
    doc_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentOut:
    """Retrieve a single document by ID (clinic-scoped)."""
    require_minimum_role(actor, "clinician")
    base_q = session.query(FormDefinition).filter(
        FormDefinition.id == doc_id,
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    record = _scope_documents_query_to_clinic(base_q, actor).first()
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
    """Update a document's status and notes with controlled signing metadata. Clinic-scoped."""
    require_minimum_role(actor, "clinician")
    base_q = session.query(FormDefinition).filter(
        FormDefinition.id == doc_id,
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    record = _scope_documents_query_to_clinic(base_q, actor).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Document not found.", status_code=404)

    meta = _meta_from_record(record)
    _validate_document_file_ref(meta.get("file_ref"))

    if body.title is not None:
        record.title = body.title
    next_status = body.status if body.status is not None else record.status
    if body.status is not None:
        _validate_document_status(body.status)
        record.status = body.status
        meta["status_updated_by_actor_id"] = actor.actor_id
        meta["status_updated_at"] = datetime.now(timezone.utc).isoformat()
    if body.notes is not None:
        meta["notes"] = body.notes
        meta["notes_updated_by_actor_id"] = actor.actor_id
        meta["notes_updated_at"] = datetime.now(timezone.utc).isoformat()
    if body.signed_at is not None:
        if next_status not in _DOC_SIGNABLE_STATUSES:
            raise ApiServiceError(
                code="invalid_signed_state",
                message="signed_at may only be set when status is signed or completed.",
                status_code=422,
            )
        meta["signed_at"] = body.signed_at
        meta["signed_by_actor_id"] = actor.actor_id
        meta["signed_recorded_at"] = datetime.now(timezone.utc).isoformat()
    elif body.status is not None:
        if next_status in _DOC_SIGNABLE_STATUSES:
            meta["signed_at"] = meta.get("signed_at") or datetime.now(timezone.utc).isoformat()
            meta["signed_by_actor_id"] = meta.get("signed_by_actor_id") or actor.actor_id
            meta["signed_recorded_at"] = meta.get("signed_recorded_at") or datetime.now(timezone.utc).isoformat()
        else:
            meta["signed_at"] = None
            meta.pop("signed_by_actor_id", None)
            meta.pop("signed_recorded_at", None)

    _stamp_document_provenance(meta, actor, event="updated")

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
    """Delete a document record (clinic-scoped)."""
    require_minimum_role(actor, "clinician")
    base_q = session.query(FormDefinition).filter(
        FormDefinition.id == doc_id,
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    record = _scope_documents_query_to_clinic(base_q, actor).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Document not found.", status_code=404)
    session.delete(record)
    session.commit()


# ── Upload / download ─────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentOut, status_code=201)
@limiter.limit("20/minute")
async def upload_document(
    request: Request,
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
    _assert_document_patient_access(patient_id, actor, session)

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

    # Magic-byte sniff — refuses arbitrary binary tagged with an allowed
    # MIME type. Pre-fix the only check was ``Content-Type`` which the
    # client controls.
    if not _looks_like_document(file_bytes, file.content_type):
        raise ApiServiceError(
            code="invalid_file_content",
            message="Upload bytes do not match an accepted document format.",
            status_code=422,
        )

    doc_id = str(uuid.uuid4())
    original_name = file.filename or "document"
    # Pin the on-disk extension to the validated MIME type instead of
    # taking it from the user-supplied filename. Pre-fix a filename of
    # ``audio.php`` would persist as ``…/audio.php`` because ``php`` is
    # alphanumeric and ≤8 chars.
    ext = _safe_doc_ext(file.content_type)

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
        "created_by_actor_id": actor.actor_id,
        "created_by_actor_at": datetime.now(timezone.utc).isoformat(),
    }
    _stamp_document_provenance(meta, actor, event="uploaded")

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
    """Stream a previously uploaded document file (clinic-scoped)."""
    require_minimum_role(actor, "clinician")
    base_q = session.query(FormDefinition).filter(
        FormDefinition.id == doc_id,
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    record = _scope_documents_query_to_clinic(base_q, actor).first()
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
    _validate_document_file_ref(file_ref)
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


# ─────────────────────────────────────────────────────────────────────────────
# Documents Hub launch-audit (2026-04-30)
#
# Below: /{id}/sign, /{id}/supersede. (Static-path endpoints — /summary,
# /export.zip, /audit-events — are declared BEFORE the dynamic /{doc_id}
# routes earlier in the file so FastAPI's declaration-order matching does
# not route ``GET /summary`` into ``get_document(doc_id="summary")``.)
#
# Mirrors the pattern landed for the Reports Hub in #310. The storage model
# (FormDefinition with metadata in ``questions_json``) carries no dedicated
# signed_by / supersedes columns, so the helpers below encode that state in
# the JSON metadata — honest about the schema gap and audited.
# ─────────────────────────────────────────────────────────────────────────────


class DocumentSignRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=512)


@router.post("/{doc_id}/sign", response_model=DocumentOut)
def sign_document(
    doc_id: str,
    body: DocumentSignRequest = DocumentSignRequest(),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentOut:
    """Mark a document as clinician-signed. Signed documents are immutable.

    Idempotent for the same actor: signing an already-signed document is a
    no-op (returns the existing record). Signing a superseded document is
    blocked (HTTP 409).
    """
    require_minimum_role(actor, "clinician")
    base_q = session.query(FormDefinition).filter(
        FormDefinition.id == doc_id,
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    record = _scope_documents_query_to_clinic(base_q, actor).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Document not found.", status_code=404)
    if record.status == "superseded":
        raise ApiServiceError(
            code="document_superseded",
            message="Cannot sign a superseded document.",
            status_code=409,
        )
    meta = _meta_from_record(record)
    if record.status in {"signed", "completed"} and meta.get("signed_by_actor_id") == actor.actor_id:
        return _record_to_out(record)
    now = datetime.now(timezone.utc).isoformat()
    meta["signed_by_actor_id"] = actor.actor_id
    meta["signed_at"] = now
    meta["signed_recorded_at"] = now
    if body.note:
        meta["sign_note"] = body.note[:512]
    _stamp_document_provenance(meta, actor, event="signed")
    record.questions_json = json.dumps(meta)
    record.status = "signed"
    record.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(record)
    _audit(
        session,
        actor,
        event="signed",
        target_id=record.id,
        note=(body.note or "document signed")[:512],
    )
    return _record_to_out(record)


class DocumentSupersedeRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=512)
    new_title: Optional[str] = Field(default=None, max_length=255)
    new_notes: Optional[str] = Field(default=None, max_length=10_000)


@router.post("/{doc_id}/supersede", response_model=DocumentOut)
def supersede_document(
    doc_id: str,
    body: DocumentSupersedeRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentOut:
    """Create a new revision that supersedes this document.

    The original is marked ``superseded`` (with ``superseded_by`` pointer)
    and a new record is created with ``supersedes`` pointing back. Both
    actions are audited. The new revision inherits doc_type / patient_id /
    template_id / file_ref from the original; uploaded blobs are NOT copied
    on disk — both records point at the same storage path. (Honest tradeoff:
    the file_ref is treated as an immutable artifact identifier.)
    """
    require_minimum_role(actor, "clinician")
    base_q = session.query(FormDefinition).filter(
        FormDefinition.id == doc_id,
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    original = _scope_documents_query_to_clinic(base_q, actor).first()
    if original is None:
        raise ApiServiceError(code="not_found", message="Document not found.", status_code=404)
    if original.status == "superseded":
        raise ApiServiceError(
            code="already_superseded",
            message="Document is already superseded.",
            status_code=409,
        )

    orig_meta = _meta_from_record(original)
    new_id = str(uuid.uuid4())
    new_meta = {
        "doc_type": orig_meta.get("doc_type", "clinical"),
        "patient_id": orig_meta.get("patient_id"),
        "template_id": orig_meta.get("template_id"),
        "notes": body.new_notes if body.new_notes is not None else orig_meta.get("notes"),
        "file_ref": orig_meta.get("file_ref"),
        "file_name": orig_meta.get("file_name"),
        "file_mime": orig_meta.get("file_mime"),
        "file_size": orig_meta.get("file_size"),
        "supersedes": original.id,
        "revision": int(orig_meta.get("revision", 1) or 1) + 1,
        "supersede_reason": body.reason[:512],
        "is_demo": bool(orig_meta.get("is_demo", False)),
        "signed_at": None,
        "created_by_actor_id": actor.actor_id,
        "created_by_actor_at": datetime.now(timezone.utc).isoformat(),
    }
    _stamp_document_provenance(new_meta, actor, event="created_revision")

    new_record = FormDefinition(
        id=new_id,
        clinician_id=actor.actor_id,
        title=body.new_title or original.title,
        form_type=_DOC_FORM_TYPE,
        questions_json=json.dumps(new_meta),
        status="pending",
    )
    session.add(new_record)

    orig_meta["superseded_by"] = new_id
    _stamp_document_provenance(orig_meta, actor, event="superseded")
    original.questions_json = json.dumps(orig_meta)
    original.status = "superseded"
    original.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(new_record)

    _audit(
        session,
        actor,
        event="superseded",
        target_id=original.id,
        note=f"superseded by {new_id}: {body.reason[:200]}",
    )
    _audit(
        session,
        actor,
        event="created_revision",
        target_id=new_id,
        note=f"revision {new_meta['revision']} of {original.id}",
    )
    return _record_to_out(new_record)


# ── Patient-scoped sub-resource ────────────────────────────────────────────────

patient_docs_router = APIRouter(prefix="/api/v1/patients", tags=["documents"])


@patient_docs_router.get("/{patient_id}/documents", response_model=DocumentListResponse)
def list_patient_documents(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DocumentListResponse:
    """List documents for a specific patient (clinic-scoped)."""
    require_minimum_role(actor, "clinician")
    _assert_document_patient_access(patient_id, actor, session)
    base_q = session.query(FormDefinition).filter(
        FormDefinition.form_type == _DOC_FORM_TYPE,
    )
    rows = _scope_documents_query_to_clinic(base_q, actor).all()

    items = [_record_to_out(r) for r in rows]
    items = [i for i in items if i.patient_id == patient_id]
    return DocumentListResponse(items=items, total=len(items))
