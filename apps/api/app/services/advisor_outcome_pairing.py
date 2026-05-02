"""Advisor Outcome Pairing service (CSAHP5, 2026-05-02).

Pairs each ``auth_drift_rotation_policy_advisor.advice_snapshot`` audit
row at time ``T`` with the same-key snapshot at ``T + pair_lookahead_days``
(±2d tolerance). Computes deltas (re-flag-rate, confirmed count, manual
share) and ``card_disappeared`` so the CSAHP5 outcome-tracker can tell
whether the heuristic advice was predictive — i.e., did the underlying
metric actually improve after the clinic acted on the card?

Pair key
========

The pair key is ``(clinic_id, channel, advice_code)``. We do NOT
include severity in the key because severity is derived from the
metrics, so a card that crosses a severity boundary (medium → high)
within the lookahead is still the SAME card from the outcome tracker's
perspective.

Pairing rules
=============

1. Sort all snapshots for the clinic by ``created_at`` ascending.
2. For each snapshot S at time T, look for the snapshot of the same
   key whose ``created_at`` is closest to ``T + pair_lookahead_days``
   within ±2d tolerance.
3. If found → pair (S, S+14) and compute deltas + ``card_disappeared``
   (which is False because the card still exists at T+14d).
4. If NOT found AND the matching ``snapshot_run`` row at T+14d exists
   (within ±2d tolerance) → ``card_disappeared = True``. The clinic
   ran another snapshot but this card was no longer present, meaning
   the advice was acted upon AND the metric improved enough to drop
   below the rule threshold.
5. If neither a paired card NOR a paired snapshot_run at T+14d exists,
   AND less than (pair_lookahead_days + 2d) has elapsed since T →
   ``pending`` (insufficient data to classify yet).
6. If pair_lookahead_days + 2d HAS elapsed and no paired snapshot_run
   row exists for the clinic at all → ``stale`` (do not include in
   outcome calc; the worker probably stopped emitting).

Pure functions; no DB writes; no schema change. Read-only by design.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import AuditEventRecord


# Canonical actions emitted by the CSAHP5 worker.
ADVICE_SNAPSHOT_ACTION = "auth_drift_rotation_policy_advisor.advice_snapshot"
SNAPSHOT_RUN_ACTION = "auth_drift_rotation_policy_advisor.snapshot_run"
SURFACE = "auth_drift_rotation_policy_advisor"


# Defaults — pinned so the tests, the router, and the UI disclaimer all
# reference the same numbers.
DEFAULT_WINDOW_DAYS = 90
MIN_WINDOW_DAYS = 7
MAX_WINDOW_DAYS = 365
DEFAULT_PAIR_LOOKAHEAD_DAYS = 14
PAIR_TOLERANCE_DAYS = 2


# Outcome classification labels.
OUTCOME_PAIRED_PRESENT = "paired_present"  # card exists at T and T+14d
OUTCOME_PAIRED_DISAPPEARED = "paired_disappeared"  # card existed at T, gone at T+14d
OUTCOME_PENDING = "pending"  # not enough time has elapsed
OUTCOME_STALE = "stale"  # T+14d window passed without a snapshot_run


# Recognised advice codes (from CSAHP4).
KNOWN_ADVICE_CODES: tuple[str, ...] = (
    "REFLAG_HIGH",
    "MANUAL_REFLAG",
    "AUTH_DOMINANT",
)


# ── Data classes ───────────────────────────────────────────────────────────


@dataclass
class AdvisorOutcomeRecord:
    """One paired (snapshot at T, snapshot at T+14d) row."""

    channel: str
    advice_code: str
    severity: str
    snapshot_at: datetime
    paired_at: Optional[datetime]
    re_flag_rate_pct_t0: float
    re_flag_rate_pct_t1: Optional[float]
    re_flag_rate_delta: Optional[float]
    confirmed_count_t0: int
    confirmed_count_t1: Optional[int]
    confirmed_count_delta: Optional[int]
    manual_rotation_share_pct_t0: float
    manual_rotation_share_pct_t1: Optional[float]
    manual_rotation_share_delta: Optional[float]
    card_disappeared: bool
    outcome: str
    snapshot_event_id: str


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


def _parse_kv(note: str) -> dict[str, str]:
    """Parse the canonical ``key=value key=value`` audit-row note into
    a dict. Ignores tokens without ``=``."""
    out: dict[str, str] = {}
    if not note:
        return out
    for tok in note.split():
        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)
        out[k.strip()] = v.strip().rstrip(";,")
    return out


def _to_float(v: Optional[str]) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except Exception:
        return 0.0


def _to_int(v: Optional[str]) -> int:
    if v is None:
        return 0
    try:
        return int(float(v))
    except Exception:
        return 0


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


def _normalize_lookahead(lookahead_days: int) -> int:
    try:
        v = int(lookahead_days)
    except Exception:
        return DEFAULT_PAIR_LOOKAHEAD_DAYS
    if v < 1:
        return 1
    if v > 90:
        return 90
    return v


# ── Pairing core ───────────────────────────────────────────────────────────


def pair_advice_with_outcomes(
    db: Session,
    clinic_id: str | int,
    window_days: int = DEFAULT_WINDOW_DAYS,
    pair_lookahead_days: int = DEFAULT_PAIR_LOOKAHEAD_DAYS,
) -> list[AdvisorOutcomeRecord]:
    """Pair each ``advice_snapshot`` row at T with the same-key
    snapshot at ``T + pair_lookahead_days`` (±2d tolerance).

    Cross-clinic safety: every audit row is filtered by the
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

    # Pull snapshot rows + snapshot_run rows in window.
    snap_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == ADVICE_SNAPSHOT_ACTION,
            AuditEventRecord.created_at >= cutoff.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    snap_rows = [r for r in snap_rows if needle in (r.note or "")]
    if not snap_rows:
        return []

    # Pull a wider window of snapshot_run rows so we can pair T+lookahead.
    run_cutoff = cutoff - timedelta(days=look + PAIR_TOLERANCE_DAYS + 1)
    run_rows_raw = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == SNAPSHOT_RUN_ACTION,
            AuditEventRecord.created_at >= run_cutoff.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    run_rows = [r for r in run_rows_raw if needle in (r.note or "")]

    # Pull snapshots in a wider window too so we can pair forward.
    fwd_rows_raw = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == ADVICE_SNAPSHOT_ACTION,
            AuditEventRecord.created_at >= run_cutoff.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    fwd_rows = [r for r in fwd_rows_raw if needle in (r.note or "")]

    # Index forward snapshots by (channel, advice_code).
    fwd_by_key: dict[tuple[str, str], list[tuple[datetime, AuditEventRecord, dict[str, str]]]] = {}
    for fr in fwd_rows:
        kv = _parse_kv(fr.note or "")
        ch = kv.get("channel", "")
        code = kv.get("advice_code", "")
        if not ch or not code:
            continue
        ts = _coerce_dt(fr.created_at)
        if ts is None:
            continue
        fwd_by_key.setdefault((ch, code), []).append((ts, fr, kv))

    # Index snapshot_run rows by ts.
    runs_by_ts: list[tuple[datetime, AuditEventRecord]] = []
    for rr in run_rows:
        ts = _coerce_dt(rr.created_at)
        if ts is None:
            continue
        runs_by_ts.append((ts, rr))
    runs_by_ts.sort(key=lambda x: x[0])

    tol = timedelta(days=PAIR_TOLERANCE_DAYS)
    look_td = timedelta(days=look)
    out: list[AdvisorOutcomeRecord] = []

    for snap in snap_rows:
        kv0 = _parse_kv(snap.note or "")
        ch = kv0.get("channel", "")
        code = kv0.get("advice_code", "")
        if not ch or not code:
            continue
        sev = kv0.get("severity", "")
        ts0 = _coerce_dt(snap.created_at)
        if ts0 is None:
            continue
        target_ts = ts0 + look_td
        win_lo = target_ts - tol
        win_hi = target_ts + tol

        re0 = _to_float(kv0.get("re_flag_rate_pct"))
        cf0 = _to_int(kv0.get("confirmed_count"))
        ms0 = _to_float(kv0.get("manual_rotation_share_pct"))

        # Try to find an exact card pair.
        candidates = fwd_by_key.get((ch, code), [])
        best: Optional[tuple[datetime, AuditEventRecord, dict[str, str]]] = None
        best_dist: Optional[timedelta] = None
        for ts1, row1, kv1 in candidates:
            if ts1 <= ts0:
                continue
            if win_lo <= ts1 <= win_hi:
                d = abs(ts1 - target_ts)
                if best_dist is None or d < best_dist:
                    best_dist = d
                    best = (ts1, row1, kv1)

        if best is not None:
            ts1, _row1, kv1 = best
            re1 = _to_float(kv1.get("re_flag_rate_pct"))
            cf1 = _to_int(kv1.get("confirmed_count"))
            ms1 = _to_float(kv1.get("manual_rotation_share_pct"))
            out.append(
                AdvisorOutcomeRecord(
                    channel=ch,
                    advice_code=code,
                    severity=sev,
                    snapshot_at=ts0,
                    paired_at=ts1,
                    re_flag_rate_pct_t0=re0,
                    re_flag_rate_pct_t1=re1,
                    re_flag_rate_delta=round(re1 - re0, 2),
                    confirmed_count_t0=cf0,
                    confirmed_count_t1=cf1,
                    confirmed_count_delta=cf1 - cf0,
                    manual_rotation_share_pct_t0=ms0,
                    manual_rotation_share_pct_t1=ms1,
                    manual_rotation_share_delta=round(ms1 - ms0, 2),
                    card_disappeared=False,
                    outcome=OUTCOME_PAIRED_PRESENT,
                    snapshot_event_id=snap.event_id or "",
                )
            )
            continue

        # No card pair — see if there is a snapshot_run at T+14d.
        run_match: Optional[tuple[datetime, AuditEventRecord]] = None
        for rts, rrow in runs_by_ts:
            if win_lo <= rts <= win_hi:
                run_match = (rts, rrow)
                break

        if run_match is not None:
            # The clinic ran another snapshot at T+14d but this card
            # was not in it → card disappeared (advice was acted upon
            # and the metric improved below threshold).
            rts, _rrow = run_match
            out.append(
                AdvisorOutcomeRecord(
                    channel=ch,
                    advice_code=code,
                    severity=sev,
                    snapshot_at=ts0,
                    paired_at=rts,
                    re_flag_rate_pct_t0=re0,
                    re_flag_rate_pct_t1=None,
                    re_flag_rate_delta=None,
                    confirmed_count_t0=cf0,
                    confirmed_count_t1=None,
                    confirmed_count_delta=None,
                    manual_rotation_share_pct_t0=ms0,
                    manual_rotation_share_pct_t1=None,
                    manual_rotation_share_delta=None,
                    card_disappeared=True,
                    outcome=OUTCOME_PAIRED_DISAPPEARED,
                    snapshot_event_id=snap.event_id or "",
                )
            )
            continue

        # No pair yet. If we are still inside the lookahead+tolerance
        # window, mark pending. Otherwise stale.
        elapsed = now - ts0
        if elapsed < look_td + tol:
            out.append(
                AdvisorOutcomeRecord(
                    channel=ch,
                    advice_code=code,
                    severity=sev,
                    snapshot_at=ts0,
                    paired_at=None,
                    re_flag_rate_pct_t0=re0,
                    re_flag_rate_pct_t1=None,
                    re_flag_rate_delta=None,
                    confirmed_count_t0=cf0,
                    confirmed_count_t1=None,
                    confirmed_count_delta=None,
                    manual_rotation_share_pct_t0=ms0,
                    manual_rotation_share_pct_t1=None,
                    manual_rotation_share_delta=None,
                    card_disappeared=False,
                    outcome=OUTCOME_PENDING,
                    snapshot_event_id=snap.event_id or "",
                )
            )
        else:
            # No record kept — stale. Excluded from outcome calc.
            continue

    return out


