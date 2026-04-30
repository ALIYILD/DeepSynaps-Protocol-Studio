"""qEEG records router.

Endpoints
---------
POST  /api/v1/qeeg-records                      Upload / log a qEEG record header
GET   /api/v1/qeeg-records                      List records (filter by patient / course)
GET   /api/v1/qeeg-records/{id}                 Get record detail
PATCH /api/v1/qeeg-records/{id}                 Update summary notes / findings
"""
from __future__ import annotations

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
from app.persistence.models import Patient, QEEGRecord, User
from app.repositories.patients import resolve_patient_clinic_id


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str | None, db: Session
) -> None:
    """Cross-clinic ownership gate — same canonical pattern as every
    other patient-scoped router. Pre-fix this router used
    ``clinician_id == actor.actor_id`` only, which silently allowed a
    clinician in clinic A to create+read qEEG records on patients in
    clinic B because the clinician_id-equality check is satisfied by
    the actor and the cross-clinic patient is never validated.
    """
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)
    else:
        # Orphaned patient row — refuse for everyone except admin so a
        # crafted patient_id (no row exists) cannot become a covert
        # write target.
        if actor.role != "admin":
            raise ApiServiceError(
                code="not_found",
                message="Patient not found.",
                status_code=404,
            )


def _scope_records_query_to_clinic(q, actor: AuthenticatedActor):
    """Restrict a QEEGRecord query to records the actor's clinic owns.

    Replaces the legacy ``clinician_id == actor.actor_id`` filter,
    which over-restricted same-clinic colleagues AND under-restricted
    admins (admins of clinic A saw clinic-B records). Joins
    ``Patient`` -> ``User`` to scope by ``actor.clinic_id`` for non-
    admins; admins are still scoped to their own clinic.
    """
    if not getattr(actor, "clinic_id", None):
        return q.filter(QEEGRecord.clinician_id == actor.actor_id)
    return (
        q.join(Patient, Patient.id == QEEGRecord.patient_id)
        .join(User, User.id == Patient.clinician_id)
        .filter(User.clinic_id == actor.clinic_id)
    )

