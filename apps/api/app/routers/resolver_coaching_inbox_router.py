"""Resolver Coaching Inbox (DCRO2, 2026-05-02).

Private, read-only inbox view per resolver showing **their own** wrong
``false_positive`` calls — i.e., resolutions where the resolver said
"false_positive" but the DCA worker re-flagged the same caregiver
within 30 days.

Each row carries:

* the caregiver's subsequent ``concern_count`` between the resolution
  timestamp and the re-flag timestamp,
* the adapter list configured for the caregiver
  (``slack`` / ``twilio`` / ``sendgrid`` / ``pagerduty``),
* the resolver's free-text "Self-review notes" (if filed).

Goal: the resolver self-corrects without admin intervention. Mirrors
the Wearables Workbench → Clinician Inbox handoff (#353/#354).

Privacy gate
============

``my-coaching-inbox`` ALWAYS scopes to ``actor.actor_id`` only. Even
admins cannot view another resolver's coaching inbox — this is
intentional. Admins use the ``admin-overview`` endpoint instead, which
exposes per-resolver wrong-call **counts** (not row drill-in) so they
can see who needs coaching without violating individual privacy.

Cross-clinic safety
===================

Every endpoint scopes by ``actor.clinic_id``. Audit-row matching uses
the canonical ``clinic_id={cid}`` substring needle so a resolver in
clinic A never sees rows from clinic B.

Endpoints
=========

* ``GET /api/v1/resolver-coaching-inbox/my-coaching-inbox?window_days=90``
* ``POST /api/v1/resolver-coaching-inbox/self-review-note``
* ``GET /api/v1/resolver-coaching-inbox/audit-events?surface=resolver_coaching_inbox``
* ``GET /api/v1/resolver-coaching-inbox/admin-overview?window_days=90``

Source data
===========

* Wrong-FP rows are derived from
  :func:`app.services.resolution_outcome_pairing.pair_resolutions_with_outcomes`
  (added in DCRO1 / #393) — pure pairing of existing audit rows; no
  schema change.
* Subsequent ``concern_count`` is counted from
  ``caregiver_portal.delivery_concern_filed`` /
  ``clinician_inbox.caregiver_delivery_concern_to_clinician_mirror``
  audit rows for that caregiver between ``resolved_at`` and
  ``re_flagged_at``.
* Adapter list is read from
  :class:`app.persistence.models.CaregiverDigestPreference.preferred_channel`
  combined with the canonical clinic dispatch chain
  (``slack`` / ``twilio`` / ``sendgrid`` / ``pagerduty``).
* Self-review notes are stored as audit rows under
  ``target_type='resolver_coaching_inbox'`` with
  ``action='resolver_coaching_inbox.self_review_note_filed'`` —
  immutable, regulator-readable, no new schema.
"""
from __future__ import annotations

import logging
import statistics
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AuditEventRecord,
    CaregiverDigestPreference,
    User,
)
from app.services.resolution_outcome_pairing import (
    OUTCOME_REFLAGGED,
    OutcomeRecord,
    compute_resolver_calibration,
    pair_resolutions_with_outcomes,
)


router = APIRouter(
    prefix="/api/v1/resolver-coaching-inbox",
    tags=["Resolver Coaching Inbox"],
)
_log = logging.getLogger(__name__)


# Page-level surface (target_type) for self-rows + audit-events.
SURFACE = "resolver_coaching_inbox"

# Action emitted when a resolver files a self-review note against one of
# their own wrong-fp calls.
SELF_REVIEW_NOTE_ACTION = f"{SURFACE}.self_review_note_filed"

# The two source actions that count as "delivery concerns filed" against
# a caregiver. Mirrors :data:`SOURCE_ACTIONS` in the DCA worker.
CONCERN_FILED_ACTIONS = (
    "caregiver_portal.delivery_concern_filed",
    "clinician_inbox.caregiver_delivery_concern_to_clinician_mirror",
)

# Canonical adapter taxonomy — kept in sync with the on-call delivery
# stack. Surfaced here so the inbox cards render adapter chips even
# when no per-caregiver override row exists in CaregiverDigestPreference.
DEFAULT_ADAPTER_CHAIN: tuple[str, ...] = (
    "slack",
    "twilio",
    "sendgrid",
    "pagerduty",
)

