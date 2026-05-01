"""Patient Messages launch-audit (2026-05-01).

Fourth patient-facing launch-audit surface in the chain after Symptom
Journal (#344), Wellness Hub (#345), and Patient Reports (#346). Mirrors
the audit shape established by those three so all four patient-side
surfaces share the same role / consent / demo / audit contract.

This router does **not** introduce a new ``MessageThread`` model: the
existing :class:`app.persistence.models.Message` row already carries
``thread_id`` (added pre-PR-#50) and Patient Reports (#346) seeds rows
with ``thread_id = "report-{report_id}"`` via
``POST /api/v1/reports/{id}/start-question``. We consolidate on that
shape rather than fork a parallel schema. The thread is the GROUP-BY of
``Message.thread_id`` for messages where ``patient_id == actor.patient.id``.

Endpoints
---------
GET    /api/v1/messages/threads                List patient-scoped threads (filters)
GET    /api/v1/messages/threads/summary        Counts: unread / urgent / awaiting_reply / today
GET    /api/v1/messages/threads/{thread_id}    Thread detail; auto-emits ``thread_opened``
POST   /api/v1/messages/threads                Compose a new thread (category required)
POST   /api/v1/messages/threads/{thread_id}/messages         Reply to an existing thread
POST   /api/v1/messages/threads/{thread_id}/mark-urgent      Patient flags as urgent (clinician audit)
POST   /api/v1/messages/threads/{thread_id}/mark-resolved    Patient marks the thread resolved
POST   /api/v1/messages/threads/{thread_id}/messages/{message_id}/mark-read
                                                Patient marks an inbound message as read
POST   /api/v1/messages/audit-events           Page-level audit ingestion (target_type=patient_messages)

Role gate
---------
Patient role only. Clinicians use the existing clinician-side message
endpoints (PR #50 + the messaging hub). Cross-role hits return 404 to
avoid even hinting that the URL exists outside patient scope. Cross-
patient ``thread_id`` lookups also return 404.

Consent gate
------------
Once a patient has revoked consent (``Patient.consent_signed = False``
OR an active ``ConsentRecord`` row with ``status='withdrawn'``) the
inbox is read-only post-revocation: existing threads remain visible,
no new threads / replies / urgent flags can be set (HTTP 403).

Demo honesty
------------
``is_demo`` is sourced from :func:`_patient_is_demo_pm` so the page can
render the DEMO banner only when the patient row is genuinely demo. The
client-side is responsible for not showing demo seed threads to a real
patient — server-side just stamps the existing thread + audit rows
honestly.

Audit hooks
-----------
Every endpoint emits at least one ``patient_messages.<event>`` audit row
through the umbrella audit_events table. Surface name:
``patient_messages`` (whitelisted by ``audit_trail_router.KNOWN_SURFACES``
and the qEEG ``/audit-events`` ingestion endpoint).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    ConsentRecord,
    Message,
    Patient,
    PatientMediaUpload,
    User,
)


router = APIRouter(prefix="/api/v1/messages", tags=["Patient Messages"])
_log = logging.getLogger(__name__)


# ── Disclaimers surfaced on every list / summary read ───────────────────────


PATIENT_MESSAGES_DISCLAIMERS = [
    "Messages are part of your clinical record. Sending, opening, and "
    "marking a thread urgent are all audited so your care team can see "
    "what you have read and acted on.",
    "An automated reply or AI-drafted suggestion is decision-support "
    "only. The ground-truth response is the one your clinician sends.",
    "If you withdraw consent, your existing message threads remain "
    "readable but you cannot send new messages, mark urgent or resolve "
    "until consent is reinstated.",
]


# Allowed thread categories. ``report-question`` mirrors the value
# Patient Reports (#346) stamps on threads created via
# ``POST /api/v1/reports/{id}/start-question`` — keeping the enum
# consistent across the two routers means the messages page can render
# the deep-link cross-back without hard-coding the category elsewhere.
_ALLOWED_CATEGORIES = {
    "general",
    "treatment-plan",
    "urgent",
    "report-question",
    "system",
    # Pre-existing categories already in flight from the patient-portal
    # composer; we keep these tolerated rather than forcing a migration
    # of historical rows.
    "session",
    "side-effects",
    "documents",
    "billing",
    "other",
    "call_log",
    "call_request",
}

_DEFAULT_CATEGORY = "general"


# ── Helpers ─────────────────────────────────────────────────────────────────


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}


def _patient_is_demo_pm(db: Session, patient: Patient | None) -> bool:
    """Mirrors :func:`patients_router._patient_is_demo` for this surface.

    Avoids a circular import — the canonical helper lives in
    ``patients_router`` but each launch-audit router carries a small
    copy so the surface is self-contained.
    """
    if patient is None:
        return False
    notes = patient.notes or ""
    if notes.startswith("[DEMO]"):
        return True
    try:
        u = db.query(User).filter_by(id=patient.clinician_id).first()
        if u is None or not u.clinic_id:
            return False
        return u.clinic_id in {"clinic-demo-default", "clinic-cd-demo"}
    except Exception:
        return False


def _resolve_patient_for_actor_pm(
    db: Session, actor: AuthenticatedActor
) -> Patient:
    """Return the Patient row the actor is allowed to act on.

    Patient role only. Cross-role hits return 404 (never 403 / 401) so
    the existence of the patient-scope endpoints is invisible to
    clinicians and admins. Clinicians use the existing
    ``/api/v1/patient-portal/messages`` (clinician-side) and the future
    clinician-messages router.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="not_found",
            message="Patient record not found.",
            status_code=404,
        )

    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        patient = (
            db.query(Patient)
            .filter(Patient.email.in_(list(_DEMO_PATIENT_EMAILS)))
            .first()
        )
    else:
        user = db.query(User).filter_by(id=actor.actor_id).first()
        if user is None or not user.email:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="not_found",
            message="Patient record not found.",
            status_code=404,
        )
    return patient


