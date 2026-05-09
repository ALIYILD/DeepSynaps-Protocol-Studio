"""Medical Imaging Preview router — MIQ-inspired Quick Look API.

Provides a lightweight, non-diagnostic preview surface alongside the
existing heavy MRI pipeline (``app.routers.mri_analysis_router``):

* ``GET  /api/v1/medical-images/supported-formats``
* ``POST /api/v1/medical-images/preview``
* ``GET  /api/v1/medical-images/{image_id}``
* ``GET  /api/v1/medical-images/{image_id}/slices/{plane}.png``
* ``POST /api/v1/medical-images/{image_id}/report-context``
* ``GET  /api/v1/patients/{patient_id}/medical-images``

Persistence is intentionally file-based — no alembic migration needed for
this PR. Each preview lives at::

    <media_storage_root>/medical_image_previews/<image_id>/
        original.<ext>
        axial.png
        coronal.png
        sagittal.png
        sidecar.json

The sidecar JSON carries metadata, patient linkage, status, and the
clinician-entered note (if any). A future PR can promote this to a DB
table without changing the public API.

Safety contract (see ``app.services.medical_image_preview``):

* clinician role required for upload + patient-scoped queries;
* AI report-context never returns diagnostic claims;
* every state change emits an ``AuditEventRecord`` row;
* PHI-risk filenames are redacted before logging.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, File, Form, Path as PathParam, Request, UploadFile
from fastapi.responses import FileResponse
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
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from app.services import medical_image_preview as preview_service
from app.settings import get_settings

_log = logging.getLogger(__name__)


router = APIRouter(prefix="/api/v1/medical-images", tags=["medical-images"])


# 256 MB matches preview_service.MAX_PREVIEW_BYTES; mirrored here so that the
# HTTP layer can short-circuit before reading the upload into memory.
_MAX_UPLOAD_BYTES = preview_service.MAX_PREVIEW_BYTES


# ── Pydantic schemas — explicit response surface ─────────────────────────────


# core-schema-exempt: router-private medical-image metadata projection (underscore-prefixed, never reused outside this router)
class _MedicalImageMetadataOut(BaseModel):
    filename: str
    format: str
    dimensions: list[int] = Field(default_factory=list)
    voxel_size_mm: list[float] = Field(default_factory=list)
    volumes: int = 1
    datatype: Optional[str] = None
    orientation_note: str
    file_size_bytes: Optional[int] = None
    compressed: bool = False
    qform_code: Optional[int] = None
    sform_code: Optional[int] = None
    intensity_min: Optional[float] = None
    intensity_max: Optional[float] = None
    warnings: list[str] = Field(default_factory=list)


# core-schema-exempt: router-private preview URLs sub-model (underscore-prefixed, only nested in _MedicalImagePreviewOut)
class _MedicalImagePreviewUrls(BaseModel):
    axial_url: Optional[str] = None
    coronal_url: Optional[str] = None
    sagittal_url: Optional[str] = None


# core-schema-exempt: router-private preview response envelope (underscore-prefixed, emitted only from this router's preview endpoints)
class _MedicalImagePreviewOut(BaseModel):
    id: str
    patient_id: Optional[str] = None
    upload_id: Optional[str] = None
    filename: str
    format: str
    status: str
    error: Optional[str] = None
    metadata: _MedicalImageMetadataOut
    preview: _MedicalImagePreviewUrls
    warnings: list[str] = Field(default_factory=list)
    disclaimer: str = preview_service.PREVIEW_DISCLAIMER
    created_at: str
    processed_at: Optional[str] = None


# core-schema-exempt: router-private supported-formats list response (underscore-prefixed, only on this router's GET /formats)
class _SupportedFormatsOut(BaseModel):
    formats: list[dict[str, Any]]
    disclaimer: str = preview_service.PREVIEW_DISCLAIMER


# core-schema-exempt: router-private clinician imaging-note request body (underscore-prefixed, only consumed by this router's report-context POST)
class _ReportContextIn(BaseModel):
    clinician_imaging_note: Optional[str] = None


# core-schema-exempt: router-private clinician imaging-note response shape (underscore-prefixed, only emitted from this router's report-context POST)
class _ReportContextOut(BaseModel):
    medical_image_context: dict[str, Any]


# core-schema-exempt: router-private patient-images list wrapper (underscore-prefixed, only on this router's GET /patient/{id})
class _PatientImageListOut(BaseModel):
    items: list[_MedicalImagePreviewOut]
    disclaimer: str = preview_service.PREVIEW_DISCLAIMER


# ── Storage helpers ──────────────────────────────────────────────────────────


def _previews_root() -> Path:
    settings = get_settings()
    root = Path(settings.media_storage_root) / "medical_image_previews"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _image_dir(image_id: str) -> Path:
    return _previews_root() / image_id


def _sidecar_path(image_id: str) -> Path:
    return _image_dir(image_id) / "sidecar.json"


def _read_sidecar(image_id: str) -> Optional[dict[str, Any]]:
    path = _sidecar_path(image_id)
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            if isinstance(data, dict):
                return data
    except (OSError, json.JSONDecodeError) as exc:
        _log.warning("sidecar read failed for %s: %s", image_id, exc)
    return None


def _write_sidecar(image_id: str, data: dict[str, Any]) -> None:
    path = _sidecar_path(image_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, default=str)
    tmp.replace(path)


def _safe_filename_for_log(filename: Optional[str]) -> str:
    """Mirror the redaction policy used by mri_analysis_router."""
    if not filename:
        return ""
    lower = filename.lower()
    phi_keywords = ("patient", "name", "dob", "mrn", "ssn", "nhs", "birth")
    if any(k in lower for k in phi_keywords):
        ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
        return f"[REDACTED_PHI_RISK].{ext}" if ext else "[REDACTED_PHI_RISK]"
    return filename


def _emit_audit(
    session: Session,
    *,
    action: str,
    image_id: str,
    actor: AuthenticatedActor,
    note: dict[str, Any] | str = "",
) -> None:
    try:
        payload = note if isinstance(note, str) else json.dumps(note, default=str)
        create_audit_event(
            session,
            event_id=f"medical_image.{uuid.uuid4().hex[:12]}",
            target_id=image_id[:64],
            target_type="medical_image",
            action=action,
            role=actor.role,
            actor_id=actor.actor_id,
            note=payload[:1024],
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:  # pragma: no cover — audit failure never blocks
        _log.warning("medical-image audit failed (%s): %s", action, exc)


def _gate_patient_access(
    actor: AuthenticatedActor,
    patient_id: Optional[str],
    db: Session,
) -> None:
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _payload_from_sidecar(sidecar: dict[str, Any]) -> _MedicalImagePreviewOut:
    image_id = sidecar["id"]
    md_dict = sidecar.get("metadata") or {}
    md = _MedicalImageMetadataOut(
        filename=md_dict.get("filename") or sidecar.get("filename") or "",
        format=md_dict.get("format") or sidecar.get("format") or "unknown",
        dimensions=md_dict.get("dimensions") or [],
        voxel_size_mm=md_dict.get("voxel_size_mm") or [],
        volumes=md_dict.get("volumes") or 1,
        datatype=md_dict.get("datatype"),
        orientation_note=md_dict.get("orientation_note")
            or "Raw orientation preview; not reoriented.",
        file_size_bytes=md_dict.get("file_size_bytes"),
        compressed=md_dict.get("compressed") or False,
        qform_code=md_dict.get("qform_code"),
        sform_code=md_dict.get("sform_code"),
        intensity_min=md_dict.get("intensity_min"),
        intensity_max=md_dict.get("intensity_max"),
        warnings=md_dict.get("warnings") or [],
    )
    preview = sidecar.get("preview") or {}
    return _MedicalImagePreviewOut(
        id=image_id,
        patient_id=sidecar.get("patient_id"),
        upload_id=sidecar.get("upload_id"),
        filename=sidecar.get("filename") or md.filename,
        format=md.format,
        status=sidecar.get("status") or "ready",
        error=sidecar.get("error"),
        metadata=md,
        preview=_MedicalImagePreviewUrls(
            axial_url=preview.get("axial_url"),
            coronal_url=preview.get("coronal_url"),
            sagittal_url=preview.get("sagittal_url"),
        ),
        warnings=md.warnings,
        created_at=sidecar.get("created_at") or "",
        processed_at=sidecar.get("processed_at"),
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/supported-formats", response_model=_SupportedFormatsOut)
def get_supported_formats(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> _SupportedFormatsOut:
    """List preview-eligible medical volume formats.

    Open to any authenticated actor (including patients) so the upload UI
    can advertise what is accepted before login state is settled.
    """
    return _SupportedFormatsOut(formats=preview_service.supported_formats())


@router.post("/preview", response_model=_MedicalImagePreviewOut, status_code=201)
@limiter.limit("10/minute")
async def create_preview(
    request: Request,
    file: UploadFile = File(...),
    patient_id: Optional[str] = Form(default=None),
    upload_id: Optional[str] = Form(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> _MedicalImagePreviewOut:
    """Upload a medical volume and generate a preview.

    Patient-linked uploads require the clinician role + cross-clinic
    ownership. Anonymous (no ``patient_id``) demo previews are allowed
    so that landing-page reviewers can exercise the UI with synthetic
    files; those are tagged with ``patient_id=null`` and never appear in
    patient-scoped lists.
    """
    if patient_id:
        require_minimum_role(actor, "clinician")
        _gate_patient_access(actor, patient_id, db)
    else:
        require_minimum_role(actor, "clinician")

    filename = (file.filename or "upload.bin").strip()
    fmt = preview_service.detect_medical_volume_format(filename)
    if fmt is None:
        raise ApiServiceError(
            code="unsupported_medical_image",
            message=(
                "Filename does not match a supported medical volume format. "
                "Allowed: .nii, .nii.gz, .mgh, .mgz, .mgh.gz, .mif, .mif.gz."
            ),
            status_code=422,
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise ApiServiceError(
            code="file_empty",
            message="Uploaded file is empty.",
            status_code=422,
        )
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise ApiServiceError(
            code="file_too_large",
            message=(
                f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB "
                "synchronous-preview limit. Use the heavy MRI pipeline."
            ),
            status_code=422,
        )

    image_id = "img_" + uuid.uuid4().hex[:24]
    image_dir = _image_dir(image_id)
    image_dir.mkdir(parents=True, exist_ok=True)

    # Preserve the original suffix exactly (so .nii.gz survives).
    lower = filename.lower()
    if lower.endswith(".nii.gz"):
        ext = ".nii.gz"
    elif lower.endswith(".mgh.gz"):
        ext = ".mgh.gz"
    elif lower.endswith(".mif.gz"):
        ext = ".mif.gz"
    else:
        ext = "." + lower.rsplit(".", 1)[-1]
    original_path = image_dir / f"original{ext}"
    original_path.write_bytes(file_bytes)

    _emit_audit(
        db,
        action="medical_image.uploaded",
        image_id=image_id,
        actor=actor,
        note={
            "format": fmt,
            "size": len(file_bytes),
            "patient_id": patient_id,
            "upload_id": upload_id,
            "filename": _safe_filename_for_log(filename),
        },
    )

    try:
        preview = preview_service.generate_orthogonal_preview_slices(
            str(original_path), str(image_dir)
        )
    except Exception as exc:
        _log.warning("preview generation crashed: %s", exc)
        preview = preview_service.MedicalVolumePreview(
            metadata=preview_service.extract_medical_volume_metadata(str(original_path)),
            status="error",
            error=f"{type(exc).__name__}: {exc}",
        )

    if preview.status == "ready":
        _emit_audit(
            db,
            action="medical_image.preview_generated",
            image_id=image_id,
            actor=actor,
            note={"format": fmt},
        )
    else:
        _emit_audit(
            db,
            action="medical_image.preview_failed",
            image_id=image_id,
            actor=actor,
            note={"status": preview.status, "error": preview.error},
        )

    base = f"/api/v1/medical-images/{image_id}/slices"
    sidecar = {
        "id": image_id,
        "patient_id": patient_id,
        "upload_id": upload_id,
        "filename": filename,
        "format": fmt,
        "status": preview.status,
        "error": preview.error,
        "metadata": preview.metadata.as_dict(),
        "preview": {
            "axial_url": f"{base}/axial.png" if preview.axial_path else None,
            "coronal_url": f"{base}/coronal.png" if preview.coronal_path else None,
            "sagittal_url": f"{base}/sagittal.png" if preview.sagittal_path else None,
        },
        "created_by": actor.actor_id,
        "created_by_role": actor.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "clinician_imaging_note": None,
    }
    _write_sidecar(image_id, sidecar)

    # Dual-write: persist a DB row alongside the sidecar (migration 098).
    # Failure here is non-fatal — the sidecar is still on disk and the
    # legacy file-based reader keeps working. The DB row is the fast
    # indexed path for the report-context layer.
    try:
        from app.repositories.medical_images import upsert_medical_image_asset

        clinic_id = None
        if patient_id:
            try:
                exists, resolved_clinic_id = resolve_patient_clinic_id(db, patient_id)
                if exists:
                    clinic_id = resolved_clinic_id
            except Exception:  # pragma: no cover — defensive
                _log.exception("clinic-id resolve failed for patient %s", patient_id)

        upsert_medical_image_asset(
            db,
            image_id=image_id,
            patient_id=patient_id,
            upload_id=upload_id,
            filename=filename,
            file_format=fmt,
            storage_path=str(original_path),
            status=preview.status,
            error=preview.error,
            metadata=preview.metadata.as_dict(),
            preview_paths=sidecar["preview"],
            warning_flags=list(preview.metadata.warnings or []),
            clinician_imaging_note=None,
            created_by=actor.actor_id,
            created_by_role=actor.role,
            clinic_id=clinic_id,
            created_at=sidecar["created_at"],
            processed_at=sidecar["processed_at"],
        )
    except Exception:  # pragma: no cover — never block on DB write
        _log.exception(
            "medical_image_asset DB upsert failed for %s; sidecar is the "
            "authoritative record until backfill",
            image_id,
        )

    return _payload_from_sidecar(sidecar)


@router.get("/{image_id}", response_model=_MedicalImagePreviewOut)
def get_medical_image(
    image_id: str = PathParam(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> _MedicalImagePreviewOut:
    sidecar = _read_sidecar(image_id)
    if sidecar is None:
        raise ApiServiceError(
            code="medical_image_not_found",
            message="Medical image preview not found.",
            status_code=404,
        )
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, sidecar.get("patient_id"), db)
    return _payload_from_sidecar(sidecar)


@router.get("/{image_id}/slices/{plane}.png")
def get_slice(
    image_id: str = PathParam(..., min_length=1, max_length=64),
    plane: str = PathParam(..., pattern="^(axial|coronal|sagittal)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    sidecar = _read_sidecar(image_id)
    if sidecar is None:
        raise ApiServiceError(
            code="medical_image_not_found",
            message="Medical image preview not found.",
            status_code=404,
        )
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, sidecar.get("patient_id"), db)

    slice_path = _image_dir(image_id) / f"{plane}.png"
    if not slice_path.exists():
        raise ApiServiceError(
            code="slice_unavailable",
            message=f"{plane} slice was not generated for this image.",
            status_code=404,
        )
    return FileResponse(
        path=str(slice_path),
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.post(
    "/{image_id}/report-context", response_model=_ReportContextOut
)
def get_report_context(
    payload: _ReportContextIn = Body(default_factory=_ReportContextIn),
    image_id: str = PathParam(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> _ReportContextOut:
    """Return the safe ``medical_image_context`` block for AI / templated
    report generation.

    Diagnostic-claim guarantee — see ``preview_service.build_medical_image_
    context_for_report``: this never emits lesion / atrophy / tumour /
    perfusion / connectivity findings, even if the underlying scan is rich
    enough to support them.
    """
    sidecar = _read_sidecar(image_id)
    if sidecar is None:
        raise ApiServiceError(
            code="medical_image_not_found",
            message="Medical image preview not found.",
            status_code=404,
        )
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, sidecar.get("patient_id"), db)

    md_dict = sidecar.get("metadata") or {}
    md = preview_service.MedicalVolumeMetadata(
        filename=md_dict.get("filename") or sidecar.get("filename") or "",
        format=md_dict.get("format") or sidecar.get("format") or "unknown",
        dimensions=list(md_dict.get("dimensions") or []),
        voxel_size_mm=list(md_dict.get("voxel_size_mm") or []),
        volumes=int(md_dict.get("volumes") or 1),
        datatype=md_dict.get("datatype"),
        orientation_note=md_dict.get("orientation_note")
            or "Raw orientation preview; not reoriented.",
        file_size_bytes=md_dict.get("file_size_bytes"),
        compressed=bool(md_dict.get("compressed") or False),
        qform_code=md_dict.get("qform_code"),
        sform_code=md_dict.get("sform_code"),
        intensity_min=md_dict.get("intensity_min"),
        intensity_max=md_dict.get("intensity_max"),
        warnings=list(md_dict.get("warnings") or []),
    )

    note = (payload.clinician_imaging_note or sidecar.get("clinician_imaging_note") or "").strip() or None
    if payload.clinician_imaging_note is not None:
        sidecar["clinician_imaging_note"] = note
        _write_sidecar(image_id, sidecar)

    context = preview_service.build_medical_image_context_for_report(
        metadata=md,
        preview_status=sidecar.get("status"),
        source="uploaded_" + (sidecar.get("format") or "volume").lower(),
        clinician_imaging_note=note,
        patient_id=sidecar.get("patient_id"),
        image_id=image_id,
    )

    _emit_audit(
        db,
        action="medical_image.report_context_requested",
        image_id=image_id,
        actor=actor,
        note={
            "patient_id": sidecar.get("patient_id"),
            "has_note": bool(note),
        },
    )

    return _ReportContextOut(medical_image_context=context)


@router.get(
    "/patients/{patient_id}/index", response_model=_PatientImageListOut
)
def list_patient_medical_images(
    patient_id: str = PathParam(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> _PatientImageListOut:
    """List preview-stored medical images linked to ``patient_id``.

    The ``/index`` suffix is intentional — it keeps this under the
    ``/medical-images`` prefix while leaving the ``/patients/{patient_id}/
    medical-images`` route on the patients router free for a future move
    (where it would naturally live alongside the rest of the per-patient
    surface).
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    items: list[_MedicalImagePreviewOut] = []
    root = _previews_root()
    if root.exists():
        for entry in root.iterdir():
            if not entry.is_dir():
                continue
            sidecar = _read_sidecar(entry.name)
            if sidecar is None:
                continue
            if sidecar.get("patient_id") == patient_id:
                items.append(_payload_from_sidecar(sidecar))

    items.sort(key=lambda i: i.created_at, reverse=True)
    return _PatientImageListOut(items=items)


__all__ = ["router"]
