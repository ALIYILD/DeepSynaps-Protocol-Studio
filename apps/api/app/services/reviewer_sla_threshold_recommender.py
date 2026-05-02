"""IRB-AMD4: Reviewer SLA Calibration Threshold Recommender (2026-05-02).

Closes the section I rec from the IRB-AMD3 Reviewer Workload Outcome
Tracker (#451):

* IRB-AMD3 emits per-reviewer ``calibration_score`` rows.
* THIS service surfaces a "what calibration_score floor should
  auto-trigger an admin reassign-amendment action?" recommendation
  with a confidence interval. Mirrors CSAHP6 (#438) — the canonical
  "tune-a-threshold" precedent — but on the reviewer-SLA axis.

Recommendation algorithm
========================

For each clinic + window (default 180 days):

1. Load the IRB-AMD3 paired ``ReviewerSLAOutcomeRecord`` list.
2. Aggregate per reviewer via :func:`compute_reviewer_calibration`.
3. Drop reviewers with ``< MIN_BREACHES_PER_REVIEWER`` breaches —
   their score is too noisy to anchor a clinic-wide policy on.
4. If the surviving cohort has ``< MIN_REVIEWERS`` reviewers OR no
   reviewer meets the breach floor, return ``recommended=null,
   insufficient_data=True``. The router renders an honest "need
   ≥{MIN_REVIEWERS} reviewers with ≥{MIN_BREACHES_PER_REVIEWER}
   breaches each" disclaimer.
5. Otherwise: scan candidate floors from the lowest score in the
   distribution upward. The recommended floor is the LOWEST candidate
   such that ≥75% of reviewers strictly ABOVE the floor have a
   ``decided_within_sla_count`` majority (i.e., ``within > late +
   still_pending``). This means "at this floor, you can auto-reassign
   the under-performers and trust that the survivors are mostly
   acting in time".

Confidence interval
-------------------

A simple bootstrap with ``CI_BOOTSTRAP_TRIALS=50`` subsamples:

* When N≥10 reviewers: drop ONE reviewer at random per trial.
* When N<10 reviewers: drop ONE breach at random per trial (so we
  still get a non-degenerate distribution on small cohorts).

For each trial we re-run the recommendation and collect the floor.
The CI is the [25th, 75th] percentile of the trials. When all trials
return None we surface ``ci_low=ci_high=null``.

Pure functions; no DB writes; no schema change. Read-only by design.
"""
from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import ReviewerSLACalibrationThreshold
from app.services.irb_reviewer_sla_outcome_pairing import (
    DEFAULT_SLA_RESPONSE_DAYS,
    DEFAULT_WINDOW_DAYS,
    MAX_WINDOW_DAYS,
    MIN_WINDOW_DAYS,
    OUTCOME_DECIDED_LATE,
    OUTCOME_DECIDED_WITHIN_SLA,
    OUTCOME_PENDING,
    OUTCOME_STILL_PENDING,
    ReviewerSLAOutcomeRecord,
    compute_reviewer_calibration,
    pair_breaches_with_decisions,
)


_log = logging.getLogger(__name__)


# Pinned constants — referenced by the router's Pydantic validators,
# the launch-audit tests, and the UI insufficient-data disclaimer.
MIN_REVIEWERS = 3
MIN_BREACHES_PER_REVIEWER = 2
MAJORITY_PCT = 0.75
CI_BOOTSTRAP_TRIALS = 50
CI_LOW_PERCENTILE = 25
CI_HIGH_PERCENTILE = 75


# Canonical threshold_key for the calibration-floor row. Namespaced so
# a future "ceiling on mean_days_to_next_decision" key can be added
# without a schema change.
DEFAULT_THRESHOLD_KEY = "calibration_floor"


# ── Data shapes ────────────────────────────────────────────────────────────


@dataclass
class ThresholdRecommendation:
    """Recommendation envelope returned to the router."""

    recommended: Optional[float] = None
    ci_low: Optional[float] = None
    ci_high: Optional[float] = None
    sample_size_reviewers: int = 0
    sample_size_breaches: int = 0
    current_threshold: Optional[float] = None
    auto_reassign_enabled: bool = False
    projected_reassign_count: int = 0
    insufficient_data: bool = False
    insufficient_data_reason: Optional[str] = None
    window_days: int = DEFAULT_WINDOW_DAYS
    sla_response_days: int = DEFAULT_SLA_RESPONSE_DAYS
    clinic_id: Optional[str] = None
    threshold_key: str = DEFAULT_THRESHOLD_KEY
    qualifying_reviewers: list[dict] = field(default_factory=list)


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


