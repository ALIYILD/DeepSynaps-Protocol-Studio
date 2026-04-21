"""Patient portal router — self-service endpoints for patient-role users.

Endpoints
---------
GET  /api/v1/patient-portal/me                    Patient record linked to the authenticated user
GET  /api/v1/patient-portal/courses               Treatment courses for the authenticated patient
GET  /api/v1/patient-portal/sessions              Sessions across all courses for the patient
GET  /api/v1/patient-portal/assessments           Assessment records for the patient
GET  /api/v1/patient-portal/outcomes              Outcome measurements for the patient
GET  /api/v1/patient-portal/messages              Messages for the authenticated patient
POST /api/v1/patient-portal/messages              Send a message from the patient
GET  /api/v1/patient-portal/wearables             Device connections for the patient
GET  /api/v1/patient-portal/wearable-summary      7-day daily summary for the patient
POST /api/v1/patient-portal/wearable-connect      Register/update a device connection
DELETE /api/v1/patient-portal/wearable-connect/{id}  Remove a device connection
POST /api/v1/patient-portal/wearable-sync         Submit daily summary from patient device
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, Path, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AssessmentRecord,
    ClinicalSession,
    ClinicianHomeProgramTask,
    DeliveredSessionParameters,
    DeviceConnection,
    Message,
    OutcomeSeries,
    Patient,
    PatientHomeProgramTaskCompletion,
    TreatmentCourse,
    WearableDailySummary,
    WearableAlertFlag,
)
from deepsynaps_core_schema import patient_safe_home_program_selection

router = APIRouter(prefix="/api/v1/patient-portal", tags=["Patient Portal"])


# ── Helpers ────────────────────────────────────────────────────────────────────

_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"


def _require_patient(actor: AuthenticatedActor, db: Session) -> Patient:
    """Find the Patient record linked to this user account by email match."""
    from app.persistence.models import User

    # Demo patient actor — look up by any of the known demo emails (no DB
    # user row exists). The seed script uses patient@deepsynaps.com; older
    # deployments used patient@demo.com. Accept either so the portal works
    # on any seeded environment.
    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        patient = (
            db.query(Patient)
            .filter(Patient.email.in_(["patient@deepsynaps.com", "patient@demo.com"]))
            .first()
        )
        if patient:
            return patient
        raise ApiServiceError(
            code="patient_not_linked",
            message=(
                "No demo patient record found. Run `python apps/api/scripts/seed_demo.py` "
                "against the target database (or have a clinician create a patient with "
                "email patient@deepsynaps.com)."
            ),
            status_code=404,
        )

    user = db.query(User).filter_by(id=actor.actor_id).first()
    if user is None:
        raise ApiServiceError(code="not_found", message="User account not found.", status_code=404)

    # Match by email — clinicians enter the patient's email when creating the record
    patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="patient_not_linked",
            message="No patient record is linked to this account. Contact your clinic.",
            status_code=404,
        )
    return patient


def _dt(v) -> str:
    return v.isoformat() if isinstance(v, datetime) else str(v)


# ── Response schemas ───────────────────────────────────────────────────────────

class PatientPortalMe(BaseModel):
    patient_id: str
    first_name: str
    last_name: str
    dob: Optional[str]
    gender: Optional[str]
    primary_condition: Optional[str]
    status: str
    user_id: str
    user_email: str
    user_display_name: str


class PortalCourseOut(BaseModel):
    id: str
    protocol_id: str
    condition_slug: Optional[str]
    modality_slug: Optional[str]
    status: str
    clinician_notes: Optional[str]
    session_count: int
    total_sessions_planned: Optional[int]
    started_at: Optional[str]
    created_at: str


class PortalSessionOut(BaseModel):
    """Unified row for the patient sessions feed.

    Two record kinds flow through here and only some fields are populated for each:
      * Delivered telemetry (``DeliveredSessionParameters``) — populates ``course_id``,
        ``device_slug``, ``tolerance_rating``, ``post_session_notes``, ``duration_minutes``,
        ``delivered_at``. ``status`` is reported as ``"delivered"``.
      * Clinical bookings (``ClinicalSession``) — populates ``scheduled_at``, ``status``
        ("scheduled" / "confirmed" / etc.), ``modality``, ``session_number``,
        ``total_sessions``, ``duration_minutes``. ``course_id`` is left ``None`` because
        bookings are not linked to a treatment-course row in the current schema.

    The Patient Dashboard reads ``scheduled_at`` + ``status`` for the upcoming-session
    countdown; treatment-history views read ``delivered_at``.
    """

    id: str
    course_id: Optional[str] = None
    device_slug: Optional[str] = None
    tolerance_rating: Optional[str] = None
    post_session_notes: Optional[str] = None
    duration_minutes: Optional[int] = None
    delivered_at: Optional[str] = None  # created_at of the delivered-telemetry record
    scheduled_at: Optional[str] = None  # ISO datetime for upcoming bookings
    status: Optional[str] = None  # "scheduled" / "confirmed" / ... / "delivered"
    modality: Optional[str] = None
    session_number: Optional[int] = None
    total_sessions: Optional[int] = None


class PortalAssessmentOut(BaseModel):
    id: str
    template_id: str
    template_title: str
    score: Optional[str]
    status: str
    created_at: str


class PortalOutcomeOut(BaseModel):
    id: str
    course_id: str
    template_id: str
    template_title: str
    score: Optional[str]
    score_numeric: Optional[float]
    measurement_point: str
    administered_at: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/me", response_model=PatientPortalMe)
def get_portal_me(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientPortalMe:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    # Demo patient actor — accept either demo email; see _require_patient.
    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        patient = (
            db.query(Patient)
            .filter(Patient.email.in_(["patient@deepsynaps.com", "patient@demo.com"]))
            .first()
        )
        if patient is None:
            raise ApiServiceError(
                code="patient_not_linked",
                message=(
                    "No demo patient record. Run `python apps/api/scripts/seed_demo.py` "
                    "or have a clinician create a patient with email patient@deepsynaps.com."
                ),
                status_code=404,
            )
        return PatientPortalMe(
            patient_id=patient.id,
            first_name=patient.first_name,
            last_name=patient.last_name,
            dob=patient.dob,
            gender=patient.gender,
            primary_condition=patient.primary_condition,
            status=patient.status,
            user_id=actor.actor_id,
            user_email="patient@demo.com",
            user_display_name=actor.display_name,
        )

    from app.persistence.models import User
    user = db.query(User).filter_by(id=actor.actor_id).first()
    if user is None:
        raise ApiServiceError(code="not_found", message="User not found.", status_code=404)

    patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="patient_not_linked",
            message="No patient record linked. Contact your clinic.",
            status_code=404,
        )

    return PatientPortalMe(
        patient_id=patient.id,
        first_name=patient.first_name,
        last_name=patient.last_name,
        dob=patient.dob,
        gender=patient.gender,
        primary_condition=patient.primary_condition,
        status=patient.status,
        user_id=user.id,
        user_email=user.email,
        user_display_name=user.display_name,
    )


@router.get("/courses", response_model=list[PortalCourseOut])
def get_portal_courses(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalCourseOut]:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)
    courses = (
        db.query(TreatmentCourse)
        .filter(TreatmentCourse.patient_id == patient.id)
        .order_by(TreatmentCourse.created_at.desc())
        .all()
    )

    # Batch-load all delivered sessions for these courses in one query to
    # avoid the N+1 pattern (one query per course).
    import json as _json
    course_id_list = [c.id for c in courses]
    if course_id_list:
        all_sessions = (
            db.query(DeliveredSessionParameters)
            .filter(DeliveredSessionParameters.course_id.in_(course_id_list))
            .all()
        )
        session_counts: dict[str, int] = {}
        for s in all_sessions:
            session_counts[s.course_id] = session_counts.get(s.course_id, 0) + 1
    else:
        session_counts = {}

    result = []
    for c in courses:
        params = {}
        try:
            params = _json.loads(c.protocol_json or "{}")
        except Exception:
            pass
        result.append(PortalCourseOut(
            id=c.id,
            protocol_id=c.protocol_id,
            condition_slug=c.condition_slug,
            modality_slug=c.modality_slug,
            status=c.status,
            clinician_notes=c.clinician_notes,
            session_count=session_counts.get(c.id, 0),
            total_sessions_planned=params.get("total_sessions_planned"),
            started_at=_dt(c.started_at) if c.started_at else None,
            created_at=_dt(c.created_at),
        ))
    return result


@router.get("/sessions", response_model=list[PortalSessionOut])
def get_portal_sessions(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalSessionOut]:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)

    rows: list[PortalSessionOut] = []

    # 1. Delivered telemetry — keyed off the patient's treatment courses.
    course_ids = [
        c.id for c in db.query(TreatmentCourse.id)
        .filter(TreatmentCourse.patient_id == patient.id).all()
    ]
    if course_ids:
        delivered = (
            db.query(DeliveredSessionParameters)
            .filter(DeliveredSessionParameters.course_id.in_(course_ids))
            .order_by(DeliveredSessionParameters.created_at.desc())
            .all()
        )
        rows.extend(
            PortalSessionOut(
                id=s.id,
                course_id=s.course_id,
                device_slug=s.device_slug,
                tolerance_rating=s.tolerance_rating,
                post_session_notes=s.post_session_notes,
                duration_minutes=s.duration_minutes,
                delivered_at=_dt(s.created_at),
                status="delivered",
            )
            for s in delivered
        )

    # 2. Clinical bookings — patient-scoped (independent of treatment courses).
    #    These power the "next session" countdown on the Patient Dashboard. The
    #    POST /api/v1/sessions endpoint stores scheduled_at as an ISO string,
    #    which is also what the Patient Portal returns to the UI verbatim.
    bookings = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == patient.id)
        .order_by(ClinicalSession.scheduled_at.desc())
        .all()
    )
    rows.extend(
        PortalSessionOut(
            id=b.id,
            scheduled_at=b.scheduled_at,
            status=b.status,
            modality=b.modality,
            session_number=b.session_number,
            total_sessions=b.total_sessions,
            duration_minutes=b.duration_minutes,
        )
        for b in bookings
    )

    return rows


@router.get("/assessments", response_model=list[PortalAssessmentOut])
def get_portal_assessments(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalAssessmentOut]:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)
    records = (
        db.query(AssessmentRecord)
        .filter(AssessmentRecord.patient_id == patient.id)
        .order_by(AssessmentRecord.created_at.desc())
        .all()
    )

    return [
        PortalAssessmentOut(
            id=r.id,
            template_id=r.template_id,
            template_title=r.template_title,
            score=r.score,
            status=r.status,
            created_at=_dt(r.created_at),
        )
        for r in records
    ]


@router.get("/outcomes", response_model=list[PortalOutcomeOut])
def get_portal_outcomes(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalOutcomeOut]:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)
    records = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id == patient.id)
        .order_by(OutcomeSeries.administered_at.desc())
        .all()
    )

    return [
        PortalOutcomeOut(
            id=r.id,
            course_id=r.course_id,
            template_id=r.template_id,
            template_title=r.template_title,
            score=r.score,
            score_numeric=r.score_numeric,
            measurement_point=r.measurement_point,
            administered_at=_dt(r.administered_at),
        )
        for r in records
    ]


# ── Messages portal schemas ───────────────────────────────────────────────────


class PortalMessageOut(BaseModel):
    id: str
    sender_id: str
    recipient_id: str
    patient_id: Optional[str]
    body: str
    subject: Optional[str]
    category: Optional[str]
    thread_id: Optional[str]
    priority: Optional[str]
    sender_type: Optional[str]  # 'patient' | 'clinician'
    sender_name: Optional[str]
    created_at: str
    read_at: Optional[str]
    is_read: bool


class SendPortalMessageIn(BaseModel):
    body: str
    subject: Optional[str] = None
    category: Optional[str] = None
    thread_id: Optional[str] = None
    course_id: Optional[str] = None
    priority: Optional[str] = None


# ── Messages endpoints ─────────────────────────────────────────────────────────


@router.get("/messages", response_model=list[PortalMessageOut])
def get_portal_messages(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalMessageOut]:
    """List all messages for the authenticated patient (sent or received)."""
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)

    rows = (
        db.query(Message)
        .filter(
            (Message.patient_id == patient.id)
            | (Message.sender_id == actor.actor_id)
            | (Message.recipient_id == actor.actor_id)
        )
        .order_by(Message.created_at.asc())
        .all()
    )

    return [
        PortalMessageOut(
            id=r.id,
            sender_id=r.sender_id,
            recipient_id=r.recipient_id,
            patient_id=r.patient_id,
            body=r.body,
            subject=r.subject,
            category=r.category,
            thread_id=r.thread_id,
            priority=r.priority,
            sender_type="patient" if r.sender_id == actor.actor_id else "clinician",
            sender_name=None,  # resolved client-side
            created_at=_dt(r.created_at),
            read_at=_dt(r.read_at) if r.read_at else None,
            is_read=r.read_at is not None,
        )
        for r in rows
    ]


@router.post("/messages", response_model=PortalMessageOut, status_code=201)
def send_portal_message(
    body: SendPortalMessageIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalMessageOut:
    """Patient sends a message to their care team."""
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    if not body.body or not body.body.strip():
        raise ApiServiceError(code="empty_message", message="Message body cannot be empty.", status_code=400)

    patient = _require_patient(actor, db)

    # Messages must route to the assigned clinician.  Falling back to patient.id
    # causes the message to silently disappear (patient messaging themselves).
    recipient_id = getattr(patient, "clinician_id", None)
    if not recipient_id:
        from app.errors import ApiServiceError as _ApiServiceError
        raise _ApiServiceError(
            code="no_clinician_assigned",
            message="No clinician is assigned to your account. Please contact your clinic to be assigned a clinician before sending messages.",
            status_code=422,
        )

    msg = Message(
        id=str(uuid.uuid4()),
        sender_id=actor.actor_id,
        recipient_id=recipient_id,
        patient_id=patient.id,
        body=body.body.strip(),
        subject=body.subject,
        category=body.category,
        thread_id=body.thread_id,
        priority=body.priority,
    )
    # Stamp thread_id on thread-starters so replies can group deterministically.
    if not msg.thread_id:
        msg.thread_id = msg.id
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return PortalMessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        recipient_id=msg.recipient_id,
        patient_id=msg.patient_id,
        body=msg.body,
        subject=msg.subject,
        category=msg.category,
        thread_id=msg.thread_id,
        priority=msg.priority,
        sender_type="patient",
        sender_name=None,
        created_at=_dt(msg.created_at),
        read_at=None,
        is_read=False,
    )


@router.patch("/messages/{message_id}/read", response_model=PortalMessageOut)
def mark_portal_message_read(
    message_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalMessageOut:
    """Mark a message addressed to the authenticated patient as read.

    Only the recipient may mark a message as read; honest receipts only.
    """
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)
    msg = db.query(Message).filter_by(id=message_id).first()
    if msg is None:
        raise ApiServiceError(code="not_found", message="Message not found.", status_code=404)
    if msg.patient_id != patient.id:
        raise ApiServiceError(
            code="forbidden",
            message="You may only access messages on your own thread.",
            status_code=403,
        )
    if msg.recipient_id != actor.actor_id:
        raise ApiServiceError(
            code="forbidden",
            message="You may only mark messages addressed to you as read.",
            status_code=403,
        )

    if msg.read_at is None:
        msg.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(msg)

    return PortalMessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        recipient_id=msg.recipient_id,
        patient_id=msg.patient_id,
        body=msg.body,
        subject=msg.subject,
        category=msg.category,
        thread_id=msg.thread_id,
        priority=msg.priority,
        sender_type="patient" if msg.sender_id == actor.actor_id else "clinician",
        sender_name=None,
        created_at=_dt(msg.created_at),
        read_at=_dt(msg.read_at) if msg.read_at else None,
        is_read=msg.read_at is not None,
    )


# ── Wearable portal schemas ────────────────────────────────────────────────────

class PortalConnectionOut(BaseModel):
    id: str
    source: str
    source_type: str
    display_name: Optional[str]
    status: str
    consent_given: bool
    last_sync_at: Optional[str]


class PortalDailySummaryOut(BaseModel):
    source: str
    date: str
    rhr_bpm: Optional[float]
    hrv_ms: Optional[float]
    sleep_duration_h: Optional[float]
    steps: Optional[int]
    spo2_pct: Optional[float]
    mood_score: Optional[float]
    pain_score: Optional[float]
    anxiety_score: Optional[float]
    readiness_score: Optional[float]


class PortalWearablesOut(BaseModel):
    connections: list[PortalConnectionOut]
    recent_alerts: list[dict]


class ConnectSourceIn(BaseModel):
    source: str                         # apple_health, fitbit, oura, android_health, garmin_connect
    display_name: Optional[str] = None
    consent_given: bool = False


class PatientDailySyncIn(BaseModel):
    source: str
    date: str                           # YYYY-MM-DD
    rhr_bpm: Optional[float] = None
    hrv_ms: Optional[float] = None
    sleep_duration_h: Optional[float] = None
    steps: Optional[int] = None
    spo2_pct: Optional[float] = None
    mood_score: Optional[float] = None  # 1-5
    pain_score: Optional[float] = None  # 0-10
    anxiety_score: Optional[float] = None  # 0-10
    side_effect_notes: Optional[str] = None


# ── Wearable endpoints ─────────────────────────────────────────────────────────

_VALID_SOURCES = {'apple_health', 'android_health', 'fitbit', 'oura', 'garmin_connect'}


@router.get("/wearables", response_model=PortalWearablesOut)
def get_portal_wearables(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalWearablesOut:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)
    connections = db.query(DeviceConnection).filter_by(patient_id=patient.id).all()
    alerts = (
        db.query(WearableAlertFlag)
        .filter_by(patient_id=patient.id, dismissed=False)
        .order_by(WearableAlertFlag.triggered_at.desc())
        .limit(5)
        .all()
    )

    return PortalWearablesOut(
        connections=[
            PortalConnectionOut(
                id=c.id, source=c.source, source_type=c.source_type,
                display_name=c.display_name, status=c.status,
                consent_given=c.consent_given,
                last_sync_at=_dt(c.last_sync_at),
            )
            for c in connections
        ],
        recent_alerts=[
            {
                'id': a.id, 'flag_type': a.flag_type, 'severity': a.severity,
                'detail': a.detail, 'triggered_at': _dt(a.triggered_at),
            }
            for a in alerts
        ],
    )


@router.get("/wearable-summary", response_model=list[PortalDailySummaryOut])
def get_portal_wearable_summary(
    days: int = Query(default=7, ge=1, le=90),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalDailySummaryOut]:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

    summaries = (
        db.query(WearableDailySummary)
        .filter(
            WearableDailySummary.patient_id == patient.id,
            WearableDailySummary.date >= cutoff,
        )
        .order_by(WearableDailySummary.date.asc())
        .all()
    )

    return [
        PortalDailySummaryOut(
            source=s.source, date=s.date,
            rhr_bpm=s.rhr_bpm, hrv_ms=s.hrv_ms,
            sleep_duration_h=s.sleep_duration_h, steps=s.steps,
            spo2_pct=s.spo2_pct, mood_score=s.mood_score,
            pain_score=s.pain_score, anxiety_score=s.anxiety_score,
            readiness_score=s.readiness_score,
        )
        for s in summaries
    ]


@router.post("/wearable-connect", response_model=PortalConnectionOut)
def connect_wearable_source(
    body: ConnectSourceIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalConnectionOut:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)
    if body.source not in _VALID_SOURCES:
        raise ApiServiceError(
            code="invalid_source",
            message=f"Unknown source '{body.source}'. Valid: {sorted(_VALID_SOURCES)}",
            status_code=422,
        )
    if not body.consent_given:
        raise ApiServiceError(
            code="consent_required",
            message="You must provide consent to connect this data source.",
            status_code=422,
        )

    patient = _require_patient(actor, db)

    # Upsert — one connection per patient+source
    # ── OAuth V2 integration note ──────────────────────────────────────────────
    # V1: ConnectSourceIn carries no token fields; access_token_enc and
    # refresh_token_enc are left empty (OAuth flows not yet implemented).
    #
    # When V2 OAuth is added, extend ConnectSourceIn with optional token fields
    # and apply encryption BEFORE writing to DeviceConnection:
    #
    #   from app.crypto import encrypt_token
    #   conn.access_token_enc  = encrypt_token(body.access_token)
    #   conn.refresh_token_enc = encrypt_token(body.refresh_token)
    #
    # NEVER assign a raw token string without wrapping it in encrypt_token().
    # See apps/api/app/crypto.py for the full OAuth V2 production checklist.
    # ─────────────────────────────────────────────────────────────────────────���
    existing = db.query(DeviceConnection).filter_by(patient_id=patient.id, source=body.source).first()
    now = datetime.now(timezone.utc)
    if existing:
        existing.status = 'connected'
        existing.display_name = body.display_name or existing.display_name
        existing.consent_given = True
        existing.consent_given_at = now
        existing.connected_at = now
        existing.updated_at = now
        db.commit()
        conn = existing
    else:
        conn = DeviceConnection(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            source=body.source,
            source_type='wearable',
            display_name=body.display_name or body.source.replace('_', ' ').title(),
            status='connected',
            consent_given=True,
            consent_given_at=now,
            connected_at=now,
        )
        db.add(conn)
        db.commit()

    return PortalConnectionOut(
        id=conn.id, source=conn.source, source_type=conn.source_type,
        display_name=conn.display_name, status=conn.status,
        consent_given=conn.consent_given, last_sync_at=_dt(conn.last_sync_at),
    )


@router.delete("/wearable-connect/{connection_id}")
def disconnect_wearable_source(
    connection_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)
    conn = db.query(DeviceConnection).filter_by(id=connection_id, patient_id=patient.id).first()
    if conn is None:
        raise ApiServiceError(code="not_found", message="Connection not found.", status_code=404)

    conn.status = 'disconnected'
    conn.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {'ok': True, 'source': conn.source}


@router.post("/wearable-sync")
def patient_wearable_sync(
    body: PatientDailySyncIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Patient submits a daily health summary (manual or from SDK bridge).

    Data is consumer-grade — labeled as 'patient_reported' quality and
    stored for informational trend purposes only.
    """
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    # Validate date format before any DB access
    import re as _re
    if not _re.fullmatch(r"\d{4}-\d{2}-\d{2}", body.date):
        raise ApiServiceError(
            code="invalid_date",
            message="Field 'date' must be in YYYY-MM-DD format.",
            status_code=422,
        )

    patient = _require_patient(actor, db)

    # Upsert daily summary
    existing = db.query(WearableDailySummary).filter_by(
        patient_id=patient.id, source=body.source, date=body.date
    ).first()

    now = datetime.now(timezone.utc)

    if existing:
        for field in ('rhr_bpm', 'hrv_ms', 'sleep_duration_h', 'steps',
                      'spo2_pct', 'mood_score', 'pain_score', 'anxiety_score'):
            v = getattr(body, field)
            if v is not None:
                setattr(existing, field, v)
        existing.synced_at = now
        if body.side_effect_notes:
            existing.data_json = json.dumps({'side_effect_notes': body.side_effect_notes})
        db.commit()
        summary_id = existing.id
    else:
        summary = WearableDailySummary(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            source=body.source,
            date=body.date,
            rhr_bpm=body.rhr_bpm,
            hrv_ms=body.hrv_ms,
            sleep_duration_h=body.sleep_duration_h,
            steps=body.steps,
            spo2_pct=body.spo2_pct,
            mood_score=body.mood_score,
            pain_score=body.pain_score,
            anxiety_score=body.anxiety_score,
            data_json=json.dumps({'side_effect_notes': body.side_effect_notes}) if body.side_effect_notes else None,
        )
        db.add(summary)
        db.commit()
        summary_id = summary.id

    # Update last_sync_at on the connection record
    conn = db.query(DeviceConnection).filter_by(patient_id=patient.id, source=body.source).first()
    if conn:
        conn.last_sync_at = now
        conn.updated_at = now
        db.commit()

    return {'ok': True, 'summary_id': summary_id}


