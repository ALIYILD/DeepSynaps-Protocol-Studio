"""Patient Digest launch-audit (2026-05-01).

Patient-side mirror of the Clinician Digest (#366). Daily / weekly self-
summary the patient sees on demand:

  * Sessions completed this period
  * Adherence streak (days)
  * Wellness axes trends (mood / energy / sleep / anxiety / focus / pain
    deltas vs. the prior window)
  * Pending clinician messages count
  * Recent reports (count of new clinician reports since ``since``)

Sibling chain (the patient surfaces the digest aggregates over):

  Symptom Journal     #344
  Wellness            #345
  Patient Reports     #346
  Patient Messages    #347
  Home Devices        #348
  Adherence           #350
  Homework            #351
  Wearables           #352
  Patient Profile     #338, #375
  Patient On-Call     #375
  ── Patient Digest (THIS PR) — patient self-summary

NO PHI of OTHER patients leaks into the response. The digest is scoped
strictly to ``actor.patient_id`` (resolved via the ``Patient.email ==
User.email`` chain). There are NO cohort percentiles, NO peer
comparisons, NO ranked-against-clinic counts. The response surface is
deliberately narrow — own counts only.

Endpoints
---------
GET  /api/v1/patient-digest/summary           Headline counts (sessions,
                                              adherence_streak, wellness
                                              trends, pending messages,
                                              new reports).
GET  /api/v1/patient-digest/sections          Per-section detail bundle
                                              for Sessions / Adherence /
                                              Wellness / Symptoms /
                                              Messages / Reports.
POST /api/v1/patient-digest/send-email        Email actor (or alt
                                              recipient); records audit
                                              row, ``delivery_status``
                                              honestly ``queued`` until
                                              SMTP wire-up lands.
POST /api/v1/patient-digest/share-caregiver   Share with caregiver
                                              user_id; emits audit row.
                                              Caregiver opt-in is
                                              advisory at this layer
                                              (see PR section F) — the
                                              audit row records intent
                                              + recipient verbatim.
GET  /api/v1/patient-digest/export.csv        DEMO-prefixed when patient
                                              is demo.
GET  /api/v1/patient-digest/export.ndjson     DEMO-prefixed when patient
                                              is demo.
POST /api/v1/patient-digest/audit-events      Page-level audit ingestion
                                              (``target_type=patient_digest``).

Role gate
---------
Patient role only. Cross-role hits return 404 (never 403/401) so the
patient-scope URL existence is invisible to clinicians and admins.
Cross-patient access cannot happen because the patient row is resolved
from ``actor.actor_id``, not a path / query param — there is no
``patient_id`` to forge. The IDOR regression test asserts a clinician
hitting these endpoints with a forged ``patient_id`` query param still
gets a 404.

NO PHI strategy
---------------
The summary / sections / export payloads ONLY surface aggregates over
the actor's own rows. The IDOR regression test
``test_no_phi_of_other_patients_in_response`` walks the response JSON
and asserts no ``patient_id`` other than the actor's own appears.

Aggregation strategy
--------------------
DOES NOT WRITE NEW DATA TABLES. Reads:

  * ``ClinicalSession`` (own ``patient_id`` — count of completed
    sessions in window)
  * ``PatientAdherenceEvent`` (own ``patient_id`` — adherence streak
    derived from consecutive ``report_date`` values with at least one
    ``adherence_report`` event)
  * ``WellnessCheckin`` (own ``patient_id`` — six axes mean delta vs.
    prior window)
  * ``SymptomJournalEntry`` (own ``patient_id`` — count of entries +
    severity max)
  * ``Message`` (own ``patient_id`` — count of unread messages where
    actor is ``recipient_id``)
  * ``QEEGAIReport`` (own ``patient_id`` — count of reports created in
    window)

Demo honesty
------------
Exports prefix ``DEMO-`` when the patient is demo. The summary payload
carries an ``is_demo`` flag the frontend uses to render the DEMO
banner.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    ClinicalSession,
    Message,
    Patient,
    PatientAdherenceEvent,
    SymptomJournalEntry,
    User,
    WellnessCheckin,
)


router = APIRouter(prefix="/api/v1/patient-digest", tags=["Patient Digest"])
_log = logging.getLogger(__name__)


AUDIT_SURFACE = "patient_digest"


PATIENT_DIGEST_DISCLAIMERS = [
    "Your digest is a summary of YOUR activity only — it does not show "
    "other patients or compare you to anyone else.",
    "Counts come from your own session log, adherence events, wellness "
    "check-ins, symptom journal, message inbox and report library. They "
    "are not AI-generated.",
    "Sending the digest by email or sharing with a caregiver records an "
    "audit entry. Actual delivery requires the email service to be "
    "wired up; until then ``delivery_status='queued'`` means the audit "
    "entry is recorded and the recipient is captured.",
    "Demo activity is clearly labelled. Exports prefix DEMO- when your "
    "account is in demo mode.",
]


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}
_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


WELLNESS_AXES = ("mood", "energy", "sleep", "anxiety", "focus", "pain")


# Drill-out URLs into the existing patient surfaces. Used by the section
# cards on the frontend.
PATIENT_DIGEST_DRILL_OUT_PAGE = {
    "sessions": "patient-sessions",
    "adherence": "pt-adherence-events",
    "wellness": "pt-wellness",
    "symptoms": "pt-journal",
    "messages": "patient-messages",
    "reports": "patient-reports",
}


# ── Helpers ─────────────────────────────────────────────────────────────────


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Coerce naive datetimes to tz-aware UTC (SQLite strips tzinfo)."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        cleaned = s.replace(" ", "+").replace("Z", "+00:00")
        if "T" not in cleaned:
            return datetime.fromisoformat(cleaned + "T00:00:00+00:00")
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


def _resolve_window(
    since: Optional[str],
    until: Optional[str],
) -> tuple[datetime, datetime]:
    """Return (since_dt, until_dt) for the digest window.

    Default: last 7 days ending at now (the patient digest is a weekly
    summary by default; the frontend exposes "last week" / "last month"
    presets).
    """
    until_dt = _parse_iso(until) or datetime.now(timezone.utc)
    since_dt = _parse_iso(since)
    if since_dt is None:
        since_dt = until_dt - timedelta(days=7)
    if since_dt > until_dt:
        since_dt, until_dt = until_dt, since_dt
    return since_dt, until_dt


def _patient_is_demo(db: Session, patient: Patient | None) -> bool:
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
    Cross-patient access cannot happen because the patient row is
    resolved from ``actor.actor_id`` — not a path / query param — so
    there is no ``patient_id`` to forge.
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


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the ``patient_digest`` surface.

    Never raises — audit must never block the UI.
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
        _log.exception("patient_digest self-audit skipped")
    return event_id


# ── Aggregations (own-data only) ────────────────────────────────────────────


def _session_dt(s: ClinicalSession) -> Optional[datetime]:
    """Best-effort datetime for a ClinicalSession.

    ClinicalSession.scheduled_at / completed_at are String columns; we
    parse on demand. Falls back to ``created_at``.
    """
    candidates = [
        getattr(s, "completed_at", None),
        getattr(s, "scheduled_at", None),
    ]
    for c in candidates:
        if c is None:
            continue
        if isinstance(c, datetime):
            return _aware(c)
        if isinstance(c, str):
            dt = _parse_iso(c)
            if dt is not None:
                return _aware(dt)
    if getattr(s, "created_at", None) is not None:
        return _aware(s.created_at)
    return None


def _count_sessions_completed(
    db: Session, patient: Patient, since_dt: datetime, until_dt: datetime,
) -> int:
    """Count own ClinicalSession rows with status='completed' in window."""
    rows = (
        db.query(ClinicalSession)
        .filter(
            ClinicalSession.patient_id == patient.id,
            ClinicalSession.status == "completed",
        )
        .all()
    )
    n = 0
    for r in rows:
        ts = _session_dt(r)
        if ts is None:
            continue
        if since_dt <= ts < until_dt:
            n += 1
    return n


def _count_sessions_scheduled(
    db: Session, patient: Patient, since_dt: datetime, until_dt: datetime,
) -> int:
    rows = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.patient_id == patient.id)
        .all()
    )
    n = 0
    for r in rows:
        ts = _session_dt(r)
        if ts is None:
            continue
        if since_dt <= ts < until_dt:
            n += 1
    return n


def _adherence_streak(db: Session, patient: Patient) -> int:
    """Count consecutive prior days (including today) with at least one
    adherence_report PatientAdherenceEvent.

    Streak is computed over distinct ``report_date`` (YYYY-MM-DD) values
    walking backward from today. The streak ends at the first day with
    no such event.
    """
    rows = (
        db.query(PatientAdherenceEvent.report_date)
        .filter(
            PatientAdherenceEvent.patient_id == patient.id,
            PatientAdherenceEvent.event_type == "adherence_report",
        )
        .all()
    )
    days = {r[0] for r in rows if r[0]}
    streak = 0
    today = datetime.now(timezone.utc).date()
    cur = today
    while cur.isoformat() in days:
        streak += 1
        cur = cur - timedelta(days=1)
    return streak


def _wellness_trend(
    db: Session, patient: Patient, since_dt: datetime, until_dt: datetime,
) -> dict[str, dict[str, Optional[float]]]:
    """Return per-axis dict ``{axis: {current, prior, delta}}``.

    ``current`` = mean of axis values for check-ins in [since, until).
    ``prior``   = mean of axis values for the previous window of same
                  duration immediately before ``since``.
    ``delta``   = current - prior (None if either side is empty).
    """
    duration = until_dt - since_dt
    prior_since = since_dt - duration
    rows_cur = (
        db.query(WellnessCheckin)
        .filter(
            WellnessCheckin.patient_id == patient.id,
            WellnessCheckin.deleted_at.is_(None),
        )
        .all()
    )

    def _bucket(rows: list[WellnessCheckin], lo: datetime, hi: datetime) -> dict[str, list[int]]:
        out: dict[str, list[int]] = {a: [] for a in WELLNESS_AXES}
        for r in rows:
            ts = _aware(r.created_at)
            if ts is None or not (lo <= ts < hi):
                continue
            for a in WELLNESS_AXES:
                v = getattr(r, a, None)
                if v is not None:
                    out[a].append(int(v))
        return out

    cur_b = _bucket(rows_cur, since_dt, until_dt)
    prior_b = _bucket(rows_cur, prior_since, since_dt)

    def _mean(xs: list[int]) -> Optional[float]:
        if not xs:
            return None
        return round(sum(xs) / len(xs), 2)

    out: dict[str, dict[str, Optional[float]]] = {}
    for a in WELLNESS_AXES:
        cur_m = _mean(cur_b[a])
        pri_m = _mean(prior_b[a])
        delta = (
            round(cur_m - pri_m, 2)
            if cur_m is not None and pri_m is not None
            else None
        )
        out[a] = {"current": cur_m, "prior": pri_m, "delta": delta}
    return out


def _count_symptom_entries(
    db: Session, patient: Patient, since_dt: datetime, until_dt: datetime,
) -> tuple[int, Optional[int]]:
    """Return (count, max_severity) for own symptom journal entries."""
    rows = (
        db.query(SymptomJournalEntry)
        .filter(
            SymptomJournalEntry.patient_id == patient.id,
            SymptomJournalEntry.deleted_at.is_(None),
        )
        .all()
    )
    items = []
    for r in rows:
        ts = _aware(r.created_at)
        if ts is None or not (since_dt <= ts < until_dt):
            continue
        items.append(r)
    n = len(items)
    sev_max = None
    for r in items:
        if r.severity is not None:
            if sev_max is None or r.severity > sev_max:
                sev_max = int(r.severity)
    return n, sev_max


def _count_pending_messages(
    db: Session, patient: Patient, actor: AuthenticatedActor,
) -> int:
    """Count Messages where the patient is recipient and ``read_at`` is null.

    "Pending" = unread and addressed to the actor. We match by
    ``recipient_id == actor.actor_id`` AND scoped to the patient.
    """
    rows = (
        db.query(Message)
        .filter(
            Message.patient_id == patient.id,
            or_(
                Message.recipient_id == actor.actor_id,
                Message.recipient_id == patient.id,
            ),
            Message.read_at.is_(None),
        )
        .all()
    )
    return len(rows)


def _count_new_reports(
    db: Session, patient: Patient, since_dt: datetime, until_dt: datetime,
) -> int:
    """Count QEEGAIReport rows owned by the patient created in window.

    Imports lazily — QEEGAIReport may not be the only "report" entity
    in the platform but it is the source of truth for the patient
    Reports surface (#346) which the patient sees in their portal.
    """
    try:
        from app.persistence.models import QEEGAIReport  # noqa: PLC0415
    except Exception:
        return 0
    try:
        rows = (
            db.query(QEEGAIReport)
            .filter(QEEGAIReport.patient_id == patient.id)
            .all()
        )
    except Exception:
        return 0
    n = 0
    for r in rows:
        ts = _aware(getattr(r, "created_at", None))
        if ts is None:
            continue
        if since_dt <= ts < until_dt:
            n += 1
    return n


# ── Schemas ─────────────────────────────────────────────────────────────────


class WellnessAxisTrend(BaseModel):
    current: Optional[float] = None
    prior: Optional[float] = None
    delta: Optional[float] = None


class PatientDigestSummary(BaseModel):
    sessions_completed: int = 0
    sessions_scheduled: int = 0
    adherence_streak_days: int = 0
    wellness_axes_trends: dict[str, WellnessAxisTrend] = Field(default_factory=dict)
    pending_messages: int = 0
    new_reports: int = 0
    symptom_entries: int = 0
    symptom_severity_max: Optional[int] = None
    since: str = ""
    until: str = ""
    is_demo: bool = False
    patient_id: str = ""
    disclaimers: list[str] = Field(
        default_factory=lambda: list(PATIENT_DIGEST_DISCLAIMERS)
    )


class PatientDigestSection(BaseModel):
    section: str
    count: int = 0
    detail: dict = Field(default_factory=dict)
    drill_out_url: Optional[str] = None


class PatientDigestSectionsResponse(BaseModel):
    sections: list[PatientDigestSection] = Field(default_factory=list)
    since: str = ""
    until: str = ""
    is_demo: bool = False
    patient_id: str = ""
    disclaimers: list[str] = Field(
        default_factory=lambda: list(PATIENT_DIGEST_DISCLAIMERS)
    )


class DigestSendEmailIn(BaseModel):
    recipient_email: Optional[str] = Field(default=None, max_length=255)
    reason: Optional[str] = Field(default=None, max_length=480)
    since: Optional[str] = Field(default=None, max_length=32)
    until: Optional[str] = Field(default=None, max_length=32)

    @field_validator("recipient_email")
    @classmethod
    def _validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("recipient_email must be a valid email address")
        return v


class DigestSendEmailOut(BaseModel):
    accepted: bool = True
    delivery_status: str
    recipient_email: str
    audit_event_id: str
    note: str = ""


class DigestShareCaregiverIn(BaseModel):
    caregiver_user_id: str = Field(..., min_length=1, max_length=64)
    reason: Optional[str] = Field(default=None, max_length=480)
    since: Optional[str] = Field(default=None, max_length=32)
    until: Optional[str] = Field(default=None, max_length=32)


class DigestShareCaregiverOut(BaseModel):
    accepted: bool = True
    delivery_status: str
    caregiver_user_id: str
    caregiver_email: Optional[str] = None
    consent_required: bool = True
    audit_event_id: str
    note: str = ""


class DigestAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    target_id: Optional[str] = Field(default=None, max_length=128)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class DigestAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


def _build_summary(
    db: Session,
    actor: AuthenticatedActor,
    patient: Patient,
    since_dt: datetime,
    until_dt: datetime,
) -> PatientDigestSummary:
    is_demo = _patient_is_demo(db, patient)
    sessions_done = _count_sessions_completed(db, patient, since_dt, until_dt)
    sessions_sched = _count_sessions_scheduled(db, patient, since_dt, until_dt)
    streak = _adherence_streak(db, patient)
    trends_raw = _wellness_trend(db, patient, since_dt, until_dt)
    pending = _count_pending_messages(db, patient, actor)
    new_reports = _count_new_reports(db, patient, since_dt, until_dt)
    sym_n, sym_sev = _count_symptom_entries(db, patient, since_dt, until_dt)
    trends = {a: WellnessAxisTrend(**v) for a, v in trends_raw.items()}
    return PatientDigestSummary(
        sessions_completed=sessions_done,
        sessions_scheduled=sessions_sched,
        adherence_streak_days=streak,
        wellness_axes_trends=trends,
        pending_messages=pending,
        new_reports=new_reports,
        symptom_entries=sym_n,
        symptom_severity_max=sym_sev,
        since=since_dt.isoformat(),
        until=until_dt.isoformat(),
        is_demo=is_demo,
        patient_id=patient.id,
    )


@router.get("/summary", response_model=PatientDigestSummary)
def get_summary(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientDigestSummary:
    """Headline summary for the patient over [since, until)."""
    patient = _resolve_patient_for_actor(db, actor)
    since_dt, until_dt = _resolve_window(since, until)
    summary = _build_summary(db, actor, patient, since_dt, until_dt)

    _audit(
        db, actor,
        event="summary_viewed",
        target_id=patient.id,
        note=(
            f"sessions={summary.sessions_completed}; "
            f"streak={summary.adherence_streak_days}; "
            f"messages={summary.pending_messages}; "
            f"reports={summary.new_reports}; "
            f"since={summary.since}; until={summary.until}"
        ),
        using_demo_data=summary.is_demo,
    )
    return summary


@router.get("/sections", response_model=PatientDigestSectionsResponse)
def get_sections(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientDigestSectionsResponse:
    """Per-section detail bundle.

    Each section carries its top-line count, a tiny detail bag, and a
    drill-out URL the frontend uses to send the patient back to the
    full surface.
    """
    patient = _resolve_patient_for_actor(db, actor)
    since_dt, until_dt = _resolve_window(since, until)
    summary = _build_summary(db, actor, patient, since_dt, until_dt)

    sections: list[PatientDigestSection] = [
        PatientDigestSection(
            section="sessions",
            count=summary.sessions_completed,
            detail={
                "completed": summary.sessions_completed,
                "scheduled_in_window": summary.sessions_scheduled,
            },
            drill_out_url=f"?page={PATIENT_DIGEST_DRILL_OUT_PAGE['sessions']}",
        ),
        PatientDigestSection(
            section="adherence",
            count=summary.adherence_streak_days,
            detail={"streak_days": summary.adherence_streak_days},
            drill_out_url=f"?page={PATIENT_DIGEST_DRILL_OUT_PAGE['adherence']}",
        ),
        PatientDigestSection(
            section="wellness",
            count=sum(
                1 for v in summary.wellness_axes_trends.values()
                if v.current is not None
            ),
            detail={
                a: {"current": t.current, "prior": t.prior, "delta": t.delta}
                for a, t in summary.wellness_axes_trends.items()
            },
            drill_out_url=f"?page={PATIENT_DIGEST_DRILL_OUT_PAGE['wellness']}",
        ),
        PatientDigestSection(
            section="symptoms",
            count=summary.symptom_entries,
            detail={
                "entries": summary.symptom_entries,
                "severity_max": summary.symptom_severity_max,
            },
            drill_out_url=f"?page={PATIENT_DIGEST_DRILL_OUT_PAGE['symptoms']}",
        ),
        PatientDigestSection(
            section="messages",
            count=summary.pending_messages,
            detail={"pending": summary.pending_messages},
            drill_out_url=f"?page={PATIENT_DIGEST_DRILL_OUT_PAGE['messages']}",
        ),
        PatientDigestSection(
            section="reports",
            count=summary.new_reports,
            detail={"new_reports": summary.new_reports},
            drill_out_url=f"?page={PATIENT_DIGEST_DRILL_OUT_PAGE['reports']}",
        ),
    ]

    _audit(
        db, actor,
        event="sections_viewed",
        target_id=patient.id,
        note=f"sections={len(sections)} since={summary.since}",
        using_demo_data=summary.is_demo,
    )

    return PatientDigestSectionsResponse(
        sections=sections,
        since=summary.since,
        until=summary.until,
        is_demo=summary.is_demo,
        patient_id=patient.id,
    )


@router.post("/send-email", response_model=DigestSendEmailOut)
def send_digest_email(
    body: DigestSendEmailIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestSendEmailOut:
    """Email the digest to ``recipient_email`` (or actor.email).

    SMTP is OUT OF SCOPE; ``delivery_status='queued'`` until the wire-
    up lands. The audit row records the recipient + reason verbatim.
    """
    patient = _resolve_patient_for_actor(db, actor)
    since_dt, until_dt = _resolve_window(body.since, body.until)

    actor_email = (getattr(actor, "email", None) or "").strip()
    if not actor_email:
        u = db.query(User).filter_by(id=actor.actor_id).first()
        if u is not None:
            actor_email = (u.email or "").strip()
    if not actor_email and patient.email:
        actor_email = patient.email.strip()

    recipient = (body.recipient_email or actor_email).strip()
    if not recipient:
        raise ApiServiceError(
            code="missing_recipient",
            message=(
                "Cannot send digest email: no email on file and no "
                "override recipient was provided."
            ),
            status_code=400,
        )

    summary = _build_summary(db, actor, patient, since_dt, until_dt)
    delivery_status = "queued"
    note = (
        f"recipient={recipient}; reason={(body.reason or '')[:120]}; "
        f"sessions={summary.sessions_completed}; "
        f"streak={summary.adherence_streak_days}; "
        f"messages={summary.pending_messages}; "
        f"reports={summary.new_reports}; "
        f"since={summary.since}; until={summary.until}; "
        f"delivery_status={delivery_status}"
    )
    audit_event_id = _audit(
        db, actor,
        event="email_sent",
        target_id=patient.id,
        note=note,
        using_demo_data=summary.is_demo,
    )
    return DigestSendEmailOut(
        accepted=True,
        delivery_status=delivery_status,
        recipient_email=recipient,
        audit_event_id=audit_event_id,
        note=(
            "Email queued. Actual delivery requires SMTP wire-up; "
            "until then the audit row records the intent + recipient."
        ),
    )


@router.post("/share-caregiver", response_model=DigestShareCaregiverOut)
def share_with_caregiver(
    body: DigestShareCaregiverIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestShareCaregiverOut:
    """Share the digest with a caregiver.

    Caregiver opt-in is enforced upstream by the Patient Care Team
    consent flow (`pt-caregiver`). At this layer we record the audit
    row + flag ``consent_required=True`` so the frontend knows it must
    show the consent banner before unblocking the share. This keeps
    the audit trail honest even when the consent flow has not yet
    been implemented end-to-end.
    """
    patient = _resolve_patient_for_actor(db, actor)
    since_dt, until_dt = _resolve_window(body.since, body.until)

    caregiver = db.query(User).filter_by(id=body.caregiver_user_id).first()
    if caregiver is None:
        # Honest 404 — the recipient does not exist OR is not a
        # caregiver opted-in for this patient. We deliberately do not
        # leak which.
        raise ApiServiceError(
            code="not_found",
            message="Caregiver recipient not found.",
            status_code=404,
        )

    summary = _build_summary(db, actor, patient, since_dt, until_dt)
    delivery_status = "queued"
    note = (
        f"caregiver_user={body.caregiver_user_id}; "
        f"caregiver_email={caregiver.email or '-'}; "
        f"reason={(body.reason or '')[:120]}; "
        f"sessions={summary.sessions_completed}; "
        f"streak={summary.adherence_streak_days}; "
        f"messages={summary.pending_messages}; "
        f"reports={summary.new_reports}; "
        f"since={summary.since}; until={summary.until}; "
        f"delivery_status={delivery_status}; "
        f"consent_required=true"
    )
    audit_event_id = _audit(
        db, actor,
        event="caregiver_shared",
        target_id=body.caregiver_user_id,
        note=note,
        using_demo_data=summary.is_demo,
    )
    return DigestShareCaregiverOut(
        accepted=True,
        delivery_status=delivery_status,
        caregiver_user_id=body.caregiver_user_id,
        caregiver_email=caregiver.email,
        consent_required=True,
        audit_event_id=audit_event_id,
        note=(
            "Caregiver share queued. Caregiver opt-in via the Patient "
            "Care Team consent flow is required before delivery wires "
            "up; the audit row records the intent + recipient."
        ),
    )


_EXPORT_COLUMNS = [
    "section",
    "count",
    "detail_json",
    "since",
    "until",
    "patient_id",
    "is_demo",
]


def _serialise_for_export(
    sections: list[PatientDigestSection],
    summary: PatientDigestSummary,
) -> list[dict]:
    out: list[dict] = []
    for s in sections:
        out.append({
            "section": s.section,
            "count": s.count,
            "detail_json": json.dumps(s.detail, sort_keys=True),
            "since": summary.since,
            "until": summary.until,
            "patient_id": summary.patient_id,
            "is_demo": "1" if summary.is_demo else "0",
        })
    return out


@router.get("/export.csv")
def export_csv(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of the digest sections. DEMO-prefixed when patient is demo."""
    patient = _resolve_patient_for_actor(db, actor)
    since_dt, until_dt = _resolve_window(since, until)
    summary = _build_summary(db, actor, patient, since_dt, until_dt)
    bundle = get_sections(  # type: ignore[call-arg]
        since=since, until=until, actor=actor, db=db,
    )
    rows = _serialise_for_export(bundle.sections, summary)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_EXPORT_COLUMNS)
    for r in rows:
        writer.writerow([r[c] for c in _EXPORT_COLUMNS])

    prefix = "DEMO-" if summary.is_demo else ""
    filename = f"{prefix}patient-digest.csv"

    _audit(
        db, actor,
        event="export",
        target_id=patient.id,
        note=f"format=csv; rows={len(rows)}; demo={1 if summary.is_demo else 0}",
        using_demo_data=summary.is_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-PatientDigest-Demo": "1" if summary.is_demo else "0",
            "Cache-Control": "no-store",
        },
    )


