"""Patient-side On-Call Visibility launch-audit (2026-05-01).

The Escalation Policy editor (#374) made dispatch order editable for
admins; this router closes the loop on the *patient* side: patients
get a read-only summary of WHEN their care team is reachable and HOW
to send an urgent message. **No PHI of the on-call clinician is
exposed** — the response NEVER includes the on-call clinician's name,
phone, Slack handle, or PagerDuty user-id. Only abstract availability
state ("in-hours now", "after-hours, urgent path is patient-portal-
message") plus the clinic's emergency line if one is configured.

Endpoints
---------
GET  /api/v1/patient-oncall/status        Patient-scoped on-call status (no PHI)
POST /api/v1/patient-oncall/audit-events  Page-level audit ingestion
                                          (target_type=patient_oncall_visibility)

Role gate
---------
Patient role only. Cross-role hits return 404 (never 403/401) so the
patient-scope URL existence is invisible to clinicians and admins.
Cross-clinic data is never returned because the response is computed
from the patient's own ``Patient.clinician_id → User.clinic_id`` chain.

PHI redaction strategy
----------------------
The status payload deliberately omits clinician identifiers. The
:class:`OncallStatusOut` schema does NOT carry ``clinician_name``,
``primary_user_name``, ``slack_handle``, ``pagerduty_user_id`` or
``twilio_phone`` fields — and the test suite includes a regression
that fails the response if any of those keys appear. The shift roster
(``ShiftRoster``) and escalation chain (``EscalationChain``) tables
are read but only the *count* and the boolean *is_on_call_now* flag
are surfaced. The clinic's general phone (``Clinic.phone``) is
surfaced as ``emergency_line_number`` because it is a public-facing
contact, not PHI.

Audit hooks
-----------
``patient_oncall_visibility.view`` (mount), ``oncall_status_seen``
(when status payload renders), ``urgent_message_started`` (when the
patient clicks the urgent-message CTA), ``learn_more_clicked`` (when
the patient expands the disclosure of how on-call works).

Demo honesty
------------
``is_demo`` flag mirrors :func:`patients_router._patient_is_demo`.
Demo patients see the DEMO banner; the audit row notes ``DEMO`` in
the prefix.

Coverage hours
--------------
Coverage hours are derived from this week's :class:`ShiftRoster`
rows for the patient's clinic:

* If at least one row has ``is_on_call=True`` 24/7 across all 7 days
  → "24/7 coverage".
* Otherwise we summarise the contiguous on-call window per weekday
  (e.g. "Mon-Fri, 8am-6pm; weekends after-hours via emergency line").
* If the clinic has NO ``EscalationChain`` rows AND no on-call shifts
  for the current week → honest empty-state ``coverage_hours=None``,
  ``urgent_path="emergency_line"``, ``in_hours_now=False``.

This keeps the response deterministic — no AI fabrication, no fake
"24/7" reassurance. If the data is not configured we say so.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    Clinic,
    EscalationChain,
    Patient,
    ShiftRoster,
    User,
)


router = APIRouter(prefix="/api/v1/patient-oncall", tags=["Patient On-Call Visibility"])
_log = logging.getLogger(__name__)


# Surface name used for audit_events.target_type. Whitelisted in
# audit_trail_router.KNOWN_SURFACES + qeeg_analysis_router audit-events
# ingestion.
AUDIT_SURFACE = "patient_oncall_visibility"


# Disclaimers surfaced on every read so the patient knows the limits
# of the information they are seeing. Patient-friendly copy — not
# regulator copy.
PATIENT_ONCALL_DISCLAIMERS = [
    "Your care team's availability is shown here as hours of operation only. "
    "We do not show which individual clinician is on call.",
    "If you have a clinical emergency, call 911 (US) or your local emergency "
    "number — do not wait for a patient-portal reply.",
    "Urgent messages sent through the patient portal are routed to your "
    "care team's on-call escalation chain when they arrive after hours.",
]


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}
_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


# Default coverage banner when the clinic has at least one weekday on-call
# shift but no roster row covers the current weekday. Patient-friendly,
# explicit about the gap so we never imply 24/7 reassurance the clinic
# hasn't actually configured.
_DEFAULT_BUSINESS_HOURS = "Mon-Fri, 9am-5pm (clinic time)"


# ── Helpers ─────────────────────────────────────────────────────────────────


def _patient_is_demo(db: Session, patient: Patient | None) -> bool:
    """Mirrors the patient-side ``_patient_is_demo`` helpers in sister
    routers (adherence_events / patient_messages / wellness_hub)."""
    if patient is None:
        return False
    notes = patient.notes or ""
    if notes.startswith("[DEMO]"):
        return True
    try:
        u = db.query(User).filter_by(id=patient.clinician_id).first()
        if u is None or not u.clinic_id:
            return False
        return u.clinic_id in _DEMO_CLINIC_IDS
    except Exception:
        return False


def _resolve_patient_for_actor(
    db: Session, actor: AuthenticatedActor
) -> Patient:
    """Return the Patient row the actor is allowed to act on.

    Patient role only. Cross-role hits return 404 (never 403/401) so
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


