"""
Media workflow router — patient uploads, clinician notes, AI analysis, review queue.
All AI-generated content is DRAFT ONLY. Clinical use requires explicit clinician approval.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AiSummaryAudit,
    AuditEventRecord,
    ClinicianMediaNote,
    ClinicianMediaTranscript,
    ClinicianNoteDraft,
    MediaConsent,
    MediaRedFlag,
    Patient,
    PatientMediaAnalysis,
    PatientMediaReviewAction,
    PatientMediaTranscript,
    PatientMediaUpload,
    TreatmentCourse,
)
from app.services import media_analysis_service, media_storage, transcription_service
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/media", tags=["media"])
_logger = logging.getLogger(__name__)


# ── Request / Response models ─────────────────────────────────────────────────


class ConsentRequest(BaseModel):
    consent_type: str  # "upload_voice"|"upload_video"|"upload_text"|"ai_analysis"
    granted: bool
    retention_days: int = 365


class ReviewActionRequest(BaseModel):
    action: str  # "approve"|"reject"|"request_reupload"|"flag_urgent"|"mark_reviewed"
    reason: Optional[str] = None


class TextUploadRequest(BaseModel):
    text_content: str
    course_id: Optional[str] = None
    session_id: Optional[str] = None
    patient_note: Optional[str] = None
    consent_id: str


class AmendAnalysisRequest(BaseModel):
    clinician_amendments: str
    chart_note_draft: Optional[str] = None


class TextNoteRequest(BaseModel):
    patient_id: str
    course_id: Optional[str] = None
    session_id: Optional[str] = None
    note_type: str  # "post_session"|"clinical_update"|"adverse_event"|"progress"
    text_content: str


class ApproveDraftRequest(BaseModel):
    clinician_edits: Optional[str] = None
    soap_note: Optional[str] = None
    patient_summary: Optional[str] = None
    treatment_update: Optional[str] = None
    adverse_event_note: Optional[str] = None
    included_tasks: Optional[list] = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_clinician(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _require_clinician_or_reviewer(actor: AuthenticatedActor) -> None:
    if actor.role not in ("clinician", "reviewer", "admin", "supervisor"):
        raise ApiServiceError(
            code="forbidden",
            message="Clinician or reviewer access is required for this action.",
            status_code=403,
        )


def _require_clinician_staff(actor: AuthenticatedActor) -> None:
    """clinician/technician/admin."""
    if actor.role not in ("clinician", "technician", "admin", "supervisor"):
        raise ApiServiceError(
            code="forbidden",
            message="Clinician staff access is required for this action.",
            status_code=403,
        )


def _check_patient_access(patient_id: str, actor: AuthenticatedActor, db: Session) -> None:
    """Verify the actor owns the patient record (or is admin/supervisor).

    Raises a 404 (not_found) rather than 403 to avoid leaking patient IDs.
    """
    if actor.role in ("admin", "supervisor"):
        return
    patient = db.query(Patient).filter_by(id=patient_id).first()
    if patient is None or patient.clinician_id != actor.actor_id:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )


def _write_audit(
    db: Session,
    *,
    target_id: str,
    target_type: str,
    action: str,
    actor: AuthenticatedActor,
    note: str,
) -> None:
    record = AuditEventRecord(
        event_id=str(uuid.uuid4()),
        target_id=target_id,
        target_type=target_type,
        action=action,
        role=actor.role,
        actor_id=actor.actor_id,
        note=note,
        created_at=_now_iso(),
    )
    db.add(record)


def _upload_to_dict(upload: PatientMediaUpload, transcript: Optional[PatientMediaTranscript] = None, analysis: Optional[PatientMediaAnalysis] = None) -> dict:
    return {
        "id": upload.id,
        "patient_id": upload.patient_id,
        "course_id": upload.course_id,
        "session_id": upload.session_id,
        "uploaded_by": upload.uploaded_by,
        "media_type": upload.media_type,
        # upload_type mirrors media_type — frontend uses both field names
        "upload_type": upload.media_type,
        "file_ref": upload.file_ref,
        "file_size_bytes": upload.file_size_bytes,
        "duration_seconds": upload.duration_seconds,
        "text_content": upload.text_content,
        "patient_note": upload.patient_note,
        "status": upload.status,
        "consent_id": upload.consent_id,
        "created_at": upload.created_at.isoformat() if upload.created_at else None,
        "updated_at": upload.updated_at.isoformat() if upload.updated_at else None,
        "deleted_at": upload.deleted_at.isoformat() if upload.deleted_at else None,
        # Flat transcript string for the detail page (upload.transcript)
        "transcript": transcript.transcript_text if transcript else None,
        "transcript_detail": _transcript_to_dict(transcript) if transcript else None,
        "analysis_summary": _analysis_summary_dict(analysis) if analysis else None,
        # Placeholder — populated by review-queue and detail routes that do the join
        "patient_name": None,
        "primary_condition": None,
        "course_name": None,
        "flagged_urgent": False,
        "has_undismissed_flag": False,
        "audit_trail": [],
    }


def _transcript_to_dict(t: PatientMediaTranscript) -> dict:
    return {
        "id": t.id,
        "transcript_text": t.transcript_text,
        "provider": t.provider,
        "language": t.language,
        "word_count": t.word_count,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _analysis_summary_dict(a: PatientMediaAnalysis) -> dict:
    return {
        "id": a.id,
        "structured_summary": a.structured_summary,
        "approved_for_clinical_use": a.approved_for_clinical_use,
        "clinician_reviewed_at": a.clinician_reviewed_at.isoformat() if a.clinician_reviewed_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _parse_json_field(raw: Optional[str], fallback):
    """Parse a JSON-encoded model field; return fallback on missing/invalid."""
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return fallback


def _analysis_full_dict(a: PatientMediaAnalysis) -> dict:
    symptoms = _parse_json_field(a.symptoms_mentioned, [])
    side_effects = _parse_json_field(a.side_effects_mentioned, [])
    functional_impact = _parse_json_field(a.functional_impact, {})
    adherence_mentions = _parse_json_field(a.adherence_mentions, {})
    follow_up_questions = _parse_json_field(a.follow_up_questions, [])
    return {
        "id": a.id,
        "upload_id": a.upload_id,
        "transcript_id": a.transcript_id,
        "triggered_by": a.triggered_by,
        "model_used": a.model_used,
        "prompt_hash": a.prompt_hash,
        "structured_summary": a.structured_summary,
        "symptoms_mentioned": symptoms,
        # Also expose as side_effects — frontend uses both field names
        "side_effects_mentioned": side_effects,
        "side_effects": side_effects,
        "functional_impact": functional_impact,
        "adherence_mentions": adherence_mentions,
        "follow_up_questions": follow_up_questions,
        "chart_note_draft": a.chart_note_draft,
        # Also expose as soap_note — frontend uses both field names
        "soap_note": a.chart_note_draft,
        "comparison_notes": a.comparison_notes,
        "approved_for_clinical_use": a.approved_for_clinical_use,
        "clinician_reviewed_at": a.clinician_reviewed_at.isoformat() if a.clinician_reviewed_at else None,
        "clinician_reviewer_id": a.clinician_reviewer_id,
        "clinician_amendments": a.clinician_amendments,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _flag_to_dict(f: MediaRedFlag) -> dict:
    return {
        "id": f.id,
        "upload_id": f.upload_id,
        "clinician_note_id": f.clinician_note_id,
        "patient_id": f.patient_id,
        "flag_type": f.flag_type,
        "extracted_text": f.extracted_text,
        "severity": f.severity,
        "ai_generated": f.ai_generated,
        "reviewed_at": f.reviewed_at.isoformat() if f.reviewed_at else None,
        "reviewed_by": f.reviewed_by,
        "dismissed": f.dismissed,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


# ── Consent endpoints ─────────────────────────────────────────────────────────


@router.post("/consent")
def record_consent(
    body: ConsentRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Create or update a media consent record for the authenticated patient."""
    if actor.role != "patient":
        raise ApiServiceError(
            code="forbidden",
            message="Only patients may record consent.",
            status_code=403,
        )

    existing = (
        db.query(MediaConsent)
        .filter_by(patient_id=actor.actor_id, consent_type=body.consent_type)
        .first()
    )

    now = datetime.now(timezone.utc)

    if existing:
        existing.granted = body.granted
        existing.retention_days = body.retention_days
        if body.granted:
            existing.granted_at = now
            existing.revoked_at = None
        else:
            existing.revoked_at = now
        db.commit()
        consent_id = existing.id
    else:
        consent = MediaConsent(
            patient_id=actor.actor_id,
            consent_type=body.consent_type,
            granted=body.granted,
            granted_at=now if body.granted else None,
            revoked_at=None if body.granted else now,
            retention_days=body.retention_days,
        )
        db.add(consent)
        db.commit()
        db.refresh(consent)
        consent_id = consent.id

    _write_audit(
        db,
        target_id=consent_id,
        target_type="media_consent",
        action="consent_recorded",
        actor=actor,
        note=f"consent_type={body.consent_type} granted={body.granted}",
    )
    db.commit()

    _logger.info(
        "media_consent_recorded patient=%s type=%s granted=%s",
        actor.actor_id, body.consent_type, body.granted,
    )

    return {"ok": True, "consent_id": consent_id}