def _percentile(values: list[float], pct: float) -> Optional[float]:
    """Linear-interpolation percentile.

    Returns ``None`` on empty input. Pure function — used by the
    bootstrap to compute [ci_low, ci_high].
    """
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return float(s[0])
    rank = (pct / 100.0) * (len(s) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(s) - 1)
    frac = rank - lo
    return round(float(s[lo] + (s[hi] - s[lo]) * frac), 3)


def _is_majority_within(stats: dict) -> bool:
    """Reviewer is "acting in time" iff within > late + still_pending."""
    within = int(stats.get("decided_within_sla_count", 0))
    late = int(stats.get("decided_late_count", 0))
    still = int(stats.get("still_pending_count", 0))
    return within > (late + still)


def _qualifying(
    calibration: dict[str, dict],
    *,
    min_breaches: int = MIN_BREACHES_PER_REVIEWER,
) -> dict[str, dict]:
    """Filter reviewers to those with ``>= min_breaches`` breaches.

    Single-breach reviewers are too noisy to anchor a clinic-wide
    policy on. Returns a SUB-DICT keyed by reviewer_user_id.
    """
    return {
        rid: stats
        for rid, stats in calibration.items()
        if int(stats.get("total_breaches", 0)) >= min_breaches
    }


def _scan_floor(calibration: dict[str, dict]) -> Optional[float]:
    """Scan candidate floors and return the LOWEST one that satisfies
    the ≥75% majority rule on the reviewers strictly ABOVE the floor.

    Walks the distinct calibration_score values in ascending order. At
    each candidate ``c``, the population is the reviewers with
    ``calibration_score > c``. The candidate is accepted iff
    ``majority_pct(population) >= MAJORITY_PCT``.

    Returns ``None`` when no candidate satisfies the rule (e.g. the
    cohort is uniformly under-performing).
    """
    if not calibration:
        return None
    scores = sorted(
        {round(float(s.get("calibration_score", 0.0)), 3) for s in calibration.values()}
    )
    # Probe a slot strictly below the lowest score so we can recommend
    # ``min_score - epsilon`` when EVERY reviewer is acting in time —
    # this lets the floor sit at the bottom of the observed range.
    epsilon = 0.001
    candidates = [scores[0] - epsilon] + scores
    for c in candidates:
        above = [
            stats for stats in calibration.values()
            if round(float(stats.get("calibration_score", 0.0)), 3) > c
        ]
        if not above:
            continue
        majority = sum(1 for s in above if _is_majority_within(s))
        if (majority / len(above)) >= MAJORITY_PCT:
            return round(float(c), 3)
    return None


def _project_reassign_count(
    calibration: dict[str, dict],
    records: list[ReviewerSLAOutcomeRecord],
    floor: Optional[float],
) -> int:
    """Count breaches that WOULD be auto-reassigned if ``floor`` is
    adopted with ``auto_reassign_enabled=True``.

    A breach is reassign-eligible iff:
      * its reviewer's ``calibration_score < floor``, AND
      * its outcome is ``still_pending`` (the only outcome where a
        reassign action is still actionable — pending breaches are in
        grace, decided rows are already resolved).
    """
    if floor is None:
        return 0
    bad_reviewers = {
        rid for rid, stats in calibration.items()
        if float(stats.get("calibration_score", 0.0)) < floor
    }
    return sum(
        1
        for r in records
        if r.reviewer_user_id in bad_reviewers
        and r.outcome == OUTCOME_STILL_PENDING
    )


def _bootstrap_ci(
    records: list[ReviewerSLAOutcomeRecord],
    *,
    trials: int = CI_BOOTSTRAP_TRIALS,
    rng_seed: Optional[int] = 42,
) -> tuple[Optional[float], Optional[float]]:
    """Bootstrap [ci_low, ci_high] on the recommended floor.

    Strategy
    --------
    For each of ``trials`` rounds:

    * Build a perturbed copy of ``records``.
    * If reviewers count ``N >= 10``: drop ONE reviewer entirely.
    * Else: drop ONE breach.

    Re-run the recommendation pipeline on the perturbed records and
    collect the floor (skipping ``None``s). Final CI is the
    [CI_LOW_PERCENTILE, CI_HIGH_PERCENTILE] percentile of the trial
    floors.
    """
    if not records:
        return (None, None)
    by_reviewer: dict[str, list[ReviewerSLAOutcomeRecord]] = {}
    for r in records:
        by_reviewer.setdefault(r.reviewer_user_id, []).append(r)
    n = len(by_reviewer)
    if n == 0:
        return (None, None)

    rng = random.Random(rng_seed)
    trial_floors: list[float] = []
    reviewer_ids = list(by_reviewer.keys())

    for _ in range(max(1, int(trials))):
        if n >= 10:
            drop_id = rng.choice(reviewer_ids)
            perturbed = [r for r in records if r.reviewer_user_id != drop_id]
        else:
            if len(records) < 2:
                continue
            drop_idx = rng.randrange(len(records))
            perturbed = [r for i, r in enumerate(records) if i != drop_idx]
        cal = _qualifying(compute_reviewer_calibration(perturbed))
        if len(cal) < MIN_REVIEWERS:
            continue
        floor = _scan_floor(cal)
        if floor is not None:
            trial_floors.append(float(floor))

    if not trial_floors:
        return (None, None)
    return (
        _percentile(trial_floors, CI_LOW_PERCENTILE),
        _percentile(trial_floors, CI_HIGH_PERCENTILE),
    )