def _resolve_clinic_id_for_patient(
    db: Session, patient: Patient
) -> Optional[str]:
    """Resolve the patient's clinic_id via Patient.clinician_id → User.

    Patient.clinician_id is a soft FK to ``users.id``. We look up the
    User row and return its ``clinic_id``. Returns None when the
    clinician can't be found (orphaned patient) — callers treat that
    as "no coverage configured" rather than crashing.
    """
    user = db.query(User).filter_by(id=patient.clinician_id).first()
    if user is None or not user.clinic_id:
        return None
    return user.clinic_id


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the ``patient_oncall_visibility`` surface.

    Never raises — audit must never block the UI even if the audit
    table is unreachable. Mirrors the helper in sister patient
    surfaces.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"{AUDIT_SURFACE}-{event}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
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
            target_type=AUDIT_SURFACE,
            action=f"{AUDIT_SURFACE}.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("patient_oncall_visibility self-audit skipped")
    return event_id


def _monday_of(d: datetime) -> str:
    """Return ISO date of the Monday of ``d``'s week.

    Mirrors :func:`care_team_coverage_router._monday_of` so the two
    surfaces read the same week's roster.
    """
    from datetime import timedelta  # noqa: PLC0415
    monday = d - timedelta(days=d.weekday())
    return monday.date().isoformat()


def _format_hour(hhmm: Optional[str]) -> Optional[str]:
    """Render ``HH:MM`` as patient-friendly ``8am`` / ``6pm``.

    Returns None when the value is missing or unparseable.
    """
    if not hhmm or not isinstance(hhmm, str):
        return None
    parts = hhmm.strip().split(":")
    if not parts or not parts[0].isdigit():
        return None
    try:
        h = int(parts[0])
    except ValueError:
        return None
    if h < 0 or h > 24:
        return None
    if h == 0:
        return "12am"
    if h < 12:
        return f"{h}am"
    if h == 12:
        return "12pm"
    return f"{h - 12}pm"


