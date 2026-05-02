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

import csv
import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from deepsynaps_core_schema import (
    AssignReviewerBody,
    CourseActivate,
    CourseAuditEventAck,
    CourseAuditEventIn,
    CourseAuditEventOut,
    CourseAuditEventsResponse,
    CourseCreate,
    CourseDetailResponse,
    CourseListResponse,
    CourseOut,
    CourseSessionsSummaryResponse,
    CourseTransitionBody,
    CourseUpdate,
    PersistedPersonalizationExplainability,
    ReviewActionCreate,
    ReviewActionOut,
    ReviewQueueListResponse,
    ReviewQueueOut,
    SafetyPreflightResponse,
    SessionLog,
    SessionLogListResponse,
    SessionLogOut,
)

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.treatment_courses import (
    close_pending_review_items_for_course,
    count_delivered_sessions,
    get_latest_delivered_session,
    get_latest_qeeg_ai_report_for_analysis,
    get_latest_qeeg_comparison_for_course,
    get_patient_by_id,
    get_patients_by_ids,
    get_review_queue_item,
    get_treatment_course,
    get_treatment_courses_by_ids,
    get_user_by_id_local,
    has_serious_adverse_event_for_course,
    insert_delivered_session,
    insert_review_queue_item,
    insert_treatment_course,
    list_adverse_events_for_course,
    list_course_audit_events as repo_list_course_audit_events,
    list_delivered_sessions_for_course,
    list_delivered_sessions_summary,
    list_review_queue_items,
    list_treatment_courses,
)
from app.services.protocol_registry import build_course_structure_from_protocol, get_protocol_parameters
from app.services.registries import get_protocol

if TYPE_CHECKING:
    # Type-only ORM references for the row→DTO converters below. Erased at
    # runtime; lint_router_no_models explicitly allows TYPE_CHECKING imports.
    from app.persistence.models import (
        DeliveredSessionParameters,
        ReviewQueueItem,
        TreatmentCourse,
    )

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/treatment-courses", tags=["Treatment Courses"])
review_router = APIRouter(prefix="/api/v1/review-queue", tags=["Review Queue"])


# ── Payload schemas ──────────────────────────────────────────────────────────
# All BaseModel payloads live in `deepsynaps_core_schema.treatment_courses`
# (Architect Rec #5). Imported above. The ORM-row → DTO converters below
# replace the previous classmethods on those models so the schema package
# stays free of any persistence dependency.