def _qualifying_reviewers_payload(
    calibration: dict[str, dict],
) -> list[dict]:
    """Compact per-reviewer slice surfaced in the API response so the
    UI can render a "below the floor" leaderboard without a second
    round-trip. Excludes pending-only rows from the score breakdown."""
    out: list[dict] = []
    for rid, stats in calibration.items():
        out.append({
            "reviewer_user_id": rid,
            "total_breaches": int(stats.get("total_breaches", 0)),
            "decided_within_sla_count": int(
                stats.get("decided_within_sla_count", 0)
            ),
            "decided_late_count": int(stats.get("decided_late_count", 0)),
            "still_pending_count": int(stats.get("still_pending_count", 0)),
            "calibration_score": float(stats.get("calibration_score", 0.0)),
        })
    out.sort(key=lambda r: r["calibration_score"])
    return out


# ── Public API ─────────────────────────────────────────────────────────────


def recommend_threshold(
    db: Session,
    clinic_id: Optional[str],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    sla_response_days: int = DEFAULT_SLA_RESPONSE_DAYS,
    now: Optional[datetime] = None,
) -> ThresholdRecommendation:
    """Return a :class:`ThresholdRecommendation` for the clinic.

    Surfaces ``insufficient_data=True`` when the cohort is too small
    to anchor a clinic-wide policy. The router renders the honest
    disclaimer when this flag is set; the UI hides the "Run replay"
    + "Adopt" affordances.
    """
    w = _normalize_window(window_days)
    out = ThresholdRecommendation(
        window_days=w,
        sla_response_days=int(sla_response_days),
        clinic_id=clinic_id,
        threshold_key=DEFAULT_THRESHOLD_KEY,
    )

    if not clinic_id:
        out.insufficient_data = True
        out.insufficient_data_reason = "no_clinic_scope"
        return out

    # Pull the current adopted floor (if any) up front so the UI
    # always knows the baseline regardless of recommendation outcome.
    try:
        existing = (
            db.query(ReviewerSLACalibrationThreshold)
            .filter(
                ReviewerSLACalibrationThreshold.clinic_id == clinic_id,
                ReviewerSLACalibrationThreshold.threshold_key
                == DEFAULT_THRESHOLD_KEY,
            )
            .one_or_none()
        )
    except Exception:  # pragma: no cover
        existing = None
    if existing is not None:
        out.current_threshold = float(existing.threshold_value)
        out.auto_reassign_enabled = bool(existing.auto_reassign_enabled)

    records = pair_breaches_with_decisions(
        db,
        clinic_id,
        window_days=w,
        sla_response_days=sla_response_days,
        now=now,
    )
    out.sample_size_breaches = len(records)
    calibration = compute_reviewer_calibration(records)
    out.sample_size_reviewers = len(calibration)

    qualifying = _qualifying(calibration)
    out.qualifying_reviewers = _qualifying_reviewers_payload(qualifying)

    if len(qualifying) < MIN_REVIEWERS:
        out.insufficient_data = True
        if not calibration:
            out.insufficient_data_reason = "no_breaches_in_window"
        elif len(calibration) < MIN_REVIEWERS:
            out.insufficient_data_reason = "too_few_reviewers"
        else:
            out.insufficient_data_reason = "too_few_breaches_per_reviewer"
        return out

    floor = _scan_floor(qualifying)
    out.recommended = floor
    if floor is not None:
        ci_low, ci_high = _bootstrap_ci(records)
        out.ci_low = ci_low
        out.ci_high = ci_high
        out.projected_reassign_count = _project_reassign_count(
            qualifying, records, floor
        )
    return out


__all__ = [
    "CI_BOOTSTRAP_TRIALS",
    "CI_HIGH_PERCENTILE",
    "CI_LOW_PERCENTILE",
    "DEFAULT_THRESHOLD_KEY",
    "MAJORITY_PCT",
    "MIN_BREACHES_PER_REVIEWER",
    "MIN_REVIEWERS",
    "ThresholdRecommendation",
    "recommend_threshold",
]
