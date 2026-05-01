"""Patient Adherence Events launch-audit (2026-05-01).

Sixth patient-facing launch-audit surface in the chain after Symptom
Journal (#344), Wellness Hub (#345), Patient Reports (#346), Patient
Messages (#347), and Home Devices (#348). Closes the home-therapy
patient-side regulatory chain: register device → log session →
*adherence event* → side-effect → escalate.

The clinic-side ``home_devices_router`` already exposes a clinician
queue for ``patient_adherence_events`` rows. The portal-side
``home_device_portal_router`` already has a thin patient submit/list
shim. Neither emits the regulator-grade audit chain that the launch
audit pattern requires:

* mount-time ``view`` ping
* per-event audits (``task_completed``, ``task_skipped``,
  ``task_partial``, ``side_effect_logged``, ``escalated_to_clinician``,
  ``export``)
* HIGH-priority clinician-visible mirror when severity >= 7
* AE Hub draft when patient escalates a side-effect with severity >= 7
* DEMO-prefixed exports when the patient row is demo
* hard 404 for cross-patient access (IDOR regression test included)

Endpoints
---------
GET    /api/v1/adherence/events                 List patient-scoped events (filters)
GET    /api/v1/adherence/summary                Top counts: today / 7d / streak / side-effects
GET    /api/v1/adherence/events/{id}            Detail (404 cross-patient)
POST   /api/v1/adherence/events                 Log task complete / skip / partial (consent active)
POST   /api/v1/adherence/events/{id}/side-effect    Attach a side-effect note (severity 1..10)
POST   /api/v1/adherence/events/{id}/escalate   Mark escalated; creates AE Hub draft
GET    /api/v1/adherence/export.csv             DEMO-prefixed when demo
GET    /api/v1/adherence/export.ndjson          DEMO-prefixed when demo
POST   /api/v1/adherence/audit-events           Page-level audit ingestion (target_type=adherence_events)

Role gate
---------
Patient role only on these endpoints. Clinicians use the existing
clinician-side ``home_devices_router`` ``/adherence-events`` queue.
Cross-role hits return 404 (never 403/401) so the patient-scope URL
existence is invisible to clinicians and admins. Cross-patient event
lookups also return 404.

Consent gate
------------
Once a patient has revoked consent (``Patient.consent_signed = False``
OR an active ``ConsentRecord`` row with ``status='withdrawn'``) the
page is read-only post-revocation: existing events remain visible,
no new events / side-effects / escalations can be written (HTTP 403).
Mirrors the home_devices_patient_router / patient_messages_router /
wellness_hub_router pattern.

Demo honesty
------------
``is_demo`` is sourced from :func:`_patient_is_demo_ad`. Exports prefix
``DEMO-`` to the filename whenever the patient row is demo and a
``X-Adherence-Demo: 1`` response header is set so reviewers can see
at-a-glance.

Audit hooks
-----------
Every endpoint emits at least one ``adherence_events.<event>`` audit
row through the umbrella audit_events table. Surface name:
``adherence_events`` (whitelisted by ``audit_trail_router.KNOWN_SURFACES``
and the qEEG audit-events ingestion endpoint).
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AdverseEvent,
    ConsentRecord,
    HomeDeviceAssignment,
    Patient,
    PatientAdherenceEvent,
    User,
)


router = APIRouter(prefix="/api/v1/adherence", tags=["Patient Adherence Events"])
_log = logging.getLogger(__name__)


# ── Disclaimers surfaced on every list / summary read ───────────────────────


ADHERENCE_DISCLAIMERS = [
    "Adherence events are part of your clinical record. Marking a "
    "task complete, skipped, or partial creates an audit row your "
    "care team can review.",
    "Side-effect entries are clinical safety signals — severities 7 "
    "or higher trigger a high-priority alert to your clinician.",
    "Escalating an event to your clinician creates a draft entry in "
    "the Adverse Events Hub for review and possible regulatory "
    "reporting.",
    "If you withdraw consent, your existing adherence records remain "
    "readable but no new events / side-effects / escalations can be "
    "logged until consent is reinstated.",
]


# Acceptable values for the patient-side adherence event types we expose
# on this surface. These are a subset of the full
# ``patient_adherence_events.event_type`` taxonomy — the full taxonomy
# remains available to the legacy portal submit endpoint, but the launch
# audit surface restricts patient input to the four task-status flavours
# plus side-effect attachments.
_VALID_TASK_STATUSES = frozenset({"complete", "skipped", "partial"})
_VALID_SEVERITY_INTS = frozenset(range(1, 11))  # 1..10 inclusive


# ── Helpers ─────────────────────────────────────────────────────────────────


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MAX_BACKDATE_DAYS = 30


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Coerce a naive datetime to tz-aware UTC.

    SQLite strips tzinfo on roundtrip — see memory note
    ``deepsynaps-sqlite-tz-naive.md``. All comparisons against
    ``datetime.now(timezone.utc)`` must coerce first.
    """
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    aw = _aware(dt)
    return aw.isoformat() if aw is not None else None