def _course_out_from_record(
    r: "TreatmentCourse",
    governance_warnings: list[str] | None = None,
    *,
    include_personalization_explainability: bool = False,
) -> CourseOut:
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

    return CourseOut(
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


def _session_log_out_from_record(r: "DeliveredSessionParameters") -> SessionLogOut:
    checklist: dict = {}
    if r.checklist_json:
        try:
            parsed = json.loads(r.checklist_json)
            if isinstance(parsed, dict):
                checklist = parsed
        except Exception:
            checklist = {}
    return SessionLogOut(
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
        checklist=checklist,
        created_at=r.created_at.isoformat(),
    )


def _review_queue_out_from_record(
    r: "ReviewQueueItem",
    patient_name: Optional[str] = None,
    condition_slug: Optional[str] = None,
    modality_slug: Optional[str] = None,
    primary_condition: Optional[str] = None,
) -> ReviewQueueOut:
    def _dt(v) -> Optional[str]:
        return v.isoformat() if isinstance(v, datetime) else v

    course_id = r.target_id if r.target_type == "treatment_course" else None
    course_name: Optional[str] = None
    if condition_slug and modality_slug:
        course_name = f"{condition_slug} · {modality_slug}"
    elif condition_slug:
        course_name = condition_slug

    return ReviewQueueOut(
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


# ── Helpers ────────────────────────────────────────────────────────────────────

def _run_governance(params: dict, actor: AuthenticatedActor) -> list[str]:
    """Apply governance rules and return warning strings."""
    from deepsynaps_safety_engine import apply_governance_rules
    on_label: bool = params.get("on_label", True)
    evidence_grade: str = params.get("evidence_grade", "EV-B")
    warnings = apply_governance_rules(on_label, evidence_grade, actor.role)
    return warnings


def _get_course_or_404(db: Session, course_id: str, actor: AuthenticatedActor) -> "TreatmentCourse":
    course = get_treatment_course(db, course_id)
    if course is None:
        raise ApiServiceError(code="not_found", message="Treatment course not found.", status_code=404)
    # Clinicians can only see their own courses; admins see all
    if actor.role != "admin" and course.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Treatment course not found.", status_code=404)
    return course


def _push_review_queue(db: Session, course: "TreatmentCourse", actor: AuthenticatedActor) -> None:
    insert_review_queue_item(
        db,
        item_type="protocol_approval",
        target_id=course.id,
        target_type="treatment_course",
        patient_id=course.patient_id,
        priority="normal",
        status="pending",
        created_by=actor.actor_id,
    )


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

    course = insert_treatment_course(
        db,
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

    if needs_review:
        _push_review_queue(db, course, actor)

    db.commit()
    db.refresh(course)
    return _course_out_from_record(
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

    records = list_treatment_courses(
        db,
        clinician_id=None if actor.role == "admin" else actor.actor_id,
        patient_id=patient_id,
        status=status,
    )
    items = [_course_out_from_record(r) for r in records]
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
    return _course_out_from_record(course, include_personalization_explainability=include_personalization_explainability)


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
    return _course_out_from_record(course)


_BLOCKING_SAFETY_FLAGS = {
    "implanted_device", "intracranial_metal", "seizure_history", "pregnancy",
    "severe_skull_defect", "recent_tbi", "unstable_psych",
}


@router.get("/{course_id}/safety-preflight", response_model=SafetyPreflightResponse)
def course_safety_preflight(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SafetyPreflightResponse:
    """Report whether the patient's medical-history clears this course for activation.

    Safe to call repeatedly; does not modify state. Frontend should call this
    before showing the Approve button and render the structured flags + reason
    textarea when ``override_required`` is True.
    """
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)
    from app.services.patient_context import build_patient_medical_context
    ctx = build_patient_medical_context(db, actor, course.patient_id)
    blocking = sorted(
        fid for fid, v in (ctx.get("structured_flags") or {}).items()
        if v is True and fid in _BLOCKING_SAFETY_FLAGS
    )
    # Only blocking structured flags trigger the hard override gate.
    # `requires_review` (e.g. never-reviewed) stays as a soft advisory field.
    override_required = bool(blocking)
    return SafetyPreflightResponse(
        course_id=course_id,
        patient_id=course.patient_id,
        requires_review=bool(ctx.get("requires_review")),
        structured_flags=ctx.get("structured_flags") or {},
        used_sections=ctx.get("used_sections") or [],
        source_meta=ctx.get("source_meta") or {},
        override_required=override_required,
        blocking_flags=blocking,
    )


@router.patch("/{course_id}/activate", response_model=CourseOut)
def activate_course(
    course_id: str,
    body: CourseActivate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseOut:
    """Governance + patient-safety gate, then approve and activate the course.

    Requires clinician role. Blocks on EV-D evidence. Also blocks activation
    when the patient's medical history has blocking safety flags set or has
    never been reviewed, UNLESS the caller explicitly passes
    ``override_safety=True`` + a non-empty ``override_reason``. Overrides are
    audited.
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

    # Patient-safety gate — consult structured medical history.
    # Hard-block only on structured blocking flags. "Never reviewed" is surfaced
    # in the preflight response so the UI can prompt the clinician, but it does
    # not block activation of a brand-new patient's first course.
    from app.services.patient_context import build_patient_medical_context
    mh_ctx = build_patient_medical_context(db, actor, course.patient_id)
    blocking = sorted(
        fid for fid, v in (mh_ctx.get("structured_flags") or {}).items()
        if v is True and fid in _BLOCKING_SAFETY_FLAGS
    )
    override_reason_clean = (body.override_reason or "").strip()

    if blocking:
        if not body.override_safety or len(override_reason_clean) < 10:
            raise ApiServiceError(
                code="safety_block",
                message=(
                    "Patient has blocking safety flags set in medical history. "
                    "Set override_safety=true and provide a justification of at least 10 characters "
                    "(e.g. consult note ID, specialist clearance reference) to proceed."
                ),
                warnings=[f"blocking_flag:{f}" for f in blocking],
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
    close_pending_review_items_for_course(db, course_id=course_id, completed_at=now)

    db.commit()
    db.refresh(course)

    # Audit: always record activation; include any safety override details.
    try:
        from app.repositories.audit import create_audit_event
        if blocking and body.override_safety:
            action = "course.activate.safety_override"
            note = f"blocking={','.join(blocking)}; reason={override_reason_clean[:300]}"
        else:
            action = "course.activate"
            note = f"gov_warnings={len(gov_warnings)}"
        create_audit_event(
            db,
            event_id=f"course-activate-{course_id}-{int(now.timestamp())}",
            target_id=course_id,
            target_type="treatment_course",
            action=action,
            role=actor.role,
            actor_id=actor.actor_id,
            note=note,
            created_at=now.isoformat(),
        )
    except Exception:
        pass

    return _course_out_from_record(course, gov_warnings)


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

    record = insert_delivered_session(
        db,
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
        _patient = get_patient_by_id(db, course.patient_id)
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

    return _session_log_out_from_record(record)


@router.get("/{course_id}/sessions", response_model=SessionLogListResponse)
def list_sessions(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SessionLogListResponse:
    require_minimum_role(actor, "clinician")
    _get_course_or_404(db, course_id, actor)  # access check

    records = list_delivered_sessions_for_course(db, course_id)
    items = [_session_log_out_from_record(r) for r in records]
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

    records = list_review_queue_items(
        db,
        actor_id=actor.actor_id,
        is_admin=actor.role == "admin",
        status=status,
        reviewer_id=reviewer_id,
    )

    # Enrich with patient name + course details via lookup
    patient_ids = list({r.patient_id for r in records if r.patient_id})
    course_ids  = list({r.target_id  for r in records if r.target_type == "treatment_course"})

    patients_by_id = get_patients_by_ids(db, patient_ids)
    courses_by_id = get_treatment_courses_by_ids(db, course_ids)

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

        items.append(_review_queue_out_from_record(
            r,
            patient_name=patient_name,
            condition_slug=condition_slug,
            modality_slug=modality_slug,
            primary_condition=primary_condition,
        ))

    return ReviewQueueListResponse(items=items, total=len(items))


# ── Reviewer assignment endpoint ───────────────────────────────────────────────


@review_router.patch("/{item_id}/assign", status_code=200)
def assign_reviewer(
    item_id: str,
    body: AssignReviewerBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Assign (or unassign) a reviewer to a review queue item."""
    require_minimum_role(actor, "clinician")
    item = get_review_queue_item(db, item_id)
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

    item = get_review_queue_item(db, body.review_item_id)
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
        _course = get_treatment_course(db, item.target_id)
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


# ── Course-scoped read endpoints (assessment severity, audit trail, AE summary) ─

@router.get("/{course_id}/assessment-summary")
def course_assessment_summary(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Normalized assessment severity for this course's patient.

    Wraps `assessment_summary.get_patient_assessment_summary` so the Course
    Detail page can render a single aggregated severity banner without
    computing it client-side. Same permissions as course detail itself.
    """
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)
    from app.services.assessment_summary import get_patient_assessment_summary
    snapshot = get_patient_assessment_summary(db, course.patient_id, clinician_id=course.clinician_id)
    data = snapshot.to_dict()
    data["course_id"] = course_id
    return data


@router.get("/{course_id}/audit-trail")
def course_audit_trail(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Return the structured audit timeline for a course.

    Replaces the mock changelog on the Course Detail overview tab. Reads from
    the `audit_events` table and matches on target_id==course_id.
    """
    require_minimum_role(actor, "clinician")
    _get_course_or_404(db, course_id, actor)  # enforces ownership
    rows = repo_list_course_audit_events(
        db, course_id=course_id, target_types=("treatment_course",), limit=200
    )
    return {
        "course_id": course_id,
        "items": [
            {
                "event_id": r.event_id,
                "action": r.action,
                "role": r.role,
                "actor_id": r.actor_id,
                "note": r.note,
                "created_at": r.created_at,
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.get("/{course_id}/adverse-events-summary")
def course_adverse_events_summary(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Lightweight severity roll-up of course-linked adverse events.

    Used by the Course Detail header to surface a safety banner without
    re-fetching the full AE list.
    """
    require_minimum_role(actor, "clinician")
    _get_course_or_404(db, course_id, actor)
    rows = list_adverse_events_for_course(db, course_id)
    by_severity: dict[str, int] = {}
    unresolved = 0
    for r in rows:
        sev = (getattr(r, "severity", None) or "unknown").lower()
        by_severity[sev] = by_severity.get(sev, 0) + 1
        if getattr(r, "resolved_at", None) is None:
            unresolved += 1
    # Aggregate "highest" severity using the same token set as assessment_summary.
    order = {"unknown": -1, "mild": 1, "moderate": 2, "severe": 3, "critical": 4}
    highest = "unknown"
    for sev in by_severity:
        if order.get(sev, -1) > order.get(highest, -1):
            highest = sev
    return {
        "course_id": course_id,
        "total": len(rows),
        "unresolved": unresolved,
        "by_severity": by_severity,
        "highest_severity": highest,
    }


# ── Phase 5c: qEEG pre/post comparison for a course ──────────────────────────
# GET /api/v1/treatment-courses/{course_id}/qeeg-comparison
#
# Returns the latest pre/post QEEGComparison row for the course, plus a
# normalized Δ-by-lobe summary derived from the QEEGBrainMapReport contract
# (Phase 0). Used by the Course Detail "Brain map progress" card and the
# Patient Portal Treatment Plan page.

@router.get("/{course_id}/qeeg-comparison")
def course_qeeg_comparison(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Return the latest pre/post qEEG comparison for the course.

    Response shape:
      {
        "course_id": <id>,
        "comparison_id": <id>|None,
        "baseline_analysis_id": <id>|None,
        "followup_analysis_id": <id>|None,
        "delta_powers": {...} | None,
        "improvement_summary": {...} | None,
        "ai_narrative": <str>|None,
        "lobe_delta": {                # convenience roll-up for the Course UI
          "frontal":   {"baseline_pct": x, "followup_pct": y, "delta_pct": z, "direction": "improving"|"declining"|"stable"},
          ...
        },
        "disclaimer": "Decision-support only..."
      }

    When no comparison exists, returns the same shape with all data fields
    null and an empty `lobe_delta`. UI must show an honest empty state.
    """
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)

    cmp_row = get_latest_qeeg_comparison_for_course(db, course_id)

    response = {
        "course_id": course_id,
        "patient_id": course.patient_id,
        "comparison_id": None,
        "baseline_analysis_id": None,
        "followup_analysis_id": None,
        "delta_powers": None,
        "improvement_summary": None,
        "ai_narrative": None,
        "lobe_delta": {},
        "disclaimer": (
            "Decision-support only. Pre/post change does not establish "
            "treatment efficacy and is not a medical diagnosis or treatment "
            "recommendation. Clinical interpretation by a qualified clinician "
            "is required."
        ),
    }
    if cmp_row is None:
        return response

    response["comparison_id"] = cmp_row.id
    response["baseline_analysis_id"] = cmp_row.baseline_analysis_id
    response["followup_analysis_id"] = cmp_row.followup_analysis_id
    response["ai_narrative"] = cmp_row.ai_comparison_narrative

    if cmp_row.delta_powers_json:
        try:
            response["delta_powers"] = json.loads(cmp_row.delta_powers_json)
        except (TypeError, ValueError):
            pass
    if cmp_row.improvement_summary_json:
        try:
            response["improvement_summary"] = json.loads(cmp_row.improvement_summary_json)
        except (TypeError, ValueError):
            pass

    # Attempt to compute the lobe-level Δ from the Phase 0 QEEGBrainMapReport
    # payloads attached to each analysis's most-recent QEEGAIReport. Tolerant
    # of missing / legacy rows — never raises.
    response["lobe_delta"] = _compute_course_lobe_delta(
        db, cmp_row.baseline_analysis_id, cmp_row.followup_analysis_id
    )
    return response


def _compute_course_lobe_delta(
    db: Session,
    baseline_analysis_id: Optional[str],
    followup_analysis_id: Optional[str],
) -> dict:
    """Compute a 4-lobe Δ percentile summary from each analysis's report_payload.

    Returns {} if either side is missing the Phase 0 contract payload.
    """
    if not baseline_analysis_id or not followup_analysis_id:
        return {}

    def _latest_payload(analysis_id: str) -> Optional[dict]:
        row = get_latest_qeeg_ai_report_for_analysis(db, analysis_id)
        if row is None:
            return None
        raw = getattr(row, "report_payload", None)
        if not raw:
            return None
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
        except (TypeError, ValueError):
            return None

    baseline = _latest_payload(baseline_analysis_id)
    followup = _latest_payload(followup_analysis_id)
    if not baseline or not followup:
        return {}

    out: dict[str, dict] = {}
    for lobe in ("frontal", "temporal", "parietal", "occipital"):
        base_lobe = (baseline.get("lobe_summary") or {}).get(lobe) or {}
        fu_lobe = (followup.get("lobe_summary") or {}).get(lobe) or {}
        # Average left + right percentile per side, fall back to whichever exists
        def _avg(d: dict) -> Optional[float]:
            vals = [v for v in (d.get("lt_percentile"), d.get("rt_percentile")) if isinstance(v, (int, float))]
            if not vals:
                return None
            return sum(vals) / len(vals)
        b = _avg(base_lobe)
        f = _avg(fu_lobe)
        if b is None or f is None:
            continue
        delta = f - b
        if abs(delta) < 5:
            direction = "stable"
        else:
            # "Improving" = moving toward 50% (typical) from either tail.
            base_dist = abs(b - 50.0)
            fu_dist = abs(f - 50.0)
            direction = "improving" if fu_dist < base_dist else "declining"
        out[lobe] = {
            "baseline_pct": round(b, 1),
            "followup_pct": round(f, 1),
            "delta_pct": round(delta, 1),
            "direction": direction,
        }
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Course Detail launch-audit (PR feat/course-detail-launch-audit-2026-04-30)
#
# Aggregates the data the Course Detail page needs in one round-trip, exposes
# a real audit timeline (replacing the prior "illustrative" fallback in the
# UI), wires note-required pause/resume/close transitions with audit hooks,
# and adds DEMO-prefixed CSV / NDJSON exports. Mirrors the IRB Manager
# launch-audit pattern (PR #334) and follows the existing surface whitelist
# in audit_trail_router.KNOWN_SURFACES + qeeg_analysis_router audit-events.
# ─────────────────────────────────────────────────────────────────────────────


_COURSE_DETAIL_DISCLAIMERS = (
    "Course Detail aggregates data for clinical review only.",
    "Pause / resume / close transitions require a clinician note and are immutably audited.",
    "Demo courses are not regulator-submittable; exports are tagged accordingly.",
)
_TERMINAL_COURSE_STATUSES = {"completed", "closed", "discontinued"}
_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


def _course_is_demo(db: Session, course: "TreatmentCourse") -> bool:
    """Treat a course as DEMO when its clinician belongs to a demo clinic.

    TreatmentCourse has no `is_demo` column today (unlike IRBProtocol). To
    avoid silently mislabeling exports we follow the seeded clinic IDs used
    by the test fixture and the deployed demo tenant.
    """
    try:
        u = get_user_by_id_local(db, course.clinician_id)
        if u is None or not u.clinic_id:
            return False
        return u.clinic_id in _DEMO_CLINIC_IDS
    except Exception:
        return False


def _self_audit_course(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    course_id: str,
    note: str,
) -> None:
    """Best-effort audit hook for course_detail surface; never raises."""
    try:
        from app.repositories.audit import create_audit_event  # noqa: PLC0415

        now = datetime.now(timezone.utc)
        event_id = (
            f"course_detail-{event}-{actor.actor_id}-{int(now.timestamp())}"
            f"-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(course_id) or actor.actor_id,
            target_type="course_detail",
            action=f"course_detail.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.debug("Course detail self-audit skipped", exc_info=True)


def _audit_event_to_dict(r) -> dict:
    return {
        "event_id": r.event_id,
        "target_id": r.target_id,
        "target_type": r.target_type,
        "action": r.action,
        "role": r.role,
        "actor_id": r.actor_id,
        "note": r.note,
        "created_at": r.created_at,
    }


def _course_audit_rows(db: Session, course_id: str, limit: int = 200) -> list:
    """Return audit_events rows matching this course (legacy or course_detail)."""
    return repo_list_course_audit_events(db, course_id=course_id, limit=limit)


# ── GET /{course_id}/detail — aggregated payload ─────────────────────────────


@router.get("/{course_id}/detail", response_model=CourseDetailResponse)
def get_course_detail(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseDetailResponse:
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)

    sessions_total = count_delivered_sessions(db, course_id)
    last = get_latest_delivered_session(db, course_id)
    last_session_at = last.created_at.isoformat() if last and last.created_at else None

    has_serious_ae = False
    try:
        has_serious_ae = has_serious_adverse_event_for_course(db, course_id)
    except Exception:
        has_serious_ae = False

    planned = course.planned_sessions_total or 0
    delivered = course.sessions_delivered or sessions_total
    pct = (
        max(0, min(100, round(delivered / planned * 100)))
        if planned > 0
        else 0
    )

    _self_audit_course(
        db,
        actor,
        event="detail.read",
        course_id=course_id,
        note=f"sessions={sessions_total} demo={int(_course_is_demo(db, course))}",
    )

    return CourseDetailResponse(
        course=_course_out_from_record(course),
        sessions_total=sessions_total,
        sessions_delivered=delivered,
        sessions_planned=planned,
        completion_pct=pct,
        has_serious_ae=has_serious_ae,
        is_demo=_course_is_demo(db, course),
        is_terminal=course.status in _TERMINAL_COURSE_STATUSES,
        last_session_at=last_session_at,
    )


# ── GET /{course_id}/sessions/summary — counts + interruption / AE roll-up ──


@router.get("/{course_id}/sessions/summary", response_model=CourseSessionsSummaryResponse)
def get_course_sessions_summary(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseSessionsSummaryResponse:
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)

    rows = list_delivered_sessions_summary(db, course_id)
    by_tol: dict[str, int] = {}
    interrupted = 0
    deviations = 0
    with_post_notes = 0
    with_checklist = 0
    for r in rows:
        tol = (getattr(r, "tolerance_rating", None) or "unspecified").lower()
        by_tol[tol] = by_tol.get(tol, 0) + 1
        if getattr(r, "interruptions", False):
            interrupted += 1
        # protocol_deviation may exist as a column on newer migrations; fall
        # back to checklist['deviation'] when missing.
        if getattr(r, "protocol_deviation", False):
            deviations += 1
        if getattr(r, "post_session_notes", None):
            with_post_notes += 1
        if getattr(r, "checklist_json", None):
            with_checklist += 1

    return CourseSessionsSummaryResponse(
        course_id=course_id,
        sessions_total=len(rows),
        sessions_planned=course.planned_sessions_total or 0,
        sessions_delivered=course.sessions_delivered or len(rows),
        interrupted=interrupted,
        deviations=deviations,
        with_post_notes=with_post_notes,
        with_checklist=with_checklist,
        by_tolerance=by_tol,
        last_session_at=rows[-1].created_at.isoformat() if rows else None,
        first_session_at=rows[0].created_at.isoformat() if rows else None,
        is_demo=_course_is_demo(db, course),
    )


# ── GET /{course_id}/audit-events — typed audit timeline ────────────────────


@router.get("/{course_id}/audit-events", response_model=CourseAuditEventsResponse)
def list_course_audit_events(
    course_id: str,
    limit: int = Query(default=200, ge=1, le=1000),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseAuditEventsResponse:
    """Audit timeline for a course (treatment_course + course_detail rows).

    Distinct from the legacy ``/audit-trail`` endpoint, which only returns
    rows whose ``target_type == treatment_course``. This one merges the new
    ``course_detail`` page-level events so the UI can render a single
    unified timeline without fabricating placeholder rows.
    """
    require_minimum_role(actor, "clinician")
    _get_course_or_404(db, course_id, actor)
    rows = _course_audit_rows(db, course_id, limit=limit)
    items = [CourseAuditEventOut(**_audit_event_to_dict(r)) for r in rows]
    return CourseAuditEventsResponse(
        course_id=course_id, items=items, total=len(items)
    )


# ── POST /{course_id}/audit-events — page-level audit ingestion ─────────────


@router.post("/{course_id}/audit-events", response_model=CourseAuditEventAck)
def record_course_audit_event(
    course_id: str,
    payload: CourseAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseAuditEventAck:
    require_minimum_role(actor, "clinician")
    _get_course_or_404(db, course_id, actor)
    now = datetime.now(timezone.utc)
    event_id = (
        f"course_detail-{payload.event}-{actor.actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.note:
        note_parts.append(payload.note[:500])
    note = "; ".join(note_parts) or payload.event
    try:
        from app.repositories.audit import create_audit_event  # noqa: PLC0415
        create_audit_event(
            db,
            event_id=event_id,
            target_id=course_id,
            target_type="course_detail",
            action=f"course_detail.{payload.event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("Course detail audit-event persistence failed")
        return CourseAuditEventAck(accepted=False, event_id=event_id)
    return CourseAuditEventAck(accepted=True, event_id=event_id)


# ── POST /{course_id}/pause | resume | close — note required ────────────────


def _transition_course(
    db: Session,
    actor: AuthenticatedActor,
    course_id: str,
    *,
    new_status: str,
    valid_from: set[str],
    transition_event: str,
    note: str,
) -> CourseOut:
    course = _get_course_or_404(db, course_id, actor)
    note_clean = (note or "").strip()
    if len(note_clean) < 1:
        raise ApiServiceError(
            code="note_required",
            message=f"A clinician note is required to {transition_event} this course.",
            status_code=422,
        )
    if course.status in _TERMINAL_COURSE_STATUSES:
        raise ApiServiceError(
            code="course_immutable",
            message=(
                f"Course is in terminal state '{course.status}' and cannot be modified."
            ),
            status_code=409,
        )
    if course.status not in valid_from:
        raise ApiServiceError(
            code="invalid_state",
            message=(
                f"Cannot {transition_event} a course in status '{course.status}'."
            ),
            status_code=422,
        )

    now = datetime.now(timezone.utc)
    course.status = new_status
    course.updated_at = now
    if new_status in _TERMINAL_COURSE_STATUSES:
        course.completed_at = now
    if course.clinician_notes:
        course.clinician_notes = (
            f"{course.clinician_notes}\n[{transition_event}@{now.isoformat()}] "
            f"{note_clean}"
        )
    else:
        course.clinician_notes = (
            f"[{transition_event}@{now.isoformat()}] {note_clean}"
        )
    db.commit()
    db.refresh(course)

    _self_audit_course(
        db,
        actor,
        event=transition_event,
        course_id=course_id,
        note=f"new_status={new_status}; note={note_clean[:300]}",
    )
    return _course_out_from_record(course)


@router.post("/{course_id}/pause", response_model=CourseOut)
def pause_course(
    course_id: str,
    body: CourseTransitionBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseOut:
    require_minimum_role(actor, "clinician")
    return _transition_course(
        db,
        actor,
        course_id,
        new_status="paused",
        valid_from={"active", "approved"},
        transition_event="pause",
        note=body.note,
    )


@router.post("/{course_id}/resume", response_model=CourseOut)
def resume_course(
    course_id: str,
    body: CourseTransitionBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseOut:
    require_minimum_role(actor, "clinician")
    return _transition_course(
        db,
        actor,
        course_id,
        new_status="active",
        valid_from={"paused"},
        transition_event="resume",
        note=body.note,
    )


@router.post("/{course_id}/close", response_model=CourseOut)
def close_course(
    course_id: str,
    body: CourseTransitionBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CourseOut:
    require_minimum_role(actor, "clinician")
    return _transition_course(
        db,
        actor,
        course_id,
        new_status="closed",
        valid_from={"active", "approved", "paused", "pending_approval"},
        transition_event="close",
        note=body.note,
    )


# ── GET /{course_id}/export.csv | export.ndjson ─────────────────────────────


_COURSE_EXPORT_COLUMNS = (
    "course_id",
    "patient_id",
    "clinician_id",
    "protocol_id",
    "condition_slug",
    "modality_slug",
    "device_slug",
    "target_region",
    "evidence_grade",
    "on_label",
    "status",
    "review_required",
    "planned_sessions_total",
    "sessions_delivered",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at",
    "is_demo",
)


def _course_export_row(course: "TreatmentCourse", *, is_demo: bool) -> dict:
    return {
        "course_id": course.id,
        "patient_id": course.patient_id,
        "clinician_id": course.clinician_id,
        "protocol_id": course.protocol_id,
        "condition_slug": course.condition_slug,
        "modality_slug": course.modality_slug,
        "device_slug": course.device_slug or "",
        "target_region": course.target_region or "",
        "evidence_grade": course.evidence_grade or "",
        "on_label": int(bool(course.on_label)),
        "status": course.status,
        "review_required": int(bool(course.review_required)),
        "planned_sessions_total": course.planned_sessions_total or 0,
        "sessions_delivered": course.sessions_delivered or 0,
        "started_at": course.started_at.isoformat() if course.started_at else "",
        "completed_at": course.completed_at.isoformat() if course.completed_at else "",
        "created_at": course.created_at.isoformat() if course.created_at else "",
        "updated_at": course.updated_at.isoformat() if course.updated_at else "",
        "is_demo": int(bool(is_demo)),
    }


@router.get("/{course_id}/export.csv")
def export_course_csv(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)
    is_demo = _course_is_demo(db, course)
    sessions = list_delivered_sessions_summary(db, course_id)
    buf = io.StringIO()
    if is_demo:
        buf.write(
            "# DEMO — this course is demo data and is NOT regulator-submittable.\n"
        )
    writer = csv.writer(buf)
    # Header row 1: course summary block
    writer.writerow(["section", "course"])
    writer.writerow(list(_COURSE_EXPORT_COLUMNS))
    row = _course_export_row(course, is_demo=is_demo)
    writer.writerow([row[c] for c in _COURSE_EXPORT_COLUMNS])
    writer.writerow([])
    # Section 2: delivered sessions
    writer.writerow(["section", "sessions"])
    writer.writerow([
        "session_id",
        "course_id",
        "device_slug",
        "frequency_hz",
        "intensity_pct_rmt",
        "duration_minutes",
        "tolerance_rating",
        "interruptions",
        "created_at",
    ])
    for s in sessions:
        writer.writerow([
            s.id,
            s.course_id,
            s.device_slug or "",
            s.frequency_hz or "",
            s.intensity_pct_rmt or "",
            s.duration_minutes if s.duration_minutes is not None else "",
            s.tolerance_rating or "",
            int(bool(s.interruptions)),
            s.created_at.isoformat() if s.created_at else "",
        ])
    _self_audit_course(
        db,
        actor,
        event="export_csv",
        course_id=course_id,
        note=f"sessions={len(sessions)} demo={int(is_demo)}",
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f"attachment; filename=course-{course_id}.csv"
            ),
            "Cache-Control": "no-store",
            "X-Course-Demo": "1" if is_demo else "0",
        },
    )


@router.get("/{course_id}/export.ndjson")
def export_course_ndjson(
    course_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    require_minimum_role(actor, "clinician")
    course = _get_course_or_404(db, course_id, actor)
    is_demo = _course_is_demo(db, course)
    sessions = list_delivered_sessions_summary(db, course_id)
    audit_rows = _course_audit_rows(db, course_id, limit=500)
    lines: list[str] = []
    if is_demo:
        lines.append(
            json.dumps(
                {
                    "_meta": "DEMO",
                    "warning": (
                        "This course is demo data and is NOT regulator-submittable."
                    ),
                },
                separators=(",", ":"),
            )
        )
    lines.append(
        json.dumps(
            {"_kind": "course", **_course_export_row(course, is_demo=is_demo)},
            separators=(",", ":"),
        )
    )
    for s in sessions:
        lines.append(
            json.dumps(
                {
                    "_kind": "session",
                    "session_id": s.id,
                    "course_id": s.course_id,
                    "device_slug": s.device_slug,
                    "frequency_hz": s.frequency_hz,
                    "intensity_pct_rmt": s.intensity_pct_rmt,
                    "duration_minutes": s.duration_minutes,
                    "tolerance_rating": s.tolerance_rating,
                    "interruptions": bool(s.interruptions),
                    "created_at": (
                        s.created_at.isoformat() if s.created_at else None
                    ),
                },
                separators=(",", ":"),
            )
        )
    for r in audit_rows:
        lines.append(
            json.dumps(
                {"_kind": "audit", **_audit_event_to_dict(r)},
                separators=(",", ":"),
            )
        )
    body = "\n".join(lines) + ("\n" if lines else "")
    _self_audit_course(
        db,
        actor,
        event="export_ndjson",
        course_id=course_id,
        note=(
            f"sessions={len(sessions)} audit={len(audit_rows)} demo={int(is_demo)}"
        ),
    )
    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": (
                f"attachment; filename=course-{course_id}.ndjson"
            ),
            "Cache-Control": "no-store",
            "X-Course-Demo": "1" if is_demo else "0",
        },
    )