# ── Aggregations ───────────────────────────────────────────────────────────


def compute_advisor_calibration(
    records: list[AdvisorOutcomeRecord],
) -> dict[str, dict[str, float | int]]:
    """Group records by ``advice_code`` and compute calibration.

    For each advice_code:

    * ``total_cards`` — total snapshots (paired_present + paired_disappeared)
    * ``total_pending`` — count still within the eval window
    * ``card_disappeared_count`` — paired_disappeared count
    * ``card_disappeared_pct`` — disappeared / classified * 100
    * ``predictive_accuracy_pct`` — alias for ``card_disappeared_pct``
    * ``mean_re_flag_rate_delta`` — mean of paired_present deltas
      (negative = improved)
    """
    by_code: dict[str, dict[str, list[float] | int]] = {}
    for code in KNOWN_ADVICE_CODES:
        by_code[code] = {
            "total_cards": 0,
            "total_pending": 0,
            "card_disappeared_count": 0,
            "_deltas": [],
        }

    for rec in records:
        slot = by_code.setdefault(
            rec.advice_code,
            {
                "total_cards": 0,
                "total_pending": 0,
                "card_disappeared_count": 0,
                "_deltas": [],
            },
        )
        if rec.outcome == OUTCOME_PENDING:
            slot["total_pending"] = int(slot["total_pending"]) + 1  # type: ignore[arg-type]
            continue
        if rec.outcome == OUTCOME_STALE:
            continue
        slot["total_cards"] = int(slot["total_cards"]) + 1  # type: ignore[arg-type]
        if rec.outcome == OUTCOME_PAIRED_DISAPPEARED:
            slot["card_disappeared_count"] = int(  # type: ignore[arg-type]
                slot["card_disappeared_count"]
            ) + 1
        elif rec.outcome == OUTCOME_PAIRED_PRESENT:
            if rec.re_flag_rate_delta is not None:
                slot["_deltas"].append(  # type: ignore[union-attr]
                    float(rec.re_flag_rate_delta)
                )

    out: dict[str, dict[str, float | int]] = {}
    for code, slot in by_code.items():
        total = int(slot["total_cards"])  # type: ignore[arg-type]
        pending = int(slot["total_pending"])  # type: ignore[arg-type]
        disappeared = int(slot["card_disappeared_count"])  # type: ignore[arg-type]
        deltas = slot["_deltas"]  # type: ignore[index]
        if total > 0:
            disappeared_pct = round((disappeared / total) * 100.0, 2)
        else:
            disappeared_pct = 0.0
        if isinstance(deltas, list) and deltas:
            mean_delta = round(sum(deltas) / len(deltas), 2)
        else:
            mean_delta = 0.0
        out[code] = {
            "total_cards": total,
            "total_pending": pending,
            "card_disappeared_count": disappeared,
            "card_disappeared_pct": disappeared_pct,
            "predictive_accuracy_pct": disappeared_pct,
            "mean_re_flag_rate_delta": mean_delta,
        }
    return out


