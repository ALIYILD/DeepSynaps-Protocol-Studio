"""Clinician Wearables Triage Workbench launch-audit (2026-05-01).

Bidirectional counterpart to the patient-facing Patient Wearables surface
landed in #352. The patient surface gave patients an audited connect /
sync / disconnect chain with anomaly escalation; this surface gives
clinicians an audited triage queue over the resulting
``wearable_alert_flags`` rows so the regulator can replay the full
ack → escalate → resolve transcript per row.

Endpoints
---------
GET    /api/v1/wearables/workbench/flags                List clinic-scoped triage queue (filters)
GET    /api/v1/wearables/workbench/flags/summary        Top counts (open / ack / escalated / resolved / 7d_incidence)
GET    /api/v1/wearables/workbench/flags/{id}           Detail (observation series + patient link)
POST   /api/v1/wearables/workbench/flags/{id}/acknowledge   Note required; flips status open → acknowledged
POST   /api/v1/wearables/workbench/flags/{id}/escalate      Note required; creates AdverseEvent draft
POST   /api/v1/wearables/workbench/flags/{id}/resolve       Note required; flag immutable thereafter
GET    /api/v1/wearables/workbench/flags/export.csv     DEMO-prefixed if any flag's patient is demo
GET    /api/v1/wearables/workbench/flags/export.ndjson  DEMO-prefixed if any flag's patient is demo
POST   /api/v1/wearables/workbench/audit-events         Page-level audit (target_type=wearables_workbench)

Role gate
---------
clinician / admin / reviewer / supervisor / technician. Patients hit 403.

Cross-clinic
------------
Non-admin clinicians see only flags whose owning patient's clinician
shares ``actor.clinic_id``. Cross-clinic detail / mutation hits 404.
Admins (and supervisors) see all clinics — this is the same pattern as
the existing ``/api/v1/wearables/clinic/alerts/summary`` endpoint that
the dashboard widget already uses.

Workflow
--------
``open`` → ``acknowledged`` (optional) → ``escalated`` (optional) →
``resolved``. Resolution is a hard immutability gate: any subsequent
state change attempt returns 409 so the audit transcript stays clean.

Escalation
----------
Creates an :class:`AdverseEvent` in ``status='reported'`` keyed to the
flag's patient + course (when known). Mirrors the AE Hub #342 + Adverse
Events #285 pattern so a wearable-detected anomaly graduates into the
regulatory chain without dropping audit continuity.

Demo honesty
------------
If any flag's owning patient is a demo patient, exports prefix
``DEMO-`` to the filename and set ``X-WearablesWorkbench-Demo: 1``.
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

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AdverseEvent,
    Patient,
    User,
    WearableAlertFlag,
    WearableObservation,
)


router = APIRouter(
    prefix="/api/v1/wearables/workbench",
    tags=["Wearables Workbench"],
)
_log = logging.getLogger(__name__)


# Honest disclaimers always rendered on the page so reviewers know the
# regulatory weight of the surface.
WORKBENCH_DISCLAIMERS = [
    "Wearable alert flags are derived from consumer-grade data plus the "
    "deterministic rule engine in app/services/wearable_flags.py. They are "
    "an early-warning signal, not a diagnostic.",
    "Acknowledge → Escalate → Resolve is the canonical triage flow. "
    "Resolved flags are immutable and surface in the regulator audit trail.",
    "Escalating a flag creates an Adverse Event Hub draft visible to all "
    "clinicians at this clinic. Use the AE Hub to complete classification, "
    "review, and (where reportable) regulator submission.",
    "Demo flags are clearly labelled and exports are DEMO-prefixed. They "
    "are not regulator-submittable.",
]


WORKBENCH_STATUSES = ("open", "acknowledged", "escalated", "resolved")
_VALID_SEVERITIES = ("info", "warning", "urgent")
_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


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
    hides clinician URLs behind a 404. Mirror of the existing wearable
    router's role gate.
    """
    if actor.role not in ("clinician", "admin", "supervisor", "reviewer", "technician"):
        raise ApiServiceError(
            code="forbidden",
            message="Clinician access required for the Wearables Workbench.",
            status_code=403,
        )


def _is_admin_scope(actor: AuthenticatedActor) -> bool:
    return actor.role in ("admin", "supervisor")


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


