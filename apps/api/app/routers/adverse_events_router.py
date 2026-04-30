"""Adverse events router.

Endpoints
---------
POST   /api/v1/adverse-events                 Report a new adverse event
GET    /api/v1/adverse-events                 List adverse events (filters)
GET    /api/v1/adverse-events/summary         Roll-up counts (clinic / patient)
GET    /api/v1/adverse-events/export.csv      CSV export, filter-aware
GET    /api/v1/adverse-events/{id}            Get event detail
GET    /api/v1/adverse-events/{id}/export.cioms
                                              CIOMS form stub (honest no-op)
PATCH  /api/v1/adverse-events/{id}            Update classification fields
PATCH  /api/v1/adverse-events/{id}/resolve    Mark resolved (legacy)
POST   /api/v1/adverse-events/{id}/review     Clinician review + sign-off
POST   /api/v1/adverse-events/{id}/escalate   Mark for IRB / regulator

Severity & SAE classification
-----------------------------
SAE auto-flag derived on create / patch when ANY of:

  - severity == "serious"
  - sae_criteria contains: death, hospitalization, life_threatening,
    persistent_disability, congenital_anomaly, important_medical_event

Reportable to regulator is auto-derived when:

  is_serious AND expectedness == "unexpected" AND
  relatedness in ("possible","probable","definite")

The clinician can override via PATCH and the change is audit-logged.

Audit trail
-----------
Create / review / escalate / classification changes write through
``app.repositories.audit.create_audit_event`` so they appear in
``/api/v1/audit-trail``.
"""
from __future__ import annotations

import csv
import io
import logging as _logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import AdverseEvent, ClinicalSession, TreatmentCourse
from app.repositories.patients import resolve_patient_clinic_id


_ae_log = _logging.getLogger(__name__)


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str | None, db: Session) -> None:
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _trigger_ae_risk_recompute(patient_id: str, actor_id: str | None, db_sess: Session) -> None:
    """Fire risk recompute for all categories after adverse event."""
    try:
        from app.services.risk_stratification import compute_risk_profile

        compute_risk_profile(patient_id, db_sess, clinician_id=actor_id)
    except Exception:
        _ae_log.debug("Risk recompute skipped after AE creation", exc_info=True)


