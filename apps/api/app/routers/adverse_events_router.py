"""Adverse events router.

Endpoints
---------
POST   /api/v1/adverse-events                 Report a new adverse event
GET    /api/v1/adverse-events                 List adverse events (filters)
GET    /api/v1/adverse-events/summary         Roll-up counts (clinic / patient / course / trial)
GET    /api/v1/adverse-events/detail          Aggregated AE Hub detail (drill-in aware)
GET    /api/v1/adverse-events/export.csv      CSV export, filter-aware (DEMO prefix)
GET    /api/v1/adverse-events/export.ndjson   NDJSON export, filter-aware (DEMO meta)
POST   /api/v1/adverse-events/audit-events    Page-level audit ingestion (adverse_events_hub)
GET    /api/v1/adverse-events/{id}            Get event detail
GET    /api/v1/adverse-events/{id}/export.cioms
                                              CIOMS form stub (honest no-op)
PATCH  /api/v1/adverse-events/{id}            Update classification fields
PATCH  /api/v1/adverse-events/{id}/resolve    Mark resolved (legacy)
POST   /api/v1/adverse-events/{id}/review     Clinician review + sign-off
POST   /api/v1/adverse-events/{id}/close      Sign-off close (note required)
POST   /api/v1/adverse-events/{id}/reopen     Reopen a closed AE (reason required)
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
import json
import logging as _logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field, field_validator
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
from app.persistence.models import (
    AdverseEvent,
    ClinicalSession,
    ClinicalTrial,
    ClinicalTrialEnrollment,
    TreatmentCourse,
)
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


def _hub_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
) -> None:
    """Page-level (adverse_events_hub) audit write.

    Distinct from the per-record ``adverse_events`` surface so the AE Hub's
    page-load / filter-change / export / drill-in events are attributable
    separately from per-AE create / patch / review / escalate / close
    events. Both surfaces appear in /api/v1/audit-trail.
    """
    try:
        from app.repositories.audit import create_audit_event

        now = datetime.now(timezone.utc)
        event_id = (
            f"adverse_events_hub-{event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="adverse_events_hub",
            action=f"adverse_events_hub.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _ae_log.debug("AE-hub audit write skipped", exc_info=True)


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


class AdverseEventClose(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)


class AdverseEventReopen(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)


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
    closed: int
    escalated: int
    sae: int
    reportable: int
    unexpected: int
    awaiting_review: int
    capa_required: int
    demo: int
    by_severity: dict[str, int]
    by_body_system: dict[str, int]
    # Drill-in echo so the hub banner can render the active context.
    filtered_by_patient_id: Optional[str] = None
    filtered_by_course_id: Optional[str] = None
    filtered_by_trial_id: Optional[str] = None
    disclaimers: list[str] = []


# ── Drill-in ────────────────────────────────────────────────────────────────

# Surfaces that drill into the AE Hub via
# ``?source_target_type=…&source_target_id=…``. Validated at the /detail
# endpoint and the /audit-events endpoint so unknown values are 422'd
# rather than silently accepted into audit rows.
KNOWN_DRILL_IN_SURFACES: set[str] = {
    "patient_profile",
    "course_detail",
    "clinical_trials",
    "irb_manager",
    "quality_assurance",
    "documents_hub",
    "reports_hub",
}


# Honest disclaimers always rendered on the AE Hub so reviewers know the
# regulatory ceiling of this view.
ADVERSE_EVENTS_HUB_DISCLAIMERS = [
    "Adverse events require timely clinician review per local policy.",
    "Serious adverse events may require regulatory reporting (IRB / FDA / MHRA).",
    "Demo data is not for actual clinical reporting.",
    "Closed AEs are immutable; reopen requires a documented reason and creates an audit row.",
]


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
    trial_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventSummary:
    """Counts roll-up for the AE Hub KPI tiles.

    Always returns real counts derived from the underlying rows — the UI must
    never fall back to fabricated numbers. Honors the same filter shape as
    the list / export endpoints (``patient_id`` / ``course_id`` / ``trial_id``
    + ``since`` / ``until``) so the KPI strip and the table are scoped to the
    same scope reviewer-side.
    """
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    q = _apply_filters(
        _scope_query(actor, db),
        patient_id=patient_id,
        course_id=course_id,
        trial_id=trial_id,
        severity=None,
        body_system=None,
        sae=None,
        reportable=None,
        expected=None,
        status_filter=None,
        since=since,
        until=until,
        db=db,
    )

    rows = q.all()
    total = len(rows)
    open_n = sum(1 for r in rows if r.resolved_at is None and getattr(r, "escalated_at", None) is None)
    reviewed_n = sum(1 for r in rows if getattr(r, "reviewed_at", None) is not None)
    resolved_n = sum(1 for r in rows if r.resolved_at is not None)
    # "closed" mirrors "resolved" for the existing schema; the Hub surfaces
    # both terms for clinician parity with regulator language.
    closed_n = resolved_n
    escalated_n = sum(1 for r in rows if getattr(r, "escalated_at", None) is not None)
    sae_n = sum(1 for r in rows if getattr(r, "is_serious", False))
    reportable_n = sum(1 for r in rows if getattr(r, "reportable", False))
    unexpected_n = sum(
        1 for r in rows if (getattr(r, "expectedness", None) or "").lower() == "unexpected"
    )
    awaiting_review_n = sum(
        1
        for r in rows
        if getattr(r, "reviewed_at", None) is None and r.resolved_at is None
    )
    # CAPA required = SAE + reportable (regulator-trackable corrective-action
    # candidates). We do NOT fabricate a CAPA pipeline status — the count is
    # the union of regulator-eligible events the QA team must review.
    capa_required_n = sum(
        1
        for r in rows
        if (getattr(r, "is_serious", False) or getattr(r, "reportable", False))
    )
    demo_n = sum(1 for r in rows if getattr(r, "is_demo", False))

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
        closed=closed_n,
        escalated=escalated_n,
        sae=sae_n,
        reportable=reportable_n,
        unexpected=unexpected_n,
        awaiting_review=awaiting_review_n,
        capa_required=capa_required_n,
        demo=demo_n,
        by_severity=by_severity,
        by_body_system=by_body_system,
        filtered_by_patient_id=patient_id,
        filtered_by_course_id=course_id,
        filtered_by_trial_id=trial_id,
        disclaimers=list(ADVERSE_EVENTS_HUB_DISCLAIMERS),
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
    trial_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    body_system: Optional[str] = Query(default=None),
    sae: Optional[bool] = Query(default=None),
    reportable: Optional[bool] = Query(default=None),
    expected: Optional[str] = Query(default=None),  # expected | unexpected | unknown
    status: Optional[str] = Query(default=None),    # open | reviewed | resolved | escalated
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """Filter-aware CSV export. Every visible filter on the AE Hub must be
    honoured here — the export is the audit / regulator artifact.

    DEMO honesty: when any matched row is ``is_demo=True`` the file is
    prefixed with ``# DEMO …`` so a downstream importer can drop or quarantine
    the bundle before submitting to a regulator. The same prefix appears in
    the IRB Manager / Clinical Trials / Documents Hub exports.
    """
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    qry = _apply_filters(
        _scope_query(actor, db),
        patient_id=patient_id,
        course_id=course_id,
        trial_id=trial_id,
        severity=severity,
        body_system=body_system,
        sae=sae,
        reportable=reportable,
        expected=expected,
        status_filter=status,
        since=since,
        until=until,
        q_text=q,
        db=db,
    )
    rows = qry.order_by(AdverseEvent.reported_at.desc()).limit(10_000).all()

    has_demo = any(getattr(r, "is_demo", False) for r in rows)
    buf = io.StringIO()
    if has_demo:
        buf.write(
            "# DEMO — at least one row in this export is demo data and is "
            "NOT regulator-submittable.\n"
        )
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
        target_id=patient_id or course_id or trial_id or actor.actor_id,
        note=f"rows={len(rows)} demo_rows={sum(1 for r in rows if getattr(r,'is_demo',False))}",
    )
    # Mirror the export through the page-level surface so reviewers searching
    # `/api/v1/audit-trail?surface=adverse_events_hub` see it too.
    _hub_audit(
        db,
        actor,
        event="export_csv",
        target_id=patient_id or course_id or trial_id or actor.actor_id,
        note=(
            f"rows={len(rows)} demo_rows={sum(1 for r in rows if getattr(r,'is_demo',False))}"
            f" patient={patient_id or '-'} course={course_id or '-'} trial={trial_id or '-'}"
        ),
    )

    csv_text = buf.getvalue()
    demo_rows = sum(1 for r in rows if getattr(r, "is_demo", False))
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=adverse_events.csv",
            "Cache-Control": "no-store",
            "X-Adverse-Event-Demo-Rows": str(demo_rows),
        },
    )


# ── GET /export.ndjson ──────────────────────────────────────────────────────


@router.get("/export.ndjson")
def export_adverse_events_ndjson(
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    trial_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    body_system: Optional[str] = Query(default=None),
    sae: Optional[bool] = Query(default=None),
    reportable: Optional[bool] = Query(default=None),
    expected: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one record per line, regulator-friendly.

    Mirrors the IRB Manager / Clinical Trials NDJSON contract. When any
    matched row is demo, the first line is a ``{"_meta":"DEMO"}`` JSON
    object so downstream importers can detect the marker without parsing
    the full file.
    """
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    qry = _apply_filters(
        _scope_query(actor, db),
        patient_id=patient_id,
        course_id=course_id,
        trial_id=trial_id,
        severity=severity,
        body_system=body_system,
        sae=sae,
        reportable=reportable,
        expected=expected,
        status_filter=status,
        since=since,
        until=until,
        q_text=q,
        db=db,
    )
    rows = qry.order_by(AdverseEvent.reported_at.desc()).limit(10_000).all()
    has_demo = any(getattr(r, "is_demo", False) for r in rows)
    lines: list[str] = []
    if has_demo:
        lines.append(
            json.dumps(
                {
                    "_meta": "DEMO",
                    "warning": (
                        "At least one row in this export is demo data and is "
                        "NOT regulator-submittable."
                    ),
                },
                separators=(",", ":"),
            )
        )
    demo_rows = 0
    for r in rows:
        out = AdverseEventOut.from_record(r)
        if out.is_demo:
            demo_rows += 1
        lines.append(json.dumps(out.model_dump(), separators=(",", ":")))
    body = "\n".join(lines) + ("\n" if lines else "")

    _audit(
        db,
        actor,
        event="export_ndjson",
        target_id=patient_id or course_id or trial_id or actor.actor_id,
        note=f"rows={len(rows)} demo_rows={demo_rows}",
    )
    _hub_audit(
        db,
        actor,
        event="export_ndjson",
        target_id=patient_id or course_id or trial_id or actor.actor_id,
        note=(
            f"rows={len(rows)} demo_rows={demo_rows}"
            f" patient={patient_id or '-'} course={course_id or '-'} trial={trial_id or '-'}"
        ),
    )

    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": "attachment; filename=adverse_events.ndjson",
            "Cache-Control": "no-store",
            "X-Adverse-Event-Demo-Rows": str(demo_rows),
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
    trial_id: str | None = None,
    q_text: str | None = None,
    db: Session | None = None,
):
    if patient_id:
        q = q.filter(AdverseEvent.patient_id == patient_id)
    if course_id:
        q = q.filter(AdverseEvent.course_id == course_id)
    if trial_id and db is not None:
        # Trials don't carry a direct AE FK — we filter through the
        # ClinicalTrialEnrollment join (patient ∈ enrolled patients of trial).
        # 422 on unknown trial id so the UI never shows a silent "all rows".
        trial = db.query(ClinicalTrial).filter_by(id=trial_id).first()
        if trial is None:
            raise ApiServiceError(
                code="invalid_trial",
                message="Trial not found.",
                status_code=422,
            )
        enrolled_pids = [
            row.patient_id
            for row in db.query(ClinicalTrialEnrollment)
            .filter_by(trial_id=trial_id)
            .all()
        ]
        if not enrolled_pids:
            # No enrollments → no AEs match. Force an empty result rather
            # than silently returning every AE in the clinic.
            q = q.filter(AdverseEvent.patient_id == "__no_enrollments__")
        else:
            q = q.filter(AdverseEvent.patient_id.in_(enrolled_pids))
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
    elif status_filter == "resolved" or status_filter == "closed":
        q = q.filter(AdverseEvent.resolved_at.is_not(None))
    elif status_filter == "escalated":
        q = q.filter(AdverseEvent.escalated_at.is_not(None))

    if q_text:
        from sqlalchemy import or_

        like = f"%{q_text.strip().lower()}%"
        q = q.filter(
            or_(
                AdverseEvent.event_type.ilike(like),
                AdverseEvent.description.ilike(like),
                AdverseEvent.body_system.ilike(like),
                AdverseEvent.meddra_pt.ilike(like),
            )
        )

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
    trial_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    body_system: Optional[str] = Query(default=None),
    sae: Optional[bool] = Query(default=None),
    reportable: Optional[bool] = Query(default=None),
    expected: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventListResponse:
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    qry = _apply_filters(
        _scope_query(actor, db),
        patient_id=patient_id,
        course_id=course_id,
        trial_id=trial_id,
        severity=severity,
        body_system=body_system,
        sae=sae,
        reportable=reportable,
        expected=expected,
        status_filter=status,
        since=since,
        until=until,
        q_text=q,
        db=db,
    )
    records = qry.order_by(AdverseEvent.reported_at.desc()).limit(limit).all()
    items = [AdverseEventOut.from_record(r) for r in records]
    return AdverseEventListResponse(items=items, total=len(items))


