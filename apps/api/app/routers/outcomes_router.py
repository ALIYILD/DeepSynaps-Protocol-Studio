"""Outcomes router.

Endpoints
---------
POST  /api/v1/outcomes                      Record an outcome measurement (links to course)
GET   /api/v1/outcomes                      List measurements (filter by patient / course / template)
GET   /api/v1/outcomes/summary/{course_id}  Compute pre/post delta and responder status for a course
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import OutcomeEvent, OutcomeSeries, TreatmentCourse
<<<<<<< HEAD
from app.repositories.patients import resolve_patient_clinic_id
=======
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508

router = APIRouter(prefix="/api/v1/outcomes", tags=["Outcomes"])

# Common assessment templates whose lower score = improvement
_LOWER_IS_BETTER = {"PHQ-9", "GAD-7", "PCL-5", "ISI", "DASS-21", "NRS-Pain", "UPDRS-III", "ADHD-RS-5"}
# Templates where a HIGHER score = improvement (e.g. quality-of-life, functioning scales)
_HIGHER_IS_BETTER: set[str] = set()  # extend when higher-is-better scales are added
_LONGITUDINAL_TEMPLATES = ("PHQ-9", "GAD-7", "Y-BOCS")
_LONGITUDINAL_COLORS = ["#00d4bc", "#4a9eff", "#9b7fff", "#ffb547", "#ff6b6b"]


# ── Schemas ────────────────────────────────────────────────────────────────────

class OutcomeCreate(BaseModel):
    patient_id: str
    course_id: str
    template_id: str                    # e.g. "PHQ-9", "GAD-7"
    template_title: Optional[str] = None
    score: Optional[str] = None         # human-readable score e.g. "14"
    score_numeric: Optional[float] = None
    measurement_point: str = "mid"      # "baseline" | "mid" | "post" | "follow_up"
    assessment_id: Optional[str] = None
    administered_at: Optional[str] = None  # ISO; defaults to now


class OutcomeOut(BaseModel):
    id: str
    patient_id: str
    course_id: str
    assessment_id: Optional[str]
    template_id: str
    template_title: str
    score: Optional[str]
    score_numeric: Optional[float]
    measurement_point: str
    administered_at: str
    clinician_id: str
    created_at: str

    @classmethod
    def from_record(cls, r: OutcomeSeries) -> "OutcomeOut":
        def _dt(v) -> str:
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            course_id=r.course_id,
            assessment_id=r.assessment_id,
            template_id=r.template_id,
            template_title=r.template_title,
            score=r.score,
            score_numeric=r.score_numeric,
            measurement_point=r.measurement_point,
            administered_at=_dt(r.administered_at),
            clinician_id=r.clinician_id,
            created_at=_dt(r.created_at),
        )


class OutcomeListResponse(BaseModel):
    items: list[OutcomeOut]
    total: int


class OutcomeEventCreate(BaseModel):
    patient_id: str
    course_id: Optional[str] = None
    outcome_id: Optional[str] = None
    qeeg_analysis_id: Optional[str] = None
    mri_analysis_id: Optional[str] = None
    assessment_id: Optional[str] = None
    event_type: str
    title: str
    summary: Optional[str] = None
    severity: str = "info"
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    payload: dict = {}
    recorded_at: Optional[str] = None


class OutcomeEventOut(BaseModel):
    id: str
    patient_id: str
    course_id: Optional[str]
    outcome_id: Optional[str]
    qeeg_analysis_id: Optional[str]
    mri_analysis_id: Optional[str]
    assessment_id: Optional[str]
    event_type: str
    title: str
    summary: Optional[str]
    severity: str
    source_type: Optional[str]
    source_id: Optional[str]
    payload: dict
    recorded_at: str
    clinician_id: str
    created_at: str

    @classmethod
    def from_record(cls, r: OutcomeEvent) -> "OutcomeEventOut":
        def _dt(v) -> str:
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            course_id=r.course_id,
            outcome_id=r.outcome_id,
            qeeg_analysis_id=r.qeeg_analysis_id,
            mri_analysis_id=r.mri_analysis_id,
            assessment_id=r.assessment_id,
            event_type=r.event_type,
            title=r.title,
            summary=r.summary,
            severity=r.severity,
            source_type=r.source_type,
            source_id=r.source_id,
            payload=_coerce_json_object(r.payload_json),
            recorded_at=_dt(r.recorded_at),
            clinician_id=r.clinician_id,
            created_at=_dt(r.created_at),
        )


class OutcomeEventListResponse(BaseModel):
    items: list[OutcomeEventOut]
    total: int


class CourseSummary(BaseModel):
    course_id: str
    template_id: str
    template_title: str
    baseline_score: Optional[float]
    latest_score: Optional[float]
    delta: Optional[float]           # baseline - latest (positive = improvement for lower-is-better)
    pct_change: Optional[float]      # percentage change from baseline
    is_responder: Optional[bool]     # ≥50% reduction from baseline
    measurements: list[OutcomeOut]


class CourseSummaryListResponse(BaseModel):
    course_id: str
    summaries: list[CourseSummary]
    responder: Optional[bool]        # True if ANY template shows ≥50% reduction


# ── Helpers ────────────────────────────────────────────────────────────────────

def _compute_summary(course_id: str, records: list[OutcomeSeries]) -> CourseSummaryListResponse:
    by_template: dict[str, list[OutcomeSeries]] = {}
    for r in records:
        by_template.setdefault(r.template_id, []).append(r)

    summaries: list[CourseSummary] = []
    any_responder = False

    for tid, recs in by_template.items():
        scored = [r for r in recs if r.score_numeric is not None]
        scored_sorted = sorted(scored, key=lambda r: r.administered_at)

        baseline_rec = next((r for r in scored_sorted if r.measurement_point == "baseline"), None)
        latest_rec = scored_sorted[-1] if scored_sorted else None

        baseline = baseline_rec.score_numeric if baseline_rec else None
        latest = latest_rec.score_numeric if latest_rec else None

        delta: Optional[float] = None
        pct_change: Optional[float] = None
        is_responder: Optional[bool] = None

        if baseline is not None and latest is not None and baseline != 0:
            lower_better = tid in _LOWER_IS_BETTER
            higher_better = tid in _HIGHER_IS_BETTER
            if lower_better:
                delta = baseline - latest            # positive = improved
                pct_change = round(delta / baseline * 100, 1)
                is_responder = pct_change >= 50.0
            elif higher_better:
                delta = latest - baseline            # positive = improved
                pct_change = round(delta / baseline * 100, 1)
                is_responder = pct_change >= 50.0
            else:
                delta = latest - baseline
                pct_change = round(delta / baseline * 100, 1) if baseline else None
                is_responder = None  # direction unknown for this template

        if is_responder:
            any_responder = True

        title = recs[0].template_title if recs else tid
        summaries.append(CourseSummary(
            course_id=course_id,
            template_id=tid,
            template_title=title,
            baseline_score=baseline,
            latest_score=latest,
            delta=round(delta, 2) if delta is not None else None,
            pct_change=pct_change,
            is_responder=is_responder,
            measurements=[OutcomeOut.from_record(r) for r in sorted(recs, key=lambda r: r.administered_at)],
        ))

    return CourseSummaryListResponse(
        course_id=course_id,
        summaries=summaries,
        responder=any_responder if summaries else None,
    )


def _parse_iso_date_or_none(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _normalize_condition_slug(raw: Optional[str]) -> str:
    return (raw or "").strip().lower().replace(" ", "-").replace("_", "-")


def _coerce_json_object(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        loaded = json.loads(raw)
    except Exception:
        return {}
    return loaded if isinstance(loaded, dict) else {}


def _course_matches_cohort(course: TreatmentCourse, cohort: str) -> bool:
    norm = _normalize_condition_slug(cohort)
    if not norm or norm == "all":
        return True
    course_norm = _normalize_condition_slug(course.condition_slug)
    aliases = {
        "depression": {"depression", "mdd", "major-depressive-disorder", "treatment-resistant-depression"},
        "gad": {"gad", "generalized-anxiety", "generalized-anxiety-disorder", "anxiety"},
        "ocd": {"ocd", "obsessive-compulsive-disorder"},
        "ptsd": {"ptsd", "post-traumatic-stress-disorder"},
        "fibromyalgia": {"fibromyalgia"},
    }
    allowed = aliases.get(norm, {norm})
    return course_norm in allowed


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=OutcomeOut, status_code=201)
def record_outcome(
    body: OutcomeCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OutcomeOut:
    require_minimum_role(actor, "clinician")

    administered_at = datetime.now(timezone.utc)
    if body.administered_at:
        try:
            administered_at = datetime.fromisoformat(body.administered_at.rstrip("Z"))
        except ValueError:
            pass

    score_numeric = body.score_numeric
    if score_numeric is None and body.score:
        try:
            score_numeric = float(body.score)
        except ValueError:
            pass

    record = OutcomeSeries(
        patient_id=body.patient_id,
        course_id=body.course_id,
        assessment_id=body.assessment_id,
        template_id=body.template_id,
        template_title=body.template_title or body.template_id,
        score=body.score,
        score_numeric=score_numeric,
        measurement_point=body.measurement_point,
        administered_at=administered_at,
        clinician_id=actor.actor_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return OutcomeOut.from_record(record)


@router.get("", response_model=OutcomeListResponse)
def list_outcomes(
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    template_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OutcomeListResponse:
    require_minimum_role(actor, "clinician")

    q = db.query(OutcomeSeries)
    if actor.role != "admin":
        q = q.filter(OutcomeSeries.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(OutcomeSeries.patient_id == patient_id)
    if course_id:
        q = q.filter(OutcomeSeries.course_id == course_id)
    if template_id:
        q = q.filter(OutcomeSeries.template_id == template_id)

    records = q.order_by(OutcomeSeries.administered_at).all()
    items = [OutcomeOut.from_record(r) for r in records]
    return OutcomeListResponse(items=items, total=len(items))


@router.post("/events", response_model=OutcomeEventOut, status_code=201)
def record_outcome_event(
    body: OutcomeEventCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OutcomeEventOut:
    require_minimum_role(actor, "clinician")

<<<<<<< HEAD
    # Cross-clinic data-poisoning guard: a clinician at clinic B used to be
    # able to write an OutcomeEvent (severity="critical", title=…) against a
    # clinic A patient_id. monitor_service surfaces those events to clinic A
    # via a patient_id-scoped (not clinician-scoped) query, so the row would
    # show up as a "critical" alert next to the wrong clinic's patient.
    if body.patient_id:
        exists, patient_clinic_id = resolve_patient_clinic_id(db, body.patient_id)
        if exists:
            require_patient_owner(actor, patient_clinic_id)

=======
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
    recorded_at = datetime.now(timezone.utc)
    if body.recorded_at:
        try:
            recorded_at = datetime.fromisoformat(body.recorded_at.rstrip("Z"))
            if recorded_at.tzinfo is None:
                recorded_at = recorded_at.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    severity = (body.severity or "info").strip().lower()
    if severity not in {"info", "warning", "positive", "negative", "critical"}:
        severity = "info"

    record = OutcomeEvent(
        patient_id=body.patient_id,
        course_id=body.course_id,
        outcome_id=body.outcome_id,
        qeeg_analysis_id=body.qeeg_analysis_id,
        mri_analysis_id=body.mri_analysis_id,
        assessment_id=body.assessment_id,
        event_type=body.event_type,
        title=body.title,
        summary=body.summary,
        severity=severity,
        source_type=body.source_type,
        source_id=body.source_id,
        payload_json=json.dumps(body.payload or {}),
        recorded_at=recorded_at,
        clinician_id=actor.actor_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return OutcomeEventOut.from_record(record)


@router.get("/events", response_model=OutcomeEventListResponse)
def list_outcome_events(
    patient_id: Optional[str] = Query(default=None),
    course_id: Optional[str] = Query(default=None),
    qeeg_analysis_id: Optional[str] = Query(default=None),
    mri_analysis_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OutcomeEventListResponse:
    require_minimum_role(actor, "clinician")

    q = db.query(OutcomeEvent)
    if actor.role != "admin":
        q = q.filter(OutcomeEvent.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(OutcomeEvent.patient_id == patient_id)
    if course_id:
        q = q.filter(OutcomeEvent.course_id == course_id)
    if qeeg_analysis_id:
        q = q.filter(OutcomeEvent.qeeg_analysis_id == qeeg_analysis_id)
    if mri_analysis_id:
        q = q.filter(OutcomeEvent.mri_analysis_id == mri_analysis_id)

    rows = q.order_by(OutcomeEvent.recorded_at.desc(), OutcomeEvent.created_at.desc()).limit(limit).all()
    items = [OutcomeEventOut.from_record(row) for row in rows]
    return OutcomeEventListResponse(items=items, total=len(items))


@router.get("/summary/{course_id}", response_model=CourseSummaryListResponse)
def course_outcome_summary(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseSummaryListResponse:
    require_minimum_role(actor, "clinician")
    # Owner gate — only the course's owning clinician (or admin) can read its outcomes.
    course = db.query(TreatmentCourse).filter_by(id=course_id).first()
    if course is None:
        raise ApiServiceError(code="not_found", message="Treatment course not found.", status_code=404)
    if actor.role != "admin" and course.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Treatment course not found.", status_code=404)
    records = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.course_id == course_id)
        .order_by(OutcomeSeries.administered_at)
        .all()
    )
    return _compute_summary(course_id, records)


@router.get("/aggregate", response_model=dict)
def aggregate_outcomes(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Return aggregate responder stats across all courses for the actor."""
    require_minimum_role(actor, "clinician")

    q = db.query(OutcomeSeries)
    if actor.role != "admin":
        q = q.filter(OutcomeSeries.clinician_id == actor.actor_id)
    records = q.all()

    by_course: dict[str, list[OutcomeSeries]] = {}
    for r in records:
        by_course.setdefault(r.course_id, []).append(r)

    responder_count = 0
    course_count = len(by_course)
    phq9_deltas: list[float] = []

    for cid, recs in by_course.items():
        summary = _compute_summary(cid, recs)
        if summary.responder:
            responder_count += 1
        for s in summary.summaries:
            if s.template_id == "PHQ-9" and s.delta is not None:
                phq9_deltas.append(s.delta)

    avg_phq9_drop = round(sum(phq9_deltas) / len(phq9_deltas), 1) if phq9_deltas else None

    # Responder rate: proportion of courses-with-outcomes where any template shows ≥50% reduction
    responder_rate_pct: Optional[float] = None
    if course_count > 0:
        responder_rate_pct = round(responder_count / course_count * 100, 1)

    # Assessment completion: proportion of outcome records that have a numeric score
    total_records = len(records)
    scored_records = sum(1 for r in records if r.score_numeric is not None)
    assessment_completion_pct: Optional[float] = None
    if total_records > 0:
        assessment_completion_pct = round(scored_records / total_records * 100, 1)

    # Assessments overdue: active-course patients with no outcome in the last 7 days
    course_q = db.query(TreatmentCourse.patient_id).filter(TreatmentCourse.status == "active")
    if actor.role != "admin":
        course_q = course_q.filter(TreatmentCourse.clinician_id == actor.actor_id)
    active_patient_ids = {row[0] for row in course_q.distinct().all()}

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    outcome_q = db.query(OutcomeSeries.patient_id).filter(
        OutcomeSeries.administered_at >= seven_days_ago,
    )
    if actor.role != "admin":
        outcome_q = outcome_q.filter(OutcomeSeries.clinician_id == actor.actor_id)
    recently_assessed_ids = {row[0] for row in outcome_q.distinct().all()}

    assessments_overdue_count = len(active_patient_ids - recently_assessed_ids)

    return {
        "courses_with_outcomes": course_count,
        "responders": responder_count,
        "avg_phq9_drop": avg_phq9_drop,
        "responder_rate_pct": responder_rate_pct,
        "assessment_completion_pct": assessment_completion_pct,
        "assessments_overdue_count": assessments_overdue_count,
    }