def _consent_active_pm(db: Session, patient: Patient) -> bool:
    """Same consent gate as symptom_journal_router / wellness_hub_router /
    reports_router patient-side helpers.
    """
    has_withdrawn = (
        db.query(ConsentRecord)
        .filter(
            ConsentRecord.patient_id == patient.id,
            ConsentRecord.status == "withdrawn",
        )
        .first()
        is not None
    )
    if has_withdrawn:
        return False
    if patient.consent_signed:
        return True
    has_active = (
        db.query(ConsentRecord)
        .filter(
            ConsentRecord.patient_id == patient.id,
            ConsentRecord.status == "active",
        )
        .first()
        is not None
    )
    return has_active


def _assert_patient_consent_active(db: Session, patient: Patient) -> None:
    if not _consent_active_pm(db, patient):
        raise ApiServiceError(
            code="consent_inactive",
            message=(
                "Sending messages, replying, or flagging a thread urgent "
                "requires active consent. Existing threads remain readable "
                "until consent is reinstated."
            ),
            status_code=403,
        )


def _patient_messages_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
    target_type: str = "patient_messages",
    role_override: Optional[str] = None,
    actor_override: Optional[str] = None,
) -> str:
    """Best-effort audit hook for the ``patient_messages`` surface.

    Never raises — audit must not block the UI even when the umbrella
    audit table is unreachable. Mirrors the helpers in
    symptom_journal_router / wellness_hub_router / reports_router.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    role = role_override or actor.role
    actor_id = actor_override or actor.actor_id
    event_id = (
        f"patient_messages-{event}-{actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if using_demo_data:
        note_parts.append("DEMO")
    if note:
        note_parts.append(note[:500])
    final_note = "; ".join(note_parts) or event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor_id,
            target_type=target_type,
            action=f"patient_messages.{event}",
            role=role,
            actor_id=actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("patient_messages self-audit skipped")
    return event_id


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Coerce a naive datetime to tz-aware UTC.

    SQLite strips tzinfo on roundtrip — see memory note
    ``deepsynaps-sqlite-tz-naive.md``. All comparisons against
    ``datetime.now(timezone.utc)`` must coerce first.
    """
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _normalise_category(raw: Optional[str]) -> str:
    """Return a server-known category, defaulting to ``general``.

    Free-form strings would pollute the audit notes and the inbox UI
    chips, so we restrict to the documented enum.
    """
    if not raw:
        return _DEFAULT_CATEGORY
    raw_lc = raw.strip().lower()
    if raw_lc in _ALLOWED_CATEGORIES:
        return raw_lc
    return _DEFAULT_CATEGORY