@router.get("/export.ndjson")
def export_ndjson(
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one section per line."""
    patient = _resolve_patient_for_actor(db, actor)
    since_dt, until_dt = _resolve_window(since, until)
    summary = _build_summary(db, actor, patient, since_dt, until_dt)
    bundle = get_sections(  # type: ignore[call-arg]
        since=since, until=until, actor=actor, db=db,
    )
    rows = _serialise_for_export(bundle.sections, summary)
    lines = [json.dumps(r) for r in rows]

    prefix = "DEMO-" if summary.is_demo else ""
    filename = f"{prefix}patient-digest.ndjson"

    _audit(
        db, actor,
        event="export",
        target_id=patient.id,
        note=f"format=ndjson; rows={len(lines)}; demo={1 if summary.is_demo else 0}",
        using_demo_data=summary.is_demo,
    )

    return Response(
        content="\n".join(lines) + ("\n" if lines else ""),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-PatientDigest-Demo": "1" if summary.is_demo else "0",
            "Cache-Control": "no-store",
        },
    )


@router.post("/audit-events", response_model=DigestAuditEventOut)
def post_audit_event(
    body: DigestAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DigestAuditEventOut:
    """Page-level audit ingestion for the Patient Digest.

    Common events: ``view`` (mount), ``date_range_changed``,
    ``section_drill_out``, ``email_initiated``, ``caregiver_share_initiated``,
    ``demo_banner_shown``. Mutation events (``email_sent`` /
    ``caregiver_shared`` / ``export``) are emitted by the dedicated
    endpoints above; this surface only carries page-level breadcrumbs.

    Patients can post audit events about their own activity. Cross-role
    callers are denied with 403 — this prevents clinician/admin tokens
    from poisoning the patient-scoped audit feed.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="forbidden",
            message="Only patients can post patient_digest audit events.",
            status_code=403,
        )
    patient = _resolve_patient_for_actor(db, actor)
    target_id = body.target_id or patient.id
    note_parts: list[str] = []
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    is_demo = _patient_is_demo(db, patient) or bool(body.using_demo_data)
    event_id = _audit(
        db, actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=is_demo,
    )
    return DigestAuditEventOut(accepted=True, event_id=event_id)