def _audit(db: Session, actor: AuthenticatedActor, *, event: str, target_id: str, note: str) -> None:
    """Best-effort audit-trail write. Must never raise back at the caller."""
    try:
        from app.repositories.audit import create_audit_event

        now = datetime.now(timezone.utc)
        event_id = (
            f"adverse_events-{event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="adverse_events",
            action=f"adverse_events.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block the API
        _ae_log.debug("Adverse-event audit write skipped", exc_info=True)


router = APIRouter(prefix="/api/v1/adverse-events", tags=["Adverse Events"])


# ── Classification helpers ──────────────────────────────────────────────────

# MedDRA SOC subset surfaced to the UI. The clinician confirms — never AI.
ALLOWED_BODY_SYSTEMS = {
    "nervous", "psychiatric", "cardiac", "gi", "skin", "general", "other",
}

ALLOWED_EXPECTEDNESS = {"expected", "unexpected", "unknown"}
ALLOWED_RELATEDNESS = {
    "not_related", "unlikely", "possible", "probable", "definite", "unknown",
}
ALLOWED_ESCALATION_TARGETS = {"irb", "fda", "mhra", "ema", "internal_qa", "other"}

# Free-text auto-suggest from event_type / description tokens to a body system.
# UI must require clinician confirmation — this is only a hint.
_BODY_SYSTEM_HINTS = {
    "nervous": (
        "headache", "migraine", "seizure", "syncope", "dizz", "lighthead",
        "tingl", "paresth", "vertigo",
    ),
    "psychiatric": (
        "anxiety", "panic", "depress", "mood", "agitation", "hallucin",
        "suicid", "insomnia", "irritab",
    ),
    "cardiac": ("palpit", "chest pain", "tachycard", "bradycard", "arrhyt", "syncope"),
    "gi": ("nausea", "vomit", "diarrh", "abdominal", "stomach", "appetite"),
    "skin": ("rash", "scalp", "burn", "itch", "redness", "dermat", "blister"),
    "general": ("fatigue", "fever", "malaise", "weakness", "weight"),
}


def suggest_body_system(event_type: str, description: str | None) -> Optional[str]:
    """Suggest a body-system label from free text. Returns ``None`` when no
    confident match; the UI prompts the clinician to confirm in either case.

    AI / heuristic suggestion is allowed for body system per the launch-audit
    spec — but is **not** allowed for severity or expectedness.
    """
    blob = " ".join(s for s in (event_type or "", description or "") if s).lower()
    if not blob.strip():
        return None
    for system, hints in _BODY_SYSTEM_HINTS.items():
        for hint in hints:
            if hint in blob:
                return system
    return None


# Common SAE qualifiers per ICH E2A. ``severity == "serious"`` is the canonical
# source-of-truth flag, but free-text criteria let clinicians declare specific
# regulatory qualifiers (e.g. hospitalization).
SAE_QUALIFIERS = {
    "death",
    "life_threatening",
    "hospitalization",
    "persistent_disability",
    "congenital_anomaly",
    "important_medical_event",
}


def derive_is_serious(severity: str | None, sae_criteria: str | None) -> tuple[bool, str | None]:
    """Return (is_serious, normalized_sae_criteria_csv).

    The SAE flag is positive iff severity is "serious" OR the clinician has
    annotated one of the SAE qualifier strings on the record.
    """
    sev_serious = (severity or "").lower() == "serious"
    raw = (sae_criteria or "").lower().replace(";", ",")
    tokens = [t.strip() for t in raw.split(",") if t.strip()]
    matched = sorted({t for t in tokens if t in SAE_QUALIFIERS})
    is_serious = sev_serious or bool(matched)
    return is_serious, ",".join(matched) if matched else None


def derive_reportable(is_serious: bool, expectedness: str | None, relatedness: str | None) -> bool:
    """Reportable to a regulator (FDA / MHRA / IRB) is positive iff:

    SAE  ∧  expectedness == "unexpected"  ∧  relatedness ∈ {possible, probable, definite}
    """
    if not is_serious:
        return False
    if (expectedness or "").lower() != "unexpected":
        return False
    return (relatedness or "").lower() in ("possible", "probable", "definite")


# ── Schemas ────────────────────────────────────────────────────────────────

class AdverseEventCreate(BaseModel):
    patient_id: str
    course_id: Optional[str] = None
    session_id: Optional[str] = None
    event_type: str
    severity: Literal["mild", "moderate", "severe", "serious"]

    @field_validator("severity", mode="before")
    @classmethod
    def _normalize_severity(cls, v: object) -> object:
        return v.strip().lower() if isinstance(v, str) else v

    description: Optional[str] = None
    onset_timing: Optional[str] = None
    resolution: Optional[str] = None
    action_taken: Optional[str] = None
    reported_at: Optional[str] = None

    # Classification — all optional on create, can be PATCHed later.
    body_system: Optional[str] = None
    expectedness: Optional[str] = None
    relatedness: Optional[str] = None
    sae_criteria: Optional[str] = None
    meddra_pt: Optional[str] = None
    meddra_soc: Optional[str] = None
    is_demo: Optional[bool] = False


class AdverseEventPatch(BaseModel):
    body_system: Optional[str] = None
    expectedness: Optional[str] = None
    relatedness: Optional[str] = None
    sae_criteria: Optional[str] = None
    severity: Optional[Literal["mild", "moderate", "severe", "serious"]] = None
    description: Optional[str] = None
    action_taken: Optional[str] = None
    onset_timing: Optional[str] = None
    meddra_pt: Optional[str] = None
    meddra_soc: Optional[str] = None


class AdverseEventReview(BaseModel):
    note: Optional[str] = None
    sign_off: bool = False


class AdverseEventEscalate(BaseModel):
    target: str
    note: Optional[str] = None


class AdverseEventResolve(BaseModel):
    resolution: Optional[str] = "resolved"


class AdverseEventOut(BaseModel):
    id: str
    patient_id: str
    course_id: Optional[str]
    session_id: Optional[str]
    clinician_id: str
    event_type: str
    severity: str
    description: Optional[str]
    onset_timing: Optional[str]
    resolution: Optional[str]
    action_taken: Optional[str]
    reported_at: str
    resolved_at: Optional[str]
    created_at: str
    body_system: Optional[str] = None
    expectedness: Optional[str] = None
    expectedness_source: Optional[str] = None
    is_serious: bool = False
    sae_criteria: Optional[str] = None
    reportable: bool = False
    relatedness: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    signed_at: Optional[str] = None
    signed_by: Optional[str] = None
    escalated_at: Optional[str] = None
    escalated_by: Optional[str] = None
    escalation_target: Optional[str] = None
    escalation_note: Optional[str] = None
    meddra_pt: Optional[str] = None
    meddra_soc: Optional[str] = None
    is_demo: bool = False
    status: str = "open"  # derived: open | reviewed | resolved | escalated

    @classmethod
    def from_record(cls, r: AdverseEvent) -> "AdverseEventOut":
        def _dt(v: Any) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)

        # Derived status surface for UI tiles. The DB carries the underlying
        # timestamps as the source of truth; this is convenience only.
        if getattr(r, "resolved_at", None):
            status = "resolved"
        elif getattr(r, "escalated_at", None):
            status = "escalated"
        elif getattr(r, "reviewed_at", None):
            status = "reviewed"
        else:
            status = "open"

        return cls(
            id=r.id,
            patient_id=r.patient_id,
            course_id=r.course_id,
            session_id=r.session_id,
            clinician_id=r.clinician_id,
            event_type=r.event_type,
            severity=r.severity,
            description=r.description,
            onset_timing=r.onset_timing,
            resolution=r.resolution,
            action_taken=r.action_taken,
            reported_at=_dt(r.reported_at) or "",
            resolved_at=_dt(r.resolved_at),
            created_at=_dt(r.created_at) or "",
            body_system=getattr(r, "body_system", None),
            expectedness=getattr(r, "expectedness", None),
            expectedness_source=getattr(r, "expectedness_source", None),
            is_serious=bool(getattr(r, "is_serious", False)),
            sae_criteria=getattr(r, "sae_criteria", None),
            reportable=bool(getattr(r, "reportable", False)),
            relatedness=getattr(r, "relatedness", None),
            reviewed_at=_dt(getattr(r, "reviewed_at", None)),
            reviewed_by=getattr(r, "reviewed_by", None),
            signed_at=_dt(getattr(r, "signed_at", None)),
            signed_by=getattr(r, "signed_by", None),
            escalated_at=_dt(getattr(r, "escalated_at", None)),
            escalated_by=getattr(r, "escalated_by", None),
            escalation_target=getattr(r, "escalation_target", None),
            escalation_note=getattr(r, "escalation_note", None),
            meddra_pt=getattr(r, "meddra_pt", None),
            meddra_soc=getattr(r, "meddra_soc", None),
            is_demo=bool(getattr(r, "is_demo", False)),
            status=status,
        )