def _message_to_dict(row: Message, *, actor_id: str) -> dict:
    """Render a Message row as a wire dict for the patient-scope API."""
    is_outgoing = row.sender_id == actor_id
    return {
        "id": row.id,
        "thread_id": row.thread_id,
        "patient_id": row.patient_id,
        "sender_id": row.sender_id,
        "recipient_id": row.recipient_id,
        "sender_type": "patient" if is_outgoing else "clinician",
        "subject": row.subject,
        "body": row.body,
        "category": row.category,
        "priority": row.priority,
        "is_urgent": (row.priority or "").lower() == "urgent",
        "created_at": (
            _aware(row.created_at).isoformat()
            if _aware(row.created_at) is not None
            else None
        ),
        "read_at": (
            _aware(row.read_at).isoformat()
            if _aware(row.read_at) is not None
            else None
        ),
        "is_read": row.read_at is not None,
        "is_outgoing": is_outgoing,
    }


def _thread_summary_from_messages(
    rows: list[Message], *, actor_id: str
) -> dict:
    """Reduce a list of Message rows (already sorted asc by created_at)
    sharing the same ``thread_id`` to a thread-level summary dict.
    """
    if not rows:
        return {}
    first = rows[0]
    last = rows[-1]
    incoming = [r for r in rows if r.sender_id != actor_id]
    last_incoming = incoming[-1] if incoming else None
    unread_inbound = sum(
        1
        for r in rows
        if r.sender_id != actor_id and r.read_at is None
    )
    is_urgent = any(
        (r.priority or "").lower() == "urgent" for r in rows
    )
    awaiting_reply = (
        last_incoming is None  # no clinician reply yet — patient awaits
        if first.sender_id == actor_id
        else False
    )
    # Subject defaults to the thread starter's subject; falls back to a
    # category-derived label so the UI never shows a blank tile.
    subject = (first.subject or "").strip()
    if not subject:
        subject = (
            "Question about a report"
            if (first.category or "").lower() == "report-question"
            else "Message thread"
        )
    return {
        "thread_id": first.thread_id or first.id,
        "subject": subject,
        "category": first.category,
        "patient_id": first.patient_id,
        "message_count": len(rows),
        "unread_count": unread_inbound,
        "is_urgent": is_urgent,
        "is_resolved": last.priority == "resolved",
        "awaiting_clinician_reply": awaiting_reply,
        "started_at": (
            _aware(first.created_at).isoformat()
            if _aware(first.created_at) is not None
            else None
        ),
        "last_activity_at": (
            _aware(last.created_at).isoformat()
            if _aware(last.created_at) is not None
            else None
        ),
        "last_sender_type": "patient" if last.sender_id == actor_id else "clinician",
        "last_message_preview": (last.body or "")[:160],
    }


def _patient_messages_query(db: Session, patient: Patient):
    """Base query: every Message row that belongs to this patient.

    We scope by ``patient_id`` (not by sender / recipient) so a thread
    started by the clinician is still visible to the patient. The
    Patient Reports start-question handler stamps ``patient_id`` on
    every row it creates, so the same scope holds there.
    """
    return db.query(Message).filter(Message.patient_id == patient.id)


