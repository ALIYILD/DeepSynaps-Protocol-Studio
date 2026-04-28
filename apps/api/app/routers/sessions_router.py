from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AdverseEvent,
    ClinicalSession,
    ClinicalSessionEvent,
    DeliveredSessionParameters,
    DeviceSessionLog,
    Patient,
    PatientAdherenceEvent,
    TreatmentCourse,
    User,
    WearableDailySummary,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.repositories.sessions import (
    check_conflicts,
    create_session,
    delete_session,
    update_session,
)

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


# ── Valid status transitions ──────────────────────────────────────────────────

VALID_TRANSITIONS: dict[str, set[str]] = {
    "scheduled": {"confirmed", "cancelled", "no_show"},
    "confirmed": {"checked_in", "cancelled", "no_show"},
    "checked_in": {"in_progress", "cancelled"},
    "in_progress": {"completed"},
}

VALID_APPOINTMENT_TYPES = {"session", "assessment", "new_patient", "follow_up", "phone", "consultation"}


def _validate_status_transition(current: str, requested: str) -> None:
    """Raise 400 if the status transition is not allowed."""
    if current == requested:
        return
    allowed = VALID_TRANSITIONS.get(current)
    if allowed is None or requested not in allowed:
        raise ApiServiceError(
            code="invalid_status_transition",
            message=f"Cannot transition from '{current}' to '{requested}'. "
                    f"Allowed transitions from '{current}': {sorted(allowed) if allowed else 'none (terminal state)'}.",
            status_code=400,
        )


# ── Schemas ────────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    patient_id: str
    scheduled_at: str  # ISO datetime string
    duration_minutes: int = Field(default=60, ge=1, le=480)
    modality: Optional[str] = None
    protocol_ref: Optional[str] = None
    session_number: Optional[int] = None
    total_sessions: Optional[int] = None
    billing_code: Optional[str] = None
    appointment_type: str = Field(default="session")
    room_id: Optional[str] = None
    device_id: Optional[str] = None
    recurrence_group: Optional[str] = None


class SessionUpdate(BaseModel):
    scheduled_at: Optional[str] = None
    duration_minutes: Optional[int] = None
    modality: Optional[str] = None
    protocol_ref: Optional[str] = None
    session_number: Optional[int] = None
    total_sessions: Optional[int] = None
    status: Optional[str] = None
    outcome: Optional[str] = None
    session_notes: Optional[str] = None
    adverse_events: Optional[str] = None
    billing_code: Optional[str] = None
    billing_status: Optional[str] = None
    appointment_type: Optional[str] = None
    room_id: Optional[str] = None
    device_id: Optional[str] = None
    cancel_reason: Optional[str] = None
    recurrence_group: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    scheduled_at: str
    duration_minutes: int
    modality: Optional[str]
    protocol_ref: Optional[str]
    session_number: Optional[int]
    total_sessions: Optional[int]
    appointment_type: str
    status: str
    outcome: Optional[str]
    session_notes: Optional[str]
    adverse_events: Optional[str]
    room_id: Optional[str]
    device_id: Optional[str]
    confirmed_at: Optional[str]
    checked_in_at: Optional[str]
    completed_at: Optional[str]
    cancelled_at: Optional[str]
    cancel_reason: Optional[str]
    rescheduled_from: Optional[str]
    billing_code: Optional[str]
    billing_status: str
    recurrence_group: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r) -> "SessionOut":
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            scheduled_at=r.scheduled_at,
            duration_minutes=r.duration_minutes,
            modality=r.modality,
            protocol_ref=r.protocol_ref,
            session_number=r.session_number,
            total_sessions=r.total_sessions,
            appointment_type=r.appointment_type,
            status=r.status,
            outcome=r.outcome,
            session_notes=r.session_notes,
            adverse_events=r.adverse_events,
            room_id=r.room_id,
            device_id=r.device_id,
            confirmed_at=r.confirmed_at,
            checked_in_at=r.checked_in_at,
            completed_at=r.completed_at,
            cancelled_at=r.cancelled_at,
            cancel_reason=r.cancel_reason,
            rescheduled_from=r.rescheduled_from,
            billing_code=r.billing_code,
            billing_status=r.billing_status,
            recurrence_group=r.recurrence_group,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class SessionListResponse(BaseModel):
    items: list[SessionOut]
    total: int


