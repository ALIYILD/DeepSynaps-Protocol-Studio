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
    MriAnalysis,
    OutcomeSeries,
    Patient,
    PatientHomeProgramTaskCompletion,
    PatientMediaUpload,
    QEEGAnalysis,
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


def _safe_json(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


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
    ai_generated: bool = False
    file_url: Optional[str] = None


class PortalOutcomeOut(BaseModel):
    id: str
    course_id: str
    template_id: str
    template_title: str
    score: Optional[str]
    score_numeric: Optional[float]
    measurement_point: str
    administered_at: str
    file_url: Optional[str] = None


class PortalSimpleSummaryOut(BaseModel):
    generated_at: str
    latest_qeeg: Optional[dict] = None
    latest_mri: Optional[dict] = None
    outcomes_snapshot: list[dict] = []


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
            ai_generated=bool(r.ai_generated_at) if hasattr(r, 'ai_generated_at') else False,
            file_url=None,
        )
        for r in records
    ]


# ── Self-assessment (patient-initiated) schemas ──────────────────────────────

class SelfAssessmentIn(BaseModel):
    survey_type: str
    frequency: str
    responses: dict
    score: Optional[float] = None
    notes: Optional[str] = None
    ai_context: Optional[dict] = None


class SelfAssessmentOut(BaseModel):
    id: str
    survey_type: str
    template_id: str
    template_title: str
    score: Optional[str]
    status: str
    created_at: str


# ── Self-assessment (patient-initiated) endpoint ─────────────────────────────

@router.post("/self-assessments", response_model=SelfAssessmentOut, status_code=201)
def submit_self_assessment(
    body: SelfAssessmentIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SelfAssessmentOut:
    """Patient files a self-initiated assessment (mood, wellness, reflection)."""
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)

    # Resolve clinician — fall back to 'self' so the row is always valid.
    clinician_id = getattr(patient, "clinician_id", None) or "self"

    _SURVEY_TITLES = {
        "daily_mood": "Daily Mood Check-in",
        "weekly_wellness": "Weekly Wellness Check-in",
        "monthly_reflection": "Monthly Reflection",
    }

    template_id = f"self_{body.survey_type}"
    template_title = _SURVEY_TITLES.get(body.survey_type, body.survey_type.replace("_", " ").title())

    now = datetime.now(timezone.utc)
    record = AssessmentRecord(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        clinician_id=clinician_id,
        template_id=template_id,
        template_title=template_title,
        data_json=json.dumps({"frequency": body.frequency, "ai_context": body.ai_context, "notes": body.notes}, ensure_ascii=False, separators=(",", ":")),
        status="completed",
        score=str(body.score) if body.score is not None else None,
        score_numeric=body.score,
        source="patient_self_report",
        respondent_type="patient",
        items_json=json.dumps(body.responses, ensure_ascii=False, separators=(",", ":")),
        completed_at=now,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return SelfAssessmentOut(
        id=record.id,
        survey_type=body.survey_type,
        template_id=record.template_id,
        template_title=record.template_title,
        score=record.score,
        status=record.status,
        created_at=_dt(record.created_at),
    )


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


@router.get("/summary", response_model=PortalSimpleSummaryOut)
def get_portal_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalSimpleSummaryOut:
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)
    latest_qeeg = (
        db.query(QEEGAnalysis)
        .filter(QEEGAnalysis.patient_id == patient.id, QEEGAnalysis.analysis_status == "completed")
        .order_by(QEEGAnalysis.analyzed_at.desc(), QEEGAnalysis.created_at.desc())
        .first()
    )
    latest_mri = (
        db.query(MriAnalysis)
        .filter(MriAnalysis.patient_id == patient.id)
        .order_by(MriAnalysis.created_at.desc())
        .first()
    )
    outcomes = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id == patient.id)
        .order_by(OutcomeSeries.administered_at.desc())
        .limit(6)
        .all()
    )

    qeeg_summary = None
    if latest_qeeg is not None:
        quality = _safe_json(getattr(latest_qeeg, "quality_metrics_json", None))
        flagged = []
        try:
            flagged = json.loads(getattr(latest_qeeg, "flagged_conditions", None) or "[]")
        except Exception:
            flagged = []
        qeeg_summary = {
            "analysis_id": latest_qeeg.id,
            "recorded_on": latest_qeeg.analyzed_at.isoformat() if latest_qeeg.analyzed_at else _dt(latest_qeeg.created_at),
            "headline": "Your latest brainwave review has been processed.",
            "summary": "Your care team can compare this recording with earlier sessions to look for overall patterns and changes over time.",
            "quality_note": (
                f"{quality.get('n_epochs_retained')} clean segments were kept for review."
                if quality.get("n_epochs_retained") is not None else None
            ),
            "follow_up_note": (
                "Some patterns were marked for clinician review."
                if isinstance(flagged, list) and flagged else
                "No urgent review flags were attached to this recording."
            ),
        }

    mri_summary = None
    if latest_mri is not None:
        structural = _safe_json(latest_mri.structural_json)
        qc = _safe_json(latest_mri.qc_json)
        stim_targets = []
        try:
            stim_targets = json.loads(latest_mri.stim_targets_json or "[]")
        except Exception:
            stim_targets = []
        mri_summary = {
            "analysis_id": latest_mri.analysis_id,
            "recorded_on": _dt(latest_mri.created_at),
            "headline": "Your latest scan summary is available.",
            "summary": "This scan gives your clinician another way to review treatment planning and to compare scans over time when needed.",
            "quality_note": (
                "Image quality checks passed."
                if qc.get("passed") is True else
                "Your clinician may want to review image quality before using this scan for planning."
            ),
            "follow_up_note": (
                f"{len(stim_targets)} treatment planning target(s) were prepared for clinician review."
                if isinstance(stim_targets, list) and stim_targets else
                "No planning targets were attached to this scan summary."
            ),
            "brain_age_note": (
                "A research-only brain-age estimate was included for clinician interpretation."
                if isinstance(structural.get("brain_age"), dict) and structural.get("brain_age") else None
            ),
        }

    outcome_rows = [
        {
            "label": r.template_title or r.template_id,
            "score": r.score_numeric if r.score_numeric is not None else r.score,
            "measured_on": _dt(r.administered_at),
            "note": "Lower scores often mean fewer symptoms, but your clinician will explain what this means for you."
                if str(r.template_title or r.template_id).lower() in {"phq-9", "gad-7", "isi"} else
                "This is one part of the overall picture your care team reviews with you.",
        }
        for r in outcomes
    ]

    return PortalSimpleSummaryOut(
        generated_at=datetime.now(timezone.utc).isoformat(),
        latest_qeeg=qeeg_summary,
        latest_mri=mri_summary,
        outcomes_snapshot=outcome_rows,
    )


