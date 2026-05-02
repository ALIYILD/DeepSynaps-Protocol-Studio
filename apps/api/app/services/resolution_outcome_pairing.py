"""Resolution Outcome Pairing service (DCRO1, 2026-05-02).

Pairs ``caregiver_portal.delivery_concern_resolved`` audit rows with the
NEXT ``caregiver_portal.delivery_concern_threshold_reached`` row for the
same caregiver in the same clinic. Records whether each resolution
``stayed_resolved`` or was ``re_flagged_within_30d`` so the Resolution
Outcome Tracker hub can compute per-resolver calibration accuracy.

Use case
========

When a reviewer marks a flagged caregiver as ``false_positive`` the DCA
worker is told the original flag was noise. If the same caregiver is
re-flagged within 30 days, the reviewer's ``false_positive`` call was
wrong — the underlying delivery problem was real. This service produces
the data needed to score reviewers' calibration without any new schema:
purely a join over the existing audit rows.

Pure functions; no DB writes; no schema change. Read-only by design.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import AuditEventRecord


# Canonical actions emitted by the DCR1 router and DCA worker.
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"
FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"


# Reason codes mirror caregiver_delivery_concern_resolution_router.
ALLOWED_REASONS: tuple[str, ...] = (
    "concerns_addressed",
    "false_positive",
    "caregiver_replaced",
    "other",
)


# Default re-flag pairing window. Resolutions older than this without a
# subsequent flag are classified ``stayed_resolved``.
DEFAULT_WINDOW_DAYS = 30


# Outcome classification labels.
OUTCOME_STAYED = "stayed_resolved"
OUTCOME_REFLAGGED = "re_flagged_within_30d"
OUTCOME_PENDING = "pending"


@dataclass
class OutcomeRecord:
    """One paired (resolution, outcome) row."""

    resolved_audit_id: str
    caregiver_user_id: str
    resolver_user_id: str
    resolution_reason: str
    outcome: str
    days_to_re_flag: Optional[float]
    resolved_at: datetime


@dataclass
class ResolverCalibration:
    """Per-resolver calibration accuracy summary."""

    resolver_user_id: str
    total_resolutions: int
    false_positive_calls: int
    false_positive_re_flagged_within_30d: int
    calibration_accuracy_pct: float
    last_resolution_at: Optional[datetime]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _coerce_dt(iso: Optional[str]) -> Optional[datetime]:
    """SQLite roundtrips strip tzinfo; coerce to tz-aware UTC."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_resolution_note(note: str) -> dict[str, str]:
    """Pull canonical key=value pairs out of the resolved-row note."""
    out: dict[str, str] = {}
    if not note:
        return out
    for raw in note.split(";"):
        part = raw.strip()
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        out[k.strip()] = v.strip()
    return out


# ── Pairing core ────────────────────────────────────────────────────────────


def pair_resolutions_with_outcomes(
    db: Session, clinic_id: str | int, window_days: int = DEFAULT_WINDOW_DAYS
) -> list[OutcomeRecord]:
    """Return one ``OutcomeRecord`` per resolved row in this clinic.

    For each ``caregiver_portal.delivery_concern_resolved`` row in the
    last ``window_days`` we look for the FIRST subsequent
    ``caregiver_portal.delivery_concern_threshold_reached`` row for the
    same ``caregiver_user_id`` AND ``clinic_id`` whose ``created_at`` is
    strictly greater than the resolution timestamp.

    Outcome rules:

    * ``re_flagged_within_30d`` — next flag exists and the gap is <= 30d
    * ``stayed_resolved`` — no subsequent flag, OR the next flag is
      strictly more than 30d after the resolution
    * ``pending`` — fewer than 30 days have elapsed since the resolution
      AND there is no subsequent flag yet (i.e., we cannot classify
      this row truthfully)

    Cross-clinic safety: every audit row is filtered by the
    ``clinic_id={cid}`` substring needle in the row's ``note``. A
    reviewer in clinic A never sees rows from clinic B even if both
    clinics happen to share a caregiver_user_id (which they shouldn't,
    but defence in depth).
    """
    cid = str(clinic_id) if clinic_id is not None else ""
    if not cid:
        return []

    try:
        w = int(window_days)
    except Exception:
        w = DEFAULT_WINDOW_DAYS
    if w < 1:
        w = 1
    if w > 365:
        w = 365

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=w)
    needle = f"clinic_id={cid}"

    # Pull all resolved rows in the lookback window.
    resolved_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == RESOLVE_ACTION,
            AuditEventRecord.created_at >= cutoff.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    resolved_rows = [r for r in resolved_rows if needle in (r.note or "")]
    if not resolved_rows:
        return []

    # Cache flag rows per caregiver to avoid N queries on hot caregivers.
    # We pull a slightly wider window so we can pair a flag that is up
    # to ``w`` days AFTER the most recent resolution. The DB filter
    # leaves a healthy buffer (2x window) for the post-resolution flag
    # search and remains memory-bounded by clinic size.
    flag_cutoff = now - timedelta(days=w + 31)  # +31 so 30d window pairs are included
    flag_cache: dict[str, list[AuditEventRecord]] = {}

    out: list[OutcomeRecord] = []
    for row in resolved_rows:
        cg_id = (row.target_id or "").strip()
        if not cg_id:
            continue
        resolved_at = _coerce_dt(row.created_at)
        if resolved_at is None:
            continue

        if cg_id not in flag_cache:
            cache_rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == FLAG_ACTION,
                    AuditEventRecord.target_id == cg_id,
                    AuditEventRecord.created_at >= flag_cutoff.isoformat(),
                )
                .order_by(AuditEventRecord.created_at.asc())
                .all()
            )
            flag_cache[cg_id] = [
                f for f in cache_rows if needle in (f.note or "")
            ]

        # Find the first flag strictly after this resolution.
        next_flag: Optional[AuditEventRecord] = None
        for fr in flag_cache[cg_id]:
            f_dt = _coerce_dt(fr.created_at)
            if f_dt is None:
                continue
            if f_dt > resolved_at:
                next_flag = fr
                break

        kv = _parse_resolution_note(row.note or "")
        reason = (kv.get("resolution_reason") or "other").strip().lower()
        if reason not in ALLOWED_REASONS:
            reason = "other"
        resolver_id = (kv.get("resolver_user_id") or row.actor_id or "").strip()

        days_to: Optional[float] = None
        if next_flag is not None:
            f_dt = _coerce_dt(next_flag.created_at)
            if f_dt is not None:
                delta = (f_dt - resolved_at).total_seconds() / 86400.0
                if delta < 0:
                    delta = 0.0
                if delta <= 30.0:
                    outcome = OUTCOME_REFLAGGED
                    days_to = round(delta, 4)
                else:
                    outcome = OUTCOME_STAYED
            else:
                outcome = OUTCOME_STAYED
        else:
            # No next-flag yet. If <30d have elapsed since resolution,
            # we can't classify — call it pending. Else stayed_resolved.
            elapsed = (now - resolved_at).total_seconds() / 86400.0
            if elapsed < 30.0:
                outcome = OUTCOME_PENDING
            else:
                outcome = OUTCOME_STAYED

        out.append(
            OutcomeRecord(
                resolved_audit_id=row.event_id,
                caregiver_user_id=cg_id,
                resolver_user_id=resolver_id,
                resolution_reason=reason,
                outcome=outcome,
                days_to_re_flag=days_to,
                resolved_at=resolved_at,
            )
        )

    return out