def _flag_clinic_id(db: Session, flag: WearableAlertFlag) -> Optional[str]:
    """Resolve the owning clinic of the flag via patient → clinician → user.

    Returns ``None`` when the patient is orphaned (no clinician.clinic_id);
    callers treat that as "cross-clinic blocked" for non-admins, matching
    the canonical ``require_patient_owner`` semantics.
    """
    patient = db.query(Patient).filter_by(id=flag.patient_id).first()
    if patient is None:
        return None
    if not patient.clinician_id:
        return None
    user = db.query(User).filter_by(id=patient.clinician_id).first()
    if user is None:
        return None
    return user.clinic_id


def _resolve_flag_or_404(
    db: Session,
    actor: AuthenticatedActor,
    flag_id: str,
) -> WearableAlertFlag:
    """Fetch a flag scoped to the actor's clinic.

    Cross-clinic clinicians get 404 (the existence of the flag must not
    leak across clinics). Admins see everything.
    """
    flag = db.query(WearableAlertFlag).filter_by(id=flag_id).first()
    if flag is None:
        raise ApiServiceError(
            code="not_found",
            message="Wearable alert flag not found.",
            status_code=404,
        )
    if _is_admin_scope(actor):
        return flag
    flag_clinic = _flag_clinic_id(db, flag)
    if flag_clinic is None or flag_clinic != actor.clinic_id:
        raise ApiServiceError(
            code="not_found",
            message="Wearable alert flag not found.",
            status_code=404,
        )
    return flag


