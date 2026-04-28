"""Virtual care router — biometrics, video/voice analysis, session management.

Patients and clinicians use this during live video/voice visits.

Endpoints
---------
POST /api/v1/virtual-care/sessions                Create a session
GET  /api/v1/virtual-care/sessions/{id}           Get session details
PATCH /api/v1/virtual-care/sessions/{id}/start    Mark session as active
PATCH /api/v1/virtual-care/sessions/{id}/end      Mark session as ended
POST /api/v1/virtual-care/sessions/{id}/biometrics Submit biometrics snapshot
GET  /api/v1/virtual-care/sessions/{id}/biometrics List biometrics for session
POST /api/v1/virtual-care/sessions/{id}/voice-analysis  Submit voice analysis segment
GET  /api/v1/virtual-care/sessions/{id}/voice-analysis   List voice analysis
POST /api/v1/virtual-care/sessions/{id}/video-analysis   Submit video analysis segment
GET  /api/v1/virtual-care/sessions/{id}/video-analysis    List video analysis
GET  /api/v1/virtual-care/sessions/{id}/analysis  Get unified analysis summary
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    BiometricsSnapshot,
    Patient,
    VirtualCareSession,
    VoiceAnalysis,
    VideoAnalysis,
)

import logging as _logging
_vc_log = _logging.getLogger(__name__)

def _trigger_vc_risk_recompute(patient_id: str, trigger: str, db_sess):
    """Fire risk recompute for crisis/self-harm categories after voice/video analysis."""
    try:
        from app.services.risk_stratification import recompute_categories
        recompute_categories(patient_id, ["mental_crisis", "self_harm"], trigger, None, db_sess)
    except Exception:
        _vc_log.debug("Risk recompute skipped after %s", trigger, exc_info=True)

router = APIRouter(prefix="/api/v1/virtual-care", tags=["Virtual Care"])

_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_ALLOWED_ENVS = frozenset({"development", "test"})


# ── Helpers ──────────────────────────────────────────────────────────────────────

def _require_patient(actor: AuthenticatedActor, db: Session) -> Patient:
    """Resolve the Patient row for the calling actor.

    Pre-fix this helper had two gaps (same pattern fixed in PRs
    #201, #206 for home_device_portal and patient_portal):

    * No ``actor.role`` check — any non-patient role (clinician,
      technician, reviewer, guest) whose ``user.email`` matched a
      Patient row could resolve as that patient. Virtual-care
      surfaces biometrics, voice / video analysis, and AI session
      summaries — high-PHI surfaces.
    * The demo bypass (``actor.actor_id == "actor-patient-demo"``)
      was reachable in any environment, including production.

    Post-fix only ``patient`` and ``admin`` roles pass; the demo
    bypass is gated to ``app_env in {development, test}``.
    """
    from app.persistence.models import User

    if actor.role not in ("patient", "admin"):
        raise ApiServiceError(
            code="patient_role_required",
            message="Virtual care is only available to patient accounts.",
            status_code=403,
        )

    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        from app.settings import get_settings
        app_env = (getattr(get_settings(), "app_env", None) or "production").lower()
        if app_env not in _DEMO_ALLOWED_ENVS:
            raise ApiServiceError(
                code="demo_disabled",
                message="Demo patient bypass is not available in this environment.",
                status_code=403,
            )
        patient = db.query(Patient).filter(Patient.email == "patient@demo.com").first()
        if patient:
            return patient
        raise ApiServiceError(
            code="patient_not_linked",
            message="No demo patient record found.",
            status_code=404,
        )
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


def _session_to_dict(s: VirtualCareSession) -> dict:
    return {
        "id": s.id,
        "patient_id": s.patient_id,
        "clinician_id": s.clinician_id,
        "appointment_id": s.appointment_id,
        "session_type": s.session_type,
        "status": s.status,
        "room_name": s.room_name,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "duration_seconds": s.duration_seconds,
        "ai_summary": s.ai_summary,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _bio_to_dict(b: BiometricsSnapshot) -> dict:
    return {
        "id": b.id,
        "source": b.source,
        "heart_rate_bpm": b.heart_rate_bpm,
        "hrv_ms": b.hrv_ms,
        "spo2_pct": b.spo2_pct,
        "blood_pressure_sys": b.blood_pressure_sys,
        "blood_pressure_dia": b.blood_pressure_dia,
        "stress_score": b.stress_score,
        "sleep_hours_last_night": b.sleep_hours_last_night,
        "steps_today": b.steps_today,
        "recorded_at": b.recorded_at.isoformat() if b.recorded_at else None,
    }


def _voice_to_dict(v: VoiceAnalysis) -> dict:
    tags = []
    try:
        tags = json.loads(v.mood_tags_json or "[]")
    except Exception:
        pass
    return {
        "id": v.id,
        "segment_start_sec": v.segment_start_sec,
        "segment_end_sec": v.segment_end_sec,
        "sentiment": v.sentiment,
        "stress_level": v.stress_level,
        "energy_level": v.energy_level,
        "speech_pace_wpm": v.speech_pace_wpm,
        "mood_tags": tags,
        "ai_insights": v.ai_insights,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


def _video_to_dict(v: VideoAnalysis) -> dict:
    flags = []
    try:
        flags = json.loads(v.attention_flags_json or "[]")
    except Exception:
        pass
    return {
        "id": v.id,
        "segment_start_sec": v.segment_start_sec,
        "segment_end_sec": v.segment_end_sec,
        "engagement_score": v.engagement_score,
        "facial_expression": v.facial_expression,
        "eye_contact_pct": v.eye_contact_pct,
        "posture_score": v.posture_score,
        "attention_flags": flags,
        "ai_insights": v.ai_insights,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


# ── Request schemas ──────────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    session_type: str = Field(default="video")
    appointment_id: Optional[str] = Field(None, max_length=64)
    room_name: Optional[str] = Field(None, max_length=255)


class BiometricsRequest(BaseModel):
    source: str = Field(default="wearable")
    heart_rate_bpm: Optional[int] = Field(None, ge=30, le=250)
    hrv_ms: Optional[float] = Field(None, ge=0)
    spo2_pct: Optional[float] = Field(None, ge=50, le=100)
    blood_pressure_sys: Optional[int] = Field(None, ge=50, le=300)
    blood_pressure_dia: Optional[int] = Field(None, ge=20, le=200)
    stress_score: Optional[int] = Field(None, ge=0, le=100)
    sleep_hours_last_night: Optional[float] = Field(None, ge=0, le=24)
    steps_today: Optional[int] = Field(None, ge=0)


class VoiceAnalysisRequest(BaseModel):
    segment_start_sec: int = Field(..., ge=0)
    segment_end_sec: int = Field(..., ge=0)
    sentiment: str = Field(default="neutral")
    stress_level: int = Field(default=0, ge=0, le=100)
    energy_level: int = Field(default=50, ge=0, le=100)
    speech_pace_wpm: Optional[int] = Field(None, ge=0)
    mood_tags: list[str] = Field(default_factory=list)
    ai_insights: Optional[str] = Field(None, max_length=2000)


class VideoAnalysisRequest(BaseModel):
    segment_start_sec: int = Field(..., ge=0)
    segment_end_sec: int = Field(..., ge=0)
    engagement_score: int = Field(default=50, ge=0, le=100)
    facial_expression: str = Field(default="neutral")
    eye_contact_pct: Optional[int] = Field(None, ge=0, le=100)
    posture_score: Optional[int] = Field(None, ge=0, le=100)
    attention_flags: list[str] = Field(default_factory=list)
    ai_insights: Optional[str] = Field(None, max_length=2000)


_VALID_SESSION_TYPES = frozenset({"video", "voice"})
_VALID_STATUSES = frozenset({"scheduled", "active", "ended", "cancelled"})
_VALID_SENTIMENTS = frozenset({"positive", "neutral", "negative", "distressed"})
_VALID_EXPRESSIONS = frozenset({"happy", "neutral", "sad", "anxious", "frustrated"})


# ── Routes ───────────────────────────────────────────────────────────────────────

@router.post("/sessions", status_code=201)
def create_session(
    body: CreateSessionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Patient or clinician creates a virtual care session."""
    patient = _require_patient(actor, db)
    if body.session_type not in _VALID_SESSION_TYPES:
        raise ApiServiceError(
            code="invalid_session_type",
            message=f"session_type must be one of: {', '.join(sorted(_VALID_SESSION_TYPES))}",
            status_code=422,
        )
    now = datetime.now(timezone.utc)
    session = VirtualCareSession(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        session_type=body.session_type,
        status="scheduled",
        appointment_id=(body.appointment_id or "").strip() or None,
        room_name=(body.room_name or "").strip() or None,
        created_at=now,
        updated_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session": _session_to_dict(session)}


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Get session details with latest biometrics and analysis counts."""
    patient = _require_patient(actor, db)
    session = db.query(VirtualCareSession).filter(
        VirtualCareSession.id == session_id,
        VirtualCareSession.patient_id == patient.id,
    ).first()
    if session is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    bio_count = db.query(BiometricsSnapshot).filter(BiometricsSnapshot.session_id == session_id).count()
    voice_count = db.query(VoiceAnalysis).filter(VoiceAnalysis.session_id == session_id).count()
    video_count = db.query(VideoAnalysis).filter(VideoAnalysis.session_id == session_id).count()

    result = _session_to_dict(session)
    result["biometrics_count"] = bio_count
    result["voice_analysis_count"] = voice_count
    result["video_analysis_count"] = video_count
    return {"session": result}


@router.patch("/sessions/{session_id}/start")
def start_session(
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Mark session as active and set started_at."""
    patient = _require_patient(actor, db)
    session = db.query(VirtualCareSession).filter(
        VirtualCareSession.id == session_id,
        VirtualCareSession.patient_id == patient.id,
    ).first()
    if session is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    now = datetime.now(timezone.utc)
    session.status = "active"
    session.started_at = now
    session.updated_at = now
    db.commit()
    db.refresh(session)
    return {"session": _session_to_dict(session)}


@router.patch("/sessions/{session_id}/end")
def end_session(
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Mark session as ended, compute duration, generate AI summary."""
    patient = _require_patient(actor, db)
    session = db.query(VirtualCareSession).filter(
        VirtualCareSession.id == session_id,
        VirtualCareSession.patient_id == patient.id,
    ).first()
    if session is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    now = datetime.now(timezone.utc)
    session.status = "ended"
    session.ended_at = now
    if session.started_at:
        session.duration_seconds = int((now - session.started_at).total_seconds())

    # Generate simple AI summary from available analysis
    voice_rows = db.query(VoiceAnalysis).filter(VoiceAnalysis.session_id == session_id).order_by(VoiceAnalysis.segment_start_sec).all()
    video_rows = db.query(VideoAnalysis).filter(VideoAnalysis.session_id == session_id).order_by(VideoAnalysis.segment_start_sec).all()

    summaries = []
    if voice_rows:
        avg_stress = sum(v.stress_level for v in voice_rows) / len(voice_rows)
        sentiments = {v.sentiment for v in voice_rows}
        summaries.append(f"Voice: avg stress {avg_stress:.0f}/100, sentiments: {', '.join(sorted(sentiments))}.")
    if video_rows:
        avg_engagement = sum(v.engagement_score for v in video_rows) / len(video_rows)
        expressions = {v.facial_expression for v in video_rows}
        summaries.append(f"Video: avg engagement {avg_engagement:.0f}/100, expressions: {', '.join(sorted(expressions))}.")

    if summaries:
        session.ai_summary = " ".join(summaries)

    session.updated_at = now
    db.commit()
    db.refresh(session)
    return {"session": _session_to_dict(session)}


@router.post("/sessions/{session_id}/biometrics", status_code=201)
def submit_biometrics(
    body: BiometricsRequest,
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Submit a biometrics snapshot for the session."""
    patient = _require_patient(actor, db)
    session = db.query(VirtualCareSession).filter(
        VirtualCareSession.id == session_id,
        VirtualCareSession.patient_id == patient.id,
    ).first()
    if session is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    snap = BiometricsSnapshot(
        id=str(uuid.uuid4()),
        session_id=session_id,
        patient_id=patient.id,
        source=body.source,
        heart_rate_bpm=body.heart_rate_bpm,
        hrv_ms=body.hrv_ms,
        spo2_pct=body.spo2_pct,
        blood_pressure_sys=body.blood_pressure_sys,
        blood_pressure_dia=body.blood_pressure_dia,
        stress_score=body.stress_score,
        sleep_hours_last_night=body.sleep_hours_last_night,
        steps_today=body.steps_today,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return {"biometrics": _bio_to_dict(snap)}


@router.get("/sessions/{session_id}/biometrics")
def list_biometrics(
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """List all biometrics snapshots for the session."""
    patient = _require_patient(actor, db)
    rows = (
        db.query(BiometricsSnapshot)
        .filter(BiometricsSnapshot.session_id == session_id, BiometricsSnapshot.patient_id == patient.id)
        .order_by(BiometricsSnapshot.recorded_at.desc())
        .all()
    )
    return {"biometrics": [_bio_to_dict(r) for r in rows]}


@router.post("/sessions/{session_id}/voice-analysis", status_code=201)
def submit_voice_analysis(
    body: VoiceAnalysisRequest,
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Submit a voice analysis segment for the session."""
    patient = _require_patient(actor, db)
    session = db.query(VirtualCareSession).filter(
        VirtualCareSession.id == session_id,
        VirtualCareSession.patient_id == patient.id,
    ).first()
    if session is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    if body.sentiment not in _VALID_SENTIMENTS:
        raise ApiServiceError(
            code="invalid_sentiment",
            message=f"sentiment must be one of: {', '.join(sorted(_VALID_SENTIMENTS))}",
            status_code=422,
        )

    va = VoiceAnalysis(
        id=str(uuid.uuid4()),
        session_id=session_id,
        patient_id=patient.id,
        segment_start_sec=body.segment_start_sec,
        segment_end_sec=body.segment_end_sec,
        sentiment=body.sentiment,
        stress_level=body.stress_level,
        energy_level=body.energy_level,
        speech_pace_wpm=body.speech_pace_wpm,
        mood_tags_json=json.dumps(body.mood_tags),
        ai_insights=(body.ai_insights or "").strip() or None,
    )
    db.add(va)
    db.commit()
    db.refresh(va)
    _trigger_vc_risk_recompute(patient.id, "voice_analysis_submitted", db)
    return {"voice_analysis": _voice_to_dict(va)}


@router.get("/sessions/{session_id}/voice-analysis")
def list_voice_analysis(
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """List all voice analysis segments for the session."""
    patient = _require_patient(actor, db)
    rows = (
        db.query(VoiceAnalysis)
        .filter(VoiceAnalysis.session_id == session_id, VoiceAnalysis.patient_id == patient.id)
        .order_by(VoiceAnalysis.segment_start_sec.asc())
        .all()
    )
    return {"voice_analysis": [_voice_to_dict(r) for r in rows]}


@router.post("/sessions/{session_id}/video-analysis", status_code=201)
def submit_video_analysis(
    body: VideoAnalysisRequest,
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Submit a video analysis segment for the session."""
    patient = _require_patient(actor, db)
    session = db.query(VirtualCareSession).filter(
        VirtualCareSession.id == session_id,
        VirtualCareSession.patient_id == patient.id,
    ).first()
    if session is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    if body.facial_expression not in _VALID_EXPRESSIONS:
        raise ApiServiceError(
            code="invalid_expression",
            message=f"facial_expression must be one of: {', '.join(sorted(_VALID_EXPRESSIONS))}",
            status_code=422,
        )

    va = VideoAnalysis(
        id=str(uuid.uuid4()),
        session_id=session_id,
        patient_id=patient.id,
        segment_start_sec=body.segment_start_sec,
        segment_end_sec=body.segment_end_sec,
        engagement_score=body.engagement_score,
        facial_expression=body.facial_expression,
        eye_contact_pct=body.eye_contact_pct,
        posture_score=body.posture_score,
        attention_flags_json=json.dumps(body.attention_flags),
        ai_insights=(body.ai_insights or "").strip() or None,
    )
    db.add(va)
    db.commit()
    db.refresh(va)
    _trigger_vc_risk_recompute(patient.id, "video_analysis_submitted", db)
    return {"video_analysis": _video_to_dict(va)}


@router.get("/sessions/{session_id}/video-analysis")
def list_video_analysis(
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """List all video analysis segments for the session."""
    patient = _require_patient(actor, db)
    rows = (
        db.query(VideoAnalysis)
        .filter(VideoAnalysis.session_id == session_id, VideoAnalysis.patient_id == patient.id)
        .order_by(VideoAnalysis.segment_start_sec.asc())
        .all()
    )
    return {"video_analysis": [_video_to_dict(r) for r in rows]}


@router.get("/sessions/{session_id}/analysis")
def get_unified_analysis(
    session_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Get unified analysis summary for the session."""
    patient = _require_patient(actor, db)
    session = db.query(VirtualCareSession).filter(
        VirtualCareSession.id == session_id,
        VirtualCareSession.patient_id == patient.id,
    ).first()
    if session is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    bio_rows = (
        db.query(BiometricsSnapshot)
        .filter(BiometricsSnapshot.session_id == session_id)
        .order_by(BiometricsSnapshot.recorded_at.desc())
        .limit(10)
        .all()
    )
    voice_rows = (
        db.query(VoiceAnalysis)
        .filter(VoiceAnalysis.session_id == session_id)
        .order_by(VoiceAnalysis.segment_start_sec.asc())
        .all()
    )
    video_rows = (
        db.query(VideoAnalysis)
        .filter(VideoAnalysis.session_id == session_id)
        .order_by(VideoAnalysis.segment_start_sec.asc())
        .all()
    )

    # Compute aggregates
    voice_summary = None
    if voice_rows:
        voice_summary = {
            "segment_count": len(voice_rows),
            "avg_stress": round(sum(v.stress_level for v in voice_rows) / len(voice_rows), 1),
            "avg_energy": round(sum(v.energy_level for v in voice_rows) / len(voice_rows), 1),
            "sentiment_distribution": {},
        }
        for v in voice_rows:
            voice_summary["sentiment_distribution"][v.sentiment] = voice_summary["sentiment_distribution"].get(v.sentiment, 0) + 1

    video_summary = None
    if video_rows:
        video_summary = {
            "segment_count": len(video_rows),
            "avg_engagement": round(sum(v.engagement_score for v in video_rows) / len(video_rows), 1),
            "expression_distribution": {},
        }
        for v in video_rows:
            video_summary["expression_distribution"][v.facial_expression] = video_summary["expression_distribution"].get(v.facial_expression, 0) + 1

    return {
        "session": _session_to_dict(session),
        "latest_biometrics": [_bio_to_dict(b) for b in bio_rows],
        "voice_analysis": [_voice_to_dict(v) for v in voice_rows],
        "video_analysis": [_video_to_dict(v) for v in video_rows],
        "voice_summary": voice_summary,
        "video_summary": video_summary,
    }
