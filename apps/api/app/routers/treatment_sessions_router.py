"""Treatment Sessions Analyzer — batch sign/review status (no N+1).

Decision-support visibility only — not treatment approval or protocol changes.
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
from app.repositories.treatment_sessions import ClinicalSession, ClinicalSessionEvent, DeliveredSessionParameters, TreatmentCourse
from app.repositories.patients import resolve_patient_clinic_id
from app.repositories.treatment_courses import get_treatment_course

router = APIRouter(prefix="/api/v1/treatment-sessions", tags=["Treatment Sessions"])

MAX_COURSE_IDS = 100
MAX_SESSION_IDS = 500

SignStatus = Literal["signed", "pending", "unknown"]
ReviewStatus = Literal["reviewed", "pending", "unknown"]
CourseSignStatus = Literal["complete", "partial", "pending", "unknown"]
MissingReason = Literal["no_events", "not_found"]


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
    sign-off is **pending** (no SIGN recorded yet), not unknown — the session exists
    in the delivered log.
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
    signed_by = signed_by_raw if isinstance(signed_by_raw, str) else (latest_sign.actor_id if latest_sign else None)
    reviewed_by_raw = pay_r.get("reviewed_by") if latest_review else None
    reviewed_by = reviewed_by_raw if isinstance(reviewed_by_raw, str) else (latest_review.actor_id if latest_review else None)

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


@router.post("/sign-status/batch", response_model=SignStatusBatchOut)
def batch_session_sign_status(
    body: SignStatusBatchIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SignStatusBatchOut:
    """Return SIGN/REVIEW status for delivered sessions without per-session N+1 calls."""
    require_minimum_role(actor, "clinician")

    if len(body.course_ids) > MAX_COURSE_IDS or len(body.session_ids) > MAX_SESSION_IDS:
        raise ApiServiceError(
            code="batch_limit",
            message=f"At most {MAX_COURSE_IDS} course_ids and {MAX_SESSION_IDS} session_ids.",
            status_code=422,
        )

    c_ids = list(dict.fromkeys([c for c in body.course_ids if c]))
    s_ids = list(dict.fromkeys([s for s in body.session_ids if s]))

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