def _validate_report_date(value: str, *, field: str = "report_date") -> str:
    """Pin a self-reported date to ``YYYY-MM-DD``, no future, max 30 days back."""
    if not isinstance(value, str) or not _DATE_RE.match(value):
        raise ApiServiceError(
            code="invalid_date",
            message=f"{field} must be YYYY-MM-DD.",
            status_code=422,
        )
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ApiServiceError(
            code="invalid_date",
            message=f"{field} is not a valid calendar date.",
            status_code=422,
        ) from exc
    today = datetime.now(timezone.utc).date()
    if parsed > today:
        raise ApiServiceError(
            code="invalid_date",
            message=f"{field} cannot be in the future.",
            status_code=422,
        )
    if (today - parsed) > timedelta(days=_MAX_BACKDATE_DAYS):
        raise ApiServiceError(
            code="invalid_date",
            message=(
                f"{field} cannot be more than {_MAX_BACKDATE_DAYS} days in the past."
            ),
            status_code=422,
        )
    return value


def _patient_is_demo_ad(db: Session, patient: Patient | None) -> bool:
    """Mirrors :func:`patients_router._patient_is_demo` for this surface."""
    if patient is None:
        return False
    notes = patient.notes or ""
    if notes.startswith("[DEMO]"):
        return True
    try:
        u = db.query(User).filter_by(id=patient.clinician_id).first()
        if u is None or not u.clinic_id:
            return False
        return u.clinic_id in {"clinic-demo-default", "clinic-cd-demo"}
    except Exception:
        return False