class SessionEventIn(BaseModel):
    type: str = Field(min_length=1, max_length=40)
    note: Optional[str] = None
    payload: dict = Field(default_factory=dict)


class SessionEventOut(BaseModel):
    id: str
    session_id: str
    type: str
    note: Optional[str] = None
    payload: dict = Field(default_factory=dict)
    actor_id: Optional[str] = None
    created_at: str


class SessionRuntimeOut(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    modality: Optional[str] = None
    montage: Optional[str] = None
    target_region: Optional[str] = None
    intensity_mA: Optional[float] = None
    duration_min: int
    session_no: Optional[int] = None
    session_total: Optional[int] = None
    session_type: str = "session"
    phase: str = "setup"
    impedance_kohm: Optional[float] = None
    started_at: str
    status: str


class SessionPhaseIn(BaseModel):
    phase: str = Field(min_length=1, max_length=40)


class SessionImpedanceIn(BaseModel):
    impedance_kohm: float = Field(ge=0, le=100)


class SessionVideoOut(BaseModel):
    ok: bool = True
    room_name: str
    session_id: str
    active: bool


class RemoteMonitorSnapshotOut(BaseModel):
    hrv: Optional[float] = None
    impedance: Optional[float] = None
    adherence: str = "unknown"


def _patient_name(patient: Optional[Patient]) -> str:
    if patient is None:
        return "Patient"
    return f"{patient.first_name} {patient.last_name}".strip() or "Patient"


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.isoformat()


def _event_out(record: ClinicalSessionEvent) -> SessionEventOut:
    try:
        payload = json.loads(record.payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    return SessionEventOut(
        id=record.id,
        session_id=record.session_id,
        type=record.event_type,
        note=record.note,
        payload=payload,
        actor_id=record.actor_id,
        created_at=record.created_at.isoformat(),
    )


def _safe_json_loads(value: Optional[str]) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _extract_first_float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    buf = []
    seen_digit = False
    for ch in str(value):
        if ch.isdigit() or (ch == "." and seen_digit):
            buf.append(ch)
            seen_digit = True
        elif seen_digit:
            break
    if not buf:
        return None
    try:
        return float("".join(buf))
    except ValueError:
        return None


def _course_runtime_context(db: Session, record: ClinicalSession) -> dict:
    delivered = (
        db.query(DeliveredSessionParameters)
        .filter(DeliveredSessionParameters.session_id == record.id)
        .order_by(DeliveredSessionParameters.created_at.desc())
        .first()
    )
    course_q = (
        db.query(TreatmentCourse)
        .filter(
            TreatmentCourse.patient_id == record.patient_id,
            TreatmentCourse.clinician_id == record.clinician_id,
        )
        .order_by(TreatmentCourse.started_at.desc(), TreatmentCourse.created_at.desc())
    )
    courses = course_q.all()
    course = next((c for c in courses if (c.status or "").lower() == "active" and (not record.modality or c.modality_slug == record.modality)), None)
    if course is None:
        course = next((c for c in courses if (c.status or "").lower() == "active"), None)
    if course is None and courses:
        course = courses[0]

    protocol_json = _safe_json_loads(course.protocol_json if course is not None else None)
    montage = (
        (delivered.montage if delivered is not None else None)
        or (delivered.coil_position if delivered is not None else None)
        or (course.coil_placement if course is not None else None)
        or protocol_json.get("coil_placement")
        or record.protocol_ref
    )
    target_region = (
        (course.target_region if course is not None else None)
        or protocol_json.get("target_region")
        or protocol_json.get("target")
    )
    intensity = (
        _extract_first_float(delivered.intensity_pct_rmt if delivered is not None else None)
        or _extract_first_float(course.planned_intensity if course is not None else None)
        or _extract_first_float(str(protocol_json.get("intensity") or ""))
    )
    session_total = (
        record.total_sessions
        or (course.planned_sessions_total if course is not None else None)
    )
    return {
        "course": course,
        "montage": montage,
        "target_region": target_region,
        "intensity_mA": intensity,
        "session_total": session_total,
    }


def _severity_for_ae(value: Optional[str]) -> str:
    norm = (value or "").strip().lower()
    if norm in {"mild", "moderate", "severe", "serious"}:
        return norm
    return "moderate"


def _summarize_session_events(rows: list[ClinicalSessionEvent]) -> dict:
    notes: list[str] = []
    adverse_notes: list[str] = []
    checklist: dict[str, dict] = {}
    interruptions: list[str] = []
    for row in rows:
        payload = _safe_json_loads(row.payload_json)
        if row.event_type == "CHECKLIST":
            key = str(payload.get("checklist_id") or row.id)
            checklist[key] = {
                "label": payload.get("label") or row.note or key,
                "done": bool(payload.get("done")),
                "created_at": row.created_at.isoformat(),
            }
        if row.event_type == "AE" and row.note:
            adverse_notes.append(row.note)
        if row.event_type == "OPER":
            action = str(payload.get("action") or "").lower()
            if action == "pause":
                interruptions.append(row.note or "Session paused")
        if row.note:
            notes.append(f"[{row.event_type}] {row.note}")
    return {
        "session_notes": "\n".join(notes[-25:]),
        "adverse_events": "\n".join(adverse_notes[-10:]) if adverse_notes else None,
        "checklist": list(checklist.values()),
        "interruptions": interruptions,
        "interruption_reason": "; ".join(interruptions[-3:]) if interruptions else None,
    }


def _ensure_adverse_event_from_runtime(
    db: Session,
    *,
    record: ClinicalSession,
    actor: AuthenticatedActor,
    row: ClinicalSessionEvent,
) -> None:
    payload = _safe_json_loads(row.payload_json)
    event_type = str(payload.get("event_type") or row.note or "session_adverse_event").strip()
    severity = _severity_for_ae(payload.get("severity"))
    exists = (
        db.query(AdverseEvent)
        .filter(
            AdverseEvent.session_id == record.id,
            AdverseEvent.reported_at == row.created_at,
            AdverseEvent.event_type == event_type,
        )
        .first()
    )
    if exists is not None:
        return
    db.add(
        AdverseEvent(
            patient_id=record.patient_id,
            course_id=(payload.get("course_id") or None),
            session_id=record.id,
            clinician_id=actor.actor_id,
            event_type=event_type,
            severity=severity,
            description=str(payload.get("description") or row.note or ""),
            onset_timing="during",
            resolution="ongoing",
            action_taken="none",
            reported_at=row.created_at,
        )
    )


def _finalize_session_runtime(
    db: Session,
    *,
    record: ClinicalSession,
    actor: AuthenticatedActor,
) -> ClinicalSession:
    runtime_ctx = _course_runtime_context(db, record)
    course = runtime_ctx.get("course")
    events = (
        db.query(ClinicalSessionEvent)
        .filter(ClinicalSessionEvent.session_id == record.id)
        .order_by(ClinicalSessionEvent.created_at.asc())
        .all()
    )
    summary = _summarize_session_events(events)
    delivered = (
        db.query(DeliveredSessionParameters)
        .filter(DeliveredSessionParameters.session_id == record.id)
        .first()
    )
    if delivered is None and course is not None and (course.status or "").lower() == "active":
        delivered = DeliveredSessionParameters(
            session_id=record.id,
            course_id=course.id,
            device_slug=course.device_slug,
            coil_position=runtime_ctx.get("montage") or course.coil_placement,
            intensity_pct_rmt=str(runtime_ctx.get("intensity_mA") or course.planned_intensity or ""),
            duration_minutes=record.duration_minutes or course.planned_session_duration_minutes,
            montage=runtime_ctx.get("montage"),
            tech_id=actor.actor_id,
            post_session_notes=summary["session_notes"],
            checklist_json=json.dumps(summary["checklist"]) if summary["checklist"] else None,
            interruptions=bool(summary["interruptions"]),
            interruption_reason=summary["interruption_reason"],
        )
        db.add(delivered)
        course.sessions_delivered = (course.sessions_delivered or 0) + 1
        if course.sessions_delivered >= course.planned_sessions_total:
            course.status = "completed"
            course.completed_at = datetime.now(timezone.utc)
        course.updated_at = datetime.now(timezone.utc)
    elif delivered is not None:
        delivered.post_session_notes = summary["session_notes"] or delivered.post_session_notes
        if summary["checklist"]:
            delivered.checklist_json = json.dumps(summary["checklist"])
        delivered.interruptions = bool(summary["interruptions"])
        delivered.interruption_reason = summary["interruption_reason"] or delivered.interruption_reason
        # Increment course counter when finalising a session with pre-existing
        # delivered params (e.g. parameters recorded at session start).
        if course is not None and (course.status or "").lower() == "active" and record.status != "completed":
            course.sessions_delivered = (course.sessions_delivered or 0) + 1
            if course.sessions_delivered >= course.planned_sessions_total:
                course.status = "completed"
                course.completed_at = datetime.now(timezone.utc)
            course.updated_at = datetime.now(timezone.utc)

    record.session_notes = summary["session_notes"] or record.session_notes
    record.adverse_events = summary["adverse_events"] or record.adverse_events
    if record.status != "completed":
        record.status = "completed"
        record.completed_at = datetime.now(timezone.utc).isoformat()
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return record


def _session_priority(record: ClinicalSession) -> tuple[int, float]:
    status_rank = {
        "in_progress": 0,
        "checked_in": 1,
        "confirmed": 2,
        "scheduled": 3,
    }.get(record.status, 99)
    try:
        when = datetime.fromisoformat(record.scheduled_at.replace("Z", "+00:00"))
        delta = abs((when - datetime.now(timezone.utc)).total_seconds())
    except ValueError:
        delta = 10**12
    return (status_rank, delta)


def _latest_event_payload(db: Session, session_id: str, event_type: str) -> Optional[dict]:
    row = (
        db.query(ClinicalSessionEvent)
        .filter(
            ClinicalSessionEvent.session_id == session_id,
            ClinicalSessionEvent.event_type == event_type,
        )
        .order_by(ClinicalSessionEvent.created_at.desc())
        .first()
    )
    if row is None:
        return None
    try:
        return json.loads(row.payload_json or "{}")
    except json.JSONDecodeError:
        return None


def _build_runtime_payload(db: Session, record: ClinicalSession, patient: Optional[Patient]) -> SessionRuntimeOut:
    phase_payload = _latest_event_payload(db, record.id, "PHASE") or {}
    impedance_payload = _latest_event_payload(db, record.id, "IMPEDANCE") or {}
    runtime_ctx = _course_runtime_context(db, record)
    started_at = record.checked_in_at or record.confirmed_at or record.scheduled_at
    return SessionRuntimeOut(
        id=record.id,
        patient_id=record.patient_id,
        patient_name=_patient_name(patient),
        modality=record.modality,
        montage=runtime_ctx["montage"],
        target_region=runtime_ctx["target_region"],
        intensity_mA=runtime_ctx["intensity_mA"],
        duration_min=record.duration_minutes,
        session_no=record.session_number,
        session_total=runtime_ctx["session_total"],
        session_type=record.appointment_type,
        phase=str(phase_payload.get("phase") or ("stim" if record.status == "in_progress" else "setup")),
        impedance_kohm=(
            float(impedance_payload["impedance_kohm"])
            if impedance_payload.get("impedance_kohm") is not None
            else None
        ),
        started_at=started_at,
        status=record.status,
    )


def _resolve_session_for_actor(
    db: Session, session_id: str, actor: AuthenticatedActor
) -> ClinicalSession:
    """Return the session if ``actor`` may read/write it; raise 404 otherwise.

    Pre-fix the router used the legacy owner-only model
    (``clinical_sessions.clinician_id == actor.actor_id``) so a covering
    clinician at the same clinic could not read or update a colleague's
    session, and admin / supervisor were also locked out of cross-clinic
    rows that they are explicitly meant to see.

    Post-fix the gate routes through the canonical
    ``resolve_patient_clinic_id`` + ``require_patient_owner`` helpers and
    converts the 403 cross-clinic denial into a 404 so the existence of
    another clinic's session id never leaks to a probing client.
    """
    record = db.query(ClinicalSession).filter(ClinicalSession.id == session_id).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    _, clinic_id = resolve_patient_clinic_id(db, record.patient_id)
    try:
        require_patient_owner(actor, clinic_id, allow_admin=True)
    except ApiServiceError as exc:
        # Convert cross-clinic 403 → 404 to avoid leaking row existence.
        if exc.code == "cross_clinic_access_denied":
            raise ApiServiceError(
                code="not_found", message="Session not found.", status_code=404
            ) from None
        raise
    return record


def _clinic_member_ids(db: Session, actor: AuthenticatedActor) -> list[str]:
    """Return user-ids whose ``clinic_id`` matches ``actor.clinic_id``.

    Used by the list endpoints so a covering clinician sees their
    teammates' sessions instead of the empty list the owner-only filter
    produced. Returns ``[actor.actor_id]`` when the actor has no clinic
    binding (solo practitioner) so the list still works.
    """
    if actor.clinic_id is None:
        return [actor.actor_id]
    rows = db.execute(
        select(User.id).where(User.clinic_id == actor.clinic_id)
    ).all()
    ids = [r[0] for r in rows]
    return ids or [actor.actor_id]


def _append_session_event(
    db: Session,
    *,
    record: ClinicalSession,
    actor: AuthenticatedActor,
    event_type: str,
    note: Optional[str] = None,
    payload: Optional[dict] = None,
) -> ClinicalSessionEvent:
    row = ClinicalSessionEvent(
        session_id=record.id,
        clinician_id=record.clinician_id,
        actor_id=actor.actor_id,
        event_type=event_type,
        note=note,
        payload_json=json.dumps(payload or {}),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=SessionListResponse)
def list_sessions_endpoint(
    patient_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionListResponse:
    require_minimum_role(actor, "clinician")
    # Clinic-scope: covering clinicians at the same clinic see each other's
    # sessions; admin sees the full surface across clinics. Pre-fix the
    # owner-only filter produced an empty list for any user who wasn't the
    # row's ``clinician_id``.
    if actor.role == "admin":
        query = session.query(ClinicalSession)
    else:
        member_ids = _clinic_member_ids(session, actor)
        query = session.query(ClinicalSession).filter(
            ClinicalSession.clinician_id.in_(member_ids)
        )
    if patient_id:
        # Refuse to leak rows for a patient that isn't in the actor's clinic.
        _, patient_clinic_id = resolve_patient_clinic_id(session, patient_id)
        try:
            require_patient_owner(actor, patient_clinic_id, allow_admin=True)
        except ApiServiceError as exc:
            if exc.code == "cross_clinic_access_denied":
                # Empty list (not 404) — listing is not a row read.
                return SessionListResponse(items=[], total=0)
            raise
        query = query.filter(ClinicalSession.patient_id == patient_id)
    records = list(query.order_by(ClinicalSession.scheduled_at.desc()).all())
    items = [SessionOut.from_record(r) for r in records]
    return SessionListResponse(items=items, total=len(items))


@router.post("", response_model=SessionOut, status_code=201)
def create_session_endpoint(
    body: SessionCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionOut:
    require_minimum_role(actor, "clinician")
    # Clinic-scope the patient lookup so a colleague at the same clinic can
    # book sessions for the patient they're covering. The owner-only check
    # would 404 a covering clinician booking on the owning clinician's
    # behalf — pre-fix this turned routine cross-cover into a permission
    # mystery rather than a real error.
    patient = session.query(Patient).filter(Patient.id == body.patient_id).first()
    if patient is None:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    _, patient_clinic_id = resolve_patient_clinic_id(session, body.patient_id)
    try:
        require_patient_owner(actor, patient_clinic_id, allow_admin=True)
    except ApiServiceError as exc:
        if exc.code == "cross_clinic_access_denied":
            raise ApiServiceError(
                code="not_found", message="Patient not found.", status_code=404
            ) from None
        raise

    # Validate appointment_type
    if body.appointment_type not in VALID_APPOINTMENT_TYPES:
        raise ApiServiceError(
            code="invalid_appointment_type",
            message=f"Invalid appointment_type '{body.appointment_type}'. Must be one of: {sorted(VALID_APPOINTMENT_TYPES)}.",
            status_code=400,
        )

    # Conflict detection still scopes to the patient's owning clinician —
    # that's the calendar an overlap matters on. Two clinicians at the
    # same clinic legitimately have separate calendars and shouldn't
    # collide on each other's bookings.
    booking_clinician_id = patient.clinician_id
    conflicts = check_conflicts(
        session,
        clinician_id=booking_clinician_id,
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
        room_id=body.room_id,
        device_id=body.device_id,
    )
    if conflicts:
        conflict_ids = [c.id for c in conflicts]
        raise ApiServiceError(
            code="scheduling_conflict",
            message=f"Overlapping appointment(s) detected: {conflict_ids}",
            status_code=409,
            details={"conflicting_session_ids": conflict_ids},
        )

    record = create_session(session, clinician_id=booking_clinician_id, **body.model_dump())
    return SessionOut.from_record(record)


@router.get("/current", response_model=SessionRuntimeOut)
def get_current_session_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionRuntimeOut:
    require_minimum_role(actor, "clinician")
    # Clinic-scoped pick: a covering clinician at the same clinic surfaces
    # the team's active session, not the empty list the owner-only filter
    # produced.
    if actor.role == "admin":
        base = session.query(ClinicalSession)
    else:
        base = session.query(ClinicalSession).filter(
            ClinicalSession.clinician_id.in_(_clinic_member_ids(session, actor))
        )
    rows = base.filter(
        ClinicalSession.status.in_(("in_progress", "checked_in", "confirmed", "scheduled")),
    ).all()
    if not rows:
        raise ApiServiceError(code="not_found", message="No active or upcoming session found.", status_code=404)
    record = sorted(rows, key=_session_priority)[0]
    patient = session.query(Patient).filter(Patient.id == record.patient_id).first()
    return _build_runtime_payload(session, record, patient)


@router.get("/{session_id}", response_model=SessionOut)
def get_session_endpoint(
    session_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionOut:
    require_minimum_role(actor, "clinician")
    record = _resolve_session_for_actor(session, session_id, actor)
    return SessionOut.from_record(record)


@router.get("/{session_id}/events", response_model=list[SessionEventOut])
def list_session_events_endpoint(
    session_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> list[SessionEventOut]:
    require_minimum_role(actor, "clinician")
    _resolve_session_for_actor(session, session_id, actor)
    rows = (
        session.query(ClinicalSessionEvent)
        .filter_by(session_id=session_id)
        .order_by(ClinicalSessionEvent.created_at.desc())
        .all()
    )
    return [_event_out(row) for row in rows]


@router.post("/{session_id}/events", response_model=SessionEventOut, status_code=201)
def create_session_event_endpoint(
    session_id: str,
    body: SessionEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionEventOut:
    require_minimum_role(actor, "clinician")
    record = _resolve_session_for_actor(session, session_id, actor)
    row = _append_session_event(
        session,
        record=record,
        actor=actor,
        event_type=body.type.upper(),
        note=body.note,
        payload=body.payload,
    )
    if row.event_type == "AE":
        payload = _safe_json_loads(row.payload_json)
        runtime_ctx = _course_runtime_context(session, record)
        if runtime_ctx.get("course") is not None and not payload.get("course_id"):
            payload["course_id"] = runtime_ctx["course"].id
            row.payload_json = json.dumps(payload)
            session.commit()
            session.refresh(row)
        _ensure_adverse_event_from_runtime(session, record=record, actor=actor, row=row)
        session.commit()
    return _event_out(row)


@router.post("/{session_id}/phase", response_model=SessionRuntimeOut)
def transition_session_phase_endpoint(
    session_id: str,
    body: SessionPhaseIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionRuntimeOut:
    require_minimum_role(actor, "clinician")
    record = _resolve_session_for_actor(session, session_id, actor)
    _append_session_event(
        session,
        record=record,
        actor=actor,
        event_type="PHASE",
        note=f"Phase transition -> {body.phase}",
        payload={"phase": body.phase},
    )
    if body.phase == "ended":
        record = _finalize_session_runtime(session, record=record, actor=actor)
    patient = session.query(Patient).filter(Patient.id == record.patient_id).first()
    return _build_runtime_payload(session, record, patient)


@router.post("/{session_id}/video/start", response_model=SessionVideoOut)
def start_session_video_endpoint(
    session_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionVideoOut:
    require_minimum_role(actor, "clinician")
    record = _resolve_session_for_actor(session, session_id, actor)
    room_name = f"ds-live-{record.id}"
    _append_session_event(
        session,
        record=record,
        actor=actor,
        event_type="VIDEO",
        note="Video consult started",
        payload={"active": True, "room_name": room_name},
    )
    return SessionVideoOut(room_name=room_name, session_id=record.id, active=True)


@router.post("/{session_id}/video/end", response_model=SessionVideoOut)
def end_session_video_endpoint(
    session_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionVideoOut:
    require_minimum_role(actor, "clinician")
    record = _resolve_session_for_actor(session, session_id, actor)
    room_name = f"ds-live-{record.id}"
    _append_session_event(
        session,
        record=record,
        actor=actor,
        event_type="VIDEO",
        note="Video consult ended",
        payload={"active": False, "room_name": room_name},
    )
    return SessionVideoOut(room_name=room_name, session_id=record.id, active=False)


@router.get("/{session_id}/remote-monitor-snapshot", response_model=RemoteMonitorSnapshotOut)
def get_remote_monitor_snapshot_endpoint(
    session_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> RemoteMonitorSnapshotOut:
    require_minimum_role(actor, "clinician")
    record = _resolve_session_for_actor(session, session_id, actor)
    latest_summary = (
        session.query(WearableDailySummary)
        .filter(WearableDailySummary.patient_id == record.patient_id)
        .order_by(WearableDailySummary.date.desc(), WearableDailySummary.synced_at.desc())
        .first()
    )
    latest_impedance = _latest_event_payload(session, session_id, "IMPEDANCE") or {}
    recent_log = (
        session.query(DeviceSessionLog)
        .filter(DeviceSessionLog.patient_id == record.patient_id)
        .order_by(DeviceSessionLog.logged_at.desc())
        .first()
    )
    recent_event = (
        session.query(PatientAdherenceEvent)
        .filter(PatientAdherenceEvent.patient_id == record.patient_id)
        .order_by(PatientAdherenceEvent.created_at.desc())
        .first()
    )
    adherence = "unknown"
    if recent_event is not None and recent_event.status in {"open", "escalated"}:
        adherence = "review"
    elif recent_log is not None and recent_log.completed:
        adherence = "OK"
    elif recent_log is not None:
        adherence = "missed"
    return RemoteMonitorSnapshotOut(
        hrv=latest_summary.hrv_ms if latest_summary is not None else None,
        impedance=float(latest_impedance.get("impedance_kohm")) if latest_impedance.get("impedance_kohm") is not None else None,
        adherence=adherence,
    )


@router.post("/{session_id}/impedance", response_model=SessionEventOut, status_code=201)
def set_session_impedance_endpoint(
    session_id: str,
    body: SessionImpedanceIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionEventOut:
    require_minimum_role(actor, "clinician")
    record = _resolve_session_for_actor(session, session_id, actor)
    row = _append_session_event(
        session,
        record=record,
        actor=actor,
        event_type="IMPEDANCE",
        note=f"Impedance {body.impedance_kohm:.1f} kOhm",
        payload={"impedance_kohm": body.impedance_kohm},
    )
    return _event_out(row)


@router.patch("/{session_id}", response_model=SessionOut)
def update_session_endpoint(
    session_id: str,
    body: SessionUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SessionOut:
    require_minimum_role(actor, "clinician")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Clinic-scope gate first: confirms the actor may touch this session
    # at all. The repo update/delete functions still take ``clinician_id``
    # for their internal filter so we pass the session's owning clinician
    # — the gate above is what authorises cross-clinician (same-clinic)
    # operation; passing the row's own ``clinician_id`` keeps the repo
    # filter satisfied without re-introducing the owner-only block.
    record = _resolve_session_for_actor(session, session_id, actor)

    # Validate appointment_type if being changed
    if "appointment_type" in updates and updates["appointment_type"] not in VALID_APPOINTMENT_TYPES:
        raise ApiServiceError(
            code="invalid_appointment_type",
            message=f"Invalid appointment_type '{updates['appointment_type']}'. Must be one of: {sorted(VALID_APPOINTMENT_TYPES)}.",
            status_code=400,
        )

    # Enforce status transition rules
    if "status" in updates:
        _validate_status_transition(record.status, updates["status"])
        now_iso = datetime.now(timezone.utc).isoformat()
        new_status = updates["status"]
        if new_status == "confirmed":
            updates.setdefault("confirmed_at", now_iso)
        elif new_status == "checked_in":
            updates.setdefault("checked_in_at", now_iso)
        elif new_status == "completed":
            updates.setdefault("completed_at", now_iso)
        elif new_status == "cancelled":
            updates.setdefault("cancelled_at", now_iso)

    # Conflict detection scopes to the session's owning clinician — same
    # rationale as the create path. Two clinicians at the same clinic
    # legitimately have separate calendars.
    time_changed = "scheduled_at" in updates or "duration_minutes" in updates
    resource_changed = "room_id" in updates or "device_id" in updates
    if time_changed or resource_changed:
        conflicts = check_conflicts(
            session,
            clinician_id=record.clinician_id,
            scheduled_at=updates.get("scheduled_at", record.scheduled_at),
            duration_minutes=updates.get("duration_minutes", record.duration_minutes),
            room_id=updates.get("room_id", record.room_id),
            device_id=updates.get("device_id", record.device_id),
            exclude_id=session_id,
        )
        if conflicts:
            conflict_ids = [c.id for c in conflicts]
            raise ApiServiceError(
                code="scheduling_conflict",
                message=f"Overlapping appointment(s) detected: {conflict_ids}",
                status_code=409,
                details={"conflicting_session_ids": conflict_ids},
            )

    result = update_session(session, session_id, record.clinician_id, **updates)
    if result is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    return SessionOut.from_record(result)


@router.delete("/{session_id}", status_code=204)
def delete_session_endpoint(
    session_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    record = _resolve_session_for_actor(session, session_id, actor)
    deleted = delete_session(session, session_id, record.clinician_id)
    if not deleted:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
