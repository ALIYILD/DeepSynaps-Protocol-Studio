"""Clinician Wellness Hub launch-audit (2026-05-01).

Bidirectional counterpart to the patient-facing Wellness Hub surface
landed in #345. The patient-side router gives patients an audited
``log → share → soft-delete`` chain on their own row; this surface
gives clinicians a CROSS-PATIENT triage queue scoped to the clinic so a
clinician can clear today's wellness backlog in bulk rather than
opening one Inbox detail at a time.

Closes the regulator chain on early disengagement detection:

    patient logs wellness check-in (#345) →
      clinician triages cross-patient (THIS PAGE) →
        SLA breach via Care Team Coverage (#357) →
          on-call paging.

Endpoints
---------
GET    /api/v1/clinician-wellness/checkins                List clinic-scoped check-ins (filters)
GET    /api/v1/clinician-wellness/checkins/summary        Top counts (today / 7d / axes-trending-down / low-mood-top / missed-streak top-5 / response-rate)
GET    /api/v1/clinician-wellness/checkins/{id}           Detail (404 if not actor's clinic)
POST   /api/v1/clinician-wellness/checkins/{id}/acknowledge   Note required; flips clinician_status open → acknowledged
POST   /api/v1/clinician-wellness/checkins/{id}/escalate      Note required; creates AdverseEvent draft + HIGH-priority audit
POST   /api/v1/clinician-wellness/checkins/{id}/resolve       Note required; immutable thereafter (409 on subsequent action)
POST   /api/v1/clinician-wellness/checkins/bulk-acknowledge   Note + list of checkin_ids; partial failures reported
GET    /api/v1/clinician-wellness/checkins/export.csv     DEMO-prefixed when any row's patient demo
GET    /api/v1/clinician-wellness/checkins/export.ndjson  DEMO-prefixed when any row's patient demo
POST   /api/v1/clinician-wellness/audit-events            Page audit (target_type=clinician_wellness_hub)

Role gate
---------
clinician / admin / supervisor / reviewer / regulator. Patients hit 403.

Cross-clinic
------------
Non-admin clinicians see only check-ins whose owning patient's clinician
shares ``actor.clinic_id``. Cross-clinic detail / mutation hits 404.
Admins (and supervisors / regulators) see all clinics — same pattern as
the existing Clinician Adherence Hub (#361).

Workflow
--------
``open`` → ``acknowledged`` (optional) → ``escalated`` (optional) →
``resolved``. Resolution is a hard immutability gate on
``clinician_status``: any subsequent state change attempt returns 409 so
the audit transcript stays clean. The patient-side ``deleted_at`` flag
is independent of clinician_status — a soft-deleted row can still be
triaged for regulatory review.

Escalation
----------
Creates an :class:`AdverseEvent` in ``status='reported'`` keyed to the
check-in's patient. Mirrors the Clinician Adherence Hub escalation
pattern (#361) and the Wearables Workbench escalation pattern (#353)
so the regulatory chain stays intact end-to-end across surfaces.
Escalation is the recommended action when severity ≥ 7 on
anxiety/pain or mood ≤ 3 — the router does not auto-escalate, the
clinician decides — but the trigger predicate is documented so the
frontend can highlight escalation candidates honestly.

Demo honesty
------------
If any check-in's owning patient is a demo patient, exports prefix
``DEMO-`` to the filename and set ``X-ClinicianWellnessHub-Demo: 1``.
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
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AdverseEvent,
    Patient,
    User,
    WellnessCheckin,
)


router = APIRouter(
    prefix="/api/v1/clinician-wellness",
    tags=["Clinician Wellness Hub"],
)
_log = logging.getLogger(__name__)


# Honest disclaimers always rendered on the page so reviewers know the
# regulatory weight of the surface.
HUB_DISCLAIMERS = [
    "Wellness check-ins here come directly from patient-side reports "
    "logged via the Patient Wellness Hub (#345). Counts are real "
    "audit-table aggregates, not AI-fabricated cohort scoring.",
    "Acknowledge → Escalate → Resolve is the canonical triage flow. "
    "Resolved check-ins are immutable and surface in the regulator audit trail.",
    "Escalation candidates: severity >= 7 on anxiety or pain, OR mood <= 3. "
    "The router does not auto-escalate; clinician sign-off is required.",
    "Escalating a check-in creates an Adverse Event Hub draft visible "
    "to all clinicians at this clinic. Use the AE Hub to complete "
    "classification, review, and (where reportable) regulator submission.",
    "Demo check-ins are clearly labelled and exports are DEMO-prefixed. "
    "They are not regulator-submittable.",
]


# Six wellness axes (must match wellness_hub_router._AXES). Order matters:
# CSV column order, summary axis-block iteration, and the trending-down
# detector all rely on this.
_AXES = ("mood", "energy", "sleep", "anxiety", "focus", "pain")

# Axes where HIGH values mean BAD. (anxiety / pain.) Used to split the
# "axes trending down" detector — for these axes a 7-day rise is bad,
# for the others a 7-day drop is bad.
_AXES_HIGH_IS_BAD = ("anxiety", "pain")

HUB_STATUSES = ("open", "acknowledged", "escalated", "resolved")
_VALID_AXES = _AXES
_VALID_SEVERITY_BANDS = ("low", "moderate", "high", "urgent")
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

    Patients get a 403 (not 404) so the URL existence is acknowledged
    but the surface is denied — the inverse of the patient-side router
    which hides clinician URLs behind a 404. Mirror of the Clinician
    Adherence Hub role gate.
    """
    if actor.role not in (
        "clinician", "admin", "supervisor", "reviewer", "regulator"
    ):
        raise ApiServiceError(
            code="forbidden",
            message="Clinician access required for the Wellness Hub.",
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


def _checkin_clinic_id(db: Session, ck: WellnessCheckin) -> Optional[str]:
    """Resolve the owning clinic of the check-in via patient → clinician → user."""
    patient = db.query(Patient).filter_by(id=ck.patient_id).first()
    if patient is None:
        return None
    if not patient.clinician_id:
        return None
    user = db.query(User).filter_by(id=patient.clinician_id).first()
    if user is None:
        return None
    return user.clinic_id


def _resolve_checkin_or_404(
    db: Session,
    actor: AuthenticatedActor,
    checkin_id: str,
) -> WellnessCheckin:
    """Fetch a wellness_checkins row scoped to actor's clinic.

    Cross-clinic clinicians get 404 (the existence of the check-in must
    not leak across clinics). Admins / supervisors / regulators see
    everything.
    """
    ck = db.query(WellnessCheckin).filter_by(id=checkin_id).first()
    if ck is None:
        raise ApiServiceError(
            code="not_found",
            message="Wellness check-in not found.",
            status_code=404,
        )
    if _is_admin_scope(actor):
        return ck
    ck_clinic = _checkin_clinic_id(db, ck)
    if ck_clinic is None or ck_clinic != actor.clinic_id:
        raise ApiServiceError(
            code="not_found",
            message="Wellness check-in not found.",
            status_code=404,
        )
    return ck


def _scope_query(actor: AuthenticatedActor):
    """Return a callable that produces the base scoped query.

    For non-admin clinicians, scopes to ``actor.clinic_id``. Admins /
    supervisors / regulators see all rows. Mirrors the Clinician
    Adherence Hub scope query pattern.
    """
    def _q(db: Session):
        base = db.query(WellnessCheckin)
        if _is_admin_scope(actor):
            return base
        if not actor.clinic_id:
            # No clinic on the actor — return an empty slice rather than
            # the legacy "all clinicians' patients globally" fallback.
            return base.filter(WellnessCheckin.id.is_(None))
        return (
            base.join(Patient, WellnessCheckin.patient_id == Patient.id)
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
    target_type: str = "clinician_wellness_hub",
) -> str:
    """Best-effort audit hook for the ``clinician_wellness_hub`` surface.

    Never raises — audit must not block the UI even when the umbrella
    audit table is unreachable. Mirrors helpers in
    clinician_adherence_router / wearables_workbench_router.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"clinician_wellness_hub-{event}-{actor.actor_id}"
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
            action=f"clinician_wellness_hub.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("clinician_wellness_hub self-audit skipped")
    return event_id


def _checkin_severity_band(ck: WellnessCheckin) -> str:
    """Map the worst axis on a check-in to a severity band.

    Per spec, "severe" thresholds are anxiety/pain >= 7 or mood <= 3.
    The band lets the list filter and the summary count rows without
    requiring the client to know the axis math.
    """
    # Urgent = severe distress: anxiety >= 9 or pain >= 9 or mood <= 1
    if (ck.anxiety is not None and ck.anxiety >= 9):
        return "urgent"
    if (ck.pain is not None and ck.pain >= 9):
        return "urgent"
    if (ck.mood is not None and ck.mood <= 1):
        return "urgent"
    # High = clinical-attention threshold per spec.
    if (ck.anxiety is not None and ck.anxiety >= 7):
        return "high"
    if (ck.pain is not None and ck.pain >= 7):
        return "high"
    if (ck.mood is not None and ck.mood <= 3):
        return "high"
    # Moderate = early-warning band.
    if (ck.anxiety is not None and ck.anxiety >= 5):
        return "moderate"
    if (ck.pain is not None and ck.pain >= 5):
        return "moderate"
    if (ck.mood is not None and ck.mood <= 5):
        return "moderate"
    return "low"


def _is_escalation_candidate(ck: WellnessCheckin) -> bool:
    """Severity >= 7 on anxiety/pain OR mood <= 3."""
    if ck.anxiety is not None and ck.anxiety >= 7:
        return True
    if ck.pain is not None and ck.pain >= 7:
        return True
    if ck.mood is not None and ck.mood <= 3:
        return True
    return False


def _serialize_checkin(
    db: Session,
    ck: WellnessCheckin,
) -> dict:
    """Render a single check-in for list / detail responses."""
    patient = db.query(Patient).filter_by(id=ck.patient_id).first()
    patient_label = (
        f"{(patient.first_name or '').strip()} {(patient.last_name or '').strip()}".strip()
        if patient is not None
        else ck.patient_id
    )
    is_demo = _patient_is_demo(db, ck.patient_id)
    severity_band = _checkin_severity_band(ck)
    return {
        "id": ck.id,
        "patient_id": ck.patient_id,
        "patient_name": patient_label or ck.patient_id,
        "author_actor_id": ck.author_actor_id,
        "mood": ck.mood,
        "energy": ck.energy,
        "sleep": ck.sleep,
        "anxiety": ck.anxiety,
        "focus": ck.focus,
        "pain": ck.pain,
        "note": ck.note,
        "tags": [t for t in (ck.tags or "").split(",") if t],
        "severity_band": severity_band,
        "escalation_candidate": _is_escalation_candidate(ck),
        "clinician_status": ck.clinician_status or "open",
        "clinician_actor_id": ck.clinician_actor_id,
        "clinician_acted_at": _iso(ck.clinician_acted_at),
        "clinician_note": ck.clinician_note,
        "adverse_event_id": ck.adverse_event_id,
        "shared_at": _iso(ck.shared_at),
        "shared_with": ck.shared_with,
        "deleted_at": _iso(ck.deleted_at),
        "created_at": _iso(ck.created_at),
        "is_demo": bool(is_demo),
    }


def _resolve_actor_clinician_id(
    actor: AuthenticatedActor,
    fallback_patient_clinician: Optional[str],
) -> str:
    """Pick the ``clinician_id`` to stamp on an AE row.

    Prefers the actor (the clinician who pressed Escalate). Falls back
    to the patient's owning clinician for admin actors that have no
    clinician identity. Last resort uses ``actor-clinician-demo`` so
    the NOT NULL column is satisfied in seed-only test runs.
    """
    if actor.role == "clinician":
        return actor.actor_id
    if fallback_patient_clinician:
        return fallback_patient_clinician
    return actor.actor_id or "actor-clinician-demo"


# ── Schemas ─────────────────────────────────────────────────────────────────


class HubCheckinOut(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    author_actor_id: str
    mood: Optional[int] = None
    energy: Optional[int] = None
    sleep: Optional[int] = None
    anxiety: Optional[int] = None
    focus: Optional[int] = None
    pain: Optional[int] = None
    note: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    severity_band: str = "low"
    escalation_candidate: bool = False
    clinician_status: str = "open"
    clinician_actor_id: Optional[str] = None
    clinician_acted_at: Optional[str] = None
    clinician_note: Optional[str] = None
    adverse_event_id: Optional[str] = None
    shared_at: Optional[str] = None
    shared_with: Optional[str] = None
    deleted_at: Optional[str] = None
    created_at: Optional[str] = None
    is_demo: bool = False


class HubListResponse(BaseModel):
    items: list[HubCheckinOut] = Field(default_factory=list)
    total: int = 0
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(HUB_DISCLAIMERS))


class HubLowMoodPatient(BaseModel):
    patient_id: str
    patient_name: str
    avg_mood_7d: float
    checkins_7d: int


class HubMissedStreakPatient(BaseModel):
    patient_id: str
    patient_name: str
    streak_days: int


class HubSummaryResponse(BaseModel):
    total_today: int = 0
    total_7d: int = 0
    axes_trending_down_7d: int = 0
    low_mood_top_patients: list[HubLowMoodPatient] = Field(default_factory=list)
    missed_streak_top_patients: list[HubMissedStreakPatient] = Field(default_factory=list)
    response_rate_pct: float = 0.0
    escalation_candidates: int = 0
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
    checkin_ids: list[str] = Field(..., min_length=1, max_length=200)
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
    checkin_id: str
    clinician_status: str
    adverse_event_id: Optional[str] = None


class HubAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    checkin_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class HubAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/checkins", response_model=HubListResponse)
def list_checkins(
    severity_band: Optional[str] = Query(default=None, max_length=16),
    axis: Optional[str] = Query(default=None, max_length=16),
    surface_chip: Optional[str] = Query(default=None, max_length=32, alias="surface_chip"),
    clinician_status: Optional[str] = Query(default=None, max_length=20),
    patient_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    q: Optional[str] = Query(default=None, max_length=200),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=1000),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubListResponse:
    """List clinic-scoped wellness check-ins for clinician triage.

    ``severity_band`` (low / moderate / high / urgent) is computed from
    the axes; we fetch by the predicate that produces each band and
    filter post-load to keep SQL simple.

    ``axis`` (mood / energy / sleep / anxiety / focus / pain) narrows
    the surface chip — when set without an explicit severity_band the
    list returns rows where THAT axis trips the high band (anxiety/pain
    >= 7, mood/energy/sleep/focus <= 3). Lets a clinician triage
    "anxiety today" without scrolling through the full list.

    ``surface_chip`` is reserved for future tag-based filtering
    (e.g. ``side_effect`` mirroring the adherence pattern); free-form
    tag filtering is wired through the ``q`` text search today.
    """
    _require_clinician_or_admin(actor)
    base = _scope_query(actor)(db)

    if not include_deleted:
        base = base.filter(WellnessCheckin.deleted_at.is_(None))
    if clinician_status and clinician_status in HUB_STATUSES:
        base = base.filter(WellnessCheckin.clinician_status == clinician_status)
    if patient_id:
        base = base.filter(WellnessCheckin.patient_id == patient_id)
    if since and _DATE_RE.match(since):
        try:
            ts = datetime.fromisoformat(since)
            base = base.filter(WellnessCheckin.created_at >= ts)
        except ValueError:
            pass
    if until and _DATE_RE.match(until):
        try:
            ts = datetime.fromisoformat(until) + timedelta(days=1)
            base = base.filter(WellnessCheckin.created_at <= ts)
        except ValueError:
            pass
    if surface_chip:
        like = f"%{surface_chip.strip().lower()}%"
        base = base.filter(WellnessCheckin.tags.like(like))
    if q:
        like = f"%{q.strip()}%"
        base = base.filter(
            or_(
                WellnessCheckin.note.like(like),
                WellnessCheckin.tags.like(like),
            )
        )

    rows = (
        base.order_by(WellnessCheckin.created_at.desc())
        .limit(limit * 4)  # fetch wider since post-filtering can shrink
        .all()
    )

    # Post-filter by severity_band / axis since the band is computed.
    if severity_band and severity_band in _VALID_SEVERITY_BANDS:
        rows = [r for r in rows if _checkin_severity_band(r) == severity_band]
    if axis and axis in _VALID_AXES:
        def _axis_high(r: WellnessCheckin) -> bool:
            v = getattr(r, axis, None)
            if v is None:
                return False
            if axis in _AXES_HIGH_IS_BAD:
                return v >= 7
            return v <= 3
        rows = [r for r in rows if _axis_high(r)]

    rows = rows[:limit]
    items = [HubCheckinOut(**_serialize_checkin(db, r)) for r in rows]
    is_demo_view = any(it.is_demo for it in items)

    _hub_audit(
        db,
        actor,
        event="checkins_listed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"items={len(items)} severity_band={severity_band or '-'} "
            f"axis={axis or '-'} status={clinician_status or '-'} "
            f"patient_id={patient_id or '-'} q={(q or '-')[:60]}"
        ),
        using_demo_data=is_demo_view,
    )

    return HubListResponse(
        items=items,
        total=len(items),
        is_demo_view=is_demo_view,
    )


@router.get("/checkins/summary", response_model=HubSummaryResponse)
def get_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubSummaryResponse:
    """Top counts: today / 7d / axes-trending-down / low-mood top-5 / missed-streak top-5 / response-rate."""
    _require_clinician_or_admin(actor)
    rows: list[WellnessCheckin] = (
        _scope_query(actor)(db)
        .filter(WellnessCheckin.deleted_at.is_(None))
        .all()
    )

    now = datetime.now(timezone.utc)
    today = now.date()
    cutoff_7d = now - timedelta(days=7)
    cutoff_14d = now - timedelta(days=14)

    def _created_aware(r: WellnessCheckin) -> Optional[datetime]:
        return _aware(r.created_at)

    def _on_today(r: WellnessCheckin) -> bool:
        ts = _created_aware(r)
        return ts is not None and ts.date() == today

    rows_today = [r for r in rows if _on_today(r)]
    rows_7d = [r for r in rows if (ts := _created_aware(r)) is not None and ts >= cutoff_7d]
    rows_7_to_14d = [
        r for r in rows
        if (ts := _created_aware(r)) is not None
        and cutoff_14d <= ts < cutoff_7d
    ]

    total_today = len(rows_today)
    total_7d = len(rows_7d)

    # Axes trending down 7d: count axes (across the clinic) where the
    # 7-day average has degraded vs. the prior 7-day window. For
    # mood/energy/sleep/focus a drop is bad; for anxiety/pain a rise is
    # bad. Returns axes_count (0..6 across the clinic-wide view).
    def _axis_avg(rows_set: list[WellnessCheckin], axis: str) -> Optional[float]:
        vals = [getattr(r, axis) for r in rows_set if getattr(r, axis) is not None]
        return sum(vals) / len(vals) if vals else None

    axes_trending_down = 0
    for axis in _AXES:
        cur = _axis_avg(rows_7d, axis)
        prev = _axis_avg(rows_7_to_14d, axis)
        if cur is None or prev is None:
            continue
        if axis in _AXES_HIGH_IS_BAD:
            if cur > prev + 0.5:  # threshold to avoid noise
                axes_trending_down += 1
        else:
            if cur < prev - 0.5:
                axes_trending_down += 1

    # Low-mood top patients: rank patients in the 7-day window by
    # smallest avg_mood_7d. Top 5. Honest: requires at least one mood
    # reading, otherwise the patient is excluded from the ranking.
    by_patient_mood: dict[str, list[int]] = {}
    for r in rows_7d:
        if r.mood is None:
            continue
        by_patient_mood.setdefault(r.patient_id, []).append(r.mood)
    low_mood_ranked: list[tuple[str, float, int]] = []
    for pid, vals in by_patient_mood.items():
        if not vals:
            continue
        avg_mood = sum(vals) / len(vals)
        low_mood_ranked.append((pid, avg_mood, len(vals)))
    low_mood_ranked.sort(key=lambda t: (t[1], t[0]))  # ascending = worst mood first

    low_mood_top: list[HubLowMoodPatient] = []
    for pid, avg_mood, cnt in low_mood_ranked[:5]:
        if avg_mood > 5:  # only flag patients whose 7d avg mood is below the midpoint
            continue
        p = db.query(Patient).filter_by(id=pid).first()
        label = (
            f"{(p.first_name or '').strip()} {(p.last_name or '').strip()}".strip()
            if p is not None
            else pid
        )
        low_mood_top.append(
            HubLowMoodPatient(
                patient_id=pid,
                patient_name=label or pid,
                avg_mood_7d=round(avg_mood, 2),
                checkins_7d=cnt,
            )
        )

    # Missed-checkin streak per patient: count consecutive days back
    # from today where the patient logged NO check-in. Top 5.
    scope_patient_ids: set[str] = set()
    for r in rows:
        scope_patient_ids.add(r.patient_id)
    by_patient_days: dict[str, set[str]] = {}
    for r in rows:
        ts = _created_aware(r)
        if ts is None:
            continue
        by_patient_days.setdefault(r.patient_id, set()).add(ts.date().isoformat())

    streaks: list[tuple[str, int]] = []
    for pid in scope_patient_ids:
        days_logged = by_patient_days.get(pid, set())
        streak = 0
        cursor = today
        while True:
            if cursor.isoformat() in days_logged:
                break
            streak += 1
            cursor = cursor - timedelta(days=1)
            if streak > 30:
                break
        if streak > 0:
            streaks.append((pid, streak))
    streaks.sort(key=lambda t: t[1], reverse=True)
    missed_streak_top: list[HubMissedStreakPatient] = []
    for pid, streak in streaks[:5]:
        p = db.query(Patient).filter_by(id=pid).first()
        label = (
            f"{(p.first_name or '').strip()} {(p.last_name or '').strip()}".strip()
            if p is not None
            else pid
        )
        missed_streak_top.append(
            HubMissedStreakPatient(
                patient_id=pid,
                patient_name=label or pid,
                streak_days=streak,
            )
        )

    # Response rate: fraction of all check-ins (in scope) that have been
    # actioned by a clinician (acknowledged / escalated / resolved).
    actioned = sum(1 for r in rows if (r.clinician_status or "open") != "open")
    response_rate = (actioned / len(rows) * 100.0) if rows else 0.0

    # Escalation candidates: rows in the open state that meet the
    # escalation predicate (severity >= 7 on anxiety/pain or mood <= 3).
    escalation_candidates = sum(
        1 for r in rows_7d
        if (r.clinician_status or "open") == "open"
        and _is_escalation_candidate(r)
    )

    is_demo_view = any(_patient_is_demo(db, r.patient_id) for r in rows)

    _hub_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"today={total_today} 7d={total_7d} "
            f"axes_down={axes_trending_down} "
            f"low_mood_top={len(low_mood_top)} "
            f"streak_top={len(missed_streak_top)} "
            f"response={response_rate:.1f}% "
            f"escalation_candidates={escalation_candidates}"
        ),
        using_demo_data=is_demo_view,
    )

    return HubSummaryResponse(
        total_today=total_today,
        total_7d=total_7d,
        axes_trending_down_7d=axes_trending_down,
        low_mood_top_patients=low_mood_top,
        missed_streak_top_patients=missed_streak_top,
        response_rate_pct=round(response_rate, 1),
        escalation_candidates=escalation_candidates,
        is_demo_view=is_demo_view,
    )


@router.post("/audit-events", response_model=HubAuditEventOut)
def post_audit_event(
    body: HubAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubAuditEventOut:
    """Page-level audit ingestion for the Clinician Wellness Hub.

    Common events: ``view`` (mount), ``filter_changed``, ``checkin_viewed``,
    ``deep_link_followed``, ``demo_banner_shown``, ``export_initiated``.
    Per-checkin mutation events (``checkin_acknowledged`` /
    ``checkin_escalated`` / ``checkin_resolved`` / ``bulk_acknowledged``)
    are emitted by the dedicated endpoints below — this surface only
    carries the page-level breadcrumbs.

    Patients hit 403; cross-clinic check-in ids → 404.
    """
    _require_clinician_or_admin(actor)

    target_id = body.checkin_id or actor.clinic_id or actor.actor_id
    is_demo = bool(body.using_demo_data)
    if body.checkin_id:
        ck = _resolve_checkin_or_404(db, actor, body.checkin_id)
        is_demo = is_demo or _patient_is_demo(db, ck.patient_id)

    note_parts: list[str] = []
    if body.checkin_id:
        note_parts.append(f"checkin={body.checkin_id}")
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


@router.get("/checkins/export.csv")
def export_csv(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of the clinic-scoped triage queue."""
    _require_clinician_or_admin(actor)
    rows = (
        _scope_query(actor)(db)
        .order_by(WellnessCheckin.created_at.desc())
        .limit(5000)
        .all()
    )

    any_demo = any(_patient_is_demo(db, r.patient_id) for r in rows)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "checkin_id", "patient_id", "author_actor_id",
        "mood", "energy", "sleep", "anxiety", "focus", "pain",
        "tags", "note",
        "severity_band", "escalation_candidate",
        "clinician_status", "clinician_actor_id",
        "clinician_acted_at", "clinician_note", "adverse_event_id",
        "shared_at", "shared_with",
        "deleted_at", "created_at", "is_demo",
    ])
    for r in rows:
        writer.writerow([
            r.id, r.patient_id, r.author_actor_id,
            r.mood if r.mood is not None else "",
            r.energy if r.energy is not None else "",
            r.sleep if r.sleep is not None else "",
            r.anxiety if r.anxiety is not None else "",
            r.focus if r.focus is not None else "",
            r.pain if r.pain is not None else "",
            r.tags or "",
            (r.note or "").replace("\n", " ").replace("\r", " "),
            _checkin_severity_band(r),
            "1" if _is_escalation_candidate(r) else "0",
            r.clinician_status or "open",
            r.clinician_actor_id or "",
            _iso(r.clinician_acted_at) or "",
            (r.clinician_note or "").replace("\n", " "),
            r.adverse_event_id or "",
            _iso(r.shared_at) or "",
            r.shared_with or "",
            _iso(r.deleted_at) or "",
            _iso(r.created_at) or "",
            "1" if _patient_is_demo(db, r.patient_id) else "0",
        ])

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}clinician-wellness-checkins.csv"

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
            "X-ClinicianWellnessHub-Demo": "1" if any_demo else "0",
        },
    )