# ── Home program tasks (patient) ───────────────────────────────────────────────

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class PortalHomeProgramTaskOut(BaseModel):
    id: str
    server_task_id: str
    title: str | None = None
    category: str | None = None
    instructions: str | None = None
    task: dict


class PortalHomeProgramTaskCompletionIn(BaseModel):
    completed: bool = True
    rating: Optional[int] = None
    difficulty: Optional[int] = None
    feedback_text: Optional[str] = None
    feedback_json: Optional[dict] = None
    media_upload_id: Optional[str] = None


class PortalHomeProgramTaskCompletionOut(BaseModel):
    server_task_id: str
    completed: bool
    completed_at: str
    rating: Optional[int] = None
    difficulty: Optional[int] = None
    feedback_text: Optional[str] = None
    media_upload_id: Optional[str] = None


def _validate_uuid(v: str) -> None:
    if not v or not isinstance(v, str) or not _UUID_RE.match(v):
        raise ApiServiceError(code="invalid_id", message="Invalid id format.", status_code=422)


def _require_patient_role(actor: AuthenticatedActor) -> None:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)


@router.get("/home-program-tasks", response_model=list[PortalHomeProgramTaskOut])
def list_home_program_tasks(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalHomeProgramTaskOut]:
    _require_patient_role(actor)
    patient = _require_patient(actor, db)
    rows = (
        db.query(ClinicianHomeProgramTask)
        .filter(ClinicianHomeProgramTask.patient_id == patient.id)
        .order_by(ClinicianHomeProgramTask.updated_at.desc())
        .all()
    )
    out: list[PortalHomeProgramTaskOut] = []
    for r in rows:
        try:
            raw = json.loads(r.task_json) if r.task_json else {}
        except Exception:
            raw = {}
        safe = dict(raw) if isinstance(raw, dict) else {}
        try:
            if isinstance(safe.get("homeProgramSelection"), dict):
                safe["homeProgramSelection"] = patient_safe_home_program_selection(safe["homeProgramSelection"])
        except Exception:
            pass
        out.append(
            PortalHomeProgramTaskOut(
                id=r.id,
                server_task_id=r.server_task_id,
                title=safe.get("title"),
                category=safe.get("category") or safe.get("type"),
                instructions=safe.get("instructions") or safe.get("notes"),
                task=safe,
            )
        )
    return out