# ── Patient-facing reports (from PatientMediaUpload) ───────────────────────────

class PortalReportOut(BaseModel):
    id: str
    title: str
    report_type: str
    file_url: Optional[str] = None
    text_content: Optional[str] = None
    status: str
    created_at: str


@router.get("/reports", response_model=list[PortalReportOut])
def get_portal_reports(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalReportOut]:
    """List report files and text records available to the authenticated patient."""
    if actor.role != "patient":
        raise ApiServiceError(code="forbidden", message="Patient portal access only.", status_code=403)

    patient = _require_patient(actor, db)

    records = (
        db.query(PatientMediaUpload)
        .filter(
            PatientMediaUpload.patient_id == patient.id,
            PatientMediaUpload.deleted_at.is_(None),
            PatientMediaUpload.media_type == "text",
        )
        .order_by(PatientMediaUpload.created_at.desc())
        .limit(200)
        .all()
    )

    results: list[PortalReportOut] = []
    for r in records:
        # Parse metadata stored in patient_note (set by reports_router)
        title = r.id
        rtype = "clinical"
        if r.patient_note:
            try:
                meta = json.loads(r.patient_note)
                title = meta.get("title", title)
                rtype = meta.get("report_type", rtype)
            except (ValueError, TypeError):
                pass
        results.append(PortalReportOut(
            id=r.id,
            title=title,
            report_type=rtype,
            file_url=r.file_ref,
            text_content=r.text_content,
            status=r.status or "available",
            created_at=_dt(r.created_at),
        ))
    return results


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


# ── Wellness Logs ──────────────────────────────────────────────────────────────

class WellnessLogIn(BaseModel):
    mood: float = 5.0
    sleep: float = 5.0
    energy: float = 5.0
    side_effects: str = "none"
    notes: str = ""
    date: Optional[str] = None


class WellnessLogOut(BaseModel):
    id: str
    date: str
    mood: float
    sleep: float
    energy: float
    side_effects: str
    notes: str
    created_at: str


