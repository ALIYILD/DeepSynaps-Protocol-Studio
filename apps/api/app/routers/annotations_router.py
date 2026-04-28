"""Annotations router — CONTRACT_V3 §3 pin-to-finding.

Endpoints
---------
POST    /api/v1/annotations                              Create an annotation.
GET     /api/v1/annotations?analysis_id=&analysis_type=  List non-deleted annotations.
PATCH   /api/v1/annotations/{id}                         Update (author or admin only).
DELETE  /api/v1/annotations/{id}                         Soft-delete (author or admin only).

Role gating
-----------
Create / list / patch: ``clinician`` or higher. Delete: author-only or
``admin`` role. Patient role is explicitly 403 — patient users read
their own simplified summary via ``patient_summary_router``.

The annotations themselves are NOT LLM-generated text, so the
banned-word sanitiser is not applied. XSS escaping happens at render
time on the frontend (see ``annotations-drawer.js``).
"""
from __future__ import annotations

import json
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
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import MriAnalysis, QEEGAnalysis
from app.repositories.patients import resolve_patient_clinic_id


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str | None, db: Session) -> None:
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/annotations", tags=["annotations"])


_VALID_ANALYSIS_TYPES = {"qeeg", "mri"}
_VALID_TARGET_KINDS = {
    "target",
    "zscore_cell",
    "roi",
    "finding",
    "section",
    "free",
}
_MAX_TEXT_LEN = 4000
_MAX_TAGS = 10
_MAX_TAG_LEN = 32


# ── Pydantic schemas ─────────────────────────────────────────────────────────


class AnnotationIn(BaseModel):
    analysis_id: str = Field(min_length=1, max_length=36)
    analysis_type: str = Field(pattern=r"^(qeeg|mri)$")
    target_kind: str = Field(min_length=1, max_length=32)
    target_ref: Optional[str] = Field(default=None, max_length=512)
    text: str = Field(min_length=1, max_length=_MAX_TEXT_LEN)
    tags: Optional[list[str]] = Field(default=None)


class AnnotationPatch(BaseModel):
    text: Optional[str] = Field(default=None, max_length=_MAX_TEXT_LEN)
    tags: Optional[list[str]] = Field(default=None)
    resolved: Optional[bool] = None


class AnnotationOut(BaseModel):
    id: str
    analysis_id: str
    analysis_type: str
    author_id: str
    author_name: Optional[str] = None
    target_kind: str
    target_ref: Optional[str] = None
    text: str
    created_at: str
    updated_at: Optional[str] = None
    resolved: bool
    resolved_by: Optional[str] = None
    tags: list[str] = Field(default_factory=list)

    @classmethod
    def from_record(cls, row: Annotation) -> "AnnotationOut":
        """Map an ``Annotation`` ORM row into its API response shape.

        Parameters
        ----------
        row : Annotation
            Persisted annotation row.

        Returns
        -------
        AnnotationOut
        """
        try:
            tags = json.loads(row.tags_json) if row.tags_json else []
            if not isinstance(tags, list):
                tags = []
        except (TypeError, ValueError):
            tags = []
        return cls(
            id=row.id,
            analysis_id=row.analysis_id,
            analysis_type=row.analysis_type,
            author_id=row.author_id,
            author_name=row.author_name,
            target_kind=row.target_kind,
            target_ref=row.target_ref,
            text=row.text,
            created_at=row.created_at.isoformat() if row.created_at else "",
            updated_at=row.updated_at.isoformat() if row.updated_at else None,
            resolved=bool(row.resolved),
            resolved_by=row.resolved_by,
            tags=[str(t) for t in tags][:_MAX_TAGS],
        )


# ── Helpers ──────────────────────────────────────────────────────────────────


def _get_analysis(db: Session, analysis_id: str, analysis_type: str):
    """Return the referenced analysis row or None.

    Parameters
    ----------
    db : Session
    analysis_id : str
    analysis_type : {"qeeg", "mri"}

    Returns
    -------
    QEEGAnalysis | MriAnalysis | None
    """
    if analysis_type == "qeeg":
        return db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if analysis_type == "mri":
        return db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    return None


def _sanitise_tags(tags: Optional[list[str]]) -> list[str]:
    """Coerce + truncate a ``tags`` payload.

    Parameters
    ----------
    tags : list of str, optional

    Returns
    -------
    list of str
        Deduplicated, length-capped, stripped tags (≤ ``_MAX_TAGS``).
    """
    if not tags:
        return []
    clean: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        if not isinstance(raw, str):
            continue
        t = raw.strip()[:_MAX_TAG_LEN]
        if not t or t in seen:
            continue
        seen.add(t)
        clean.append(t)
        if len(clean) >= _MAX_TAGS:
            break
    return clean


