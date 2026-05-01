"""Patient Wellness Hub launch-audit (2026-05-01).

Second patient-facing launch-audit surface in the chain. Replicates the
contract established by :mod:`app.routers.symptom_journal_router` so
the two patient-side surfaces share an audit shape before we scale the
pattern to Tasks / Reports / Messages / Home Devices.

Endpoints
---------
GET    /api/v1/wellness/checkins              List patient-scoped check-ins (filters)
GET    /api/v1/wellness/summary               Top counts + axis series 7d / 30d
GET    /api/v1/wellness/checkins/{id}         Detail (resolves soft-deleted rows)
POST   /api/v1/wellness/checkins              Create — auto-stamps is_demo + validates consent
PATCH  /api/v1/wellness/checkins/{id}         Edit — author only, increments revision_count
DELETE /api/v1/wellness/checkins/{id}         Soft-delete — reason required, audit row preserved
POST   /api/v1/wellness/checkins/{id}/share   Broadcast to actor's care team (clinician audit)
GET    /api/v1/wellness/export.csv            DEMO-prefixed when patient.is_demo
GET    /api/v1/wellness/export.ndjson         DEMO-prefixed when patient.is_demo
POST   /api/v1/wellness/audit-events          Page-level audit ingestion (target_type=wellness_hub)

Role gate
---------
The patient role is canonical: a patient writes to OWN wellness only
(``patient_id`` is auto-resolved from the actor; cross-patient writes
return 404). Admins keep cross-clinic visibility for support / audit
review. Clinicians do NOT see check-ins unless the patient explicitly
shares them (the ``share`` endpoint emits a clinician-visible audit row
that surfaces in the standard care-team feeds without exposing the
check-in axes directly through the wellness API).

Consent gate
------------
Once a patient has revoked consent (``Patient.consent_signed = False``
OR an active ``ConsentRecord`` row with ``status='withdrawn'``) the
hub is read-only post-revocation: existing check-ins remain visible,
no new check-ins can be created or edited (HTTP 403). This is enforced
at write endpoints via :func:`_assert_consent_active`.

Demo honesty
------------
``is_demo`` is stamped on create from :func:`_patient_is_demo` (mirrors
the pattern used by the Patient Profile + Symptom Journal launch
audits). Exports prefix ``DEMO-`` to the filename whenever the patient
is demo, and the header ``X-Wellness-Demo: 1`` is set so reviewers can
see at-a-glance.

Audit hooks
-----------
Every endpoint emits at least one ``wellness_hub.<event>`` audit row
via the umbrella audit_events table. Surface name: ``wellness_hub``
(whitelisted by ``audit_trail_router.KNOWN_SURFACES`` and the qEEG
audit-events ingestion endpoint).
"""
from __future__ import annotations

import csv
import io
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    ConsentRecord,
    Patient,
    User,
    WellnessCheckin,
)


router = APIRouter(prefix="/api/v1/wellness", tags=["Wellness Hub"])
_log = logging.getLogger(__name__)


# ── Disclaimers surfaced on every list / summary read ───────────────────────


WELLNESS_HUB_DISCLAIMERS = [
    "Wellness check-ins are part of your clinical record once linked to a "
    "treatment course. Edits and deletes are audited; deletes are soft "
    "(the row is preserved for regulatory review).",
    "Sharing a check-in with your care team broadcasts a clinician-visible "
    "audit row. Until you share, check-ins are visible only to you and "
    "your clinic admin.",
    "If you withdraw consent, your existing check-ins remain readable but "
    "you cannot add or edit new check-ins.",
]


# ── Helpers ─────────────────────────────────────────────────────────────────


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}


# Six-axis schema. All axes are 0..10 (10 = worst on pain/anxiety, best on
# the rest). Order matters: it's the column order used in the CSV export and
# the summary `axes_avg_*` block.
_AXES = ("mood", "energy", "sleep", "anxiety", "focus", "pain")


def _patient_is_demo(db: Session, patient: Patient | None) -> bool:
    """Mirrors :func:`patients_router._patient_is_demo` and the symptom
    journal helper to avoid a circular import.
    """
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


