"""IRB-AMD2: Reviewer Workload Balancer with SLA Enforcement (2026-05-02).

The IRB-AMD1 workflow (#446) shipped a regulator-credible amendment
lifecycle (draft → submitted → reviewer_assigned → under_review →
approved/rejected/revisions_requested → effective) but no SLA
enforcement. Reviewers can sit on submitted amendments indefinitely
without anyone being notified.

This module computes per-reviewer queue snapshots and surfaces the
candidates that should be auto-assigned next (lowest pending count).
The companion worker
:mod:`app.workers.irb_reviewer_sla_worker` consumes
:func:`compute_reviewer_workload` and emits a HIGH-priority audit
row when a reviewer's queue exceeds N pending amendments for >M
days (defaults: 5 / 7 days). The HIGH-priority token routes the row
into the existing Clinician Inbox aggregator (#354).

Functions
---------

* :func:`compute_reviewer_workload` — list of per-reviewer workloads
  for a clinic, sorted by ``sla_breach desc`` then
  ``oldest_pending_age_days desc``.
* :func:`find_unassigned_amendments` — list of ``submitted`` amendments
  with no reviewer attached.
* :func:`suggest_reviewer_for_amendment` — returns the clinician with
  the lowest ``total_pending`` for an admin's auto-assign click.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import (
    AuditEventRecord,
    IRBProtocol,
    IRBProtocolAmendment,
    User,
)


_log = logging.getLogger(__name__)


# Default SLA thresholds — overridable via env in the worker.
DEFAULT_SLA_QUEUE_THRESHOLD = 5
DEFAULT_SLA_AGE_THRESHOLD_DAYS = 7

# Statuses that count as "pending" on a reviewer's plate.
PENDING_STATUSES: frozenset[str] = frozenset(
    {"reviewer_assigned", "under_review"}
)


SURFACE = "irb_amendment_reviewer_workload"


# ── Data shapes ────────────────────────────────────────────────────────────


@dataclass
class UnassignedAmendment:
    """Submitted amendment awaiting an admin's reviewer assignment."""

    id: str
    protocol_id: str
    title: Optional[str] = None
    submitted_at: Optional[str] = None
    submission_age_days: int = 0
    submitted_by: Optional[str] = None


@dataclass
class ReviewerWorkload:
    """Per-reviewer queue snapshot."""

    reviewer_user_id: str
    display_name: Optional[str] = None
    role: Optional[str] = None
    pending_assigned: int = 0
    pending_under_review: int = 0
    total_pending: int = 0
    oldest_pending_age_days: int = 0
    mean_pending_age_days: float = 0.0
    last_decision_at: Optional[str] = None
    sla_breach: bool = False
    sla_warn: bool = False
    pending_amendment_ids: list[str] = field(default_factory=list)