# ── GET /detail (aggregated drill-in detail) ────────────────────────────────


class AdverseEventsHubDetailResponse(BaseModel):
    """Aggregated detail payload for the AE Hub.

    Returned scoped to the upstream surface that drilled in (patient profile,
    course detail, clinical trial, IRB protocol, QA finding, documents hub,
    reports hub) so the page can render a focused list + KPI strip without
    a second roundtrip per filter. The shape mirrors the Documents Hub
    /summary contract (counts + filter echo + disclaimers + scope_-
    limitations) so reviewers see the same regulatory ceiling everywhere.
    """

    items: list[AdverseEventOut]
    total: int
    summary: AdverseEventSummary
    drill_in: dict
    disclaimers: list[str]
    scope_limitations: list[str]


@router.get("/detail", response_model=AdverseEventsHubDetailResponse)
def adverse_events_hub_detail(
    source_target_type: Optional[str] = Query(default=None, max_length=32),
    source_target_id: Optional[str] = Query(default=None, max_length=64),
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    trial_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    body_system: Optional[str] = Query(default=None),
    sae: Optional[bool] = Query(default=None),
    reportable: Optional[bool] = Query(default=None),
    expected: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventsHubDetailResponse:
    """Aggregated AE Hub detail for the given drill-in scope.

    Drill-in pair validation: when ``source_target_type`` is supplied it must
    be one of :data:`KNOWN_DRILL_IN_SURFACES` and ``source_target_id`` must
    be supplied — half-pairs and unknown surfaces 422 rather than silently
    falling back to "all rows in the clinic".

    The drill-in pair is also used to derive the matching scalar filter:

      * ``patient_profile`` → ``patient_id``
      * ``course_detail``   → ``course_id``
      * ``clinical_trials`` → ``trial_id``

    Other surfaces (irb_manager / quality_assurance / documents_hub /
    reports_hub) carry the drill-in tag for the audit row but do not auto-
    filter — the upstream caller must add the matching scalar filter
    explicitly. We never invent a filter we cannot back with real columns.
    """
    require_minimum_role(actor, "clinician")

    # Validate drill-in pair (422 on unknown / half-supplied).
    if source_target_type or source_target_id:
        if not (source_target_type and source_target_id):
            raise ApiServiceError(
                code="invalid_drill_in",
                message=(
                    "source_target_type and source_target_id must be supplied "
                    "together."
                ),
                status_code=422,
            )
        if source_target_type not in KNOWN_DRILL_IN_SURFACES:
            raise ApiServiceError(
                code="invalid_drill_in",
                message=(
                    f"source_target_type must be one of "
                    f"{sorted(KNOWN_DRILL_IN_SURFACES)}"
                ),
                status_code=422,
            )
        # Derive the matching scalar filter when the upstream surface maps
        # cleanly. Explicit scalar filters in the query string take priority.
        if source_target_type == "patient_profile" and not patient_id:
            patient_id = source_target_id
        elif source_target_type == "course_detail" and not course_id:
            course_id = source_target_id
        elif source_target_type == "clinical_trials" and not trial_id:
            trial_id = source_target_id

    if patient_id:
        _gate_patient_access(actor, patient_id, db)

    qry = _apply_filters(
        _scope_query(actor, db),
        patient_id=patient_id,
        course_id=course_id,
        trial_id=trial_id,
        severity=severity,
        body_system=body_system,
        sae=sae,
        reportable=reportable,
        expected=expected,
        status_filter=status,
        since=since,
        until=until,
        q_text=q,
        db=db,
    )
    records = qry.order_by(AdverseEvent.reported_at.desc()).limit(limit).all()
    items = [AdverseEventOut.from_record(r) for r in records]

    # Compute summary scoped to the same drill-in / filter set.
    summary = adverse_events_summary(
        patient_id=patient_id,
        course_id=course_id,
        trial_id=trial_id,
        since=since,
        until=until,
        actor=actor,
        db=db,
    )

    drill_in = {
        "source_target_type": source_target_type,
        "source_target_id": source_target_id,
        "active": bool(source_target_type and source_target_id),
        "known_surfaces": sorted(KNOWN_DRILL_IN_SURFACES),
    }

    # Mount-time / detail-read audit emit on the page-level surface.
    note_parts: list[str] = []
    if drill_in["active"]:
        note_parts.append(
            f"drill_in_from={source_target_type}:{source_target_id}"
        )
    if patient_id:
        note_parts.append(f"patient={patient_id}")
    if course_id:
        note_parts.append(f"course={course_id}")
    if trial_id:
        note_parts.append(f"trial={trial_id}")
    note_parts.append(f"rows={len(items)}")
    _hub_audit(
        db,
        actor,
        event="detail.read",
        target_id=source_target_id or patient_id or course_id or trial_id or actor.actor_id,
        note="; ".join(note_parts),
    )

    return AdverseEventsHubDetailResponse(
        items=items,
        total=len(items),
        summary=summary,
        drill_in=drill_in,
        disclaimers=list(ADVERSE_EVENTS_HUB_DISCLAIMERS),
        scope_limitations=[
            (
                "Trial-id filter resolves AEs through ClinicalTrialEnrollment "
                "(patient ∈ enrolled patients of the trial); AEs created "
                "outside an enrolment are not visible under that filter."
            ),
            (
                "Drill-in surfaces irb_manager / quality_assurance / "
                "documents_hub / reports_hub do not auto-derive a scalar "
                "AE filter — upstream callers must pass patient_id / "
                "course_id / trial_id explicitly when they want a filtered "
                "list. The drill-in tag is preserved in the audit row "
                "regardless."
            ),
            (
                "AE close uses resolved_at as the source-of-truth timestamp; "
                "reopen clears resolved_at and writes a paired audit row."
            ),
        ],
    )


# ── POST /audit-events (page-level audit ingestion) ────────────────────────


class AEHubAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=120)
    patient_id: Optional[str] = Field(default=None, max_length=64)
    course_id: Optional[str] = Field(default=None, max_length=64)
    trial_id: Optional[str] = Field(default=None, max_length=64)
    adverse_event_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False
    # Drill-in upstream context (validated against KNOWN_DRILL_IN_SURFACES).
    source_target_type: Optional[str] = Field(default=None, max_length=32)
    source_target_id: Optional[str] = Field(default=None, max_length=64)


class AEHubAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


@router.post("/audit-events", response_model=AEHubAuditEventOut)
def record_ae_hub_audit_event(
    payload: AEHubAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AEHubAuditEventOut:
    """Best-effort page-level audit ingestion for the Adverse Events Hub.

    Writes ``target_type='adverse_events_hub'``. Distinct from the per-record
    ``adverse_events`` surface used by create / patch / review / escalate /
    close so reviewers can filter the audit-trail to page-level events
    (filter changes, drill-in views, exports) without the per-record noise.
    """
    require_minimum_role(actor, "clinician")
    from app.repositories.audit import create_audit_event

    now = datetime.now(timezone.utc)
    event_id = (
        f"adverse_events_hub-{payload.event}-{actor.actor_id}-"
        f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    target_id = (
        payload.adverse_event_id
        or payload.patient_id
        or payload.course_id
        or payload.trial_id
        or payload.source_target_id
        or actor.clinic_id
        or actor.actor_id
    )

    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.patient_id:
        note_parts.append(f"patient={payload.patient_id}")
    if payload.course_id:
        note_parts.append(f"course={payload.course_id}")
    if payload.trial_id:
        note_parts.append(f"trial={payload.trial_id}")
    if payload.adverse_event_id:
        note_parts.append(f"ae={payload.adverse_event_id}")
    # Drill-in upstream context — mirrors the Documents Hub pattern. Unknown
    # / half-supplied pairs are dropped silently rather than 422'd; the
    # audit endpoint must never block UI navigation.
    if (
        payload.source_target_type
        and payload.source_target_id
        and payload.source_target_type in KNOWN_DRILL_IN_SURFACES
    ):
        note_parts.append(
            f"drill_in_from={payload.source_target_type}:{payload.source_target_id}"
        )
    if payload.note:
        note_parts.append(payload.note[:300])
    note = "; ".join(note_parts) or payload.event

    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="adverse_events_hub",
            action=f"adverse_events_hub.{payload.event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _ae_log.exception("AE hub audit-event persistence failed")
        return AEHubAuditEventOut(accepted=False, event_id=event_id)
    return AEHubAuditEventOut(accepted=True, event_id=event_id)


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

    # Closed AEs are immutable except via /reopen — preserves the regulator
    # audit trail. Mirrors the IRB Manager / Clinical Trials immutability
    # contract.
    if getattr(event, "resolved_at", None) is not None:
        raise ApiServiceError(
            code="adverse_event_immutable",
            message=(
                "This adverse event is closed. Reopen it via "
                "/api/v1/adverse-events/{id}/reopen before patching."
            ),
            status_code=409,
        )

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


# ── POST /{id}/close ────────────────────────────────────────────────────────


@router.post("/{event_id}/close", response_model=AdverseEventOut)
def close_adverse_event(
    event_id: str,
    body: AdverseEventClose,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    """Sign-off close — terminal state for the AE workflow.

    Note required (regulator audit). Pre-fix the existing /resolve PATCH
    accepted close-with-no-note silently; the explicit ``/close`` endpoint
    enforces the documented closure note up front. ``/resolve`` is kept for
    backwards compatibility.
    """
    require_minimum_role(actor, "clinician")
    event = _load_event_or_404(event_id, actor, db)
    note = (body.note or "").strip()
    if not note:
        raise ApiServiceError(
            code="closure_note_required",
            message="A non-empty closure note is required.",
            status_code=422,
        )
    if getattr(event, "resolved_at", None) is not None:
        raise ApiServiceError(
            code="adverse_event_already_closed",
            message="This adverse event is already closed.",
            status_code=409,
        )
    now = datetime.now(timezone.utc)
    event.resolved_at = now
    event.resolution = note[:255] if not event.resolution else event.resolution
    # Capture the sign-off identity if not already set so a regulator can
    # answer "who closed this AE?" without joining audit rows back.
    if getattr(event, "signed_at", None) is None:
        event.signed_at = now
        event.signed_by = actor.actor_id
    db.commit()
    db.refresh(event)
    _audit(
        db,
        actor,
        event="closed",
        target_id=event.id,
        note=f"closure_note={note[:300]}",
    )
    _hub_audit(
        db,
        actor,
        event="closed",
        target_id=event.id,
        note=f"ae_closed={event.id} note={note[:200]}",
    )
    return AdverseEventOut.from_record(event)


# ── POST /{id}/reopen ───────────────────────────────────────────────────────


@router.post("/{event_id}/reopen", response_model=AdverseEventOut)
def reopen_adverse_event(
    event_id: str,
    body: AdverseEventReopen,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdverseEventOut:
    """Reopen a closed AE.

    Reason required (regulator audit). Clears ``resolved_at`` and writes a
    paired audit row so the regulator timeline shows close → reopen with
    rationale. Cannot reopen an AE that was never closed.
    """
    require_minimum_role(actor, "clinician")
    event = _load_event_or_404(event_id, actor, db)
    reason = (body.reason or "").strip()
    if not reason:
        raise ApiServiceError(
            code="reopen_reason_required",
            message="A non-empty reopen reason is required.",
            status_code=422,
        )
    if getattr(event, "resolved_at", None) is None:
        raise ApiServiceError(
            code="adverse_event_not_closed",
            message="This adverse event is not closed; nothing to reopen.",
            status_code=409,
        )
    event.resolved_at = None
    # Resolution string preserved as historical context — a regulator
    # reading the audit row needs the original closure rationale.
    db.commit()
    db.refresh(event)
    _audit(
        db,
        actor,
        event="reopened",
        target_id=event.id,
        note=f"reason={reason[:300]}",
    )
    _hub_audit(
        db,
        actor,
        event="reopened",
        target_id=event.id,
        note=f"ae_reopened={event.id} reason={reason[:200]}",
    )
    return AdverseEventOut.from_record(event)