def compute_advisor_calibration_by_channel(
    records: list[AdvisorOutcomeRecord],
) -> dict[str, dict[str, float | int]]:
    """Group records by ``channel`` (regardless of advice_code) and
    compute the same metrics."""
    by_channel: dict[str, dict[str, list[float] | int]] = {}
    for rec in records:
        slot = by_channel.setdefault(
            rec.channel,
            {
                "total_cards": 0,
                "total_pending": 0,
                "card_disappeared_count": 0,
                "_deltas": [],
            },
        )
        if rec.outcome == OUTCOME_PENDING:
            slot["total_pending"] = int(slot["total_pending"]) + 1  # type: ignore[arg-type]
            continue
        if rec.outcome == OUTCOME_STALE:
            continue
        slot["total_cards"] = int(slot["total_cards"]) + 1  # type: ignore[arg-type]
        if rec.outcome == OUTCOME_PAIRED_DISAPPEARED:
            slot["card_disappeared_count"] = int(  # type: ignore[arg-type]
                slot["card_disappeared_count"]
            ) + 1
        elif rec.outcome == OUTCOME_PAIRED_PRESENT:
            if rec.re_flag_rate_delta is not None:
                slot["_deltas"].append(  # type: ignore[union-attr]
                    float(rec.re_flag_rate_delta)
                )

    out: dict[str, dict[str, float | int]] = {}
    for ch, slot in by_channel.items():
        total = int(slot["total_cards"])  # type: ignore[arg-type]
        pending = int(slot["total_pending"])  # type: ignore[arg-type]
        disappeared = int(slot["card_disappeared_count"])  # type: ignore[arg-type]
        deltas = slot["_deltas"]  # type: ignore[index]
        disappeared_pct = (
            round((disappeared / total) * 100.0, 2) if total > 0 else 0.0
        )
        if isinstance(deltas, list) and deltas:
            mean_delta = round(sum(deltas) / len(deltas), 2)
        else:
            mean_delta = 0.0
        out[ch] = {
            "total_cards": total,
            "total_pending": pending,
            "card_disappeared_count": disappeared,
            "card_disappeared_pct": disappeared_pct,
            "predictive_accuracy_pct": disappeared_pct,
            "mean_re_flag_rate_delta": mean_delta,
        }
    return out