@router.get("/consent/{patient_id}")
def get_consents(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    """Return all media consent records for a patient."""
    if actor.role == "patient":
        if actor.actor_id != patient_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only view your own consent records.",
                status_code=403,
            )
    else:
        _require_clinician_or_reviewer(actor)

    consents = db.query(MediaConsent).filter_by(patient_id=patient_id).all()
    return [
        {
            "id": c.id,
            "patient_id": c.patient_id,
            "consent_type": c.consent_type,
            "granted": c.granted,
            "granted_at": c.granted_at.isoformat() if c.granted_at else None,
            "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
            "retention_days": c.retention_days,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in consents
    ]


# ── Patient upload endpoints ──────────────────────────────────────────────────


@router.post("/patient/upload/text")
def patient_upload_text(
    body: TextUploadRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Patient submits a text-based upload."""
    if actor.role != "patient":
        raise ApiServiceError(
            code="forbidden",
            message="Only patients may submit uploads.",
            status_code=403,
        )

    # Validate consent — must belong to THIS patient to prevent consent_id spoofing
    consent = (
        db.query(MediaConsent)
        .filter_by(id=body.consent_id, patient_id=actor.actor_id)
        .first()
    )
    if consent is None or not consent.granted or consent.consent_type not in ("upload_text", "text_updates"):
        raise ApiServiceError(
            code="consent_required",
            message="Valid text-upload consent is required to submit a text upload.",
            status_code=400,
        )

    upload = PatientMediaUpload(
        patient_id=actor.actor_id,
        course_id=body.course_id,
        session_id=body.session_id,
        uploaded_by=actor.actor_id,
        media_type="text",
        text_content=body.text_content,
        patient_note=body.patient_note,
        status="pending_review",
        consent_id=body.consent_id,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    _write_audit(
        db,
        target_id=upload.id,
        target_type="patient_media_upload",
        action="media_upload_text",
        actor=actor,
        note=f"patient={actor.actor_id} course={body.course_id} session={body.session_id}",
    )
    db.commit()

    _logger.info("patient_text_upload upload=%s", upload.id)

    return _upload_to_dict(upload)


@router.post("/patient/upload/audio")
async def patient_upload_audio(
    file: UploadFile,
    course_id: Optional[str] = Form(default=None),
    session_id: Optional[str] = Form(default=None),
    patient_note: Optional[str] = Form(default=None),
    consent_id: str = Form(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Patient submits an audio upload."""
    if actor.role != "patient":
        raise ApiServiceError(
            code="forbidden",
            message="Only patients may submit uploads.",
            status_code=403,
        )

    # Validate consent — must belong to THIS patient to prevent consent_id spoofing
    consent = (
        db.query(MediaConsent)
        .filter_by(id=consent_id, patient_id=actor.actor_id)
        .first()
    )
    if consent is None or not consent.granted or consent.consent_type not in ("upload_voice", "voice_notes"):
        raise ApiServiceError(
            code="consent_required",
            message="Valid voice-upload consent is required to submit an audio upload.",
            status_code=400,
        )

    settings = get_settings()

    # Validate MIME type
    if file.content_type not in media_storage.allowed_audio_types():
        raise ApiServiceError(
            code="invalid_file_type",
            message=f"File type '{file.content_type}' is not allowed. Accepted: {media_storage.allowed_audio_types()}",
            status_code=422,
        )

    file_bytes = await file.read()

    # Validate file size
    if len(file_bytes) > media_storage.max_upload_bytes(settings):
        raise ApiServiceError(
            code="file_too_large",
            message=f"Upload exceeds maximum size of {media_storage.max_upload_bytes(settings)} bytes.",
            status_code=422,
        )

    upload_id = str(uuid.uuid4())
    ext = (file.filename or "audio.webm").rsplit(".", 1)[-1]

    try:
        file_ref = await media_storage.save_upload(
            patient_id=actor.actor_id,
            upload_id=upload_id,
            file_bytes=file_bytes,
            extension=ext,
            settings=settings,
        )
    except IOError as exc:
        raise ApiServiceError(
            code="storage_error",
            message=f"Failed to save upload: {exc}",
            status_code=500,
        )

    upload = PatientMediaUpload(
        id=upload_id,
        patient_id=actor.actor_id,
        course_id=course_id,
        session_id=session_id,
        uploaded_by=actor.actor_id,
        media_type="voice",
        file_ref=file_ref,
        file_size_bytes=len(file_bytes),
        patient_note=patient_note,
        status="pending_review",
        consent_id=consent_id,
    )
    db.add(upload)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        await media_storage.delete_upload(file_ref, settings)  # clean up orphaned file
        raise ApiServiceError(
            code="storage_error",
            message="Failed to record upload. Please try again.",
            status_code=500,
        ) from exc
    db.refresh(upload)

    _write_audit(
        db,
        target_id=upload.id,
        target_type="patient_media_upload",
        action="media_upload_audio",
        actor=actor,
        note=f"patient={actor.actor_id} bytes={len(file_bytes)} course={course_id}",
    )
    db.commit()

    _logger.info("patient_audio_upload upload=%s bytes=%d", upload.id, len(file_bytes))

    return _upload_to_dict(upload)


@router.get("/patient/uploads")
def patient_list_uploads(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    """List the authenticated patient's own uploads, newest first."""
    if actor.role != "patient":
        raise ApiServiceError(
            code="forbidden",
            message="Only patients may access this endpoint.",
            status_code=403,
        )

    uploads = (
        db.query(PatientMediaUpload)
        .filter_by(patient_id=actor.actor_id)
        .filter(PatientMediaUpload.deleted_at.is_(None))
        .order_by(PatientMediaUpload.created_at.desc())
        .all()
    )

    # Pre-fetch all undismissed flags for this patient's uploads in one query
    upload_ids = [u.id for u in uploads]
    upload_flags: dict[str, list] = {u.id: [] for u in uploads}
    if upload_ids:
        flag_rows = (
            db.query(MediaRedFlag)
            .filter(MediaRedFlag.upload_id.in_(upload_ids), MediaRedFlag.dismissed == False)  # noqa: E712
            .all()
        )
        for f in flag_rows:
            if f.upload_id in upload_flags:
                upload_flags[f.upload_id].append(f)

    results = []
    for upload in uploads:
        transcript = (
            db.query(PatientMediaTranscript).filter_by(upload_id=upload.id).first()
        )
        analysis = (
            db.query(PatientMediaAnalysis).filter_by(upload_id=upload.id).first()
        )
        d = _upload_to_dict(upload, transcript, analysis)
        flags = upload_flags.get(upload.id, [])
        d["has_undismissed_flag"] = bool(flags)
        d["flagged_urgent"]       = any(f.severity == "high" and not f.ai_generated for f in flags)
        results.append(d)

    return results


@router.get("/patient/uploads/{upload_id}")
def get_patient_upload(
    upload_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Get a single patient upload. Patient can access own; clinician+ can access any."""
    upload = (
        db.query(PatientMediaUpload)
        .filter_by(id=upload_id)
        .filter(PatientMediaUpload.deleted_at.is_(None))
        .first()
    )
    if upload is None:
        raise ApiServiceError(code="not_found", message="Upload not found.", status_code=404)

    if actor.role == "patient":
        if upload.patient_id != actor.actor_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only access your own uploads.",
                status_code=403,
            )
    else:
        _require_clinician_or_reviewer(actor)

    transcript = db.query(PatientMediaTranscript).filter_by(upload_id=upload.id).first()
    analysis   = db.query(PatientMediaAnalysis).filter_by(upload_id=upload.id).first()

    patient = db.query(Patient).filter_by(id=upload.patient_id).first()
    course  = db.query(TreatmentCourse).filter_by(id=upload.course_id).first() if upload.course_id else None

    undismissed_flags = (
        db.query(MediaRedFlag)
        .filter_by(upload_id=upload.id, dismissed=False)
        .all()
    )
    is_urgent = any(f.severity == "high" and not f.ai_generated for f in undismissed_flags)

    audit_rows = (
        db.query(AuditEventRecord)
        .filter_by(target_id=upload.id)
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    audit_trail = [f"{r.action} by {r.role}" for r in audit_rows]

    d = _upload_to_dict(upload, transcript, analysis)
    d["patient_name"]        = f"{patient.first_name} {patient.last_name}".strip() if patient else None
    d["primary_condition"]   = course.condition_slug if course else None
    d["course_name"]         = f"{course.condition_slug} / {course.modality_slug}".strip(" /") if course else None
    d["flagged_urgent"]      = is_urgent
    d["has_undismissed_flag"] = bool(undismissed_flags)
    d["audit_trail"]         = audit_trail
    d["red_flags"]           = [_flag_to_dict(f) for f in undismissed_flags]
    return d


# ── Review queue (clinician) ──────────────────────────────────────────────────


@router.get("/review-queue")
def get_review_queue(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    """Return uploads pending review, urgent items first."""
    _require_clinician_or_reviewer(actor)

    uploads = (
        db.query(PatientMediaUpload)
        .filter(
            PatientMediaUpload.status.in_(["pending_review", "reupload_requested"]),
            PatientMediaUpload.deleted_at.is_(None),
        )
        .order_by(PatientMediaUpload.created_at.asc())
        .all()
    )

    # Retrieve urgent flag status for all uploads in one pass
    upload_ids = [u.id for u in uploads]
    urgent_upload_ids: set[str] = set()
    if upload_ids:
        flags = (
            db.query(MediaRedFlag)
            .filter(
                MediaRedFlag.upload_id.in_(upload_ids),
                MediaRedFlag.severity == "high",
                MediaRedFlag.dismissed == False,
                MediaRedFlag.ai_generated == False,
            )
            .all()
        )
        urgent_upload_ids = {f.upload_id for f in flags if f.upload_id}

    # Pre-fetch all relevant patients and courses to avoid N+1
    patient_ids = {u.patient_id for u in uploads}
    course_ids  = {u.course_id for u in uploads if u.course_id}

    patients_by_id: dict[str, Patient] = {}
    if patient_ids:
        rows = db.query(Patient).filter(Patient.id.in_(patient_ids)).all()
        patients_by_id = {p.id: p for p in rows}

    courses_by_id: dict[str, TreatmentCourse] = {}
    if course_ids:
        rows = db.query(TreatmentCourse).filter(TreatmentCourse.id.in_(course_ids)).all()
        courses_by_id = {c.id: c for c in rows}

    results = []
    for upload in uploads:
        patient = patients_by_id.get(upload.patient_id)
        course  = courses_by_id.get(upload.course_id) if upload.course_id else None

        patient_name = (
            f"{patient.first_name} {patient.last_name}".strip() if patient else None
        )
        primary_condition = course.condition_slug if course else None
        course_name = (
            f"{course.condition_slug} / {course.modality_slug}".strip(" /") if course else None
        )

        d = _upload_to_dict(upload)
        is_urgent = upload.id in urgent_upload_ids
        d["is_urgent"]         = is_urgent
        d["flagged_urgent"]    = is_urgent
        d["patient_name"]      = patient_name
        d["primary_condition"] = primary_condition
        d["course_name"]       = course_name
        results.append(d)

    # Sort: urgent first, then by created_at
    results.sort(key=lambda x: (not x["flagged_urgent"], x.get("created_at") or ""))
    return results


@router.post("/review/{upload_id}/action")
def review_action(
    upload_id: str,
    body: ReviewActionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Perform a review action on a patient upload."""
    _require_clinician_or_reviewer(actor)

    upload = (
        db.query(PatientMediaUpload)
        .filter_by(id=upload_id)
        .filter(PatientMediaUpload.deleted_at.is_(None))
        .first()
    )
    if upload is None:
        raise ApiServiceError(code="not_found", message="Upload not found.", status_code=404)

    _VALID_ACTIONS = {
        "approve", "reject", "request_reupload", "flag_urgent", "mark_reviewed",
    }
    if body.action not in _VALID_ACTIONS:
        raise ApiServiceError(
            code="invalid_action",
            message=f"Action must be one of: {', '.join(sorted(_VALID_ACTIONS))}.",
            status_code=422,
        )

    # Create review action record
    review = PatientMediaReviewAction(
        upload_id=upload_id,
        actor_id=actor.actor_id,
        action=body.action,
        reason=body.reason,
    )
    db.add(review)

    # Update upload status
    if body.action == "approve":
        upload.status = "approved_for_analysis"
    elif body.action == "reject":
        upload.status = "rejected"
    elif body.action == "request_reupload":
        upload.status = "reupload_requested"
    elif body.action == "flag_urgent":
        # Status stays pending_review; create a red flag
        flag = MediaRedFlag(
            upload_id=upload_id,
            patient_id=upload.patient_id,
            flag_type="safety_concern",
            extracted_text=body.reason or "Flagged as urgent by clinician",
            severity="high",
            ai_generated=False,
        )
        db.add(flag)
    elif body.action == "mark_reviewed":
        upload.status = "clinician_reviewed"

    _write_audit(
        db,
        target_id=upload_id,
        target_type="patient_media_upload",
        action=f"review_{body.action}",
        actor=actor,
        note=f"upload={upload_id} action={body.action} reason={body.reason}",
    )
    db.commit()

    _logger.info(
        "media_review_action upload=%s action=%s actor=%s",
        upload_id, body.action, actor.actor_id,
    )

    return {"ok": True}


@router.post("/review/{upload_id}/analyze")
async def analyze_upload(
    upload_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Trigger AI transcription and analysis for an approved upload."""
    _require_clinician_or_reviewer(actor)

    upload = (
        db.query(PatientMediaUpload)
        .filter_by(id=upload_id)
        .filter(PatientMediaUpload.deleted_at.is_(None))
        .with_for_update()  # row-level lock prevents concurrent duplicate analysis
        .first()
    )
    if upload is None:
        raise ApiServiceError(code="not_found", message="Upload not found.", status_code=404)

    if upload.status != "approved_for_analysis":
        raise ApiServiceError(
            code="invalid_state",
            message=f"Upload must be in 'approved_for_analysis' state (current: {upload.status}).",
            status_code=400,
        )

    # Validate AI analysis consent
    ai_consent = (
        db.query(MediaConsent)
        .filter_by(patient_id=upload.patient_id, consent_type="ai_analysis")
        .first()
    )
    if ai_consent is None or not ai_consent.granted:
        raise ApiServiceError(
            code="consent_required",
            message="Patient has not granted consent for AI analysis.",
            status_code=400,
        )

    settings = get_settings()
    upload.status = "analyzing"
    db.commit()

    transcript_id: Optional[str] = None

    # Transcription step
    try:
        if upload.media_type == "voice" and upload.file_ref:
            file_bytes = await media_storage.read_upload(upload.file_ref, settings)
            filename = upload.file_ref.rsplit("/", 1)[-1]
            tr = await transcription_service.transcribe_audio(file_bytes, filename, settings)
        else:
            text = upload.text_content or ""
            tr = await transcription_service.transcribe_text_upload(text)

        transcript = PatientMediaTranscript(
            upload_id=upload.id,
            transcript_text=tr.text,
            provider=tr.provider,
            language=tr.language,
            word_count=tr.word_count,
            processing_seconds=tr.duration_seconds,
        )
        db.add(transcript)
        db.commit()
        db.refresh(transcript)
        transcript_id = transcript.id
        transcript_text = tr.text

    except RuntimeError as exc:
        upload.status = "approved_for_analysis"
        db.commit()
        raise ApiServiceError(
            code="service_unavailable",
            message=str(exc),
            status_code=503,
        )

    # AI analysis step
    try:
        result = await media_analysis_service.analyze_patient_upload(
            transcript_text=transcript_text,
            patient_context={},
            prior_analyses=[],
            settings=settings,
        )
    except RuntimeError as exc:
        # Clean up the transcript record so a retry starts fresh
        if transcript_id:
            db.query(PatientMediaTranscript).filter_by(id=transcript_id).delete()
        upload.status = "approved_for_analysis"
        db.commit()
        raise ApiServiceError(
            code="service_unavailable",
            message=str(exc),
            status_code=503,
        )

    analysis = PatientMediaAnalysis(
        upload_id=upload.id,
        transcript_id=transcript_id,
        triggered_by=actor.actor_id,
        model_used=result.model_used,
        prompt_hash=result.prompt_hash,
        structured_summary=result.structured_summary,
        symptoms_mentioned=json.dumps(result.symptoms_mentioned),
        side_effects_mentioned=json.dumps(result.side_effects_mentioned),
        functional_impact=json.dumps(result.functional_impact),
        adherence_mentions=json.dumps(result.adherence_mentions),
        follow_up_questions=json.dumps(result.follow_up_questions),
        chart_note_draft=result.chart_note_draft,
        comparison_notes=result.comparison_notes,
        approved_for_clinical_use=False,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    # Extract and save red flags
    for rf in result.red_flags:
        flag = MediaRedFlag(
            upload_id=upload.id,
            patient_id=upload.patient_id,
            flag_type=rf.get("type", "safety_concern") if isinstance(rf, dict) else getattr(rf, "flag_type", "safety_concern"),
            extracted_text=rf.get("verbatim_quote", rf.get("extracted_text", "")) if isinstance(rf, dict) else getattr(rf, "extracted_text", ""),
            severity=rf.get("severity", "medium") if isinstance(rf, dict) else getattr(rf, "severity", "medium"),
            ai_generated=True,
        )
        db.add(flag)

    # Save AI summary audit
    ai_audit = AiSummaryAudit(
        patient_id=upload.patient_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        summary_type="patient_upload_analysis",
        prompt_hash=result.prompt_hash,
        response_preview=(result.structured_summary or "")[:500],
        model_used=result.model_used,
    )
    db.add(ai_audit)

    upload.status = "analyzed"

    _write_audit(
        db,
        target_id=upload.id,
        target_type="patient_media_upload",
        action="media_analyzed",
        actor=actor,
        note=f"upload={upload.id} model={result.model_used}",
    )
    db.commit()

    _logger.info("media_analysis_complete upload=%s model=%s", upload.id, result.model_used)

    return _analysis_full_dict(analysis)


@router.get("/analysis/{upload_id}")
def get_analysis(
    upload_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Get AI analysis for an upload. Clinicians or the upload owner patient."""
    upload = (
        db.query(PatientMediaUpload)
        .filter_by(id=upload_id)
        .filter(PatientMediaUpload.deleted_at.is_(None))
        .first()
    )
    if upload is None:
        raise ApiServiceError(code="not_found", message="Upload not found.", status_code=404)

    if actor.role == "patient":
        if upload.patient_id != actor.actor_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only access your own analysis.",
                status_code=403,
            )
    else:
        _require_clinician_or_reviewer(actor)

    analysis = db.query(PatientMediaAnalysis).filter_by(upload_id=upload_id).first()
    if analysis is None:
        raise ApiServiceError(code="not_found", message="Analysis not found.", status_code=404)

    return _analysis_full_dict(analysis)


class ApproveAnalysisRequest(BaseModel):
    chart_note_draft: Optional[str] = None
    clinician_amendments: Optional[str] = None


@router.post("/analysis/{upload_id}/approve")
def approve_analysis(
    upload_id: str,
    body: ApproveAnalysisRequest = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Clinician approves AI analysis for clinical use, optionally saving edits."""
    _require_clinician(actor)

    analysis = db.query(PatientMediaAnalysis).filter_by(upload_id=upload_id).first()
    if analysis is None:
        raise ApiServiceError(code="not_found", message="Analysis not found.", status_code=404)

    analysis.approved_for_clinical_use = True
    analysis.clinician_reviewer_id = actor.actor_id
    analysis.clinician_reviewed_at = datetime.now(timezone.utc)

    if body:
        if body.chart_note_draft is not None:
            analysis.chart_note_draft = body.chart_note_draft
        if body.clinician_amendments is not None:
            analysis.clinician_amendments = body.clinician_amendments

    upload = db.query(PatientMediaUpload).filter_by(id=upload_id).first()
    if upload:
        upload.status = "clinician_reviewed"

    _write_audit(
        db,
        target_id=upload_id,
        target_type="patient_media_analysis",
        action="analysis_approved",
        actor=actor,
        note=f"upload={upload_id} clinician={actor.actor_id}",
    )
    db.commit()

    return {"ok": True}


@router.patch("/analysis/{upload_id}/amend")
def amend_analysis(
    upload_id: str,
    body: AmendAnalysisRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Clinician amends AI analysis with their own notes."""
    _require_clinician(actor)

    analysis = db.query(PatientMediaAnalysis).filter_by(upload_id=upload_id).first()
    if analysis is None:
        raise ApiServiceError(code="not_found", message="Analysis not found.", status_code=404)

    analysis.clinician_amendments = body.clinician_amendments
    if body.chart_note_draft is not None:
        analysis.chart_note_draft = body.chart_note_draft

    _write_audit(
        db,
        target_id=upload_id,
        target_type="patient_media_analysis",
        action="analysis_amended",
        actor=actor,
        note=f"upload={upload_id} clinician={actor.actor_id}",
    )
    db.commit()

    return {"ok": True}


# ── Red flags ─────────────────────────────────────────────────────────────────


@router.get("/red-flags/{patient_id}")
def get_red_flags(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    """Return active (not dismissed) red flags for a patient."""
    _require_clinician_or_reviewer(actor)
    _check_patient_access(patient_id, actor, db)

    flags = (
        db.query(MediaRedFlag)
        .filter_by(patient_id=patient_id, dismissed=False)
        .order_by(MediaRedFlag.created_at.desc())
        .all()
    )
    return [_flag_to_dict(f) for f in flags]


@router.post("/red-flags/{flag_id}/dismiss")
def dismiss_red_flag(
    flag_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Clinician dismisses a red flag."""
    _require_clinician(actor)

    flag = db.query(MediaRedFlag).filter_by(id=flag_id).first()
    if flag is None:
        raise ApiServiceError(code="not_found", message="Red flag not found.", status_code=404)

    flag.dismissed = True
    flag.reviewed_at = datetime.now(timezone.utc)
    flag.reviewed_by = actor.actor_id

    _write_audit(
        db,
        target_id=flag_id,
        target_type="media_red_flag",
        action="red_flag_dismissed",
        actor=actor,
        note=f"flag={flag_id} patient={flag.patient_id}",
    )
    db.commit()

    return {"ok": True}


# ── Clinician note endpoints ──────────────────────────────────────────────────


@router.post("/clinician/note/text")
async def clinician_note_text(
    body: TextNoteRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Clinician submits a text note; AI draft is generated immediately."""
    _require_clinician_staff(actor)
    _check_patient_access(body.patient_id, actor, db)

    settings = get_settings()

    note = ClinicianMediaNote(
        patient_id=body.patient_id,
        course_id=body.course_id,
        session_id=body.session_id,
        clinician_id=actor.actor_id,
        note_type=body.note_type,
        media_type="text",
        text_content=body.text_content,
        status="recorded",
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    # Transcription (text upload — no API call needed)
    try:
        tr = await transcription_service.transcribe_text_upload(body.text_content)
    except RuntimeError as exc:
        raise ApiServiceError(code="service_unavailable", message=str(exc), status_code=503)

    transcript = ClinicianMediaTranscript(
        note_id=note.id,
        transcript_text=tr.text,
        provider=tr.provider,
        language=tr.language,
        word_count=tr.word_count,
    )
    db.add(transcript)
    db.commit()

    # AI draft generation
    try:
        draft_result = await media_analysis_service.generate_clinician_note_draft(
            transcript_text=tr.text,
            note_type=body.note_type,
            patient_context={},
            settings=settings,
        )
    except RuntimeError as exc:
        raise ApiServiceError(code="service_unavailable", message=str(exc), status_code=503)

    draft = ClinicianNoteDraft(
        note_id=note.id,
        generated_by=draft_result.model_used,
        prompt_hash=draft_result.prompt_hash,
        session_note=draft_result.session_note,
        treatment_update_draft=draft_result.treatment_update_draft,
        adverse_event_draft=draft_result.adverse_event_draft,
        patient_friendly_summary=draft_result.patient_friendly_summary,
        task_suggestions=json.dumps(draft_result.task_suggestions) if draft_result.task_suggestions else None,
        status="generated",
    )
    db.add(draft)

    note.status = "draft_generated"

    _write_audit(
        db,
        target_id=note.id,
        target_type="clinician_media_note",
        action="clinician_note_text_created",
        actor=actor,
        note=f"patient={body.patient_id} note_type={body.note_type}",
    )
    db.commit()
    db.refresh(draft)

    _logger.info(
        "clinician_note_text note=%s patient=%s actor=%s",
        note.id, body.patient_id, actor.actor_id,
    )

    return {
        "note_id": note.id,
        "draft_id": draft.id,
        "draft": _draft_to_dict(draft, patient_id=body.patient_id),
    }


@router.post("/clinician/note/audio")
async def clinician_note_audio(
    file: UploadFile,
    patient_id: str = Form(...),
    course_id: Optional[str] = Form(default=None),
    session_id: Optional[str] = Form(default=None),
    note_type: str = Form(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Clinician uploads an audio note; transcribed and drafted by AI immediately."""
    _require_clinician_staff(actor)

    settings = get_settings()

    if file.content_type not in media_storage.allowed_audio_types():
        raise ApiServiceError(
            code="invalid_file_type",
            message=f"File type '{file.content_type}' is not allowed. Accepted: {media_storage.allowed_audio_types()}",
            status_code=422,
        )

    file_bytes = await file.read()

    if len(file_bytes) > media_storage.max_upload_bytes(settings):
        raise ApiServiceError(
            code="file_too_large",
            message=f"Upload exceeds maximum size of {media_storage.max_upload_bytes(settings)} bytes.",
            status_code=422,
        )

    note_id = str(uuid.uuid4())
    ext = (file.filename or "audio.webm").rsplit(".", 1)[-1]

    try:
        file_ref = await media_storage.save_upload(
            patient_id=patient_id,
            upload_id=note_id,
            file_bytes=file_bytes,
            extension=ext,
            settings=settings,
        )
    except IOError as exc:
        raise ApiServiceError(code="storage_error", message=str(exc), status_code=500)

    note = ClinicianMediaNote(
        id=note_id,
        patient_id=patient_id,
        course_id=course_id,
        session_id=session_id,
        clinician_id=actor.actor_id,
        note_type=note_type,
        media_type="voice",
        file_ref=file_ref,
        file_size_bytes=len(file_bytes),
        status="recorded",
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    # Transcription
    try:
        filename = file.filename or f"{note_id}.{ext}"
        tr = await transcription_service.transcribe_audio(file_bytes, filename, settings)
    except RuntimeError as exc:
        raise ApiServiceError(code="service_unavailable", message=str(exc), status_code=503)

    transcript = ClinicianMediaTranscript(
        note_id=note.id,
        transcript_text=tr.text,
        provider=tr.provider,
        language=tr.language,
        word_count=tr.word_count,
    )
    db.add(transcript)
    db.commit()

    # AI draft generation
    try:
        draft_result = await media_analysis_service.generate_clinician_note_draft(
            transcript_text=tr.text,
            note_type=note_type,
            patient_context={},
            settings=settings,
        )
    except RuntimeError as exc:
        raise ApiServiceError(code="service_unavailable", message=str(exc), status_code=503)

    draft = ClinicianNoteDraft(
        note_id=note.id,
        generated_by=draft_result.model_used,
        prompt_hash=draft_result.prompt_hash,
        session_note=draft_result.session_note,
        treatment_update_draft=draft_result.treatment_update_draft,
        adverse_event_draft=draft_result.adverse_event_draft,
        patient_friendly_summary=draft_result.patient_friendly_summary,
        task_suggestions=json.dumps(draft_result.task_suggestions) if draft_result.task_suggestions else None,
        status="generated",
    )
    db.add(draft)

    note.status = "draft_generated"

    _write_audit(
        db,
        target_id=note.id,
        target_type="clinician_media_note",
        action="clinician_note_audio_created",
        actor=actor,
        note=f"patient={patient_id} note_type={note_type} bytes={len(file_bytes)}",
    )
    db.commit()
    db.refresh(draft)

    _logger.info(
        "clinician_note_audio note=%s patient=%s actor=%s bytes=%d",
        note.id, patient_id, actor.actor_id, len(file_bytes),
    )

    return {
        "note_id": note.id,
        "draft_id": draft.id,
        "draft": _draft_to_dict(draft, patient_id=patient_id),
    }


@router.get("/clinician/notes/{patient_id}")
def list_clinician_notes(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    """List clinician notes for a patient, with draft status."""
    _require_clinician_or_reviewer(actor)
    _check_patient_access(patient_id, actor, db)

    notes = (
        db.query(ClinicianMediaNote)
        .filter_by(patient_id=patient_id)
        .order_by(ClinicianMediaNote.created_at.desc())
        .all()
    )

    results = []
    for note in notes:
        draft = (
            db.query(ClinicianNoteDraft)
            .filter_by(note_id=note.id)
            .order_by(ClinicianNoteDraft.created_at.desc())
            .first()
        )
        results.append({
            "id": note.id,
            "patient_id": note.patient_id,
            "course_id": note.course_id,
            "session_id": note.session_id,
            "clinician_id": note.clinician_id,
            "note_type": note.note_type,
            "media_type": note.media_type,
            "status": note.status,
            "created_at": note.created_at.isoformat() if note.created_at else None,
            "draft_status": draft.status if draft else None,
            "draft_id": draft.id if draft else None,
        })

    return results


@router.get("/clinician/note/{note_id}")
def get_clinician_note_detail(
    note_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Return the full note detail, transcript, and latest draft for one note."""
    _require_clinician_or_reviewer(actor)

    note = db.query(ClinicianMediaNote).filter_by(id=note_id).first()
    if note is None:
        raise ApiServiceError(code="not_found", message="Clinician note not found.", status_code=404)

    _check_patient_access(note.patient_id, actor, db)

    transcript = db.query(ClinicianMediaTranscript).filter_by(note_id=note.id).first()
    draft = (
        db.query(ClinicianNoteDraft)
        .filter_by(note_id=note.id)
        .order_by(ClinicianNoteDraft.created_at.desc())
        .first()
    )

    return {
        "id": note.id,
        "patient_id": note.patient_id,
        "course_id": note.course_id,
        "session_id": note.session_id,
        "clinician_id": note.clinician_id,
        "note_type": note.note_type,
        "media_type": note.media_type,
        "file_ref": note.file_ref,
        "duration_seconds": note.duration_seconds,
        "text_content": note.text_content,
        "status": note.status,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
        "transcript": {
            "id": transcript.id,
            "transcript_text": transcript.transcript_text,
            "provider": transcript.provider,
            "language": transcript.language,
            "word_count": transcript.word_count,
            "created_at": transcript.created_at.isoformat() if transcript.created_at else None,
        } if transcript else None,
        "latest_draft": _draft_to_dict(draft, patient_id=note.patient_id) if draft else None,
    }


@router.post("/clinician/draft/{draft_id}/approve")
def approve_clinician_draft(
    draft_id: str,
    body: ApproveDraftRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Clinician approves (and optionally edits) a generated note draft."""
    _require_clinician(actor)

    draft = db.query(ClinicianNoteDraft).filter_by(id=draft_id).first()
    if draft is None:
        raise ApiServiceError(code="not_found", message="Draft not found.", status_code=404)

    draft.status = "approved"
    draft.approved_by = actor.actor_id
    draft.approved_at = datetime.now(timezone.utc)
    if body.clinician_edits is not None:
        draft.clinician_edits = body.clinician_edits
    # Persist clinician-edited fields if provided in approval body
    if body.soap_note is not None:
        draft.session_note = body.soap_note
    if body.patient_summary is not None:
        draft.patient_friendly_summary = body.patient_summary
    if body.treatment_update is not None:
        draft.treatment_update_draft = body.treatment_update
    if body.adverse_event_note is not None:
        draft.adverse_event_draft = body.adverse_event_note
    if body.included_tasks is not None:
        draft.task_suggestions = json.dumps(body.included_tasks)

    note = db.query(ClinicianMediaNote).filter_by(id=draft.note_id).first()
    if note:
        note.status = "finalized"

    _write_audit(
        db,
        target_id=draft_id,
        target_type="clinician_note_draft",
        action="clinician_draft_approved",
        actor=actor,
        note=f"draft={draft_id} note={draft.note_id} clinician={actor.actor_id}",
    )
    db.commit()

    return {"ok": True}


# ── Patient upload deletion ───────────────────────────────────────────────────


@router.delete("/patient/upload/{upload_id}")
async def delete_patient_upload(
    upload_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Soft-delete a patient upload. Patients can't delete after clinical use."""
    upload = (
        db.query(PatientMediaUpload)
        .filter_by(id=upload_id)
        .filter(PatientMediaUpload.deleted_at.is_(None))
        .first()
    )
    if upload is None:
        raise ApiServiceError(code="not_found", message="Upload not found.", status_code=404)

    if actor.role == "patient":
        if upload.patient_id != actor.actor_id:
            raise ApiServiceError(
                code="forbidden",
                message="You may only delete your own uploads.",
                status_code=403,
            )
        if upload.status == "clinician_reviewed":
            raise ApiServiceError(
                code="cannot_delete",
                message="This upload has been used in clinical review and cannot be deleted.",
                status_code=400,
            )
    else:
        _require_clinician(actor)

    settings = get_settings()

    # Soft delete
    upload.deleted_at = datetime.now(timezone.utc)
    db.commit()

    # Delete file from storage (best effort)
    if upload.file_ref:
        await media_storage.delete_upload(upload.file_ref, settings)

    _write_audit(
        db,
        target_id=upload_id,
        target_type="patient_media_upload",
        action="media_upload_deleted",
        actor=actor,
        note=f"upload={upload_id} patient={upload.patient_id}",
    )
    db.commit()

    _logger.info("patient_upload_deleted upload=%s", upload_id)

    return {"ok": True}


@router.get("/file/{file_ref:path}")
async def serve_media_file(
    file_ref: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """
    Serve a media file with auth + ownership check.
    Patients may only access their own uploads; clinicians may access any upload
    belonging to their patients.
    """
    # Derive ownership from upload record — never trust file_ref alone
    upload = (
        db.query(PatientMediaUpload)
        .filter(PatientMediaUpload.file_ref == file_ref)
        .filter(PatientMediaUpload.deleted_at.is_(None))
        .first()
    )
    # Also check clinician notes
    note = None
    if upload is None:
        from app.persistence.models import ClinicianMediaNote  # noqa: PLC0415
        note = (
            db.query(ClinicianMediaNote)
            .filter(ClinicianMediaNote.file_ref == file_ref)
            .first()
        )

    owner_patient_id = upload.patient_id if upload else (note.patient_id if note else None)
    if owner_patient_id is None:
        raise ApiServiceError(code="not_found", message="File not found.", status_code=404)

    if actor.role == "patient" and (upload is None or upload.patient_id != actor.actor_id):
        raise ApiServiceError(code="forbidden", message="Access denied.", status_code=403)
    elif actor.role not in ("patient",):
        _require_clinician_or_reviewer(actor)

    settings = get_settings()
    try:
        file_bytes = await media_storage.read_upload(file_ref, settings)
    except FileNotFoundError:
        raise ApiServiceError(code="not_found", message="File not found.", status_code=404)

    # Determine a safe content type from file extension only
    ext = file_ref.rsplit(".", 1)[-1].lower() if "." in file_ref else ""
    _safe_types = {
        # Audio
        "webm": "audio/webm",
        "mp3":  "audio/mpeg",
        "ogg":  "audio/ogg",
        "wav":  "audio/wav",
        "m4a":  "audio/mp4",
        # Video (mp4 is video when file is video; use generic video/mp4)
        "mp4":  "video/mp4",
    }
    content_type = _safe_types.get(ext, "application/octet-stream")

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename={file_ref.rsplit('/', 1)[-1]}"},
    )


# ── Serialiser helpers ────────────────────────────────────────────────────────


def _draft_to_dict(draft: ClinicianNoteDraft, patient_id: Optional[str] = None) -> dict:
    task_suggestions = _parse_json_field(draft.task_suggestions, [])
    return {
        "id": draft.id,
        "note_id": draft.note_id,
        "generated_by": draft.generated_by,
        # Canonical field name
        "session_note": draft.session_note,
        # Frontend also reads draftData.soap_note
        "soap_note": draft.session_note,
        # Canonical field name
        "treatment_update_draft": draft.treatment_update_draft,
        # Frontend also reads draftData.treatment_update
        "treatment_update": draft.treatment_update_draft,
        # Canonical field name
        "adverse_event_draft": draft.adverse_event_draft,
        # Frontend also reads draftData.adverse_event_note
        "adverse_event_note": draft.adverse_event_draft,
        # Canonical field name
        "patient_friendly_summary": draft.patient_friendly_summary,
        # Frontend also reads draftData.patient_summary
        "patient_summary": draft.patient_friendly_summary,
        # Parsed from JSON string; frontend expects array
        "task_suggestions": task_suggestions,
        "status": draft.status,
        "approved_by": draft.approved_by,
        "approved_at": draft.approved_at.isoformat() if draft.approved_at else None,
        "clinician_edits": draft.clinician_edits,
        "created_at": draft.created_at.isoformat() if draft.created_at else None,
        # patient_id is needed by draft review page for post-approve navigation
        "patient_id": patient_id,
    }
