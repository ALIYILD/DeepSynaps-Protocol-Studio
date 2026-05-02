"""qEEG Brain Map Report Annotations service (QEEG-ANN1, 2026-05-02).

Sidecar annotation system for the canonical
``QEEGBrainMapReport`` contract (see
``apps/api/app/services/qeeg_report_template.py``). The service
enforces:

* Cross-clinic IDOR safety via ``_gate_patient_access`` on every
  patient-data path (per ``deepsynaps-qeeg-pdf-export-tenant-gate``
  memory).
* Body validation (5..2000 chars).
* ``annotation_kind`` whitelist (``margin_note`` | ``region_tag`` |
  ``flag``).
* ``flag_type`` whitelist (``clinically_significant`` |
  ``evidence_gap`` | ``discuss_next_session`` |
  ``patient_question``); required when kind=flag, forced to None
  otherwise.
* ``section_path`` charset whitelist
  (``[A-Za-z0-9._\\-\\[\\]]``) so future eval-style consumers
  cannot be hijacked by shell-meta or path-traversal sequences.
* Audit emit on every mutation (``create`` / ``update`` / ``delete``
  / ``resolve``) under target_type ``qeeg_report_annotations``.

Public surface (consumed by the router):

* :func:`create_annotation`
* :func:`update_annotation` (creator only)
* :func:`delete_annotation` (creator or admin)
* :func:`resolve_annotation`
* :func:`list_annotations`
* :func:`summary_for_report`
* :func:`get_annotation`

All functions raise ``ApiServiceError`` with stable codes so the
router layer stays thin.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    require_minimum_role,
    require_patient_owner,
)
from app.errors import ApiServiceError
from app.persistence.models import QEEGReportAnnotation
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id


_log = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

SURFACE = "qeeg_report_annotations"

ANNOTATION_KINDS = frozenset({"margin_note", "region_tag", "flag"})
FLAG_TYPES = frozenset(
    {
        "clinically_significant",
        "evidence_gap",
        "discuss_next_session",
        "patient_question",
    }
)

BODY_MIN_LEN = 5
BODY_MAX_LEN = 2000
SECTION_PATH_MAX_LEN = 256
REPORT_ID_MAX_LEN = 128

# section_path is a dotted-key reference (e.g. "summary.brain_age",
# "regions.frontal_left.alpha", "protocol_suggestions[2].rationale").
# Charset is intentionally narrow: alpha, digit, dot, hyphen,
# underscore, square brackets. Anything else is rejected so future
# eval-style consumers cannot be tripped by shell-meta or path
# traversal payloads.
_SECTION_PATH_RE = re.compile(r"^[A-Za-z0-9._\-\[\]]+$")


# ── Tz coercion helper (per deepsynaps-sqlite-tz-naive memory) ───────────────


def _coerce_utc(dt_value: Optional[datetime]) -> Optional[datetime]:
    """Coerce a possibly-naive ``datetime`` to tz-aware UTC.

    SQLite strips tzinfo on roundtrip, so any datetime read back from
    the DB needs explicit re-tagging before it is compared to
    ``datetime.now(timezone.utc)``. New writes go through ``utcnow_aware()``.
    """
    if dt_value is None:
        return None
    if dt_value.tzinfo is None:
        return dt_value.replace(tzinfo=timezone.utc)
    return dt_value


def _utcnow_aware() -> datetime:
    return datetime.now(timezone.utc)


# ── Patient gate (mirrors qeeg_analysis_router pattern) ──────────────────────


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str, db: Session
) -> None:
    """Cross-clinic ownership gate. Existing patients only.

    Mirrors ``qeeg_analysis_router._gate_patient_access`` so the
    QEEG-ANN1 surface inherits the same IDOR safety contract that
    ``deepsynaps-qeeg-pdf-export-tenant-gate`` memory captured. For
    non-existent patient_ids the gate is a no-op (synthetic / demo
    flows) — but the calling router treats the missing row as a 404
    via the standard not-found path.
    """
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


# ── Validation helpers ───────────────────────────────────────────────────────


def _validate_body(body: str) -> str:
    if not isinstance(body, str):
        raise ApiServiceError(
            code="annotation_body_invalid",
            message="Annotation body must be a string.",
            status_code=422,
        )
    body = body.strip()
    if len(body) < BODY_MIN_LEN:
        raise ApiServiceError(
            code="annotation_body_too_short",
            message=f"Annotation body must be at least {BODY_MIN_LEN} characters.",
            status_code=422,
        )
    if len(body) > BODY_MAX_LEN:
        raise ApiServiceError(
            code="annotation_body_too_long",
            message=f"Annotation body must be at most {BODY_MAX_LEN} characters.",
            status_code=422,
        )
    return body


def _validate_section_path(section_path: str) -> str:
    if not isinstance(section_path, str):
        raise ApiServiceError(
            code="annotation_section_path_invalid",
            message="section_path must be a string.",
            status_code=422,
        )
    sp = section_path.strip()
    if not sp:
        raise ApiServiceError(
            code="annotation_section_path_empty",
            message="section_path is required.",
            status_code=422,
        )
    if len(sp) > SECTION_PATH_MAX_LEN:
        raise ApiServiceError(
            code="annotation_section_path_too_long",
            message=(
                f"section_path must be at most {SECTION_PATH_MAX_LEN} characters."
            ),
            status_code=422,
        )
    if not _SECTION_PATH_RE.match(sp):
        raise ApiServiceError(
            code="annotation_section_path_charset",
            message=(
                "section_path may only contain alphanumerics, dot, "
                "underscore, hyphen, and square brackets."
            ),
            status_code=422,
        )
    return sp


def _validate_kind_and_flag(
    annotation_kind: str, flag_type: Optional[str]
) -> tuple[str, Optional[str]]:
    if annotation_kind not in ANNOTATION_KINDS:
        raise ApiServiceError(
            code="annotation_kind_invalid",
            message=(
                f"annotation_kind must be one of {sorted(ANNOTATION_KINDS)!r}."
            ),
            status_code=422,
        )
    if annotation_kind == "flag":
        if not flag_type:
            raise ApiServiceError(
                code="annotation_flag_type_required",
                message="flag_type is required when annotation_kind is 'flag'.",
                status_code=422,
            )
        if flag_type not in FLAG_TYPES:
            raise ApiServiceError(
                code="annotation_flag_type_invalid",
                message=f"flag_type must be one of {sorted(FLAG_TYPES)!r}.",
                status_code=422,
            )
        return annotation_kind, flag_type
    # Non-flag kinds drop any user-supplied flag_type silently — the
    # router-side schema accepts the field for ergonomic reasons but
    # the persisted row stays clean.
    return annotation_kind, None


def _validate_report_id(report_id: str) -> str:
    if not isinstance(report_id, str):
        raise ApiServiceError(
            code="annotation_report_id_invalid",
            message="report_id must be a string.",
            status_code=422,
        )
    rid = report_id.strip()
    if not rid:
        raise ApiServiceError(
            code="annotation_report_id_empty",
            message="report_id is required.",
            status_code=422,
        )
    if len(rid) > REPORT_ID_MAX_LEN:
        raise ApiServiceError(
            code="annotation_report_id_too_long",
            message=(
                f"report_id must be at most {REPORT_ID_MAX_LEN} characters."
            ),
            status_code=422,
        )
    return rid


# ── Audit emit ───────────────────────────────────────────────────────────────


def _emit_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    action: str,
    annotation: QEEGReportAnnotation,
    extra: str = "",
) -> str:
    now = _utcnow_aware()
    eid = (
        f"{SURFACE}-{action}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    flag_part = annotation.flag_type or "none"
    note = (
        f"clinic_id={annotation.clinic_id or 'none'} "
        f"patient_id={annotation.patient_id} "
        f"report_id={annotation.report_id} "
        f"kind={annotation.annotation_kind} "
        f"flag={flag_part} "
        f"actor_id={actor.actor_id}"
    )
    if extra:
        note = f"{note} {extra}"
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=annotation.id,
            target_type=SURFACE,
            action=f"qeeg.annotation_{action}",
            role=actor.role if actor.role in {"admin", "clinician", "reviewer", "technician", "patient"} else "clinician",
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block writes
        _log.exception("QEEG-ANN1 audit emit failed")
    return eid


# ── Public surface ───────────────────────────────────────────────────────────


def get_annotation(db: Session, annotation_id: str) -> Optional[QEEGReportAnnotation]:
    return db.query(QEEGReportAnnotation).filter_by(id=annotation_id).first()


def create_annotation(
    db: Session,
    actor: AuthenticatedActor,
    *,
    patient_id: str,
    report_id: str,
    section_path: str,
    annotation_kind: str,
    flag_type: Optional[str],
    body: str,
) -> QEEGReportAnnotation:
    """Create a new annotation pinned to a Brain Map report section."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rid = _validate_report_id(report_id)
    sp = _validate_section_path(section_path)
    kind, flag = _validate_kind_and_flag(annotation_kind, flag_type)
    body_clean = _validate_body(body)

    # Derive the resident clinic from the patient (defensive — actor
    # clinic could legitimately differ for admins).
    _exists, patient_clinic_id = resolve_patient_clinic_id(db, patient_id)
    clinic_id = patient_clinic_id or actor.clinic_id

    now = _utcnow_aware()
    row = QEEGReportAnnotation(
        id=str(uuid.uuid4()),
        clinic_id=clinic_id,
        patient_id=patient_id,
        report_id=rid,
        section_path=sp,
        annotation_kind=kind,
        flag_type=flag,
        body=body_clean,
        created_by_user_id=actor.actor_id,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    _emit_audit(db, actor, action="created", annotation=row)
    return row


def update_annotation(
    db: Session,
    actor: AuthenticatedActor,
    *,
    annotation_id: str,
    body: str,
) -> QEEGReportAnnotation:
    """Update an annotation body. Only the original creator may patch."""
    require_minimum_role(actor, "clinician")

    row = get_annotation(db, annotation_id)
    if row is None:
        raise ApiServiceError(
            code="annotation_not_found",
            message="Annotation not found.",
            status_code=404,
        )
    # Cross-clinic gate first — a clinician from another clinic must
    # see 404 (not 403) so we don't leak existence.
    _gate_patient_access(actor, row.patient_id, db)

    if row.created_by_user_id != actor.actor_id:
        raise ApiServiceError(
            code="annotation_forbidden_update",
            message="Only the annotation creator may update it.",
            status_code=403,
        )

    body_clean = _validate_body(body)
    row.body = body_clean
    row.updated_at = _utcnow_aware()
    db.commit()
    db.refresh(row)

    _emit_audit(db, actor, action="updated", annotation=row)
    return row


def delete_annotation(
    db: Session,
    actor: AuthenticatedActor,
    *,
    annotation_id: str,
) -> None:
    """Hard-delete an annotation. Creator OR admin only.

    Audit row is emitted BEFORE the delete commit so the audit trail
    survives the row removal.
    """
    require_minimum_role(actor, "clinician")

    row = get_annotation(db, annotation_id)
    if row is None:
        raise ApiServiceError(
            code="annotation_not_found",
            message="Annotation not found.",
            status_code=404,
        )
    _gate_patient_access(actor, row.patient_id, db)

    if row.created_by_user_id != actor.actor_id and actor.role != "admin":
        raise ApiServiceError(
            code="annotation_forbidden_delete",
            message="Only the creator or an admin may delete this annotation.",
            status_code=403,
        )

    _emit_audit(db, actor, action="deleted", annotation=row)

    db.delete(row)
    db.commit()


def resolve_annotation(
    db: Session,
    actor: AuthenticatedActor,
    *,
    annotation_id: str,
    resolution_note: Optional[str],
) -> QEEGReportAnnotation:
    """Mark an annotation resolved. Any clinician+ may resolve."""
    require_minimum_role(actor, "clinician")

    row = get_annotation(db, annotation_id)
    if row is None:
        raise ApiServiceError(
            code="annotation_not_found",
            message="Annotation not found.",
            status_code=404,
        )
    _gate_patient_access(actor, row.patient_id, db)

    note_clean: Optional[str] = None
    if resolution_note is not None:
        if not isinstance(resolution_note, str):
            raise ApiServiceError(
                code="annotation_resolution_note_invalid",
                message="resolution_note must be a string.",
                status_code=422,
            )
        rn = resolution_note.strip()
        if rn and len(rn) > BODY_MAX_LEN:
            raise ApiServiceError(
                code="annotation_resolution_note_too_long",
                message=(
                    f"resolution_note must be at most {BODY_MAX_LEN} characters."
                ),
                status_code=422,
            )
        note_clean = rn or None

    now = _utcnow_aware()
    row.resolved_at = now
    row.resolved_by_user_id = actor.actor_id
    row.resolution_note = note_clean
    row.updated_at = now
    db.commit()
    db.refresh(row)

    _emit_audit(db, actor, action="resolved", annotation=row)
    return row


def list_annotations(
    db: Session,
    actor: AuthenticatedActor,
    *,
    patient_id: str,
    report_id: str,
    section_path: Optional[str] = None,
    kind: Optional[str] = None,
    flag_type: Optional[str] = None,
    include_resolved: bool = False,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[QEEGReportAnnotation], int]:
    """List annotations for a patient + report, newest first."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rid = _validate_report_id(report_id)

    base = db.query(QEEGReportAnnotation).filter(
        QEEGReportAnnotation.patient_id == patient_id,
        QEEGReportAnnotation.report_id == rid,
    )
    if section_path is not None:
        sp = _validate_section_path(section_path)
        base = base.filter(QEEGReportAnnotation.section_path == sp)
    if kind is not None:
        if kind not in ANNOTATION_KINDS:
            raise ApiServiceError(
                code="annotation_kind_invalid",
                message=(
                    f"annotation_kind filter must be one of "
                    f"{sorted(ANNOTATION_KINDS)!r}."
                ),
                status_code=422,
            )
        base = base.filter(QEEGReportAnnotation.annotation_kind == kind)
    if flag_type is not None:
        if flag_type not in FLAG_TYPES:
            raise ApiServiceError(
                code="annotation_flag_type_invalid",
                message=f"flag_type filter must be one of {sorted(FLAG_TYPES)!r}.",
                status_code=422,
            )
        base = base.filter(QEEGReportAnnotation.flag_type == flag_type)
    if not include_resolved:
        base = base.filter(QEEGReportAnnotation.resolved_at.is_(None))

    total = base.count()

    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 1
    if page_size > 200:
        page_size = 200

    offset = (page - 1) * page_size
    rows = (
        base.order_by(
            QEEGReportAnnotation.created_at.desc(),
            QEEGReportAnnotation.id.desc(),
        )
        .offset(offset)
        .limit(page_size)
        .all()
    )
    return rows, total


def summary_for_report(
    db: Session,
    actor: AuthenticatedActor,
    *,
    patient_id: str,
    report_id: str,
) -> dict:
    """Return per-report counts grouped by kind + flag_type."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    rid = _validate_report_id(report_id)

    rows = (
        db.query(QEEGReportAnnotation)
        .filter(
            QEEGReportAnnotation.patient_id == patient_id,
            QEEGReportAnnotation.report_id == rid,
        )
        .all()
    )

    by_kind: dict[str, int] = {k: 0 for k in ANNOTATION_KINDS}
    by_flag: dict[str, int] = {f: 0 for f in FLAG_TYPES}
    open_count = 0
    resolved_count = 0
    recently_resolved = 0
    now = _utcnow_aware()

    for r in rows:
        by_kind[r.annotation_kind] = by_kind.get(r.annotation_kind, 0) + 1
        if r.flag_type:
            by_flag[r.flag_type] = by_flag.get(r.flag_type, 0) + 1
        ra = _coerce_utc(r.resolved_at)
        if ra is None:
            open_count += 1
        else:
            resolved_count += 1
            if (now - ra).days <= 7:
                recently_resolved += 1

    return {
        "patient_id": patient_id,
        "report_id": rid,
        "total": len(rows),
        "open": open_count,
        "resolved": resolved_count,
        "recently_resolved": recently_resolved,
        "by_kind": by_kind,
        "by_flag_type": by_flag,
    }


__all__ = [
    "ANNOTATION_KINDS",
    "BODY_MAX_LEN",
    "BODY_MIN_LEN",
    "FLAG_TYPES",
    "REPORT_ID_MAX_LEN",
    "SECTION_PATH_MAX_LEN",
    "SURFACE",
    "create_annotation",
    "delete_annotation",
    "get_annotation",
    "list_annotations",
    "resolve_annotation",
    "summary_for_report",
    "update_annotation",
]
