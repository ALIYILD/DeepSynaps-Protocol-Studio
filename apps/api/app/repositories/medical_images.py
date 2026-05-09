"""Medical-image asset repository — DB-backed promotion of PR #619 sidecar.

Companion to :class:`app.persistence.models.MedicalImageAsset`. The router
dual-writes (sidecar JSON + DB row); the report-context layer prefers the
DB query and falls back to the sidecar scan only for legacy uploads that
pre-date migration 098.

All routers MUST use these helpers (no inline ORM queries) so the
router-lint job stays green — see CLAUDE.md memory
``deepsynaps-router-schema-lint``.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..persistence.models import MedicalImageAsset


def _dt_from_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        # ``datetime.fromisoformat`` handles the ``+00:00`` tail produced
        # by ``datetime.now(timezone.utc).isoformat()`` from Python 3.11+.
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def upsert_medical_image_asset(
    session: Session,
    *,
    image_id: str,
    patient_id: Optional[str],
    upload_id: Optional[str],
    filename: Optional[str],
    file_format: str,
    storage_path: Optional[str],
    status: str,
    error: Optional[str],
    metadata: Optional[dict[str, Any]],
    preview_paths: Optional[dict[str, Any]],
    warning_flags: Optional[list[str]],
    clinician_imaging_note: Optional[str],
    created_by: Optional[str],
    created_by_role: Optional[str],
    clinic_id: Optional[str],
    created_at: Optional[str] = None,
    processed_at: Optional[str] = None,
) -> MedicalImageAsset:
    """Insert or update a row mirroring the sidecar payload.

    Idempotent on ``image_id`` — replays of the upload (e.g. retry after
    transient FS error) overwrite rather than duplicate. Returns the
    persisted row.
    """
    row = session.get(MedicalImageAsset, image_id)
    now = datetime.now(timezone.utc)
    created_dt = _dt_from_iso(created_at) or now
    processed_dt = _dt_from_iso(processed_at) or now

    if row is None:
        row = MedicalImageAsset(
            id=image_id,
            patient_id=patient_id,
            upload_id=upload_id,
            filename=filename,
            file_format=file_format,
            storage_path=storage_path,
            status=status,
            error=error,
            metadata_json=json.dumps(metadata, default=str) if metadata else None,
            preview_paths_json=(
                json.dumps(preview_paths, default=str) if preview_paths else None
            ),
            warning_flags_json=(
                json.dumps(list(warning_flags), default=str)
                if warning_flags
                else None
            ),
            clinician_imaging_note=clinician_imaging_note,
            created_by=created_by,
            created_by_role=created_by_role,
            clinic_id=clinic_id,
            created_at=created_dt,
            processed_at=processed_dt,
        )
        session.add(row)
    else:
        row.patient_id = patient_id
        row.upload_id = upload_id
        row.filename = filename
        row.file_format = file_format
        row.storage_path = storage_path
        row.status = status
        row.error = error
        row.metadata_json = json.dumps(metadata, default=str) if metadata else None
        row.preview_paths_json = (
            json.dumps(preview_paths, default=str) if preview_paths else None
        )
        row.warning_flags_json = (
            json.dumps(list(warning_flags), default=str) if warning_flags else None
        )
        row.clinician_imaging_note = clinician_imaging_note
        row.created_by = created_by
        row.created_by_role = created_by_role
        row.clinic_id = clinic_id
        # created_at is preserved; only processed_at advances on re-run.
        row.processed_at = processed_dt

    session.commit()
    session.refresh(row)
    return row


def get_medical_image_asset(
    session: Session, image_id: str
) -> Optional[MedicalImageAsset]:
    return session.get(MedicalImageAsset, image_id)


def list_medical_images_for_patient(
    session: Session, patient_id: str
) -> list[MedicalImageAsset]:
    if not patient_id:
        return []
    return list(
        session.execute(
            select(MedicalImageAsset)
            .where(MedicalImageAsset.patient_id == patient_id)
            .order_by(MedicalImageAsset.created_at.desc())
        ).scalars()
    )


def latest_medical_image_for_patient(
    session: Session, patient_id: str
) -> Optional[MedicalImageAsset]:
    if not patient_id:
        return None
    return session.execute(
        select(MedicalImageAsset)
        .where(MedicalImageAsset.patient_id == patient_id)
        .order_by(MedicalImageAsset.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def asset_to_sidecar_dict(row: MedicalImageAsset) -> dict[str, Any]:
    """Render a DB row in the same shape the sidecar reader expects.

    Lets the report-context layer treat DB rows and sidecar dicts
    interchangeably without each consumer having to learn two shapes.
    """

    def _maybe_json(text: Optional[str]) -> Any:
        if not text:
            return None
        try:
            return json.loads(text)
        except (ValueError, TypeError):
            return None

    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "upload_id": row.upload_id,
        "filename": row.filename,
        "format": row.file_format,
        "status": row.status,
        "error": row.error,
        "metadata": _maybe_json(row.metadata_json) or {},
        "preview": _maybe_json(row.preview_paths_json) or {},
        "warning_flags": _maybe_json(row.warning_flags_json) or [],
        "clinician_imaging_note": row.clinician_imaging_note,
        "created_by": row.created_by,
        "created_by_role": row.created_by_role,
        "clinic_id": row.clinic_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "processed_at": row.processed_at.isoformat() if row.processed_at else None,
    }