@router.post(
    "/home-program-tasks/{server_task_id}/complete",
    response_model=PortalHomeProgramTaskCompletionOut,
)
def complete_home_program_task(
    server_task_id: str = Path(...),
    body: PortalHomeProgramTaskCompletionIn = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalHomeProgramTaskCompletionOut:
    _require_patient_role(actor)
    _validate_uuid(server_task_id)
    patient = _require_patient(actor, db)

    task_row = (
        db.query(ClinicianHomeProgramTask)
        .filter(ClinicianHomeProgramTask.server_task_id == server_task_id)
        .first()
    )
    if task_row is None or task_row.patient_id != patient.id:
        raise ApiServiceError(code="not_found", message="Task not found.", status_code=404)

    if body.rating is not None and not (1 <= body.rating <= 5):
        raise ApiServiceError(code="invalid_rating", message="rating must be 1–5.", status_code=422)
    if body.difficulty is not None and not (1 <= body.difficulty <= 5):
        raise ApiServiceError(code="invalid_difficulty", message="difficulty must be 1–5.", status_code=422)

    now = datetime.now(timezone.utc)
    existing = (
        db.query(PatientHomeProgramTaskCompletion)
        .filter(
            PatientHomeProgramTaskCompletion.patient_id == patient.id,
            PatientHomeProgramTaskCompletion.server_task_id == server_task_id,
        )
        .first()
    )
    payload_json = "{}"
    if body.feedback_json is not None:
        try:
            payload_json = json.dumps(body.feedback_json, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            raise ApiServiceError(
                code="invalid_feedback_json",
                message="feedback_json must be valid JSON.",
                status_code=422,
            )

    if existing:
        existing.completed = bool(body.completed)
        existing.completed_at = now
        existing.rating = body.rating
        existing.difficulty = body.difficulty
        existing.feedback_text = body.feedback_text
        existing.feedback_json = payload_json
        existing.media_upload_id = body.media_upload_id
        db.commit()
        row = existing
    else:
        row = PatientHomeProgramTaskCompletion(
            id=str(uuid.uuid4()),
            server_task_id=server_task_id,
            patient_id=patient.id,
            clinician_id=task_row.clinician_id,
            completed=bool(body.completed),
            completed_at=now,
            rating=body.rating,
            difficulty=body.difficulty,
            feedback_text=body.feedback_text,
            feedback_json=payload_json,
            media_upload_id=body.media_upload_id,
        )
        db.add(row)
        db.commit()

    return PortalHomeProgramTaskCompletionOut(
        server_task_id=row.server_task_id,
        completed=row.completed,
        completed_at=_dt(row.completed_at),
        rating=row.rating,
        difficulty=row.difficulty,
        feedback_text=row.feedback_text,
        media_upload_id=row.media_upload_id,
    )


@router.get(
    "/home-program-tasks/{server_task_id}/completion",
    response_model=PortalHomeProgramTaskCompletionOut,
)
def get_home_program_task_completion(
    server_task_id: str = Path(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalHomeProgramTaskCompletionOut:
    _require_patient_role(actor)
    _validate_uuid(server_task_id)
    patient = _require_patient(actor, db)
    row = (
        db.query(PatientHomeProgramTaskCompletion)
        .filter(
            PatientHomeProgramTaskCompletion.patient_id == patient.id,
            PatientHomeProgramTaskCompletion.server_task_id == server_task_id,
        )
        .first()
    )
    if row is None:
        raise ApiServiceError(code="not_found", message="No completion recorded for this task.", status_code=404)
    return PortalHomeProgramTaskCompletionOut(
        server_task_id=row.server_task_id,
        completed=row.completed,
        completed_at=_dt(row.completed_at),
        rating=row.rating,
        difficulty=row.difficulty,
        feedback_text=row.feedback_text,
        media_upload_id=row.media_upload_id,
    )
