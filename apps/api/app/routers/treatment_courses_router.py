"""Treatment courses router.

Endpoints
---------
POST   /api/v1/treatment-courses                              Create a new treatment course
GET    /api/v1/treatment-courses                              List courses (filter by patient, status)
GET    /api/v1/treatment-courses/{id}/personalization-explainability   Stored personalization snapshot (if any)
GET    /api/v1/treatment-courses/{id}                         Get course detail
PATCH  /api/v1/treatment-courses/{id}                       Update notes / status
PATCH  /api/v1/treatment-courses/{id}/activate              Governance gate → approve + activate
POST   /api/v1/treatment-courses/{id}/sessions              Log a delivered session
GET    /api/v1/treatment-courses/{id}/sessions              List delivered sessions for a course
GET    /api/v1/review-queue                                 List pending review queue items
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from deepsynaps_core_schema import PersistedPersonalizationExplainability

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    DeliveredSessionParameters,
    ReviewQueueItem,
    TreatmentCourse,
)
from app.services.protocol_registry import build_course_structure_from_protocol, get_protocol_parameters
from app.services.registries import get_condition, get_protocol

router = APIRouter(prefix="/api/v1/treatment-courses", tags=["Treatment Courses"])
review_router = APIRouter(prefix="/api/v1/review-queue", tags=["Review Queue"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class CourseCreate(BaseModel):
    patient_id: str
    protocol_id: str                          # Registry Protocol_ID (e.g. "P001")
    condition_slug: Optional[str] = None      # Override — inferred from registry if omitted
    modality_slug: Optional[str] = None       # Override — inferred from registry if omitted
    device_slug: Optional[str] = None
    phenotype_id: Optional[str] = None
    clinician_notes: Optional[str] = None
    # Optional compact snapshot from generate-draft when include_personalization_debug was true (never fabricated).
    personalization_explainability: Optional[PersistedPersonalizationExplainability] = None


class CourseUpdate(BaseModel):
    clinician_notes: Optional[str] = None
    status: Optional[str] = None             # Only admin/clinician may set; activate endpoint preferred


class CourseActivate(BaseModel):
    notes: Optional[str] = None             # Optional approval note


class CourseOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    protocol_id: str
    condition_slug: str
    modality_slug: str
    device_slug: Optional[str]
    target_region: Optional[str]
    phenotype_id: Optional[str]
    evidence_grade: Optional[str]
    on_label: bool
    planned_sessions_total: int
    planned_sessions_per_week: int
    planned_session_duration_minutes: int
    planned_frequency_hz: Optional[str]
    planned_intensity: Optional[str]
    coil_placement: Optional[str]
    status: str
    approved_by: Optional[str]
    approved_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    sessions_delivered: int
    clinician_notes: Optional[str]
    review_required: bool
    governance_warnings: list[str]
    personalization_explainability: Optional[PersistedPersonalizationExplainability] = None
    created_at: str
    updated_at: str

    @classmethod
    def from_record(
        cls,
        r: TreatmentCourse,
        governance_warnings: list[str] | None = None,
        *,
        include_personalization_explainability: bool = False,
    ) -> "CourseOut":
        def _dt(v) -> Optional[str]:
            return v.isoformat() if isinstance(v, datetime) else v

        protocol_json = {}
        if r.protocol_json:
            try:
                protocol_json = json.loads(r.protocol_json)
            except Exception:
                pass

        persisted: PersistedPersonalizationExplainability | None = None
        if include_personalization_explainability:
            raw_pe = protocol_json.get("personalization_explainability")
            if raw_pe is not None:
                try:
                    persisted = PersistedPersonalizationExplainability.model_validate(raw_pe)
                except Exception:
                    persisted = None

        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            protocol_id=r.protocol_id,
            condition_slug=r.condition_slug,
            modality_slug=r.modality_slug,
            device_slug=r.device_slug,
            target_region=r.target_region,
            phenotype_id=r.phenotype_id,
            evidence_grade=r.evidence_grade,
            on_label=r.on_label,
            planned_sessions_total=r.planned_sessions_total,
            planned_sessions_per_week=r.planned_sessions_per_week,
            planned_session_duration_minutes=r.planned_session_duration_minutes,
            planned_frequency_hz=r.planned_frequency_hz,
            planned_intensity=r.planned_intensity,
            coil_placement=r.coil_placement,
            status=r.status,
            approved_by=r.approved_by,
            approved_at=_dt(r.approved_at),
            started_at=_dt(r.started_at),
            completed_at=_dt(r.completed_at),
            sessions_delivered=r.sessions_delivered,
            clinician_notes=r.clinician_notes,
            review_required=r.review_required,
            governance_warnings=governance_warnings or protocol_json.get("governance_warnings", []),
            personalization_explainability=persisted,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class CourseListResponse(BaseModel):
    items: list[CourseOut]
    total: int


# ── Delivered session schemas ──────────────────────────────────────────────────

class SessionLog(BaseModel):
    device_slug: Optional[str] = None
    device_serial: Optional[str] = None
    coil_position: Optional[str] = None
    frequency_hz: Optional[str] = None
    intensity_pct_rmt: Optional[str] = None
    pulses_delivered: Optional[int] = None
    duration_minutes: Optional[int] = None
    side: Optional[str] = None
    montage: Optional[str] = None
    tolerance_rating: Optional[str] = None   # "well-tolerated" | "moderate" | "poor"
    interruptions: bool = False
    interruption_reason: Optional[str] = None
    post_session_notes: Optional[str] = None
    checklist: dict = {}                      # Technician safety checklist responses


class SessionLogOut(BaseModel):
    id: str
    course_id: str
    session_id: str
    device_slug: Optional[str]
    coil_position: Optional[str]
    frequency_hz: Optional[str]
    intensity_pct_rmt: Optional[str]
    pulses_delivered: Optional[int]
    duration_minutes: Optional[int]
    tolerance_rating: Optional[str]
    interruptions: bool
    interruption_reason: Optional[str]
    post_session_notes: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: DeliveredSessionParameters) -> "SessionLogOut":
        return cls(
            id=r.id,
            course_id=r.course_id,
            session_id=r.session_id,
            device_slug=r.device_slug,
            coil_position=r.coil_position,
            frequency_hz=r.frequency_hz,
            intensity_pct_rmt=r.intensity_pct_rmt,
            pulses_delivered=r.pulses_delivered,
            duration_minutes=r.duration_minutes,
            tolerance_rating=r.tolerance_rating,
            interruptions=r.interruptions,
            interruption_reason=r.interruption_reason,
            post_session_notes=r.post_session_notes,
            created_at=r.created_at.isoformat(),
        )


class SessionLogListResponse(BaseModel):
    items: list[SessionLogOut]
    total: int


# ── Review queue schema ────────────────────────────────────────────────────────

class ReviewQueueOut(BaseModel):
    id: str
    item_type: str
    target_id: str
    target_type: str
    patient_id: str
    patient_name: Optional[str]        # enriched: "{first} {last}" from Patient record
    course_id: Optional[str]           # alias for target_id when target_type == "treatment_course"
    course_name: Optional[str]         # "{condition_slug} · {modality_slug}"
    condition_slug: Optional[str]      # enriched from linked TreatmentCourse
    modality_slug: Optional[str]       # enriched from linked TreatmentCourse
    primary_condition: Optional[str]   # enriched from Patient record
    assigned_to: Optional[str]
    priority: str
    status: str
    created_by: str
    due_by: Optional[str]
    notes: Optional[str]
    created_at: str

    @classmethod
    def from_record(
        cls,
        r: ReviewQueueItem,
        patient_name: Optional[str] = None,
        condition_slug: Optional[str] = None,
        modality_slug: Optional[str] = None,
        primary_condition: Optional[str] = None,
    ) -> "ReviewQueueOut":
        def _dt(v) -> Optional[str]:
            return v.isoformat() if isinstance(v, datetime) else v

        course_id = r.target_id if r.target_type == "treatment_course" else None
        course_name: Optional[str] = None
        if condition_slug and modality_slug:
            course_name = f"{condition_slug} · {modality_slug}"
        elif condition_slug:
            course_name = condition_slug

        return cls(
            id=r.id,
            item_type=r.item_type,
            target_id=r.target_id,
            target_type=r.target_type,
            patient_id=r.patient_id,
            patient_name=patient_name,
            course_id=course_id,
            course_name=course_name,
            condition_slug=condition_slug,
            modality_slug=modality_slug,
            primary_condition=primary_condition,
            assigned_to=r.assigned_to,
            priority=r.priority,
            status=r.status,
            created_by=r.created_by,
            due_by=_dt(r.due_by),
            notes=r.notes,
            created_at=r.created_at.isoformat(),
        )


class ReviewQueueListResponse(BaseModel):
    items: list[ReviewQueueOut]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _run_governance(params: dict, actor: AuthenticatedActor) -> list[str]:
    """Apply governance rules and return warning strings."""
    from deepsynaps_safety_engine import apply_governance_rules
    on_label: bool = params.get("on_label", True)
    evidence_grade: str = params.get("evidence_grade", "EV-B")
    warnings = apply_governance_rules(on_label, evidence_grade, actor.role)
    return warnings


def _get_course_or_404(db: Session, course_id: str, actor: AuthenticatedActor) -> TreatmentCourse:
    course = db.query(TreatmentCourse).filter_by(id=course_id).first()
    if course is None:
        raise ApiServiceError(code="not_found", message="Treatment course not found.", status_code=404)
    # Clinicians can only see their own courses; admins see all
    if actor.role != "admin" and course.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Treatment course not found.", status_code=404)
    return course


def _push_review_queue(db: Session, course: TreatmentCourse, actor: AuthenticatedActor) -> None:
    item = ReviewQueueItem(
        item_type="protocol_approval",
        target_id=course.id,
        target_type="treatment_course",
        patient_id=course.patient_id,
        priority="normal",
        status="pending",
        created_by=actor.actor_id,
    )
    db.add(item)


# ── Course endpoints ───────────────────────────────────────────────────────────

@router.post("", response_model=CourseOut, status_code=201)
def create_course(
    body: CourseCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseOut:
    require_minimum_role(actor, "clinician")

    # Resolve protocol from registry
    params = get_protocol_parameters(body.protocol_id)
    if params is None:
        # Protocol ID not found — try fetching raw and building
        raw_proto = get_protocol(body.protocol_id)
        if raw_proto is None:
            raise ApiServiceError(
                code="protocol_not_found",
                message=f"Protocol '{body.protocol_id}' not found in registry.",
                status_code=404,
            )
        params = build_course_structure_from_protocol(raw_proto)

    # Validate protocol has a usable session count
    total_sessions = params.get("total_sessions", 0)
    if not total_sessions or int(total_sessions) < 1:
        raise ApiServiceError(
            code="invalid_protocol",
            message="Protocol has no valid session count (planned_sessions_total must be ≥ 1).",
            status_code=422,
        )

    # Run governance checks
    gov_warnings = _run_governance(params, actor)

    # Hard block on EV-D
    if any("EV-D" in w for w in gov_warnings):
        raise ApiServiceError(
            code="governance_block",
            message="Protocol blocked by governance rules (EV-D evidence level).",
            warnings=gov_warnings,
            status_code=403,
        )

    # Resolve condition/modality slugs from registry if not provided
    condition_slug = body.condition_slug or ""
    modality_slug = body.modality_slug or ""

    if not condition_slug or not modality_slug:
        raw_proto = get_protocol(body.protocol_id)
        if raw_proto:
            condition_slug = condition_slug or raw_proto.get("Condition_ID", "")
            modality_slug = modality_slug or raw_proto.get("Modality_ID", "")

    needs_review = params.get("clinician_review_required", True) or bool(gov_warnings)

    protocol_meta = {
        "governance_warnings": gov_warnings,
        "protocol_name": params.get("protocol_name", ""),
        "evidence_grade": params.get("evidence_grade", ""),
        "on_label": params.get("on_label", True),
    }

    if body.personalization_explainability is not None:
        snap = body.personalization_explainability
        if snap.selected_protocol_id != body.protocol_id:
            raise ApiServiceError(
                code="personalization_explainability_mismatch",
                message="personalization_explainability.selected_protocol_id must match protocol_id for this course.",
                status_code=422,
            )
        protocol_meta["personalization_explainability"] = snap.model_dump(mode="json")

    course = TreatmentCourse(
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        protocol_id=body.protocol_id,
        condition_slug=condition_slug,
        modality_slug=modality_slug,
        device_slug=body.device_slug,
        phenotype_id=body.phenotype_id,
        evidence_grade=params.get("evidence_grade", ""),
        on_label=params.get("on_label", True),
        planned_sessions_total=params.get("total_sessions", 20),
        planned_sessions_per_week=params.get("sessions_per_week", 5),
        planned_session_duration_minutes=params.get("session_duration_minutes", 40),
        planned_frequency_hz=str(params.get("frequency_hz", "")),
        planned_intensity=str(params.get("intensity", "")),
        coil_placement=str(params.get("coil_placement", "")),
        target_region=str(params.get("target_region", "")),
        status="pending_approval",
        review_required=needs_review,
        clinician_notes=body.clinician_notes,
        protocol_json=json.dumps(protocol_meta),
    )
    db.add(course)
    db.flush()  # get the id before commit

    if needs_review:
        _push_review_queue(db, course, actor)

    db.commit()
    db.refresh(course)
    return CourseOut.from_record(
        course,
        gov_warnings,
        include_personalization_explainability=body.personalization_explainability is not None,
    )


@router.get("", response_model=CourseListResponse)
def list_courses(
    patient_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseListResponse:
    require_minimum_role(actor, "clinician")

    q = db.query(TreatmentCourse)
    if actor.role != "admin":
        q = q.filter(TreatmentCourse.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(TreatmentCourse.patient_id == patient_id)
    if status:
        q = q.filter(TreatmentCourse.status == status)

    records = q.order_by(TreatmentCourse.created_at.desc()).all()
    items = [CourseOut.from_record(r) for r in records]
    return CourseListResponse(items=items, total=len(items))


@router.get("/{course_id}/personalization-explainability", response_model=PersistedPersonalizationExplainability)
def get_course_personalization_explainability(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PersistedPersonalizationExplainability:
    """Return the stored compact personalization snapshot (404 if none). Admin or owning clinician."""
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)
    protocol_json: dict = {}
    if course.protocol_json:
        try:
            protocol_json = json.loads(course.protocol_json)
        except Exception:
            protocol_json = {}
    raw = protocol_json.get("personalization_explainability")
    if raw is None:
        raise ApiServiceError(
            code="personalization_explainability_not_found",
            message="No personalization explainability snapshot was stored for this course.",
            status_code=404,
        )
    try:
        return PersistedPersonalizationExplainability.model_validate(raw)
    except Exception:
        raise ApiServiceError(
            code="personalization_explainability_invalid",
            message="Stored personalization explainability could not be read.",
            status_code=422,
        )


@router.get("/{course_id}", response_model=CourseOut)
def get_course(
    course_id: str,
    include_personalization_explainability: bool = Query(
        default=False,
        description="When true, include personalization_explainability from protocol_json (if stored).",
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseOut:
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)
    return CourseOut.from_record(course, include_personalization_explainability=include_personalization_explainability)


@router.patch("/{course_id}", response_model=CourseOut)
def update_course(
    course_id: str,
    body: CourseUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseOut:
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)

    if body.clinician_notes is not None:
        course.clinician_notes = body.clinician_notes
    if body.status is not None:
        require_minimum_role(actor, "admin")
        course.status = body.status

    course.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(course)
    return CourseOut.from_record(course)


@router.patch("/{course_id}/activate", response_model=CourseOut)
def activate_course(
    course_id: str,
    body: CourseActivate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseOut:
    """Governance gate: run checks then approve and activate the course.

    Requires clinician role at minimum.  Re-runs governance rules and surfaces
    any warnings.  Hard blocks (EV-D) prevent activation.
    """
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)

    if course.status not in ("pending_approval", "paused"):
        raise ApiServiceError(
            code="invalid_state",
            message=f"Cannot activate a course with status '{course.status}'.",
            status_code=422,
        )

    # Re-run governance with current course data
    from deepsynaps_safety_engine import apply_governance_rules
    gov_warnings = apply_governance_rules(course.on_label, course.evidence_grade or "EV-B", actor.role)
    if any("EV-D" in w for w in gov_warnings):
        raise ApiServiceError(
            code="governance_block",
            message="Protocol blocked by governance rules (EV-D evidence level).",
            warnings=gov_warnings,
            status_code=403,
        )

    now = datetime.now(timezone.utc)
    course.status = "active"
    course.approved_by = actor.actor_id
    course.approved_at = now
    if course.started_at is None:
        course.started_at = now
    course.updated_at = now

    # Close any pending review queue items for this course
    db.query(ReviewQueueItem).filter_by(
        target_id=course_id, status="pending"
    ).update({"status": "completed", "completed_at": now})

    db.commit()
    db.refresh(course)
    return CourseOut.from_record(course, gov_warnings)


# ── Delivered session endpoints ────────────────────────────────────────────────

@router.post("/{course_id}/sessions", response_model=SessionLogOut, status_code=201)
def log_session(
    course_id: str,
    body: SessionLog,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SessionLogOut:
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)

    if course.status != "active":
        raise ApiServiceError(
            code="invalid_state",
            message="Sessions can only be logged for active courses.",
            status_code=422,
        )

    import uuid as uuid_mod
    session_id = str(uuid_mod.uuid4())

    record = DeliveredSessionParameters(
        session_id=session_id,
        course_id=course_id,
        device_slug=body.device_slug or course.device_slug,
        device_serial=body.device_serial,
        coil_position=body.coil_position or course.coil_placement,
        frequency_hz=body.frequency_hz or course.planned_frequency_hz,
        intensity_pct_rmt=body.intensity_pct_rmt or course.planned_intensity,
        pulses_delivered=body.pulses_delivered,
        duration_minutes=body.duration_minutes or course.planned_session_duration_minutes,
        side=body.side,
        montage=body.montage,
        tech_id=actor.actor_id,
        tolerance_rating=body.tolerance_rating,
        interruptions=body.interruptions,
        interruption_reason=body.interruption_reason,
        post_session_notes=body.post_session_notes,
        checklist_json=json.dumps(body.checklist) if body.checklist else None,
    )
    db.add(record)

    # Increment delivered counter
    course.sessions_delivered = (course.sessions_delivered or 0) + 1

    # Auto-complete if all sessions delivered
    if course.sessions_delivered >= course.planned_sessions_total:
        course.status = "completed"
        course.completed_at = datetime.now(timezone.utc)

    course.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    # Broadcast session_logged notification to the course's clinician (if different from actor)
    if course.clinician_id and course.clinician_id != actor.actor_id:
        import asyncio as _asyncio
        from app.routers.notifications_router import broadcast_to_user as _broadcast

        # Fetch patient name for the notification
        from app.persistence.models import Patient as _Patient
        _patient = db.query(_Patient).filter_by(id=course.patient_id).first()
        _patient_name = (
            f"{_patient.first_name} {_patient.last_name}" if _patient else course.patient_id
        )

        _asyncio.ensure_future(
            _broadcast(
                str(course.clinician_id),
                "session_logged",
                {
                    "course_id": str(course_id),
                    "session_number": course.sessions_delivered,
                    "patient_name": _patient_name,
                    "logged_by": actor.display_name,
                },
            )
        )

    return SessionLogOut.from_record(record)


@router.get("/{course_id}/sessions", response_model=SessionLogListResponse)
def list_sessions(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SessionLogListResponse:
    require_minimum_role(actor, "clinician")
    _get_course_or_404(db, course_id, actor)  # access check

    records = (
        db.query(DeliveredSessionParameters)
        .filter_by(course_id=course_id)
        .order_by(DeliveredSessionParameters.created_at)
        .all()
    )
    items = [SessionLogOut.from_record(r) for r in records]
    return SessionLogListResponse(items=items, total=len(items))


# ── Review queue router ────────────────────────────────────────────────────────

@review_router.get("", response_model=ReviewQueueListResponse)
def list_review_queue(
    status: Optional[str] = Query(default=None, description="pending | completed"),
    reviewer_id: Optional[str] = Query(default=None, description="Filter by assigned reviewer (assigned_to)"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReviewQueueListResponse:
    require_minimum_role(actor, "clinician")

    q = db.query(ReviewQueueItem)
    if actor.role != "admin":
        q = q.filter(
            or_(
                ReviewQueueItem.created_by == actor.actor_id,
                ReviewQueueItem.assigned_to == actor.actor_id,
            )
        )
    if status:
        q = q.filter(ReviewQueueItem.status == status)
    if reviewer_id:
        q = q.filter(ReviewQueueItem.assigned_to == reviewer_id)

    records = q.order_by(ReviewQueueItem.created_at.desc()).all()

    # Enrich with patient name + course details via lookup
    from app.persistence.models import Patient as _Patient

    patient_ids = list({r.patient_id for r in records if r.patient_id})
    course_ids  = list({r.target_id  for r in records if r.target_type == "treatment_course"})

    patients_by_id: dict[str, _Patient] = {}
    if patient_ids:
        for p in db.query(_Patient).filter(_Patient.id.in_(patient_ids)).all():
            patients_by_id[p.id] = p

    courses_by_id: dict[str, TreatmentCourse] = {}
    if course_ids:
        for c in db.query(TreatmentCourse).filter(TreatmentCourse.id.in_(course_ids)).all():
            courses_by_id[c.id] = c

    items: list[ReviewQueueOut] = []
    for r in records:
        pt = patients_by_id.get(r.patient_id)
        patient_name = (
            f"{pt.first_name} {pt.last_name}".strip() if pt else None
        )
        primary_condition = pt.primary_condition if pt else None

        course = courses_by_id.get(r.target_id) if r.target_type == "treatment_course" else None
        condition_slug = course.condition_slug if course else None
        modality_slug  = course.modality_slug  if course else None

        items.append(ReviewQueueOut.from_record(
            r,
            patient_name=patient_name,
            condition_slug=condition_slug,
            modality_slug=modality_slug,
            primary_condition=primary_condition,
        ))

    return ReviewQueueListResponse(items=items, total=len(items))


# ── Reviewer assignment endpoint ───────────────────────────────────────────────

class AssignReviewerBody(BaseModel):
    assigned_to: Optional[str] = None  # None / empty string → unassign


@review_router.patch("/{item_id}/assign", status_code=200)
def assign_reviewer(
    item_id: str,
    body: AssignReviewerBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Assign (or unassign) a reviewer to a review queue item."""
    require_minimum_role(actor, "clinician")
    item = db.query(ReviewQueueItem).filter_by(id=item_id).first()
    if item is None:
        raise ApiServiceError(code='not_found', message='Review queue item not found.', status_code=404)
    # Non-admins may only reassign items they created.
    if actor.role != 'admin' and item.created_by != actor.actor_id:
        raise ApiServiceError(
            code='forbidden',
            message='Not authorized to assign this review item.',
            status_code=403,
        )
    item.assigned_to = body.assigned_to or None
    db.commit()
    return {'ok': True, 'item_id': item_id, 'assigned_to': item.assigned_to}


