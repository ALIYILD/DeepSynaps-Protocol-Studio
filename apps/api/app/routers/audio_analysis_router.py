"""Voice / Audio Analyzer API — analyze from path, multipart upload, or session recording."""

from __future__ import annotations

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.persistence.models import SessionRecording
from app.routers.recordings_router import _scope_recordings_query_to_clinic
from app.services import media_storage
from app.services import audio_pipeline as audio_facade
from app.services.audio_voice_persistence import load_voice_analysis, persist_voice_analysis
from app.settings import get_settings

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/audio", tags=["audio-voice"])


class AnalyzeVoiceRequest(BaseModel):
    """Analyze from a path readable by the API worker (dev / server-side integrations)."""

    audio_path: str = Field(description="Absolute path to WAV/audio readable by the API worker.")
    session_id: str
    patient_id: Optional[str] = None
    task_protocol: str = "sustained_vowel_a"
    transcript: Optional[str] = None


def _require_pipeline() -> None:
    if not getattr(audio_facade, "HAS_AUDIO_PIPELINE", False):
        raise HTTPException(
            status_code=503,
            detail="Voice analyzer package not installed on this worker.",
        )
    fn = getattr(audio_facade, "run_voice_pipeline_from_paths", None)
    if fn is None:
        raise HTTPException(status_code=503, detail="voice pipeline unavailable")


def _run_and_persist(
    *,
    resolved_audio_path: str,
    session_id: str,
    patient_id: Optional[str],
    task_protocol: str,
    transcript: Optional[str],
    db: Session,
    input_recording_ref: Optional[str] = None,
) -> dict[str, Any]:
    fn = getattr(audio_facade, "run_voice_pipeline_from_paths")
    try:
        run = fn(
            audio_path=resolved_audio_path,
            session_id=session_id,
            patient_id=patient_id,
            task_protocol=task_protocol,
            transcript=transcript,
        )
    except Exception as exc:
        _log.exception("voice analyze failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    ctx = run.context
    report = ctx.get("voice_report_payload") or {}
    analysis_id = str(uuid.uuid4())

    pv = report.get("provenance") or {}
    persist_voice_analysis(
        db,
        analysis_id=analysis_id,
        voice_report=report,
        run_context={k: v for k, v in ctx.items() if k != "voice_report_payload"},
        patient_id=patient_id,
        session_id=session_id,
        run_id=run.run_id,
        input_path=resolved_audio_path,
        input_recording_ref=input_recording_ref,
        file_hash_sha256=(ctx.get("recording") or {}).get("file_hash"),
        pipeline_version=pv.get("pipeline_version"),
        norm_db_version=pv.get("norm_db_version"),
    )

    return {
        "ok": True,
        "analysis_id": analysis_id,
        "run_id": run.run_id,
        "status": run.status,
        "voice_report": report,
    }


@router.post("/analyze")
def analyze_voice(
    body: AnalyzeVoiceRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Run neuromod voice pipeline from a server-local file path."""

    require_minimum_role(actor, "clinician")
    _require_pipeline()

    path = Path(body.audio_path)
    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"audio_path not found: {body.audio_path}")

    return _run_and_persist(
        resolved_audio_path=str(path.resolve()),
        session_id=body.session_id,
        patient_id=body.patient_id,
        task_protocol=body.task_protocol,
        transcript=body.transcript,
        db=db,
    )


@router.post("/analyze-upload")
async def analyze_voice_upload(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    patient_id: Optional[str] = Form(default=None),
    task_protocol: str = Form(default="sustained_vowel_a"),
    transcript: Optional[str] = Form(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Multipart upload — bytes are written under ``media_storage_root`` then analyzed."""

    require_minimum_role(actor, "clinician")
    _require_pipeline()

    settings = get_settings()
    max_b = media_storage.max_upload_bytes(settings)
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=422, detail="empty upload")
    if len(file_bytes) > max_b:
        raise HTTPException(
            status_code=422,
            detail=f"file exceeds maximum size of {max_b} bytes",
        )

    mime = (file.content_type or "").lower()
    if not mime.startswith("audio/"):
        raise HTTPException(
            status_code=422,
            detail="Voice analysis accepts audio uploads only.",
        )
    if not media_storage.looks_like_audio(file_bytes):
        raise HTTPException(
            status_code=422,
            detail="Upload bytes do not match an audio file.",
        )

    ext = "wav"
    if "mpeg" in mime or file.filename and file.filename.lower().endswith(".mp3"):
        ext = "mp3"
    elif "webm" in mime:
        ext = "webm"

    uid = str(uuid.uuid4())
    owner = patient_id or "unassigned"
    try:
        file_ref = await media_storage.save_upload(owner, uid, file_bytes, ext, settings)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    root = Path(settings.media_storage_root)
    abs_path = (root / file_ref).resolve()
    if not str(abs_path).startswith(str(root.resolve()) + os.sep):
        raise HTTPException(status_code=400, detail="invalid storage path")

    return _run_and_persist(
        resolved_audio_path=str(abs_path),
        session_id=session_id,
        patient_id=patient_id,
        task_protocol=task_protocol,
        transcript=transcript,
        db=db,
        input_recording_ref=f"media:{file_ref}",
    )


@router.post("/analyze-recording/{recording_id}")
def analyze_voice_from_recording(
    recording_id: str,
    session_id: str,
    patient_id: Optional[str] = None,
    task_protocol: str = "sustained_vowel_a",
    transcript: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Analyze audio from an existing :class:`SessionRecording` row (Virtual Care studio)."""

    require_minimum_role(actor, "clinician")
    _require_pipeline()

    record = (
        _scope_recordings_query_to_clinic(
            db.query(SessionRecording).filter(SessionRecording.id == recording_id),
            actor,
        ).first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="recording not found")

    mime = (record.mime_type or "").lower()
    if not mime.startswith("audio/"):
        raise HTTPException(
            status_code=422,
            detail="Recording is not an audio file.",
        )

    settings = get_settings()
    settings_root = Path(settings.media_storage_root).resolve()
    target = (settings_root / record.file_path).resolve()
    if not str(target).startswith(str(settings_root) + os.sep):
        raise HTTPException(status_code=400, detail="invalid recording path")
    if not target.is_file():
        raise HTTPException(status_code=410, detail="recording file missing on disk")

    return _run_and_persist(
        resolved_audio_path=str(target),
        session_id=session_id,
        patient_id=patient_id or record.patient_id,
        task_protocol=task_protocol,
        transcript=transcript,
        db=db,
        input_recording_ref=f"session_recording:{recording_id}",
    )


@router.get("/report/{analysis_id}")
def get_voice_report(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return stored voice report JSON."""

    require_minimum_role(actor, "clinician")
    row = load_voice_analysis(db, analysis_id)
    if row is None:
        raise HTTPException(status_code=404, detail="analysis not found")
    try:
        vr = json.loads(row.voice_report_json or "{}")
    except json.JSONDecodeError:
        vr = {}
    return {"analysis_id": analysis_id, "voice_report": vr, "status": row.status}