def _resolve_patient_for_actor_ad(
    db: Session, actor: AuthenticatedActor
) -> Patient:
    """Return the Patient row the actor is allowed to act on.

    Patient role only. Cross-role hits return 404 (never 403/401) so the
    patient-scope URL existence is invisible to clinicians and admins.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="not_found",
            message="Patient record not found.",
            status_code=404,
        )

    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        patient = (
            db.query(Patient)
            .filter(Patient.email.in_(list(_DEMO_PATIENT_EMAILS)))
            .first()
        )
    else:
        user = db.query(User).filter_by(id=actor.actor_id).first()
        if user is None or not user.email:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="not_found",
            message="Patient record not found.",
            status_code=404,
        )
    return patient


def _consent_active_ad(db: Session, patient: Patient) -> bool:
    """Same consent gate as patient_messages / wellness_hub / home_devices."""
    has_withdrawn = (
        db.query(ConsentRecord)
        .filter(
            ConsentRecord.patient_id == patient.id,
            ConsentRecord.status == "withdrawn",
        )
        .first()
        is not None
    )
    if has_withdrawn:
        return False
    if patient.consent_signed:
        return True
    has_active = (
        db.query(ConsentRecord)
        .filter(
            ConsentRecord.patient_id == patient.id,
            ConsentRecord.status == "active",
        )
        .first()
        is not None
    )
    return has_active


def _assert_patient_consent_active(db: Session, patient: Patient) -> None:
    if not _consent_active_ad(db, patient):
        raise ApiServiceError(
            code="consent_inactive",
            message=(
                "Logging adherence events, side-effects, or escalations "
                "requires active consent. Existing adherence records "
                "remain readable until consent is reinstated."
            ),
            status_code=403,
        )


def _adherence_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
    target_type: str = "adherence_events",
    role_override: Optional[str] = None,
    actor_override: Optional[str] = None,
) -> str:
    """Best-effort audit hook for the ``adherence_events`` surface.

    Never raises — audit must not block the UI even when the umbrella
    audit table is unreachable. Mirrors the helper in
    home_devices_patient_router / patient_messages_router /
    wellness_hub_router / symptom_journal_router.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    role = role_override or actor.role
    actor_id = actor_override or actor.actor_id
    event_id = (
        f"adherence_events-{event}-{actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if using_demo_data:
        note_parts.append("DEMO")
    if note:
        note_parts.append(note[:500])
    final_note = "; ".join(note_parts) or event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor_id,
            target_type=target_type,
            action=f"adherence_events.{event}",
            role=role,
            actor_id=actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("adherence_events self-audit skipped")
    return event_id


def _get_active_assignment(patient_id: str, db: Session) -> Optional[HomeDeviceAssignment]:
    return (
        db.query(HomeDeviceAssignment)
        .filter(
            HomeDeviceAssignment.patient_id == patient_id,
            HomeDeviceAssignment.status == "active",
        )
        .order_by(HomeDeviceAssignment.created_at.desc())
        .first()
    )


def _resolve_event_or_404(
    db: Session, patient: Patient, event_id: str
) -> PatientAdherenceEvent:
    """Return the adherence event owned by this patient, or 404.

    Cross-patient lookups return 404 even if the row exists — the
    existence of that row must not be observable.
    """
    ev = (
        db.query(PatientAdherenceEvent)
        .filter(
            PatientAdherenceEvent.id == event_id,
            PatientAdherenceEvent.patient_id == patient.id,
        )
        .first()
    )
    if ev is None:
        raise ApiServiceError(
            code="not_found",
            message="Adherence event not found.",
            status_code=404,
        )
    return ev


def _event_to_dict(ev: PatientAdherenceEvent) -> dict:
    structured: dict = {}
    try:
        structured = json.loads(ev.structured_json or "{}")
    except Exception:
        structured = {}
    return {
        "id": ev.id,
        "patient_id": ev.patient_id,
        "assignment_id": ev.assignment_id,
        "course_id": ev.course_id,
        "event_type": ev.event_type,
        "severity": ev.severity,
        "report_date": ev.report_date,
        "body": ev.body,
        "structured": structured,
        "status": ev.status,
        "acknowledged_by": ev.acknowledged_by,
        "acknowledged_at": _iso(ev.acknowledged_at),
        "resolution_note": ev.resolution_note,
        "created_at": _iso(ev.created_at),
    }


# ── Schemas ─────────────────────────────────────────────────────────────────


class AdherenceEventOut(BaseModel):
    id: str
    patient_id: str
    assignment_id: Optional[str] = None
    course_id: Optional[str] = None
    event_type: str
    severity: Optional[str] = None
    report_date: str
    body: Optional[str] = None
    structured: dict = Field(default_factory=dict)
    status: str
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[str] = None
    resolution_note: Optional[str] = None
    created_at: Optional[str] = None


class AdherenceEventListResponse(BaseModel):
    items: list[AdherenceEventOut] = Field(default_factory=list)
    total: int
    consent_active: bool
    is_demo: bool
    disclaimers: list[str] = Field(default_factory=lambda: list(ADHERENCE_DISCLAIMERS))


class AdherenceSummaryResponse(BaseModel):
    total_events: int = 0
    completed_today: int = 0
    skipped_today: int = 0
    partial_today: int = 0
    side_effects_7d: int = 0
    escalated_open: int = 0
    missed_streak_days: int = 0
    last_event_at: Optional[str] = None
    consent_active: bool = True
    is_demo: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(ADHERENCE_DISCLAIMERS))


class AdherenceLogIn(BaseModel):
    """Patient logs a task complete / skipped / partial."""

    status: str = Field(..., min_length=1, max_length=20)
    report_date: str = Field(..., description="YYYY-MM-DD")
    task_id: Optional[str] = Field(default=None, max_length=64)
    body: Optional[str] = Field(default=None, max_length=2000)
    reason: Optional[str] = Field(default=None, max_length=500)

    @field_validator("status")
    @classmethod
    def _validate_status(cls, v: str) -> str:
        v_lc = (v or "").strip().lower()
        if v_lc not in _VALID_TASK_STATUSES:
            raise ValueError(
                f"status must be one of: {', '.join(sorted(_VALID_TASK_STATUSES))}"
            )
        return v_lc