@router.get("/checkins/export.ndjson")
def export_ndjson(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one check-in per line, including triage transcript."""
    _require_clinician_or_admin(actor)
    rows = (
        _scope_query(actor)(db)
        .order_by(WellnessCheckin.created_at.desc())
        .limit(5000)
        .all()
    )

    any_demo = any(_patient_is_demo(db, r.patient_id) for r in rows)
    lines: list[str] = []
    for r in rows:
        payload = _serialize_checkin(db, r)
        lines.append(json.dumps(payload))

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}clinician-wellness-checkins.ndjson"

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
            "X-ClinicianWellnessHub-Demo": "1" if any_demo else "0",
        },
    )


@router.post(
    "/checkins/bulk-acknowledge",
    response_model=HubBulkAcknowledgeOut,
)
def bulk_acknowledge(
    body: HubBulkAcknowledgeIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubBulkAcknowledgeOut:
    """Acknowledge a list of check-in ids in one server round-trip.

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

    for cid in body.checkin_ids:
        try:
            ck = _resolve_checkin_or_404(db, actor, cid)
            if (ck.clinician_status or "open") == "resolved":
                failures.append({
                    "checkin_id": cid,
                    "code": "resolved",
                    "message": "Resolved check-ins are immutable.",
                })
                continue
            ck.clinician_status = "acknowledged"
            ck.clinician_actor_id = actor.actor_id
            ck.clinician_acted_at = now
            ck.clinician_note = body.note[:1000]
            db.commit()
            succeeded += 1
            is_demo = _patient_is_demo(db, ck.patient_id)
            is_demo_session = is_demo_session or is_demo
            _hub_audit(
                db,
                actor,
                event="checkin_acknowledged",
                target_id=ck.id,
                note=f"bulk=1; patient={ck.patient_id}; note={body.note[:200]}",
                using_demo_data=is_demo,
            )
        except ApiServiceError as exc:
            failures.append({
                "checkin_id": cid,
                "code": exc.code or "error",
                "message": exc.message or "error",
            })
        except Exception as exc:  # pragma: no cover — defensive
            db.rollback()
            failures.append({
                "checkin_id": cid,
                "code": "internal_error",
                "message": str(exc)[:200],
            })

    _hub_audit(
        db,
        actor,
        event="bulk_acknowledged",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"requested={len(body.checkin_ids)}; succeeded={succeeded}; "
            f"failures={len(failures)}"
        ),
        using_demo_data=is_demo_session,
    )

    return HubBulkAcknowledgeOut(
        accepted=True,
        succeeded=succeeded,
        failures=failures,
    )


