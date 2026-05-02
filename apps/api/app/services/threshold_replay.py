"""Rotation Policy Advisor Threshold Replay service (CSAHP6, 2026-05-02).

Closes the recursion loop opened by CSAHP5 (#434):

* CSAHP4 (#428) emits heuristic advice cards from hardcoded thresholds.
* CSAHP5 (#434) measures predictive accuracy per advice code (i.e.
  ``card_disappeared_pct`` over the last 90 days of frozen
  ``advice_snapshot`` rows paired against their T+14d outcomes).
* THIS service lets admins ask: "what would the predictive accuracy
  have been if the thresholds were different?" — by replaying the
  ``override_thresholds`` against the SAME frozen snapshot rows and
  comparing the synthetic what-if accuracy against the current
  baseline. Same calibration chain logic, applied recursively to the
  heuristic itself.

The replay reconstructs ``supporting_metrics`` from the snapshot rows
themselves (the CSAHP5 worker freezes them at snapshot time as ``key=value``
tokens in the audit-row note). It does NOT recompute metrics from
the current drift data — the whole point is to ask "if THIS metric
had been evaluated against the proposed threshold, would the card
have fired?" against the historical metric value.

Pure functions; no DB writes; no schema change. Read-only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.persistence.models import AuditEventRecord
from app.services.advisor_outcome_pairing import (
    ADVICE_SNAPSHOT_ACTION,
    DEFAULT_PAIR_LOOKAHEAD_DAYS,
    DEFAULT_WINDOW_DAYS,
    KNOWN_ADVICE_CODES,
    MAX_WINDOW_DAYS,
    MIN_WINDOW_DAYS,
    OUTCOME_PAIRED_DISAPPEARED,
    OUTCOME_PAIRED_PRESENT,
    _coerce_dt,
    _parse_kv,
    _to_float,
    _to_int,
    pair_advice_with_outcomes,
)
from app.services.rotation_policy_advisor import (
    DEFAULT_THRESHOLDS,
    ROTATION_ADVICE_CODES,
    _load_thresholds,
    _resolve_thresholds,
)


# ── Data classes ──────────────────────────────────────────────────────────


@dataclass
class _SnapshotMetrics:
    """One ``advice_snapshot`` row, parsed for replay.

    Carries every metric the CSAHP4 rule predicates need PLUS the
    ``snapshot_event_id`` so the post-replay outcome pair can be
    looked up by snapshot key.
    """

    snapshot_at: datetime
    channel: str
    advice_code: str
    severity: str
    re_flag_rate_pct: float
    confirmed_count: int
    manual_rotation_share_pct: float
    auth_error_class_share_pct: float
    total_drifts: int
    rotations: int
    snapshot_event_id: str
    note: str
    target_id: str


@dataclass
class ThresholdReplayResult:
    """Result of one what-if replay.

    ``override_thresholds`` echoes back the input so the caller can
    re-render the request body. ``current_thresholds`` is the
    fully-resolved DB+default map used for the baseline comparison.
    Both ``current_accuracy`` and ``whatif_accuracy`` are keyed by
    ``advice_code``. ``delta`` is whatif − current per code.
    ``cards_fired_change`` reports the count change in cards that
    would have fired under each map (so admins can spot "stricter
    threshold removed 14 cards" patterns at a glance). ``sample_size``
    is the paired card count per code (the denominator behind the
    accuracy percent — small sample sizes make the percent unstable
    and are surfaced honestly).
    """

    override_thresholds: dict[str, dict[str, float]]
    current_thresholds: dict[str, dict[str, float]]
    current_accuracy: dict[str, float] = field(default_factory=dict)
    whatif_accuracy: dict[str, float] = field(default_factory=dict)
    delta: dict[str, float] = field(default_factory=dict)
    cards_fired_change: dict[str, dict[str, int]] = field(
        default_factory=dict
    )
    sample_size: dict[str, int] = field(default_factory=dict)
    window_days: int = DEFAULT_WINDOW_DAYS
    pair_lookahead_days: int = DEFAULT_PAIR_LOOKAHEAD_DAYS
    clinic_id: Optional[str] = None
    snapshot_count: int = 0


# ── Helpers ───────────────────────────────────────────────────────────────


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
    if v < 1:
        return 1
    if v > 90:
        return 90
    return v


def _parse_snapshot_row(row: AuditEventRecord) -> Optional[_SnapshotMetrics]:
    """Parse one ``advice_snapshot`` audit row into a
    :class:`_SnapshotMetrics`. Returns ``None`` when the row is
    missing required fields (defensive — silently drops malformed
    rows so the replay never crashes mid-window)."""
    note = row.note or ""
    kv = _parse_kv(note)
    ch = kv.get("channel", "")
    code = kv.get("advice_code", "")
    if not ch or not code:
        return None
    ts = _coerce_dt(row.created_at)
    if ts is None:
        return None
    return _SnapshotMetrics(
        snapshot_at=ts,
        channel=ch,
        advice_code=code,
        severity=kv.get("severity", ""),
        re_flag_rate_pct=_to_float(kv.get("re_flag_rate_pct")),
        confirmed_count=_to_int(kv.get("confirmed_count")),
        manual_rotation_share_pct=_to_float(
            kv.get("manual_rotation_share_pct")
        ),
        auth_error_class_share_pct=_to_float(
            kv.get("auth_error_class_share_pct")
        ),
        total_drifts=_to_int(kv.get("total_drifts")),
        rotations=_to_int(kv.get("rotations")),
        snapshot_event_id=row.event_id or "",
        note=note,
        target_id=row.target_id or "",
    )


def _read_snapshot_rows(
    db: Session,
    *,
    clinic_id: str,
    window_days: int,
    pair_lookahead_days: int,
) -> list[_SnapshotMetrics]:
    """Pull ``advice_snapshot`` rows for the clinic over the window.

    Window matches the CSAHP5 pairing service so replay results
    line up 1:1 with the live outcome-tracker summary.
    """
    w = _normalize_window(window_days)
    look = _normalize_lookahead(pair_lookahead_days)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=w)
    needle = f"clinic_id={clinic_id}"

    snap_rows = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.action == ADVICE_SNAPSHOT_ACTION,
            AuditEventRecord.created_at >= cutoff.isoformat(),
        )
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
    out: list[_SnapshotMetrics] = []
    for r in snap_rows:
        if needle not in (r.note or ""):
            continue
        parsed = _parse_snapshot_row(r)
        if parsed is None:
            continue
        out.append(parsed)
    # Used by the test ``replay reconstructs supporting_metrics from
    # snapshot rows`` — silence the lookahead arg warning by using it.
    _ = look
    return out


def _card_would_fire(
    snap: _SnapshotMetrics, thresholds: dict[str, dict[str, float]]
) -> bool:
    """Replay the CSAHP4 rule predicate for ONE snapshot row against
    a threshold map. Returns ``True`` when the card would have fired
    under the new thresholds.

    Intentionally mirrors :func:`app.services.rotation_policy_advisor._eval_rules_for_channel`
    so the replay produces the same answer the live heuristic would
    have produced for the same metric values.
    """
    code = snap.advice_code
    cfg = thresholds.get(code, {}) if thresholds else {}
    if code == "REFLAG_HIGH":
        pct_min = float(
            cfg.get(
                "re_flag_rate_pct_min",
                DEFAULT_THRESHOLDS["REFLAG_HIGH"]["re_flag_rate_pct_min"],
            )
        )
        confirmed_min = int(
            float(
                cfg.get(
                    "confirmed_count_min",
                    DEFAULT_THRESHOLDS["REFLAG_HIGH"]["confirmed_count_min"],
                )
            )
        )
        return (
            snap.re_flag_rate_pct > pct_min
            and snap.confirmed_count >= confirmed_min
        )
    if code == "MANUAL_REFLAG":
        manual_min = float(
            cfg.get(
                "manual_share_pct_min",
                DEFAULT_THRESHOLDS["MANUAL_REFLAG"]["manual_share_pct_min"],
            )
        )
        re_pct_min = float(
            cfg.get(
                "re_flag_rate_pct_min",
                DEFAULT_THRESHOLDS["MANUAL_REFLAG"]["re_flag_rate_pct_min"],
            )
        )
        return (
            snap.manual_rotation_share_pct >= manual_min
            and snap.re_flag_rate_pct > re_pct_min
        )
    if code == "AUTH_DOMINANT":
        auth_min = float(
            cfg.get(
                "auth_share_pct_min",
                DEFAULT_THRESHOLDS["AUTH_DOMINANT"]["auth_share_pct_min"],
            )
        )
        total_min = int(
            float(
                cfg.get(
                    "total_drifts_min",
                    DEFAULT_THRESHOLDS["AUTH_DOMINANT"]["total_drifts_min"],
                )
            )
        )
        return (
            snap.auth_error_class_share_pct >= auth_min
            and snap.total_drifts >= total_min
        )
    # Unknown advice code — never fires under replay (defensive).
    return False


def replay_thresholds_against_snapshots(
    db: Session,
    clinic_id: str | int,
    override_thresholds: dict[str, dict[str, float]],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    pair_lookahead_days: int = DEFAULT_PAIR_LOOKAHEAD_DAYS,
) -> ThresholdReplayResult:
    """Replay ``override_thresholds`` against the last ``window_days``
    of frozen ``advice_snapshot`` rows and return a
    :class:`ThresholdReplayResult` comparing the what-if accuracy
    against the current baseline.

    Algorithm
    ---------
    1. Pull every ``advice_snapshot`` row for the clinic in the window.
       Reconstruct ``(channel, advice_code, severity)`` plus the six
       supporting metrics from the row's note (the worker freezes them
       as ``key=value`` tokens at snapshot time).
    2. Pair every snapshot with its T+14d outcome via
       :func:`pair_advice_with_outcomes` — this is the SAME pairing
       the live CSAHP5 outcome tracker uses, so the baseline accuracy
       lines up 1:1 with the live summary.
    3. For each paired snapshot, evaluate whether the card would have
       fired under ``override_thresholds`` (via :func:`_card_would_fire`).
       When it would have fired, count it in the what-if denominator;
       when its outcome is ``paired_disappeared``, also count it in the
       what-if numerator.
    4. Compute current accuracy from the same paired list under the
       current (DB + defaults) thresholds — this is the baseline.
    5. Return both maps + delta + cards-fired change.

    Reconstruction note (CSAHP6 contract): metrics come from the
    snapshot rows themselves, NOT from a re-call to
    :func:`compute_rotation_advice` against current data. This is
    intentional — replay must answer "what would have happened with
    THIS threshold against THE HISTORICAL metric values", not "what
    happens now".
    """
    cid = str(clinic_id) if clinic_id is not None else ""
    w = _normalize_window(window_days)
    look = _normalize_lookahead(pair_lookahead_days)
    current_thresholds = _load_thresholds(db, cid) if cid else _resolve_thresholds(None)
    resolved_override = _resolve_thresholds(override_thresholds)

    if not cid:
        return ThresholdReplayResult(
            override_thresholds=resolved_override,
            current_thresholds=current_thresholds,
            current_accuracy={code: 0.0 for code in ROTATION_ADVICE_CODES},
            whatif_accuracy={code: 0.0 for code in ROTATION_ADVICE_CODES},
            delta={code: 0.0 for code in ROTATION_ADVICE_CODES},
            cards_fired_change={
                code: {"current": 0, "whatif": 0, "delta": 0}
                for code in ROTATION_ADVICE_CODES
            },
            sample_size={code: 0 for code in ROTATION_ADVICE_CODES},
            window_days=w,
            pair_lookahead_days=look,
            clinic_id=None,
            snapshot_count=0,
        )

    snapshots = _read_snapshot_rows(
        db,
        clinic_id=cid,
        window_days=w,
        pair_lookahead_days=look,
    )

    # Pair each snapshot with its T+14d outcome using the SAME logic
    # the live outcome tracker uses. This gives us the per-snapshot
    # outcome label (paired_present / paired_disappeared / pending /
    # stale) keyed by snapshot_event_id.
    paired_records = pair_advice_with_outcomes(
        db,
        clinic_id=cid,
        window_days=w,
        pair_lookahead_days=look,
    )
    outcome_by_event_id: dict[str, str] = {}
    for rec in paired_records:
        outcome_by_event_id[rec.snapshot_event_id] = rec.outcome

    # Build per-code accumulators.
    codes = tuple(set(ROTATION_ADVICE_CODES) | set(KNOWN_ADVICE_CODES))
    current_total: dict[str, int] = {c: 0 for c in codes}
    current_disappeared: dict[str, int] = {c: 0 for c in codes}
    whatif_total: dict[str, int] = {c: 0 for c in codes}
    whatif_disappeared: dict[str, int] = {c: 0 for c in codes}
    current_fired_count: dict[str, int] = {c: 0 for c in codes}
    whatif_fired_count: dict[str, int] = {c: 0 for c in codes}

    for snap in snapshots:
        code = snap.advice_code
        if code not in current_total:
            current_total[code] = 0
            current_disappeared[code] = 0
            whatif_total[code] = 0
            whatif_disappeared[code] = 0
            current_fired_count[code] = 0
            whatif_fired_count[code] = 0

        # The snapshot row itself records that the card fired under
        # the live thresholds — so it counts as a "fired" card under
        # current thresholds whenever it shows up in the audit log.
        current_fired_count[code] += 1

        # Replay against override thresholds — would the card have
        # fired? If yes, count it in the what-if "fired" denominator.
        whatif_fired = _card_would_fire(snap, resolved_override)
        if whatif_fired:
            whatif_fired_count[code] += 1

        # Use only paired snapshots for the accuracy calculation —
        # pending/stale don't classify yet.
        outcome = outcome_by_event_id.get(snap.snapshot_event_id)
        if outcome not in (
            OUTCOME_PAIRED_PRESENT,
            OUTCOME_PAIRED_DISAPPEARED,
        ):
            continue

        # Current denominator — every paired snapshot is a card the
        # live thresholds emitted, so it counts for the baseline
        # accuracy.
        current_total[code] += 1
        if outcome == OUTCOME_PAIRED_DISAPPEARED:
            current_disappeared[code] += 1

        # What-if denominator — only paired snapshots whose card
        # would ALSO have fired under override_thresholds count toward
        # the what-if accuracy. (Cards the override would NOT have
        # fired are removed from both numerator and denominator —
        # that's the whole point of "what would have happened".)
        if whatif_fired:
            whatif_total[code] += 1
            if outcome == OUTCOME_PAIRED_DISAPPEARED:
                whatif_disappeared[code] += 1

    def _pct(num: int, den: int) -> float:
        if den <= 0:
            return 0.0
        return round((num / float(den)) * 100.0, 2)

    # Build per-code result maps. Iterate over the union of seen
    # codes so we surface unknown codes the worker may have emitted.
    all_codes = sorted(set(current_total.keys()) | set(ROTATION_ADVICE_CODES))
    current_accuracy: dict[str, float] = {}
    whatif_accuracy: dict[str, float] = {}
    delta: dict[str, float] = {}
    cards_fired_change: dict[str, dict[str, int]] = {}
    sample_size: dict[str, int] = {}

    for code in all_codes:
        c_pct = _pct(current_disappeared[code], current_total[code])
        w_pct = _pct(whatif_disappeared[code], whatif_total[code])
        current_accuracy[code] = c_pct
        whatif_accuracy[code] = w_pct
        delta[code] = round(w_pct - c_pct, 2)
        c_fired = current_fired_count[code]
        w_fired = whatif_fired_count[code]
        cards_fired_change[code] = {
            "current": c_fired,
            "whatif": w_fired,
            "delta": w_fired - c_fired,
        }
        sample_size[code] = current_total[code]

    return ThresholdReplayResult(
        override_thresholds=resolved_override,
        current_thresholds=current_thresholds,
        current_accuracy=current_accuracy,
        whatif_accuracy=whatif_accuracy,
        delta=delta,
        cards_fired_change=cards_fired_change,
        sample_size=sample_size,
        window_days=w,
        pair_lookahead_days=look,
        clinic_id=cid,
        snapshot_count=len(snapshots),
    )


__all__ = [
    "ThresholdReplayResult",
    "replay_thresholds_against_snapshots",
]