def _resolve_patient_for_actor(
    db: Session, actor: AuthenticatedActor, patient_id: Optional[str] = None
) -> Patient:
    """Return the Patient row the actor is allowed to act on.

    Patient role:
      * Always resolves to the patient linked to the user's account
        (email match) or the demo seed patient when ``actor_id ==
        actor-patient-demo``. ``patient_id`` is ignored if supplied —
        a patient cannot escape their own scope by spoofing the path.
      * Mismatch (patient_id passed in path AND not equal to the
        resolved row) returns 404 to avoid leaking existence.
    Admin role:
      * Resolves to the Patient row at ``patient_id`` if provided, else
        400 (an admin must scope explicitly).
    Clinician role:
      * Rejected: clinicians do not access wellness check-ins except via
        the explicit share flow (which surfaces audit events, not rows).
        Returns 403.
    """
    if actor.role == "patient":
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
        if patient_id is not None and patient_id != patient.id:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        return patient

    if actor.role == "admin":
        if patient_id is None:
            raise ApiServiceError(
                code="patient_id_required",
                message="Admin wellness access requires an explicit patient_id.",
                status_code=400,
            )
        patient = db.query(Patient).filter_by(id=patient_id).first()
        if patient is None:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        return patient

    raise ApiServiceError(
        code="patient_role_required",
        message="Wellness Hub access is restricted to the patient and admins.",
        status_code=403,
    )


def _consent_active(db: Session, patient: Patient) -> bool:
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


def _assert_consent_active(db: Session, patient: Patient) -> None:
    if not _consent_active(db, patient):
        raise ApiServiceError(
            code="consent_inactive",
            message=(
                "Wellness Hub writes require active consent. Existing "
                "check-ins remain readable; new check-ins are blocked "
                "until consent is reinstated."
            ),
            status_code=403,
        )