# ── Helpers ────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite roundtrips strip tzinfo; coerce naive datetimes to UTC.

    Mirrors the pattern in the ``deepsynaps-sqlite-tz-naive`` memory.
    """
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            parsed = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _isofmt(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    coerced = _coerce_utc(dt)
    return coerced.isoformat() if coerced else None


def _age_days(submitted_at: Optional[datetime], now: datetime) -> int:
    coerced = _coerce_utc(submitted_at)
    if coerced is None:
        return 0
    delta = now - coerced
    return max(0, int(delta.total_seconds() // 86400))


def _visible_protocol_ids(db: Session, clinic_id: Optional[str]) -> list[str]:
    """Return the protocol ids visible to the given clinic.

    Mirrors the IRBProtocol clinic-scoping convention used in
    :mod:`app.routers.irb_amendment_workflow_router`. When
    ``clinic_id`` is None the caller is expected to pass an
    actor.clinic_id explicitly — passing None here returns
    NULL-clinic protocols only (orphans).
    """
    q = db.query(IRBProtocol.id)
    if clinic_id:
        q = q.filter(IRBProtocol.clinic_id == clinic_id)
    else:
        q = q.filter(IRBProtocol.clinic_id.is_(None))
    return [r[0] for r in q.all()]


def _last_decision_for_reviewer(
    db: Session, reviewer_user_id: str
) -> Optional[str]:
    """Return the ISO timestamp of the most recent
    ``irb.amendment_decided_*`` audit row authored by this reviewer.

    Reads ``audit_event_records`` directly so the call site doesn't
    need a second table.
    """
    row = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == "irb_amendment",
            AuditEventRecord.action.like("irb.amendment_decided%"),
            AuditEventRecord.actor_id == reviewer_user_id,
        )
        .order_by(AuditEventRecord.created_at.desc())
        .first()
    )
    if row is None:
        return None
    return row.created_at or None


# ── Public API ─────────────────────────────────────────────────────────────


def compute_reviewer_workload(
    db: Session,
    clinic_id: Optional[str],
    *,
    sla_queue_threshold: int = DEFAULT_SLA_QUEUE_THRESHOLD,
    sla_age_threshold_days: int = DEFAULT_SLA_AGE_THRESHOLD_DAYS,
) -> list[ReviewerWorkload]:
    """Compute the per-reviewer queue snapshot for ``clinic_id``.

    For each user in the clinic who has ``assigned_reviewer_user_id``
    set on at least one non-terminal amendment (status in
    ``PENDING_STATUSES``):

    * ``pending_assigned`` — count where status=reviewer_assigned
    * ``pending_under_review`` — count where status=under_review
    * ``total_pending`` — sum of the two
    * ``oldest_pending_age_days`` — max(now - submitted_at) across
      pending amendments
    * ``mean_pending_age_days`` — mean(now - submitted_at) across
      pending amendments (rounded to 1 decimal)
    * ``last_decision_at`` — most recent ``irb.amendment_decided_*``
      audit row's ``created_at``
    * ``sla_breach`` — True when total_pending >= queue_threshold AND
      oldest_pending_age_days >= age_threshold
    * ``sla_warn`` — True when total_pending >= 80% of queue_threshold
      OR oldest_pending_age_days >= 80% of age_threshold (but not
      already in breach)

    Reviewers with NO pending amendments are excluded from the
    returned list (no row to render). The list is sorted by
    ``sla_breach desc`` then ``oldest_pending_age_days desc``.
    """
    visible_proto_ids = _visible_protocol_ids(db, clinic_id)
    if not visible_proto_ids:
        return []

    pending_amds = (
        db.query(IRBProtocolAmendment)
        .filter(
            IRBProtocolAmendment.protocol_id.in_(visible_proto_ids),
            IRBProtocolAmendment.assigned_reviewer_user_id.isnot(None),
            IRBProtocolAmendment.status.in_(list(PENDING_STATUSES)),
        )
        .all()
    )
    if not pending_amds:
        return []

    now = _now()
    # Group amendments by reviewer.
    by_reviewer: dict[str, list[IRBProtocolAmendment]] = {}
    for amd in pending_amds:
        rid = (amd.assigned_reviewer_user_id or "").strip()
        if not rid:
            continue
        by_reviewer.setdefault(rid, []).append(amd)

    # Resolve user metadata in one round-trip.
    user_rows = (
        db.query(User)
        .filter(User.id.in_(list(by_reviewer.keys())))
        .all()
    )
    user_by_id: dict[str, User] = {u.id: u for u in user_rows}

    # 80% warn thresholds — only meaningful when not already in breach.
    warn_queue_threshold = max(1, int(sla_queue_threshold * 0.8))
    warn_age_threshold = max(1, int(sla_age_threshold_days * 0.8))

    out: list[ReviewerWorkload] = []
    for rid, amds in by_reviewer.items():
        assigned = sum(1 for a in amds if a.status == "reviewer_assigned")
        under_review = sum(1 for a in amds if a.status == "under_review")
        total = assigned + under_review

        ages = [_age_days(a.submitted_at, now) for a in amds]
        oldest = max(ages) if ages else 0
        mean = round(sum(ages) / len(ages), 1) if ages else 0.0

        breach = bool(
            total >= sla_queue_threshold
            and oldest >= sla_age_threshold_days
        )
        warn = (
            (not breach)
            and (
                total >= warn_queue_threshold
                or oldest >= warn_age_threshold
            )
        )

        u = user_by_id.get(rid)
        out.append(
            ReviewerWorkload(
                reviewer_user_id=rid,
                display_name=getattr(u, "display_name", None) if u else None,
                role=getattr(u, "role", None) if u else None,
                pending_assigned=int(assigned),
                pending_under_review=int(under_review),
                total_pending=int(total),
                oldest_pending_age_days=int(oldest),
                mean_pending_age_days=float(mean),
                last_decision_at=_last_decision_for_reviewer(db, rid),
                sla_breach=breach,
                sla_warn=warn,
                pending_amendment_ids=[a.id for a in amds],
            )
        )

    out.sort(
        key=lambda w: (
            0 if w.sla_breach else 1,
            -w.oldest_pending_age_days,
        )
    )
    return out


def find_unassigned_amendments(
    db: Session,
    clinic_id: Optional[str],
    *,
    limit: int = 200,
) -> list[UnassignedAmendment]:
    """List of ``submitted`` amendments with no reviewer attached.

    Returns submission age in days so the admin frontend can render
    "X days waiting" without a second round-trip.
    """
    visible_proto_ids = _visible_protocol_ids(db, clinic_id)
    if not visible_proto_ids:
        return []

    rows = (
        db.query(IRBProtocolAmendment)
        .filter(
            IRBProtocolAmendment.protocol_id.in_(visible_proto_ids),
            IRBProtocolAmendment.status == "submitted",
            IRBProtocolAmendment.assigned_reviewer_user_id.is_(None),
        )
        .order_by(IRBProtocolAmendment.submitted_at.asc())
        .limit(limit)
        .all()
    )
    now = _now()
    return [
        UnassignedAmendment(
            id=r.id,
            protocol_id=r.protocol_id,
            title=(r.description or "")[:200] or None,
            submitted_at=_isofmt(r.submitted_at),
            submission_age_days=_age_days(r.submitted_at, now),
            submitted_by=r.submitted_by,
        )
        for r in rows
    ]


def suggest_reviewer_for_amendment(
    db: Session,
    clinic_id: Optional[str],
    amendment_id: str,
    *,
    sla_queue_threshold: int = DEFAULT_SLA_QUEUE_THRESHOLD,
    sla_age_threshold_days: int = DEFAULT_SLA_AGE_THRESHOLD_DAYS,
) -> Optional[str]:
    """Return the clinician with the LOWEST ``total_pending`` in the
    clinic. Admins are excluded from the candidate pool — they're
    routers, not reviewers.

    Returns ``None`` when no candidate exists (e.g. the clinic has
    no clinicians, or the amendment id is not in the clinic's
    visible set).
    """
    # Validate amendment visibility under the clinic gate.
    visible_proto_ids = _visible_protocol_ids(db, clinic_id)
    if not visible_proto_ids:
        return None
    amd = (
        db.query(IRBProtocolAmendment)
        .filter(
            IRBProtocolAmendment.id == amendment_id,
            IRBProtocolAmendment.protocol_id.in_(visible_proto_ids),
        )
        .first()
    )
    if amd is None:
        return None

    # Pool of candidate reviewers = clinicians (and reviewers) in the
    # clinic. Admins excluded.
    candidates_q = db.query(User).filter(
        User.role.in_(["clinician", "reviewer"]),
    )
    if clinic_id:
        candidates_q = candidates_q.filter(User.clinic_id == clinic_id)
    else:
        candidates_q = candidates_q.filter(User.clinic_id.is_(None))
    candidates = candidates_q.all()
    if not candidates:
        return None

    # Compute per-candidate pending count. Reviewers with no pending
    # amendments are still candidates (count=0); they get picked first.
    workload = compute_reviewer_workload(
        db,
        clinic_id,
        sla_queue_threshold=sla_queue_threshold,
        sla_age_threshold_days=sla_age_threshold_days,
    )
    pending_by_id = {w.reviewer_user_id: w.total_pending for w in workload}

    # Don't auto-assign back to the amendment's submitter.
    submitter = (amd.submitted_by or "").strip() or None

    best_uid: Optional[str] = None
    best_count = 10**9
    for u in sorted(candidates, key=lambda x: x.id or ""):
        if submitter and u.id == submitter:
            continue
        count = int(pending_by_id.get(u.id, 0))
        if count < best_count:
            best_count = count
            best_uid = u.id
    return best_uid


__all__ = [
    "DEFAULT_SLA_QUEUE_THRESHOLD",
    "DEFAULT_SLA_AGE_THRESHOLD_DAYS",
    "PENDING_STATUSES",
    "SURFACE",
    "ReviewerWorkload",
    "UnassignedAmendment",
    "compute_reviewer_workload",
    "find_unassigned_amendments",
    "suggest_reviewer_for_amendment",
]