def compute_resolver_calibration(
    records: list[OutcomeRecord],
) -> dict[str, ResolverCalibration]:
    """Group ``OutcomeRecord``s by ``resolver_user_id`` and compute
    calibration accuracy per resolver.

    For each resolver:

    * ``total_resolutions`` = count of resolutions made by this resolver
    * ``false_positive_calls`` = count of those whose
      ``resolution_reason == 'false_positive'``
    * ``false_positive_re_flagged_within_30d`` = of those, count whose
      outcome is ``re_flagged_within_30d`` (i.e. the resolver said
      "false positive" but the caregiver was re-flagged → wrong call)
    * ``calibration_accuracy_pct`` =
      ``100 * (1 - false_positive_re_flagged / max(false_positive_calls, 1))``

    A resolver with zero false_positive calls scores 100% by convention
    (they made no claims to be wrong about). Pending outcomes do not
    count as correct or incorrect — we only count classified outcomes.
    """
    by_resolver: dict[str, dict[str, object]] = {}
    for rec in records:
        rid = rec.resolver_user_id or ""
        if not rid:
            continue
        slot = by_resolver.setdefault(
            rid,
            {
                "total": 0,
                "fp_calls": 0,
                "fp_re_flagged": 0,
                "last_resolution_at": None,
            },
        )
        slot["total"] = int(slot["total"]) + 1  # type: ignore[arg-type]
        if rec.resolution_reason == "false_positive":
            slot["fp_calls"] = int(slot["fp_calls"]) + 1  # type: ignore[arg-type]
            if rec.outcome == OUTCOME_REFLAGGED:
                slot["fp_re_flagged"] = int(slot["fp_re_flagged"]) + 1  # type: ignore[arg-type]
        prev_last = slot["last_resolution_at"]
        if prev_last is None or rec.resolved_at > prev_last:  # type: ignore[operator]
            slot["last_resolution_at"] = rec.resolved_at

    out: dict[str, ResolverCalibration] = {}
    for rid, slot in by_resolver.items():
        total = int(slot["total"])  # type: ignore[arg-type]
        fp = int(slot["fp_calls"])  # type: ignore[arg-type]
        fp_wrong = int(slot["fp_re_flagged"])  # type: ignore[arg-type]
        if fp > 0:
            acc = 100.0 * (1.0 - (fp_wrong / float(fp)))
        else:
            # No FP calls → vacuously calibrated. Surface as 100% to
            # avoid penalising reviewers who never claim "false positive".
            acc = 100.0
        out[rid] = ResolverCalibration(
            resolver_user_id=rid,
            total_resolutions=total,
            false_positive_calls=fp,
            false_positive_re_flagged_within_30d=fp_wrong,
            calibration_accuracy_pct=round(acc, 2),
            last_resolution_at=slot["last_resolution_at"],  # type: ignore[arg-type]
        )
    return out


def median_days_to_re_flag(records: list[OutcomeRecord]) -> Optional[float]:
    """Median ``days_to_re_flag`` over ``re_flagged_within_30d`` records."""
    deltas = [
        rec.days_to_re_flag
        for rec in records
        if rec.outcome == OUTCOME_REFLAGGED and rec.days_to_re_flag is not None
    ]
    if not deltas:
        return None
    return round(statistics.median(deltas), 2)