MIN_WINDOW_DAYS = 1
MAX_WINDOW_DAYS = 365
DEFAULT_WINDOW_DAYS = 90

# Min resolutions before a resolver's calibration counts towards the
# bottom-quartile threshold. Single-call resolvers would otherwise
# always be either 0% or 100% and dominate the quartile boundary.
DEFAULT_MIN_RESOLUTIONS = 3

# Self-review note length bounds.
MIN_NOTE_LEN = 10
MAX_NOTE_LEN = 500


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    """Resolver coaching inbox is reachable by reviewer minimum.

    Reviewer is the lowest role that can resolve a delivery concern (see
    DCR1 router). A guest / patient / technician cannot have any
    wrong-fp calls and so cannot have a coaching inbox in the first
    place.
    """
    require_minimum_role(actor, "reviewer")


def _gate_admin(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    if actor.role in {"admin", "clinician", "reviewer"}:
        return actor.role
    return "reviewer"


def _normalize_window(window_days: int) -> int:
    if window_days is None:
        return DEFAULT_WINDOW_DAYS
    try:
        w = int(window_days)
    except Exception:
        return DEFAULT_WINDOW_DAYS
    if w < MIN_WINDOW_DAYS:
        return MIN_WINDOW_DAYS
    if w > MAX_WINDOW_DAYS:
        return MAX_WINDOW_DAYS
    return w


def _coerce_dt(iso: Optional[str]) -> Optional[datetime]:
    """SQLite roundtrips strip tzinfo; coerce to tz-aware UTC."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except Exception:  # pragma: no cover
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _emit_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
    role: Optional[str] = None,
) -> str:
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{SURFACE}-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(target_id) or actor.actor_id,
            target_type=SURFACE,
            action=f"{SURFACE}.{event}",
            role=role or _safe_audit_role(actor),
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("DCRO2 audit emit skipped")
    return eid


def _resolve_user_names(db: Session, user_ids: list[str]) -> dict[str, User]:
    if not user_ids:
        return {}
    return {
        u.id: u
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    }


def _pretty_name(user: Optional[User]) -> Optional[str]:
    if user is None:
        return None
    return (
        getattr(user, "display_name", None)
        or getattr(user, "email", None)
        or None
    )


def _count_subsequent_concerns(
    db: Session,
    *,
    caregiver_user_id: str,
    cid: str,
    resolved_at: datetime,
    re_flagged_at: datetime,
) -> int:
    """Count ``delivery_concern_filed`` rows for ``caregiver_user_id``
    in clinic ``cid`` whose ``created_at`` falls in
    ``(resolved_at, re_flagged_at]``.

    Uses both canonical source actions so the count stays correct
    regardless of which upstream emitter filed the concern row. Cross-
    clinic safety via the ``clinic_id={cid}`` substring needle.
    """
    if not caregiver_user_id or not cid:
        return 0
    if re_flagged_at <= resolved_at:
        return 0
    needle = f"clinic_id={cid}"
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action.in_(CONCERN_FILED_ACTIONS),
            AuditEventRecord.target_id == caregiver_user_id,
            AuditEventRecord.created_at >= resolved_at.isoformat(),
            AuditEventRecord.created_at <= re_flagged_at.isoformat(),
        )
        .all()
    )
    count = 0
    for r in rows:
        ts = _coerce_dt(r.created_at)
        if ts is None:
            continue
        if ts <= resolved_at or ts > re_flagged_at:
            continue
        # Cross-clinic guard. If the row carries no clinic_id needle
        # we conservatively SKIP it so a non-scoped concern never
        # leaks into another clinic's count.
        if needle not in (r.note or ""):
            continue
        count += 1
    return count


def _resolve_adapter_list(
    db: Session,
    *,
    caregiver_user_id: str,
) -> list[str]:
    """Return the adapter chain configured for ``caregiver_user_id``.

    Reads :class:`CaregiverDigestPreference.preferred_channel`. When
    set, the preferred adapter is rendered first and the remaining
    canonical adapters follow (deduped). When unset (NULL) we return
    the canonical default chain unchanged so the UI still renders
    something honest.
    """
    if not caregiver_user_id:
        return list(DEFAULT_ADAPTER_CHAIN)
    pref = (
        db.query(CaregiverDigestPreference)
        .filter(CaregiverDigestPreference.caregiver_user_id == caregiver_user_id)
        .first()
    )
    chain: list[str] = list(DEFAULT_ADAPTER_CHAIN)
    if pref is not None and pref.preferred_channel:
        p = str(pref.preferred_channel).strip().lower()
        if p:
            out: list[str] = [p]
            for a in chain:
                if a != p and a not in out:
                    out.append(a)
            return out
    return chain


def _find_self_review_note(
    db: Session,
    *,
    actor_id: str,
    resolved_audit_id: str,
) -> Optional[str]:
    """Return the most recent self-review note text filed by
    ``actor_id`` against ``resolved_audit_id``, or ``None`` if no note
    exists yet.

    Self-review notes are stored as audit rows with
    ``target_type='resolver_coaching_inbox'``,
    ``action='resolver_coaching_inbox.self_review_note_filed'`` and
    ``target_id == resolved_audit_id``. The note text is in the
    ``note`` column under ``self_review_note=...``.
    """
    if not actor_id or not resolved_audit_id:
        return None
    row = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == SELF_REVIEW_NOTE_ACTION,
            AuditEventRecord.target_id == resolved_audit_id,
            AuditEventRecord.actor_id == actor_id,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .first()
    )
    if row is None:
        return None
    note = row.note or ""
    # Pull self_review_note=... out of the canonical key=value note.
    for raw in note.split(";"):
        part = raw.strip()
        if not part.startswith("self_review_note="):
            continue
        _, _, val = part.partition("=")
        return val.strip() or None
    # Fallback: if for some reason the note is unstructured, return
    # everything up to 500 chars — better than swallowing a real review.
    return note[:MAX_NOTE_LEN] if note else None


def _filter_wrong_fp_for_resolver(
    records: list[OutcomeRecord], resolver_user_id: str
) -> list[OutcomeRecord]:
    """Wrong-fp = resolver_user_id matches AND resolution_reason is
    'false_positive' AND outcome is re_flagged_within_30d."""
    out: list[OutcomeRecord] = []
    for rec in records:
        if rec.resolver_user_id != resolver_user_id:
            continue
        if rec.resolution_reason != "false_positive":
            continue
        if rec.outcome != OUTCOME_REFLAGGED:
            continue
        out.append(rec)
    return out


def _bottom_quartile_resolvers(
    records: list[OutcomeRecord],
    *,
    min_resolutions: int = DEFAULT_MIN_RESOLUTIONS,
) -> set[str]:
    """Compute the set of resolver_user_ids whose calibration_accuracy
    is at or below the 25th percentile of clinic resolvers with at
    least ``min_resolutions`` total resolutions.

    Returns an empty set when fewer than 4 eligible resolvers exist —
    quartiles are not meaningful below that count.
    """
    cals = compute_resolver_calibration(records)
    eligible = [c for c in cals.values() if c.total_resolutions >= min_resolutions]
    if len(eligible) < 4:
        return set()
    accuracies = sorted(c.calibration_accuracy_pct for c in eligible)
    # 25th percentile via linear interpolation (statistics.quantiles).
    try:
        q1 = statistics.quantiles(accuracies, n=4, method="inclusive")[0]
    except statistics.StatisticsError:  # pragma: no cover
        return set()
    return {
        c.resolver_user_id
        for c in eligible
        if c.calibration_accuracy_pct <= q1
    }


# ── Schemas ─────────────────────────────────────────────────────────────────


class WrongFpCallOut(BaseModel):
    resolved_audit_id: str
    caregiver_user_id: str
    caregiver_name: Optional[str] = None
    resolved_at: str
    re_flagged_at: str
    days_to_re_flag: int
    subsequent_concern_count: int
    adapter_list: list[str] = Field(default_factory=list)
    self_review_note: Optional[str] = None


class CoachingInboxSummaryOut(BaseModel):
    total_wrong_calls: int = 0
    median_days_to_re_flag: Optional[float] = None


class MyCoachingInboxOut(BaseModel):
    resolver_user_id: str
    resolver_name: Optional[str] = None
    calibration_accuracy_pct: float = 100.0
    in_bottom_quartile: bool = False
    wrong_false_positive_calls: list[WrongFpCallOut] = Field(default_factory=list)
    summary: CoachingInboxSummaryOut = Field(default_factory=CoachingInboxSummaryOut)
    window_days: int = DEFAULT_WINDOW_DAYS
    clinic_id: Optional[str] = None


class SelfReviewNoteIn(BaseModel):
    resolved_audit_id: str = Field(..., min_length=1, max_length=256)
    self_review_note: str = Field(..., min_length=MIN_NOTE_LEN, max_length=MAX_NOTE_LEN)


class SelfReviewNoteOut(BaseModel):
    accepted: bool
    event_id: str
    resolved_audit_id: str


class AuditEventOut(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: str
    actor_id: str
    note: str
    created_at: str


class AuditEventsListOut(BaseModel):
    items: list[AuditEventOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    surface: str


class ResolverOverviewRowOut(BaseModel):
    resolver_user_id: str
    resolver_name: Optional[str] = None
    total_resolutions: int = 0
    false_positive_calls: int = 0
    wrong_false_positive_calls: int = 0
    calibration_accuracy_pct: float = 100.0
    in_bottom_quartile: bool = False


class AdminOverviewOut(BaseModel):
    items: list[ResolverOverviewRowOut] = Field(default_factory=list)
    window_days: int = DEFAULT_WINDOW_DAYS
    min_resolutions: int = DEFAULT_MIN_RESOLUTIONS
    clinic_id: Optional[str] = None


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/my-coaching-inbox", response_model=MyCoachingInboxOut)
def my_coaching_inbox(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> MyCoachingInboxOut:
    """Return ONLY the calling user's own wrong-fp calls.

    Privacy gate: an admin cannot pass ``?resolver_user_id=...`` to read
    another resolver's inbox; this endpoint is hard-scoped to
    ``actor.actor_id``. Admins use ``/admin-overview`` instead.
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)

    if not cid:
        return MyCoachingInboxOut(
            resolver_user_id=actor.actor_id,
            resolver_name=None,
            calibration_accuracy_pct=100.0,
            in_bottom_quartile=False,
            wrong_false_positive_calls=[],
            summary=CoachingInboxSummaryOut(),
            window_days=w,
            clinic_id=None,
        )

    records = pair_resolutions_with_outcomes(db, cid, window_days=w)
    my_wrong = _filter_wrong_fp_for_resolver(records, actor.actor_id)

    # Calibration accuracy across THE CALLER's resolutions in the window.
    cals = compute_resolver_calibration(records)
    my_cal = cals.get(actor.actor_id)
    accuracy = my_cal.calibration_accuracy_pct if my_cal is not None else 100.0

    bq = _bottom_quartile_resolvers(records, min_resolutions=DEFAULT_MIN_RESOLUTIONS)
    in_bq = actor.actor_id in bq

    # Resolve caregiver display names + adapter lists in batch.
    cg_ids = sorted({rec.caregiver_user_id for rec in my_wrong})
    cg_user_map = _resolve_user_names(db, cg_ids)
    user_self = _resolve_user_names(db, [actor.actor_id]).get(actor.actor_id)

    # Look up next flag row per (caregiver, resolved_at) to expose
    # re_flagged_at + count subsequent concerns. We re-issue a small per-
    # caregiver query rather than re-walking the whole pairing service to
    # keep the surface area minimal.
    out_rows: list[WrongFpCallOut] = []
    deltas: list[float] = []
    for rec in my_wrong:
        # Find the FIRST flag strictly after this resolution for the caregiver.
        flag_rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.action == "caregiver_portal.delivery_concern_threshold_reached",
                AuditEventRecord.target_id == rec.caregiver_user_id,
                AuditEventRecord.created_at > rec.resolved_at.isoformat(),
            )
            .order_by(AuditEventRecord.created_at.asc())
            .all()
        )
        needle = f"clinic_id={cid}"
        next_flag = None
        for fr in flag_rows:
            if needle not in (fr.note or ""):
                continue
            f_dt = _coerce_dt(fr.created_at)
            if f_dt is None:
                continue
            if f_dt > rec.resolved_at:
                next_flag = (fr, f_dt)
                break
        if next_flag is None:
            # Should not happen for an OUTCOME_REFLAGGED record, but
            # defend in depth.
            continue
        flag_row, re_flagged_at = next_flag
        days_int = max(0, int(round((re_flagged_at - rec.resolved_at).total_seconds() / 86400.0)))
        if rec.days_to_re_flag is not None:
            deltas.append(float(rec.days_to_re_flag))
        sub_count = _count_subsequent_concerns(
            db,
            caregiver_user_id=rec.caregiver_user_id,
            cid=cid,
            resolved_at=rec.resolved_at,
            re_flagged_at=re_flagged_at,
        )
        adapters = _resolve_adapter_list(
            db, caregiver_user_id=rec.caregiver_user_id
        )
        srn = _find_self_review_note(
            db,
            actor_id=actor.actor_id,
            resolved_audit_id=rec.resolved_audit_id,
        )
        out_rows.append(
            WrongFpCallOut(
                resolved_audit_id=rec.resolved_audit_id,
                caregiver_user_id=rec.caregiver_user_id,
                caregiver_name=_pretty_name(cg_user_map.get(rec.caregiver_user_id)),
                resolved_at=rec.resolved_at.isoformat(),
                re_flagged_at=re_flagged_at.isoformat(),
                days_to_re_flag=days_int,
                subsequent_concern_count=sub_count,
                adapter_list=adapters,
                self_review_note=srn,
            )
        )

    median_days = round(statistics.median(deltas), 2) if deltas else None
    summary = CoachingInboxSummaryOut(
        total_wrong_calls=len(out_rows),
        median_days_to_re_flag=median_days,
    )

    # Best-effort page-view audit so admins can see who looked at the
    # coaching inbox (transparency for the resolver-led self-correction
    # pattern).
    _emit_audit(
        db,
        actor,
        event="view",
        target_id=actor.actor_id,
        note=(
            f"clinic_id={cid}; window_days={w}; "
            f"wrong_calls={len(out_rows)}; "
            f"in_bottom_quartile={'yes' if in_bq else 'no'}"
        ),
    )

    return MyCoachingInboxOut(
        resolver_user_id=actor.actor_id,
        resolver_name=_pretty_name(user_self),
        calibration_accuracy_pct=round(accuracy, 2),
        in_bottom_quartile=in_bq,
        wrong_false_positive_calls=out_rows,
        summary=summary,
        window_days=w,
        clinic_id=cid,
    )


