"""IRB-AMD3: Reviewer SLA Outcome Pairing service (2026-05-02).

Pairs each ``irb_reviewer_sla.queue_breach_detected`` audit row at time
T (emitted by the IRB-AMD2 SLA worker) with the SAME reviewer's NEXT
``irb.amendment_decided_*`` audit row whose ``created_at > T``. This
closes the loop on whether the SLA-breach signal actually nudged
behavior — i.e., did the reviewer act on a queued amendment within the
SLA response window after their queue breach was flagged?

Outcome classification
======================

For a breach at time T, with response-window ``sla_response_days``
(default 14):

* ``decided_within_sla`` — next decision exists AND
  ``(next.created_at - T) <= sla_response_days``
* ``decided_late`` — next decision exists AND
  ``(next.created_at - T) > sla_response_days``
* ``still_pending`` — no next decision AND ``now() - T >= sla_response_days``
  (the response window has fully elapsed without action)
* ``pending`` — no next decision AND ``now() - T < sla_response_days``
  (still within grace; insufficient data to classify yet)

Calibration score
=================

Per reviewer::

    calibration_score = (decided_within_sla - still_pending)
                        / max(total - pending, 1)

``pending`` rows are excluded from the denominator because they
haven't had a fair chance to resolve yet; including them would bias
the score downward for fresh breaches. ``still_pending`` (window
elapsed without action) IS included, because that's a real failure
signal.

Mirrors the CSAHP5 Advisor Outcome Pairing pattern (#434) but on a
different signal axis (reviewer behavior vs metric improvement).

Pure functions; no DB writes; no schema change. Read-only by design.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import AuditEventRecord


_log = logging.getLogger(__name__)


# Canonical actions emitted by the surrounding IRB-AMD1 + IRB-AMD2
# rails. The decision audit rows from the IRB-AMD1 service use the
# action prefix ``irb.amendment_decided_*`` (one per decision verb:
# approved / rejected / revisions_requested). We match all of them
# with a LIKE-prefix.
BREACH_ACTION = "irb_reviewer_sla.queue_breach_detected"
BREACH_TARGET_TYPE = "irb_reviewer"
DECISION_ACTION_PREFIX = "irb.amendment_decided"
DECISION_TARGET_TYPE = "irb_amendment"


# Page-level surface for the IRB-AMD3 outcome tracker (target_type for
# self-rows + ingestion + audit-events feed).
SURFACE = "irb_amendment_reviewer_workload_outcome_tracker"


# Defaults — pinned so tests, the router, and the UI disclaimer all
# reference the same numbers.
DEFAULT_WINDOW_DAYS = 180
MIN_WINDOW_DAYS = 7
MAX_WINDOW_DAYS = 365
DEFAULT_SLA_RESPONSE_DAYS = 14
MIN_SLA_RESPONSE_DAYS = 1
MAX_SLA_RESPONSE_DAYS = 90


# Outcome label constants.
OUTCOME_DECIDED_WITHIN_SLA = "decided_within_sla"
OUTCOME_DECIDED_LATE = "decided_late"
OUTCOME_STILL_PENDING = "still_pending"
OUTCOME_PENDING = "pending"


# ── Data shapes ────────────────────────────────────────────────────────────


@dataclass
class ReviewerSLAOutcomeRecord:
    """One paired (breach → next decision) record."""

    breach_audit_id: str
    reviewer_user_id: str
    breached_at: datetime
    pending_count: int
    oldest_age_days: int
    decided_audit_id: Optional[str]
    decided_at: Optional[datetime]
    days_to_next_decision: Optional[float]
    outcome: str
    clinic_id: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(dt: Optional[datetime | str]) -> Optional[datetime]:
    """Mirror of the IRB-AMD2 SQLite tz-coercion helper.

    ``deepsynaps-sqlite-tz-naive`` memory: SQLite strips tzinfo on
    roundtrip; coerce to tz-aware UTC before comparing against
    ``datetime.now(timezone.utc)``.
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


def _parse_kv(note: str, key: str) -> Optional[str]:
    """Parse ``key=value`` from a space-separated audit note.

    The breach note format is::

        clinic_id={cid} reviewer_user_id={rid} pending_count={n}
        oldest_age_days={d} priority=high

    so a tolerant scanner that splits on whitespace and looks for
    ``key=`` is enough.
    """
    if not note:
        return None
    needle = f"{key}="
    for token in note.replace(";", " ").split():
        token = token.strip()
        if token.startswith(needle):
            value = token[len(needle):]
            return value or None
    return None


def _parse_int(s: Optional[str]) -> int:
    if s is None:
        return 0
    try:
        return int(s)
    except (TypeError, ValueError):
        return 0