class AdverseEventListResponse(BaseModel):
    items: list[AdverseEventOut]
    total: int


class AdverseEventSummary(BaseModel):
    total: int
    open: int
    reviewed: int
    resolved: int
    escalated: int
    sae: int
    reportable: int
    awaiting_review: int
    by_severity: dict[str, int]
    by_body_system: dict[str, int]


# ── Filter/query helpers ────────────────────────────────────────────────────

def _scope_query(actor: AuthenticatedActor, db: Session):
    """Apply the role-based scope. Admins see everything; clinicians only see
    their own clinician_id rows. Mirrors the existing list endpoint behaviour."""
    q = db.query(AdverseEvent)
    if actor.role != "admin":
        q = q.filter(AdverseEvent.clinician_id == actor.actor_id)
    return q


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.rstrip("Z"))
    except ValueError:
        return None


# ── POST /  Report ──────────────────────────────────────────────────────────

@router.post("", response_model=AdverseEventOut, status_code=201)
@limiter.limit("30/minute")
def report_adverse_event(
    request: Request,
    body: AdverseEventCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, body.patient_id, db)

    # FK-stuffing guard.
    if body.course_id:
        course = db.query(TreatmentCourse).filter_by(id=body.course_id).first()
        if course is None or course.patient_id != body.patient_id:
            raise ApiServiceError(
                code="invalid_course",
                message="course_id does not match the supplied patient_id.",
                status_code=422,
            )
    if body.session_id:
        sess = db.query(ClinicalSession).filter_by(id=body.session_id).first()
        if sess is None or sess.patient_id != body.patient_id:
            raise ApiServiceError(
                code="invalid_session",
                message="session_id does not match the supplied patient_id.",
                status_code=422,
            )

    severity = body.severity

    # Validate / normalise classification inputs (clinician-supplied).
    body_system = (body.body_system or "").lower().strip() or None
    if body_system and body_system not in ALLOWED_BODY_SYSTEMS:
        raise ApiServiceError(
            code="invalid_body_system",
            message=f"body_system must be one of {sorted(ALLOWED_BODY_SYSTEMS)}",
            status_code=422,
        )
    expectedness = (body.expectedness or "").lower().strip() or None
    if expectedness and expectedness not in ALLOWED_EXPECTEDNESS:
        raise ApiServiceError(
            code="invalid_expectedness",
            message=f"expectedness must be one of {sorted(ALLOWED_EXPECTEDNESS)}",
            status_code=422,
        )
    relatedness = (body.relatedness or "").lower().strip() or None
    if relatedness and relatedness not in ALLOWED_RELATEDNESS:
        raise ApiServiceError(
            code="invalid_relatedness",
            message=f"relatedness must be one of {sorted(ALLOWED_RELATEDNESS)}",
            status_code=422,
        )

    # SAE / reportable derivation.
    is_serious, sae_norm = derive_is_serious(severity, body.sae_criteria)
    reportable = derive_reportable(is_serious, expectedness, relatedness)

    reported_at = datetime.now(timezone.utc)
    if body.reported_at:
        parsed = _parse_iso(body.reported_at)
        if parsed is not None:
            reported_at = parsed

    event = AdverseEvent(
        patient_id=body.patient_id,
        course_id=body.course_id,
        session_id=body.session_id,
        clinician_id=actor.actor_id,
        event_type=body.event_type.strip(),
        severity=severity,
        description=body.description,
        onset_timing=body.onset_timing,
        resolution=body.resolution,
        action_taken=body.action_taken,
        reported_at=reported_at,
        body_system=body_system,
        expectedness=expectedness,
        expectedness_source="clinician" if expectedness else None,
        relatedness=relatedness,
        is_serious=is_serious,
        sae_criteria=sae_norm,
        reportable=reportable,
        meddra_pt=body.meddra_pt,
        meddra_soc=body.meddra_soc,
        is_demo=bool(body.is_demo),
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    _trigger_ae_risk_recompute(body.patient_id, actor.actor_id, db)
    _audit(
        db,
        actor,
        event="created",
        target_id=event.id,
        note=(
            f"sev={severity} sae={is_serious} reportable={reportable} "
            f"patient={body.patient_id} body_system={body_system or '-'}"
        ),
    )

    return AdverseEventOut.from_record(event)


# ── GET /summary ────────────────────────────────────────────────────────────

@router.get("/summary", response_model=AdverseEventSummary)
def adverse_events_summary(
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventSummary:
    """Counts roll-up for the AE Hub KPI tiles.

    Always returns real counts derived from the underlying rows — the UI must
    never fall back to fabricated numbers.
    """
    require_minimum_role(actor, "clinician")
    q = _scope_query(actor, db)
    if patient_id:
        q = q.filter(AdverseEvent.patient_id == patient_id)
    if course_id:
        q = q.filter(AdverseEvent.course_id == course_id)

    rows = q.all()
    total = len(rows)
    open_n = sum(1 for r in rows if r.resolved_at is None and getattr(r, "escalated_at", None) is None)
    reviewed_n = sum(1 for r in rows if getattr(r, "reviewed_at", None) is not None)
    resolved_n = sum(1 for r in rows if r.resolved_at is not None)
    escalated_n = sum(1 for r in rows if getattr(r, "escalated_at", None) is not None)
    sae_n = sum(1 for r in rows if getattr(r, "is_serious", False))
    reportable_n = sum(1 for r in rows if getattr(r, "reportable", False))
    awaiting_review_n = sum(
        1
        for r in rows
        if getattr(r, "reviewed_at", None) is None and r.resolved_at is None
    )

    by_severity: dict[str, int] = {}
    by_body_system: dict[str, int] = {}
    for r in rows:
        sev = (r.severity or "unknown").lower()
        by_severity[sev] = by_severity.get(sev, 0) + 1
        bs = (getattr(r, "body_system", None) or "unspecified").lower()
        by_body_system[bs] = by_body_system.get(bs, 0) + 1

    return AdverseEventSummary(
        total=total,
        open=open_n,
        reviewed=reviewed_n,
        resolved=resolved_n,
        escalated=escalated_n,
        sae=sae_n,
        reportable=reportable_n,
        awaiting_review=awaiting_review_n,
        by_severity=by_severity,
        by_body_system=by_body_system,
    )


# ── GET /export.csv ─────────────────────────────────────────────────────────

CSV_COLUMNS = [
    "id", "reported_at", "patient_id", "course_id", "session_id", "clinician_id",
    "event_type", "severity", "is_serious", "sae_criteria", "expectedness",
    "relatedness", "reportable", "body_system", "meddra_pt", "meddra_soc",
    "onset_timing", "action_taken", "description", "resolution", "resolved_at",
    "reviewed_at", "reviewed_by", "signed_at", "signed_by",
    "escalated_at", "escalated_by", "escalation_target", "is_demo", "created_at",
]


@router.get("/export.csv")
def export_adverse_events_csv(
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    body_system: Optional[str] = Query(default=None),
    sae: Optional[bool] = Query(default=None),
    reportable: Optional[bool] = Query(default=None),
    expected: Optional[str] = Query(default=None),  # expected | unexpected | unknown
    status: Optional[str] = Query(default=None),    # open | reviewed | resolved | escalated
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """Filter-aware CSV export. Every visible filter on the AE Hub must be
    honoured here — the export is the audit / regulator artifact."""
    require_minimum_role(actor, "clinician")
    q = _apply_filters(
        _scope_query(actor, db),
        patient_id=patient_id,
        course_id=course_id,
        severity=severity,
        body_system=body_system,
        sae=sae,
        reportable=reportable,
        expected=expected,
        status_filter=status,
        since=since,
        until=until,
    )
    rows = q.order_by(AdverseEvent.reported_at.desc()).limit(10_000).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        writer.writerow(
            [
                r.id,
                _csv_dt(r.reported_at),
                r.patient_id,
                r.course_id or "",
                r.session_id or "",
                r.clinician_id,
                r.event_type,
                r.severity,
                int(bool(getattr(r, "is_serious", False))),
                getattr(r, "sae_criteria", "") or "",
                getattr(r, "expectedness", "") or "",
                getattr(r, "relatedness", "") or "",
                int(bool(getattr(r, "reportable", False))),
                getattr(r, "body_system", "") or "",
                getattr(r, "meddra_pt", "") or "",
                getattr(r, "meddra_soc", "") or "",
                r.onset_timing or "",
                r.action_taken or "",
                (r.description or "").replace("\n", " ").replace("\r", " "),
                r.resolution or "",
                _csv_dt(r.resolved_at),
                _csv_dt(getattr(r, "reviewed_at", None)),
                getattr(r, "reviewed_by", "") or "",
                _csv_dt(getattr(r, "signed_at", None)),
                getattr(r, "signed_by", "") or "",
                _csv_dt(getattr(r, "escalated_at", None)),
                getattr(r, "escalated_by", "") or "",
                getattr(r, "escalation_target", "") or "",
                int(bool(getattr(r, "is_demo", False))),
                _csv_dt(r.created_at),
            ]
        )

    _audit(
        db,
        actor,
        event="export_csv",
        target_id=patient_id or course_id or actor.actor_id,
        note=f"rows={len(rows)} filters={severity or '-'},{body_system or '-'},{status or '-'}",
    )

    csv_text = buf.getvalue()
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=adverse_events.csv",
            "Cache-Control": "no-store",
        },
    )


def _csv_dt(v: Any) -> str:
    if v is None:
        return ""
    return v.isoformat() if isinstance(v, datetime) else str(v)


def _apply_filters(
    q,
    *,
    patient_id: str | None,
    course_id: str | None,
    severity: str | None,
    body_system: str | None,
    sae: bool | None,
    reportable: bool | None,
    expected: str | None,
    status_filter: str | None,
    since: str | None,
    until: str | None,
):
    if patient_id:
        q = q.filter(AdverseEvent.patient_id == patient_id)
    if course_id:
        q = q.filter(AdverseEvent.course_id == course_id)
    if severity:
        q = q.filter(AdverseEvent.severity == severity.lower())
    if body_system:
        q = q.filter(AdverseEvent.body_system == body_system.lower())
    if sae is True:
        q = q.filter(AdverseEvent.is_serious.is_(True))
    elif sae is False:
        q = q.filter(AdverseEvent.is_serious.is_(False))
    if reportable is True:
        q = q.filter(AdverseEvent.reportable.is_(True))
    elif reportable is False:
        q = q.filter(AdverseEvent.reportable.is_(False))
    if expected:
        q = q.filter(AdverseEvent.expectedness == expected.lower())
    if status_filter == "open":
        q = q.filter(AdverseEvent.resolved_at.is_(None))
        q = q.filter(AdverseEvent.escalated_at.is_(None))
        q = q.filter(AdverseEvent.reviewed_at.is_(None))
    elif status_filter == "reviewed":
        q = q.filter(AdverseEvent.reviewed_at.is_not(None))
        q = q.filter(AdverseEvent.resolved_at.is_(None))
    elif status_filter == "resolved":
        q = q.filter(AdverseEvent.resolved_at.is_not(None))
    elif status_filter == "escalated":
        q = q.filter(AdverseEvent.escalated_at.is_not(None))

    since_dt = _parse_iso(since)
    until_dt = _parse_iso(until)
    if since_dt:
        q = q.filter(AdverseEvent.reported_at >= since_dt)
    if until_dt:
        # inclusive end — bump by 1 day if user passed a bare date.
        if until and "T" not in until:
            until_dt = until_dt + timedelta(days=1)
        q = q.filter(AdverseEvent.reported_at < until_dt)
    return q


# ── GET / List ──────────────────────────────────────────────────────────────

@router.get("", response_model=AdverseEventListResponse)
def list_adverse_events(
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    body_system: Optional[str] = Query(default=None),
    sae: Optional[bool] = Query(default=None),
    reportable: Optional[bool] = Query(default=None),
    expected: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventListResponse:
    require_minimum_role(actor, "clinician")
    q = _apply_filters(
        _scope_query(actor, db),
        patient_id=patient_id,
        course_id=course_id,
        severity=severity,
        body_system=body_system,
        sae=sae,
        reportable=reportable,
        expected=expected,
        status_filter=status,
        since=since,
        until=until,
    )
    records = q.order_by(AdverseEvent.reported_at.desc()).limit(limit).all()
    items = [AdverseEventOut.from_record(r) for r in records]
    return AdverseEventListResponse(items=items, total=len(items))


# ── GET /{id} ───────────────────────────────────────────────────────────────

def _load_event_or_404(event_id: str, actor: AuthenticatedActor, db: Session) -> AdverseEvent:
    event = db.query(AdverseEvent).filter_by(id=event_id).first()
    if event is None:
        raise ApiServiceError(code="not_found", message="Adverse event not found.", status_code=404)
    if actor.role != "admin" and event.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Adverse event not found.", status_code=404)
    return event


@router.get("/{event_id}", response_model=AdverseEventOut)
def get_adverse_event(
    event_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    require_minimum_role(actor, "clinician")
    event = _load_event_or_404(event_id, actor, db)
    return AdverseEventOut.from_record(event)


# ── GET /{id}/export.cioms ──────────────────────────────────────────────────

@router.get("/{event_id}/export.cioms")
def export_cioms(
    event_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CIOMS form export stub.

    A real CIOMS-I PDF requires the clinic's regulator-registered template
    (sponsor, site code, etc.) — which is not configured in this
    deployment. Rather than fake a document, this endpoint returns a
    machine-readable JSON payload that downstream regulator-export tooling
    can pick up, with an explicit ``configured`` flag and the underlying AE
    record. The UI surfaces the honest "CIOMS export not configured" state.
    """
    require_minimum_role(actor, "clinician")
    event = _load_event_or_404(event_id, actor, db)
    _audit(
        db,
        actor,
        event="export_cioms",
        target_id=event.id,
        note=f"sae={getattr(event, 'is_serious', False)} reportable={getattr(event, 'reportable', False)}",
    )

    body = {
        "configured": False,
        "form_format": "CIOMS-I",
        "message": (
            "CIOMS export is not configured for this deployment. The JSON "
            "payload below contains the underlying adverse-event fields. "
            "A clinic-specific CIOMS template (sponsor / site code / "
            "regulator endpoint) is required before this becomes a "
            "submission-ready PDF."
        ),
        "event": AdverseEventOut.from_record(event).model_dump(),
    }
    import json

    return Response(
        content=json.dumps(body, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=ae-{event.id}-cioms-stub.json",
            "X-CIOMS-Configured": "false",
        },
    )


# ── PATCH /{id} ─────────────────────────────────────────────────────────────

@router.patch("/{event_id}", response_model=AdverseEventOut)
def patch_adverse_event(
    event_id: str,
    body: AdverseEventPatch,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    """Partial update for classification / clinician overrides.

    Re-derives ``is_serious`` and ``reportable`` whenever any contributing
    field changes, so the regulator-reportable flag never drifts from the
    underlying inputs. Audit-logs every change.
    """
    require_minimum_role(actor, "clinician")
    event = _load_event_or_404(event_id, actor, db)

    changed: list[str] = []

    if body.body_system is not None:
        new_bs = body.body_system.lower().strip() or None
        if new_bs and new_bs not in ALLOWED_BODY_SYSTEMS:
            raise ApiServiceError(
                code="invalid_body_system",
                message=f"body_system must be one of {sorted(ALLOWED_BODY_SYSTEMS)}",
                status_code=422,
            )
        if event.body_system != new_bs:
            event.body_system = new_bs
            changed.append(f"body_system={new_bs}")

    if body.expectedness is not None:
        new_exp = body.expectedness.lower().strip() or None
        if new_exp and new_exp not in ALLOWED_EXPECTEDNESS:
            raise ApiServiceError(
                code="invalid_expectedness",
                message=f"expectedness must be one of {sorted(ALLOWED_EXPECTEDNESS)}",
                status_code=422,
            )
        if event.expectedness != new_exp:
            event.expectedness = new_exp
            event.expectedness_source = "clinician" if new_exp else None
            changed.append(f"expectedness={new_exp}")

    if body.relatedness is not None:
        new_rel = body.relatedness.lower().strip() or None
        if new_rel and new_rel not in ALLOWED_RELATEDNESS:
            raise ApiServiceError(
                code="invalid_relatedness",
                message=f"relatedness must be one of {sorted(ALLOWED_RELATEDNESS)}",
                status_code=422,
            )
        if event.relatedness != new_rel:
            event.relatedness = new_rel
            changed.append(f"relatedness={new_rel}")

    if body.severity is not None and event.severity != body.severity:
        event.severity = body.severity
        changed.append(f"severity={body.severity}")

    if body.sae_criteria is not None:
        # Allow clinician to set qualifier strings.
        event.sae_criteria = body.sae_criteria.lower().strip() or None
        changed.append("sae_criteria")

    if body.description is not None:
        event.description = body.description
        changed.append("description")
    if body.action_taken is not None:
        event.action_taken = body.action_taken
        changed.append("action_taken")
    if body.onset_timing is not None:
        event.onset_timing = body.onset_timing
        changed.append("onset_timing")
    if body.meddra_pt is not None:
        event.meddra_pt = body.meddra_pt
        changed.append("meddra_pt")
    if body.meddra_soc is not None:
        event.meddra_soc = body.meddra_soc
        changed.append("meddra_soc")

    # Always recompute the derived flags after any patch.
    is_serious, sae_norm = derive_is_serious(event.severity, event.sae_criteria)
    event.is_serious = is_serious
    event.sae_criteria = sae_norm
    event.reportable = derive_reportable(is_serious, event.expectedness, event.relatedness)

    db.commit()
    db.refresh(event)

    if changed:
        _audit(
            db,
            actor,
            event="patched",
            target_id=event.id,
            note="; ".join(changed)[:1000],
        )

    return AdverseEventOut.from_record(event)


# ── PATCH /{id}/resolve ─────────────────────────────────────────────────────

@router.patch("/{event_id}/resolve", response_model=AdverseEventOut)
def resolve_adverse_event(
    event_id: str,
    body: AdverseEventResolve = AdverseEventResolve(),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    """Mark an adverse event as resolved by setting resolved_at."""
    require_minimum_role(actor, "clinician")
    event = _load_event_or_404(event_id, actor, db)
    event.resolved_at = datetime.now(timezone.utc)
    event.resolution = body.resolution or "resolved"
    db.commit()
    db.refresh(event)
    _audit(db, actor, event="resolved", target_id=event.id, note=event.resolution or "resolved")
    return AdverseEventOut.from_record(event)


# ── POST /{id}/review ───────────────────────────────────────────────────────

@router.post("/{event_id}/review", response_model=AdverseEventOut)
def review_adverse_event(
    event_id: str,
    body: AdverseEventReview = AdverseEventReview(),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    """Clinician review.

    Sets ``reviewed_at`` / ``reviewed_by``. If ``sign_off`` is true, also
    sets ``signed_at`` / ``signed_by`` — sign-off is a separate audited
    event so a junior clinician can review while a senior signs.
    """
    require_minimum_role(actor, "clinician")
    event = _load_event_or_404(event_id, actor, db)

    now = datetime.now(timezone.utc)
    event.reviewed_at = now
    event.reviewed_by = actor.actor_id
    notes = ["reviewed"]
    if body.sign_off:
        event.signed_at = now
        event.signed_by = actor.actor_id
        notes.append("signed_off")
    if body.note:
        notes.append(body.note[:200])
    db.commit()
    db.refresh(event)
    _audit(db, actor, event="reviewed", target_id=event.id, note="; ".join(notes))
    return AdverseEventOut.from_record(event)


# ── POST /{id}/escalate ─────────────────────────────────────────────────────

@router.post("/{event_id}/escalate", response_model=AdverseEventOut)
def escalate_adverse_event(
    event_id: str,
    body: AdverseEventEscalate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    """Mark an AE for regulator / IRB escalation.

    This does NOT submit to a regulator — that requires an integration
    contract that does not exist in this deployment. It records the
    intent + audit trail so a downstream submission tool can pick up the
    flagged events.
    """
    require_minimum_role(actor, "clinician")
    event = _load_event_or_404(event_id, actor, db)

    target = (body.target or "").lower().strip()
    if target not in ALLOWED_ESCALATION_TARGETS:
        raise ApiServiceError(
            code="invalid_escalation_target",
            message=f"target must be one of {sorted(ALLOWED_ESCALATION_TARGETS)}",
            status_code=422,
        )
    now = datetime.now(timezone.utc)
    event.escalated_at = now
    event.escalated_by = actor.actor_id
    event.escalation_target = target
    if body.note:
        event.escalation_note = body.note[:1000]
    db.commit()
    db.refresh(event)
    _audit(
        db,
        actor,
        event="escalated",
        target_id=event.id,
        note=f"target={target} note={(body.note or '')[:200]}",
    )
    return AdverseEventOut.from_record(event)
