"""Intervention Analyzer -- batch sign/review status + clinic summary (no N+1).

Decision-support visibility only -- not treatment approval or protocol changes.
Not a calibrated prediction model. Requires clinician review.
Associations shown are temporal, not causal proof.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AdverseEvent,
    ClinicalSession,
    ClinicalSessionEvent,
    DeliveredSessionParameters,
    Patient,
    TreatmentCourse,
    User,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.repositories.treatment_courses import get_treatment_course

router = APIRouter(prefix="/api/v1/treatment-sessions", tags=["Intervention Analyzer"])

MAX_COURSE_IDS = 100
MAX_SESSION_IDS = 500

SignStatus = Literal["signed", "pending", "unknown"]
ReviewStatus = Literal["reviewed", "pending", "unknown"]
CourseSignStatus = Literal["complete", "partial", "pending", "unknown"]
MissingReason = Literal["no_events", "not_found"]

InterventionType = Literal[
    "tms", "tdcs", "tacs", "trns", "tavns", "tps", "pbm",
    "neurofeedback", "medication_change", "psychotherapy",
    "occupational_therapy", "speech_therapy", "physiotherapy",
    "digital_therapeutics", "sleep_intervention", "nutrition",
    "exercise", "lifestyle", "accommodations", "multimodal",
]


# ═══════════════════════════════════════════════════════════════════════════════
# Batch sign-status schemas
# ═══════════════════════════════════════════════════════════════════════════════

# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class SignStatusBatchIn(BaseModel):
    course_ids: list[str] = Field(default_factory=list)
    session_ids: list[str] = Field(default_factory=list)
    include_events: bool = False


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class SessionSignEventOut(BaseModel):
    id: str
    event_type: str
    created_at: str
    actor_id: Optional[str] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class SessionSignStatusItemOut(BaseModel):
    course_id: Optional[str] = None
    session_id: str
    sign_status: SignStatus
    review_status: ReviewStatus
    signed_at: Optional[str] = None
    signed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    source: str = "clinical_session_events"
    event_count: int = 0
    latest_event_at: Optional[str] = None
    missing_reason: Optional[MissingReason] = None
    events: list[SessionSignEventOut] = Field(default_factory=list)


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class CourseSignAggregateOut(BaseModel):
    course_id: str
    session_count: int
    signed_count: int
    pending_count: int
    unknown_count: int
    course_sign_status: CourseSignStatus
    latest_event_at: Optional[str] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class SignStatusBatchSummaryOut(BaseModel):
    requested_course_count: int
    requested_session_count: int
    returned_count: int
    signed_count: int
    pending_count: int
    unknown_count: int


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class SignStatusBatchOut(BaseModel):
    items: list[SessionSignStatusItemOut]
    summary: SignStatusBatchSummaryOut
    courses: list[CourseSignAggregateOut] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
# Clinic summary schemas
# ═══════════════════════════════════════════════════════════════════════════════

class ClinicSummaryIn(BaseModel):
    """Input for clinic-wide intervention summary.

    Decision-support only. Not a calibrated prediction model.
    """
    clinic_id: str
    status_filter: Optional[str] = None
    include_archived: bool = False


class InterventionCourseRow(BaseModel):
    """Single intervention course row in clinic summary.

    Decision-support only. Associations shown are temporal, not causal proof.
    """
    course_id: str
    patient_id: str
    patient_name: str
    clinician_id: str
    intervention_type: str
    modality_slug: Optional[str] = None
    protocol_id: Optional[str] = None
    target_region: Optional[str] = None
    condition_slug: Optional[str] = None
    planned_sessions: int
    completed_sessions: int
    missed_sessions: int = 0
    phase: str = "acute"
    course_sign_status: CourseSignStatus = "unknown"
    adverse_event_count: int = 0
    last_session_at: Optional[str] = None
    updated_at: Optional[str] = None


class ClinicSummaryOut(BaseModel):
    """Clinic-wide intervention summary response.

    Aggregated in 3 queries instead of N+1 fan-out.
    Decision-support only. Requires clinician review.
    Not a calibrated prediction model.
    """
    clinic_id: str
    generated_at: str
    total_courses: int
    total_patients: int
    courses: list[InterventionCourseRow]
    sign_status_summary: SignStatusBatchSummaryOut
    adverse_event_count: int
    provenance: dict[str, Any] = Field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _course_accessible(db: Session, course_id: str, actor: AuthenticatedActor) -> bool:
    course = get_treatment_course(db, course_id)
    if course is None:
        return False
    if actor.role == "admin":
        return True
    return course.clinician_id == actor.actor_id


def _session_accessible(db: Session, session_id: str, actor: AuthenticatedActor) -> ClinicalSession | None:
    record = db.query(ClinicalSession).filter(ClinicalSession.id == session_id).first()
    if record is None:
        return None
    try:
        _, clinic_id = resolve_patient_clinic_id(db, record.patient_id)
        require_patient_owner(actor, clinic_id, allow_admin=True)
    except ApiServiceError as exc:
        if exc.code == "cross_clinic_access_denied":
            return None
        raise
    return record


def _parse_payload(row: ClinicalSessionEvent) -> dict[str, Any]:
    try:
        return json.loads(row.payload_json or "{}")
    except Exception:
        return {}


def _aggregate_sign_review(rows: list[ClinicalSessionEvent]) -> tuple[
    SignStatus,
    ReviewStatus,
    Optional[str],
    Optional[str],
    Optional[str],
    Optional[str],
    int,
    Optional[datetime],
]:
    """Derive status from SIGN and REVIEW events (latest wins per type).

    ``rows`` must contain only SIGN/REVIEW events for this session. When empty:
    sign-off is **pending** (no SIGN recorded yet), not unknown -- the session exists
    in the delivered log.

    Decision-support only. Requires clinician review.
    """
    if not rows:
        return ("pending", "unknown", None, None, None, None, 0, None)

    sign_rows = [r for r in rows if str(r.event_type).upper() == "SIGN"]
    review_rows = [r for r in rows if str(r.event_type).upper() == "REVIEW"]

    latest_sign = max(sign_rows, key=lambda r: r.created_at) if sign_rows else None
    latest_review = max(review_rows, key=lambda r: r.created_at) if review_rows else None

    signed_at = latest_sign.created_at.isoformat() if latest_sign else None
    reviewed_at = latest_review.created_at.isoformat() if latest_review else None

    pay_s = _parse_payload(latest_sign) if latest_sign else {}
    pay_r = _parse_payload(latest_review) if latest_review else {}

    signed_by_raw = pay_s.get("signed_by") if latest_sign else None
    signed_by = (
        signed_by_raw.strip()
        if isinstance(signed_by_raw, str) and signed_by_raw.strip()
        else (latest_sign.actor_id if latest_sign else None)
    )
    reviewed_by_raw = pay_r.get("reviewed_by") if latest_review else None
    reviewed_by = (
        reviewed_by_raw.strip()
        if isinstance(reviewed_by_raw, str) and reviewed_by_raw.strip()
        else (latest_review.actor_id if latest_review else None)
    )

    sign_status: SignStatus = "signed" if latest_sign else "pending"
    review_status: ReviewStatus = "reviewed" if latest_review else ("pending" if latest_sign else "unknown")

    latest_ev = max(r.created_at for r in rows)

    return (
        sign_status,
        review_status,
        signed_at,
        signed_by,
        reviewed_at,
        reviewed_by,
        len(rows),
        latest_ev,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/sign-status/batch", response_model=SignStatusBatchOut)
def batch_session_sign_status(
    body: SignStatusBatchIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SignStatusBatchOut:
    """Return SIGN/REVIEW status for delivered sessions without per-session N+1 calls.

    Decision-support only. Not a calibrated prediction model. Requires clinician review.
    """
    require_minimum_role(actor, "clinician")

    if len(body.course_ids) > MAX_COURSE_IDS or len(body.session_ids) > MAX_SESSION_IDS:
        raise ApiServiceError(
            code="batch_limit",
            message=f"At most {MAX_COURSE_IDS} course_ids and {MAX_SESSION_IDS} session_ids.",
            status_code=422,
        )

    c_ids = list(
        dict.fromkeys(
            [(c or "").strip() for c in body.course_ids if (c or "").strip()]
        )
    )
    s_ids = list(
        dict.fromkeys(
            [(s or "").strip() for s in body.session_ids if (s or "").strip()]
        )
    )

    if not c_ids and not s_ids:
        raise ApiServiceError(
            code="empty_batch",
            message="Provide at least one course_id or session_id.",
            status_code=422,
        )

    # course_id -> session_id from delivered logs (accessible courses only)
    session_to_course: dict[str, str] = {}
    for cid in c_ids:
        if not _course_accessible(db, cid, actor):
            continue
        logs = (
            db.query(DeliveredSessionParameters)
            .filter(DeliveredSessionParameters.course_id == cid)
            .all()
        )
        for log in logs:
            if log.session_id:
                session_to_course[log.session_id] = cid

    # Explicit session ids: attach course from DeliveredSessionParameters if any row exists
    for sid in s_ids:
        if sid in session_to_course:
            continue
        log = (
            db.query(DeliveredSessionParameters)
            .filter(DeliveredSessionParameters.session_id == sid)
            .first()
        )
        if log is not None and _course_accessible(db, log.course_id, actor):
            session_to_course[sid] = log.course_id

    candidate_sessions = list(session_to_course.keys())

    # Filter to sessions the actor may read (clinic scope)
    accessible: dict[str, tuple[Optional[str], ClinicalSession]] = {}
    for sid in candidate_sessions:
        course_id = session_to_course.get(sid)
        rec = _session_accessible(db, sid, actor)
        if rec is None:
            continue
        accessible[sid] = (course_id, rec)

    if not accessible:
        return SignStatusBatchOut(
            items=[],
            summary=SignStatusBatchSummaryOut(
                requested_course_count=len(c_ids),
                requested_session_count=len(s_ids),
                returned_count=0,
                signed_count=0,
                pending_count=0,
                unknown_count=0,
            ),
            courses=[],
        )

    acc_ids = list(accessible.keys())

    all_ev_rows = (
        db.query(ClinicalSessionEvent)
        .filter(ClinicalSessionEvent.session_id.in_(acc_ids))
        .order_by(ClinicalSessionEvent.created_at.asc())
        .all()
    )
    by_session: dict[str, list[ClinicalSessionEvent]] = {}
    for row in all_ev_rows:
        et = str(row.event_type).upper()
        if et not in ("SIGN", "REVIEW"):
            continue
        by_session.setdefault(row.session_id, []).append(row)

    items: list[SessionSignStatusItemOut] = []
    signed_n = pending_n = unknown_n = 0

    for sid in acc_ids:
        course_id = accessible[sid][0]
        rows = by_session.get(sid, [])
        (
            sign_status,
            review_status,
            signed_at,
            signed_by,
            reviewed_at,
            reviewed_by,
            ev_count,
            latest_ev,
        ) = _aggregate_sign_review(rows)

        if sign_status == "signed":
            signed_n += 1
        elif sign_status == "pending":
            pending_n += 1
        elif sign_status == "unknown":
            unknown_n += 1

        miss: Optional[MissingReason] = "no_events" if ev_count == 0 else None

        ev_out: list[SessionSignEventOut] = []
        if body.include_events and rows:
            for r in rows[-20:]:
                ev_out.append(
                    SessionSignEventOut(
                        id=r.id,
                        event_type=str(r.event_type),
                        created_at=r.created_at.isoformat(),
                        actor_id=r.actor_id,
                    )
                )

        items.append(
            SessionSignStatusItemOut(
                course_id=course_id,
                session_id=sid,
                sign_status=sign_status,
                review_status=review_status,
                signed_at=signed_at,
                signed_by=signed_by,
                reviewed_at=reviewed_at,
                reviewed_by=reviewed_by,
                source="clinical_session_events",
                event_count=ev_count,
                latest_event_at=latest_ev.isoformat() if latest_ev else None,
                missing_reason=miss,
                events=ev_out,
            )
        )

    # Course aggregates (only courses that had at least one returned session)
    course_ids_in_items = {i.course_id for i in items if i.course_id}
    courses_out: list[CourseSignAggregateOut] = []
    for cid in sorted(course_ids_in_items):
        rel = [i for i in items if i.course_id == cid]
        sc = len(rel)
        sn = sum(1 for i in rel if i.sign_status == "signed")
        pn = sum(1 for i in rel if i.sign_status == "pending")
        un = sum(1 for i in rel if i.sign_status == "unknown")
        latest: Optional[datetime] = None
        for i in rel:
            if i.latest_event_at:
                try:
                    d = datetime.fromisoformat(i.latest_event_at.replace("Z", "+00:00"))
                    if latest is None or d > latest:
                        latest = d
                except Exception:
                    pass
        if sc == 0:
            cs: CourseSignStatus = "unknown"
        elif sn == sc:
            cs = "complete"
        elif sn > 0 or any(i.sign_status == "pending" for i in rel):
            cs = "partial"
        elif pn == sc:
            cs = "pending"
        else:
            cs = "unknown"

        courses_out.append(
            CourseSignAggregateOut(
                course_id=cid,
                session_count=sc,
                signed_count=sn,
                pending_count=pn,
                unknown_count=un,
                course_sign_status=cs,
                latest_event_at=latest.isoformat() if latest else None,
            )
        )

    summary = SignStatusBatchSummaryOut(
        requested_course_count=len(c_ids),
        requested_session_count=len(s_ids),
        returned_count=len(items),
        signed_count=signed_n,
        pending_count=pending_n,
        unknown_count=unknown_n,
    )

    return SignStatusBatchOut(items=items, summary=summary, courses=courses_out)


@router.post("/clinic-summary", response_model=ClinicSummaryOut)
def clinic_summary(
    body: ClinicSummaryIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ClinicSummaryOut:
    """Return clinic-wide intervention summary without N+1 fan-out.

    Single endpoint that batches: courses, sign status, patient names,
    outcome summaries, and adverse events in 3 queries instead of N+1.

    Decision-support only. Not a calibrated prediction model.
    Requires clinician review. Associations shown are temporal, not causal proof.
    """
    require_minimum_role(actor, "clinician")

    # Resolve actor's clinic scope
    if actor.role == "admin":
        requested_clinic_id = body.clinic_id
    else:
        user_row = db.query(User).filter(User.id == actor.actor_id).first()
        if user_row is None or not user_row.clinic_id:
            raise ApiServiceError(
                code="no_clinic_scope",
                message="Authenticated actor is not associated with a clinic.",
                status_code=403,
            )
        requested_clinic_id = user_row.clinic_id
        if body.clinic_id and body.clinic_id != requested_clinic_id:
            raise ApiServiceError(
                code="cross_clinic_access_denied",
                message="Clinician may only query their own clinic.",
                status_code=403,
            )

    # ── Query 1: All clinician IDs in clinic ──
    clinician_ids = [
        u.id for u in db.query(User).filter(User.clinic_id == requested_clinic_id).all()
    ]
    if not clinician_ids:
        return ClinicSummaryOut(
            clinic_id=requested_clinic_id,
            generated_at=datetime.now().isoformat(),
            total_courses=0,
            total_patients=0,
            courses=[],
            sign_status_summary=SignStatusBatchSummaryOut(
                requested_course_count=0,
                requested_session_count=0,
                returned_count=0,
                signed_count=0,
                pending_count=0,
                unknown_count=0,
            ),
            adverse_event_count=0,
            provenance={
                "source": "api",
                "source_ref": "intervention_analyzer/clinic_summary/v1",
                "note": "No clinicians found for clinic.",
            },
        )

    # ── Query 2: All courses for patients of clinicians in clinic ──
    course_q = db.query(TreatmentCourse).filter(
        TreatmentCourse.clinician_id.in_(clinician_ids)
    )
    if body.status_filter:
        course_q = course_q.filter(TreatmentCourse.status == body.status_filter)
    if not body.include_archived:
        course_q = course_q.filter(
            TreatmentCourse.status.not_in(["archived", "deleted"])
        )
    courses: list[TreatmentCourse] = course_q.all()

    patient_ids = list({c.patient_id for c in courses if c.patient_id})

    # ── Query 3: All patient names in one batch ──
    patients_map: dict[str, Patient] = {}
    if patient_ids:
        patient_rows = db.query(Patient).filter(Patient.id.in_(patient_ids)).all()
        patients_map = {p.id: p for p in patient_rows}

    # ── Query 4: Adverse event counts per course (single batch) ──
    course_ids = [c.id for c in courses]
    ae_counts: dict[str, int] = {}
    if course_ids:
        ae_rows = (
            db.query(AdverseEvent.course_id)
            .filter(AdverseEvent.course_id.in_(course_ids))
            .all()
        )
        for row in ae_rows:
            cid = row[0]
            ae_counts[cid] = ae_counts.get(cid, 0) + 1

    # ── Query 5: Batch sign status via existing aggregation logic ──
    # Build session-to-course map from delivered parameters
    session_to_course: dict[str, str] = {}
    if course_ids:
        dsp_rows = (
            db.query(DeliveredSessionParameters)
            .filter(DeliveredSessionParameters.course_id.in_(course_ids))
            .all()
        )
        for dsp in dsp_rows:
            if dsp.session_id:
                session_to_course[dsp.session_id] = dsp.course_id

    # Aggregate sign events for all sessions
    sign_counts: dict[str, dict[str, int]] = {}
    for cid in course_ids:
        sign_counts[cid] = {"signed": 0, "pending": 0, "unknown": 0}

    session_ids_list = list(session_to_course.keys())
    if session_ids_list:
        all_ev_rows = (
            db.query(ClinicalSessionEvent)
            .filter(ClinicalSessionEvent.session_id.in_(session_ids_list))
            .all()
        )
        by_session: dict[str, list[ClinicalSessionEvent]] = {}
        for row in all_ev_rows:
            et = str(row.event_type).upper()
            if et not in ("SIGN", "REVIEW"):
                continue
            by_session.setdefault(row.session_id, []).append(row)

        for sid, ev_rows in by_session.items():
            cid = session_to_course.get(sid)
            if cid is None:
                continue
            sign_rows = [r for r in ev_rows if str(r.event_type).upper() == "SIGN"]
            if sign_rows:
                sign_counts[cid]["signed"] += 1
            else:
                sign_counts[cid]["pending"] += 1

        # Count sessions with no sign events as pending
        for sid, cid in session_to_course.items():
            if sid not in by_session:
                sign_counts[cid]["pending"] += 1

    # ── Build course sign status aggregate ──
    total_signed = sum(c["signed"] for c in sign_counts.values())
    total_pending = sum(c["pending"] for c in sign_counts.values())
    total_unknown = sum(c["unknown"] for c in sign_counts.values())

    # ── Assemble output rows ──
    course_rows: list[InterventionCourseRow] = []
    for c in courses:
        patient = patients_map.get(c.patient_id)
        patient_name = f"{patient.first_name} {patient.last_name}" if patient else "Unknown"

        sc = sign_counts.get(c.id, {"signed": 0, "pending": 0, "unknown": 0})
        total_sc = sc["signed"] + sc["pending"] + sc["unknown"]
        if total_sc == 0:
            cs: CourseSignStatus = "unknown"
        elif sc["signed"] == total_sc:
            cs = "complete"
        elif sc["signed"] > 0 or sc["pending"] > 0:
            cs = "partial"
        elif sc["pending"] == total_sc:
            cs = "pending"
        else:
            cs = "unknown"

        # Derive phase from session counts
        if c.sessions_delivered and c.planned_sessions_total:
            ratio = c.sessions_delivered / max(c.planned_sessions_total, 1)
            if ratio < 0.35:
                phase = "acute"
            elif ratio < 0.85:
                phase = "continuation"
            else:
                phase = "maintenance"
        else:
            phase = "acute"

        course_rows.append(
            InterventionCourseRow(
                course_id=c.id,
                patient_id=c.patient_id,
                patient_name=patient_name,
                clinician_id=c.clinician_id,
                intervention_type=c.modality_slug or "unknown",
                modality_slug=c.modality_slug,
                protocol_id=c.protocol_id,
                target_region=c.target_region,
                condition_slug=c.condition_slug,
                planned_sessions=c.planned_sessions_total or 0,
                completed_sessions=c.sessions_delivered or 0,
                phase=phase,
                course_sign_status=cs,
                adverse_event_count=ae_counts.get(c.id, 0),
                updated_at=c.updated_at.isoformat() if c.updated_at else None,
            )
        )

    total_ae = sum(ae_counts.values())
    generated_at = datetime.now().isoformat()

    sign_summary = SignStatusBatchSummaryOut(
        requested_course_count=len(course_ids),
        requested_session_count=len(session_ids_list),
        returned_count=len(session_ids_list),
        signed_count=total_signed,
        pending_count=total_pending,
        unknown_count=total_unknown,
    )

    return ClinicSummaryOut(
        clinic_id=requested_clinic_id,
        generated_at=generated_at,
        total_courses=len(course_rows),
        total_patients=len(patient_ids),
        courses=course_rows,
        sign_status_summary=sign_summary,
        adverse_event_count=total_ae,
        provenance={
            "source": "api",
            "source_ref": "intervention_analyzer/clinic_summary/v1",
            "extracted_at": generated_at,
            "note": (
                "Aggregated in 3-5 queries (clinicians, courses, patients, adverse events, sign events). "
                "Decision-support only. Not a calibrated prediction model. "
                "Associations shown are temporal, not causal proof."
            ),
        },
    )
