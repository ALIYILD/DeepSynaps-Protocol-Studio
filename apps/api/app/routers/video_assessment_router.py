"""Video Assessments — guided motor capture + clinician review (MVP).

Separate from Virtual Care ``video-analysis`` (engagement metrics). This router
stores session JSON and optional raw video blobs under media storage.

Endpoints
---------
POST   /api/v1/video-assessments/sessions
GET    /api/v1/video-assessments/sessions/{id}
PATCH  /api/v1/video-assessments/sessions/{id}
POST   /api/v1/video-assessments/sessions/{id}/tasks/{task_id}/upload
GET    /api/v1/video-assessments/sessions/{id}/tasks/{task_id}/video
POST   /api/v1/video-assessments/sessions/{id}/finalize
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path as FsPath
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Path as PathParam, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import Patient, User, VideoAssessmentSession
from app.repositories.patients import resolve_patient_clinic_id
from app.services import media_storage
from app.services.video_assessment_seed import (
    PROTOCOL_NAME,
    PROTOCOL_VERSION,
    default_future_ai_placeholder,
    default_summary,
    default_tasks_payload,
)
from app.settings import get_settings

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/video-assessments", tags=["Video Assessments"])

_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_ALLOWED_ENVS = frozenset({"development", "test"})

_MAX_TASK_VIDEO_BYTES = 120 * 1024 * 1024  # 120 MB per task clip
_ALLOWED_VIDEO_MIME = frozenset({"video/webm", "video/mp4", "video/quicktime"})


def _require_patient(actor: AuthenticatedActor, db: Session) -> Patient:
    """Patient or admin only; demo bypass in dev/test only (same as virtual_care)."""
    if actor.role not in ("patient", "admin"):
        raise ApiServiceError(
            code="patient_role_required",
            message="This action requires a patient account.",
            status_code=403,
        )
    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        from app.settings import get_settings as _gs

        app_env = (getattr(_gs(), "app_env", None) or "production").lower()
        if app_env not in _DEMO_ALLOWED_ENVS:
            raise ApiServiceError(
                code="demo_disabled",
                message="Demo patient bypass is not available in this environment.",
                status_code=403,
            )
        patient = db.query(Patient).filter(Patient.email == "patient@demo.com").first()
        if patient:
            return patient
        raise ApiServiceError(code="patient_not_linked", message="No demo patient record found.", status_code=404)
    user = db.query(User).filter_by(id=actor.actor_id).first()
    if user is None:
        raise ApiServiceError(code="not_found", message="User not found.", status_code=404)
    patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="patient_not_linked",
            message="No patient record linked to this user account.",
            status_code=404,
        )
    return patient


def _gate_session_patient(row: VideoAssessmentSession, patient: Patient) -> None:
    if row.patient_id != patient.id:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)


def _gate_session_clinician(actor: AuthenticatedActor, row: VideoAssessmentSession, db: Session) -> None:
    require_minimum_role(actor, "clinician")
    exists, clinic_id = resolve_patient_clinic_id(db, row.patient_id)
    if not exists:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    try:
        require_patient_owner(actor, clinic_id)
    except ApiServiceError as exc:
        if exc.status_code == 403:
            raise ApiServiceError(code="not_found", message="Session not found.", status_code=404) from exc
        raise


def _load_session_body(row: VideoAssessmentSession) -> dict[str, Any]:
    try:
        return json.loads(row.session_json or "{}")
    except Exception:
        return {}


def _save_session_body(row: VideoAssessmentSession, body: dict[str, Any]) -> None:
    row.session_json = json.dumps(body, separators=(",", ":"), default=str)
    row.updated_at = datetime.now(timezone.utc)


def _new_session_document(*, patient_id: str, encounter_id: Optional[str]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid.uuid4()),
        "patient_id": patient_id,
        "encounter_id": encounter_id,
        "protocol_name": PROTOCOL_NAME,
        "protocol_version": PROTOCOL_VERSION,
        "mode": "patient_capture",
        "started_at": now,
        "completed_at": None,
        "overall_status": "in_progress",
        "safety_flags": [],
        "tasks": default_tasks_payload(),
        "summary": default_summary(),
        "future_ai_metrics_placeholder": default_future_ai_placeholder(),
    }


def _merge_task_updates(stored_tasks: list[dict[str, Any]], updates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {t["task_id"]: i for i, t in enumerate(stored_tasks)}
    for patch in updates:
        tid = patch.get("task_id")
        if tid is None or tid not in by_id:
            continue
        i = by_id[tid]
        base = dict(stored_tasks[i])
        for k, v in patch.items():
            if k == "task_id":
                continue
            base[k] = v
        stored_tasks[i] = base
    return stored_tasks


def _recalc_summary(body: dict[str, Any]) -> None:
    tasks = body.get("tasks") or []
    completed = sum(
        1
        for t in tasks
        if str(t.get("recording_status") or "") in ("recorded", "accepted")
    )
    skipped = sum(
        1
        for t in tasks
        if str(t.get("recording_status") or "") in ("skipped", "unsafe_skipped")
    )
    safety = [t["task_id"] for t in tasks if t.get("unsafe_flag") or t.get("recording_status") == "unsafe_skipped"]
    reviewed = sum(1 for t in tasks if (t.get("clinician_review") or {}).get("reviewed_at"))
    need_repeat = sum(
        1 for t in tasks if (t.get("clinician_review") or {}).get("repeat_needed") == "yes"
    )
    n = len(tasks) or 1
    body["summary"] = body.get("summary") or {}
    body["summary"]["tasks_completed"] = completed
    body["summary"]["tasks_skipped"] = skipped
    body["summary"]["tasks_needing_repeat"] = need_repeat
    body["summary"]["review_completion_percent"] = int(round(100 * reviewed / n))
    body["safety_flags"] = safety


class CreateSessionRequest(BaseModel):
    encounter_id: Optional[str] = Field(None, max_length=64)


class PatchSessionRequest(BaseModel):
    """Merge into session document. When ``tasks`` is set, merge by task_id."""
    mode: Optional[str] = None
    overall_status: Optional[str] = None
    completed_at: Optional[str] = None
    safety_flags: Optional[list[str]] = None
    summary: Optional[dict[str, Any]] = None
    tasks: Optional[list[dict[str, Any]]] = None
    future_ai_metrics_placeholder: Optional[dict[str, Any]] = None


@router.post("/sessions", status_code=201)
def create_session(
    body: CreateSessionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    patient = _require_patient(actor, db)
    doc = _new_session_document(patient_id=patient.id, encounter_id=body.encounter_id)
    sid = doc["id"]
    row = VideoAssessmentSession(
        id=sid,
        patient_id=patient.id,
        encounter_id=body.encounter_id,
        protocol_name=PROTOCOL_NAME,
        protocol_version=PROTOCOL_VERSION,
        overall_status="in_progress",
        session_json=json.dumps(doc, separators=(",", ":"), default=str),
    )
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)
    _log.info("video_assessment session created id=%s patient=%s", sid, patient.id)
    return _load_session_body(row)


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    if actor.role in ("patient", "admin"):
        patient = _require_patient(actor, db)
        if actor.role != "admin":
            _gate_session_patient(row, patient)
    else:
        _gate_session_clinician(actor, row, db)

    return _load_session_body(row)


@router.patch("/sessions/{session_id}")
def patch_session(
    body: PatchSessionRequest,
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    if actor.role in ("patient", "admin"):
        patient = _require_patient(actor, db)
        if actor.role != "admin":
            _gate_session_patient(row, patient)
    else:
        _gate_session_clinician(actor, row, db)

    doc = _load_session_body(row)
    if body.mode is not None:
        doc["mode"] = body.mode
    if body.overall_status is not None:
        doc["overall_status"] = body.overall_status
        row.overall_status = body.overall_status
    if body.completed_at is not None:
        doc["completed_at"] = body.completed_at
    if body.safety_flags is not None:
        doc["safety_flags"] = body.safety_flags
    if body.summary is not None:
        doc["summary"] = {**(doc.get("summary") or {}), **body.summary}
    if body.future_ai_metrics_placeholder is not None:
        doc["future_ai_metrics_placeholder"] = body.future_ai_metrics_placeholder
    if body.tasks is not None:
        doc["tasks"] = _merge_task_updates(doc.get("tasks") or [], body.tasks)
    _recalc_summary(doc)
    _save_session_body(row, doc)
    db.commit()
    return doc


def _va_storage_dir(patient_id: str, session_id: str) -> FsPath:
    root = FsPath(get_settings().media_storage_root)
    d = root / "video_assessments" / patient_id / session_id
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/sessions/{session_id}/tasks/{task_id}/upload", status_code=201)
async def upload_task_video(
    session_id: str = PathParam(..., min_length=8),
    task_id: str = PathParam(..., min_length=2),
    file: UploadFile = File(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Patient uploads a single task clip; stored on disk under media root."""
    patient = _require_patient(actor, db)
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    _gate_session_patient(row, patient)

    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in _ALLOWED_VIDEO_MIME:
        raise ApiServiceError(
            code="invalid_mime_type",
            message=f"Video MIME '{file.content_type}' is not allowed.",
            status_code=422,
        )
    raw = await file.read()
    if not raw:
        raise ApiServiceError(code="empty_file", message="Empty upload.", status_code=422)
    if len(raw) > _MAX_TASK_VIDEO_BYTES:
        raise ApiServiceError(code="file_too_large", message="Clip exceeds size limit.", status_code=422)
    if not media_storage.looks_like_video(raw[:65536]):
        raise ApiServiceError(
            code="invalid_file_content",
            message="Bytes do not match a known video container.",
            status_code=422,
        )

    ext = ".webm"
    if mime == "video/mp4":
        ext = ".mp4"
    elif mime == "video/quicktime":
        ext = ".mov"

    rid = str(uuid.uuid4())
    out_dir = _va_storage_dir(patient.id, session_id)
    rel_ref = f"video_assessments/{patient.id}/{session_id}/{task_id}_{rid}{ext}"
    abs_path = FsPath(get_settings().media_storage_root) / rel_ref
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(raw)

    doc = _load_session_body(row)
    tasks = doc.get("tasks") or []
    merged = _merge_task_updates(
        tasks,
        [
            {
                "task_id": task_id,
                "recording_asset_id": rid,
                "recording_storage_ref": rel_ref.replace("\\", "/"),
                "recording_status": "accepted",
            }
        ],
    )
    doc["tasks"] = merged
    _recalc_summary(doc)
    _save_session_body(row, doc)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"recording_asset_id": rid, "recording_storage_ref": rel_ref.replace("\\", "/"), "session": doc}