def _normalize_window(window_days: int) -> int:
    try:
        v = int(window_days)
    except (TypeError, ValueError):
        return DEFAULT_WINDOW_DAYS
    if v < MIN_WINDOW_DAYS:
        return MIN_WINDOW_DAYS
    if v > MAX_WINDOW_DAYS:
        return MAX_WINDOW_DAYS
    return v


def _normalize_sla_response_days(sla_response_days: int) -> int:
    try:
        v = int(sla_response_days)
    except (TypeError, ValueError):
        return DEFAULT_SLA_RESPONSE_DAYS
    if v < MIN_SLA_RESPONSE_DAYS:
        return MIN_SLA_RESPONSE_DAYS
    if v > MAX_SLA_RESPONSE_DAYS:
        return MAX_SLA_RESPONSE_DAYS
    return v


# ── Public API ─────────────────────────────────────────────────────────────


def pair_breaches_with_decisions(
    db: Session,
    clinic_id: Optional[str],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    sla_response_days: int = DEFAULT_SLA_RESPONSE_DAYS,
    now: Optional[datetime] = None,
) -> list[ReviewerSLAOutcomeRecord]:
    """Pair breach rows with the same reviewer's next decision row.

    Returns one :class:`ReviewerSLAOutcomeRecord` per breach in the
    ``window_days`` lookback. Rows are sorted oldest-first.

    Cross-clinic safety: every breach row's ``clinic_id`` (parsed from
    the note) must match the requested ``clinic_id`` filter. Rows with
    no clinic encoded fall through to ``None`` and are only returned
    when ``clinic_id is None``.
    """
    if not clinic_id:
        return []

    window_days = _normalize_window(window_days)
    sla_response_days = _normalize_sla_response_days(sla_response_days)
    now_utc = _coerce_utc(now) or _now()
    cutoff_iso = (now_utc - timedelta(days=window_days)).isoformat()

    # 1. Pull all breach rows for the clinic in the window.
    breach_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == BREACH_TARGET_TYPE,
            AuditEventRecord.action == BREACH_ACTION,
            AuditEventRecord.created_at >= cutoff_iso,
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    if not breach_rows:
        return []

    # 2. Filter by clinic_id (parsed from note).
    cid_needle = f"clinic_id={clinic_id}"
    scoped_breaches = [
        r for r in breach_rows if cid_needle in (r.note or "")
    ]
    if not scoped_breaches:
        return []

    # 3. Pull all decision rows for the clinic in the window — one
    #    round-trip so we can iterate in-process.
    decision_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == DECISION_TARGET_TYPE,
            AuditEventRecord.action.like(f"{DECISION_ACTION_PREFIX}%"),
            AuditEventRecord.created_at >= cutoff_iso,
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    # Filter decisions by clinic_id (parsed from note) AND group by
    # actor_id (reviewer who decided).
    scoped_decisions: dict[str, list[AuditEventRecord]] = {}
    for r in decision_rows:
        note = r.note or ""
        if cid_needle not in note:
            continue
        rid = (r.actor_id or "").strip()
        if not rid:
            continue
        scoped_decisions.setdefault(rid, []).append(r)
    # Each list is already sorted asc by created_at because the
    # outer query was sorted; no per-key resort needed.

    # 4. Pair each breach with the FIRST decision strictly newer than T.
    out: list[ReviewerSLAOutcomeRecord] = []
    for br in scoped_breaches:
        breach_at = _coerce_utc(br.created_at)
        if breach_at is None:
            continue
        rid_note = _parse_kv(br.note or "", "reviewer_user_id")
        rid = (rid_note or br.target_id or "").strip()
        if not rid:
            continue
        pending_count = _parse_int(_parse_kv(br.note or "", "pending_count"))
        oldest_age_days = _parse_int(
            _parse_kv(br.note or "", "oldest_age_days")
        )

        next_decision: Optional[AuditEventRecord] = None
        for cand in scoped_decisions.get(rid, []):
            cand_at = _coerce_utc(cand.created_at)
            if cand_at is None:
                continue
            if cand_at > breach_at:
                next_decision = cand
                break

        if next_decision is not None:
            decided_at = _coerce_utc(next_decision.created_at)
            delta_days = (
                (decided_at - breach_at).total_seconds() / 86400.0
                if decided_at is not None
                else None
            )
            if delta_days is None:
                outcome = OUTCOME_PENDING
                days_to_next = None
            elif delta_days <= sla_response_days:
                outcome = OUTCOME_DECIDED_WITHIN_SLA
                days_to_next = round(delta_days, 2)
            else:
                outcome = OUTCOME_DECIDED_LATE
                days_to_next = round(delta_days, 2)
            decided_audit_id = next_decision.event_id
        else:
            elapsed_days = (now_utc - breach_at).total_seconds() / 86400.0
            if elapsed_days >= sla_response_days:
                outcome = OUTCOME_STILL_PENDING
            else:
                outcome = OUTCOME_PENDING
            decided_audit_id = None
            decided_at = None
            days_to_next = None

        out.append(
            ReviewerSLAOutcomeRecord(
                breach_audit_id=br.event_id,
                reviewer_user_id=rid,
                breached_at=breach_at,
                pending_count=pending_count,
                oldest_age_days=oldest_age_days,
                decided_audit_id=decided_audit_id,
                decided_at=decided_at,
                days_to_next_decision=days_to_next,
                outcome=outcome,
                clinic_id=clinic_id,
            )
        )

    return out