def _self_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the wellness_hub surface; never raises."""
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"wellness_hub-{event}-{actor.actor_id}-{int(now.timestamp())}"
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
            target_id=str(target_id) or actor.actor_id,
            target_type="wellness_hub",
            action=f"wellness_hub.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("wellness_hub self-audit skipped")
    return event_id


def _normalise_tags(raw: Optional[str | list[str]]) -> Optional[str]:
    if raw is None:
        return None
    if isinstance(raw, str):
        items = [t.strip() for t in raw.split(",")]
    else:
        items = [str(t).strip() for t in raw]
    seen: set[str] = set()
    out: list[str] = []
    for t in items:
        t_lc = t.lower()
        if not t_lc or len(t_lc) > 32 or t_lc in seen:
            continue
        seen.add(t_lc)
        out.append(t_lc)
        if len(out) >= 16:
            break
    return ",".join(out) if out else None


def _checkin_to_dict(row: WellnessCheckin) -> dict:
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "author_actor_id": row.author_actor_id,
        "mood": row.mood,
        "energy": row.energy,
        "sleep": row.sleep,
        "anxiety": row.anxiety,
        "focus": row.focus,
        "pain": row.pain,
        "note": row.note,
        "tags": [t for t in (row.tags or "").split(",") if t],
        "is_demo": bool(row.is_demo),
        "shared_at": row.shared_at.isoformat() if row.shared_at else None,
        "shared_with": row.shared_with,
        "revision_count": row.revision_count,
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "delete_reason": row.delete_reason,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# ── Schemas ─────────────────────────────────────────────────────────────────


class WellnessCheckinOut(BaseModel):
    id: str
    patient_id: str
    author_actor_id: str
    mood: Optional[int] = None
    energy: Optional[int] = None
    sleep: Optional[int] = None
    anxiety: Optional[int] = None
    focus: Optional[int] = None
    pain: Optional[int] = None
    note: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    is_demo: bool = False
    shared_at: Optional[str] = None
    shared_with: Optional[str] = None
    revision_count: int = 0
    deleted_at: Optional[str] = None
    delete_reason: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class WellnessListResponse(BaseModel):
    items: list[WellnessCheckinOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    consent_active: bool
    is_demo: bool
    disclaimers: list[str] = Field(
        default_factory=lambda: list(WELLNESS_HUB_DISCLAIMERS)
    )


class WellnessSummaryResponse(BaseModel):
    checkins_7d: int = 0
    checkins_30d: int = 0
    missed_days_7d: int = 0
    missed_days_30d: int = 0
    axes_avg_7d: dict[str, Optional[float]] = Field(default_factory=dict)
    axes_avg_30d: dict[str, Optional[float]] = Field(default_factory=dict)
    top_tags_30d: list[dict] = Field(default_factory=list)
    mood_series_7d: list[dict] = Field(default_factory=list)
    delta_yesterday: dict[str, Optional[float]] = Field(default_factory=dict)
    consent_active: bool = True
    is_demo: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(WELLNESS_HUB_DISCLAIMERS)
    )


def _axis_validator(name: str):
    """Build a Pydantic validator that enforces 0..10 on an axis field.

    Pydantic ``Field(ge=, le=)`` already does the validation, but the
    schemas accept ``None`` for partial check-ins so we just rely on
    the constraint declared on each Field directly.
    """
    return None  # placeholder for future custom validation


class WellnessCheckinIn(BaseModel):
    mood: Optional[int] = Field(None, ge=0, le=10)
    energy: Optional[int] = Field(None, ge=0, le=10)
    sleep: Optional[int] = Field(None, ge=0, le=10)
    anxiety: Optional[int] = Field(None, ge=0, le=10)
    focus: Optional[int] = Field(None, ge=0, le=10)
    pain: Optional[int] = Field(None, ge=0, le=10)
    note: Optional[str] = Field(None, max_length=4000)
    tags: Optional[list[str]] = None

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        return v or None


class WellnessCheckinPatch(BaseModel):
    mood: Optional[int] = Field(None, ge=0, le=10)
    energy: Optional[int] = Field(None, ge=0, le=10)
    sleep: Optional[int] = Field(None, ge=0, le=10)
    anxiety: Optional[int] = Field(None, ge=0, le=10)
    focus: Optional[int] = Field(None, ge=0, le=10)
    pain: Optional[int] = Field(None, ge=0, le=10)
    note: Optional[str] = Field(None, max_length=4000)
    tags: Optional[list[str]] = None

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        return v or None


class WellnessCheckinDeleteIn(BaseModel):
    reason: str = Field(..., min_length=2, max_length=255)


class WellnessShareIn(BaseModel):
    note: Optional[str] = Field(None, max_length=255)


class WellnessShareOut(BaseModel):
    accepted: bool
    checkin_id: str
    shared_at: str
    shared_with: str


class WellnessAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    checkin_id: Optional[str] = Field(None, max_length=64)
    note: Optional[str] = Field(None, max_length=512)
    using_demo_data: bool = False


class WellnessAuditEventAck(BaseModel):
    accepted: bool
    event_id: str


# ── Validation helper for create/edit payloads ──────────────────────────────


def _require_payload_meaningful(body: WellnessCheckinIn | WellnessCheckinPatch) -> None:
    """Reject empty payloads.

    A check-in with no axis values, no note and no tags carries no
    clinical information; we refuse it rather than persist an empty
    timestamp row.
    """
    has_axis = any(getattr(body, axis) is not None for axis in _AXES)
    if not has_axis and not body.note and not body.tags:
        raise ApiServiceError(
            code="empty_wellness_checkin",
            message=(
                "A check-in must include at least one axis (mood, energy, "
                "sleep, anxiety, focus, pain), a note, or tags."
            ),
            status_code=422,
        )


# ── Filter parser ───────────────────────────────────────────────────────────


def _apply_filters(
    q,
    *,
    since: Optional[str],
    until: Optional[str],
    tag: Optional[str],
    axis: Optional[str],
    axis_min: Optional[int],
    axis_max: Optional[int],
    q_text: Optional[str],
    include_deleted: bool,
):
    if not include_deleted:
        q = q.filter(WellnessCheckin.deleted_at.is_(None))
    if since:
        try:
            ts = datetime.fromisoformat(since.replace("Z", "+00:00"))
            q = q.filter(WellnessCheckin.created_at >= ts)
        except ValueError:
            pass
    if until:
        try:
            ts = datetime.fromisoformat(until.replace("Z", "+00:00"))
            q = q.filter(WellnessCheckin.created_at <= ts)
        except ValueError:
            pass
    if tag:
        tag_lc = tag.strip().lower()
        if tag_lc:
            q = q.filter(WellnessCheckin.tags.like(f"%{tag_lc}%"))
    # axis-band filter — e.g. axis=mood, axis_min=7, axis_max=10 → "good days"
    if axis and axis in _AXES and (axis_min is not None or axis_max is not None):
        col = getattr(WellnessCheckin, axis)
        if axis_min is not None:
            q = q.filter(col >= axis_min)
        if axis_max is not None:
            q = q.filter(col <= axis_max)
    if q_text:
        like = f"%{q_text.strip()}%"
        q = q.filter(
            or_(
                WellnessCheckin.note.like(like),
                WellnessCheckin.tags.like(like),
            )
        )
    return q


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite strips tzinfo on roundtrip — coerce to tz-aware UTC.

    See memory note ``deepsynaps-sqlite-tz-naive.md``.
    """
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/checkins", response_model=WellnessListResponse)
def list_checkins(
    patient_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None, max_length=32),
    axis: Optional[str] = Query(default=None, max_length=16),
    axis_min: Optional[int] = Query(default=None, ge=0, le=10),
    axis_max: Optional[int] = Query(default=None, ge=0, le=10),
    q: Optional[str] = Query(default=None, max_length=200),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessListResponse:
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    is_demo = _patient_is_demo(db, patient)

    base = db.query(WellnessCheckin).filter(
        WellnessCheckin.patient_id == patient.id
    )
    filtered = _apply_filters(
        base,
        since=since,
        until=until,
        tag=tag,
        axis=axis,
        axis_min=axis_min,
        axis_max=axis_max,
        q_text=q,
        include_deleted=include_deleted,
    )
    total = filtered.count()
    rows = (
        filtered.order_by(WellnessCheckin.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    _self_audit(
        db,
        actor,
        event="view",
        target_id=patient.id,
        note=(
            f"items={len(rows)} total={total} since={since or '-'} "
            f"until={until or '-'} tag={tag or '-'} axis={axis or '-'}"
        ),
        using_demo_data=is_demo,
    )

    return WellnessListResponse(
        items=[WellnessCheckinOut(**_checkin_to_dict(r)) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
        consent_active=_consent_active(db, patient),
        is_demo=is_demo,
    )


@router.get("/summary", response_model=WellnessSummaryResponse)
def get_summary(
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessSummaryResponse:
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    is_demo = _patient_is_demo(db, patient)
    now = datetime.now(timezone.utc)
    cutoff_7d = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    base = db.query(WellnessCheckin).filter(
        WellnessCheckin.patient_id == patient.id,
        WellnessCheckin.deleted_at.is_(None),
    )
    rows_30d = base.filter(WellnessCheckin.created_at >= cutoff_30d).all()
    rows_7d = [
        r for r in rows_30d
        if _aware(r.created_at) and _aware(r.created_at) >= cutoff_7d
    ]

    def _avg_for(rows: list[WellnessCheckin], axis: str) -> Optional[float]:
        vals = [getattr(r, axis) for r in rows if getattr(r, axis) is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    axes_avg_7d = {axis: _avg_for(rows_7d, axis) for axis in _AXES}
    axes_avg_30d = {axis: _avg_for(rows_30d, axis) for axis in _AXES}

    # missed-days = days in window with no check-in (date-bucketed). We
    # consider "today" (UTC) as day 0 of the window so the answer is
    # window_size - distinct_days_with_a_checkin.
    def _distinct_days(rows: list[WellnessCheckin]) -> set[str]:
        out: set[str] = set()
        for r in rows:
            ts = _aware(r.created_at)
            if ts is None:
                continue
            out.add(ts.date().isoformat())
        return out

    days_7d = _distinct_days(rows_7d)
    days_30d = _distinct_days(rows_30d)
    missed_days_7d = max(0, 7 - len(days_7d))
    missed_days_30d = max(0, 30 - len(days_30d))

    # Top tags / 30d
    tag_counts: dict[str, int] = {}
    for r in rows_30d:
        for t in (r.tags or "").split(","):
            t = t.strip().lower()
            if not t:
                continue
            tag_counts[t] = tag_counts.get(t, 0) + 1
    top_tags = [
        {"tag": t, "count": c}
        for t, c in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
    ]

    # Mood series / 7d (per-day average mood). The patient sees this in
    # the timeline chart; we expose averages so the chart doesn't need to
    # decide which check-in "wins" on a multi-checkin day.
    series_buckets: dict[str, list[int]] = {}
    for r in rows_7d:
        if r.mood is None or r.created_at is None:
            continue
        day = _aware(r.created_at).date().isoformat()
        series_buckets.setdefault(day, []).append(r.mood)
    mood_series = [
        {"date": day, "avg_mood": round(sum(vals) / len(vals), 2), "count": len(vals)}
        for day, vals in sorted(series_buckets.items())
    ]

    # Delta vs. yesterday — most recent check-in's axes minus the most
    # recent prior-day check-in's axes. Honest: returns None per axis when
    # either side lacks data.
    today = now.date()
    yesterday = (now - timedelta(days=1)).date()
    today_rows = [r for r in rows_7d if _aware(r.created_at) and _aware(r.created_at).date() == today]
    yest_rows = [r for r in rows_7d if _aware(r.created_at) and _aware(r.created_at).date() == yesterday]
    delta: dict[str, Optional[float]] = {axis: None for axis in _AXES}
    if today_rows and yest_rows:
        latest_today = max(today_rows, key=lambda r: _aware(r.created_at))
        latest_yest = max(yest_rows, key=lambda r: _aware(r.created_at))
        for axis in _AXES:
            t_v = getattr(latest_today, axis)
            y_v = getattr(latest_yest, axis)
            if t_v is not None and y_v is not None:
                delta[axis] = float(t_v - y_v)

    _self_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=patient.id,
        note=(
            f"checkins_7d={len(rows_7d)} checkins_30d={len(rows_30d)} "
            f"missed_7d={missed_days_7d}"
        ),
        using_demo_data=is_demo,
    )

    return WellnessSummaryResponse(
        checkins_7d=len(rows_7d),
        checkins_30d=len(rows_30d),
        missed_days_7d=missed_days_7d,
        missed_days_30d=missed_days_30d,
        axes_avg_7d=axes_avg_7d,
        axes_avg_30d=axes_avg_30d,
        top_tags_30d=top_tags,
        mood_series_7d=mood_series,
        delta_yesterday=delta,
        consent_active=_consent_active(db, patient),
        is_demo=is_demo,
    )


@router.get("/checkins/{checkin_id}", response_model=WellnessCheckinOut)
def get_checkin(
    checkin_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessCheckinOut:
    """Return a single check-in, including soft-deleted rows so the audit
    trail can resolve event detail. Cross-patient access returns 404.
    """
    row = (
        db.query(WellnessCheckin).filter(WellnessCheckin.id == checkin_id).first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Wellness check-in not found.", status_code=404
        )
    patient = _resolve_patient_for_actor(db, actor, row.patient_id)
    is_demo = _patient_is_demo(db, patient)
    _self_audit(
        db,
        actor,
        event="checkin_viewed",
        target_id=row.id,
        note=f"patient={patient.id}",
        using_demo_data=is_demo,
    )
    return WellnessCheckinOut(**_checkin_to_dict(row))


@router.post("/checkins", response_model=WellnessCheckinOut, status_code=201)
def create_checkin(
    body: WellnessCheckinIn,
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessCheckinOut:
    _require_payload_meaningful(body)
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    _assert_consent_active(db, patient)
    is_demo = _patient_is_demo(db, patient)

    row = WellnessCheckin(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        author_actor_id=actor.actor_id,
        mood=body.mood,
        energy=body.energy,
        sleep=body.sleep,
        anxiety=body.anxiety,
        focus=body.focus,
        pain=body.pain,
        note=body.note,
        tags=_normalise_tags(body.tags),
        is_demo=is_demo,
        revision_count=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    axis_summary = ",".join(
        f"{a}={getattr(row, a)}" for a in _AXES if getattr(row, a) is not None
    ) or "-"
    _self_audit(
        db,
        actor,
        event="checkin_logged",
        target_id=row.id,
        note=f"patient={patient.id}; {axis_summary}; tags={row.tags or '-'}",
        using_demo_data=is_demo,
    )
    return WellnessCheckinOut(**_checkin_to_dict(row))


@router.patch("/checkins/{checkin_id}", response_model=WellnessCheckinOut)
def edit_checkin(
    body: WellnessCheckinPatch,
    checkin_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessCheckinOut:
    row = (
        db.query(WellnessCheckin).filter(WellnessCheckin.id == checkin_id).first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Wellness check-in not found.", status_code=404
        )
    if row.deleted_at is not None:
        raise ApiServiceError(
            code="checkin_deleted",
            message="Cannot edit a deleted check-in. Restore it first.",
            status_code=409,
        )
    patient = _resolve_patient_for_actor(db, actor, row.patient_id)
    _assert_consent_active(db, patient)
    is_demo = _patient_is_demo(db, patient)

    if row.author_actor_id != actor.actor_id:
        raise ApiServiceError(
            code="forbidden",
            message="Only the check-in author can edit this check-in.",
            status_code=403,
        )

    changed_fields: list[str] = []
    for axis in _AXES:
        new_v = getattr(body, axis)
        if new_v is not None and new_v != getattr(row, axis):
            setattr(row, axis, new_v)
            changed_fields.append(axis)
    if body.note is not None and body.note != row.note:
        row.note = body.note
        changed_fields.append("note")
    if body.tags is not None:
        new_tags = _normalise_tags(body.tags)
        if new_tags != row.tags:
            row.tags = new_tags
            changed_fields.append("tags")

    if not changed_fields:
        _self_audit(
            db,
            actor,
            event="checkin_edit_noop",
            target_id=row.id,
            note=f"patient={patient.id}",
            using_demo_data=is_demo,
        )
        return WellnessCheckinOut(**_checkin_to_dict(row))

    row.revision_count = (row.revision_count or 0) + 1
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)

    _self_audit(
        db,
        actor,
        event="checkin_edited",
        target_id=row.id,
        note=(
            f"patient={patient.id}; rev={row.revision_count}; "
            f"fields={','.join(changed_fields)}"
        ),
        using_demo_data=is_demo,
    )
    return WellnessCheckinOut(**_checkin_to_dict(row))


@router.delete("/checkins/{checkin_id}", response_model=WellnessCheckinOut)
def soft_delete_checkin(
    body: WellnessCheckinDeleteIn,
    checkin_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessCheckinOut:
    row = (
        db.query(WellnessCheckin).filter(WellnessCheckin.id == checkin_id).first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Wellness check-in not found.", status_code=404
        )
    patient = _resolve_patient_for_actor(db, actor, row.patient_id)
    is_demo = _patient_is_demo(db, patient)
    if row.deleted_at is not None:
        _self_audit(
            db,
            actor,
            event="checkin_delete_noop",
            target_id=row.id,
            note=f"patient={patient.id}; already_deleted=1",
            using_demo_data=is_demo,
        )
        return WellnessCheckinOut(**_checkin_to_dict(row))

    if row.author_actor_id != actor.actor_id:
        raise ApiServiceError(
            code="forbidden",
            message="Only the check-in author can delete this check-in.",
            status_code=403,
        )
    row.deleted_at = datetime.now(timezone.utc)
    row.delete_reason = body.reason.strip()[:255]
    row.updated_at = row.deleted_at
    db.add(row)
    db.commit()
    db.refresh(row)

    _self_audit(
        db,
        actor,
        event="checkin_deleted",
        target_id=row.id,
        note=f"patient={patient.id}; reason={row.delete_reason[:200]}",
        using_demo_data=is_demo,
    )
    return WellnessCheckinOut(**_checkin_to_dict(row))


@router.post("/checkins/{checkin_id}/share", response_model=WellnessShareOut)
def share_checkin(
    body: WellnessShareIn,
    checkin_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessShareOut:
    """Broadcast a check-in to the patient's care team.

    Marks the check-in ``shared_at`` + records the target clinician's
    user id, and emits BOTH a patient-side ``wellness_hub.checkin_shared``
    audit row AND a clinician-visible
    ``wellness_hub.checkin_shared_to_clinician`` row keyed on the
    clinician's user id so the standard audit-trail UI can surface it
    in the clinician's feed.
    """
    row = (
        db.query(WellnessCheckin).filter(WellnessCheckin.id == checkin_id).first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Wellness check-in not found.", status_code=404
        )
    patient = _resolve_patient_for_actor(db, actor, row.patient_id)
    if row.author_actor_id != actor.actor_id and actor.role != "admin":
        raise ApiServiceError(
            code="forbidden",
            message="Only the check-in author can share this check-in.",
            status_code=403,
        )
    is_demo = _patient_is_demo(db, patient)

    clinician_id = patient.clinician_id
    now = datetime.now(timezone.utc)
    row.shared_at = now
    row.shared_with = clinician_id
    row.updated_at = now
    db.add(row)
    db.commit()
    db.refresh(row)

    _self_audit(
        db,
        actor,
        event="checkin_shared",
        target_id=row.id,
        note=(
            f"patient={patient.id}; clinician={clinician_id}; "
            f"reason={(body.note or '')[:120]}"
        ),
        using_demo_data=is_demo,
    )
    try:
        from app.repositories.audit import create_audit_event  # noqa: PLC0415

        clinician_event_id = (
            f"wellness_hub-shared_to_clinician-{actor.actor_id}"
            f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        clinician_note_parts: list[str] = []
        if is_demo:
            clinician_note_parts.append("DEMO")
        clinician_note_parts.append(f"patient={patient.id}")
        clinician_note_parts.append(f"checkin={row.id}")
        if body.note:
            clinician_note_parts.append(body.note[:200])
        create_audit_event(
            db,
            event_id=clinician_event_id,
            target_id=clinician_id,
            target_type="wellness_hub",
            action="wellness_hub.checkin_shared_to_clinician",
            role=actor.role,
            actor_id=actor.actor_id,
            note="; ".join(clinician_note_parts)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("wellness_hub clinician-share audit skipped")

    return WellnessShareOut(
        accepted=True,
        checkin_id=row.id,
        shared_at=now.isoformat(),
        shared_with=clinician_id,
    )


# ── Exports ─────────────────────────────────────────────────────────────────


CSV_COLUMNS = [
    "id",
    "patient_id",
    "author_actor_id",
    "mood",
    "energy",
    "sleep",
    "anxiety",
    "focus",
    "pain",
    "tags",
    "note",
    "is_demo",
    "shared_at",
    "shared_with",
    "revision_count",
    "deleted_at",
    "delete_reason",
    "created_at",
    "updated_at",
]


def _filename(prefix: str, is_demo: bool) -> str:
    base = "wellness_checkins"
    if is_demo:
        base = f"DEMO-{base}"
    return f"{base}.{prefix}"


@router.get("/export.csv")
def export_csv(
    patient_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None, max_length=32),
    axis: Optional[str] = Query(default=None, max_length=16),
    axis_min: Optional[int] = Query(default=None, ge=0, le=10),
    axis_max: Optional[int] = Query(default=None, ge=0, le=10),
    q: Optional[str] = Query(default=None, max_length=200),
    include_deleted: bool = Query(default=True),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    is_demo = _patient_is_demo(db, patient)

    base = db.query(WellnessCheckin).filter(
        WellnessCheckin.patient_id == patient.id
    )
    filtered = _apply_filters(
        base,
        since=since,
        until=until,
        tag=tag,
        axis=axis,
        axis_min=axis_min,
        axis_max=axis_max,
        q_text=q,
        include_deleted=include_deleted,
    )
    rows = filtered.order_by(WellnessCheckin.created_at.desc()).limit(10_000).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        writer.writerow(
            [
                r.id,
                r.patient_id,
                r.author_actor_id,
                r.mood if r.mood is not None else "",
                r.energy if r.energy is not None else "",
                r.sleep if r.sleep is not None else "",
                r.anxiety if r.anxiety is not None else "",
                r.focus if r.focus is not None else "",
                r.pain if r.pain is not None else "",
                r.tags or "",
                (r.note or "").replace("\n", " ").replace("\r", " "),
                int(bool(r.is_demo)),
                r.shared_at.isoformat() if r.shared_at else "",
                r.shared_with or "",
                r.revision_count or 0,
                r.deleted_at.isoformat() if r.deleted_at else "",
                (r.delete_reason or "").replace("\n", " "),
                r.created_at.isoformat() if r.created_at else "",
                r.updated_at.isoformat() if r.updated_at else "",
            ]
        )

    _self_audit(
        db,
        actor,
        event="export_csv",
        target_id=patient.id,
        note=f"rows={len(rows)} demo={int(is_demo)}",
        using_demo_data=is_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={_filename('csv', is_demo)}",
            "Cache-Control": "no-store",
            "X-Wellness-Demo": "1" if is_demo else "0",
        },
    )


@router.get("/export.ndjson")
def export_ndjson(
    patient_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None, max_length=32),
    axis: Optional[str] = Query(default=None, max_length=16),
    axis_min: Optional[int] = Query(default=None, ge=0, le=10),
    axis_max: Optional[int] = Query(default=None, ge=0, le=10),
    q: Optional[str] = Query(default=None, max_length=200),
    include_deleted: bool = Query(default=True),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    is_demo = _patient_is_demo(db, patient)

    base = db.query(WellnessCheckin).filter(
        WellnessCheckin.patient_id == patient.id
    )
    filtered = _apply_filters(
        base,
        since=since,
        until=until,
        tag=tag,
        axis=axis,
        axis_min=axis_min,
        axis_max=axis_max,
        q_text=q,
        include_deleted=include_deleted,
    )
    rows = filtered.order_by(WellnessCheckin.created_at.desc()).limit(10_000).all()

    lines = [json.dumps(_checkin_to_dict(r), separators=(",", ":")) for r in rows]
    body = "\n".join(lines) + ("\n" if lines else "")

    _self_audit(
        db,
        actor,
        event="export_ndjson",
        target_id=patient.id,
        note=f"rows={len(rows)} demo={int(is_demo)}",
        using_demo_data=is_demo,
    )

    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f"attachment; filename={_filename('ndjson', is_demo)}",
            "Cache-Control": "no-store",
            "X-Wellness-Demo": "1" if is_demo else "0",
        },
    )


# ── Audit-events ingestion (page-level) ─────────────────────────────────────


@router.post("/audit-events", response_model=WellnessAuditEventAck)
def post_audit_event(
    body: WellnessAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WellnessAuditEventAck:
    """Record a page-level audit event from the wellness UI.

    Surface: ``wellness_hub``. Common events: ``view`` (mount),
    ``filter_changed``, ``form_opened``, ``share_clicked``,
    ``export_clicked``, ``consent_banner_shown``,
    ``cross_link_journal_clicked``.

    Patient-or-admin gate. Clinicians cannot emit wellness audit rows
    directly to keep the surface clearly attributed to patient-side
    actions.
    """
    if actor.role not in ("patient", "admin"):
        raise ApiServiceError(
            code="patient_role_required",
            message="Wellness Hub audit ingestion is restricted to patient and admin roles.",
            status_code=403,
        )
    note_parts: list[str] = []
    if body.checkin_id:
        note_parts.append(f"checkin={body.checkin_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    event_id = _self_audit(
        db,
        actor,
        event=body.event,
        target_id=body.checkin_id or actor.actor_id,
        note=note,
        using_demo_data=bool(body.using_demo_data),
    )
    return WellnessAuditEventAck(accepted=True, event_id=event_id)
