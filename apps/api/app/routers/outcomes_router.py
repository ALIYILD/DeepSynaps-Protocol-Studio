"""Outcomes router.

Endpoints
---------
POST  /api/v1/outcomes                      Record an outcome measurement (links to course)
GET   /api/v1/outcomes                      List measurements (filter by patient / course / template)
GET   /api/v1/outcomes/summary/{course_id}  Compute pre/post delta and responder status for a course
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import OutcomeSeries

router = APIRouter(prefix="/api/v1/outcomes", tags=["Outcomes"])

# Common assessment templates whose lower score = improvement
_LOWER_IS_BETTER = {"PHQ-9", "GAD-7", "PCL-5", "ISI", "DASS-21", "NRS-Pain", "UPDRS-III"}
_HIGHER_IS_BETTER = {"ADHD-RS-5"}   # higher = worse in ADHD-RS, keep lower_is_better logic


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
            if lower_better:
                delta = baseline - latest            # positive = improved
                pct_change = round(delta / baseline * 100, 1)
                is_responder = pct_change >= 50.0
            else:
                delta = latest - baseline
                pct_change = round(delta / baseline * 100, 1) if baseline else None
                is_responder = None  # not applicable generically

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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=OutcomeOut, status_code=201)
def record_outcome(
    body: OutcomeCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OutcomeOut:
    require_minimum_role(actor, "clinician")

    administered_at = datetime.utcnow()
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


@router.get("/summary/{course_id}", response_model=CourseSummaryListResponse)
def course_outcome_summary(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseSummaryListResponse:
    require_minimum_role(actor, "clinician")
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

    return {
        "courses_with_outcomes": course_count,
        "responders": responder_count,
        "avg_phq9_drop": avg_phq9_drop,
    }