@router.get("/wellness-logs", response_model=list[WellnessLogOut])
def list_wellness_logs(
    days: int = Query(default=30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[WellnessLogOut]:
    patient = _require_patient(actor, db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(AssessmentRecord)
        .filter(
            AssessmentRecord.patient_id == patient.id,
            AssessmentRecord.template_id == "wellness_checkin",
            AssessmentRecord.created_at >= cutoff,
        )
        .order_by(AssessmentRecord.created_at.desc())
        .limit(days)
        .all()
    )
    result = []
    for row in rows:
        try:
            data = json.loads(row.data_json or "{}")
        except Exception:
            data = {}
        result.append(WellnessLogOut(
            id=row.id,
            date=row.created_at.strftime("%Y-%m-%d") if row.created_at else "",
            mood=float(data.get("mood", 5)),
            sleep=float(data.get("sleep", 5)),
            energy=float(data.get("energy", 5)),
            side_effects=str(data.get("side_effects", "none")),
            notes=str(data.get("notes", "")),
            created_at=_dt(row.created_at),
        ))
    return result


@router.post("/wellness-logs", response_model=WellnessLogOut, status_code=201)
def submit_wellness_log(
    body: WellnessLogIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessLogOut:
    patient = _require_patient(actor, db)
    today_str = body.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = (
        db.query(AssessmentRecord)
        .filter(
            AssessmentRecord.patient_id == patient.id,
            AssessmentRecord.template_id == "wellness_checkin",
            AssessmentRecord.source == "patient_portal",
        )
        .order_by(AssessmentRecord.created_at.desc())
        .first()
    )
    data_payload = json.dumps({
        "mood": body.mood, "sleep": body.sleep, "energy": body.energy,
        "side_effects": body.side_effects, "notes": body.notes, "date": today_str,
    })
    score_val = str(round((body.mood + body.sleep + body.energy) / 3, 1))
    if existing and _dt(existing.created_at)[:10] == today_str:
        row = existing
        row.data_json = data_payload
        row.score = score_val
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = AssessmentRecord(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id="patient-self",
            template_id="wellness_checkin",
            template_title="Daily Wellness Check-in",
            data_json=data_payload,
            status="completed",
            score=score_val,
            respondent_type="patient",
            source="patient_portal",
            completed_at=datetime.now(timezone.utc),
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return WellnessLogOut(
        id=row.id, date=_dt(row.created_at)[:10],
        mood=body.mood, sleep=body.sleep, energy=body.energy,
        side_effects=body.side_effects, notes=body.notes, created_at=_dt(row.created_at),
    )


# ── Dashboard aggregation ──────────────────────────────────────────────────────

class PortalDashboardOut(BaseModel):
    upcoming_sessions: int
    sessions_completed: int
    course_progress_pct: int
    active_goals: int
    unread_messages: int
    wellness_streak: int
    last_checkin_date: Optional[str]
    next_session_at: Optional[str]


@router.get("/dashboard", response_model=PortalDashboardOut)
def get_portal_dashboard(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalDashboardOut:
    patient = _require_patient(actor, db)
    now = datetime.now(timezone.utc)

    upcoming = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == patient.id, ClinicalSession.status == "scheduled", ClinicalSession.scheduled_at >= now)
        .count()
    )
    completed = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == patient.id, ClinicalSession.status == "completed")
        .count()
    )
    next_sess = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == patient.id, ClinicalSession.status == "scheduled", ClinicalSession.scheduled_at >= now)
        .order_by(ClinicalSession.scheduled_at)
        .first()
    )
    course = (
        db.query(TreatmentCourse)
        .filter(TreatmentCourse.patient_id == patient.id, TreatmentCourse.status == "active")
        .first()
    )
    total_sessions = getattr(course, "total_sessions", 0) or 0
    progress_pct = int(round((completed / total_sessions) * 100)) if total_sessions > 0 else 0
    unread = (
        db.query(Message)
        .filter(Message.patient_id == patient.id, Message.is_read.is_(False), Message.sender_type != "patient")
        .count()
    )
    logs = (
        db.query(AssessmentRecord)
        .filter(AssessmentRecord.patient_id == patient.id, AssessmentRecord.template_id == "wellness_checkin")
        .order_by(AssessmentRecord.created_at.desc())
        .limit(90)
        .all()
    )
    log_dates = sorted({_dt(r.created_at)[:10] for r in logs if r.created_at}, reverse=True)
    streak = 0
    check_date = now.date()
    for d in log_dates:
        if d == str(check_date):
            streak += 1
            check_date = check_date - timedelta(days=1)
        else:
            break
    return PortalDashboardOut(
        upcoming_sessions=upcoming, sessions_completed=completed,
        course_progress_pct=progress_pct, active_goals=0,
        unread_messages=unread, wellness_streak=streak,
        last_checkin_date=log_dates[0] if log_dates else None,
        next_session_at=_dt(next_sess.scheduled_at) if next_sess else None,
    )


# ── Notifications ──────────────────────────────────────────────────────────────

class PortalNotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    is_read: bool
    created_at: str
    action_url: Optional[str] = None