@router.get("/checkins/{checkin_id}", response_model=HubCheckinOut)
def get_checkin(
    checkin_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubCheckinOut:
    """Detail with the triage transcript and patient link."""
    _require_clinician_or_admin(actor)
    ck = _resolve_checkin_or_404(db, actor, checkin_id)
    payload = _serialize_checkin(db, ck)
    is_demo = bool(payload.get("is_demo"))

    _hub_audit(
        db,
        actor,
        event="checkin_viewed",
        target_id=ck.id,
        note=(
            f"patient={ck.patient_id}; severity={payload['severity_band']}; "
            f"status={payload['clinician_status']}"
        ),
        using_demo_data=is_demo,
    )
    return HubCheckinOut(**payload)


@router.post(
    "/checkins/{checkin_id}/acknowledge", response_model=HubActionOut
)
def acknowledge_checkin(
    body: HubActionIn,
    checkin_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubActionOut:
    """Move a check-in clinician_status from ``open`` → ``acknowledged``. Note required.

    Resolved check-ins are immutable (409). Acknowledging an already-
    acknowledged check-in is idempotent on the status but still emits a
    fresh audit row so the regulator sees the second clinician's note.
    """
    _require_clinician_or_admin(actor)
    ck = _resolve_checkin_or_404(db, actor, checkin_id)

    if (ck.clinician_status or "open") == "resolved":
        raise ApiServiceError(
            code="checkin_resolved",
            message="Resolved wellness check-ins are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    ck.clinician_status = "acknowledged"
    ck.clinician_actor_id = actor.actor_id
    ck.clinician_acted_at = now
    ck.clinician_note = body.note[:1000]
    db.commit()

    is_demo = _patient_is_demo(db, ck.patient_id)
    _hub_audit(
        db,
        actor,
        event="checkin_acknowledged",
        target_id=ck.id,
        note=f"patient={ck.patient_id}; note={body.note[:200]}",
        using_demo_data=is_demo,
    )
    return HubActionOut(
        accepted=True,
        checkin_id=ck.id,
        clinician_status="acknowledged",
    )


@router.post(
    "/checkins/{checkin_id}/escalate", response_model=HubActionOut
)
def escalate_checkin(
    body: HubEscalateIn,
    checkin_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubActionOut:
    """Move a check-in → ``escalated`` and create an AdverseEvent draft.

    Note required. Resolved check-ins are immutable (409). Escalation
    creates an :class:`AdverseEvent` draft so the regulatory chain
    stays intact end-to-end and the new draft surfaces in the AE Hub
    triage queue at HIGH priority for the same clinic.

    Recommended trigger predicate: severity >= 7 on anxiety/pain OR
    mood <= 3. The router does NOT enforce the predicate (a clinician
    may escalate a check-in with milder signals if context warrants),
    but the audit row records whether the predicate was met for
    regulator review.
    """
    _require_clinician_or_admin(actor)
    ck = _resolve_checkin_or_404(db, actor, checkin_id)

    if (ck.clinician_status or "open") == "resolved":
        raise ApiServiceError(
            code="checkin_resolved",
            message="Resolved wellness check-ins are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    patient = db.query(Patient).filter_by(id=ck.patient_id).first()
    fallback_clinician = patient.clinician_id if patient is not None else None
    is_demo = _patient_is_demo(db, ck.patient_id)
    severity_band = _checkin_severity_band(ck)
    candidate = _is_escalation_candidate(ck)

    # Map check-in severity_band to AE severity vocabulary.
    ae_severity = "mild"
    if severity_band == "urgent":
        ae_severity = "severe"
    elif severity_band == "high":
        ae_severity = "moderate"
    elif severity_band == "moderate":
        ae_severity = "moderate"

    axis_summary = ", ".join(
        f"{a}={getattr(ck, a)}" for a in _AXES if getattr(ck, a) is not None
    ) or "no axes recorded"

    ae = AdverseEvent(
        id=str(uuid.uuid4()),
        patient_id=ck.patient_id,
        course_id=None,
        session_id=None,
        clinician_id=_resolve_actor_clinician_id(actor, fallback_clinician),
        event_type="wellness_escalation",
        severity=ae_severity,
        description=(
            f"Clinician-escalated from wellness_checkin {ck.id} "
            f"(severity_band={severity_band}, candidate={candidate}). "
            f"Axes: {axis_summary}. "
            f"Clinician note: {body.note[:480]}. "
            f"Patient note: {(ck.note or '')[:300]}"
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

    ck.clinician_status = "escalated"
    ck.clinician_actor_id = actor.actor_id
    ck.clinician_acted_at = now
    ck.clinician_note = (body.note or "")[:1000]
    ck.adverse_event_id = ae.id
    db.commit()

    # HIGH-priority audit row pinned to the check-in so the AE Hub feed
    # and the triage feed both surface the escalation. Mirror of the
    # clinician-adherence-hub HIGH-priority pattern.
    _hub_audit(
        db,
        actor,
        event="checkin_escalated",
        target_id=ck.id,
        note=(
            f"priority=high; patient={ck.patient_id}; "
            f"ae_id={ae.id}; severity_band={severity_band}; "
            f"candidate={candidate}; note={body.note[:200]}"
        ),
        using_demo_data=is_demo,
    )

    return HubActionOut(
        accepted=True,
        checkin_id=ck.id,
        clinician_status="escalated",
        adverse_event_id=ae.id,
    )


@router.post("/checkins/{checkin_id}/resolve", response_model=HubActionOut)
def resolve_checkin(
    body: HubActionIn,
    checkin_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HubActionOut:
    """Move a check-in → ``resolved``. Note required. Immutable thereafter."""
    _require_clinician_or_admin(actor)
    ck = _resolve_checkin_or_404(db, actor, checkin_id)

    if (ck.clinician_status or "open") == "resolved":
        raise ApiServiceError(
            code="checkin_resolved",
            message="Resolved wellness check-ins are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    ck.clinician_status = "resolved"
    ck.clinician_actor_id = actor.actor_id
    ck.clinician_acted_at = now
    ck.clinician_note = body.note[:1000]
    db.commit()

    is_demo = _patient_is_demo(db, ck.patient_id)
    _hub_audit(
        db,
        actor,
        event="checkin_resolved",
        target_id=ck.id,
        note=f"patient={ck.patient_id}; note={body.note[:200]}",
        using_demo_data=is_demo,
    )
    return HubActionOut(
        accepted=True,
        checkin_id=ck.id,
        clinician_status="resolved",
    )
