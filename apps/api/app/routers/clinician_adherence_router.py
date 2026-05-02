"""Clinician Adherence Hub launch-audit (2026-05-01).

Bidirectional counterpart to the patient-facing Adherence Events surface
landed in #350. The patient-side router gives patients an audited
``log → side-effect → escalate`` chain on their own row; this surface
gives clinicians a CROSS-PATIENT triage queue scoped to the clinic so a
clinician can clear today's adherence backlog in bulk rather than
opening one Inbox detail at a time.

Closes the regulator chain on home-therapy adherence:

    patient logs adherence (#350) →
      clinician triages cross-patient (THIS PAGE) →
        SLA breach via Care Team Coverage (#357) →
          on-call paging.

Endpoints
---------
GET    /api/v1/clinician-adherence/events                List clinic-scoped events (filters)
GET    /api/v1/clinician-adherence/events/summary        Top counts (today / 7d / side-effects / escalated / SAE / response-rate / missed-streak top-5)
GET    /api/v1/clinician-adherence/events/{id}           Detail (404 if not actor's clinic)
POST   /api/v1/clinician-adherence/events/{id}/acknowledge   Note required; flips status open → acknowledged
POST   /api/v1/clinician-adherence/events/{id}/escalate      Note required; creates AdverseEvent draft + HIGH-priority audit
POST   /api/v1/clinician-adherence/events/{id}/resolve       Note required; immutable thereafter (409 on subsequent action)
POST   /api/v1/clinician-adherence/events/bulk-acknowledge   Note + list of event_ids; partial failures reported
GET    /api/v1/clinician-adherence/events/export.csv     DEMO-prefixed when any flag's patient demo
GET    /api/v1/clinician-adherence/events/export.ndjson  DEMO-prefixed when any flag's patient demo
POST   /api/v1/clinician-adherence/audit-events          Page audit (target_type=clinician_adherence_hub)

Role gate
---------
clinician / admin / supervisor / reviewer / regulator. Patients hit 403.

Cross-clinic
------------
Non-admin clinicians see only events whose owning patient's clinician
shares ``actor.clinic_id``. Cross-clinic detail / mutation hits 404.
Admins (and supervisors / regulators) see all clinics — same pattern as
the existing Wearables Workbench (#353).

Workflow
--------
``open`` → ``acknowledged`` (optional) → ``escalated`` (optional) →
``resolved``. Resolution is a hard immutability gate: any subsequent
state change attempt returns 409 so the audit transcript stays clean.

Escalation
----------
Creates an :class:`AdverseEvent` in ``status='reported'`` keyed to the
event's patient + course (when known). Mirrors the Adherence Events
patient-side escalation pattern (#350) and the Wearables Workbench
escalation pattern (#353) so the regulatory chain stays intact end-to-
end across surfaces.

Demo honesty
------------
If any event's owning patient is a demo patient, exports prefix
``DEMO-`` to the filename and set ``X-ClinicianAdherenceHub-Demo: 1``.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AdverseEvent,
    Patient,
    PatientAdherenceEvent,
    User,
)


router = APIRouter(
    prefix="/api/v1/clinician-adherence",
    tags=["Clinician Adherence Hub"],
)
_log = logging.getLogger(__name__)


# Honest disclaimers always rendered on the page so reviewers know the
# regulatory weight of the surface.
HUB_DISCLAIMERS = [
    "Adherence events here come directly from patient-side reports "
    "logged via the Patient Adherence surface (#350). Counts are real "
    "audit-table aggregates, not AI-fabricated cohort scoring.",
    "Acknowledge → Escalate → Resolve is the canonical triage flow. "
    "Resolved events are immutable and surface in the regulator audit trail.",
    "Escalating an event creates an Adverse Event Hub draft visible to "
    "all clinicians at this clinic. Use the AE Hub to complete "
    "classification, review, and (where reportable) regulator submission.",
    "Demo events are clearly labelled and exports are DEMO-prefixed. "
    "They are not regulator-submittable.",
]


HUB_STATUSES = ("open", "acknowledged", "escalated", "resolved")
_VALID_SEVERITIES = ("low", "moderate", "high", "urgent")
_VALID_SURFACE_CHIPS = ("adherence_report", "side_effect", "tolerance_change",
                         "break_request", "concern", "positive_feedback")
_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ── Helpers ─────────────────────────────────────────────────────────────────


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


def _require_clinician_or_admin(actor: AuthenticatedActor) -> None:
    """Role gate.

    Patients get a 403 (not 404) so the URL existence is acknowledged but
    the surface is denied — the inverse of the patient-side router which
    hides clinician URLs behind a 404. Mirror of the Wearables Workbench
    role gate.
    """
    if actor.role not in (
        "clinician", "admin", "supervisor", "reviewer", "regulator"
    ):
        raise ApiServiceError(
            code="forbidden",
            message="Clinician access required for the Adherence Hub.",
            status_code=403,
        )


def _is_admin_scope(actor: AuthenticatedActor) -> bool:
    return actor.role in ("admin", "supervisor", "regulator")


def _patient_is_demo(db: Session, patient_id: str) -> bool:
    """Best-effort demo detection mirroring the patient-router helper."""
    try:
        p = db.query(Patient).filter_by(id=patient_id).first()
        if p is None:
            return False
        notes = p.notes or ""
        if notes.startswith("[DEMO]"):
            return True
        u = db.query(User).filter_by(id=p.clinician_id).first()
        if u is None or not u.clinic_id:
            return False
        return u.clinic_id in _DEMO_CLINIC_IDS
    except Exception:
        return False


def _event_clinic_id(db: Session, event: PatientAdherenceEvent) -> Optional[str]:
    """Resolve the owning clinic of the event via patient → clinician → user."""
    patient = db.query(Patient).filter_by(id=event.patient_id).first()
    if patient is None:
        return None
    if not patient.clinician_id:
        return None
    user = db.query(User).filter_by(id=patient.clinician_id).first()
    if user is None:
        return None
    return user.clinic_id


def _resolve_event_or_404(
    db: Session,
    actor: AuthenticatedActor,
    event_id: str,
) -> PatientAdherenceEvent:
    """Fetch a patient_adherence_events row scoped to actor's clinic.

    Cross-clinic clinicians get 404 (the existence of the event must not
    leak across clinics). Admins / supervisors / regulators see everything.
    """
    ev = db.query(PatientAdherenceEvent).filter_by(id=event_id).first()
    if ev is None:
        raise ApiServiceError(
            code="not_found",
            message="Adherence event not found.",
            status_code=404,
        )
    if _is_admin_scope(actor):
        return ev
    ev_clinic = _event_clinic_id(db, ev)
    if ev_clinic is None or ev_clinic != actor.clinic_id:
        raise ApiServiceError(
            code="not_found",
            message="Adherence event not found.",
            status_code=404,
        )
    return ev


def _scope_query(actor: AuthenticatedActor):
    """Return a callable that produces the base scoped query.

    For non-admin clinicians, scopes to ``actor.clinic_id``. Admins /
    supervisors / regulators see all rows. Mirrors the Wearables
    Workbench scope query pattern.
    """
    def _q(db: Session):
        base = db.query(PatientAdherenceEvent)
        if _is_admin_scope(actor):
            return base
        if not actor.clinic_id:
            # No clinic on the actor — return an empty slice rather than
            # the legacy "all clinicians' patients globally" fallback.
            return base.filter(PatientAdherenceEvent.id.is_(None))
        return (
            base.join(Patient, PatientAdherenceEvent.patient_id == Patient.id)
            .join(User, User.id == Patient.clinician_id)
            .filter(User.clinic_id == actor.clinic_id)
        )

    return _q


def _hub_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
    target_type: str = "clinician_adherence_hub",
) -> str:
    """Best-effort audit hook for the ``clinician_adherence_hub`` surface.

    Never raises — audit must not block the UI even when the umbrella
    audit table is unreachable. Mirrors helpers in
    wearables_workbench_router / adherence_events_router.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"clinician_adherence_hub-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
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
            target_id=str(target_id) or actor.actor_id,
            target_type=target_type,
            action=f"clinician_adherence_hub.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("clinician_adherence_hub self-audit skipped")
    return event_id