def compute_reviewer_calibration(
    records: list[ReviewerSLAOutcomeRecord],
) -> dict[str, dict]:
    """Per-reviewer calibration aggregate.

    Returns ``{reviewer_user_id: {total_breaches, decided_within_sla_count,
    decided_late_count, still_pending_count, pending_count,
    mean_days_to_next_decision, calibration_score, last_breach_at}}``.

    ``calibration_score`` formula::

        (decided_within_sla - still_pending) / max(total - pending, 1)

    Pending rows excluded from the denominator (they haven't had a
    fair chance to resolve yet).
    """
    by_reviewer: dict[str, list[ReviewerSLAOutcomeRecord]] = {}
    for r in records:
        if not r.reviewer_user_id:
            continue
        by_reviewer.setdefault(r.reviewer_user_id, []).append(r)

    out: dict[str, dict] = {}
    for rid, rs in by_reviewer.items():
        total = len(rs)
        within = sum(1 for r in rs if r.outcome == OUTCOME_DECIDED_WITHIN_SLA)
        late = sum(1 for r in rs if r.outcome == OUTCOME_DECIDED_LATE)
        still_pending = sum(
            1 for r in rs if r.outcome == OUTCOME_STILL_PENDING
        )
        pending = sum(1 for r in rs if r.outcome == OUTCOME_PENDING)

        # Mean days_to_next_decision — only over the rows that HAVE a
        # decision (within or late). None when no decided pairs.
        decided_days = [
            r.days_to_next_decision
            for r in rs
            if r.days_to_next_decision is not None
        ]
        mean_days = (
            round(sum(decided_days) / len(decided_days), 2)
            if decided_days
            else None
        )

        denom = max(total - pending, 1)
        score = round((within - still_pending) / denom, 3)

        last_breach_at = max(r.breached_at for r in rs)

        out[rid] = {
            "total_breaches": total,
            "decided_within_sla_count": within,
            "decided_late_count": late,
            "still_pending_count": still_pending,
            "pending_count": pending,
            "mean_days_to_next_decision": mean_days,
            "calibration_score": score,
            "last_breach_at": last_breach_at.isoformat(),
        }
    return out


def median_days_to_next_decision(
    records: list[ReviewerSLAOutcomeRecord],
) -> Optional[float]:
    """Median ``days_to_next_decision`` across decided pairs.

    Returns ``None`` when no decided pairs exist (i.e. all breaches
    are still_pending or pending). Mirrors the IRB-AMD3 spec's
    ``median_days_to_next_decision`` field.
    """
    vals = sorted(
        r.days_to_next_decision
        for r in records
        if r.days_to_next_decision is not None
    )
    if not vals:
        return None
    n = len(vals)
    mid = n // 2
    if n % 2 == 1:
        return round(float(vals[mid]), 2)
    return round((vals[mid - 1] + vals[mid]) / 2.0, 2)


__all__ = [
    "BREACH_ACTION",
    "BREACH_TARGET_TYPE",
    "DECISION_ACTION_PREFIX",
    "DECISION_TARGET_TYPE",
    "DEFAULT_SLA_RESPONSE_DAYS",
    "DEFAULT_WINDOW_DAYS",
    "MAX_SLA_RESPONSE_DAYS",
    "MAX_WINDOW_DAYS",
    "MIN_SLA_RESPONSE_DAYS",
    "MIN_WINDOW_DAYS",
    "OUTCOME_DECIDED_LATE",
    "OUTCOME_DECIDED_WITHIN_SLA",
    "OUTCOME_PENDING",
    "OUTCOME_STILL_PENDING",
    "ReviewerSLAOutcomeRecord",
    "SURFACE",
    "compute_reviewer_calibration",
    "median_days_to_next_decision",
    "pair_breaches_with_decisions",
]