def compute_weekly_trend_buckets(
    records: list[AdvisorOutcomeRecord],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> list[dict[str, str | int]]:
    """Return ``[{"week_start": iso, "cards_emitted": int,
    "cards_resolved": int}, ...]`` ordered ascending."""
    if not records:
        return []
    w = _normalize_window(window_days)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=w)
    # ISO Mondays as bucket starts.
    buckets: dict[str, dict[str, int]] = {}
    for rec in records:
        ts = rec.snapshot_at
        if ts < cutoff:
            continue
        # Find Monday of that week (UTC).
        monday = ts - timedelta(days=ts.weekday())
        monday = monday.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        key = monday.date().isoformat()
        slot = buckets.setdefault(
            key, {"cards_emitted": 0, "cards_resolved": 0}
        )
        slot["cards_emitted"] += 1
        if rec.outcome == OUTCOME_PAIRED_DISAPPEARED:
            slot["cards_resolved"] += 1
    return [
        {
            "week_start": k,
            "cards_emitted": v["cards_emitted"],
            "cards_resolved": v["cards_resolved"],
        }
        for k, v in sorted(buckets.items())
    ]


__all__ = [
    "ADVICE_SNAPSHOT_ACTION",
    "SNAPSHOT_RUN_ACTION",
    "SURFACE",
    "DEFAULT_WINDOW_DAYS",
    "MIN_WINDOW_DAYS",
    "MAX_WINDOW_DAYS",
    "DEFAULT_PAIR_LOOKAHEAD_DAYS",
    "PAIR_TOLERANCE_DAYS",
    "OUTCOME_PAIRED_PRESENT",
    "OUTCOME_PAIRED_DISAPPEARED",
    "OUTCOME_PENDING",
    "OUTCOME_STALE",
    "KNOWN_ADVICE_CODES",
    "AdvisorOutcomeRecord",
    "pair_advice_with_outcomes",
    "compute_advisor_calibration",
    "compute_advisor_calibration_by_channel",
    "compute_weekly_trend_buckets",
]