def _resolve_thread(
    db: Session,
    patient: Patient,
    thread_id: str,
) -> list[Message]:
    """Return all Messages in a thread for this patient, or 404.

    Cross-patient ``thread_id`` lookups return 404 — even if the thread
    exists in another patient's scope, the existence of that thread
    must not be observable here.
    """
    rows = (
        _patient_messages_query(db, patient)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    if not rows:
        raise ApiServiceError(
            code="not_found",
            message="Message thread not found.",
            status_code=404,
        )
    return rows


def _resolve_recipient_for_new_thread(patient: Patient) -> str:
    """Return the actor_id the patient's new thread should route to.

    Falls back to the demo clinician id so demo-mode threads can still
    be persisted with a non-null recipient.
    """
    return getattr(patient, "clinician_id", None) or "actor-clinician-demo"


# ── Schemas ─────────────────────────────────────────────────────────────────


class PatientMessageOut(BaseModel):
    id: str
    thread_id: Optional[str] = None
    patient_id: Optional[str] = None
    sender_id: str
    recipient_id: str
    sender_type: str
    subject: Optional[str] = None
    body: str
    category: Optional[str] = None
    priority: Optional[str] = None
    is_urgent: bool = False
    created_at: Optional[str] = None
    read_at: Optional[str] = None
    is_read: bool = False
    is_outgoing: bool = False


class PatientThreadOut(BaseModel):
    thread_id: str
    subject: str
    category: Optional[str] = None
    patient_id: Optional[str] = None
    message_count: int = 0
    unread_count: int = 0
    is_urgent: bool = False
    is_resolved: bool = False
    awaiting_clinician_reply: bool = False
    started_at: Optional[str] = None
    last_activity_at: Optional[str] = None
    last_sender_type: Optional[str] = None
    last_message_preview: Optional[str] = None


class PatientThreadDetailOut(BaseModel):
    thread: PatientThreadOut
    messages: list[PatientMessageOut] = Field(default_factory=list)
    is_demo: bool = False
    consent_active: bool = True
    related_report_id: Optional[str] = None
    disclaimers: list[str] = Field(
        default_factory=lambda: list(PATIENT_MESSAGES_DISCLAIMERS)
    )


class PatientThreadListResponse(BaseModel):
    items: list[PatientThreadOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    consent_active: bool
    is_demo: bool
    disclaimers: list[str] = Field(
        default_factory=lambda: list(PATIENT_MESSAGES_DISCLAIMERS)
    )


class PatientMessagesSummaryResponse(BaseModel):
    total_threads: int = 0
    unread: int = 0
    urgent: int = 0
    awaiting_reply: int = 0
    from_care_team_today: int = 0
    by_category: dict[str, int] = Field(default_factory=dict)
    consent_active: bool = True
    is_demo: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(PATIENT_MESSAGES_DISCLAIMERS)
    )


class PatientThreadCreateIn(BaseModel):
    category: str = Field(..., min_length=1, max_length=64)
    subject: Optional[str] = Field(default=None, max_length=255)
    body: str = Field(..., min_length=1, max_length=4000)
    is_urgent: bool = False

    @field_validator("body")
    @classmethod
    def _strip_body(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("body cannot be blank")
        return v


class PatientThreadReplyIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    is_urgent: bool = False

    @field_validator("body")
    @classmethod
    def _strip_body(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("body cannot be blank")
        return v


class PatientThreadMarkUrgentIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=255)


class PatientThreadMarkResolvedIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=255)


class PatientThreadActionOut(BaseModel):
    accepted: bool
    thread_id: str
    is_urgent: Optional[bool] = None
    is_resolved: Optional[bool] = None
    updated_at: Optional[str] = None


class PatientMessageReadOut(BaseModel):
    accepted: bool
    thread_id: str
    message_id: str
    read_at: Optional[str] = None


class PatientMessagesAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    thread_id: Optional[str] = Field(default=None, max_length=128)
    message_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class PatientMessagesAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/threads", response_model=PatientThreadListResponse)
def list_threads(
    category: Optional[str] = Query(default=None, max_length=64),
    status: Optional[str] = Query(default=None, max_length=32),
    since: Optional[str] = Query(default=None, max_length=64),
    until: Optional[str] = Query(default=None, max_length=64),
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientThreadListResponse:
    """List threads visible to this patient, grouped by ``thread_id``.

    Filters:
      * ``category`` — server-known category enum
      * ``status``   — ``urgent`` / ``resolved`` / ``unread`` / ``awaiting_reply``
      * ``since`` / ``until`` — ISO-8601 timestamp filter on
        ``last_activity_at``
      * ``q`` — substring match on subject / body
    """
    patient = _resolve_patient_for_actor_pm(db, actor)
    is_demo = _patient_is_demo_pm(db, patient)

    base = _patient_messages_query(db, patient)
    if since:
        try:
            ts = datetime.fromisoformat(since.replace("Z", "+00:00"))
            base = base.filter(Message.created_at >= ts)
        except ValueError:
            pass
    if until:
        try:
            ts = datetime.fromisoformat(until.replace("Z", "+00:00"))
            base = base.filter(Message.created_at <= ts)
        except ValueError:
            pass
    if q:
        like = f"%{q.strip()}%"
        base = base.filter(
            or_(Message.subject.like(like), Message.body.like(like))
        )

    rows = base.order_by(Message.created_at.asc()).all()

    # Group by thread_id (fall back to message id when thread_id is null —
    # legacy rows pre-PR-#50 had null thread_id).
    grouped: dict[str, list[Message]] = {}
    for r in rows:
        key = r.thread_id or r.id
        grouped.setdefault(key, []).append(r)

    threads = [
        _thread_summary_from_messages(msgs, actor_id=actor.actor_id)
        for msgs in grouped.values()
    ]

    # Filter by category (post-aggregation so we apply against the
    # thread starter's category, not any reply).
    if category:
        category_lc = category.strip().lower()
        threads = [t for t in threads if (t.get("category") or "").lower() == category_lc]

    # Filter by status (UI chips).
    if status:
        status_lc = status.strip().lower()
        if status_lc == "urgent":
            threads = [t for t in threads if t.get("is_urgent")]
        elif status_lc == "resolved":
            threads = [t for t in threads if t.get("is_resolved")]
        elif status_lc == "unread":
            threads = [t for t in threads if t.get("unread_count", 0) > 0]
        elif status_lc == "awaiting_reply":
            threads = [t for t in threads if t.get("awaiting_clinician_reply")]

    # Sort by last_activity_at desc (None last).
    threads.sort(
        key=lambda t: (t.get("last_activity_at") or ""),
        reverse=True,
    )

    total = len(threads)
    page = threads[offset : offset + limit]

    _patient_messages_audit(
        db,
        actor,
        event="view",
        target_id=patient.id,
        note=(
            f"items={len(page)} total={total} category={category or '-'} "
            f"status={status or '-'}"
        ),
        using_demo_data=is_demo,
    )

    return PatientThreadListResponse(
        items=[PatientThreadOut(**t) for t in page],
        total=total,
        limit=limit,
        offset=offset,
        consent_active=_consent_active_pm(db, patient),
        is_demo=is_demo,
    )


@router.get(
    "/threads/summary", response_model=PatientMessagesSummaryResponse
)
def get_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientMessagesSummaryResponse:
    patient = _resolve_patient_for_actor_pm(db, actor)
    is_demo = _patient_is_demo_pm(db, patient)
    rows = (
        _patient_messages_query(db, patient)
        .order_by(Message.created_at.asc())
        .all()
    )

    grouped: dict[str, list[Message]] = {}
    for r in rows:
        key = r.thread_id or r.id
        grouped.setdefault(key, []).append(r)

    now = datetime.now(timezone.utc)
    today_cutoff = now - timedelta(days=1)

    unread = 0
    urgent = 0
    awaiting_reply = 0
    from_care_team_today = 0
    by_category: dict[str, int] = {}
    for msgs in grouped.values():
        summary = _thread_summary_from_messages(msgs, actor_id=actor.actor_id)
        if summary.get("unread_count", 0) > 0:
            unread += 1
        if summary.get("is_urgent"):
            urgent += 1
        if summary.get("awaiting_clinician_reply"):
            awaiting_reply += 1
        cat = summary.get("category") or _DEFAULT_CATEGORY
        by_category[cat] = by_category.get(cat, 0) + 1
        # "from care team today" = inbound rows in the last 24h.
        for r in msgs:
            ts = _aware(r.created_at)
            if (
                ts is not None
                and ts >= today_cutoff
                and r.sender_id != actor.actor_id
            ):
                from_care_team_today += 1
                break

    _patient_messages_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=patient.id,
        note=(
            f"threads={len(grouped)} unread={unread} urgent={urgent} "
            f"awaiting={awaiting_reply}"
        ),
        using_demo_data=is_demo,
    )

    return PatientMessagesSummaryResponse(
        total_threads=len(grouped),
        unread=unread,
        urgent=urgent,
        awaiting_reply=awaiting_reply,
        from_care_team_today=from_care_team_today,
        by_category=by_category,
        consent_active=_consent_active_pm(db, patient),
        is_demo=is_demo,
    )


def _related_report_id_for_thread(thread_id: str) -> Optional[str]:
    """Return the report_id encoded in a ``report-{id}`` thread, if any."""
    if not thread_id:
        return None
    if thread_id.startswith("report-"):
        return thread_id[len("report-") :]
    return None


@router.get("/threads/{thread_id}", response_model=PatientThreadDetailOut)
def get_thread(
    thread_id: str = Path(..., min_length=1, max_length=128),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientThreadDetailOut:
    """Return a thread's full message list. Auto-emits ``thread_opened``."""
    patient = _resolve_patient_for_actor_pm(db, actor)
    is_demo = _patient_is_demo_pm(db, patient)
    rows = _resolve_thread(db, patient, thread_id)

    summary = _thread_summary_from_messages(rows, actor_id=actor.actor_id)
    related_report_id: Optional[str] = None
    rid = _related_report_id_for_thread(thread_id)
    if rid:
        rec = (
            db.query(PatientMediaUpload)
            .filter_by(id=rid)
            .first()
        )
        if (
            rec is not None
            and rec.media_type == "text"
            and rec.patient_id == patient.id
            and rec.deleted_at is None
        ):
            related_report_id = rid

    _patient_messages_audit(
        db,
        actor,
        event="thread_opened",
        target_id=summary.get("thread_id") or thread_id,
        note=(
            f"messages={len(rows)} unread={summary.get('unread_count', 0)} "
            f"urgent={1 if summary.get('is_urgent') else 0}"
        ),
        using_demo_data=is_demo,
    )

    return PatientThreadDetailOut(
        thread=PatientThreadOut(**summary),
        messages=[
            PatientMessageOut(**_message_to_dict(r, actor_id=actor.actor_id))
            for r in rows
        ],
        is_demo=is_demo,
        consent_active=_consent_active_pm(db, patient),
        related_report_id=related_report_id,
    )


@router.post(
    "/threads", response_model=PatientThreadDetailOut, status_code=201
)
def create_thread(
    body: PatientThreadCreateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientThreadDetailOut:
    """Compose a new thread. The first Message row IS the thread starter
    (its ``id`` becomes the ``thread_id`` so subsequent replies group).
    """
    patient = _resolve_patient_for_actor_pm(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_pm(db, patient)
    category = _normalise_category(body.category)
    recipient = _resolve_recipient_for_new_thread(patient)

    msg_id = str(uuid.uuid4())
    msg = Message(
        id=msg_id,
        sender_id=actor.actor_id,
        recipient_id=recipient,
        patient_id=patient.id,
        body=body.body,
        subject=(body.subject or "").strip()[:255] or None,
        category=category,
        thread_id=msg_id,  # thread starter's id IS the thread_id
        priority=("urgent" if body.is_urgent else "normal"),
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    _patient_messages_audit(
        db,
        actor,
        event="message_sent",
        target_id=msg.thread_id or msg.id,
        note=(
            f"category={category}; recipient={recipient}; "
            f"chars={len(body.body)}; urgent={1 if body.is_urgent else 0}"
        ),
        using_demo_data=is_demo,
    )
    if body.is_urgent:
        _patient_messages_audit(
            db,
            actor,
            event="urgent_marked",
            target_id=msg.thread_id or msg.id,
            note=f"category={category}; on=create",
            using_demo_data=is_demo,
        )
        # Clinician-visible mirror so the care-team feed shows the urgent
        # flag without exposing the full message body.
        _patient_messages_audit(
            db,
            actor,
            event="urgent_flag_to_clinician",
            target_id=recipient,
            note=f"thread={msg.thread_id or msg.id}; category={category}",
            using_demo_data=is_demo,
            role_override="clinician",
            actor_override=recipient,
        )

    rows = [msg]
    summary = _thread_summary_from_messages(rows, actor_id=actor.actor_id)
    return PatientThreadDetailOut(
        thread=PatientThreadOut(**summary),
        messages=[
            PatientMessageOut(**_message_to_dict(msg, actor_id=actor.actor_id))
        ],
        is_demo=is_demo,
        consent_active=True,
    )


@router.post(
    "/threads/{thread_id}/messages",
    response_model=PatientThreadDetailOut,
    status_code=201,
)
def reply_to_thread(
    body: PatientThreadReplyIn,
    thread_id: str = Path(..., min_length=1, max_length=128),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientThreadDetailOut:
    """Append a reply to an existing thread."""
    patient = _resolve_patient_for_actor_pm(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_pm(db, patient)
    rows = _resolve_thread(db, patient, thread_id)

    first = rows[0]
    recipient = (
        first.sender_id
        if first.sender_id != actor.actor_id
        else (first.recipient_id or _resolve_recipient_for_new_thread(patient))
    )
    category = first.category or _DEFAULT_CATEGORY

    msg_id = str(uuid.uuid4())
    reply = Message(
        id=msg_id,
        sender_id=actor.actor_id,
        recipient_id=recipient,
        patient_id=patient.id,
        body=body.body,
        subject=first.subject,
        category=category,
        thread_id=thread_id,
        priority=("urgent" if body.is_urgent else "normal"),
        created_at=datetime.now(timezone.utc),
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)

    _patient_messages_audit(
        db,
        actor,
        event="message_sent",
        target_id=thread_id,
        note=(
            f"reply; category={category}; recipient={recipient}; "
            f"chars={len(body.body)}; urgent={1 if body.is_urgent else 0}"
        ),
        using_demo_data=is_demo,
    )
    if body.is_urgent:
        _patient_messages_audit(
            db,
            actor,
            event="urgent_marked",
            target_id=thread_id,
            note=f"category={category}; on=reply",
            using_demo_data=is_demo,
        )
        _patient_messages_audit(
            db,
            actor,
            event="urgent_flag_to_clinician",
            target_id=recipient,
            note=f"thread={thread_id}; category={category}",
            using_demo_data=is_demo,
            role_override="clinician",
            actor_override=recipient,
        )

    rows.append(reply)
    summary = _thread_summary_from_messages(rows, actor_id=actor.actor_id)
    return PatientThreadDetailOut(
        thread=PatientThreadOut(**summary),
        messages=[
            PatientMessageOut(**_message_to_dict(r, actor_id=actor.actor_id))
            for r in rows
        ],
        is_demo=is_demo,
        consent_active=True,
    )


@router.post(
    "/threads/{thread_id}/mark-urgent",
    response_model=PatientThreadActionOut,
)
def mark_thread_urgent(
    body: PatientThreadMarkUrgentIn,
    thread_id: str = Path(..., min_length=1, max_length=128),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientThreadActionOut:
    """Patient flags the entire thread as urgent.

    The flag is set on the most recent message row in the thread (so
    inbox queries that order by ``priority='urgent'`` surface it). A
    clinician-visible mirror audit row is emitted so the care-team
    feed reflects the urgency without re-reading every message body.
    """
    patient = _resolve_patient_for_actor_pm(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_pm(db, patient)
    rows = _resolve_thread(db, patient, thread_id)

    # Stamp urgent on every row in the thread. This is honest: the
    # whole thread is now urgent, not just the latest message.
    for r in rows:
        r.priority = "urgent"
    db.commit()

    recipient = rows[0].recipient_id or _resolve_recipient_for_new_thread(patient)
    note = (body.note or "").strip()[:200] if body.note else ""
    _patient_messages_audit(
        db,
        actor,
        event="urgent_marked",
        target_id=thread_id,
        note=(f"note={note}" if note else "manual flag"),
        using_demo_data=is_demo,
    )
    _patient_messages_audit(
        db,
        actor,
        event="urgent_flag_to_clinician",
        target_id=recipient,
        note=f"thread={thread_id}",
        using_demo_data=is_demo,
        role_override="clinician",
        actor_override=recipient,
    )
    now = datetime.now(timezone.utc)
    return PatientThreadActionOut(
        accepted=True,
        thread_id=thread_id,
        is_urgent=True,
        updated_at=now.isoformat(),
    )


@router.post(
    "/threads/{thread_id}/mark-resolved",
    response_model=PatientThreadActionOut,
)
def mark_thread_resolved(
    body: PatientThreadMarkResolvedIn,
    thread_id: str = Path(..., min_length=1, max_length=128),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientThreadActionOut:
    """Patient marks the thread resolved.

    We stamp ``priority='resolved'`` on the most recent row only —
    this clears any urgent flag in the inbox query while keeping the
    full history of urgent flags in the audit log.
    """
    patient = _resolve_patient_for_actor_pm(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_pm(db, patient)
    rows = _resolve_thread(db, patient, thread_id)

    last = rows[-1]
    last.priority = "resolved"
    db.commit()

    note = (body.note or "").strip()[:200] if body.note else ""
    _patient_messages_audit(
        db,
        actor,
        event="thread_resolved",
        target_id=thread_id,
        note=(f"note={note}" if note else "patient resolved"),
        using_demo_data=is_demo,
    )
    now = datetime.now(timezone.utc)
    return PatientThreadActionOut(
        accepted=True,
        thread_id=thread_id,
        is_resolved=True,
        is_urgent=False,
        updated_at=now.isoformat(),
    )


@router.post(
    "/threads/{thread_id}/messages/{message_id}/mark-read",
    response_model=PatientMessageReadOut,
)
def mark_message_read(
    thread_id: str = Path(..., min_length=1, max_length=128),
    message_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientMessageReadOut:
    """Patient marks a single inbound message as read.

    Only inbound rows can be marked read — patients don't mark their
    own outgoing messages read. The audit row records the actor + the
    target message id so a regulator can see exactly when each clinician
    message was opened.
    """
    patient = _resolve_patient_for_actor_pm(db, actor)
    is_demo = _patient_is_demo_pm(db, patient)
    rows = _resolve_thread(db, patient, thread_id)
    target = next((r for r in rows if r.id == message_id), None)
    if target is None:
        raise ApiServiceError(
            code="not_found",
            message="Message not found in this thread.",
            status_code=404,
        )
    if target.sender_id == actor.actor_id:
        raise ApiServiceError(
            code="cannot_mark_own_outgoing_read",
            message="Patients do not mark their own outgoing messages as read.",
            status_code=400,
        )

    if target.read_at is None:
        target.read_at = datetime.now(timezone.utc)
        db.commit()

    _patient_messages_audit(
        db,
        actor,
        event="message_read",
        target_id=message_id,
        note=f"thread={thread_id}",
        using_demo_data=is_demo,
    )
    return PatientMessageReadOut(
        accepted=True,
        thread_id=thread_id,
        message_id=message_id,
        read_at=(
            _aware(target.read_at).isoformat()
            if _aware(target.read_at) is not None
            else None
        ),
    )


@router.post(
    "/audit-events", response_model=PatientMessagesAuditEventOut
)
def post_patient_messages_audit_event(
    body: PatientMessagesAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientMessagesAuditEventOut:
    """Page-level audit ingestion for the patient Messages UI.

    Surface: ``patient_messages``. Common events: ``view`` (mount),
    ``filter_changed``, ``thread_opened``, ``message_read``,
    ``message_sent``, ``urgent_marked``, ``urgent_unmarked``,
    ``attachment_clicked``, ``clinician_reply_visible``,
    ``thread_resolved``, ``demo_banner_shown``,
    ``consent_banner_shown``, ``deep_link_followed``.

    Patient role only. Clinicians cannot emit ``patient_messages`` audit
    rows directly — keeps the surface attributable to patient-side
    actions. Cross-patient ingestion is blocked because ``thread_id``
    (when supplied) is verified to belong to the actor's patient.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="patient_role_required",
            message=(
                "Patient Messages audit ingestion is restricted to the "
                "patient role."
            ),
            status_code=403,
        )
    patient = _resolve_patient_for_actor_pm(db, actor)
    is_demo = _patient_is_demo_pm(db, patient)

    target_id: str = patient.id
    if body.thread_id:
        # Verify the thread belongs to this patient before we let the
        # event record name it as the target. We allow the thread to
        # not yet exist (e.g. an audit event posted on the way to
        # creating the thread) — but if a thread_id is supplied AND
        # exists somewhere, it must belong to this patient.
        any_msg = (
            db.query(Message)
            .filter(Message.thread_id == body.thread_id)
            .first()
        )
        if any_msg is not None and any_msg.patient_id != patient.id:
            raise ApiServiceError(
                code="not_found",
                message="Message thread not found.",
                status_code=404,
            )
        target_id = body.thread_id

    note_parts: list[str] = []
    if body.thread_id:
        note_parts.append(f"thread={body.thread_id}")
    if body.message_id:
        note_parts.append(f"message={body.message_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    event_id = _patient_messages_audit(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=bool(body.using_demo_data) or is_demo,
    )
    return PatientMessagesAuditEventOut(accepted=True, event_id=event_id)