def _flag_status(flag: WearableAlertFlag) -> str:
    """Derive the workbench status with backwards-compatibility.

    The ``workbench_status`` column was added in migration 071. Pre-existing
    rows have it as NULL; the ``dismissed`` boolean is the legacy
    suppression flag. Mapping:

    * ``workbench_status`` set → use it verbatim.
    * legacy ``dismissed=True`` (no workbench rows) → ``resolved`` so the
      legacy dismiss endpoint and the new workbench surface agree on
      "this flag has been actioned".
    * else → ``open``.
    """
    if getattr(flag, "workbench_status", None):
        return flag.workbench_status  # type: ignore[return-value]
    if flag.dismissed:
        return "resolved"
    return "open"


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
    target_type: str = "wearables_workbench",
) -> str:
    """Best-effort audit hook for the ``wearables_workbench`` surface.

    Never raises — audit must not block the UI even when the umbrella
    audit table is unreachable. Mirrors helpers in
    patient_wearables_router / adherence_events_router.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"wearables_workbench-{event}-{actor.actor_id}"
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
            action=f"wearables_workbench.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("wearables_workbench self-audit skipped")
    return event_id


def _scope_query(actor: AuthenticatedActor):
    """Return the base SQLAlchemy query joining flags to patients/users.

    For non-admin clinicians, scopes to ``actor.clinic_id``. Admins /
    supervisors see all rows. Mirrors the existing
    ``/api/v1/wearables/clinic/alerts/summary`` clinic-scoping pattern.
    """
    def _q(db: Session):
        base = db.query(WearableAlertFlag)
        if _is_admin_scope(actor):
            return base
        if not actor.clinic_id:
            # No clinic on the actor — return an empty slice rather than the
            # legacy "all clinicians' patients globally" match-nothing
            # fallback. Same defensive pattern as the existing summary.
            return base.filter(WearableAlertFlag.id.is_(None))
        return (
            base.join(Patient, WearableAlertFlag.patient_id == Patient.id)
            .join(User, User.id == Patient.clinician_id)
            .filter(User.clinic_id == actor.clinic_id)
        )

    return _q


def _serialize_flag(
    db: Session,
    flag: WearableAlertFlag,
    *,
    include_observations: bool = False,
) -> dict:
    patient = db.query(Patient).filter_by(id=flag.patient_id).first()
    patient_label = (
        f"{(patient.first_name or '').strip()} {(patient.last_name or '').strip()}".strip()
        if patient is not None
        else flag.patient_id
    )
    is_demo = _patient_is_demo(db, flag.patient_id)
    payload: dict = {
        "id": flag.id,
        "patient_id": flag.patient_id,
        "patient_name": patient_label or flag.patient_id,
        "course_id": flag.course_id,
        "flag_type": flag.flag_type,
        "severity": flag.severity,
        "detail": flag.detail,
        "metric_snapshot": flag.metric_snapshot,
        "triggered_at": _iso(flag.triggered_at) or "",
        "auto_generated": bool(flag.auto_generated),
        "dismissed": bool(flag.dismissed),
        "status": _flag_status(flag),
        "acknowledged_at": _iso(getattr(flag, "acknowledged_at", None)),
        "acknowledged_by": getattr(flag, "acknowledged_by", None),
        "acknowledge_note": getattr(flag, "acknowledge_note", None),
        "escalated_at": _iso(getattr(flag, "escalated_at", None)),
        "escalated_by": getattr(flag, "escalated_by", None),
        "escalation_note": getattr(flag, "escalation_note", None),
        "escalation_ae_id": getattr(flag, "escalation_ae_id", None),
        "resolved_at": _iso(getattr(flag, "resolved_at", None)),
        "resolved_by": getattr(flag, "resolved_by", None),
        "resolve_note": getattr(flag, "resolve_note", None),
        "is_demo": bool(is_demo),
    }
    if include_observations:
        payload["recent_observations"] = _recent_observations(
            db, flag.patient_id, flag.triggered_at
        )
    return payload


def _recent_observations(
    db: Session,
    patient_id: str,
    around: Optional[datetime],
    *,
    window_hours: int = 24,
    limit: int = 50,
) -> list[dict]:
    """Return a small observation series around the flag trigger time.

    Bounded both by row-count (50) and time window (±24h around the
    trigger) so the detail endpoint stays cheap even when a connector
    has just back-filled a multi-day catch-up sync.
    """
    if around is None:
        return []
    around = _aware(around) or datetime.now(timezone.utc)
    start = around - timedelta(hours=window_hours)
    end = around + timedelta(hours=window_hours)
    q = (
        db.query(WearableObservation)
        .filter(
            WearableObservation.patient_id == patient_id,
            WearableObservation.observed_at >= start,
            WearableObservation.observed_at <= end,
        )
        .order_by(WearableObservation.observed_at.desc())
        .limit(limit)
    )
    rows = q.all()
    return [
        {
            "id": r.id,
            "metric_type": r.metric_type,
            "value": r.value,
            "unit": r.unit,
            "observed_at": _iso(r.observed_at) or "",
            "quality_flag": r.quality_flag,
        }
        for r in rows
    ]


def _resolve_actor_clinician_id(
    db: Session, actor: AuthenticatedActor, fallback_patient_clinician: Optional[str]
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


class WorkbenchFlagOut(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    course_id: Optional[str] = None
    flag_type: str
    severity: str
    detail: Optional[str] = None
    metric_snapshot: Optional[str] = None
    triggered_at: str
    auto_generated: bool = True
    dismissed: bool = False
    status: str = "open"
    acknowledged_at: Optional[str] = None
    acknowledged_by: Optional[str] = None
    acknowledge_note: Optional[str] = None
    escalated_at: Optional[str] = None
    escalated_by: Optional[str] = None
    escalation_note: Optional[str] = None
    escalation_ae_id: Optional[str] = None
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None
    resolve_note: Optional[str] = None
    is_demo: bool = False
    recent_observations: list[dict] = Field(default_factory=list)


class WorkbenchListResponse(BaseModel):
    items: list[WorkbenchFlagOut] = Field(default_factory=list)
    total: int = 0
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(WORKBENCH_DISCLAIMERS))


class WorkbenchSummaryResponse(BaseModel):
    open: int = 0
    acknowledged: int = 0
    escalated: int = 0
    resolved: int = 0
    incidence_7d: int = 0
    is_demo_view: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(WORKBENCH_DISCLAIMERS))


class WorkbenchActionIn(BaseModel):
    note: str = Field(..., min_length=1, max_length=1000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("note cannot be blank")
        return v


class WorkbenchEscalateIn(WorkbenchActionIn):
    # Optional MedDRA-ish hint; the AE Hub will let the clinician finalise.
    body_system: Optional[str] = Field(default=None, max_length=20)


class WorkbenchActionOut(BaseModel):
    accepted: bool = True
    flag_id: str
    status: str
    adverse_event_id: Optional[str] = None


class WorkbenchAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    flag_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class WorkbenchAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/flags", response_model=WorkbenchListResponse)
def list_flags(
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    flag_type: Optional[str] = Query(default=None),
    patient_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None, max_length=32),
    until: Optional[str] = Query(default=None, max_length=32),
    limit: int = Query(default=200, ge=1, le=1000),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkbenchListResponse:
    """List clinic-scoped wearable alert flags for clinician triage."""
    _require_clinician_or_admin(actor)
    q = _scope_query(actor)(db)

    if status:
        s = status.lower().strip()
        if s in WORKBENCH_STATUSES:
            if s == "open":
                # Backwards-compat: legacy rows have NULL workbench_status
                # AND dismissed=False — they belong in the open queue.
                q = q.filter(
                    or_(
                        WearableAlertFlag.workbench_status == "open",
                        (
                            (WearableAlertFlag.workbench_status.is_(None))
                            & (WearableAlertFlag.dismissed.is_(False))
                        ),
                    )
                )
            elif s == "resolved":
                q = q.filter(
                    or_(
                        WearableAlertFlag.workbench_status == "resolved",
                        (
                            (WearableAlertFlag.workbench_status.is_(None))
                            & (WearableAlertFlag.dismissed.is_(True))
                        ),
                    )
                )
            else:
                q = q.filter(WearableAlertFlag.workbench_status == s)
    if severity and severity in _VALID_SEVERITIES:
        q = q.filter(WearableAlertFlag.severity == severity)
    if flag_type:
        q = q.filter(WearableAlertFlag.flag_type == flag_type)
    if patient_id:
        q = q.filter(WearableAlertFlag.patient_id == patient_id)
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            q = q.filter(WearableAlertFlag.triggered_at >= since_dt)
        except ValueError:
            pass
    if until:
        try:
            until_dt = datetime.fromisoformat(until.replace("Z", "+00:00"))
            q = q.filter(WearableAlertFlag.triggered_at <= until_dt)
        except ValueError:
            pass

    rows = q.order_by(WearableAlertFlag.triggered_at.desc()).limit(limit).all()
    items = [WorkbenchFlagOut(**_serialize_flag(db, r)) for r in rows]
    is_demo_view = any(it.is_demo for it in items)

    _audit(
        db,
        actor,
        event="flags_listed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"items={len(items)} status={status or '-'} severity={severity or '-'} "
            f"flag_type={flag_type or '-'} patient_id={patient_id or '-'}"
        ),
        using_demo_data=is_demo_view,
    )

    return WorkbenchListResponse(
        items=items,
        total=len(items),
        is_demo_view=is_demo_view,
    )


@router.get("/flags/summary", response_model=WorkbenchSummaryResponse)
def get_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkbenchSummaryResponse:
    """Top counts: open / acknowledged / escalated / resolved / 7d_incidence."""
    _require_clinician_or_admin(actor)
    rows = _scope_query(actor)(db).all()

    counts = {"open": 0, "acknowledged": 0, "escalated": 0, "resolved": 0}
    for r in rows:
        counts[_flag_status(r)] = counts.get(_flag_status(r), 0) + 1

    # 7d incidence is the count of flags TRIGGERED (not actioned) in the
    # last seven days. This is the number a clinician scans for in their
    # weekly trend review and matches the Adverse Events Hub 7d KPI shape.
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    incidence_7d = sum(
        1
        for r in rows
        if (_aware(r.triggered_at) or datetime.now(timezone.utc)) >= cutoff
    )

    is_demo_view = any(_patient_is_demo(db, r.patient_id) for r in rows)

    _audit(
        db,
        actor,
        event="summary_viewed",
        target_id=actor.clinic_id or actor.actor_id,
        note=(
            f"open={counts['open']} ack={counts['acknowledged']} "
            f"escalated={counts['escalated']} resolved={counts['resolved']} "
            f"incidence_7d={incidence_7d}"
        ),
        using_demo_data=is_demo_view,
    )

    return WorkbenchSummaryResponse(
        open=counts["open"],
        acknowledged=counts["acknowledged"],
        escalated=counts["escalated"],
        resolved=counts["resolved"],
        incidence_7d=incidence_7d,
        is_demo_view=is_demo_view,
    )


@router.post("/audit-events", response_model=WorkbenchAuditEventOut)
def post_audit_event(
    body: WorkbenchAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkbenchAuditEventOut:
    """Page-level audit ingestion for the Wearables Workbench.

    Common events: ``view`` (mount), ``filter_changed``, ``flag_viewed``,
    ``deep_link_followed``, ``demo_banner_shown``, ``export_initiated``.
    Per-flag mutation events (``flag_acknowledged`` / ``flag_escalated`` /
    ``flag_resolved``) are emitted by the dedicated endpoints below — this
    surface only carries the page-level breadcrumbs.
    """
    _require_clinician_or_admin(actor)

    target_id = body.flag_id or actor.clinic_id or actor.actor_id
    is_demo = bool(body.using_demo_data)
    if body.flag_id:
        # Validate the flag belongs in scope so audit ingestion can't be
        # used to ping arbitrary IDs across clinics.
        try:
            flag = _resolve_flag_or_404(db, actor, body.flag_id)
            is_demo = is_demo or _patient_is_demo(db, flag.patient_id)
        except ApiServiceError:
            raise

    note_parts: list[str] = []
    if body.flag_id:
        note_parts.append(f"flag={body.flag_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    event_id = _audit(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=is_demo,
    )
    return WorkbenchAuditEventOut(accepted=True, event_id=event_id)


@router.get("/flags/export.csv")
def export_csv(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of the clinic-scoped triage queue."""
    _require_clinician_or_admin(actor)
    rows = _scope_query(actor)(db).order_by(
        WearableAlertFlag.triggered_at.desc()
    ).limit(5000).all()

    any_demo = any(_patient_is_demo(db, r.patient_id) for r in rows)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "flag_id", "patient_id", "course_id", "flag_type", "severity",
        "status", "triggered_at", "acknowledged_at", "acknowledged_by",
        "escalated_at", "escalated_by", "escalation_ae_id",
        "resolved_at", "resolved_by", "is_demo",
    ])
    for r in rows:
        writer.writerow([
            r.id, r.patient_id, r.course_id or "", r.flag_type, r.severity,
            _flag_status(r),
            _iso(r.triggered_at) or "",
            _iso(getattr(r, "acknowledged_at", None)) or "",
            getattr(r, "acknowledged_by", "") or "",
            _iso(getattr(r, "escalated_at", None)) or "",
            getattr(r, "escalated_by", "") or "",
            getattr(r, "escalation_ae_id", "") or "",
            _iso(getattr(r, "resolved_at", None)) or "",
            getattr(r, "resolved_by", "") or "",
            "1" if _patient_is_demo(db, r.patient_id) else "0",
        ])

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}wearables-workbench-flags.csv"

    _audit(
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
            "X-WearablesWorkbench-Demo": "1" if any_demo else "0",
        },
    )