@router.get("/notifications", response_model=list[PortalNotificationOut])
def list_portal_notifications(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[PortalNotificationOut]:
    patient = _require_patient(actor, db)
    now = datetime.now(timezone.utc)
    notifications: list[PortalNotificationOut] = []

    for m in (
        db.query(Message)
        .filter(Message.patient_id == patient.id, Message.sender_type != "patient")
        .order_by(Message.created_at.desc()).limit(20).all()
    ):
        notifications.append(PortalNotificationOut(
            id="msg-" + m.id, type="message",
            title="Message from your care team",
            body=(m.body or "")[:140],
            is_read=bool(m.is_read), created_at=_dt(m.created_at), action_url="patient-messages",
        ))

    soon = now + timedelta(hours=48)
    for s in (
        db.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == patient.id, ClinicalSession.status == "scheduled",
                ClinicalSession.scheduled_at >= now, ClinicalSession.scheduled_at <= soon)
        .order_by(ClinicalSession.scheduled_at).limit(3).all()
    ):
        notifications.append(PortalNotificationOut(
            id="sess-" + s.id, type="session_reminder",
            title="Upcoming session",
            body="Session on " + _dt(s.scheduled_at)[:16].replace("T", " "),
            is_read=False, created_at=_dt(s.scheduled_at), action_url="pt-sessions",
        ))

    for a in (
        db.query(AssessmentRecord)
        .filter(AssessmentRecord.patient_id == patient.id, AssessmentRecord.status == "pending")
        .order_by(AssessmentRecord.created_at.desc()).limit(5).all()
    ):
        notifications.append(PortalNotificationOut(
            id="asst-" + a.id, type="assessment_due",
            title="Assessment due: " + (a.template_title or ""),
            body="Please complete your " + (a.template_title or "assessment"),
            is_read=False, created_at=_dt(a.created_at), action_url="pt-assessments",
        ))

    notifications.sort(key=lambda n: n.created_at, reverse=True)
    return notifications[:30]


@router.patch("/notifications/{notification_id}/read", response_model=PortalNotificationOut)
def mark_notification_read(
    notification_id: str = Path(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PortalNotificationOut:
    patient = _require_patient(actor, db)
    if notification_id.startswith("msg-"):
        msg_id = notification_id[4:]
        msg = db.query(Message).filter(Message.id == msg_id, Message.patient_id == patient.id).first()
        if msg:
            msg.is_read = True
            db.commit()
            return PortalNotificationOut(
                id=notification_id, type="message", title="Message from your care team",
                body=(msg.body or "")[:140], is_read=True,
                created_at=_dt(msg.created_at), action_url="patient-messages",
            )
    return PortalNotificationOut(
        id=notification_id, type="system", title="Notification",
        body="", is_read=True, created_at=datetime.now(timezone.utc).isoformat(),
    )


# ── Learn progress ─────────────────────────────────────────────────────────────

class LearnProgressOut(BaseModel):
    read_article_ids: list[str]


class MarkLearnReadIn(BaseModel):
    article_id: str


@router.get("/learn-progress", response_model=LearnProgressOut)
def get_learn_progress(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> LearnProgressOut:
    from app.persistence.models import UserPreferences, User
    _require_patient(actor, db)
    user = db.query(User).filter(User.id == actor.user_id).first()
    if not user:
        return LearnProgressOut(read_article_ids=[])
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user.id).first()
    if not prefs:
        return LearnProgressOut(read_article_ids=[])
    try:
        notif = json.loads(prefs.notification_prefs or "{}")
        read_ids = notif.get("read_article_ids", [])
    except Exception:
        read_ids = []
    return LearnProgressOut(read_article_ids=read_ids if isinstance(read_ids, list) else [])


@router.post("/learn-progress", response_model=LearnProgressOut, status_code=201)
def mark_learn_article_read(
    body: MarkLearnReadIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> LearnProgressOut:
    from app.persistence.models import UserPreferences, User
    _require_patient(actor, db)
    user = db.query(User).filter(User.id == actor.user_id).first()
    if not user:
        return LearnProgressOut(read_article_ids=[body.article_id])
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user.id).first()
    if not prefs:
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
    try:
        notif = json.loads(prefs.notification_prefs or "{}")
    except Exception:
        notif = {}
    read_ids = notif.get("read_article_ids", [])
    if not isinstance(read_ids, list):
        read_ids = []
    if body.article_id not in read_ids:
        read_ids.append(body.article_id)
    notif["read_article_ids"] = read_ids
    prefs.notification_prefs = json.dumps(notif)
    prefs.updated_at = datetime.now(timezone.utc)
    db.commit()
    return LearnProgressOut(read_article_ids=read_ids)