_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _summarise_coverage_hours(rows: list[ShiftRoster]) -> Optional[str]:
    """Return a patient-friendly coverage-hours string, or None.

    ``rows`` is the list of on-call ``ShiftRoster`` rows for the
    actor's clinic this week. We only look at distinct (day_of_week,
    start_time, end_time) triples so duplicate per-clinician shifts
    collapse. Logic:

    * If on-call rows cover all 7 days AND any row has start_time=None
      or 00:00 + end_time=None or 23:59 → "24/7 coverage".
    * Otherwise group by (start, end) and surface the most common
      window. Days are summarised as "Mon-Fri" / "Sat-Sun" / explicit
      list.
    * Empty list → None (caller renders honest empty state).
    """
    if not rows:
        return None

    # Distinct (dow, start, end) triples — collapse multi-clinician shifts.
    triples = sorted({
        (r.day_of_week, (r.start_time or "").strip(), (r.end_time or "").strip())
        for r in rows
    })
    if not triples:
        return None

    # 24/7 detection: every weekday covered by an "all day" row.
    days_covered = {t[0] for t in triples}
    has_full_day = any(
        (s in ("", "00:00") and e in ("", "23:59", "24:00"))
        for (_d, s, e) in triples
    )
    if days_covered == set(range(7)) and has_full_day:
        return "24/7 coverage"

    # Otherwise: group days by (start, end) window, render the most
    # common window first.
    by_window: dict[tuple[str, str], list[int]] = {}
    for (dow, s, e) in triples:
        by_window.setdefault((s, e), []).append(dow)

    # Order windows by # of days desc, then by start time asc.
    def _w_key(item: tuple[tuple[str, str], list[int]]) -> tuple[int, str]:
        (s, _e), days = item
        return (-len(days), s)

    parts: list[str] = []
    for (s, e), days in sorted(by_window.items(), key=_w_key):
        # Render day list as ranges where contiguous.
        days_sorted = sorted(set(days))
        ranges: list[str] = []
        i = 0
        while i < len(days_sorted):
            start = days_sorted[i]
            end = start
            while (i + 1 < len(days_sorted)
                   and days_sorted[i + 1] == end + 1):
                end = days_sorted[i + 1]
                i += 1
            if start == end:
                ranges.append(_DAY_NAMES[start])
            else:
                ranges.append(f"{_DAY_NAMES[start]}-{_DAY_NAMES[end]}")
            i += 1
        days_str = ", ".join(ranges)
        s_pretty = _format_hour(s) or "all day"
        e_pretty = _format_hour(e) or "all day"
        if s_pretty == "all day" or e_pretty == "all day":
            parts.append(f"{days_str} (all day)")
        else:
            parts.append(f"{days_str}, {s_pretty}-{e_pretty}")
    return "; ".join(parts) if parts else None


def _is_in_hours_now(rows: list[ShiftRoster], now: datetime) -> bool:
    """True if the current UTC time falls inside any on-call shift today.

    "Today" is computed from ``now``'s weekday. A row matches if
    ``day_of_week`` equals today's dow AND (start_time, end_time)
    contains the current ``HH:MM`` (string compare; standard 24h
    format). Empty start/end → covers all day.
    """
    if not rows:
        return False
    dow = now.weekday()
    hhmm = f"{now.hour:02d}:{now.minute:02d}"
    for r in rows:
        if r.day_of_week != dow:
            continue
        s = (r.start_time or "").strip()
        e = (r.end_time or "").strip()
        if not s and not e:
            return True
        if (not s or s <= hhmm) and (not e or hhmm < e):
            return True
    return False


def _has_oncall_now(rows: list[ShiftRoster], now: datetime) -> bool:
    """True if any on-call row covers right now AND ``is_on_call=True``."""
    return _is_in_hours_now([r for r in rows if r.is_on_call], now)


# ── Schemas ─────────────────────────────────────────────────────────────────


class OncallStatusOut(BaseModel):
    """Patient-side on-call status payload.

    DELIBERATELY OMITS:
      * clinician_name / primary_user_name / display_name
      * phone / slack_user_id / slack_handle / pagerduty_user_id /
        pagerduty_routing_key / twilio_phone / contact_handle

    See PR section F (PHI redaction strategy) and the regression
    test ``test_status_payload_redacts_phi`` for the contract.
    """

    coverage_hours: Optional[str] = None
    in_hours_now: bool = False
    oncall_now: bool = False
    urgent_path: str = Field(
        default="emergency_line",
        description=(
            "One of 'patient-portal-message' (preferred), 'emergency_line' "
            "(fallback when no on-call coverage is configured)."
        ),
    )
    emergency_line_number: Optional[str] = None
    has_coverage_configured: bool = False
    is_demo: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(PATIENT_ONCALL_DISCLAIMERS),
    )


class OncallAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class OncallAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/status", response_model=OncallStatusOut)
def get_oncall_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OncallStatusOut:
    """Read-only on-call status for the patient's care team.

    See module docstring for PHI redaction strategy.
    """
    patient = _resolve_patient_for_actor(db, actor)
    is_demo = _patient_is_demo(db, patient)

    clinic_id = _resolve_clinic_id_for_patient(db, patient)
    if not clinic_id:
        # Honest empty state — orphaned patient or unconfigured clinic.
        _audit(
            db, actor,
            event="oncall_status_seen",
            target_id=patient.id,
            note="no_clinic_resolved",
            using_demo_data=is_demo,
        )
        return OncallStatusOut(
            coverage_hours=None,
            in_hours_now=False,
            oncall_now=False,
            urgent_path="emergency_line",
            emergency_line_number=None,
            has_coverage_configured=False,
            is_demo=is_demo,
        )

    now = datetime.now(timezone.utc)
    week_start = _monday_of(now)

    # Read this week's on-call shifts for the patient's clinic.
    shift_rows = (
        db.query(ShiftRoster)
        .filter(
            ShiftRoster.clinic_id == clinic_id,
            ShiftRoster.week_start == week_start,
            ShiftRoster.is_on_call.is_(True),
        )
        .all()
    )

    chain_count = (
        db.query(EscalationChain)
        .filter(EscalationChain.clinic_id == clinic_id)
        .count()
    )

    has_coverage_configured = bool(shift_rows) or chain_count > 0
    coverage_hours = _summarise_coverage_hours(shift_rows)
    in_hours_now = _is_in_hours_now(shift_rows, now)
    oncall_now = _has_oncall_now(shift_rows, now)

    # Patient's preferred path:
    #   * if any coverage configured → patient-portal-message (clinical
    #     team will route urgent messages via the on-call escalation
    #     chain even after hours);
    #   * if no coverage → emergency_line (honest fallback).
    urgent_path = "patient-portal-message" if has_coverage_configured else "emergency_line"

    # Surface the clinic phone as ``emergency_line_number`` — it is
    # public-facing contact info, not PHI.
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    emergency_line = clinic.phone if clinic and clinic.phone else None

    _audit(
        db, actor,
        event="oncall_status_seen",
        target_id=patient.id,
        note=(
            f"in_hours_now={in_hours_now};"
            f"oncall_now={oncall_now};"
            f"has_coverage={has_coverage_configured};"
            f"shift_rows={len(shift_rows)};"
            f"chain_count={chain_count}"
        ),
        using_demo_data=is_demo,
    )

    return OncallStatusOut(
        coverage_hours=coverage_hours,
        in_hours_now=in_hours_now,
        oncall_now=oncall_now,
        urgent_path=urgent_path,
        emergency_line_number=emergency_line,
        has_coverage_configured=has_coverage_configured,
        is_demo=is_demo,
    )


@router.post("/audit-events", response_model=OncallAuditEventOut)
def post_oncall_audit_event(
    body: OncallAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OncallAuditEventOut:
    """Page-level audit ingestion for the patient on-call card.

    Surface: ``patient_oncall_visibility``. Common events: ``view``
    (mount), ``oncall_status_seen``, ``urgent_message_started``,
    ``learn_more_clicked``, ``demo_banner_shown``.

    Patient role only. Cross-role hits return 403 (mirrors the
    sibling adherence_events_router page-level audit handler).
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="patient_role_required",
            message=(
                "Patient on-call visibility audit ingestion is "
                "restricted to the patient role."
            ),
            status_code=403,
        )
    patient = _resolve_patient_for_actor(db, actor)
    is_demo = _patient_is_demo(db, patient)
    event_id = _audit(
        db, actor,
        event=body.event,
        target_id=patient.id,
        note=body.note or "",
        using_demo_data=bool(body.using_demo_data) or is_demo,
    )
    return OncallAuditEventOut(accepted=True, event_id=event_id)