@router.post("/self-review-note", response_model=SelfReviewNoteOut)
def file_self_review_note(
    body: SelfReviewNoteIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SelfReviewNoteOut:
    """Resolver files a self-review note against ONE of THEIR OWN
    wrong-fp calls.

    Cross-actor 403: a resolver cannot file a note against another
    resolver's resolution row. The check anchors on the resolved-row's
    ``resolver_user_id`` (parsed from the note) — NOT the audit row's
    ``actor_id`` (which can drift if a resolver leaves the clinic).
    """
    _gate_read(actor)
    cid = _scope_clinic(actor)
    if not cid:
        raise ApiServiceError(
            code="not_found",
            message="Resolution row not found.",
            status_code=404,
        )

    # Look up the resolved audit row.
    row = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.event_id == body.resolved_audit_id,
            AuditEventRecord.action == "caregiver_portal.delivery_concern_resolved",
        )
        .first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found",
            message="Resolution row not found.",
            status_code=404,
        )

    note_kv: dict[str, str] = {}
    for raw in (row.note or "").split(";"):
        part = raw.strip()
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        note_kv[k.strip()] = v.strip()

    row_clinic = note_kv.get("clinic_id") or ""
    row_resolver = note_kv.get("resolver_user_id") or row.actor_id or ""

    # Cross-clinic 404 (canonical hide-existence pattern).
    if row_clinic and row_clinic != cid:
        raise ApiServiceError(
            code="not_found",
            message="Resolution row not found.",
            status_code=404,
        )

    # Cross-resolver 403 — actor must be the resolver who made the call.
    if row_resolver != actor.actor_id:
        raise ApiServiceError(
            code="forbidden",
            message="You can only file self-review notes against your own resolutions.",
            status_code=403,
        )

    # The resolution must be a wrong-fp call to be eligible for a self-
    # review note. We re-pair via the outcome service so we don't double
    # the outcome-classification logic.
    records = pair_resolutions_with_outcomes(db, cid, window_days=MAX_WINDOW_DAYS)
    is_wrong_fp = any(
        rec.resolved_audit_id == body.resolved_audit_id
        and rec.resolver_user_id == actor.actor_id
        and rec.resolution_reason == "false_positive"
        and rec.outcome == OUTCOME_REFLAGGED
        for rec in records
    )
    if not is_wrong_fp:
        raise ApiServiceError(
            code="not_found",
            message="Resolution row is not a wrong false_positive call.",
            status_code=404,
        )

    # Sanitise the note for the canonical key=value audit format.
    clean_note = body.self_review_note.strip()
    if not (MIN_NOTE_LEN <= len(clean_note) <= MAX_NOTE_LEN):
        raise ApiServiceError(
            code="invalid_input",
            message=(
                f"Self-review note must be between {MIN_NOTE_LEN} and "
                f"{MAX_NOTE_LEN} characters."
            ),
            status_code=422,
        )
    # Strip semicolons so a hostile note cannot inject extra k=v pairs
    # into the audit row.
    safe_text = clean_note.replace(";", ",")[:MAX_NOTE_LEN]

    eid = _emit_audit(
        db,
        actor,
        event="self_review_note_filed",
        target_id=body.resolved_audit_id,
        note=(
            f"clinic_id={cid}; "
            f"resolver_user_id={actor.actor_id}; "
            f"resolved_audit_id={body.resolved_audit_id}; "
            f"self_review_note={safe_text}"
        ),
    )

    return SelfReviewNoteOut(
        accepted=True,
        event_id=eid,
        resolved_audit_id=body.resolved_audit_id,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Paginated audit-event list for the caller's own coaching rows.

    Self-review notes are private resolver-led coaching artifacts. Even
    admins do not use this endpoint to inspect another resolver's notes;
    they use ``/admin-overview`` for aggregate counts only.
    """
    _gate_read(actor)

    s = (surface or SURFACE).strip().lower()
    if s != SURFACE:
        s = SURFACE

    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.target_type == s,
        AuditEventRecord.actor_id == actor.actor_id,
    )

    total = base.count()
    rows = (
        base.order_by(AuditEventRecord.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        AuditEventOut(
            event_id=r.event_id,
            target_id=r.target_id or "",
            target_type=r.target_type or "",
            action=r.action or "",
            role=r.role or "",
            actor_id=r.actor_id or "",
            note=r.note or "",
            created_at=r.created_at or "",
        )
        for r in rows
    ]
    return AuditEventsListOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        surface=s,
    )


@router.get("/admin-overview", response_model=AdminOverviewOut)
def admin_overview(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS),
    min_resolutions: int = Query(default=DEFAULT_MIN_RESOLUTIONS, ge=1, le=1000),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdminOverviewOut:
    """Admin-only: list all resolvers in the clinic with calibration
    accuracy and wrong-call counts. NO drill-in into individual
    coaching rows — that surface is private to each resolver."""
    _gate_admin(actor)
    cid = _scope_clinic(actor)
    w = _normalize_window(window_days)
    mr = max(1, int(min_resolutions or 1))

    if not cid:
        return AdminOverviewOut(
            items=[],
            window_days=w,
            min_resolutions=mr,
            clinic_id=None,
        )

    records = pair_resolutions_with_outcomes(db, cid, window_days=w)
    cals = compute_resolver_calibration(records)
    bq = _bottom_quartile_resolvers(records, min_resolutions=mr)

    eligible = [c for c in cals.values() if c.total_resolutions >= mr]
    user_map = _resolve_user_names(db, [c.resolver_user_id for c in eligible])

    # Most-resolutions-first; lowest accuracy first as tiebreaker so the
    # admin sees the noisiest resolver up top.
    eligible.sort(
        key=lambda c: (
            -c.total_resolutions,
            c.calibration_accuracy_pct,
            c.resolver_user_id,
        )
    )

    items = [
        ResolverOverviewRowOut(
            resolver_user_id=c.resolver_user_id,
            resolver_name=_pretty_name(user_map.get(c.resolver_user_id)),
            total_resolutions=c.total_resolutions,
            false_positive_calls=c.false_positive_calls,
            wrong_false_positive_calls=c.false_positive_re_flagged_within_30d,
            calibration_accuracy_pct=c.calibration_accuracy_pct,
            in_bottom_quartile=c.resolver_user_id in bq,
        )
        for c in eligible
    ]

    return AdminOverviewOut(
        items=items,
        window_days=w,
        min_resolutions=mr,
        clinic_id=cid,
    )