# ── Review actions endpoint ────────────────────────────────────────────────────

class ReviewActionCreate(BaseModel):
    review_item_id: str
    action: str                     # "approve" | "reject" | "escalate" | "comment"
    notes: Optional[str] = None


class ReviewActionOut(BaseModel):
    review_item_id: str
    actor_id: str
    action: str
    notes: Optional[str]
    created_at: str
    item_status: str                # updated status of the queue item after the action


@review_router.post("/actions", response_model=ReviewActionOut, status_code=201)
def post_review_action(
    body: ReviewActionCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReviewActionOut:
    """Record an approve / reject / escalate / comment action on a review queue item."""
    require_minimum_role(actor, "clinician")

    _valid_actions = {"approve", "reject", "escalate", "comment"}
    action = body.action.strip().lower()
    if action not in _valid_actions:
        raise ApiServiceError(
            code="invalid_action",
            message=f"Action must be one of: {', '.join(sorted(_valid_actions))}.",
            status_code=422,
        )

    item = db.query(ReviewQueueItem).filter_by(id=body.review_item_id).first()
    if item is None:
        raise ApiServiceError(code="not_found", message="Review queue item not found.", status_code=404)

    # Ownership check: admins can act on any item; clinicians may only act on items
    # that are assigned to them or that they created.
    if actor.role != "admin":
        owns_item = (
            item.assigned_to == actor.actor_id
            or item.created_by == actor.actor_id
        )
        if not owns_item:
            raise ApiServiceError(
                code="not_found",
                message="Review queue item not found.",
                status_code=404,
            )

    # Apply state transition
    now = datetime.now(timezone.utc)
    if action == "approve":
        item.status = "completed"
        item.completed_at = now
    elif action == "reject":
        item.status = "rejected"
        item.completed_at = now
    elif action == "escalate":
        item.status = "escalated"
        item.priority = "urgent"
    # "comment" leaves status unchanged

    if body.notes:
        item.notes = body.notes

    db.commit()
    db.refresh(item)

    # Broadcast review_decision to the course's clinician (if item targets a treatment course)
    if item.target_type == "treatment_course" and item.target_id:
        _course = db.query(TreatmentCourse).filter_by(id=item.target_id).first()
        if _course and _course.clinician_id and _course.clinician_id != actor.actor_id:
            import asyncio as _asyncio
            from app.routers.notifications_router import broadcast_to_user as _broadcast

            _asyncio.ensure_future(
                _broadcast(
                    str(_course.clinician_id),
                    "review_decision",
                    {
                        "course_id": str(_course.id),
                        "action": action,
                        "reviewer_name": actor.display_name,
                        "notes": body.notes or "",
                    },
                )
            )

    return ReviewActionOut(
        review_item_id=item.id,
        actor_id=actor.actor_id,
        action=action,
        notes=body.notes,
        created_at=now.isoformat(),
        item_status=item.status,
    )
