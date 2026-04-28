"""Session recordings router — minimal media-storage MVP.

Backs the Virtual Care Recording Studio playback button. Uploads land on the
local Fly volume under
`{media_storage_root}/recordings/{owner_clinician_id}/{recording_id}`; the DB
row carries the MIME type and original byte size, and downloads stream
straight from disk via FastAPI's ``FileResponse`` (which honours Range so
HTML5 ``<audio>`` / ``<video>`` scrubbing works).
"""
from __future__ import annotations

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
from app.persistence.models import SessionRecording
from app.services import media_storage
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/recordings", tags=["recordings"])

# ── Constants ─────────────────────────────────────────────────────────────────

_MAX_BYTES = 200 * 1024 * 1024  # 200 MB cap

# Audio + video only — no transcoding, no other formats.
_ALLOWED_MIME = {
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "video/mp4",
    "video/webm",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _recordings_root() -> Path:
    """Storage root for uploaded recordings. Created on demand."""
    base = Path(get_settings().media_storage_root) / "recordings"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _record_to_out(r: SessionRecording) -> "RecordingOut":
    return RecordingOut(
        id=r.id,
        owner_clinician_id=r.owner_clinician_id,
        patient_id=r.patient_id,
        title=r.title,
        mime_type=r.mime_type,
        byte_size=r.byte_size,
        duration_seconds=r.duration_seconds,
        uploaded_at=r.uploaded_at.isoformat(),
    )


# ── Schemas ──────────────────────────────────────────────────────────────────

class RecordingOut(BaseModel):
    id: str
    owner_clinician_id: str
    patient_id: Optional[str]
    title: str
    mime_type: str
    byte_size: int
    duration_seconds: Optional[int]
    uploaded_at: str


class RecordingListResponse(BaseModel):
    items: list[RecordingOut]
    total: int


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=RecordingListResponse)
def list_recordings(
    patient_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> RecordingListResponse:
    """List recordings owned by the authenticated clinician."""
    require_minimum_role(actor, "clinician")
    stmt = select(SessionRecording).where(
        SessionRecording.owner_clinician_id == actor.actor_id
    )
    if patient_id is not None:
        stmt = stmt.where(SessionRecording.patient_id == patient_id)
    stmt = stmt.order_by(SessionRecording.uploaded_at.desc())
    rows = session.scalars(stmt).all()
    items = [_record_to_out(r) for r in rows]
    return RecordingListResponse(items=items, total=len(items))


@router.post("", status_code=201)
async def create_recording(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    patient_id: Optional[str] = Form(default=None),
    duration_seconds: Optional[int] = Form(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict:
    """Multipart upload — clinician+ only. Returns ``{id}``.

    Bytes land at ``{media_storage_root}/recordings/{owner_id}/{recording_id}``
    (no extension on the path; the MIME type stored on the row is the source
    of truth for ``Content-Type`` on subsequent reads).
    """
    require_minimum_role(actor, "clinician")

    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_MIME:
        raise ApiServiceError(
            code="invalid_mime_type",
            message=f"MIME '{file.content_type}' is not an allowed audio/video type.",
            status_code=422,
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise ApiServiceError(
            code="empty_file", message="Uploaded file is empty.", status_code=422
        )
    if len(file_bytes) > _MAX_BYTES:
        raise ApiServiceError(
            code="file_too_large",
            message=f"Recording exceeds maximum size of {_MAX_BYTES} bytes.",
            status_code=422,
        )

    # Magic-byte verification — pre-fix the only check on the file
    # content was ``file.content_type`` (client-controlled HTTP
    # header), so a clinician could ``POST`` arbitrary binary tagged
    # ``audio/webm`` and the router happily wrote it to disk and
    # served it back with that MIME on download.
    is_audio = mime.startswith("audio/")
    looks_ok = (
        media_storage.looks_like_audio(file_bytes) if is_audio
        else media_storage.looks_like_video(file_bytes)
    )
    if not looks_ok:
        raise ApiServiceError(
            code="invalid_file_content",
            message="Upload bytes do not match the declared MIME type.",
            status_code=422,
        )

    recording_id = str(uuid.uuid4())
    owner_dir = _recordings_root() / actor.actor_id
    owner_dir.mkdir(parents=True, exist_ok=True)
    storage_path = owner_dir / recording_id
    try:
        storage_path.write_bytes(file_bytes)
    except OSError as exc:
        raise ApiServiceError(
            code="storage_error",
            message=f"Failed to persist upload: {exc}",
            status_code=500,
        )

    file_path = f"recordings/{actor.actor_id}/{recording_id}"
    resolved_title = (title or "").strip() or (file.filename or "Untitled recording")

    record = SessionRecording(
        id=recording_id,
        owner_clinician_id=actor.actor_id,
        patient_id=patient_id,
        title=resolved_title,
        file_path=file_path,
        mime_type=mime,
        byte_size=len(file_bytes),
        duration_seconds=duration_seconds,
        uploaded_at=datetime.now(timezone.utc),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return {"id": record.id}


@router.get("/{recording_id}/file")
def stream_recording(
    recording_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
):
    """Stream the recording's bytes with the stored Content-Type.

    Owner-only access — the in-clinic sharing model can extend this later.
    """
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(SessionRecording).where(SessionRecording.id == recording_id)
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Recording not found.", status_code=404)
    if record.owner_clinician_id != actor.actor_id:
        # Same 404 as missing — don't leak existence to other clinicians.
        raise ApiServiceError(code="not_found", message="Recording not found.", status_code=404)

    settings_root = Path(get_settings().media_storage_root).resolve()
    target = (settings_root / record.file_path).resolve()
    if not str(target).startswith(str(settings_root) + os.sep):
        raise ApiServiceError(
            code="invalid_path",
            message="Rejected out-of-root file reference.",
            status_code=400,
        )
    if not target.is_file():
        raise ApiServiceError(
            code="file_missing",
            message="Stored recording is no longer present on disk.",
            status_code=410,
        )
    return FileResponse(
        path=str(target),
        media_type=record.mime_type or "application/octet-stream",
        filename=record.title,
    )


@router.delete("/{recording_id}", status_code=204)
def delete_recording(
    recording_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    """Owner-only hard-delete. Removes the row and the on-disk blob."""
    require_minimum_role(actor, "clinician")
    record = session.scalar(
        select(SessionRecording).where(SessionRecording.id == recording_id)
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Recording not found.", status_code=404)
    if record.owner_clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Recording not found.", status_code=404)

    settings_root = Path(get_settings().media_storage_root).resolve()
    target = (settings_root / record.file_path).resolve()
    if str(target).startswith(str(settings_root) + os.sep) and target.is_file():
        try:
            target.unlink()
        except OSError:
            # Row deletion still proceeds — orphaned blobs are harmless and
            # better than a stuck row that the caller can't get rid of.
            pass

    session.delete(record)
    session.commit()
