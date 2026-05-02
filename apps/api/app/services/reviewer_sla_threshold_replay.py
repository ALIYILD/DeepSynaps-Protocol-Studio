"""IRB-AMD4: Reviewer SLA Calibration Threshold What-If Replay (2026-05-02).

Companion to :mod:`reviewer_sla_threshold_recommender`. Lets an admin
ask "if I adopt floor X, what would have happened over the last
window_days?":

* Counts reviewers below the floor.
* Counts ``still_pending`` breaches owned by those reviewers (the
  pool that auto-reassign would target).
* For each ``still_pending`` breach, looks ahead in the SAME audit
  feed to see whether the breach EVENTUALLY paired with a decision
  inside the SLA response window. This is the "would have been
  helpful" simulation: if the breach was already going to be decided
  within ``sla_response_days``, an auto-reassign would have been
  unhelpful (and possibly harmful — disrupting an in-flight review).

Pure functions; no DB writes; no schema change. Read-only by design.
Strictly clinic-scoped.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import AuditEventRecord
from app.services.irb_reviewer_sla_outcome_pairing import (
    DECISION_ACTION_PREFIX,
    DECISION_TARGET_TYPE,
    DEFAULT_SLA_RESPONSE_DAYS,
    DEFAULT_WINDOW_DAYS,
    MIN_WINDOW_DAYS,
    MAX_WINDOW_DAYS,
    OUTCOME_DECIDED_WITHIN_SLA,
    OUTCOME_STILL_PENDING,
    ReviewerSLAOutcomeRecord,
    _coerce_utc,
    compute_reviewer_calibration,
    pair_breaches_with_decisions,
)


_log = logging.getLogger(__name__)


# ── Data shapes ────────────────────────────────────────────────────────────


@dataclass
class ReplayResult:
    """Replay envelope returned to the router."""

    override_threshold: float = 0.0
    reviewers_below_floor: int = 0
    projected_reassign_count: int = 0
    projected_breaches_avoided: int = 0
    simulated_helpful_rate_pct: float = 0.0
    sample_size_reviewers: int = 0
    sample_size_breaches: int = 0
    window_days: int = DEFAULT_WINDOW_DAYS
    sla_response_days: int = DEFAULT_SLA_RESPONSE_DAYS
    clinic_id: Optional[str] = None
    reviewers_below_floor_ids: list[str] = field(default_factory=list)


# ── Helpers ────────────────────────────────────────────────────────────────


def _normalize_window(value: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return DEFAULT_WINDOW_DAYS
    if v < MIN_WINDOW_DAYS:
        return MIN_WINDOW_DAYS
    if v > MAX_WINDOW_DAYS:
        return MAX_WINDOW_DAYS
    return v


def _was_decided_within_sla(
    db: Session,
    clinic_id: str,
    breach_record: ReviewerSLAOutcomeRecord,
    *,
    sla_response_days: int,
) -> bool:
    """Look ahead in the audit feed to see whether a ``still_pending``
    breach EVENTUALLY paired with a decision inside the SLA window.

    Used by the replay's "would have been helpful" simulation: if the
    breach was already going to resolve in time, an auto-reassign
    would have been UNHELPFUL.

    For records that are ALREADY decided, we trust the outcome the
    pairer assigned. For ``still_pending`` records, we re-query the
    audit table for any decision row by the same reviewer between
    ``breached_at`` and ``breached_at + sla_response_days``.
    """
    if breach_record.outcome == OUTCOME_DECIDED_WITHIN_SLA:
        return True
    if breach_record.outcome != OUTCOME_STILL_PENDING:
        return False

    # The breach pairer didn't find a same-reviewer decision after
    # breached_at within the window. For the replay we ALSO check
    # decisions by ANY reviewer on the same clinic within the SLA
    # window — because auto-reassign would have rerouted to another
    # reviewer, "helpful" really means "the amendment was decided
    # within the SLA window after the breach, by anyone".
    breached_at = breach_record.breached_at
    cutoff_iso_lo = breached_at.isoformat()
    cutoff_iso_hi = (
        breached_at + timedelta(days=sla_response_days)
    ).isoformat()
    cid_needle = f"clinic_id={clinic_id}"
    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == DECISION_TARGET_TYPE,
            AuditEventRecord.action.like(f"{DECISION_ACTION_PREFIX}%"),
            AuditEventRecord.created_at >= cutoff_iso_lo,
            AuditEventRecord.created_at < cutoff_iso_hi,
        )
        .limit(50)
        .all()
    )
    for r in rows:
        if cid_needle in (r.note or ""):
            return True
    return False


# ── Public API ─────────────────────────────────────────────────────────────


def replay_threshold(
    db: Session,
    clinic_id: Optional[str],
    *,
    override_threshold: float,
    window_days: int = DEFAULT_WINDOW_DAYS,
    sla_response_days: int = DEFAULT_SLA_RESPONSE_DAYS,
    now: Optional[datetime] = None,
) -> ReplayResult:
    """Replay an override calibration floor against the last
    ``window_days`` of audit data and return projections.

    Returns a ``ReplayResult`` even on empty input — empty rows just
    means projected_reassign_count=0 + helpful_rate_pct=0.
    """
    w = _normalize_window(window_days)
    out = ReplayResult(
        override_threshold=float(override_threshold),
        window_days=w,
        sla_response_days=int(sla_response_days),
        clinic_id=clinic_id,
    )

    if not clinic_id:
        return out

    records = pair_breaches_with_decisions(
        db,
        clinic_id,
        window_days=w,
        sla_response_days=sla_response_days,
        now=now,
    )
    out.sample_size_breaches = len(records)
    if not records:
        return out

    calibration = compute_reviewer_calibration(records)
    out.sample_size_reviewers = len(calibration)

    floor = float(override_threshold)
    bad_reviewers = {
        rid for rid, stats in calibration.items()
        if float(stats.get("calibration_score", 0.0)) < floor
    }
    out.reviewers_below_floor = len(bad_reviewers)
    out.reviewers_below_floor_ids = sorted(bad_reviewers)

    # The reassign target: still_pending breaches owned by bad
    # reviewers. Pending (still in grace) and decided_* rows are
    # excluded — auto-reassign would not fire on them.
    targets = [
        r for r in records
        if r.reviewer_user_id in bad_reviewers
        and r.outcome == OUTCOME_STILL_PENDING
    ]
    out.projected_reassign_count = len(targets)

    # "Would have been helpful" rate: how many of those targeted
    # still_pending breaches eventually resolved INSIDE the SLA
    # window post-breach? If the answer is high, auto-reassign would
    # have been UNHELPFUL — the amendment was already going to
    # decide in time. So we surface helpful_rate_pct = 100 - (rate
    # at which the breach decided in time without intervention).
    if not targets:
        out.simulated_helpful_rate_pct = 0.0
        return out

    decided_in_time = sum(
        1
        for r in targets
        if _was_decided_within_sla(
            db, clinic_id, r, sla_response_days=int(sla_response_days)
        )
    )
    helpful = len(targets) - decided_in_time
    out.simulated_helpful_rate_pct = round(
        100.0 * helpful / len(targets), 2
    )

    # The "breaches avoided" count assumes auto-reassign successfully
    # routes each helpful breach to an in-time reviewer. Surface it
    # so the UI can render a single "would have helped on N of M"
    # line.
    out.projected_breaches_avoided = helpful
    return out


__all__ = [
    "ReplayResult",
    "replay_threshold",
]