class AdherenceSideEffectIn(BaseModel):
    severity: int = Field(..., ge=1, le=10)
    body_part: Optional[str] = Field(default=None, max_length=80)
    note: str = Field(..., min_length=1, max_length=2000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("note cannot be blank")
        return v


class AdherenceEscalateIn(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def _strip_reason(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("escalation reason cannot be blank")
        return v


class AdherenceEscalateOut(BaseModel):
    accepted: bool
    event_id: str
    adverse_event_id: Optional[str] = None
    status: str


class AdherenceAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    event_record_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class AdherenceAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/events", response_model=AdherenceEventListResponse)
def list_events(
    since: Optional[str] = Query(default=None, max_length=10),
    until: Optional[str] = Query(default=None, max_length=10),
    status: Optional[str] = Query(default=None, max_length=32),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceEventListResponse:
    """List the patient's adherence events (newest first)."""
    patient = _resolve_patient_for_actor_ad(db, actor)
    is_demo = _patient_is_demo_ad(db, patient)

    q = db.query(PatientAdherenceEvent).filter(
        PatientAdherenceEvent.patient_id == patient.id
    )
    if since:
        # Light validation only — accept any YYYY-MM-DD; otherwise ignore.
        if _DATE_RE.match(since):
            q = q.filter(PatientAdherenceEvent.report_date >= since)
    if until:
        if _DATE_RE.match(until):
            q = q.filter(PatientAdherenceEvent.report_date <= until)
    if status:
        q = q.filter(PatientAdherenceEvent.status == status.strip().lower())

    rows = (
        q.order_by(PatientAdherenceEvent.created_at.desc())
        .limit(500)
        .all()
    )

    _adherence_audit(
        db,
        actor,
        event="view",
        target_id=patient.id,
        note=(
            f"items={len(rows)} since={since or '-'} until={until or '-'} "
            f"status_filter={status or '-'}"
        ),
        using_demo_data=is_demo,
    )

    return AdherenceEventListResponse(
        items=[AdherenceEventOut(**_event_to_dict(r)) for r in rows],
        total=len(rows),
        consent_active=_consent_active_ad(db, patient),
        is_demo=is_demo,
    )


@router.get("/summary", response_model=AdherenceSummaryResponse)
def get_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceSummaryResponse:
    """Top counts: today / 7d / streak / side-effects / escalated."""
    patient = _resolve_patient_for_actor_ad(db, actor)
    is_demo = _patient_is_demo_ad(db, patient)

    rows = (
        db.query(PatientAdherenceEvent)
        .filter(PatientAdherenceEvent.patient_id == patient.id)
        .order_by(PatientAdherenceEvent.created_at.desc())
        .all()
    )

    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()
    week_cutoff = now - timedelta(days=7)

    def _is_status(ev: PatientAdherenceEvent, status: str) -> bool:
        try:
            payload = json.loads(ev.structured_json or "{}")
        except Exception:
            payload = {}
        return (payload.get("status") or "").lower() == status

    completed_today = sum(
        1 for r in rows
        if r.event_type == "adherence_report"
        and r.report_date == today_str
        and _is_status(r, "complete")
    )
    skipped_today = sum(
        1 for r in rows
        if r.event_type == "adherence_report"
        and r.report_date == today_str
        and _is_status(r, "skipped")
    )
    partial_today = sum(
        1 for r in rows
        if r.event_type == "adherence_report"
        and r.report_date == today_str
        and _is_status(r, "partial")
    )

    side_effects_7d = sum(
        1 for r in rows
        if r.event_type == "side_effect"
        and _aware(r.created_at) is not None
        and _aware(r.created_at) >= week_cutoff  # type: ignore[operator]
    )

    escalated_open = sum(
        1 for r in rows
        if r.status == "escalated"
    )

    # Missed-day streak: count consecutive days back from today where the
    # patient logged neither a complete adherence_report nor any event.
    days_with_complete: set[str] = set()
    for r in rows:
        if r.event_type == "adherence_report" and _is_status(r, "complete"):
            days_with_complete.add((r.report_date or "")[:10])
    missed_streak = 0
    cursor = now.date()
    while True:
        if cursor.isoformat() in days_with_complete:
            break
        missed_streak += 1
        cursor = cursor - timedelta(days=1)
        if missed_streak > 365:  # safety bound
            break

    last_event_at = _iso(rows[0].created_at) if rows else None

    _adherence_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=patient.id,
        note=(
            f"events={len(rows)} completed_today={completed_today} "
            f"skipped_today={skipped_today} partial_today={partial_today} "
            f"side_effects_7d={side_effects_7d} escalated_open={escalated_open} "
            f"missed_streak={missed_streak}"
        ),
        using_demo_data=is_demo,
    )

    return AdherenceSummaryResponse(
        total_events=len(rows),
        completed_today=completed_today,
        skipped_today=skipped_today,
        partial_today=partial_today,
        side_effects_7d=side_effects_7d,
        escalated_open=escalated_open,
        missed_streak_days=missed_streak,
        last_event_at=last_event_at,
        consent_active=_consent_active_ad(db, patient),
        is_demo=is_demo,
    )


@router.get("/events/{event_id}", response_model=AdherenceEventOut)
def get_event(
    event_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceEventOut:
    """Return one adherence event the patient owns. 404 cross-patient."""
    patient = _resolve_patient_for_actor_ad(db, actor)
    is_demo = _patient_is_demo_ad(db, patient)
    ev = _resolve_event_or_404(db, patient, event_id)

    _adherence_audit(
        db,
        actor,
        event="event_viewed",
        target_id=ev.id,
        note=f"event_type={ev.event_type}; status={ev.status}",
        using_demo_data=is_demo,
    )
    return AdherenceEventOut(**_event_to_dict(ev))


@router.post(
    "/events",
    response_model=AdherenceEventOut,
    status_code=201,
)
def log_event(
    body: AdherenceLogIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceEventOut:
    """Log a task as complete / skipped / partial."""
    patient = _resolve_patient_for_actor_ad(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_ad(db, patient)

    report_date_validated = _validate_report_date(body.report_date)
    assignment = _get_active_assignment(patient.id, db)

    structured = {
        "status": body.status,
        "task_id": body.task_id,
        "reason": body.reason,
    }

    now = datetime.now(timezone.utc)
    ev = PatientAdherenceEvent(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        assignment_id=assignment.id if assignment else None,
        course_id=assignment.course_id if assignment else None,
        event_type="adherence_report",
        severity=None,
        report_date=report_date_validated,
        body=body.body,
        structured_json=json.dumps(structured),
        status="open",
        created_at=now,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    audit_event = {
        "complete": "task_completed",
        "skipped": "task_skipped",
        "partial": "task_partial",
    }.get(body.status, "task_logged")

    _adherence_audit(
        db,
        actor,
        event=audit_event,
        target_id=ev.id,
        note=(
            f"date={report_date_validated}; task={body.task_id or '-'}; "
            f"reason={(body.reason or '-')[:200]}"
        ),
        using_demo_data=is_demo,
    )
    return AdherenceEventOut(**_event_to_dict(ev))


@router.post(
    "/events/{event_id}/side-effect",
    response_model=AdherenceEventOut,
    status_code=201,
)
def log_side_effect(
    body: AdherenceSideEffectIn,
    event_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceEventOut:
    """Attach a side-effect entry to an existing adherence event.

    Stored as a sibling ``patient_adherence_events`` row with
    ``event_type='side_effect'`` so the clinician queue
    (``home_devices_router /adherence-events``) picks it up.

    When ``severity >= 7`` we also emit a HIGH-priority clinician-visible
    audit row so the care-team feed surfaces the signal without the
    patient having to formally escalate to the AE Hub.
    """
    patient = _resolve_patient_for_actor_ad(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_ad(db, patient)
    parent = _resolve_event_or_404(db, patient, event_id)

    if body.severity not in _VALID_SEVERITY_INTS:
        raise ApiServiceError(
            code="invalid_severity",
            message="severity must be an integer 1..10.",
            status_code=422,
        )

    # Map 1..10 numeric severity to the stored low/moderate/high/urgent
    # bucket on patient_adherence_events.severity for backward
    # compatibility with the clinician-side queue.
    sev_bucket = (
        "urgent" if body.severity >= 9
        else "high" if body.severity >= 7
        else "moderate" if body.severity >= 4
        else "low"
    )

    structured = {
        "severity_int": int(body.severity),
        "body_part": body.body_part,
        "parent_event_id": parent.id,
    }

    now = datetime.now(timezone.utc)
    se = PatientAdherenceEvent(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        assignment_id=parent.assignment_id,
        course_id=parent.course_id,
        event_type="side_effect",
        severity=sev_bucket,
        report_date=parent.report_date,
        body=body.note,
        structured_json=json.dumps(structured),
        status="open",
        created_at=now,
    )
    db.add(se)
    db.commit()
    db.refresh(se)

    # Patient-side audit row.
    _adherence_audit(
        db,
        actor,
        event="side_effect_logged",
        target_id=se.id,
        note=(
            f"parent={parent.id}; severity={body.severity}; "
            f"bucket={sev_bucket}; body_part={(body.body_part or '-')[:60]}"
        ),
        using_demo_data=is_demo,
    )
    # HIGH-priority clinician-visible mirror when severity >= 7.
    if body.severity >= 7:
        clinician_actor = patient.clinician_id or "actor-clinician-demo"
        _adherence_audit(
            db,
            actor,
            event="side_effect_to_clinician",
            target_id=clinician_actor,
            note=(
                f"priority=high; event={se.id}; severity={body.severity}; "
                f"bucket={sev_bucket}; "
                f"body_part={(body.body_part or '-')[:60]}"
            ),
            using_demo_data=is_demo,
            role_override="clinician",
            actor_override=clinician_actor,
        )

    return AdherenceEventOut(**_event_to_dict(se))


@router.post(
    "/events/{event_id}/escalate",
    response_model=AdherenceEscalateOut,
)
def escalate_event(
    body: AdherenceEscalateIn,
    event_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceEscalateOut:
    """Escalate an event to the AE Hub. Creates a clinician draft row.

    Side-effects with ``severity_int >= 7`` produce an
    :class:`AdverseEvent` row in ``status='reported'`` so the clinician
    AE Hub picks it up. A clinician-visible audit row is always emitted
    regardless of whether an AE Hub draft was created (e.g. for
    ``adherence_report`` escalations the patient just wants their
    clinician to see the row).
    """
    patient = _resolve_patient_for_actor_ad(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_ad(db, patient)
    ev = _resolve_event_or_404(db, patient, event_id)

    now = datetime.now(timezone.utc)
    ev.status = "escalated"
    ev.resolution_note = (body.reason or "")[:1000]

    severity_int: Optional[int] = None
    try:
        sd = json.loads(ev.structured_json or "{}")
        sv = sd.get("severity_int")
        if isinstance(sv, int) and 1 <= sv <= 10:
            severity_int = sv
    except Exception:
        severity_int = None

    # Bucket back to AE severity vocabulary.
    ae_severity = "mild"
    if ev.severity == "urgent" or (severity_int is not None and severity_int >= 9):
        ae_severity = "severe"
    elif ev.severity == "high" or (severity_int is not None and severity_int >= 7):
        ae_severity = "moderate"
    elif ev.severity == "moderate" or (severity_int is not None and severity_int >= 4):
        ae_severity = "moderate"

    ae_id: Optional[str] = None
    # Create AE Hub draft only for side-effects with HIGH severity.
    if ev.event_type == "side_effect" and (
        ev.severity in {"high", "urgent"}
        or (severity_int is not None and severity_int >= 7)
    ):
        ae = AdverseEvent(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            course_id=ev.course_id,
            session_id=None,
            clinician_id=patient.clinician_id or "actor-clinician-demo",
            event_type="patient_reported_side_effect",
            severity=ae_severity,
            description=(
                f"Patient-escalated from adherence_event {ev.id}. "
                f"Reason: {body.reason[:300]}. "
                f"Body: {(ev.body or '')[:500]}"
            ),
            onset_timing=None,
            resolution=None,
            action_taken=None,
            reported_at=now,
            resolved_at=None,
            created_at=now,
            body_system=None,
            expectedness="unknown",
            expectedness_source=None,
            is_serious=ae_severity == "severe",
            sae_criteria=None,
            reportable=False,
            relatedness="possible",
            is_demo=bool(is_demo),
        )
        db.add(ae)
        ae_id = ae.id

    db.commit()
    db.refresh(ev)

    # Patient-side audit row.
    _adherence_audit(
        db,
        actor,
        event="escalated_to_clinician",
        target_id=ev.id,
        note=(
            f"reason={body.reason[:200]}; ae_id={ae_id or '-'}; "
            f"severity_int={severity_int or '-'}"
        ),
        using_demo_data=is_demo,
    )
    # Clinician-visible mirror — always emitted on escalate.
    clinician_actor = patient.clinician_id or "actor-clinician-demo"
    priority = "high" if ae_id is not None else "normal"
    _adherence_audit(
        db,
        actor,
        event="escalated_to_clinician_mirror",
        target_id=clinician_actor,
        note=(
            f"priority={priority}; event={ev.id}; "
            f"event_type={ev.event_type}; "
            f"ae_id={ae_id or '-'}"
        ),
        using_demo_data=is_demo,
        role_override="clinician",
        actor_override=clinician_actor,
    )

    return AdherenceEscalateOut(
        accepted=True,
        event_id=ev.id,
        adverse_event_id=ae_id,
        status=ev.status,
    )


@router.get("/export.csv")
def export_csv(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of every adherence event for this patient."""
    patient = _resolve_patient_for_actor_ad(db, actor)
    is_demo = _patient_is_demo_ad(db, patient)

    rows = (
        db.query(PatientAdherenceEvent)
        .filter(PatientAdherenceEvent.patient_id == patient.id)
        .order_by(PatientAdherenceEvent.created_at.desc())
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "event_id", "patient_id", "event_type", "severity",
        "report_date", "status", "body", "created_at",
    ])
    for r in rows:
        writer.writerow([
            r.id, r.patient_id, r.event_type, r.severity or "",
            r.report_date, r.status,
            (r.body or "").replace("\n", " "),
            _iso(r.created_at) or "",
        ])

    prefix = "DEMO-" if is_demo else ""
    filename = f"{prefix}adherence-events-{patient.id}.csv"

    _adherence_audit(
        db,
        actor,
        event="export",
        target_id=patient.id,
        note=f"format=csv; rows={len(rows)}; demo={1 if is_demo else 0}",
        using_demo_data=is_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Adherence-Demo": "1" if is_demo else "0",
        },
    )


@router.get("/export.ndjson")
def export_ndjson(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one event per line."""
    patient = _resolve_patient_for_actor_ad(db, actor)
    is_demo = _patient_is_demo_ad(db, patient)

    rows = (
        db.query(PatientAdherenceEvent)
        .filter(PatientAdherenceEvent.patient_id == patient.id)
        .order_by(PatientAdherenceEvent.created_at.desc())
        .all()
    )

    lines: list[str] = []
    for r in rows:
        lines.append(json.dumps(_event_to_dict(r) | {"is_demo": bool(is_demo)}))

    prefix = "DEMO-" if is_demo else ""
    filename = f"{prefix}adherence-events-{patient.id}.ndjson"

    _adherence_audit(
        db,
        actor,
        event="export",
        target_id=patient.id,
        note=f"format=ndjson; rows={len(rows)}; demo={1 if is_demo else 0}",
        using_demo_data=is_demo,
    )

    return Response(
        content="\n".join(lines) + ("\n" if lines else ""),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Adherence-Demo": "1" if is_demo else "0",
        },
    )


@router.post("/audit-events", response_model=AdherenceAuditEventOut)
def post_adherence_audit_event(
    body: AdherenceAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceAuditEventOut:
    """Page-level audit ingestion for the patient Adherence Events UI.

    Surface: ``adherence_events``. Common events: ``view`` (mount),
    ``filter_changed``, ``event_viewed``, ``task_completed``,
    ``task_skipped``, ``task_partial``, ``side_effect_logged``,
    ``escalated_to_clinician``, ``export``, ``deep_link_followed``,
    ``demo_banner_shown``, ``consent_banner_shown``.

    Patient role only — clinicians cannot emit ``adherence_events``
    audit rows directly. Cross-patient ingestion is blocked because
    ``event_record_id`` (when supplied) is verified to belong to the
    actor's patient.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="patient_role_required",
            message=(
                "Adherence Events audit ingestion is restricted to the "
                "patient role."
            ),
            status_code=403,
        )
    patient = _resolve_patient_for_actor_ad(db, actor)
    is_demo = _patient_is_demo_ad(db, patient)

    target_id: str = patient.id
    if body.event_record_id:
        any_ev = (
            db.query(PatientAdherenceEvent)
            .filter(PatientAdherenceEvent.id == body.event_record_id)
            .first()
        )
        if any_ev is not None and any_ev.patient_id != patient.id:
            raise ApiServiceError(
                code="not_found",
                message="Adherence event not found.",
                status_code=404,
            )
        target_id = body.event_record_id

    note_parts: list[str] = []
    if body.event_record_id:
        note_parts.append(f"event={body.event_record_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    event_id = _adherence_audit(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=bool(body.using_demo_data) or is_demo,
    )
    return AdherenceAuditEventOut(accepted=True, event_id=event_id)