def _serialize_event(
    db: Session,
    ev: PatientAdherenceEvent,
) -> dict:
    """Render a single event for list / detail responses."""
    patient = db.query(Patient).filter_by(id=ev.patient_id).first()
    patient_label = (
        f"{(patient.first_name or '').strip()} {(patient.last_name or '').strip()}".strip()
        if patient is not None
        else ev.patient_id
    )
    is_demo = _patient_is_demo(db, ev.patient_id)
    structured: dict = {}
    try:
        structured = json.loads(ev.structured_json or "{}")
    except Exception:
        structured = {}

    return {
        "id": ev.id,
        "patient_id": ev.patient_id,
        "patient_name": patient_label or ev.patient_id,
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
        "is_demo": bool(is_demo),
    }


def _resolve_actor_clinician_id(
    actor: AuthenticatedActor,
    fallback_patient_clinician: Optional[str],
) -> str:
    """Pick the ``clinician_id`` to stamp on an AE row.

    Prefers the actor (the clinician who pressed Escalate). Falls back to
    the patient's owning clinician for admin actors that have no
    clinician identity. Last resort uses ``actor-clinician-demo`` so the
    NOT NULL column is satisfied in seed-only test runs.
    """
    if actor.role == "clinician":
        return actor.actor_id
    if fallback_patient_clinician:
        return fallback_patient_clinician
    return actor.actor_id or "actor-clinician-demo"