def _audit(db: Session, actor: AuthenticatedActor, action: str, ann: Annotation) -> None:
    """Write a best-effort audit row for an annotation mutation.

    Never aborts the caller — audit failures are logged and swallowed.
    """
    try:
        preview = f"{action}:{ann.analysis_type}:{ann.analysis_id}:{ann.target_kind}"
        audit = AiSummaryAudit(
            patient_id=ann.analysis_id[:36],
            actor_id=actor.actor_id,
            actor_role=actor.role,
            summary_type=f"annotation_{action}",
            prompt_hash=None,
            response_preview=preview[:200],
            sources_used=None,
            model_used=None,
        )
        db.add(audit)
        db.commit()
    except Exception as exc:  # pragma: no cover — audit never blocks
        _log.warning("annotation audit failed: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("", response_model=AnnotationOut, status_code=201)
@router.post("/", response_model=AnnotationOut, status_code=201)
@limiter.limit("60/minute")
def create_annotation(
    body: AnnotationIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnnotationOut:
    """Create a new annotation attached to a qEEG or MRI analysis.

    Parameters
    ----------
    body : AnnotationIn
        Payload — must reference an existing analysis row.
    actor : AuthenticatedActor
        Requires role ``clinician`` or higher.

    Returns
    -------
    AnnotationOut
    """
    require_minimum_role(actor, "clinician")

    if body.analysis_type not in _VALID_ANALYSIS_TYPES:
        raise ApiServiceError(
            code="invalid_analysis_type",
            message=f"analysis_type must be one of {_VALID_ANALYSIS_TYPES!r}",
            status_code=422,
        )
    if body.target_kind not in _VALID_TARGET_KINDS:
        raise ApiServiceError(
            code="invalid_target_kind",
            message=f"target_kind must be one of {_VALID_TARGET_KINDS!r}",
            status_code=422,
        )
    analysis = _get_analysis(db, body.analysis_id, body.analysis_type)
    if analysis is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"{body.analysis_type} analysis {body.analysis_id!r} not found",
            status_code=404,
        )
    # FK-stuffing / cross-clinic guard: the analysis must belong to a
    # patient this clinician has access to.
    _gate_patient_access(actor, analysis.patient_id, db)

    tags = _sanitise_tags(body.tags)
    row = Annotation(
        id=str(uuid.uuid4()),
        analysis_id=body.analysis_id,
        analysis_type=body.analysis_type,
        author_id=actor.actor_id,
        author_name=actor.display_name,
        target_kind=body.target_kind,
        target_ref=body.target_ref,
        text=body.text,
        created_at=datetime.now(timezone.utc),
        resolved=False,
        tags_json=json.dumps(tags) if tags else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    _audit(db, actor, "create", row)
    _log.info(
        "annotation created: id=%s analysis=%s:%s target=%s by=%s",
        row.id, row.analysis_type, row.analysis_id, row.target_kind, actor.actor_id,
    )
    return AnnotationOut.from_record(row)


@router.get("", response_model=list[AnnotationOut])
@router.get("/", response_model=list[AnnotationOut])
def list_annotations(
    analysis_id: str = Query(..., min_length=1, max_length=36),
    analysis_type: str = Query(..., pattern=r"^(qeeg|mri)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[AnnotationOut]:
    """List non-deleted annotations for an analysis (newest first).

    Parameters
    ----------
    analysis_id : str
    analysis_type : {"qeeg", "mri"}
    actor : AuthenticatedActor
        Requires role ``clinician`` or higher.

    Returns
    -------
    list of AnnotationOut
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rows = (
        db.query(Annotation)
        .filter(
            Annotation.analysis_id == analysis_id,
            Annotation.analysis_type == analysis_type,
            Annotation.deleted_at.is_(None),
        )
        .order_by(Annotation.created_at.desc())
        .all()
    )
    return [AnnotationOut.from_record(r) for r in rows]


@router.patch("/{annotation_id}", response_model=AnnotationOut)
def patch_annotation(
    annotation_id: str,
    body: AnnotationPatch,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnnotationOut:
    """Update an annotation's text, tags, or resolved flag.

    Only the original author or an admin may patch. Patients and
    non-author clinicians receive a 403.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, body.patient_id, db)

    # FK-stuffing guard: target_id is stored verbatim and surfaces via the
    # list endpoint's target_id query filter. Without this check a clinician
    # could attach an annotation against another clinic's qEEG/MRI analysis
    # under one of their own patients (cross-clinic poisoning of analysis
    # views in same-clinic workflows that filter by target_id).
    if body.target_type == "qeeg":
        target = (
            db.query(QEEGAnalysis).filter(QEEGAnalysis.id == body.target_id).first()
        )
    else:
        target = (
            db.query(MriAnalysis)
            .filter(MriAnalysis.analysis_id == body.target_id)
            .first()
        )
    if target is None or target.patient_id != body.patient_id:
        raise ApiServiceError(
            code="invalid_annotation_target",
            message="target_id does not match the supplied patient_id.",
            status_code=422,
        )

    row = db.query(Annotation).filter_by(id=annotation_id).first()
    if not row or row.deleted_at is not None:
        raise ApiServiceError(
            code="annotation_not_found",
            message="Annotation not found or already deleted",
            status_code=404,
        )
    if row.author_id != actor.actor_id and actor.role != "admin":
        raise ApiServiceError(
            code="forbidden",
            message="Only the author or an admin may modify this annotation.",
            status_code=403,
        )

    if body.text is not None:
        row.text = body.text
    if body.tags is not None:
        tags = _sanitise_tags(body.tags)
        row.tags_json = json.dumps(tags) if tags else None
    if body.resolved is not None:
        row.resolved = bool(body.resolved)
        row.resolved_by = actor.actor_id if body.resolved else None
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)

    _audit(db, actor, "update", row)
    return AnnotationOut.from_record(row)


@router.delete("/{annotation_id}", status_code=204)
def delete_annotation(
    annotation_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    """Soft-delete an annotation (sets ``deleted_at``).

    Only the original author or an admin may delete.
    """
    require_minimum_role(actor, "clinician")

    row = db.query(Annotation).filter_by(id=annotation_id).first()
    if not row or row.deleted_at is not None:
        raise ApiServiceError(
            code="annotation_not_found",
            message="Annotation not found or already deleted",
            status_code=404,
        )
    if row.author_id != actor.actor_id and actor.role != "admin":
        raise ApiServiceError(
            code="forbidden",
            message="Only the author or an admin may delete this annotation.",
            status_code=403,
        )

    row.deleted_at = datetime.now(timezone.utc)
    db.commit()

    _audit(db, actor, "delete", row)
    return None
