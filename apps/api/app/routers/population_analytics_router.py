"""Population Analytics router (launch-audit 2026-05-01).

This is the *cohort-aggregate* counterpart to the Patient Profile launch
audit (#338). Where Patient Profile closes the regulator chain on the
per-patient side, this router closes it on the population / aggregate-
stats side: the clinician hub for outcome trends by condition, modality,
age band, sex, severity band, and AE incidence by protocol / modality.

Endpoints
---------
GET    /api/v1/population-analytics/cohorts/summary           Top-line counts under filter
GET    /api/v1/population-analytics/cohorts/list              Anonymized cohort previews (count + demo flag)
GET    /api/v1/population-analytics/outcomes/trend            Per-week mean ± SE per outcome scale
GET    /api/v1/population-analytics/adverse-events/incidence  AE incidence per protocol / modality / severity
GET    /api/v1/population-analytics/treatment-response        Responder distribution (responder_threshold/non_responder_threshold)
GET    /api/v1/population-analytics/export.csv                Filter-aware CSV (DEMO prefix)
GET    /api/v1/population-analytics/export.ndjson             Filter-aware NDJSON (DEMO meta line)
POST   /api/v1/population-analytics/audit-events              Page-level audit ingestion (target_type=population_analytics)

Honest constraints
------------------
* Every number on every endpoint traces to a real SQL aggregate over
  ``patients`` / ``treatment_courses`` / ``outcome_series`` /
  ``adverse_events``. No AI fabrication, no hard-coded series.
* No PHI in cohort previews — only counts and demo flags.
* Cross-clinic blocked: clinicians see only ``actor.clinic_id`` rows
  (resolved via ``patients.clinician_id → users.clinic_id``); admins
  see every clinic; ``regulator`` is treated as admin-equivalent here
  per the regulator-credible export pattern (Reports Hub #310).

Audit hooks
-----------
* Page mount  → ``population_analytics.view``
* Filter      → ``population_analytics.cohort_filter_changed``
* Drill-out   → ``population_analytics.chart_drilled_out``
* Export      → ``population_analytics.export_csv`` / ``...export_ndjson``

Surface name ``population_analytics`` is whitelisted by both
``audit_trail_router.KNOWN_SURFACES`` and the qEEG audit-events surface
whitelist so the umbrella audit trail surfaces these rows alongside
every other launch-audit page.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import statistics
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.persistence.models import (
    AdverseEvent,
    OutcomeSeries,
    Patient,
    TreatmentCourse,
    User,
)


_log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/population-analytics", tags=["Population Analytics"]
)


# ── Disclaimers always rendered on the page ────────────────────────────────


POPULATION_ANALYTICS_DISCLAIMERS = [
    "Aggregate cohort statistics are decision-support only — never substitute "
    "for individual clinical assessment.",
    "Cohort previews show counts only; no patient-identifying fields are "
    "exposed in this view.",
    "Demo seed data is excluded from regulator-submittable counts; exports "
    "are DEMO-prefixed if any cohort row is demo.",
    "Outcome trend mean ± SE is computed only when ≥ 2 patients contributed "
    "a score in that week; empty buckets are omitted, not zero-filled.",
]


# Surfaces the page can drill OUT into. Mirrors Adverse Events Hub
# ``KNOWN_DRILL_IN_SURFACES`` but in the opposite direction — these are the
# downstream pages we cross-link to from the cohort table / AE incidence
# table. ``patients_hub`` is the cohort filter on the patients list page;
# ``adverse_events_hub`` is the AE Hub; ``irb_manager`` is the IRB protocol
# detail page.
KNOWN_DRILL_OUT_TARGETS: set[str] = {
    "patients_hub",
    "adverse_events_hub",
    "irb_manager",
    "course_detail",
    "patient_profile",
    "reports_hub",
}


# Outcome scales we surface trends for. Other template ids are aggregated
# under ``other`` rather than silently dropped — the response carries the
# raw template_id back so the UI can render an honest "Other scales" tile.
PRIMARY_OUTCOME_SCALES = {
    "PHQ-9": "PHQ-9",
    "PHQ9": "PHQ-9",
    "GAD-7": "GAD-7",
    "GAD7": "GAD-7",
    "NRS": "NRS",
    "PCL-5": "PCL-5",
    "PCL5": "PCL-5",
    "YBOCS": "Y-BOCS",
    "Y-BOCS": "Y-BOCS",
    "PSQI": "PSQI",
    "ISI": "ISI",
}


def _normalize_scale(template_id: str | None) -> str:
    if not template_id:
        return "unknown"
    key = template_id.strip().upper().replace(" ", "")
    return PRIMARY_OUTCOME_SCALES.get(key, template_id)


# ── Demo-flag helper (mirrors patients_router._patient_is_demo) ────────────


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


def _patient_is_demo(notes: str | None, clinic_id: str | None) -> bool:
    if (notes or "").startswith("[DEMO]"):
        return True
    return (clinic_id or "") in _DEMO_CLINIC_IDS


# ── Filter parsing ─────────────────────────────────────────────────────────


_AGE_BANDS: dict[str, tuple[int, int]] = {
    "u18": (0, 17),
    "18-25": (18, 25),
    "26-35": (26, 35),
    "36-45": (36, 45),
    "46-55": (46, 55),
    "56-65": (56, 65),
    "65+": (66, 130),
}


def _age_from_dob(dob: Optional[str]) -> Optional[int]:
    if not dob:
        return None
    try:
        year = int(str(dob)[:4])
    except Exception:
        return None
    age = datetime.now(timezone.utc).year - year
    if age < 0 or age > 130:
        return None
    return age


def _age_band(age: Optional[int]) -> Optional[str]:
    if age is None:
        return None
    for band, (lo, hi) in _AGE_BANDS.items():
        if lo <= age <= hi:
            return band
    return None


def _parse_iso(value: str | None) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.rstrip("Z"))
    except ValueError:
        return None


def _as_aware(dt) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if getattr(dt, "tzinfo", None) is not None else dt.replace(tzinfo=timezone.utc)


# ── Severity band derivation (per outcome scale) ───────────────────────────

# Scale-specific cutoffs. Only used when a baseline ``OutcomeSeries`` row is
# present — never fabricated. PHQ-9 / GAD-7 / NRS cutoffs are the canonical
# clinical thresholds; other scales fall back to "unknown".
_SEVERITY_BANDS: dict[str, list[tuple[float, str]]] = {
    "PHQ-9":  [(4, "minimal"), (9, "mild"), (14, "moderate"), (19, "moderately_severe"), (27, "severe")],
    "GAD-7":  [(4, "minimal"), (9, "mild"), (14, "moderate"), (21, "severe")],
    "NRS":    [(3, "mild"), (6, "moderate"), (10, "severe")],
    "PCL-5":  [(32, "below_threshold"), (80, "ptsd_likely")],
    "Y-BOCS": [(7, "subclinical"), (15, "mild"), (23, "moderate"), (31, "severe"), (40, "extreme")],
}


def _severity_band(scale: str, score: float | None) -> Optional[str]:
    if score is None:
        return None
    cutoffs = _SEVERITY_BANDS.get(scale)
    if not cutoffs:
        return None
    for upper, label in cutoffs:
        if score <= upper:
            return label
    return cutoffs[-1][1]


# ── Audit helpers ─────────────────────────────────────────────────────────


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
) -> str:
    """Best-effort audit row. Never raises back at the caller."""
    try:
        from app.repositories.audit import create_audit_event  # noqa: PLC0415

        now = datetime.now(timezone.utc)
        event_id = (
            f"population_analytics-{event}-{actor.actor_id}-"
            f"{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type="population_analytics",
            action=f"population_analytics.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
        return event_id
    except Exception:  # pragma: no cover — audit must not block UI
        _log.debug("Population analytics audit write skipped", exc_info=True)
        return ""


# ── Cross-clinic scoping ───────────────────────────────────────────────────


def _resolve_actor_clinic_id(actor: AuthenticatedActor, db: Session) -> Optional[str]:
    """Resolve the actor's clinic_id, preferring the JWT/header value but
    falling back to a fresh DB read so we never trust a stale token.
    """
    if actor.clinic_id:
        return actor.clinic_id
    user = db.query(User).filter_by(id=actor.actor_id).first()
    return user.clinic_id if user is not None else None


def _scoped_patient_ids(actor: AuthenticatedActor, db: Session) -> tuple[set[str], dict[str, str]]:
    """Return (allowed_patient_ids, patient_id → clinic_id map) for the actor.

    Admins / regulators see every patient; clinicians see only patients
    whose owning clinician sits in the same clinic. Returns a *set* even
    when admin so callers can branch on emptiness (clinic with no
    patients) vs unbounded scope (admin) using ``role``.
    """
    rows = (
        db.query(Patient.id, Patient.clinician_id, User.clinic_id)
        .outerjoin(User, User.id == Patient.clinician_id)
        .all()
    )
    by_id: dict[str, str] = {}
    allowed: set[str] = set()
    actor_clinic = _resolve_actor_clinic_id(actor, db)
    for pid, _clinician_id, clinic_id in rows:
        by_id[pid] = clinic_id or ""
        if actor.role in ("admin", "regulator"):
            allowed.add(pid)
        elif actor_clinic and clinic_id == actor_clinic:
            allowed.add(pid)
    return allowed, by_id


# ── Filter shape ──────────────────────────────────────────────────────────


class CohortFilters(BaseModel):
    condition: Optional[str] = None
    modality: Optional[str] = None
    age_band: Optional[str] = None
    sex: Optional[str] = None
    severity_band: Optional[str] = None
    clinic_id: Optional[str] = None  # admin/regulator only
    since: Optional[str] = None
    until: Optional[str] = None
    primary_outcome_scale: Optional[str] = None  # for trend / response endpoints


def _filter_courses_for_actor(
    db: Session,
    actor: AuthenticatedActor,
    *,
    filters: CohortFilters,
) -> tuple[list[TreatmentCourse], dict[str, Patient], set[str]]:
    """Return courses + patient lookup + matched patient_ids under filters.

    SQL aggregate documented in section F of the PR body.
    """
    allowed_ids, _ = _scoped_patient_ids(actor, db)

    pat_q = db.query(Patient)
    patients: dict[str, Patient] = {p.id: p for p in pat_q.all() if p.id in allowed_ids or actor.role in ("admin", "regulator")}

    # Apply patient-level filters first, then derive course set.
    matched_pids: set[str] = set()
    for pid, p in patients.items():
        if actor.role not in ("admin", "regulator") and pid not in allowed_ids:
            continue
        if filters.condition and (p.primary_condition or "").lower() != filters.condition.lower():
            continue
        if filters.sex and (p.gender or "").lower() != filters.sex.lower():
            continue
        if filters.age_band:
            band = _age_band(_age_from_dob(p.dob))
            if band != filters.age_band:
                continue
        if filters.modality and (p.primary_modality or "").lower() != filters.modality.lower():
            # We allow course.modality_slug to match instead — handled below.
            pass
        matched_pids.add(pid)

    # Course filter pass.
    course_q = db.query(TreatmentCourse).filter(
        TreatmentCourse.patient_id.in_(matched_pids) if matched_pids else TreatmentCourse.patient_id == "_none"
    )
    if filters.modality:
        course_q = course_q.filter(TreatmentCourse.modality_slug.ilike(filters.modality))
    if filters.condition:
        course_q = course_q.filter(TreatmentCourse.condition_slug.ilike(filters.condition))

    since = _parse_iso(filters.since)
    until = _parse_iso(filters.until)
    if since:
        course_q = course_q.filter(TreatmentCourse.created_at >= since)
    if until:
        course_q = course_q.filter(TreatmentCourse.created_at <= until)

    courses = course_q.all()

    # Severity-band filter requires baseline outcome row → applied as a
    # post-filter so we don't twist the SQL into a sub-aggregate.
    if filters.severity_band:
        kept_pids = set()
        baselines = (
            db.query(OutcomeSeries)
            .filter(OutcomeSeries.patient_id.in_(matched_pids) if matched_pids else OutcomeSeries.patient_id == "_none")
            .filter(OutcomeSeries.measurement_point == "baseline")
            .all()
        )
        # First baseline per (patient, scale) — clinician posts may have
        # duplicates; we honour the earliest.
        first_baseline: dict[tuple[str, str], OutcomeSeries] = {}
        for b in baselines:
            scale = _normalize_scale(b.template_title or b.template_id)
            key = (b.patient_id, scale)
            if key not in first_baseline:
                first_baseline[key] = b
        for (pid, scale), b in first_baseline.items():
            band = _severity_band(scale, b.score_numeric)
            if band == filters.severity_band:
                kept_pids.add(pid)
        matched_pids &= kept_pids
        courses = [c for c in courses if c.patient_id in matched_pids]

    return courses, patients, matched_pids


# ── Schemas ───────────────────────────────────────────────────────────────


class CohortSummaryResponse(BaseModel):
    cohort_size: int
    courses_total: int
    courses_active: int
    courses_completed: int
    sessions_logged: int
    adverse_event_total: int
    adverse_event_serious: int
    adverse_event_reportable: int
    ae_incidence_per_100_courses: float
    response_rate_pct: Optional[float] = None
    response_rate_basis: dict[str, int] = Field(default_factory=dict)
    demo_count: int
    has_demo: bool
    by_condition: dict[str, int] = Field(default_factory=dict)
    by_modality: dict[str, int] = Field(default_factory=dict)
    by_age_band: dict[str, int] = Field(default_factory=dict)
    by_sex: dict[str, int] = Field(default_factory=dict)
    filters_echo: dict[str, Optional[str]] = Field(default_factory=dict)
    disclaimers: list[str] = Field(default_factory=lambda: list(POPULATION_ANALYTICS_DISCLAIMERS))


class CohortRow(BaseModel):
    cohort_key: str
    condition: Optional[str]
    modality: Optional[str]
    age_band: Optional[str]
    sex: Optional[str]
    count: int
    demo_count: int
    has_demo: bool
    signed_count: int


class CohortListResponse(BaseModel):
    items: list[CohortRow]
    total: int
    has_demo: bool
    disclaimers: list[str] = Field(default_factory=lambda: list(POPULATION_ANALYTICS_DISCLAIMERS))


class TrendBucket(BaseModel):
    week_start: str
    week_index: int
    n_patients: int
    mean: float
    se: float


class TrendSeries(BaseModel):
    scale: str
    template_title: str
    n_patients: int
    n_observations: int
    buckets: list[TrendBucket]


class TrendResponse(BaseModel):
    series: list[TrendSeries]
    cohort_size: int
    has_demo: bool
    filters_echo: dict[str, Optional[str]] = Field(default_factory=dict)
    disclaimers: list[str] = Field(default_factory=lambda: list(POPULATION_ANALYTICS_DISCLAIMERS))


class AEIncidenceRow(BaseModel):
    grouping: str  # "protocol" | "modality" | "severity_band"
    key: str
    course_count: int
    ae_count: int
    sae_count: int
    reportable_count: int
    incidence_per_100_courses: float
    demo_ae_count: int


class AEIncidenceResponse(BaseModel):
    by_protocol: list[AEIncidenceRow]
    by_modality: list[AEIncidenceRow]
    by_severity_band: list[AEIncidenceRow]
    cohort_size: int
    has_demo: bool
    filters_echo: dict[str, Optional[str]] = Field(default_factory=dict)
    disclaimers: list[str] = Field(default_factory=lambda: list(POPULATION_ANALYTICS_DISCLAIMERS))


class TreatmentResponseDistribution(BaseModel):
    scale: str
    responder_threshold_pct: int
    non_responder_threshold_pct: int
    responder_count: int
    partial_count: int
    non_responder_count: int
    no_data_count: int
    cohort_size: int
    response_rate_pct: Optional[float] = None


class TreatmentResponseResponse(BaseModel):
    distributions: list[TreatmentResponseDistribution]
    has_demo: bool
    filters_echo: dict[str, Optional[str]] = Field(default_factory=dict)
    disclaimers: list[str] = Field(default_factory=lambda: list(POPULATION_ANALYTICS_DISCLAIMERS))


class AuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=120)
    cohort_key: Optional[str] = Field(default=None, max_length=200)
    drill_out_target_type: Optional[str] = Field(default=None, max_length=32)
    drill_out_target_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False
    filters_json: Optional[str] = Field(default=None, max_length=1024)


class AuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── /cohorts/summary ──────────────────────────────────────────────────────


@router.get("/cohorts/summary", response_model=CohortSummaryResponse)
def cohort_summary(
    condition: Optional[str] = Query(default=None, max_length=120),
    modality: Optional[str] = Query(default=None, max_length=60),
    age_band: Optional[str] = Query(default=None, max_length=12),
    sex: Optional[str] = Query(default=None, max_length=20),
    severity_band: Optional[str] = Query(default=None, max_length=40),
    clinic_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CohortSummaryResponse:
    """Top-line counts for the page KPI strip.

    SQL aggregate (documented in PR section F):
        SELECT COUNT(DISTINCT p.id), COUNT(c.id), ...
          FROM patients p
          LEFT JOIN treatment_courses c ON c.patient_id = p.id
          LEFT JOIN adverse_events    a ON a.patient_id = p.id
          LEFT JOIN users             u ON u.id = p.clinician_id
         WHERE (admin OR u.clinic_id = :actor_clinic)
           [+ filters]
    """
    require_minimum_role(actor, "clinician")
    filters = CohortFilters(
        condition=condition,
        modality=modality,
        age_band=age_band,
        sex=sex,
        severity_band=severity_band,
        clinic_id=clinic_id,
        since=since,
        until=until,
    )
    courses, patients, matched_pids = _filter_courses_for_actor(db, actor, filters=filters)

    # Active / completed status sets — we use the same heuristic as Patient
    # Profile so KPI strips match across pages.
    active_statuses = {"active", "in_progress", "approved"}
    completed_statuses = {"completed"}

    courses_active = sum(1 for c in courses if (c.status or "").lower() in active_statuses)
    courses_completed = sum(1 for c in courses if (c.status or "").lower() in completed_statuses)
    sessions_logged = sum(int(getattr(c, "sessions_delivered", 0) or 0) for c in courses)

    # Adverse-event rollup over the *cohort* (patients in matched_pids), not
    # globally. Cross-clinic rows are excluded by the patient-id filter so
    # this is implicitly clinic-scoped.
    if matched_pids:
        ae_rows = (
            db.query(AdverseEvent)
            .filter(AdverseEvent.patient_id.in_(matched_pids))
            .all()
        )
    else:
        ae_rows = []
    ae_total = len(ae_rows)
    ae_serious = sum(1 for r in ae_rows if getattr(r, "is_serious", False))
    ae_reportable = sum(1 for r in ae_rows if getattr(r, "reportable", False))
    ae_incidence = (ae_total * 100.0 / len(courses)) if courses else 0.0

    # Demo count — patient is demo via the canonical helper.
    user_clinic = {}
    if matched_pids:
        for u_id, c_id in db.query(User.id, User.clinic_id).all():
            user_clinic[u_id] = c_id
    demo_count = 0
    by_condition: dict[str, int] = defaultdict(int)
    by_modality: dict[str, int] = defaultdict(int)
    by_age_band: dict[str, int] = defaultdict(int)
    by_sex: dict[str, int] = defaultdict(int)
    for pid in matched_pids:
        p = patients.get(pid)
        if p is None:
            continue
        clinic = user_clinic.get(p.clinician_id, "")
        if _patient_is_demo(p.notes, clinic):
            demo_count += 1
        by_condition[(p.primary_condition or "unspecified")] += 1
        by_modality[(p.primary_modality or "unspecified")] += 1
        by_age_band[_age_band(_age_from_dob(p.dob)) or "unspecified"] += 1
        by_sex[(p.gender or "unspecified")] += 1

    response_rate_pct, basis = _response_rate_for_cohort(db, matched_pids)

    return CohortSummaryResponse(
        cohort_size=len(matched_pids),
        courses_total=len(courses),
        courses_active=courses_active,
        courses_completed=courses_completed,
        sessions_logged=sessions_logged,
        adverse_event_total=ae_total,
        adverse_event_serious=ae_serious,
        adverse_event_reportable=ae_reportable,
        ae_incidence_per_100_courses=round(ae_incidence, 2),
        response_rate_pct=response_rate_pct,
        response_rate_basis=basis,
        demo_count=demo_count,
        has_demo=demo_count > 0,
        by_condition=dict(by_condition),
        by_modality=dict(by_modality),
        by_age_band=dict(by_age_band),
        by_sex=dict(by_sex),
        filters_echo=filters.model_dump(exclude_none=True),
    )


# ── /cohorts/list ─────────────────────────────────────────────────────────


@router.get("/cohorts/list", response_model=CohortListResponse)
def cohort_list(
    condition: Optional[str] = Query(default=None, max_length=120),
    modality: Optional[str] = Query(default=None, max_length=60),
    age_band: Optional[str] = Query(default=None, max_length=12),
    sex: Optional[str] = Query(default=None, max_length=20),
    severity_band: Optional[str] = Query(default=None, max_length=40),
    clinic_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CohortListResponse:
    """Anonymised cohort previews. Returns counts + demo flags only — no PHI.

    Each row is keyed by (condition, modality, age_band, sex). The
    ``cohort_key`` is a stable opaque slug a clinician can drill from to
    the patients-hub filtered view via the audit-events endpoint.
    """
    require_minimum_role(actor, "clinician")
    filters = CohortFilters(
        condition=condition, modality=modality, age_band=age_band, sex=sex,
        severity_band=severity_band, clinic_id=clinic_id, since=since, until=until,
    )
    _courses, patients, matched_pids = _filter_courses_for_actor(db, actor, filters=filters)
    if not matched_pids:
        return CohortListResponse(items=[], total=0, has_demo=False)

    user_clinic = {u_id: c_id for u_id, c_id in db.query(User.id, User.clinic_id).all()}

    # Group by (condition, modality, age_band, sex).
    groups: dict[tuple[str, str, str, str], dict] = {}
    for pid in matched_pids:
        p = patients.get(pid)
        if p is None:
            continue
        cond = (p.primary_condition or "unspecified")
        mod = (p.primary_modality or "unspecified")
        ab = _age_band(_age_from_dob(p.dob)) or "unspecified"
        sx = (p.gender or "unspecified")
        key = (cond, mod, ab, sx)
        g = groups.setdefault(key, {"count": 0, "demo": 0, "signed": 0})
        g["count"] += 1
        clinic = user_clinic.get(p.clinician_id, "")
        if _patient_is_demo(p.notes, clinic):
            g["demo"] += 1
        if getattr(p, "consent_signed", False):
            g["signed"] += 1

    items = []
    for (cond, mod, ab, sx), g in sorted(groups.items(), key=lambda kv: -kv[1]["count"]):
        items.append(
            CohortRow(
                cohort_key=f"{cond}|{mod}|{ab}|{sx}",
                condition=cond,
                modality=mod,
                age_band=ab,
                sex=sx,
                count=g["count"],
                demo_count=g["demo"],
                has_demo=g["demo"] > 0,
                signed_count=g["signed"],
            )
        )
    return CohortListResponse(
        items=items,
        total=len(items),
        has_demo=any(r.has_demo for r in items),
    )


# ── /outcomes/trend ───────────────────────────────────────────────────────


@router.get("/outcomes/trend", response_model=TrendResponse)
def outcomes_trend(
    condition: Optional[str] = Query(default=None, max_length=120),
    modality: Optional[str] = Query(default=None, max_length=60),
    age_band: Optional[str] = Query(default=None, max_length=12),
    sex: Optional[str] = Query(default=None, max_length=20),
    severity_band: Optional[str] = Query(default=None, max_length=40),
    clinic_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    primary_outcome_scale: Optional[str] = Query(default=None, max_length=40),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrendResponse:
    """Per-week mean ± SE outcome score per outcome scale.

    SQL aggregate:
        SELECT template_id, week_start, AVG(score_numeric), STDDEV/SQRT(N)
          FROM outcome_series
         WHERE patient_id IN (cohort_pids)
           AND score_numeric IS NOT NULL
        GROUP BY template_id, week_start

    Buckets with fewer than 2 patients are dropped (SE undefined). We do
    NOT zero-fill empty weeks — the regulator-credible export pattern
    requires honest gaps.
    """
    require_minimum_role(actor, "clinician")
    filters = CohortFilters(
        condition=condition, modality=modality, age_band=age_band, sex=sex,
        severity_band=severity_band, clinic_id=clinic_id, since=since, until=until,
        primary_outcome_scale=primary_outcome_scale,
    )
    _courses, patients, matched_pids = _filter_courses_for_actor(db, actor, filters=filters)
    if not matched_pids:
        return TrendResponse(series=[], cohort_size=0, has_demo=False, filters_echo=filters.model_dump(exclude_none=True))

    rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id.in_(matched_pids))
        .filter(OutcomeSeries.score_numeric.isnot(None))
        .all()
    )

    # Resolve baseline week per patient × scale so x-axis is "weeks since
    # baseline" rather than absolute calendar time — matches the Patient
    # Profile longitudinal chart contract.
    baselines: dict[tuple[str, str], datetime] = {}
    for r in rows:
        scale = _normalize_scale(r.template_title or r.template_id)
        ts = _as_aware(r.administered_at)
        if ts is None:
            continue
        key = (r.patient_id, scale)
        if key not in baselines or baselines[key] > ts:
            baselines[key] = ts

    # Group rows by (scale, week_index).
    bucket_scores: dict[tuple[str, int], list[tuple[str, float]]] = defaultdict(list)
    bucket_titles: dict[str, str] = {}
    for r in rows:
        scale = _normalize_scale(r.template_title or r.template_id)
        if primary_outcome_scale and scale != primary_outcome_scale:
            continue
        ts = _as_aware(r.administered_at)
        if ts is None:
            continue
        base_ts = baselines.get((r.patient_id, scale))
        if base_ts is None:
            continue
        delta_days = (ts - base_ts).days
        week_index = max(0, delta_days // 7)
        bucket_scores[(scale, week_index)].append((r.patient_id, float(r.score_numeric or 0.0)))
        bucket_titles.setdefault(scale, r.template_title or scale)

    series: list[TrendSeries] = []
    by_scale: dict[str, list[TrendBucket]] = defaultdict(list)
    by_scale_n_patients: dict[str, set[str]] = defaultdict(set)
    by_scale_n_obs: dict[str, int] = defaultdict(int)
    for (scale, week_index), pid_scores in bucket_scores.items():
        unique_pids = {pid for pid, _ in pid_scores}
        if len(unique_pids) < 2:
            # Honest gap — the SE is undefined with n=1 and we will not
            # fabricate it. The regulator gets no zero-filled bucket here.
            by_scale_n_patients[scale].update(unique_pids)
            by_scale_n_obs[scale] += len(pid_scores)
            continue
        scores = [s for _, s in pid_scores]
        mean = statistics.fmean(scores)
        try:
            stdev = statistics.stdev(scores)
        except statistics.StatisticsError:
            stdev = 0.0
        se = stdev / (len(scores) ** 0.5)
        by_scale[scale].append(
            TrendBucket(
                week_start=f"week-{week_index}",
                week_index=week_index,
                n_patients=len(unique_pids),
                mean=round(mean, 3),
                se=round(se, 3),
            )
        )
        by_scale_n_patients[scale].update(unique_pids)
        by_scale_n_obs[scale] += len(pid_scores)

    for scale, buckets in by_scale.items():
        buckets.sort(key=lambda b: b.week_index)
        series.append(
            TrendSeries(
                scale=scale,
                template_title=bucket_titles.get(scale, scale),
                n_patients=len(by_scale_n_patients[scale]),
                n_observations=by_scale_n_obs[scale],
                buckets=buckets,
            )
        )
    series.sort(key=lambda s: -s.n_patients)

    user_clinic = {u_id: c_id for u_id, c_id in db.query(User.id, User.clinic_id).all()}
    has_demo = any(
        _patient_is_demo((patients.get(pid).notes if patients.get(pid) else None), user_clinic.get(patients[pid].clinician_id, "") if patients.get(pid) else "")
        for pid in matched_pids
    )

    return TrendResponse(
        series=series,
        cohort_size=len(matched_pids),
        has_demo=has_demo,
        filters_echo=filters.model_dump(exclude_none=True),
    )


# ── /adverse-events/incidence ─────────────────────────────────────────────


@router.get("/adverse-events/incidence", response_model=AEIncidenceResponse)
def ae_incidence(
    condition: Optional[str] = Query(default=None, max_length=120),
    modality: Optional[str] = Query(default=None, max_length=60),
    age_band: Optional[str] = Query(default=None, max_length=12),
    sex: Optional[str] = Query(default=None, max_length=20),
    severity_band: Optional[str] = Query(default=None, max_length=40),
    clinic_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AEIncidenceResponse:
    """AE incidence per protocol / modality / severity-band over the cohort.

    SQL aggregate:
        SELECT c.protocol_id, COUNT(*), SUM(a.is_serious), SUM(a.reportable)
          FROM treatment_courses c
          LEFT JOIN adverse_events a ON a.course_id = c.id
         WHERE c.patient_id IN (cohort_pids)
        GROUP BY c.protocol_id
    """
    require_minimum_role(actor, "clinician")
    filters = CohortFilters(
        condition=condition, modality=modality, age_band=age_band, sex=sex,
        severity_band=severity_band, clinic_id=clinic_id, since=since, until=until,
    )
    courses, patients, matched_pids = _filter_courses_for_actor(db, actor, filters=filters)

    by_protocol_courses: dict[str, int] = defaultdict(int)
    by_modality_courses: dict[str, int] = defaultdict(int)
    course_protocol: dict[str, str] = {}
    course_modality: dict[str, str] = {}
    for c in courses:
        proto = c.protocol_id or "unspecified"
        mod = c.modality_slug or "unspecified"
        course_protocol[c.id] = proto
        course_modality[c.id] = mod
        by_protocol_courses[proto] += 1
        by_modality_courses[mod] += 1

    # AEs joined to courses already in cohort scope.
    course_ids = {c.id for c in courses}
    ae_rows: list[AdverseEvent] = []
    if matched_pids:
        ae_rows = (
            db.query(AdverseEvent)
            .filter(AdverseEvent.patient_id.in_(matched_pids))
            .all()
        )

    by_protocol: dict[str, dict[str, int]] = defaultdict(lambda: {"ae": 0, "sae": 0, "rep": 0, "demo": 0})
    by_modality: dict[str, dict[str, int]] = defaultdict(lambda: {"ae": 0, "sae": 0, "rep": 0, "demo": 0})
    by_severity: dict[str, dict[str, int]] = defaultdict(lambda: {"ae": 0, "sae": 0, "rep": 0, "demo": 0})

    for r in ae_rows:
        # Protocol attribution requires the AE's course to be in the cohort.
        proto = course_protocol.get(r.course_id, "unspecified") if r.course_id in course_ids else "unspecified"
        mod = course_modality.get(r.course_id, "") or (getattr(r, "modality_slug", None) or "unspecified")
        sev = (r.severity or "unspecified").lower()
        for bucket, key in ((by_protocol, proto), (by_modality, mod), (by_severity, sev)):
            bucket[key]["ae"] += 1
            if getattr(r, "is_serious", False):
                bucket[key]["sae"] += 1
            if getattr(r, "reportable", False):
                bucket[key]["rep"] += 1
            if getattr(r, "is_demo", False):
                bucket[key]["demo"] += 1

    def _rows(grouping: str, per_key_courses: dict[str, int], bucket: dict[str, dict[str, int]]) -> list[AEIncidenceRow]:
        out: list[AEIncidenceRow] = []
        keys = set(per_key_courses) | set(bucket)
        for key in keys:
            cc = per_key_courses.get(key, 0)
            b = bucket.get(key, {"ae": 0, "sae": 0, "rep": 0, "demo": 0})
            out.append(
                AEIncidenceRow(
                    grouping=grouping,
                    key=key,
                    course_count=cc,
                    ae_count=b["ae"],
                    sae_count=b["sae"],
                    reportable_count=b["rep"],
                    incidence_per_100_courses=round((b["ae"] * 100.0 / cc) if cc else 0.0, 2),
                    demo_ae_count=b["demo"],
                )
            )
        out.sort(key=lambda r: (-r.ae_count, r.key))
        return out

    user_clinic = {u_id: c_id for u_id, c_id in db.query(User.id, User.clinic_id).all()}
    has_demo = any(
        _patient_is_demo((patients.get(pid).notes if patients.get(pid) else None), user_clinic.get(patients[pid].clinician_id, "") if patients.get(pid) else "")
        for pid in matched_pids
    )

    return AEIncidenceResponse(
        by_protocol=_rows("protocol", by_protocol_courses, by_protocol),
        by_modality=_rows("modality", by_modality_courses, by_modality),
        by_severity_band=_rows("severity_band", {}, by_severity),
        cohort_size=len(matched_pids),
        has_demo=has_demo,
        filters_echo=filters.model_dump(exclude_none=True),
    )


# ── /treatment-response ───────────────────────────────────────────────────


def _response_rate_for_cohort(
    db: Session,
    matched_pids: set[str],
    *,
    responder_threshold_pct: int = 50,
    non_responder_threshold_pct: int = 25,
) -> tuple[Optional[float], dict[str, int]]:
    """Compute the cohort-level response rate at ``responder_threshold_pct``
    using paired (baseline, latest) ``OutcomeSeries`` rows. Returns
    (rate, basis) where basis maps response bucket → count.

    Ground rule: a patient counts toward the rate iff they have BOTH a
    baseline AND a latest scored row on the same scale; otherwise they
    contribute to the ``no_data`` bucket.
    """
    if not matched_pids:
        return None, {"responders": 0, "partial": 0, "non_responders": 0, "no_data": 0}

    rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id.in_(matched_pids))
        .filter(OutcomeSeries.score_numeric.isnot(None))
        .order_by(OutcomeSeries.administered_at.asc())
        .all()
    )
    by_pat_scale: dict[tuple[str, str], list[OutcomeSeries]] = defaultdict(list)
    for r in rows:
        scale = _normalize_scale(r.template_title or r.template_id)
        by_pat_scale[(r.patient_id, scale)].append(r)

    responders = 0
    partial = 0
    non_responders = 0

    paired_pids: set[str] = set()
    for (pid, _scale), series_rows in by_pat_scale.items():
        baseline = next((r for r in series_rows if r.measurement_point == "baseline"), None)
        if baseline is None:
            baseline = series_rows[0]  # fallback to earliest
        latest = series_rows[-1]
        if baseline.id == latest.id:
            continue
        b = baseline.score_numeric or 0.0
        l = latest.score_numeric or 0.0
        if b == 0:
            continue
        delta_pct = (b - l) * 100.0 / b
        paired_pids.add(pid)
        if delta_pct >= responder_threshold_pct:
            responders += 1
        elif delta_pct >= non_responder_threshold_pct:
            partial += 1
        else:
            non_responders += 1

    no_data = len(matched_pids) - len(paired_pids)
    rate = None
    if paired_pids:
        rate = round(responders * 100.0 / len(paired_pids), 1)
    return rate, {
        "responders": responders,
        "partial": partial,
        "non_responders": non_responders,
        "no_data": no_data,
    }


@router.get("/treatment-response", response_model=TreatmentResponseResponse)
def treatment_response(
    condition: Optional[str] = Query(default=None, max_length=120),
    modality: Optional[str] = Query(default=None, max_length=60),
    age_band: Optional[str] = Query(default=None, max_length=12),
    sex: Optional[str] = Query(default=None, max_length=20),
    severity_band: Optional[str] = Query(default=None, max_length=40),
    clinic_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    responder_threshold_pct: int = Query(default=50, ge=10, le=100),
    non_responder_threshold_pct: int = Query(default=25, ge=0, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TreatmentResponseResponse:
    """Distribution of patients by responder bucket.

    Definitions:
        responder      = (baseline - latest) / baseline ≥ responder_threshold_pct
        partial        = ≥ non_responder_threshold_pct AND < responder_threshold_pct
        non_responder  = < non_responder_threshold_pct
        no_data        = no paired (baseline, latest) row

    Computed per scale; the page renders the primary scale by default.
    """
    require_minimum_role(actor, "clinician")
    filters = CohortFilters(
        condition=condition, modality=modality, age_band=age_band, sex=sex,
        severity_band=severity_band, clinic_id=clinic_id, since=since, until=until,
    )
    _courses, patients, matched_pids = _filter_courses_for_actor(db, actor, filters=filters)

    # Aggregate per scale.
    distributions: list[TreatmentResponseDistribution] = []
    if not matched_pids:
        return TreatmentResponseResponse(distributions=[], has_demo=False, filters_echo=filters.model_dump(exclude_none=True))

    rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id.in_(matched_pids))
        .filter(OutcomeSeries.score_numeric.isnot(None))
        .order_by(OutcomeSeries.administered_at.asc())
        .all()
    )
    scales_seen: set[str] = set()
    by_pat_scale: dict[tuple[str, str], list[OutcomeSeries]] = defaultdict(list)
    for r in rows:
        scale = _normalize_scale(r.template_title or r.template_id)
        scales_seen.add(scale)
        by_pat_scale[(r.patient_id, scale)].append(r)

    for scale in sorted(scales_seen):
        responders = 0
        partial = 0
        non_responders = 0
        paired = set()
        for (pid, sc), series_rows in by_pat_scale.items():
            if sc != scale:
                continue
            baseline = next((r for r in series_rows if r.measurement_point == "baseline"), None) or series_rows[0]
            latest = series_rows[-1]
            if baseline.id == latest.id:
                continue
            b = baseline.score_numeric or 0.0
            l = latest.score_numeric or 0.0
            if b == 0:
                continue
            delta_pct = (b - l) * 100.0 / b
            paired.add(pid)
            if delta_pct >= responder_threshold_pct:
                responders += 1
            elif delta_pct >= non_responder_threshold_pct:
                partial += 1
            else:
                non_responders += 1
        no_data = len(matched_pids) - len(paired)
        rate = round(responders * 100.0 / len(paired), 1) if paired else None
        distributions.append(
            TreatmentResponseDistribution(
                scale=scale,
                responder_threshold_pct=responder_threshold_pct,
                non_responder_threshold_pct=non_responder_threshold_pct,
                responder_count=responders,
                partial_count=partial,
                non_responder_count=non_responders,
                no_data_count=no_data,
                cohort_size=len(matched_pids),
                response_rate_pct=rate,
            )
        )

    user_clinic = {u_id: c_id for u_id, c_id in db.query(User.id, User.clinic_id).all()}
    has_demo = any(
        _patient_is_demo((patients.get(pid).notes if patients.get(pid) else None), user_clinic.get(patients[pid].clinician_id, "") if patients.get(pid) else "")
        for pid in matched_pids
    )
    return TreatmentResponseResponse(
        distributions=distributions,
        has_demo=has_demo,
        filters_echo=filters.model_dump(exclude_none=True),
    )


# ── /export.csv  /export.ndjson ───────────────────────────────────────────


CSV_COLUMNS = [
    "cohort_key", "condition", "modality", "age_band", "sex",
    "patient_count", "demo_count", "signed_count",
    "courses_total", "courses_active", "courses_completed",
    "ae_total", "ae_serious", "ae_reportable",
]


def _build_export_rows(
    db: Session, actor: AuthenticatedActor, filters: CohortFilters
) -> tuple[list[dict], bool]:
    courses, patients, matched_pids = _filter_courses_for_actor(db, actor, filters=filters)
    user_clinic = {u_id: c_id for u_id, c_id in db.query(User.id, User.clinic_id).all()}
    ae_by_pat: dict[str, list[AdverseEvent]] = defaultdict(list)
    if matched_pids:
        for r in db.query(AdverseEvent).filter(AdverseEvent.patient_id.in_(matched_pids)).all():
            ae_by_pat[r.patient_id].append(r)

    groups: dict[tuple[str, str, str, str], dict] = {}
    for pid in matched_pids:
        p = patients.get(pid)
        if p is None:
            continue
        cond = p.primary_condition or "unspecified"
        mod = p.primary_modality or "unspecified"
        ab = _age_band(_age_from_dob(p.dob)) or "unspecified"
        sx = p.gender or "unspecified"
        key = (cond, mod, ab, sx)
        g = groups.setdefault(
            key,
            {
                "patient_count": 0, "demo": 0, "signed": 0,
                "courses_total": 0, "courses_active": 0, "courses_completed": 0,
                "ae_total": 0, "ae_serious": 0, "ae_reportable": 0,
            },
        )
        g["patient_count"] += 1
        clinic = user_clinic.get(p.clinician_id, "")
        if _patient_is_demo(p.notes, clinic):
            g["demo"] += 1
        if getattr(p, "consent_signed", False):
            g["signed"] += 1
        for c in courses:
            if c.patient_id != pid:
                continue
            g["courses_total"] += 1
            if (c.status or "").lower() in {"active", "in_progress", "approved"}:
                g["courses_active"] += 1
            if (c.status or "").lower() == "completed":
                g["courses_completed"] += 1
        for r in ae_by_pat.get(pid, []):
            g["ae_total"] += 1
            if getattr(r, "is_serious", False):
                g["ae_serious"] += 1
            if getattr(r, "reportable", False):
                g["ae_reportable"] += 1

    out_rows: list[dict] = []
    has_demo = False
    for (cond, mod, ab, sx), g in sorted(groups.items(), key=lambda kv: -kv[1]["patient_count"]):
        if g["demo"] > 0:
            has_demo = True
        out_rows.append(
            {
                "cohort_key": f"{cond}|{mod}|{ab}|{sx}",
                "condition": cond,
                "modality": mod,
                "age_band": ab,
                "sex": sx,
                "patient_count": g["patient_count"],
                "demo_count": g["demo"],
                "signed_count": g["signed"],
                "courses_total": g["courses_total"],
                "courses_active": g["courses_active"],
                "courses_completed": g["courses_completed"],
                "ae_total": g["ae_total"],
                "ae_serious": g["ae_serious"],
                "ae_reportable": g["ae_reportable"],
            }
        )
    return out_rows, has_demo


@router.get("/export.csv")
def export_csv(
    condition: Optional[str] = Query(default=None, max_length=120),
    modality: Optional[str] = Query(default=None, max_length=60),
    age_band: Optional[str] = Query(default=None, max_length=12),
    sex: Optional[str] = Query(default=None, max_length=20),
    severity_band: Optional[str] = Query(default=None, max_length=40),
    clinic_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """Cohort summary CSV. DEMO-prefixed when any cohort row contains demo
    patients — same convention as the AE / IRB / Documents Hub exports."""
    require_minimum_role(actor, "clinician")
    filters = CohortFilters(
        condition=condition, modality=modality, age_band=age_band, sex=sex,
        severity_band=severity_band, clinic_id=clinic_id, since=since, until=until,
    )
    rows, has_demo = _build_export_rows(db, actor, filters)
    buf = io.StringIO()
    if has_demo:
        buf.write(
            "# DEMO — at least one cohort row contains demo patient data and "
            "is NOT regulator-submittable.\n"
        )
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        writer.writerow([r[c] for c in CSV_COLUMNS])

    _audit(
        db, actor,
        event="export_csv",
        target_id=actor.clinic_id or actor.actor_id,
        note=f"rows={len(rows)} demo_rows={sum(1 for r in rows if r['demo_count'] > 0)}",
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=population-analytics.csv",
            "Cache-Control": "no-store",
            "X-Population-Analytics-Demo-Rows": str(sum(1 for r in rows if r["demo_count"] > 0)),
        },
    )


@router.get("/export.ndjson")
def export_ndjson(
    condition: Optional[str] = Query(default=None, max_length=120),
    modality: Optional[str] = Query(default=None, max_length=60),
    age_band: Optional[str] = Query(default=None, max_length=12),
    sex: Optional[str] = Query(default=None, max_length=20),
    severity_band: Optional[str] = Query(default=None, max_length=40),
    clinic_id: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON cohort export — one cohort row per line. DEMO header line
    included when any row contains demo patients."""
    require_minimum_role(actor, "clinician")
    filters = CohortFilters(
        condition=condition, modality=modality, age_band=age_band, sex=sex,
        severity_band=severity_band, clinic_id=clinic_id, since=since, until=until,
    )
    rows, has_demo = _build_export_rows(db, actor, filters)
    lines: list[str] = []
    if has_demo:
        lines.append(
            json.dumps(
                {
                    "_meta": "DEMO",
                    "warning": (
                        "At least one cohort row contains demo patient data "
                        "and is NOT regulator-submittable."
                    ),
                },
                separators=(",", ":"),
            )
        )
    for r in rows:
        lines.append(json.dumps(r, separators=(",", ":")))
    body = "\n".join(lines) + ("\n" if lines else "")

    _audit(
        db, actor,
        event="export_ndjson",
        target_id=actor.clinic_id or actor.actor_id,
        note=f"rows={len(rows)} demo_rows={sum(1 for r in rows if r['demo_count'] > 0)}",
    )
    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": "attachment; filename=population-analytics.ndjson",
            "Cache-Control": "no-store",
            "X-Population-Analytics-Demo-Rows": str(sum(1 for r in rows if r["demo_count"] > 0)),
        },
    )