@router.get("/flags/export.ndjson")
def export_ndjson(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one flag per line, including triage transcript."""
    _require_clinician_or_admin(actor)
    rows = _scope_query(actor)(db).order_by(
        WearableAlertFlag.triggered_at.desc()
    ).limit(5000).all()

    any_demo = any(_patient_is_demo(db, r.patient_id) for r in rows)
    lines: list[str] = []
    for r in rows:
        payload = _serialize_flag(db, r)
        lines.append(json.dumps(payload))

    prefix = "DEMO-" if any_demo else ""
    filename = f"{prefix}wearables-workbench-flags.ndjson"

    _audit(
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
            "X-WearablesWorkbench-Demo": "1" if any_demo else "0",
        },
    )


@router.get("/flags/{flag_id}", response_model=WorkbenchFlagOut)
def get_flag(
    flag_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkbenchFlagOut:
    """Detail with the triage transcript and a small observation context."""
    _require_clinician_or_admin(actor)
    flag = _resolve_flag_or_404(db, actor, flag_id)
    payload = _serialize_flag(db, flag, include_observations=True)
    is_demo = bool(payload.get("is_demo"))

    _audit(
        db,
        actor,
        event="flag_viewed",
        target_id=flag.id,
        note=f"patient={flag.patient_id} severity={flag.severity}",
        using_demo_data=is_demo,
    )
    return WorkbenchFlagOut(**payload)


@router.post(
    "/flags/{flag_id}/acknowledge", response_model=WorkbenchActionOut
)
def acknowledge_flag(
    body: WorkbenchActionIn,
    flag_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkbenchActionOut:
    """Move a flag from ``open`` → ``acknowledged``. Note required.

    Resolved flags are immutable (409). Acknowledging an already-
    acknowledged flag is idempotent on the status but still emits a
    fresh audit row so the regulator sees the second clinician's note.
    """
    _require_clinician_or_admin(actor)
    flag = _resolve_flag_or_404(db, actor, flag_id)

    current = _flag_status(flag)
    if current == "resolved":
        raise ApiServiceError(
            code="flag_resolved",
            message="Resolved flags are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    flag.workbench_status = "acknowledged"
    flag.acknowledged_at = now
    flag.acknowledged_by = actor.actor_id
    flag.acknowledge_note = body.note
    flag.reviewed_at = now
    flag.reviewed_by = actor.actor_id
    db.commit()

    is_demo = _patient_is_demo(db, flag.patient_id)
    _audit(
        db,
        actor,
        event="flag_acknowledged",
        target_id=flag.id,
        note=f"patient={flag.patient_id}; note={body.note[:200]}",
        using_demo_data=is_demo,
    )
    return WorkbenchActionOut(
        accepted=True,
        flag_id=flag.id,
        status="acknowledged",
    )


@router.post(
    "/flags/{flag_id}/escalate", response_model=WorkbenchActionOut
)
def escalate_flag(
    body: WorkbenchEscalateIn,
    flag_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkbenchActionOut:
    """Move a flag → ``escalated`` and create an AdverseEvent draft.

    Note required. Resolved flags are immutable (409). Escalation creates
    an :class:`AdverseEvent` draft with ``event_type='wearable_anomaly'``
    so the regulatory chain stays intact end-to-end and the new draft
    surfaces in the AE Hub triage queue at HIGH priority for the same
    clinic.
    """
    _require_clinician_or_admin(actor)
    flag = _resolve_flag_or_404(db, actor, flag_id)

    current = _flag_status(flag)
    if current == "resolved":
        raise ApiServiceError(
            code="flag_resolved",
            message="Resolved flags are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)

    patient = db.query(Patient).filter_by(id=flag.patient_id).first()
    fallback_clinician = patient.clinician_id if patient is not None else None
    is_demo = _patient_is_demo(db, flag.patient_id)

    ae = AdverseEvent(
        id=str(uuid.uuid4()),
        patient_id=flag.patient_id,
        course_id=flag.course_id,
        session_id=None,
        clinician_id=_resolve_actor_clinician_id(db, actor, fallback_clinician),
        event_type="wearable_anomaly",
        severity=(
            "severe" if flag.severity == "urgent"
            else "moderate" if flag.severity == "warning"
            else "mild"
        ),
        description=(
            f"Wearable triage escalation: flag={flag.id} "
            f"flag_type={flag.flag_type} severity={flag.severity}. "
            f"Triggered_at={_iso(flag.triggered_at)}. "
            f"Clinician note: {body.note[:480]}"
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
        is_serious=flag.severity == "urgent",
        sae_criteria=None,
        reportable=False,
        relatedness="unknown",
        is_demo=bool(is_demo),
    )
    db.add(ae)

    flag.workbench_status = "escalated"
    flag.escalated_at = now
    flag.escalated_by = actor.actor_id
    flag.escalation_note = body.note
    flag.escalation_ae_id = ae.id
    if not flag.acknowledged_at:
        # Escalation implies acknowledgement.
        flag.acknowledged_at = now
        flag.acknowledged_by = actor.actor_id
        flag.acknowledge_note = (
            flag.acknowledge_note or "auto-ack on escalation"
        )
    flag.reviewed_at = now
    flag.reviewed_by = actor.actor_id
    db.commit()

    # HIGH-priority audit row pinned to the clinic so the AE Hub feed and
    # the triage feed both surface the escalation. Mirror of the
    # adherence-events HIGH-priority pattern.
    _audit(
        db,
        actor,
        event="flag_escalated",
        target_id=flag.id,
        note=(
            f"priority=high; patient={flag.patient_id}; "
            f"ae_id={ae.id}; severity={flag.severity}; "
            f"note={body.note[:200]}"
        ),
        using_demo_data=is_demo,
    )

    return WorkbenchActionOut(
        accepted=True,
        flag_id=flag.id,
        status="escalated",
        adverse_event_id=ae.id,
    )


@router.post("/flags/{flag_id}/resolve", response_model=WorkbenchActionOut)
def resolve_flag(
    body: WorkbenchActionIn,
    flag_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WorkbenchActionOut:
    """Move a flag → ``resolved``. Note required. Immutable thereafter."""
    _require_clinician_or_admin(actor)
    flag = _resolve_flag_or_404(db, actor, flag_id)

    current = _flag_status(flag)
    if current == "resolved":
        raise ApiServiceError(
            code="flag_resolved",
            message="Resolved flags are immutable.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    flag.workbench_status = "resolved"
    flag.resolved_at = now
    flag.resolved_by = actor.actor_id
    flag.resolve_note = body.note
    # Flip the legacy dismissed flag too so the older clinician dashboard
    # widget stops surfacing this row in its KPI bar.
    flag.dismissed = True
    flag.reviewed_at = now
    flag.reviewed_by = actor.actor_id
    db.commit()

    is_demo = _patient_is_demo(db, flag.patient_id)
    _audit(
        db,
        actor,
        event="flag_resolved",
        target_id=flag.id,
        note=f"patient={flag.patient_id}; note={body.note[:200]}",
        using_demo_data=is_demo,
    )
    return WorkbenchActionOut(
        accepted=True,
        flag_id=flag.id,
        status="resolved",
    )
