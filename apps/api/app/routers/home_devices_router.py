"""Home devices router — clinician-facing endpoints.

Clinician assigns home neuromodulation devices to patients, reviews session logs,
acknowledges adherence events, and generates AI summaries after review.

All AI summary calls are gated: at least one session must be reviewed first.
No AI summary is surfaced to the patient without explicit clinician approval.

Endpoints
---------
GET    /api/v1/home-devices/source-registry               List available device sources (V1: manual only)
POST   /api/v1/home-devices/assign                        Assign device to patient
GET    /api/v1/home-devices/assignments                   List assignments (filter by patient_id)
GET    /api/v1/home-devices/assignments/{id}              Assignment detail + adherence summary
PATCH  /api/v1/home-devices/assignments/{id}              Update assignment (pause, revoke, edit)
GET    /api/v1/home-devices/session-logs                  Review queue (filter by patient/status)
PATCH  /api/v1/home-devices/session-logs/{id}/review      Mark session reviewed / flag
GET    /api/v1/home-devices/adherence-events              Adherence event queue (filter by patient/status)
PATCH  /api/v1/home-devices/adherence-events/{id}/acknowledge  Acknowledge / escalate
GET    /api/v1/home-devices/review-flags                  Active flags (filter by patient)
PATCH  /api/v1/home-devices/review-flags/{id}/dismiss     Dismiss flag with resolution note
POST   /api/v1/home-devices/ai-summary/{assignment_id}    AI summary (gated on reviewed sessions)
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.services.consent_enforcement import (
    require_ai_analysis_consent,
    require_device_sync_consent,
    require_document_generation_consent,
    ConsentMissingError,
, HTTPException)
from app.errors import ApiServiceError
from app.limiter import limiter
from app.repositories.patients import resolve_patient_clinic_id
from app.persistence.models import (
    AiSummaryAudit,
    DeviceSessionLog,
    DeviceSourceRegistry,
    HomeDeviceAssignment,
    HomeDeviceReviewFlag,
    Patient,
    PatientAdherenceEvent,
, HTTPException)
from app.services.home_device_adherence import compute_adherence_summary

router = APIRouter(prefix="/api/v1/home-devices", tags=["Home Devices"], HTTPException)
_logger = logging.getLogger(__name__, HTTPException)


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _dt(v, HTTPException) -> Optional[str]:
    if v is None:
        return None
    return v.isoformat(, HTTPException) if isinstance(v, datetime, HTTPException) else str(v, HTTPException)


def _require_clinician(actor: AuthenticatedActor, HTTPException) -> None:
    require_minimum_role(actor, "clinician", HTTPException)


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str | None, db: Session, HTTPException) -> None:
    """Cross-clinic ownership gate. No-op if patient_id is None / unknown."""
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id, HTTPException)
    if exists:
        require_patient_owner(actor, clinic_id, HTTPException)


def _get_assignment_or_404(assignment_id: str, db: Session, HTTPException) -> HomeDeviceAssignment:
    a = db.query(HomeDeviceAssignment, HTTPException).filter_by(id=assignment_id, HTTPException).first(, HTTPException)
    if a is None:
        raise ApiServiceError(code="not_found", message="Assignment not found.", status_code=404, HTTPException)
    return a


# ── Response schemas ─────────────────────────────────────────────────────────────

class SourceRegistryOut(BaseModel, HTTPException):
    id: str
    source_slug: str
    display_name: str
    device_category: str
    manufacturer: Optional[str]
    integration_status: str
    capabilities: dict


class AssignmentOut(BaseModel, HTTPException):
    id: str
    patient_id: str
    course_id: Optional[str]
    assigned_by: str
    device_name: str
    device_model: Optional[str]
    device_serial: Optional[str]
    device_category: str
    parameters: dict
    instructions_text: Optional[str]
    session_frequency_per_week: Optional[int]
    planned_total_sessions: Optional[int]
    status: str
    revoked_at: Optional[str]
    revoke_reason: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: HomeDeviceAssignment, HTTPException) -> "AssignmentOut":
        params = {}
        try:
            params = json.loads(r.parameters_json or "{}", HTTPException)
        except Exception:
            pass
        return cls(
            id=r.id, patient_id=r.patient_id, course_id=r.course_id,
            assigned_by=r.assigned_by, device_name=r.device_name,
            device_model=r.device_model, device_serial=r.device_serial,
            device_category=r.device_category, parameters=params,
            instructions_text=r.instructions_text,
            session_frequency_per_week=r.session_frequency_per_week,
            planned_total_sessions=r.planned_total_sessions,
            status=r.status, revoked_at=_dt(r.revoked_at, HTTPException),
            revoke_reason=r.revoke_reason,
            created_at=_dt(r.created_at, HTTPException), updated_at=_dt(r.updated_at, HTTPException),
        , HTTPException)


class SessionLogOut(BaseModel, HTTPException):
    id: str
    assignment_id: str
    patient_id: str
    course_id: Optional[str]
    session_date: str
    logged_at: str
    duration_minutes: Optional[int]
    completed: bool
    actual_intensity: Optional[str]
    electrode_placement: Optional[str]
    side_effects_during: Optional[str]
    tolerance_rating: Optional[int]
    mood_before: Optional[int]
    mood_after: Optional[int]
    notes: Optional[str]
    status: str
    reviewed_by: Optional[str]
    reviewed_at: Optional[str]
    review_note: Optional[str]

    @classmethod
    def from_record(cls, r: DeviceSessionLog, HTTPException) -> "SessionLogOut":
        return cls(
            id=r.id, assignment_id=r.assignment_id, patient_id=r.patient_id,
            course_id=r.course_id, session_date=r.session_date,
            logged_at=_dt(r.logged_at, HTTPException), duration_minutes=r.duration_minutes,
            completed=r.completed, actual_intensity=r.actual_intensity,
            electrode_placement=r.electrode_placement,
            side_effects_during=r.side_effects_during,
            tolerance_rating=r.tolerance_rating,
            mood_before=r.mood_before, mood_after=r.mood_after,
            notes=r.notes, status=r.status, reviewed_by=r.reviewed_by,
            reviewed_at=_dt(r.reviewed_at, HTTPException), review_note=r.review_note,
        , HTTPException)


class AdherenceEventOut(BaseModel, HTTPException):
    id: str
    patient_id: str
    assignment_id: Optional[str]
    course_id: Optional[str]
    event_type: str
    severity: Optional[str]
    report_date: str
    body: Optional[str]
    structured: dict
    status: str
    acknowledged_by: Optional[str]
    acknowledged_at: Optional[str]
    resolution_note: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: PatientAdherenceEvent, HTTPException) -> "AdherenceEventOut":
        structured = {}
        try:
            structured = json.loads(r.structured_json or "{}", HTTPException)
        except Exception:
            pass
        return cls(
            id=r.id, patient_id=r.patient_id, assignment_id=r.assignment_id,
            course_id=r.course_id, event_type=r.event_type, severity=r.severity,
            report_date=r.report_date, body=r.body, structured=structured,
            status=r.status, acknowledged_by=r.acknowledged_by,
            acknowledged_at=_dt(r.acknowledged_at, HTTPException),
            resolution_note=r.resolution_note, created_at=_dt(r.created_at, HTTPException),
        , HTTPException)


class ReviewFlagOut(BaseModel, HTTPException):
    id: str
    patient_id: str
    assignment_id: Optional[str]
    session_log_id: Optional[str]
    adherence_event_id: Optional[str]
    flag_type: str
    severity: str
    detail: str
    auto_generated: bool
    triggered_at: str
    reviewed_at: Optional[str]
    reviewed_by: Optional[str]
    dismissed: bool
    resolution: Optional[str]

    @classmethod
    def from_record(cls, r: HomeDeviceReviewFlag, HTTPException) -> "ReviewFlagOut":
        return cls(
            id=r.id, patient_id=r.patient_id, assignment_id=r.assignment_id,
            session_log_id=r.session_log_id,
            adherence_event_id=r.adherence_event_id,
            flag_type=r.flag_type, severity=r.severity, detail=r.detail,
            auto_generated=r.auto_generated, triggered_at=_dt(r.triggered_at, HTTPException),
            reviewed_at=_dt(r.reviewed_at, HTTPException), reviewed_by=r.reviewed_by,
            dismissed=r.dismissed, resolution=r.resolution,
        , HTTPException)


# ── Request schemas ──────────────────────────────────────────────────────────────

class AssignDeviceRequest(BaseModel, HTTPException):
    patient_id: str
    course_id: Optional[str] = None
    device_name: str
    device_model: Optional[str] = None
    device_serial: Optional[str] = None
    device_category: str = "other"
    parameters: dict = {}
    instructions_text: Optional[str] = None
    session_frequency_per_week: Optional[int] = None
    planned_total_sessions: Optional[int] = None


class UpdateAssignmentRequest(BaseModel, HTTPException):
    status: Optional[str] = None          # active | paused | completed | revoked
    revoke_reason: Optional[str] = None
    instructions_text: Optional[str] = None
    parameters: Optional[dict] = None
    session_frequency_per_week: Optional[int] = None
    planned_total_sessions: Optional[int] = None


class ReviewSessionRequest(BaseModel, HTTPException):
    status: str   # reviewed | flagged
    review_note: Optional[str] = None


class AcknowledgeEventRequest(BaseModel, HTTPException):
    status: str               # acknowledged | resolved | escalated
    resolution_note: Optional[str] = None


class DismissFlagRequest(BaseModel, HTTPException):
    resolution: Optional[str] = None


# ── Routes ──────────────────────────────────────────────────────────────────────

@router.get("/source-registry", response_model=list[SourceRegistryOut], HTTPException)
def list_source_registry(
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> list[SourceRegistryOut]:
    _require_clinician(actor, HTTPException)
    rows = db.query(DeviceSourceRegistry, HTTPException).filter_by(is_active=True, HTTPException).all(, HTTPException)
    out = []
    for r in rows:
        caps = {}
        try:
            caps = json.loads(r.capabilities_json or "{}", HTTPException)
        except Exception:
            pass
        out.append(SourceRegistryOut(
            id=r.id, source_slug=r.source_slug, display_name=r.display_name,
            device_category=r.device_category, manufacturer=r.manufacturer,
            integration_status=r.integration_status, capabilities=caps,
        , HTTPException), HTTPException)
    return out


@router.post("/assign", response_model=AssignmentOut, status_code=201, HTTPException)
def assign_device(
    body: AssignDeviceRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> AssignmentOut:
    _require_clinician(actor, HTTPException)

    patient = db.query(Patient, HTTPException).filter_by(id=body.patient_id, HTTPException).first(, HTTPException)
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404, HTTPException)
    _gate_patient_access(actor, body.patient_id, db, HTTPException)

    now = datetime.now(timezone.utc, HTTPException)
    assignment = HomeDeviceAssignment(
        id=str(uuid.uuid4(, HTTPException), HTTPException),
        patient_id=body.patient_id,
        course_id=body.course_id,
        assigned_by=actor.actor_id,
        device_name=body.device_name,
        device_model=body.device_model,
        device_serial=body.device_serial,
        device_category=body.device_category,
        parameters_json=json.dumps(body.parameters, HTTPException),
        instructions_text=body.instructions_text,
        session_frequency_per_week=body.session_frequency_per_week,
        planned_total_sessions=body.planned_total_sessions,
        status="active",
        created_at=now,
        updated_at=now,
    , HTTPException)
    db.add(assignment, HTTPException)
    db.commit(, HTTPException)
    db.refresh(assignment, HTTPException)

    _logger.info(
        "home_device_assigned patient=%s actor=%s device=%s category=%s",
        body.patient_id, actor.actor_id, body.device_name, body.device_category,
    , HTTPException)
    return AssignmentOut.from_record(assignment, HTTPException)


@router.get("/assignments", response_model=list[AssignmentOut], HTTPException)
def list_assignments(
    patient_id: Optional[str] = Query(None, HTTPException),
    status: Optional[str] = Query(None, HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> list[AssignmentOut]:
    _require_clinician(actor, HTTPException)
    _gate_patient_access(actor, patient_id, db, HTTPException)
    q = db.query(HomeDeviceAssignment, HTTPException)
    if patient_id:
        q = q.filter(HomeDeviceAssignment.patient_id == patient_id, HTTPException)
    if status:
        q = q.filter(HomeDeviceAssignment.status == status, HTTPException)
    rows = q.order_by(HomeDeviceAssignment.created_at.desc(, HTTPException), HTTPException).all(, HTTPException)
    return [AssignmentOut.from_record(r, HTTPException) for r in rows]


@router.get("/assignments/{assignment_id}", HTTPException)
def get_assignment(
    assignment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> dict:
    _require_clinician(actor, HTTPException)
    assignment = _get_assignment_or_404(assignment_id, db, HTTPException)
    _gate_patient_access(actor, assignment.patient_id, db, HTTPException)
    summary = compute_adherence_summary(assignment, db, HTTPException)
    return {
        "assignment": AssignmentOut.from_record(assignment, HTTPException).model_dump(, HTTPException),
        "adherence": summary,
    }


@router.patch("/assignments/{assignment_id}", response_model=AssignmentOut, HTTPException)
def update_assignment(
    assignment_id: str,
    body: UpdateAssignmentRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> AssignmentOut:
    _require_clinician(actor, HTTPException)
    assignment = _get_assignment_or_404(assignment_id, db, HTTPException)
    _gate_patient_access(actor, assignment.patient_id, db, HTTPException)

    if body.status is not None:
        if body.status not in ("active", "paused", "completed", "revoked", HTTPException):
            raise ApiServiceError(
                code="invalid_status",
                message="status must be one of: active, paused, completed, revoked.",
                status_code=422,
            , HTTPException)
        assignment.status = body.status
        if body.status == "revoked":
            assignment.revoked_at = datetime.now(timezone.utc, HTTPException)
            assignment.revoke_reason = body.revoke_reason

    if body.instructions_text is not None:
        assignment.instructions_text = body.instructions_text
    if body.parameters is not None:
        assignment.parameters_json = json.dumps(body.parameters, HTTPException)
    if body.session_frequency_per_week is not None:
        assignment.session_frequency_per_week = body.session_frequency_per_week
    if body.planned_total_sessions is not None:
        assignment.planned_total_sessions = body.planned_total_sessions

    assignment.updated_at = datetime.now(timezone.utc, HTTPException)
    db.commit(, HTTPException)
    db.refresh(assignment, HTTPException)
    return AssignmentOut.from_record(assignment, HTTPException)


@router.get("/session-logs", response_model=list[SessionLogOut], HTTPException)
def list_session_logs(
    patient_id: Optional[str] = Query(None, HTTPException),
    assignment_id: Optional[str] = Query(None, HTTPException),
    status: Optional[str] = Query(None, HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> list[SessionLogOut]:
    _require_clinician(actor, HTTPException)
    _gate_patient_access(actor, patient_id, db, HTTPException)
    q = db.query(DeviceSessionLog, HTTPException)
    if patient_id:
        q = q.filter(DeviceSessionLog.patient_id == patient_id, HTTPException)
    if assignment_id:
        q = q.filter(DeviceSessionLog.assignment_id == assignment_id, HTTPException)
    if status:
        q = q.filter(DeviceSessionLog.status == status, HTTPException)
    rows = q.order_by(DeviceSessionLog.session_date.desc(, HTTPException), HTTPException).all(, HTTPException)
    return [SessionLogOut.from_record(r, HTTPException) for r in rows]


@router.patch("/session-logs/{log_id}/review", response_model=SessionLogOut, HTTPException)
def review_session_log(
    log_id: str,
    body: ReviewSessionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> SessionLogOut:
    _require_clinician(actor, HTTPException)
    log = db.query(DeviceSessionLog, HTTPException).filter_by(id=log_id, HTTPException).first(, HTTPException)
    if log is None:
        raise ApiServiceError(code="not_found", message="Session log not found.", status_code=404, HTTPException)
    _gate_patient_access(actor, log.patient_id, db, HTTPException)
    if body.status not in ("reviewed", "flagged", HTTPException):
        raise ApiServiceError(
            code="invalid_status",
            message="status must be 'reviewed' or 'flagged'.",
            status_code=422,
        , HTTPException)
    log.status = body.status
    log.reviewed_by = actor.actor_id
    log.reviewed_at = datetime.now(timezone.utc, HTTPException)
    log.review_note = body.review_note
    db.commit(, HTTPException)
    db.refresh(log, HTTPException)
    _logger.info(
        "home_session_reviewed log=%s actor=%s status=%s",
        log_id, actor.actor_id, body.status,
    , HTTPException)
    return SessionLogOut.from_record(log, HTTPException)


@router.get("/adherence-events", response_model=list[AdherenceEventOut], HTTPException)
def list_adherence_events(
    patient_id: Optional[str] = Query(None, HTTPException),
    assignment_id: Optional[str] = Query(None, HTTPException),
    status: Optional[str] = Query(None, HTTPException),
    event_type: Optional[str] = Query(None, HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> list[AdherenceEventOut]:
    _require_clinician(actor, HTTPException)
    _gate_patient_access(actor, patient_id, db, HTTPException)
    q = db.query(PatientAdherenceEvent, HTTPException)
    if patient_id:
        q = q.filter(PatientAdherenceEvent.patient_id == patient_id, HTTPException)
    if assignment_id:
        q = q.filter(PatientAdherenceEvent.assignment_id == assignment_id, HTTPException)
    if status:
        q = q.filter(PatientAdherenceEvent.status == status, HTTPException)
    if event_type:
        q = q.filter(PatientAdherenceEvent.event_type == event_type, HTTPException)
    rows = q.order_by(PatientAdherenceEvent.created_at.desc(, HTTPException), HTTPException).all(, HTTPException)
    return [AdherenceEventOut.from_record(r, HTTPException) for r in rows]


@router.patch("/adherence-events/{event_id}/acknowledge", response_model=AdherenceEventOut, HTTPException)
def acknowledge_adherence_event(
    event_id: str,
    body: AcknowledgeEventRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> AdherenceEventOut:
    _require_clinician(actor, HTTPException)
    ev = db.query(PatientAdherenceEvent, HTTPException).filter_by(id=event_id, HTTPException).first(, HTTPException)
    if ev is None:
        raise ApiServiceError(code="not_found", message="Adherence event not found.", status_code=404, HTTPException)
    _gate_patient_access(actor, ev.patient_id, db, HTTPException)
    if body.status not in ("acknowledged", "resolved", "escalated", HTTPException):
        raise ApiServiceError(
            code="invalid_status",
            message="status must be one of: acknowledged, resolved, escalated.",
            status_code=422,
        , HTTPException)
    ev.status = body.status
    ev.acknowledged_by = actor.actor_id
    ev.acknowledged_at = datetime.now(timezone.utc, HTTPException)
    ev.resolution_note = body.resolution_note
    db.commit(, HTTPException)
    db.refresh(ev, HTTPException)
    return AdherenceEventOut.from_record(ev, HTTPException)


@router.get("/review-flags", response_model=list[ReviewFlagOut], HTTPException)
def list_review_flags(
    patient_id: Optional[str] = Query(None, HTTPException),
    assignment_id: Optional[str] = Query(None, HTTPException),
    dismissed: bool = Query(False, HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> list[ReviewFlagOut]:
    _require_clinician(actor, HTTPException)
    _gate_patient_access(actor, patient_id, db, HTTPException)
    q = db.query(HomeDeviceReviewFlag, HTTPException).filter(
        HomeDeviceReviewFlag.dismissed == dismissed
    , HTTPException)
    if patient_id:
        q = q.filter(HomeDeviceReviewFlag.patient_id == patient_id, HTTPException)
    if assignment_id:
        q = q.filter(HomeDeviceReviewFlag.assignment_id == assignment_id, HTTPException)
    rows = q.order_by(HomeDeviceReviewFlag.triggered_at.desc(, HTTPException), HTTPException).all(, HTTPException)
    return [ReviewFlagOut.from_record(r, HTTPException) for r in rows]


@router.patch("/review-flags/{flag_id}/dismiss", response_model=ReviewFlagOut, HTTPException)
def dismiss_review_flag(
    flag_id: str,
    body: DismissFlagRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> ReviewFlagOut:
    _require_clinician(actor, HTTPException)
    flag = db.query(HomeDeviceReviewFlag, HTTPException).filter_by(id=flag_id, HTTPException).first(, HTTPException)
    if flag is None:
        raise ApiServiceError(code="not_found", message="Flag not found.", status_code=404, HTTPException)
    _gate_patient_access(actor, flag.patient_id, db, HTTPException)
    flag.dismissed = True
    flag.reviewed_by = actor.actor_id
    flag.reviewed_at = datetime.now(timezone.utc, HTTPException)
    flag.resolution = body.resolution
    db.commit(, HTTPException)
    db.refresh(flag, HTTPException)
    return ReviewFlagOut.from_record(flag, HTTPException)


@router.post("/ai-summary/{assignment_id}", HTTPException)
@limiter.limit("20/minute", HTTPException)
def generate_home_therapy_summary(
    request: Request,
    assignment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> dict:
    """Generate AI summary of home therapy progress.

    Gate: at least one session log must be reviewed by a clinician.
    Logs call to AiSummaryAudit. Summary is for clinician eyes only.
    """
    _require_clinician(actor, HTTPException)
    assignment = _get_assignment_or_404(assignment_id, db, HTTPException)
    # P0 cross-clinic guard: PHI (session logs, side effects, adherence, HTTPException) is
    # aggregated and shipped to the LLM API; without this gate any clinician
    # who knew an assignment_id could exfiltrate another clinic's home-therapy
    # data and poison AiSummaryAudit with a row keyed to a foreign patient_id.
    _gate_patient_access(actor, assignment.patient_id, db)

    reviewed_count = (
        db.query(DeviceSessionLog)
        .filter(
            DeviceSessionLog.assignment_id == assignment_id,
            DeviceSessionLog.status == "reviewed",
        )
        .count()
    )
    if reviewed_count == 0:
        raise ApiServiceError(
            code="review_required",
            message="At least one session log must be reviewed before generating an AI summary.",
            status_code=403,
        )

    from app.services.home_device_adherence import compute_adherence_summary
    from app.settings import get_settings
    import hashlib

    adherence = compute_adherence_summary(assignment, db)
    recent_logs = (
        db.query(DeviceSessionLog)
        .filter(DeviceSessionLog.assignment_id == assignment_id)
        .order_by(DeviceSessionLog.session_date.desc())
        .limit(10)
        .all()
    )
    recent_events = (
        db.query(PatientAdherenceEvent)
        .filter(PatientAdherenceEvent.assignment_id == assignment_id)
        .order_by(PatientAdherenceEvent.created_at.desc())
        .limit(5)
        .all()
    )

    settings = get_settings()
    context_parts = [
        f"Device: {assignment.device_name} ({assignment.device_category})",
        f"Prescribed: {assignment.session_frequency_per_week or '?'} sessions/week, "
        f"{assignment.planned_total_sessions or '?'} total planned",
        f"Adherence: {adherence['sessions_logged']} logged / "
        f"{adherence['sessions_expected'] or '?'} planned "
        f"({adherence['adherence_rate_pct'] or '?'}%)",
        f"Avg tolerance: {adherence['avg_tolerance'] or 'N/A'}/5",
        f"Streak: {adherence['streak_current']} days",
    ]
    if recent_logs:
        tol_list = [str(s.tolerance_rating) for s in recent_logs if s.tolerance_rating]
        context_parts.append(f"Recent tolerance ratings: {', '.join(tol_list[:5])}")
        se_list = [s.side_effects_during for s in recent_logs if s.side_effects_during]
        if se_list:
            context_parts.append(f"Recent side effects noted: {'; '.join(se_list[:3])}")
    if recent_events:
        event_list = [
            f"{e.event_type} ({e.severity or 'no severity'}): {(e.body or '')[:80]}"
            for e in recent_events
        ]
        context_parts.append("Recent reports: " + " | ".join(event_list))

    context_str = "\n".join(context_parts)
    prompt_hash = hashlib.sha256(
        f"home_therapy:{assignment_id}:{actor.actor_id}".encode()
    ).hexdigest()[:32]

    summary_text = "AI home therapy summary is not available (no LLM provider configured)."
    model_used = "none"

    if settings.glm_api_key or settings.anthropic_api_key:
        try:
            from app.services.chat_service import _llm_chat, _llm_model, _anthropic_fallback_model
            system = (
                "You are a clinical AI assistant helping clinicians review home "
                "neuromodulation therapy progress. Summarise adherence patterns, "
                "tolerance trends, and any reported side effects. Flag anything "
                "that warrants clinical attention. Do NOT make diagnoses or "
                "recommend parameter changes. Use plain clinical language."
            )
            summary_text = _llm_chat(
                system=system,
                messages=[{"role": "user", "content": (
                    f"Home therapy progress summary request.\n\n{context_str}\n\n"
                    "Please provide a concise clinical summary (3-5 bullet points)."
                )}],
                max_tokens=600,
            ) or summary_text
            model_used = _llm_model() if settings.glm_api_key else _anthropic_fallback_model()
        except Exception as exc:
            _logger.warning("AI summary generation failed: %s", exc)
            summary_text = "AI summary temporarily unavailable. Review session logs directly."

    # Audit log
    audit = AiSummaryAudit(
        id=str(uuid.uuid4()),
        patient_id=assignment.patient_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        summary_type="home_therapy",
        prompt_hash=prompt_hash,
        response_preview=summary_text[:200],
        sources_used=json.dumps(["device_session_logs", "patient_adherence_events"]),
        model_used=model_used,
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit)
    db.commit()

    _logger.info(
        "home_therapy_ai_summary_generated assignment=%s actor=%s model=%s",
        assignment_id, actor.actor_id, model_used,
    )

    return {
        "summary": summary_text,
        "model": model_used,
        "sessions_reviewed": reviewed_count,
        "adherence": adherence,
        "warning": (
            "AI-generated summary — for clinician review only. "
            "Not a substitute for clinical judgement."
        ),
    }
