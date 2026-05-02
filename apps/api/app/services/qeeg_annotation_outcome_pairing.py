"""QEEG-ANN2: qEEG Annotation Resolution Outcome Tracker (2026-05-02).

Pairs each ``QEEGReportAnnotation`` row's ``created_at`` with the same
row's ``resolved_at`` (or absence) and classifies the outcome relative
to a configurable SLA window. Closes the loop on whether the QEEG-ANN1
sidecar annotation system is actually being followed up on — i.e. are
clinicians resolving the flags they raise within a reasonable window,
or do evidence-gap flags (FDA-questioned findings) sit stale?

Outcome classification
======================

For a row created at ``T``, with sla window ``sla_days`` (default 30):

* ``resolved_within_sla`` — ``resolved_at`` set AND
  ``(resolved_at - T) <= sla_days``
* ``resolved_late`` — ``resolved_at`` set AND ``> sla_days``
* ``still_open_overdue`` — no ``resolved_at`` AND ``(now - T) > sla_days``
* ``still_open_grace`` — no ``resolved_at`` AND ``(now - T) <= sla_days``

Cohort metrics
==============

* ``median_days_to_resolve`` / ``p90_days_to_resolve`` — over decided
  rows (resolved_within_sla + resolved_late) only.
* ``evidence_gap_open_overdue_count`` — count of overdue still-open
  rows whose ``flag_type == 'evidence_gap'``. Surfaces FDA-questioned
  findings that are not being closed out, per
  ``deepsynaps-qeeg-evidence-gaps`` memory.
* Per flag-type breakdown — drops ``margin_note`` and ``region_tag``
  (kind != flag) since those don't carry a flag_type.
* Trend buckets — weekly created vs resolved vs abandoned counts
  across the window. ``abandoned`` = still_open_overdue at the
  bucket's end.

Mirrors the IRB-AMD3 (#451) outcome-pairing precedent. Pure
read-only; no DB writes; no schema change.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import QEEGReportAnnotation


_log = logging.getLogger(__name__)


# Page-level surface for the QEEG-ANN2 outcome tracker (target_type
# for self-rows + ingestion + audit-events feed).
SURFACE = "qeeg_annotation_outcome_tracker"


# Defaults — pinned so tests, the router, and the UI disclaimer all
# reference the same numbers.
DEFAULT_WINDOW_DAYS = 180
MIN_WINDOW_DAYS = 7
MAX_WINDOW_DAYS = 365
DEFAULT_SLA_DAYS = 30
MIN_SLA_DAYS = 1
MAX_SLA_DAYS = 180


# Outcome labels.
OUTCOME_RESOLVED_WITHIN_SLA = "resolved_within_sla"
OUTCOME_RESOLVED_LATE = "resolved_late"
OUTCOME_STILL_OPEN_OVERDUE = "still_open_overdue"
OUTCOME_STILL_OPEN_GRACE = "still_open_grace"


# Annotation kind/flag mirrors — referenced from the QEEG-ANN1
# whitelist so the two contracts stay aligned.
KIND_MARGIN_NOTE = "margin_note"
KIND_REGION_TAG = "region_tag"
KIND_FLAG = "flag"

FLAG_TYPE_EVIDENCE_GAP = "evidence_gap"
FLAG_TYPE_CLINICALLY_SIGNIFICANT = "clinically_significant"
FLAG_TYPE_DISCUSS_NEXT_SESSION = "discuss_next_session"
FLAG_TYPE_PATIENT_QUESTION = "patient_question"


# ── Data shapes ────────────────────────────────────────────────────────────


@dataclass
class AnnotationOutcomeRecord:
    """One paired (create → resolve) record."""

    annotation_id: str
    clinic_id: Optional[str]
    patient_id: str
    report_id: str
    creator_user_id: str
    resolver_user_id: Optional[str]
    kind: str
    flag_type: Optional[str]
    body: Optional[str]
    created_at: datetime
    resolved_at: Optional[datetime]
    days_to_resolve: Optional[float]
    days_open: float
    outcome: str


# ── Helpers ────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Re-tag a possibly-naive ``datetime`` as UTC.

    SQLite strips tzinfo on roundtrip (per
    ``deepsynaps-sqlite-tz-naive`` memory) — coerce to tz-aware UTC
    before any comparison against ``datetime.now(timezone.utc)``.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


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


def _normalize_sla_days(sla_days: int) -> int:
    try:
        v = int(sla_days)
    except (TypeError, ValueError):
        return DEFAULT_SLA_DAYS
    if v < MIN_SLA_DAYS:
        return MIN_SLA_DAYS
    if v > MAX_SLA_DAYS:
        return MAX_SLA_DAYS
    return v


def _percentile(values: list[float], pct: float) -> Optional[float]:
    """Linear-interpolation percentile (``pct`` in 0..100).

    Returns ``None`` when the list is empty. Uses the same formula as
    numpy.percentile with linear interpolation so that the test suite
    can pin a deterministic reference value.
    """
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    if n == 1:
        return round(float(s[0]), 2)
    rank = (pct / 100.0) * (n - 1)
    lo = int(rank)
    hi = min(lo + 1, n - 1)
    frac = rank - lo
    val = s[lo] + (s[hi] - s[lo]) * frac
    return round(float(val), 2)


def _median(values: list[float]) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    mid = n // 2
    if n % 2 == 1:
        return round(float(s[mid]), 2)
    return round((s[mid - 1] + s[mid]) / 2.0, 2)


# ── Public API ─────────────────────────────────────────────────────────────


def pair_creates_with_resolutions(
    db: Session,
    clinic_id: Optional[str],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    sla_days: int = DEFAULT_SLA_DAYS,
    now: Optional[datetime] = None,
) -> list[AnnotationOutcomeRecord]:
    """Read every annotation row for ``clinic_id`` whose ``created_at``
    is within the lookback window, and classify each into one of the
    four outcome buckets. Returns oldest-first.
    """
    if not clinic_id:
        return []

    window_days = _normalize_window(window_days)
    sla_days = _normalize_sla_days(sla_days)
    now_utc = _coerce_utc(now) or _now()
    cutoff = now_utc - timedelta(days=window_days)

    rows = (
        db.query(QEEGReportAnnotation)
        .filter(QEEGReportAnnotation.clinic_id == clinic_id)
        .order_by(QEEGReportAnnotation.created_at.asc())
        .all()
    )
    out: list[AnnotationOutcomeRecord] = []
    for r in rows:
        created_at = _coerce_utc(r.created_at)
        if created_at is None:
            continue
        if created_at < cutoff:
            continue
        resolved_at = _coerce_utc(r.resolved_at)
        days_to_resolve: Optional[float] = None
        if resolved_at is not None:
            delta = (resolved_at - created_at).total_seconds() / 86400.0
            days_to_resolve = round(delta, 2)
            if delta <= sla_days:
                outcome = OUTCOME_RESOLVED_WITHIN_SLA
            else:
                outcome = OUTCOME_RESOLVED_LATE
            days_open = round(delta, 2)
        else:
            elapsed = (now_utc - created_at).total_seconds() / 86400.0
            days_open = round(elapsed, 2)
            if elapsed > sla_days:
                outcome = OUTCOME_STILL_OPEN_OVERDUE
            else:
                outcome = OUTCOME_STILL_OPEN_GRACE

        out.append(
            AnnotationOutcomeRecord(
                annotation_id=r.id,
                clinic_id=r.clinic_id,
                patient_id=r.patient_id,
                report_id=r.report_id,
                creator_user_id=r.created_by_user_id,
                resolver_user_id=r.resolved_by_user_id,
                kind=r.annotation_kind,
                flag_type=r.flag_type,
                body=r.body,
                created_at=created_at,
                resolved_at=resolved_at,
                days_to_resolve=days_to_resolve,
                days_open=days_open,
                outcome=outcome,
            )
        )
    return out


def compute_clinician_outcome_summary(
    records: list[AnnotationOutcomeRecord],
) -> dict[str, dict]:
    """Group by ``creator_user_id``; per-creator counts + median.

    Returns ``{creator_user_id: {total_created, resolved_within_sla_count,
    resolved_late_count, still_open_overdue_count, still_open_grace_count,
    median_days_to_resolve, last_created_at}}``.
    """
    by_creator: dict[str, list[AnnotationOutcomeRecord]] = {}
    for r in records:
        if not r.creator_user_id:
            continue
        by_creator.setdefault(r.creator_user_id, []).append(r)
    out: dict[str, dict] = {}
    for uid, rs in by_creator.items():
        total = len(rs)
        within = sum(1 for r in rs if r.outcome == OUTCOME_RESOLVED_WITHIN_SLA)
        late = sum(1 for r in rs if r.outcome == OUTCOME_RESOLVED_LATE)
        overdue = sum(
            1 for r in rs if r.outcome == OUTCOME_STILL_OPEN_OVERDUE
        )
        grace = sum(1 for r in rs if r.outcome == OUTCOME_STILL_OPEN_GRACE)
        decided_days = [
            r.days_to_resolve for r in rs if r.days_to_resolve is not None
        ]
        median_days = _median(decided_days)
        last_created_at = max(r.created_at for r in rs)
        out[uid] = {
            "total_created": total,
            "resolved_within_sla_count": within,
            "resolved_late_count": late,
            "still_open_overdue_count": overdue,
            "still_open_grace_count": grace,
            "median_days_to_resolve": median_days,
            "last_created_at": last_created_at.isoformat(),
        }
    return out


def compute_resolver_latency_summary(
    records: list[AnnotationOutcomeRecord],
) -> dict[str, dict]:
    """Group by ``resolver_user_id`` (skipping unresolved rows).

    Returns ``{resolver_user_id: {total_resolved, median_days_to_resolve,
    p90_days_to_resolve, last_resolved_at}}``.
    """
    by_resolver: dict[str, list[AnnotationOutcomeRecord]] = {}
    for r in records:
        if not r.resolver_user_id or r.days_to_resolve is None:
            continue
        by_resolver.setdefault(r.resolver_user_id, []).append(r)
    out: dict[str, dict] = {}
    for uid, rs in by_resolver.items():
        days = [r.days_to_resolve for r in rs if r.days_to_resolve is not None]
        median_days = _median(days)
        p90_days = _percentile(days, 90)
        last_resolved_at = max(
            (r.resolved_at for r in rs if r.resolved_at is not None),
            default=None,
        )
        out[uid] = {
            "total_resolved": len(rs),
            "median_days_to_resolve": median_days,
            "p90_days_to_resolve": p90_days,
            "last_resolved_at": (
                last_resolved_at.isoformat() if last_resolved_at else None
            ),
        }
    return out


def compute_flag_type_breakdown(
    records: list[AnnotationOutcomeRecord],
) -> dict[str, dict]:
    """Per-flag-type stats (kind == 'flag' only).

    Each value is ``{total, resolved_within_sla, resolved_late,
    still_open_overdue, still_open_grace, median_days_to_resolve}``.
    Margin notes and region tags carry no ``flag_type`` and are
    excluded.
    """
    out: dict[str, dict] = {}
    for r in records:
        if r.kind != KIND_FLAG or not r.flag_type:
            continue
        bucket = out.setdefault(
            r.flag_type,
            {
                "total": 0,
                OUTCOME_RESOLVED_WITHIN_SLA: 0,
                OUTCOME_RESOLVED_LATE: 0,
                OUTCOME_STILL_OPEN_OVERDUE: 0,
                OUTCOME_STILL_OPEN_GRACE: 0,
                "_decided_days": [],
            },
        )
        bucket["total"] += 1
        bucket[r.outcome] = bucket.get(r.outcome, 0) + 1
        if r.days_to_resolve is not None:
            bucket["_decided_days"].append(r.days_to_resolve)

    finalised: dict[str, dict] = {}
    for ft, b in out.items():
        days = b.pop("_decided_days")
        b["median_days_to_resolve"] = _median(days)
        finalised[ft] = b
    return finalised


def median_days_to_resolve(
    records: list[AnnotationOutcomeRecord],
) -> Optional[float]:
    days = [r.days_to_resolve for r in records if r.days_to_resolve is not None]
    return _median(days)


def p90_days_to_resolve(
    records: list[AnnotationOutcomeRecord],
) -> Optional[float]:
    days = [r.days_to_resolve for r in records if r.days_to_resolve is not None]
    return _percentile(days, 90)


def evidence_gap_open_overdue_count(
    records: list[AnnotationOutcomeRecord],
) -> int:
    """Count of FDA-questioned (evidence_gap) flags that are
    still open AND past the SLA window.
    """
    return sum(
        1
        for r in records
        if r.flag_type == FLAG_TYPE_EVIDENCE_GAP
        and r.outcome == OUTCOME_STILL_OPEN_OVERDUE
    )


def compute_trend_buckets(
    records: list[AnnotationOutcomeRecord],
    *,
    window_days: int,
    now: Optional[datetime] = None,
) -> list[dict]:
    """Weekly bucket counts of ``created`` / ``resolved`` /
    ``abandoned`` across the window.

    ``abandoned`` is the count of rows whose outcome is
    ``still_open_overdue`` and whose ``created_at`` falls inside the
    bucket — i.e. rows that were created during the bucket and are
    still unresolved past the SLA window now.
    """
    now_utc = _coerce_utc(now) or _now()
    window_days = _normalize_window(window_days)
    n_buckets = max(1, window_days // 7)
    cutoff = now_utc - timedelta(days=n_buckets * 7)
    buckets: list[dict] = []
    for i in range(n_buckets):
        start = cutoff + timedelta(days=i * 7)
        end = start + timedelta(days=7)
        created = sum(1 for r in records if start <= r.created_at < end)
        resolved = sum(
            1
            for r in records
            if r.resolved_at is not None and start <= r.resolved_at < end
        )
        abandoned = sum(
            1
            for r in records
            if start <= r.created_at < end
            and r.outcome == OUTCOME_STILL_OPEN_OVERDUE
        )
        buckets.append(
            {
                "week_start": start.isoformat(),
                "created": created,
                "resolved": resolved,
                "abandoned": abandoned,
            }
        )
    return buckets


__all__ = [
    "AnnotationOutcomeRecord",
    "DEFAULT_SLA_DAYS",
    "DEFAULT_WINDOW_DAYS",
    "FLAG_TYPE_CLINICALLY_SIGNIFICANT",
    "FLAG_TYPE_DISCUSS_NEXT_SESSION",
    "FLAG_TYPE_EVIDENCE_GAP",
    "FLAG_TYPE_PATIENT_QUESTION",
    "KIND_FLAG",
    "KIND_MARGIN_NOTE",
    "KIND_REGION_TAG",
    "MAX_SLA_DAYS",
    "MAX_WINDOW_DAYS",
    "MIN_SLA_DAYS",
    "MIN_WINDOW_DAYS",
    "OUTCOME_RESOLVED_LATE",
    "OUTCOME_RESOLVED_WITHIN_SLA",
    "OUTCOME_STILL_OPEN_GRACE",
    "OUTCOME_STILL_OPEN_OVERDUE",
    "SURFACE",
    "compute_clinician_outcome_summary",
    "compute_flag_type_breakdown",
    "compute_resolver_latency_summary",
    "compute_trend_buckets",
    "evidence_gap_open_overdue_count",
    "median_days_to_resolve",
    "p90_days_to_resolve",
    "pair_creates_with_resolutions",
]