router = APIRouter(prefix="/api/v1/qeeg-records", tags=["qEEG Records"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class QEEGRecordCreate(BaseModel):
    patient_id: str = Field(..., max_length=64)
    course_id: Optional[str] = Field(default=None, max_length=64)
    recording_type: str = Field(default="resting", max_length=32)
    recording_date: Optional[str] = Field(default=None, max_length=32)
    equipment: Optional[str] = Field(default=None, max_length=200)
    eyes_condition: Optional[str] = Field(default=None, max_length=32)
    # `raw_data_ref` is an opaque storage key (S3 / disk path).
    # Pre-fix this was uncapped which combined with the path-traversal
    # gap in the raw-signal router to form a PHI-exfil chain (clinician
    # PATCHes raw_data_ref="/etc/passwd", then GETs raw-signal). The
    # length cap below is a low-cost guard; the load-bearing fix is the
    # allowlist validation in `_validate_raw_data_ref` below.
    raw_data_ref: Optional[str] = Field(default=None, max_length=512)
    summary_notes: Optional[str] = Field(default=None, max_length=4_000)
    findings: dict = Field(default_factory=dict)


class QEEGRecordUpdate(BaseModel):
    summary_notes: Optional[str] = Field(default=None, max_length=4_000)
    findings: Optional[dict] = None
    # NOTE: `raw_data_ref` is intentionally NOT exposed on the PATCH
    # body — this is the write half of the path-traversal chain that
    # let a clinician set `raw_data_ref="/etc/passwd"` and then GET
    # raw-signal to exfiltrate arbitrary files. The field can only be
    # set at create time and must pass `_validate_raw_data_ref` there.


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


# Allowlist of scheme prefixes that ``raw_data_ref`` may use. Any other
# value (absolute paths, ``..`` traversal segments, ``file://`` URIs)
# is refused at create time. The downstream raw-signal loader still
# performs its own ``is_relative_to`` check against the fixtures root,
# but pinning the shape at the API boundary is the load-bearing guard
# for the exfil chain described in `QEEGRecordUpdate` above.
_RAW_DATA_REF_ALLOWED_SCHEMES = ("s3://", "https://", "fixtures://", "memory://")


def _validate_raw_data_ref(value: str | None) -> None:
    if value is None:
        return
    candidate = value.strip()
    if not candidate:
        return
    if any(candidate.startswith(s) for s in _RAW_DATA_REF_ALLOWED_SCHEMES):
        return
    raise ApiServiceError(
        code="invalid_raw_data_ref",
        message=(
            "raw_data_ref must use s3://, https://, fixtures://, or "
            "memory:// — local paths and traversal segments are refused."
        ),
        status_code=422,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=QEEGRecordOut, status_code=201)
def create_qeeg_record(
    body: QEEGRecordCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGRecordOut:
    import json
    require_minimum_role(actor, "clinician")

    # Cross-clinic gate — pre-fix any clinician could create a record
    # against any patient_id (including patients in other clinics). The
    # record was then visible to the originating actor via the
    # clinician_id-equality filter, allowing covert cross-clinic writes.
    _gate_patient_access(actor, body.patient_id, db)

    # Allowlist the storage-ref scheme. Combined with the PATCH-side
    # removal of raw_data_ref above, this closes the path-traversal
    # exfil chain.
    _validate_raw_data_ref(body.raw_data_ref)

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

    q = _scope_records_query_to_clinic(db.query(QEEGRecord), actor)
    if patient_id:
        # When the caller asks for a specific patient, additionally
        # enforce the cross-clinic gate so the response is empty
        # rather than 403 — keeps UX consistent with other list
        # endpoints.
        _gate_patient_access(actor, patient_id, db)
        q = q.filter(QEEGRecord.patient_id == patient_id)
    if course_id:
        q = q.filter(QEEGRecord.course_id == course_id)

    # Pagination cap — pre-fix this returned every row in the table
    # which scales linearly with the clinic's record count.
    records = q.order_by(QEEGRecord.created_at.desc()).limit(500).all()
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
    # Convert cross-clinic 403 to 404 to avoid leaking row existence.
    try:
        _gate_patient_access(actor, record.patient_id, db)
    except ApiServiceError as exc:
        if exc.code in {"cross_clinic_access_denied", "forbidden", "not_found"}:
            raise ApiServiceError(
                code="not_found",
                message="qEEG record not found.",
                status_code=404,
            ) from exc
        raise
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
    if record is None:
        raise ApiServiceError(code="not_found", message="qEEG record not found.", status_code=404)
    try:
        _gate_patient_access(actor, record.patient_id, db)
    except ApiServiceError as exc:
        if exc.code in {"cross_clinic_access_denied", "forbidden", "not_found"}:
            raise ApiServiceError(
                code="not_found",
                message="qEEG record not found.",
                status_code=404,
            ) from exc
        raise

    if body.summary_notes is not None:
        record.summary_notes = body.summary_notes
    if body.findings is not None:
        record.findings_json = json.dumps(body.findings)
    # `raw_data_ref` is intentionally NOT mutable via PATCH — the only
    # way to set it is through `create_qeeg_record` where
    # `_validate_raw_data_ref` runs. Pre-fix this was the write half
    # of the path-traversal PHI-exfil chain.

    db.commit()
    db.refresh(record)
    return QEEGRecordOut.from_record(record)


# ── Phase 5b: file upload endpoint ──────────────────────────────────────────
# POST /api/v1/qeeg-records/upload
#
# Accepts an .edf / .edf+ / .bdf / .vhdr / .set / .fif file plus minimal
# metadata, persists the file under a per-patient namespace, creates a
# QEEGRecord row pointing at it, and returns a suggested_path so the
# Phase 3 launcher can route the user to either the auto-pipeline or the
# manual cleaning workbench.

import os  # noqa: E402
import uuid as _uuid  # noqa: E402

from fastapi import File, Form, UploadFile  # noqa: E402

from app.settings import get_settings  # noqa: E402

_QEEG_UPLOAD_ALLOWED_EXTS = frozenset({"edf", "bdf", "vhdr", "vmrk", "eeg", "set", "fdt", "fif"})
_QEEG_UPLOAD_MIN_BYTES = 1 * 1024 * 1024            # 1 MB
_QEEG_UPLOAD_MAX_BYTES = 500 * 1024 * 1024          # 500 MB hard cap
_QEEG_UPLOAD_LARGE_BYTES = 250 * 1024 * 1024        # advisory threshold for "manual"


def _qeeg_save_recording_file(
    patient_id: str,
    record_id: str,
    file_bytes: bytes,
    filename: str,
    settings,
) -> tuple[str, str]:
    """Persist the uploaded file under media_uploads/qeeg/<patient>/.

    Returns (raw_data_ref, ext). Path is sandboxed inside the per-patient
    directory; refuses any traversal escape. Mirrors the same hardening
    pattern as ``reports_router._save_report_file``.
    """
    media_root = getattr(settings, "media_storage_root", "media_uploads")
    dest_dir = os.path.join(media_root, "qeeg", patient_id)
    os.makedirs(dest_dir, exist_ok=True)
    raw_ext = (filename or "recording.edf").rsplit(".", 1)[-1].lower()
    if raw_ext not in _QEEG_UPLOAD_ALLOWED_EXTS:
        raise ApiServiceError(
            code="invalid_qeeg_extension",
            message=(
                "qEEG file extension must be one of: " + ", ".join(sorted(_QEEG_UPLOAD_ALLOWED_EXTS))
            ),
            status_code=422,
        )
    dest_path = os.path.join(dest_dir, f"{record_id}.{raw_ext}")
    abs_dest = os.path.realpath(dest_path)
    abs_root = os.path.realpath(dest_dir)
    if not (abs_dest == abs_root or abs_dest.startswith(abs_root + os.sep)):
        raise ApiServiceError(
            code="invalid_qeeg_destination",
            message="Resolved qEEG path escapes the patient directory.",
            status_code=422,
        )
    with open(abs_dest, "wb") as fh:
        fh.write(file_bytes)
    return f"fixtures://qeeg/{patient_id}/{record_id}.{raw_ext}", raw_ext


def _qeeg_suggest_path(size_bytes: int, ext: str) -> str:
    """Advisory routing: 'auto' for typical resting-state recordings,
    'manual' for very small / very large files or EEGLAB exports."""
    if size_bytes < _QEEG_UPLOAD_MIN_BYTES:
        return "manual"
    if size_bytes > _QEEG_UPLOAD_LARGE_BYTES:
        return "manual"
    if ext in {"set", "fdt"}:
        return "manual"
    return "auto"


def _qeeg_suggest_reason(size_bytes: int, ext: str, suggested: str) -> str:
    if suggested == "auto":
        return "typical resting-state recording — auto pipeline recommended"
    if size_bytes < _QEEG_UPLOAD_MIN_BYTES:
        return "small file (< 1 MB) — likely too short, manual review recommended"
    if size_bytes > _QEEG_UPLOAD_LARGE_BYTES:
        return "large file (> 250 MB) — manual review recommended"
    if ext in {"set", "fdt"}:
        return "EEGLAB export — manual review recommended"
    return "manual review recommended"


class QEEGUploadResponse(BaseModel):
    record_id: str
    raw_data_ref: str
    suggested_path: str  # "auto" | "manual"
    qc: dict


@router.post("/upload", response_model=QEEGUploadResponse, status_code=201)
async def upload_qeeg_recording(
    patient_id: str = Form(...),
    course_id: Optional[str] = Form(default=None),
    recording_type: str = Form(default="resting"),
    eyes_condition: Optional[str] = Form(default=None),
    equipment: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGUploadResponse:
    """Upload a raw qEEG file and create a QEEGRecord pointing at it.

    Used by the Phase 3 unified launcher so the user can upload + auto-route
    in one round-trip. The pipeline is NOT triggered here — the launcher
    decides whether to call `/qeeg-analysis/<id>/run` or open the raw
    workbench for manual cleaning, based on `suggested_path`.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    file_bytes = await file.read()
    size = len(file_bytes)
    if size <= 0:
        raise ApiServiceError(code="empty_qeeg_upload", message="Uploaded qEEG file is empty.", status_code=422)
    if size > _QEEG_UPLOAD_MAX_BYTES:
        raise ApiServiceError(
            code="qeeg_upload_too_large",
            message=f"qEEG file exceeds {_QEEG_UPLOAD_MAX_BYTES // (1024 * 1024)} MB hard cap.",
            status_code=413,
        )

    record_id = str(_uuid.uuid4())
    raw_data_ref, ext = _qeeg_save_recording_file(
        patient_id=patient_id,
        record_id=record_id,
        file_bytes=file_bytes,
        filename=file.filename or "recording.edf",
        settings=get_settings(),
    )

    record = QEEGRecord(
        id=record_id,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        course_id=course_id,
        recording_type=recording_type,
        eyes_condition=eyes_condition,
        equipment=equipment,
        raw_data_ref=raw_data_ref,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    suggested = _qeeg_suggest_path(size, ext)
    qc = {
        "size_bytes": size,
        "extension": ext,
        "filename": file.filename,
        "suggested_path_reason": _qeeg_suggest_reason(size, ext, suggested),
    }

    return QEEGUploadResponse(
        record_id=record_id,
        raw_data_ref=raw_data_ref,
        suggested_path=suggested,
        qc=qc,
    )
