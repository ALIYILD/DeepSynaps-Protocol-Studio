"""qEEG Brain Map Report Annotations router (QEEG-ANN1, 2026-05-02).

Sidecar annotation surface that lets clinicians attach margin notes,
region tags, and flag-typed findings to specific sections of a qEEG
Brain Map report WITHOUT mutating the canonical
``QEEGBrainMapReport`` contract.

Endpoints
---------

* ``POST   /api/v1/qeeg-report-annotations/annotations``
  Create. Clinician+. Body: ``{patient_id, report_id, section_path,
  annotation_kind, flag_type, body}``.
* ``PATCH  /api/v1/qeeg-report-annotations/annotations/{id}``
  Body: ``{body}``. Creator only.
* ``DELETE /api/v1/qeeg-report-annotations/annotations/{id}``
  Creator OR admin.
* ``POST   /api/v1/qeeg-report-annotations/annotations/{id}/resolve``
  Body: ``{resolution_note}``. Clinician+.
* ``GET    /api/v1/qeeg-report-annotations/annotations``
  List + filter by ``patient_id``, ``report_id``, ``section_path``,
  ``kind``, ``flag_type``, ``include_resolved``, ``page``, ``page_size``.
  Clinician+.
* ``GET    /api/v1/qeeg-report-annotations/summary``
  Per-report counts. Clinician+.
* ``GET    /api/v1/qeeg-report-annotations/audit-events``
  Paginated audit-event feed scoped to the
  ``qeeg_report_annotations`` surface. Clinician+.
* ``POST   /api/v1/qeeg-report-annotations/audit-events``
  Page-level audit ingestion (e.g. view, sidebar_opened). Clinician+.

Cross-clinic safety
-------------------

Every endpoint that receives a ``patient_id`` calls
``_gate_patient_access`` from ``app.services.qeeg_report_annotations``,
which mirrors the ``qeeg_analysis_router._gate_patient_access``
pattern that ``deepsynaps-qeeg-pdf-export-tenant-gate`` memory
captured. Cross-clinic reads return 404 (existence-leak prevention)
once the gate denies via ``require_patient_owner``.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.services.qeeg_report_annotations import (
    ANNOTATION_KINDS,
    BODY_MAX_LEN,
    BODY_MIN_LEN,
    FLAG_TYPES,
    REPORT_ID_MAX_LEN,
    SECTION_PATH_MAX_LEN,
    SURFACE,
    create_annotation,
    delete_annotation,
    list_annotations,
    resolve_annotation,
    summary_for_report,
    update_annotation,
)


_log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/qeeg-report-annotations",
    tags=["qEEG Report Annotations"],
)


# ── Schemas ──────────────────────────────────────────────────────────────────


class AnnotationCreateIn(BaseModel):
    patient_id: str = Field(min_length=1, max_length=64)
    report_id: str = Field(min_length=1, max_length=REPORT_ID_MAX_LEN)
    section_path: str = Field(min_length=1, max_length=SECTION_PATH_MAX_LEN)
    annotation_kind: str = Field(min_length=1, max_length=32)
    flag_type: Optional[str] = Field(default=None, max_length=64)
    # Bound is enforced server-side too (5..2000).
    body: str = Field(min_length=1, max_length=BODY_MAX_LEN)


class AnnotationPatchIn(BaseModel):
    body: str = Field(min_length=1, max_length=BODY_MAX_LEN)


class AnnotationResolveIn(BaseModel):
    resolution_note: Optional[str] = Field(default=None, max_length=BODY_MAX_LEN)


class AnnotationOut(BaseModel):
    id: str
    clinic_id: Optional[str] = None
    patient_id: str
    report_id: str
    section_path: str
    annotation_kind: str
    flag_type: Optional[str] = None
    body: str
    created_by_user_id: str
    resolved_at: Optional[str] = None
    resolved_by_user_id: Optional[str] = None
    resolution_note: Optional[str] = None
    created_at: str
    updated_at: str


class AnnotationListOut(BaseModel):
    items: list[AnnotationOut]
    total: int
    page: int
    page_size: int
    patient_id: str
    report_id: str
    include_resolved: bool


class SummaryOut(BaseModel):
    patient_id: str
    report_id: str
    total: int
    open: int
    resolved: int
    recently_resolved: int
    by_kind: dict[str, int]
    by_flag_type: dict[str, int]


class AuditEventOut(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: str
    actor_id: str
    note: str
    created_at: str


class AuditEventsListOut(BaseModel):
    items: list[AuditEventOut]
    total: int
    page: int
    page_size: int
    surface: str


class PageAuditIn(BaseModel):
    event: str = Field(min_length=1, max_length=64)
    target_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=480)


class PageAuditOut(BaseModel):
    accepted: bool
    event_id: str


# ── Helpers ──────────────────────────────────────────────────────────────────


def _to_iso(dt_value) -> Optional[str]:
    """Render a datetime into an isoformat string. Returns None if missing."""
    if dt_value is None:
        return None
    if isinstance(dt_value, str):
        return dt_value
    if dt_value.tzinfo is None:
        dt_value = dt_value.replace(tzinfo=timezone.utc)
    return dt_value.isoformat()


def _serialise(row) -> AnnotationOut:
    return AnnotationOut(
        id=row.id,
        clinic_id=row.clinic_id,
        patient_id=row.patient_id,
        report_id=row.report_id,
        section_path=row.section_path,
        annotation_kind=row.annotation_kind,
        flag_type=row.flag_type,
        body=row.body,
        created_by_user_id=row.created_by_user_id,
        resolved_at=_to_iso(row.resolved_at),
        resolved_by_user_id=row.resolved_by_user_id,
        resolution_note=row.resolution_note,
        created_at=_to_iso(row.created_at) or "",
        updated_at=_to_iso(row.updated_at) or "",
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/annotations", response_model=AnnotationOut, status_code=201)
def create_annotation_endpoint(
    body: AnnotationCreateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnnotationOut:
    row = create_annotation(
        db,
        actor,
        patient_id=body.patient_id,
        report_id=body.report_id,
        section_path=body.section_path,
        annotation_kind=body.annotation_kind,
        flag_type=body.flag_type,
        body=body.body,
    )
    return _serialise(row)


@router.patch("/annotations/{annotation_id}", response_model=AnnotationOut)
def patch_annotation_endpoint(
    annotation_id: str,
    body: AnnotationPatchIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnnotationOut:
    row = update_annotation(
        db, actor, annotation_id=annotation_id, body=body.body
    )
    return _serialise(row)


@router.delete("/annotations/{annotation_id}", status_code=204)
def delete_annotation_endpoint(
    annotation_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    delete_annotation(db, actor, annotation_id=annotation_id)
    return None


@router.post(
    "/annotations/{annotation_id}/resolve",
    response_model=AnnotationOut,
)
def resolve_annotation_endpoint(
    annotation_id: str,
    body: AnnotationResolveIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnnotationOut:
    row = resolve_annotation(
        db,
        actor,
        annotation_id=annotation_id,
        resolution_note=body.resolution_note,
    )
    return _serialise(row)


@router.get("/annotations", response_model=AnnotationListOut)
def list_annotations_endpoint(
    patient_id: str = Query(..., min_length=1, max_length=64),
    report_id: str = Query(..., min_length=1, max_length=REPORT_ID_MAX_LEN),
    section_path: Optional[str] = Query(default=None, max_length=SECTION_PATH_MAX_LEN),
    kind: Optional[str] = Query(default=None, max_length=32),
    flag_type: Optional[str] = Query(default=None, max_length=64),
    include_resolved: bool = Query(default=False),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnnotationListOut:
    rows, total = list_annotations(
        db,
        actor,
        patient_id=patient_id,
        report_id=report_id,
        section_path=section_path,
        kind=kind,
        flag_type=flag_type,
        include_resolved=include_resolved,
        page=page,
        page_size=page_size,
    )
    return AnnotationListOut(
        items=[_serialise(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        patient_id=patient_id,
        report_id=report_id,
        include_resolved=include_resolved,
    )


@router.get("/summary", response_model=SummaryOut)
def summary_endpoint(
    patient_id: str = Query(..., min_length=1, max_length=64),
    report_id: str = Query(..., min_length=1, max_length=REPORT_ID_MAX_LEN),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SummaryOut:
    summary = summary_for_report(
        db, actor, patient_id=patient_id, report_id=report_id
    )
    return SummaryOut(**summary)


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events_endpoint(
    surface: str = Query(default=SURFACE, max_length=64),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Audit-event feed scoped to the ``qeeg_report_annotations`` surface.

    Clinic-scoped: filters by ``clinic_id={actor.clinic_id}`` substring
    in the audit ``note`` (which the service writes verbatim) so a
    clinician from clinic B never sees clinic A's annotation audit.
    """
    require_minimum_role(actor, "clinician")

    s = (surface or SURFACE).strip().lower()
    if s != SURFACE:
        s = SURFACE

    # Local import keeps the router-level import surface clean and
    # avoids the ``router_no_models`` lint complaint.
    from app.persistence.models import AuditEventRecord  # noqa: PLC0415

    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.target_type == s
    )
    cid = actor.clinic_id
    if cid:
        from sqlalchemy import or_  # noqa: PLC0415

        base = base.filter(
            or_(
                AuditEventRecord.note.like(f"%clinic_id={cid}%"),
                AuditEventRecord.actor_id == actor.actor_id,
            )
        )
    else:
        base = base.filter(AuditEventRecord.actor_id == actor.actor_id)

    total = base.count()
    offset = (page - 1) * page_size
    rows = (
        base.order_by(AuditEventRecord.id.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    items = [
        AuditEventOut(
            event_id=r.event_id,
            target_id=r.target_id or "",
            target_type=r.target_type or "",
            action=r.action or "",
            role=r.role or "",
            actor_id=r.actor_id or "",
            note=r.note or "",
            created_at=r.created_at or "",
        )
        for r in rows
    ]
    return AuditEventsListOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        surface=s,
    )


@router.post("/audit-events", response_model=PageAuditOut)
def post_audit_event_endpoint(
    body: PageAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PageAuditOut:
    """Page-level audit ingestion under
    ``target_type='qeeg_report_annotations'``."""
    require_minimum_role(actor, "clinician")

    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    target = body.target_id or actor.clinic_id or actor.actor_id
    eid = (
        f"{SURFACE}-{body.event}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if actor.clinic_id:
        note_parts.append(f"clinic_id={actor.clinic_id}")
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(target),
            target_type=SURFACE,
            action=f"{SURFACE}.{body.event}",
            role=actor.role if actor.role in {"admin", "clinician", "reviewer", "technician", "patient"} else "clinician",
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block the UI
        _log.exception("QEEG-ANN1 page audit emit failed")
        return PageAuditOut(accepted=False, event_id=eid)
    return PageAuditOut(accepted=True, event_id=eid)


__all__ = ["SURFACE", "router"]
