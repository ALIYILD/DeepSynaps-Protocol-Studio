"""Threshold Adoption Outcome Pairing service (CSAHP7, 2026-05-02).

Pairs each ``auth_drift_rotation_policy_advisor.threshold_adopted``
audit row at time ``T`` with the same ``(advice_code, threshold_key)``
pair's measured **predictive accuracy** at ``T+30d`` (post-adoption)
versus the **baseline accuracy** at ``T`` (pre-adoption window
``[T-30d, T]``).

Did the adopted threshold actually move the needle in production?

Pattern
=======

Same shape as CSAHP5 (Outcome Tracker, #434) but applied recursively to
the threshold-adoption events emitted by CSAHP6 (#438). Closes the
meta-loop on the meta-loop:

* CSAHP4 (#428) emits heuristic advice cards from hardcoded thresholds.
* CSAHP5 (#434) measures predictive accuracy per advice code.
* CSAHP6 (#438) lets admins **adopt** new thresholds when replay shows
  improved accuracy.
* CSAHP7 (this module) measures whether adopted thresholds actually
  delivered the promised improvement in production.

We reuse :func:`pair_advice_with_outcomes` from
``advisor_outcome_pairing.py`` to compute the per-advice-code
``card_disappeared_pct`` (== predictive_accuracy_pct) over a window,
applying it twice per adoption row:

* baseline window ``[T-30d, T]``
* post-adoption window ``[T, T+30d]``

Outcome classes
===============

For each adoption row at time ``T``:

* ``improved`` — ``post_adoption_accuracy - baseline_accuracy >= 5``
  percentage points
* ``regressed`` — delta ``<= -5`` percentage points
* ``flat`` — ``-5 < delta < 5``
* ``pending`` — ``T + 30d`` has not yet elapsed
* ``insufficient_data`` — either window has fewer than 3 paired cards
  for this ``advice_code``

Pure functions; no DB writes; no schema change. Read-only by design.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import AuditEventRecord
from app.services.advisor_outcome_pairing import (
    KNOWN_ADVICE_CODES,
    pair_advice_with_outcomes,
    compute_advisor_calibration,
)


# Canonical action emitted by the CSAHP6 admin endpoint.
ADOPTION_ACTION = "auth_drift_rotation_policy_advisor.threshold_adopted"
ADOPTION_AUDIT_SURFACE = "auth_drift_rotation_policy_advisor"
SURFACE = "rotation_policy_advisor_threshold_adoption_outcome_tracker"


# Defaults — pinned so the tests, the router, and the UI disclaimer all
# reference the same numbers.
DEFAULT_WINDOW_DAYS = 180
MIN_WINDOW_DAYS = 30
MAX_WINDOW_DAYS = 365
DEFAULT_PAIR_LOOKAHEAD_DAYS = 30
MIN_PAIR_LOOKAHEAD_DAYS = 7
MAX_PAIR_LOOKAHEAD_DAYS = 90


# Outcome classification labels.
OUTCOME_IMPROVED = "improved"
OUTCOME_REGRESSED = "regressed"
OUTCOME_FLAT = "flat"
OUTCOME_PENDING = "pending"
OUTCOME_INSUFFICIENT_DATA = "insufficient_data"


# Threshold (in percentage points) above/below which an adoption is
# classified as ``improved`` / ``regressed``. Below the magnitude the
# outcome is ``flat``.
DELTA_IMPROVED_PCT_PTS = 5.0
DELTA_REGRESSED_PCT_PTS = -5.0


# Minimum number of paired cards in EACH window to classify the outcome.
# Below this, the row is ``insufficient_data``.
MIN_PAIRED_CARDS_PER_WINDOW = 3


# ── Data classes ───────────────────────────────────────────────────────────


@dataclass
class AdoptionOutcomeRecord:
    """One paired (adoption at T, accuracy delta at T+30d) row."""

    adoption_event_id: str
    advice_code: str
    threshold_key: str
    previous_value: Optional[float]
    new_value: float
    adopter_user_id: str
    justification: str
    adopted_at: datetime
    baseline_accuracy_pct: Optional[float]
    post_adoption_accuracy_pct: Optional[float]
    accuracy_delta: Optional[float]
    baseline_sample_size: int
    post_adoption_sample_size: int
    outcome: str


# ── Helpers ────────────────────────────────────────────────────────────────


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


def _parse_adoption_note(note: str) -> dict[str, str]:
    """Parse the CSAHP6 adoption-row note. The ``justification`` field
    may contain spaces, so we pull it out with a marker before
    tokenising the structured prefix."""
    out: dict[str, str] = {}
    if not note:
        return out
    j_marker = " justification="
    j_idx = note.find(j_marker)
    head = note
    if j_idx >= 0:
        head = note[:j_idx]
        out["justification"] = note[j_idx + len(j_marker):].strip()
    for tok in head.split():
        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)
        out[k.strip()] = v.strip().rstrip(";,")
    return out


def _to_float(v: Optional[str]) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except Exception:
        return None


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


def _normalize_lookahead(look: int) -> int:
    try:
        v = int(look)
    except Exception:
        return DEFAULT_PAIR_LOOKAHEAD_DAYS
    if v < MIN_PAIR_LOOKAHEAD_DAYS:
        return MIN_PAIR_LOOKAHEAD_DAYS
    if v > MAX_PAIR_LOOKAHEAD_DAYS:
        return MAX_PAIR_LOOKAHEAD_DAYS
    return v


# ── Accuracy slice ─────────────────────────────────────────────────────────


def _accuracy_for_advice_code_in_window(
    db: Session,
    *,
    clinic_id: str,
    advice_code: str,
    end_at: datetime,
    span_days: int,
) -> tuple[Optional[float], int]:
    """Return ``(predictive_accuracy_pct, sample_size)`` for the given
    ``advice_code`` over the window ``[end_at - span_days, end_at]``.

    ``predictive_accuracy_pct`` is :func:`compute_advisor_calibration`'s
    ``card_disappeared_pct`` for the requested code. Returns
    ``(None, 0)`` when there is no underlying data.
    """
    # ``pair_advice_with_outcomes`` always slices the window relative to
    # ``now()``. To compute the accuracy for an arbitrary historical
    # window ending at ``end_at`` we widen the lookback so the call
    # captures the older period, then post-filter the records inline.
    now = datetime.now(timezone.utc)
    elapsed_to_end = (now - end_at).total_seconds() / 86400.0
    # Pull a generous window: everything from (end_at - span_days) to now.
    look_days = max(int(elapsed_to_end + span_days + 4), span_days + 1)
    look_days = min(look_days, MAX_WINDOW_DAYS)
    records = pair_advice_with_outcomes(
        db,
        clinic_id=clinic_id,
        window_days=look_days,
        pair_lookahead_days=14,
    )
    lo = end_at - timedelta(days=span_days)
    hi = end_at
    sliced = [
        r
        for r in records
        if r.advice_code == advice_code and lo <= r.snapshot_at <= hi
    ]
    if not sliced:
        return (None, 0)
    cal = compute_advisor_calibration(sliced)
    code_slot = cal.get(advice_code, {}) if cal else {}
    total_classified = int(code_slot.get("total_cards", 0) or 0)
    if total_classified == 0:
        return (None, 0)
    pct = float(code_slot.get("predictive_accuracy_pct", 0.0) or 0.0)
    return (round(pct, 2), total_classified)


# ── Pairing core ───────────────────────────────────────────────────────────


def pair_adoptions_with_outcomes(
    db: Session,
    clinic_id: str | int,
    window_days: int = DEFAULT_WINDOW_DAYS,
    pair_lookahead_days: int = DEFAULT_PAIR_LOOKAHEAD_DAYS,
) -> list[AdoptionOutcomeRecord]:
    """Pair each ``threshold_adopted`` audit row at T with the
    advice-code's measured accuracy in the windows ``[T-30d, T]`` and
    ``[T, T+30d]``.

    Cross-clinic safety: every adoption row is filtered by the
    ``clinic_id={cid}`` substring needle in the row's note.
    """
    cid = str(clinic_id) if clinic_id is not None else ""
    if not cid:
        return []

    w = _normalize_window(window_days)
    look = _normalize_lookahead(pair_lookahead_days)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=w)
    needle = f"clinic_id={cid}"

    rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == ADOPTION_ACTION,
            AuditEventRecord.created_at >= cutoff.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    rows = [r for r in rows if needle in (r.note or "")]
    if not rows:
        return []

    look_td = timedelta(days=look)
    out: list[AdoptionOutcomeRecord] = []

    for row in rows:
        kv = _parse_adoption_note(row.note or "")
        code = kv.get("advice_code", "")
        key = kv.get("threshold_key", "")
        if not code or not key:
            continue
        prev_val = _to_float(kv.get("previous_value"))
        new_val = _to_float(kv.get("new_value")) or 0.0
        ts0 = _coerce_dt(row.created_at)
        if ts0 is None:
            continue

        # Compute baseline + post-adoption accuracies.
        baseline_pct, baseline_n = _accuracy_for_advice_code_in_window(
            db,
            clinic_id=cid,
            advice_code=code,
            end_at=ts0,
            span_days=look,
        )
        post_pct: Optional[float]
        post_n: int
        post_window_end = ts0 + look_td
        if now < post_window_end:
            # Window has not fully elapsed → pending.
            post_pct = None
            post_n = 0
        else:
            post_pct, post_n = _accuracy_for_advice_code_in_window(
                db,
                clinic_id=cid,
                advice_code=code,
                end_at=post_window_end,
                span_days=look,
            )

        # Classify outcome.
        if now < post_window_end:
            outcome = OUTCOME_PENDING
            delta: Optional[float] = None
        else:
            if (
                baseline_n < MIN_PAIRED_CARDS_PER_WINDOW
                or post_n < MIN_PAIRED_CARDS_PER_WINDOW
                or baseline_pct is None
                or post_pct is None
            ):
                outcome = OUTCOME_INSUFFICIENT_DATA
                if baseline_pct is not None and post_pct is not None:
                    delta = round(post_pct - baseline_pct, 2)
                else:
                    delta = None
            else:
                delta = round(post_pct - baseline_pct, 2)
                if delta >= DELTA_IMPROVED_PCT_PTS:
                    outcome = OUTCOME_IMPROVED
                elif delta <= DELTA_REGRESSED_PCT_PTS:
                    outcome = OUTCOME_REGRESSED
                else:
                    outcome = OUTCOME_FLAT

        adopter = row.actor_id or ""
        justification = (kv.get("justification") or "")[:300]

        out.append(
            AdoptionOutcomeRecord(
                adoption_event_id=row.event_id or "",
                advice_code=code,
                threshold_key=key,
                previous_value=prev_val,
                new_value=new_val,
                adopter_user_id=adopter,
                justification=justification,
                adopted_at=ts0,
                baseline_accuracy_pct=baseline_pct,
                post_adoption_accuracy_pct=post_pct,
                accuracy_delta=delta,
                baseline_sample_size=baseline_n,
                post_adoption_sample_size=post_n,
                outcome=outcome,
            )
        )
    return out


# ── Aggregations ───────────────────────────────────────────────────────────


def compute_adopter_calibration(
    records: list[AdoptionOutcomeRecord],
) -> dict[str, dict[str, float | int]]:
    """Group records by ``adopter_user_id`` and compute per-adopter
    calibration.

    For each adopter:

    * ``total_adoptions`` — total adoption rows
    * ``classified_adoptions`` — count whose outcome is improved /
      regressed / flat (excludes pending + insufficient_data)
    * ``improved_count`` / ``regressed_count`` / ``flat_count``
    * ``improved_pct`` / ``regressed_pct`` — over classified denominator
    * ``mean_accuracy_delta`` — mean delta over rows with a non-null
      delta value (pending excluded)
    * ``calibration_score`` —
      ``(improved_count - regressed_count) / max(total_adoptions, 1)``
      (range -1.0 to 1.0)
    """
    by_adopter: dict[str, dict[str, list[float] | int]] = {}
    for rec in records:
        rid = rec.adopter_user_id or ""
        if not rid:
            continue
        slot = by_adopter.setdefault(
            rid,
            {
                "total_adoptions": 0,
                "improved_count": 0,
                "regressed_count": 0,
                "flat_count": 0,
                "pending_count": 0,
                "insufficient_count": 0,
                "_deltas": [],
            },
        )
        slot["total_adoptions"] = int(slot["total_adoptions"]) + 1  # type: ignore[arg-type]
        if rec.outcome == OUTCOME_IMPROVED:
            slot["improved_count"] = int(slot["improved_count"]) + 1  # type: ignore[arg-type]
        elif rec.outcome == OUTCOME_REGRESSED:
            slot["regressed_count"] = int(slot["regressed_count"]) + 1  # type: ignore[arg-type]
        elif rec.outcome == OUTCOME_FLAT:
            slot["flat_count"] = int(slot["flat_count"]) + 1  # type: ignore[arg-type]
        elif rec.outcome == OUTCOME_PENDING:
            slot["pending_count"] = int(slot["pending_count"]) + 1  # type: ignore[arg-type]
        else:
            slot["insufficient_count"] = int(slot["insufficient_count"]) + 1  # type: ignore[arg-type]
        if rec.accuracy_delta is not None:
            slot["_deltas"].append(float(rec.accuracy_delta))  # type: ignore[union-attr]

    out: dict[str, dict[str, float | int]] = {}
    for rid, slot in by_adopter.items():
        total = int(slot["total_adoptions"])  # type: ignore[arg-type]
        improved = int(slot["improved_count"])  # type: ignore[arg-type]
        regressed = int(slot["regressed_count"])  # type: ignore[arg-type]
        flat = int(slot["flat_count"])  # type: ignore[arg-type]
        pending = int(slot["pending_count"])  # type: ignore[arg-type]
        insufficient = int(slot["insufficient_count"])  # type: ignore[arg-type]
        deltas = slot["_deltas"]  # type: ignore[index]

        classified = improved + regressed + flat
        improved_pct = (
            round((improved / classified) * 100.0, 2) if classified else 0.0
        )
        regressed_pct = (
            round((regressed / classified) * 100.0, 2) if classified else 0.0
        )

        if isinstance(deltas, list) and deltas:
            mean_delta = round(sum(deltas) / len(deltas), 2)
        else:
            mean_delta = 0.0

        # Calibration score: (improved - regressed) / max(total, 1).
        score_denom = max(total, 1)
        calibration_score = round((improved - regressed) / float(score_denom), 4)

        out[rid] = {
            "total_adoptions": total,
            "improved_count": improved,
            "regressed_count": regressed,
            "flat_count": flat,
            "pending_count": pending,
            "insufficient_count": insufficient,
            "improved_pct": improved_pct,
            "regressed_pct": regressed_pct,
            "mean_accuracy_delta": mean_delta,
            "calibration_score": calibration_score,
        }
    return out


def compute_outcome_counts(
    records: list[AdoptionOutcomeRecord],
) -> dict[str, int]:
    """Return a dict of ``{outcome: count}`` over ALL outcome labels.
    Always returns the full key set so the UI renders consistent
    distribution bars regardless of zero buckets."""
    out: dict[str, int] = {
        OUTCOME_IMPROVED: 0,
        OUTCOME_REGRESSED: 0,
        OUTCOME_FLAT: 0,
        OUTCOME_PENDING: 0,
        OUTCOME_INSUFFICIENT_DATA: 0,
    }
    for rec in records:
        out[rec.outcome] = out.get(rec.outcome, 0) + 1
    return out


def compute_outcome_pct(counts: dict[str, int]) -> dict[str, float]:
    """Return percentage shares for the **classified** outcomes only
    (improved + regressed + flat). Pending and insufficient_data are
    excluded from the denominator (we have no signal on them yet)."""
    classified = (
        counts.get(OUTCOME_IMPROVED, 0)
        + counts.get(OUTCOME_REGRESSED, 0)
        + counts.get(OUTCOME_FLAT, 0)
    )
    if classified == 0:
        return {
            OUTCOME_IMPROVED: 0.0,
            OUTCOME_REGRESSED: 0.0,
            OUTCOME_FLAT: 0.0,
        }
    return {
        OUTCOME_IMPROVED: round(
            (counts.get(OUTCOME_IMPROVED, 0) / classified) * 100.0, 2
        ),
        OUTCOME_REGRESSED: round(
            (counts.get(OUTCOME_REGRESSED, 0) / classified) * 100.0, 2
        ),
        OUTCOME_FLAT: round(
            (counts.get(OUTCOME_FLAT, 0) / classified) * 100.0, 2
        ),
    }


def compute_by_advice_code(
    records: list[AdoptionOutcomeRecord],
) -> dict[str, dict[str, float | int]]:
    """Per-advice-code rollup of outcome counts and mean delta. Always
    surfaces the three known advice codes so the UI's mini-cards
    render consistently."""
    by_code: dict[str, dict[str, list[float] | int]] = {}
    for code in KNOWN_ADVICE_CODES:
        by_code[code] = {
            "total_adoptions": 0,
            "improved_count": 0,
            "regressed_count": 0,
            "flat_count": 0,
            "pending_count": 0,
            "insufficient_count": 0,
            "_deltas": [],
        }
    for rec in records:
        slot = by_code.setdefault(
            rec.advice_code,
            {
                "total_adoptions": 0,
                "improved_count": 0,
                "regressed_count": 0,
                "flat_count": 0,
                "pending_count": 0,
                "insufficient_count": 0,
                "_deltas": [],
            },
        )
        slot["total_adoptions"] = int(slot["total_adoptions"]) + 1  # type: ignore[arg-type]
        if rec.outcome == OUTCOME_IMPROVED:
            slot["improved_count"] = int(slot["improved_count"]) + 1  # type: ignore[arg-type]
        elif rec.outcome == OUTCOME_REGRESSED:
            slot["regressed_count"] = int(slot["regressed_count"]) + 1  # type: ignore[arg-type]
        elif rec.outcome == OUTCOME_FLAT:
            slot["flat_count"] = int(slot["flat_count"]) + 1  # type: ignore[arg-type]
        elif rec.outcome == OUTCOME_PENDING:
            slot["pending_count"] = int(slot["pending_count"]) + 1  # type: ignore[arg-type]
        else:
            slot["insufficient_count"] = int(slot["insufficient_count"]) + 1  # type: ignore[arg-type]
        if rec.accuracy_delta is not None:
            slot["_deltas"].append(float(rec.accuracy_delta))  # type: ignore[union-attr]

    out: dict[str, dict[str, float | int]] = {}
    for code, slot in by_code.items():
        deltas = slot["_deltas"]  # type: ignore[index]
        if isinstance(deltas, list) and deltas:
            mean_delta = round(sum(deltas) / len(deltas), 2)
        else:
            mean_delta = 0.0
        out[code] = {
            "total_adoptions": int(slot["total_adoptions"]),  # type: ignore[arg-type]
            "improved_count": int(slot["improved_count"]),  # type: ignore[arg-type]
            "regressed_count": int(slot["regressed_count"]),  # type: ignore[arg-type]
            "flat_count": int(slot["flat_count"]),  # type: ignore[arg-type]
            "pending_count": int(slot["pending_count"]),  # type: ignore[arg-type]
            "insufficient_count": int(slot["insufficient_count"]),  # type: ignore[arg-type]
            "mean_accuracy_delta": mean_delta,
        }
    return out


def compute_median_accuracy_delta(
    records: list[AdoptionOutcomeRecord],
) -> Optional[float]:
    """Median ``accuracy_delta`` across rows with a non-null delta."""
    deltas = [
        r.accuracy_delta for r in records if r.accuracy_delta is not None
    ]
    if not deltas:
        return None
    return round(statistics.median(deltas), 2)


def compute_weekly_trend_buckets(
    records: list[AdoptionOutcomeRecord],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> list[dict[str, str | int]]:
    """Return ``[{"week_start": iso, "improved": int, "regressed": int}, ...]``
    bucketed by ISO Monday of ``adopted_at``."""
    if not records:
        return []
    w = _normalize_window(window_days)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=w)
    buckets: dict[str, dict[str, int]] = {}
    for rec in records:
        ts = rec.adopted_at
        if ts < cutoff:
            continue
        monday = ts - timedelta(days=ts.weekday())
        monday = monday.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        key = monday.date().isoformat()
        slot = buckets.setdefault(
            key, {"improved": 0, "regressed": 0}
        )
        if rec.outcome == OUTCOME_IMPROVED:
            slot["improved"] += 1
        elif rec.outcome == OUTCOME_REGRESSED:
            slot["regressed"] += 1
    return [
        {
            "week_start": k,
            "improved": v["improved"],
            "regressed": v["regressed"],
        }
        for k, v in sorted(buckets.items())
    ]


__all__ = [
    "ADOPTION_ACTION",
    "ADOPTION_AUDIT_SURFACE",
    "SURFACE",
    "DEFAULT_WINDOW_DAYS",
    "MIN_WINDOW_DAYS",
    "MAX_WINDOW_DAYS",
    "DEFAULT_PAIR_LOOKAHEAD_DAYS",
    "MIN_PAIR_LOOKAHEAD_DAYS",
    "MAX_PAIR_LOOKAHEAD_DAYS",
    "OUTCOME_IMPROVED",
    "OUTCOME_REGRESSED",
    "OUTCOME_FLAT",
    "OUTCOME_PENDING",
    "OUTCOME_INSUFFICIENT_DATA",
    "DELTA_IMPROVED_PCT_PTS",
    "DELTA_REGRESSED_PCT_PTS",
    "MIN_PAIRED_CARDS_PER_WINDOW",
    "AdoptionOutcomeRecord",
    "pair_adoptions_with_outcomes",
    "compute_adopter_calibration",
    "compute_outcome_counts",
    "compute_outcome_pct",
    "compute_by_advice_code",
    "compute_median_accuracy_delta",
    "compute_weekly_trend_buckets",
]