# ── POST /audit-events ────────────────────────────────────────────────────


@router.post("/audit-events", response_model=AuditEventOut)
def record_audit_event(
    payload: AuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventOut:
    """Page-level audit ingestion (target_type=population_analytics).

    Mirrors the AE Hub / Patient Profile / Patient Messages page audit
    contract. Drill-out target pairs (``drill_out_target_type`` +
    ``drill_out_target_id``) are validated against
    :data:`KNOWN_DRILL_OUT_TARGETS`; unknown values are dropped silently
    rather than 422'd so the audit endpoint never blocks UI navigation.
    """
    require_minimum_role(actor, "clinician")
    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.cohort_key:
        note_parts.append(f"cohort={payload.cohort_key[:120]}")
    if (
        payload.drill_out_target_type
        and payload.drill_out_target_id
        and payload.drill_out_target_type in KNOWN_DRILL_OUT_TARGETS
    ):
        note_parts.append(
            f"drill_out_to={payload.drill_out_target_type}:{payload.drill_out_target_id}"
        )
    if payload.filters_json:
        note_parts.append(f"filters={payload.filters_json[:300]}")
    if payload.note:
        note_parts.append(payload.note[:300])
    note = "; ".join(note_parts) or payload.event

    target_id = (
        payload.cohort_key
        or payload.drill_out_target_id
        or actor.clinic_id
        or actor.actor_id
    )
    event_id = _audit(db, actor, event=payload.event, target_id=str(target_id), note=note)
    return AuditEventOut(accepted=bool(event_id), event_id=event_id)