@router.get("/sessions/{session_id}/tasks/{task_id}/video")
def stream_task_video(
    session_id: str = PathParam(..., min_length=8),
    task_id: str = PathParam(..., min_length=2),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    if actor.role in ("patient", "admin"):
        patient = _require_patient(actor, db)
        if actor.role != "admin":
            _gate_session_patient(row, patient)
    else:
        _gate_session_clinician(actor, row, db)

    doc = _load_session_body(row)
    ref = None
    for t in doc.get("tasks") or []:
        if t.get("task_id") == task_id:
            ref = t.get("recording_storage_ref")
            break
    if not ref:
        raise ApiServiceError(code="no_recording", message="No recording for this task.", status_code=404)

    root = FsPath(get_settings().media_storage_root)
    path = (root / ref).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as exc:
        raise ApiServiceError(code="invalid_path", message="Invalid storage reference.", status_code=400) from exc
    if not path.is_file():
        raise ApiServiceError(code="not_found", message="Recording file missing.", status_code=404)

    mime = "video/webm"
    if path.suffix.lower() == ".mp4":
        mime = "video/mp4"
    elif path.suffix.lower() == ".mov":
        mime = "video/quicktime"
    return FileResponse(path, media_type=mime)


class FinalizeRequest(BaseModel):
    """Optional final impression fields stored in summary."""
    clinician_impression: Optional[str] = None
    recommended_followup: Optional[str] = None


@router.post("/sessions/{session_id}/finalize")
def finalize_session(
    body: FinalizeRequest,
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    _gate_session_clinician(actor, row, db)

    doc = _load_session_body(row)
    doc["overall_status"] = "finalized"
    doc["completed_at"] = datetime.now(timezone.utc).isoformat()
    row.overall_status = "finalized"
    summ = doc.get("summary") or {}
    if body.clinician_impression is not None:
        summ["clinician_impression"] = body.clinician_impression
    if body.recommended_followup is not None:
        summ["recommended_followup"] = body.recommended_followup
    doc["summary"] = summ
    _recalc_summary(doc)
    _save_session_body(row, doc)
    db.commit()
    return doc