@router.get("/longitudinal", response_model=dict)
def longitudinal_outcomes(
    cohort: str = Query(default="all"),
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Return lightweight cohort-level longitudinal outcome series for the research UI."""
    require_minimum_role(actor, "clinician")

    start = _parse_iso_date_or_none(date_from) or (datetime.now(timezone.utc) - timedelta(days=70))
    end = _parse_iso_date_or_none(date_to) or datetime.now(timezone.utc)
    if end < start:
        raise ApiServiceError(
            code="invalid_range",
            message="'to' must be on or after 'from'.",
            status_code=422,
        )

    course_q = db.query(TreatmentCourse)
    if actor.role != "admin":
        course_q = course_q.filter(TreatmentCourse.clinician_id == actor.actor_id)
    courses = [course for course in course_q.all() if _course_matches_cohort(course, cohort)]
    course_map = {course.id: course for course in courses}
    if not course_map:
        return {
            "cohort": cohort,
            "from": start.date().isoformat(),
            "to": end.date().isoformat(),
            "series": {},
            "responderByModality": [],
        }

    bucket_count = 10
    total_seconds = max((end - start).total_seconds(), 1.0)
    bucket_seconds = total_seconds / bucket_count

    def _bucket_index(ts: datetime) -> int:
        if ts <= start:
            return 0
        if ts >= end:
            return bucket_count - 1
        idx = int((ts - start).total_seconds() / bucket_seconds)
        return max(0, min(bucket_count - 1, idx))

    outcomes_q = db.query(OutcomeSeries).filter(OutcomeSeries.course_id.in_(list(course_map.keys())))
    if actor.role != "admin":
        outcomes_q = outcomes_q.filter(OutcomeSeries.clinician_id == actor.actor_id)
    outcomes_q = outcomes_q.filter(OutcomeSeries.administered_at >= start, OutcomeSeries.administered_at <= end)
    outcome_rows = outcomes_q.order_by(OutcomeSeries.administered_at).all()

    series: dict[str, list[float]] = {}
    for template_id in _LONGITUDINAL_TEMPLATES:
        bucket_values: list[list[float]] = [[] for _ in range(bucket_count)]
        for row in outcome_rows:
            if row.template_id != template_id or row.score_numeric is None:
                continue
            bucket_values[_bucket_index(row.administered_at)].append(float(row.score_numeric))
        flat = [v for bucket in bucket_values for v in bucket]
        if not flat:
            continue
        carry = round(sum(flat) / len(flat), 1)
        points: list[float] = []
        for bucket in bucket_values:
            if bucket:
                carry = round(sum(bucket) / len(bucket), 1)
            points.append(carry)
        series[template_id] = points

    responder_by_modality: list[dict] = []
    modality_groups: dict[str, list[TreatmentCourse]] = {}
    for course in courses:
        modality_groups.setdefault(course.modality_slug or "unknown", []).append(course)

    for idx, (modality, modality_courses) in enumerate(sorted(modality_groups.items(), key=lambda item: item[0])):
        baseline_by_course: dict[str, float] = {}
        progress_buckets: list[list[bool]] = [[] for _ in range(bucket_count)]
        modality_course_ids = {course.id for course in modality_courses}
        modality_rows = [row for row in outcome_rows if row.course_id in modality_course_ids and row.score_numeric is not None and row.template_id in _LONGITUDINAL_TEMPLATES]
        if not modality_rows:
            continue
        for course in modality_courses:
            course_records = [row for row in modality_rows if row.course_id == course.id]
            baseline_rec = next((row for row in course_records if row.measurement_point == "baseline"), None)
            if baseline_rec is None and course_records:
                baseline_rec = sorted(course_records, key=lambda row: row.administered_at)[0]
            if baseline_rec and baseline_rec.score_numeric not in (None, 0):
                baseline_by_course[course.id] = float(baseline_rec.score_numeric)
        if not baseline_by_course:
            continue
        for bucket_idx in range(bucket_count):
            bucket_end = start + timedelta(seconds=bucket_seconds * (bucket_idx + 1))
            for course in modality_courses:
                baseline = baseline_by_course.get(course.id)
                if baseline in (None, 0):
                    continue
                course_records = [
                    row for row in modality_rows
                    if row.course_id == course.id and row.administered_at <= bucket_end and row.template_id in _LOWER_IS_BETTER
                ]
                if not course_records:
                    continue
                latest = sorted(course_records, key=lambda row: row.administered_at)[-1]
                reduction = ((baseline - float(latest.score_numeric)) / baseline) * 100 if latest.score_numeric is not None else 0
                progress_buckets[bucket_idx].append(reduction >= 50.0)
        rate = [
            round((sum(1 for hit in bucket if hit) / len(bucket)) * 100, 1) if bucket else 0.0
            for bucket in progress_buckets
        ]
        responder_by_modality.append({
            "modality": modality,
            "rate": rate,
            "color": _LONGITUDINAL_COLORS[idx % len(_LONGITUDINAL_COLORS)],
        })

    return {
        "cohort": cohort,
        "from": start.date().isoformat(),
        "to": end.date().isoformat(),
        "series": series,
        "responderByModality": responder_by_modality,
    }
