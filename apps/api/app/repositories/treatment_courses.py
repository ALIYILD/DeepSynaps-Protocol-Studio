"""Repository helpers for treatment-courses, sessions, review queue, and
related lookup rows used by ``app.routers.treatment_courses_router``.

Architect Rec #8: routers must not import directly from
``app.persistence.models``. Each helper here wraps the SQLAlchemy queries
that the router previously held inline so the router can switch to
``from app.repositories.treatment_courses import …``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..persistence.models import (
    AdverseEvent,
    AuditEventRecord,
    DeliveredSessionParameters,
    Patient,
    QEEGAIReport,
    QEEGComparison,
    ReviewQueueItem,
    TreatmentCourse,
    User,
)


# ── TreatmentCourse ──────────────────────────────────────────────────────────


def get_treatment_course(session: Session, course_id: str) -> Optional[TreatmentCourse]:
    return session.query(TreatmentCourse).filter_by(id=course_id).first()


def list_treatment_courses(
    session: Session,
    *,
    clinician_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
) -> list[TreatmentCourse]:
    q = session.query(TreatmentCourse)
    if clinician_id:
        q = q.filter(TreatmentCourse.clinician_id == clinician_id)
    if patient_id:
        q = q.filter(TreatmentCourse.patient_id == patient_id)
    if status:
        q = q.filter(TreatmentCourse.status == status)
    return list(q.order_by(TreatmentCourse.created_at.desc()).limit(limit).all())


def get_treatment_courses_by_ids(
    session: Session, course_ids: list[str]
) -> dict[str, TreatmentCourse]:
    if not course_ids:
        return {}
    rows = session.query(TreatmentCourse).filter(TreatmentCourse.id.in_(course_ids)).all()
    return {r.id: r for r in rows}


def insert_treatment_course(
    session: Session,
    *,
    patient_id: str,
    clinician_id: str,
    protocol_id: str,
    condition_slug: str,
    modality_slug: str,
    device_slug: Optional[str],
    phenotype_id: Optional[str],
    evidence_grade: str,
    on_label: bool,
    planned_sessions_total: int,
    planned_sessions_per_week: int,
    planned_session_duration_minutes: int,
    planned_frequency_hz: str,
    planned_intensity: str,
    coil_placement: str,
    target_region: str,
    status: str,
    review_required: bool,
    clinician_notes: Optional[str],
    protocol_json: str,
) -> TreatmentCourse:
    course = TreatmentCourse(
        patient_id=patient_id,
        clinician_id=clinician_id,
        protocol_id=protocol_id,
        condition_slug=condition_slug,
        modality_slug=modality_slug,
        device_slug=device_slug,
        phenotype_id=phenotype_id,
        evidence_grade=evidence_grade,
        on_label=on_label,
        planned_sessions_total=planned_sessions_total,
        planned_sessions_per_week=planned_sessions_per_week,
        planned_session_duration_minutes=planned_session_duration_minutes,
        planned_frequency_hz=planned_frequency_hz,
        planned_intensity=planned_intensity,
        coil_placement=coil_placement,
        target_region=target_region,
        status=status,
        review_required=review_required,
        clinician_notes=clinician_notes,
        protocol_json=protocol_json,
    )
    session.add(course)
    session.flush()
    return course


def close_pending_review_items_for_course(
    session: Session, *, course_id: str, completed_at: datetime
) -> None:
    session.query(ReviewQueueItem).filter_by(
        target_id=course_id, status="pending"
    ).update({"status": "completed", "completed_at": completed_at})


# ── ReviewQueueItem ──────────────────────────────────────────────────────────


def insert_review_queue_item(
    session: Session,
    *,
    item_type: str,
    target_id: str,
    target_type: str,
    patient_id: str,
    priority: str,
    status: str,
    created_by: str,
) -> ReviewQueueItem:
    item = ReviewQueueItem(
        item_type=item_type,
        target_id=target_id,
        target_type=target_type,
        patient_id=patient_id,
        priority=priority,
        status=status,
        created_by=created_by,
    )
    session.add(item)
    return item


def get_review_queue_item(session: Session, item_id: str) -> Optional[ReviewQueueItem]:
    return session.query(ReviewQueueItem).filter_by(id=item_id).first()


def list_review_queue_items(
    session: Session,
    *,
    actor_id: Optional[str] = None,
    is_admin: bool = False,
    status: Optional[str] = None,
    reviewer_id: Optional[str] = None,
    limit: int = 200,
) -> list[ReviewQueueItem]:
    q = session.query(ReviewQueueItem)
    if not is_admin and actor_id:
        q = q.filter(
            or_(
                ReviewQueueItem.created_by == actor_id,
                ReviewQueueItem.assigned_to == actor_id,
            )
        )
    if status:
        q = q.filter(ReviewQueueItem.status == status)
    if reviewer_id:
        q = q.filter(ReviewQueueItem.assigned_to == reviewer_id)
    return list(q.order_by(ReviewQueueItem.created_at.desc()).limit(limit).all())


# ── DeliveredSessionParameters ───────────────────────────────────────────────


def insert_delivered_session(
    session: Session,
    *,
    session_id: str,
    course_id: str,
    device_slug: Optional[str],
    device_serial: Optional[str],
    coil_position: Optional[str],
    frequency_hz: Optional[str],
    intensity_pct_rmt: Optional[str],
    pulses_delivered: Optional[int],
    duration_minutes: Optional[int],
    side: Optional[str],
    montage: Optional[str],
    tech_id: str,
    tolerance_rating: Optional[str],
    interruptions: bool,
    interruption_reason: Optional[str],
    post_session_notes: Optional[str],
    checklist_json: Optional[str],
) -> DeliveredSessionParameters:
    record = DeliveredSessionParameters(
        session_id=session_id,
        course_id=course_id,
        device_slug=device_slug,
        device_serial=device_serial,
        coil_position=coil_position,
        frequency_hz=frequency_hz,
        intensity_pct_rmt=intensity_pct_rmt,
        pulses_delivered=pulses_delivered,
        duration_minutes=duration_minutes,
        side=side,
        montage=montage,
        tech_id=tech_id,
        tolerance_rating=tolerance_rating,
        interruptions=interruptions,
        interruption_reason=interruption_reason,
        post_session_notes=post_session_notes,
        checklist_json=checklist_json,
    )
    session.add(record)
    return record


def list_delivered_sessions_for_course(
    session: Session, course_id: str, *, limit: int | None = 200, ascending: bool = False
) -> list[DeliveredSessionParameters]:
    q = session.query(DeliveredSessionParameters).filter_by(course_id=course_id)
    if ascending:
        q = q.order_by(DeliveredSessionParameters.created_at.asc())
    else:
        q = q.order_by(DeliveredSessionParameters.created_at)
    if limit is not None:
        q = q.limit(limit)
    return list(q.all())


def list_delivered_sessions_summary(
    session: Session, course_id: str
) -> list[DeliveredSessionParameters]:
    """Full ascending list, no limit — used by the sessions/summary tally."""
    return list(
        session.query(DeliveredSessionParameters)
        .filter_by(course_id=course_id)
        .order_by(DeliveredSessionParameters.created_at.asc())
        .all()
    )


def count_delivered_sessions(session: Session, course_id: str) -> int:
    return session.query(DeliveredSessionParameters).filter_by(course_id=course_id).count()


def get_latest_delivered_session(
    session: Session, course_id: str
) -> Optional[DeliveredSessionParameters]:
    return (
        session.query(DeliveredSessionParameters)
        .filter_by(course_id=course_id)
        .order_by(DeliveredSessionParameters.created_at.desc())
        .first()
    )


# ── AuditEventRecord ─────────────────────────────────────────────────────────


def list_course_audit_events(
    session: Session,
    *,
    course_id: str,
    target_types: tuple[str, ...] = ("treatment_course", "course_detail"),
    limit: int = 200,
) -> list[AuditEventRecord]:
    return list(
        session.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_id == course_id,
            AuditEventRecord.target_type.in_(target_types),
        )
        .order_by(AuditEventRecord.created_at.desc())
        .limit(limit)
        .all()
    )


# ── AdverseEvent ─────────────────────────────────────────────────────────────


def list_adverse_events_for_course(
    session: Session, course_id: str, *, limit: int = 200
) -> list[AdverseEvent]:
    return list(
        session.query(AdverseEvent).filter_by(course_id=course_id).limit(limit).all()
    )


def has_serious_adverse_event_for_course(session: Session, course_id: str) -> bool:
    return (
        session.query(AdverseEvent)
        .filter_by(course_id=course_id)
        .filter(AdverseEvent.severity.in_(("serious", "severe", "critical")))
        .first()
        is not None
    )


# ── Patient ──────────────────────────────────────────────────────────────────


def get_patient_by_id(session: Session, patient_id: str) -> Optional[Patient]:
    return session.query(Patient).filter_by(id=patient_id).first()


def get_patients_by_ids(session: Session, patient_ids: list[str]) -> dict[str, Patient]:
    if not patient_ids:
        return {}
    rows = session.query(Patient).filter(Patient.id.in_(patient_ids)).all()
    return {p.id: p for p in rows}


# ── User ─────────────────────────────────────────────────────────────────────


def get_user_by_id_local(session: Session, user_id: str) -> Optional[User]:
    """Local lookup mirroring app.repositories.users.get_user_by_id; kept here so
    the treatment_courses router doesn't need to cross-import that repo for a
    one-line filter."""
    return session.query(User).filter_by(id=user_id).first()


# ── qEEG comparison + AI report ──────────────────────────────────────────────


def get_latest_qeeg_comparison_for_course(
    session: Session, course_id: str
) -> Optional[QEEGComparison]:
    return (
        session.query(QEEGComparison)
        .filter_by(course_id=course_id)
        .order_by(QEEGComparison.created_at.desc())
        .first()
    )


def get_latest_qeeg_ai_report_for_analysis(
    session: Session, analysis_id: str
) -> Optional[QEEGAIReport]:
    return (
        session.query(QEEGAIReport)
        .filter_by(analysis_id=analysis_id)
        .order_by(QEEGAIReport.created_at.desc())
        .first()
    )