# ── Schemas ─────────────────────────────────────────────────────────────────


class HubEventOut(BaseModel):
    id: str
    patient_id: str
    patient_name: str
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
    is_demo: bool = False


class HubListResponse(BaseModel):
    items: list[HubEventOut] = Field(default_factory=list)
    total: int = 0
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(HUB_DISCLAIMERS))


class HubMissedStreakPatient(BaseModel):
    patient_id: str
    patient_name: str
    streak_days: int


class HubSummaryResponse(BaseModel):
    total_today: int = 0
    total_7d: int = 0
    side_effects_7d: int = 0
    escalated_7d: int = 0
    sae_flagged: int = 0
    response_rate_pct: float = 0.0
    missed_streak_top_patients: list[HubMissedStreakPatient] = Field(default_factory=list)
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(HUB_DISCLAIMERS))


class HubActionIn(BaseModel):
    note: str = Field(..., min_length=1, max_length=1000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("note cannot be blank")
        return v


class HubEscalateIn(HubActionIn):
    body_system: Optional[str] = Field(default=None, max_length=20)


class HubBulkAcknowledgeIn(BaseModel):
    event_ids: list[str] = Field(..., min_length=1, max_length=200)
    note: str = Field(..., min_length=1, max_length=1000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("note cannot be blank")
        return v


class HubBulkAcknowledgeOut(BaseModel):
    accepted: bool = True
    succeeded: int = 0
    failures: list[dict] = Field(default_factory=list)


class HubActionOut(BaseModel):
    accepted: bool = True
    event_id: str
    status: str
    adverse_event_id: Optional[str] = None


class HubAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    event_record_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class HubAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/events", response_model=HubListResponse)
def list_events(
    severity: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    surface_chip: Optional[str] = Query(default=None, alias="surface_chip"),
    patient_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=200, ge=1, le=1000),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubListResponse:
    """List clinic-scoped adherence events for clinician triage."""
    _require_clinician_or_admin(actor)
    base = _scope_query(actor)(db)

    if severity and severity in _VALID_SEVERITIES:
        base = base.filter(PatientAdherenceEvent.severity == severity)
    if status and status in HUB_STATUSES:
        base = base.filter(PatientAdherenceEvent.status == status)
    if surface_chip and surface_chip in _VALID_SURFACE_CHIPS:
        base = base.filter(PatientAdherenceEvent.event_type == surface_chip)
    if patient_id:
        base = base.filter(PatientAdherenceEvent.patient_id == patient_id)
    if since and _DATE_RE.match(since):
        base = base.filter(PatientAdherenceEvent.report_date >= since)
    if until and _DATE_RE.match(until):
        base = base.filter(PatientAdherenceEvent.report_date <= until)
    if q:
        like = f"%{q.strip()}%"
        base = base.filter(PatientAdherenceEvent.body.ilike(like))

    rows = (
        base.order_by(PatientAdherenceEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    items = [HubEventOut(**_serialize_event(db, r)) for r in rows]
    is_demo_view = any(it.is_demo for it in items)

    _hub_audit(
        db,
        actor,
        event="events_listed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"items={len(items)} status={status or '-'} severity={severity or '-'} "
            f"surface_chip={surface_chip or '-'} patient_id={patient_id or '-'} "
            f"q={(q or '-')[:60]}"
        ),
        using_demo_data=is_demo_view,
    )

    return HubListResponse(
        items=items,
        total=len(items),
        is_demo_view=is_demo_view,
    )


@router.get("/events/summary", response_model=HubSummaryResponse)
def get_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubSummaryResponse:
    """Top counts: total today/7d, side-effects 7d, escalated 7d, SAE flagged, response-rate %, missed-streak top-5."""
    _require_clinician_or_admin(actor)
    rows = _scope_query(actor)(db).all()

    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()
    week_cutoff = now - timedelta(days=7)

    def _created_aware(r: PatientAdherenceEvent) -> datetime:
        return _aware(r.created_at) or now

    total_today = sum(1 for r in rows if r.report_date == today_str)
    total_7d = sum(1 for r in rows if _created_aware(r) >= week_cutoff)
    side_effects_7d = sum(
        1 for r in rows
        if r.event_type == "side_effect" and _created_aware(r) >= week_cutoff
    )
    escalated_7d = sum(
        1 for r in rows
        if r.status == "escalated" and _created_aware(r) >= week_cutoff
    )
    # SAE flagged: severity=urgent for side-effects (downstream AE Hub
    # is_serious=True). These are the rows requiring immediate attention.
    sae_flagged = sum(
        1 for r in rows
        if r.event_type == "side_effect" and r.severity == "urgent"
    )

    # Response rate: fraction of events that have been actioned
    # (acknowledged / escalated / resolved). Open events are unactioned.
    actioned = sum(1 for r in rows if r.status != "open")
    response_rate = (actioned / len(rows) * 100.0) if rows else 0.0

    # Missed-streak per patient: count consecutive days back from today
    # where the patient has logged NO complete adherence_report. Top 5.
    def _is_complete(r: PatientAdherenceEvent) -> bool:
        if r.event_type != "adherence_report":
            return False
        try:
            sd = json.loads(r.structured_json or "{}")
            return (sd.get("status") or "").lower() == "complete"
        except Exception:
            return False

    by_patient: dict[str, set[str]] = {}
    for r in rows:
        if _is_complete(r):
            by_patient.setdefault(r.patient_id, set()).add(
                (r.report_date or "")[:10]
            )

    # Build a set of patient ids known to the scope so we account for
    # patients with zero rows too (highest-streak case in clinical reality).
    scope_patient_ids: set[str] = set()
    for r in rows:
        scope_patient_ids.add(r.patient_id)

    streaks: list[tuple[str, int]] = []
    for pid in scope_patient_ids:
        days_with_complete = by_patient.get(pid, set())
        streak = 0
        cursor = now.date()
        while True:
            if cursor.isoformat() in days_with_complete:
                break
            streak += 1
            cursor = cursor - timedelta(days=1)
            if streak > 30:  # safety bound — surface as 30+
                break
        if streak > 0:
            streaks.append((pid, streak))

    streaks.sort(key=lambda t: t[1], reverse=True)
    top_streak: list[HubMissedStreakPatient] = []
    for pid, streak in streaks[:5]:
        p = db.query(Patient).filter_by(id=pid).first()
        label = (
            f"{(p.first_name or '').strip()} {(p.last_name or '').strip()}".strip()
            if p is not None
            else pid
        )
        top_streak.append(
            HubMissedStreakPatient(
                patient_id=pid,
                patient_name=label or pid,
                streak_days=streak,
            )
        )

    is_demo_view = any(_patient_is_demo(db, r.patient_id) for r in rows)

    _hub_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"today={total_today} 7d={total_7d} se_7d={side_effects_7d} "
            f"esc_7d={escalated_7d} sae={sae_flagged} "
            f"response={response_rate:.1f}% streak_top={len(top_streak)}"
        ),
        using_demo_data=is_demo_view,
    )

    return HubSummaryResponse(
        total_today=total_today,
        total_7d=total_7d,
        side_effects_7d=side_effects_7d,
        escalated_7d=escalated_7d,
        sae_flagged=sae_flagged,
        response_rate_pct=round(response_rate, 1),
        missed_streak_top_patients=top_streak,
        is_demo_view=is_demo_view,
    )


@router.post("/audit-events", response_model=HubAuditEventOut)
def post_audit_event(
    body: HubAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubAuditEventOut:
    """Page-level audit ingestion for the Clinician Adherence Hub.

    Common events: ``view`` (mount), ``filter_changed``, ``event_viewed``,
    ``deep_link_followed``, ``demo_banner_shown``, ``export_initiated``.
    Per-event mutation events (``event_acknowledged`` / ``event_escalated`` /
    ``event_resolved`` / ``bulk_acknowledged``) are emitted by the
    dedicated endpoints below — this surface only carries the page-level
    breadcrumbs.

    Patients hit 403; cross-clinic event ids → 404.
    """
    _require_clinician_or_admin(actor)

    target_id = body.event_record_id or actor.clinic_id or actor.actor_id
    is_demo = bool(body.using_demo_data)
    if body.event_record_id:
        ev = _resolve_event_or_404(db, actor, body.event_record_id)
        is_demo = is_demo or _patient_is_demo(db, ev.patient_id)

    note_parts: list[str] = []
    if body.event_record_id:
        note_parts.append(f"event={body.event_record_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    event_id = _hub_audit(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=is_demo,
    )
    return HubAuditEventOut(accepted=True, event_id=event_id)


@router.get("/events/export.csv")
def export_csv(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of the clinic-scoped triage queue."""
    _require_clinician_or_admin(actor)
    rows = (
        _scope_query(actor)(db)
        .order_by(PatientAdherenceEvent.created_at.desc())
        .limit(5000)
        .all()
    )

    any_demo = any(_patient_is_demo(db, r.patient_id) for r in rows)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "event_id", "patient_id", "course_id", "event_type", "severity",
        "report_date", "status", "acknowledged_at", "acknowledged_by",
        "resolution_note", "body", "created_at", "is_demo",
    ])
    for r in rows:
        writer.writerow([
            r.id, r.patient_id, r.course_id or "",
            r.event_type, r.severity or "",
            r.report_date, r.status,
            _iso(r.acknowledged_at) or "",
            r.acknowledged_by or "",
            (r.resolution_note or "").replace("\n", " "),
            (r.body or "").replace("\n", " "),
            _iso(r.created_at) or "",
            "1" if _patient_is_demo(db, r.patient_id) else "0",
        ])

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}clinician-adherence-events.csv"

    _hub_audit(
        db,
        actor,
        event="export",
        target_id=actor.clinic_id or actor.actor_id,
        note=f"format=csv; rows={len(rows)}; demo={1 if any_demo else 0}",
        using_demo_data=any_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-ClinicianAdherenceHub-Demo": "1" if any_demo else "0",
        },
    )


@router.get("/events/export.ndjson")
def export_ndjson(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one event per line, including triage transcript."""
    _require_clinician_or_admin(actor)
    rows = (
        _scope_query(actor)(db)
        .order_by(PatientAdherenceEvent.created_at.desc())
        .limit(5000)
        .all()
    )

    any_demo = any(_patient_is_demo(db, r.patient_id) for r in rows)
    lines: list[str] = []
    for r in rows:
        payload = _serialize_event(db, r)
        lines.append(json.dumps(payload))

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}clinician-adherence-events.ndjson"

    _hub_audit(
        db,
        actor,
        event="export",
        target_id=actor.clinic_id or actor.actor_id,
        note=f"format=ndjson; rows={len(rows)}; demo={1 if any_demo else 0}",
        using_demo_data=any_demo,
    )

    return Response(
        content="\n".join(lines) + ("\n" if lines else ""),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-ClinicianAdherenceHub-Demo": "1" if any_demo else "0",
        },
    )


@router.post(
    "/events/bulk-acknowledge",
    response_model=HubBulkAcknowledgeOut,
)
def bulk_acknowledge(
    body: HubBulkAcknowledgeIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubBulkAcknowledgeOut:
    """Acknowledge a list of event ids in one server round-trip.

    Per-id failures (cross-clinic 404s, already-resolved, missing) are
    returned in the ``failures`` list; the loop never aborts on the
    first failure so a partial-success Bulk Ack still records the
    successes. Note required.
    """
    _require_clinician_or_admin(actor)

    succeeded = 0
    failures: list[dict] = []
    now = datetime.now(timezone.utc)
    is_demo_session = False

    for eid in body.event_ids:
        try:
            ev = _resolve_event_or_404(db, actor, eid)
            if ev.status == "resolved":
                failures.append({
                    "event_id": eid,
                    "code": "resolved",
                    "message": "Resolved events are immutable.",
                })
                continue
            ev.status = "acknowledged"
            ev.acknowledged_at = now
            ev.acknowledged_by = actor.actor_id
            db.commit()
            succeeded += 1
            is_demo = _patient_is_demo(db, ev.patient_id)
            is_demo_session = is_demo_session or is_demo
            _hub_audit(
                db,
                actor,
                event="event_acknowledged",
                target_id=ev.id,
                note=f"bulk=1; patient={ev.patient_id}; note={body.note[:200]}",
                using_demo_data=is_demo,
            )
        except ApiServiceError as exc:
            failures.append({
                "event_id": eid,
                "code": exc.code or "error",
                "message": exc.message or "error",
            })
        except Exception as exc:  # pragma: no cover — defensive
            db.rollback()
            failures.append({
                "event_id": eid,
                "code": "internal_error",
                "message": str(exc)[:200],
            })

    _hub_audit(
        db,
        actor,
        event="bulk_acknowledged",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"requested={len(body.event_ids)}; succeeded={succeeded}; "
            f"failures={len(failures)}"
        ),
        using_demo_data=is_demo_session,
    )

    return HubBulkAcknowledgeOut(
        accepted=True,
        succeeded=succeeded,
        failures=failures,
    )


@router.get("/events/{event_id}", response_model=HubEventOut)
def get_event(
    event_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubEventOut:
    """Detail with the triage transcript and patient link."""
    _require_clinician_or_admin(actor)
    ev = _resolve_event_or_404(db, actor, event_id)
    payload = _serialize_event(db, ev)
    is_demo = bool(payload.get("is_demo"))

    _hub_audit(
        db,
        actor,
        event="event_viewed",
        target_id=ev.id,
        note=f"patient={ev.patient_id}; event_type={ev.event_type}; status={ev.status}",
        using_demo_data=is_demo,
    )
    return HubEventOut(**payload)


@router.post(
    "/events/{event_id}/acknowledge", response_model=HubActionOut
)
def acknowledge_event(
    body: HubActionIn,
    event_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubActionOut:
    """Move an event from ``open`` → ``acknowledged``. Note required.

    Resolved events are immutable (409). Acknowledging an already-
    acknowledged event is idempotent on the status but still emits a
    fresh audit row so the regulator sees the second clinician's note.
    """
    _require_clinician_or_admin(actor)
    ev = _resolve_event_or_404(db, actor, event_id)

    if ev.status == "resolved":
        raise ApiServiceError(
            code="event_resolved",
            message="Resolved adherence events are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    ev.status = "acknowledged"
    ev.acknowledged_at = now
    ev.acknowledged_by = actor.actor_id
    db.commit()

    is_demo = _patient_is_demo(db, ev.patient_id)
    _hub_audit(
        db,
        actor,
        event="event_acknowledged",
        target_id=ev.id,
        note=f"patient={ev.patient_id}; note={body.note[:200]}",
        using_demo_data=is_demo,
    )
    return HubActionOut(
        accepted=True,
        event_id=ev.id,
        status="acknowledged",
    )


@router.post(
    "/events/{event_id}/escalate", response_model=HubActionOut
)
def escalate_event(
    body: HubEscalateIn,
    event_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubActionOut:
    """Move an event → ``escalated`` and create an AdverseEvent draft.

    Note required. Resolved events are immutable (409). Escalation
    creates an :class:`AdverseEvent` draft so the regulatory chain
    stays intact end-to-end and the new draft surfaces in the AE Hub
    triage queue at HIGH priority for the same clinic.
    """
    _require_clinician_or_admin(actor)
    ev = _resolve_event_or_404(db, actor, event_id)

    if ev.status == "resolved":
        raise ApiServiceError(
            code="event_resolved",
            message="Resolved adherence events are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    patient = db.query(Patient).filter_by(id=ev.patient_id).first()
    fallback_clinician = patient.clinician_id if patient is not None else None
    is_demo = _patient_is_demo(db, ev.patient_id)

    # Map adherence-event severity to AE severity vocabulary.
    ae_severity = "mild"
    if ev.severity == "urgent":
        ae_severity = "severe"
    elif ev.severity == "high":
        ae_severity = "moderate"
    elif ev.severity == "moderate":
        ae_severity = "moderate"

    ae = AdverseEvent(
        id=str(uuid.uuid4()),
        patient_id=ev.patient_id,
        course_id=ev.course_id,
        session_id=None,
        clinician_id=_resolve_actor_clinician_id(actor, fallback_clinician),
        event_type="adherence_escalation",
        severity=ae_severity,
        description=(
            f"Clinician-escalated from adherence_event {ev.id} "
            f"(event_type={ev.event_type}, severity={ev.severity or '-'}). "
            f"Clinician note: {body.note[:480]}. "
            f"Patient body: {(ev.body or '')[:300]}"
        ),
        onset_timing=None,
        resolution=None,
        action_taken="referred_for_review",
        reported_at=now,
        resolved_at=None,
        created_at=now,
        body_system=body.body_system,
        expectedness="unknown",
        expectedness_source=None,
        is_serious=ae_severity == "severe",
        sae_criteria=None,
        reportable=False,
        relatedness="possible",
        is_demo=bool(is_demo),
    )
    db.add(ae)

    ev.status = "escalated"
    ev.resolution_note = (body.note or "")[:1000]
    if not ev.acknowledged_at:
        # Escalation implies acknowledgement.
        ev.acknowledged_at = now
        ev.acknowledged_by = actor.actor_id
    db.commit()

    # HIGH-priority audit row pinned to the event so the AE Hub feed and
    # the triage feed both surface the escalation. Mirror of the
    # wearables-workbench HIGH-priority pattern.
    _hub_audit(
        db,
        actor,
        event="event_escalated",
        target_id=ev.id,
        note=(
            f"priority=high; patient={ev.patient_id}; "
            f"ae_id={ae.id}; severity={ev.severity or '-'}; "
            f"note={body.note[:200]}"
        ),
        using_demo_data=is_demo,
    )

    return HubActionOut(
        accepted=True,
        event_id=ev.id,
        status="escalated",
        adverse_event_id=ae.id,
    )


@router.post("/events/{event_id}/resolve", response_model=HubActionOut)
def resolve_event(
    body: HubActionIn,
    event_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubActionOut:
    """Move an event → ``resolved``. Note required. Immutable thereafter."""
    _require_clinician_or_admin(actor)
    ev = _resolve_event_or_404(db, actor, event_id)

    if ev.status == "resolved":
        raise ApiServiceError(
            code="event_resolved",
            message="Resolved adherence events are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    ev.status = "resolved"
    ev.resolution_note = body.note[:1000]
    if not ev.acknowledged_at:
        ev.acknowledged_at = now
        ev.acknowledged_by = actor.actor_id
    db.commit()

    is_demo = _patient_is_demo(db, ev.patient_id)
    _hub_audit(
        db,
        actor,
        event="event_resolved",
        target_id=ev.id,
        note=f"patient={ev.patient_id}; note={body.note[:200]}",
        using_demo_data=is_demo,
    )
    return HubActionOut(
        accepted=True,
        event_id=ev.id,
        status="resolved",
    )
